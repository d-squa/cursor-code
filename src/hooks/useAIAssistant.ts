import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useWorkspace } from "./useWorkspace";
import { toast } from "@/hooks/use-toast";

export interface AIMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

export interface AIConversation {
  id: string;
  title: string;
  context_type: string;
  context_campaign_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CampaignContext {
  campaignId?: string;
  industry?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant-chat`;

export function useAIAssistant() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [campaignContext, setCampaignContext] = useState<CampaignContext>({});
  const abortRef = useRef<AbortController | null>(null);

  // Fetch conversations list
  const { data: conversations = [], isLoading: loadingConversations } = useQuery({
    queryKey: ["ai-conversations", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as AIConversation[];
    },
  });

  // Load messages for a conversation
  const loadConversation = useCallback(async (conversationId: string) => {
    setActiveConversationId(conversationId);
    const { data, error } = await supabase
      .from("ai_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) {
      toast({ title: "Error loading conversation", variant: "destructive" });
      return;
    }
    setMessages((data || []).map((m: any) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      created_at: m.created_at,
    })));

    // Load context
    const conv = conversations.find(c => c.id === conversationId);
    if (conv?.context_campaign_id) {
      setCampaignContext(prev => ({ ...prev, campaignId: conv.context_campaign_id! }));
    }
  }, [conversations]);

  // Create new conversation
  const createConversation = useCallback(async (contextType = "general", campaignId?: string) => {
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({
        user_id: user.id,
        team_id: activeWorkspace?.id || null,
        context_type: contextType,
        context_campaign_id: campaignId || null,
        title: "New Conversation",
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Error creating conversation", variant: "destructive" });
      return null;
    }
    setActiveConversationId(data.id);
    setMessages([]);
    queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    return data.id;
  }, [user?.id, activeWorkspace?.id, queryClient]);

  // Send message with streaming
  const sendMessage = useCallback(async (content: string) => {
    if (!user?.id || isStreaming) return;

    let convId = activeConversationId;
    if (!convId) {
      convId = await createConversation(campaignContext.campaignId ? "campaign" : "general", campaignContext.campaignId);
      if (!convId) return;
    }

    const userMsg: AIMessage = { role: "user", content };
    setMessages(prev => [...prev, userMsg]);

    // Save user message to DB
    await supabase.from("ai_messages").insert({
      conversation_id: convId,
      role: "user",
      content,
    });

    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    let assistantContent = "";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          conversationId: convId,
          campaignContext,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && !last.id) {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: assistantContent } : m
                  );
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Save assistant message to DB
      if (assistantContent) {
        await supabase.from("ai_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: assistantContent,
        });

        // Auto-title on first exchange
        if (messages.length === 0) {
          const title = content.slice(0, 80) + (content.length > 80 ? "..." : "");
          await supabase
            .from("ai_conversations")
            .update({ title, updated_at: new Date().toISOString() })
            .eq("id", convId);
          queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
        } else {
          await supabase
            .from("ai_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", convId);
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        toast({ title: "AI Error", description: e.message, variant: "destructive" });
        // Remove streaming message on error
        setMessages(prev => prev.filter(m => m.role !== "assistant" || m.id));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [user?.id, activeConversationId, messages, isStreaming, campaignContext, createConversation, queryClient]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await supabase.from("ai_conversations").delete().eq("id", id);
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
    }
    queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
  }, [activeConversationId, queryClient]);

  const newConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setCampaignContext({});
  }, []);

  // Share conversation
  const shareConversation = useCallback(async (conversationId: string, sharedWithUserId: string) => {
    if (!user?.id) return;
    const { error } = await supabase.from("ai_conversation_shares").insert({
      conversation_id: conversationId,
      shared_by: user.id,
      shared_with: sharedWithUserId,
    });
    if (error) {
      toast({ title: "Error sharing conversation", variant: "destructive" });
    } else {
      toast({ title: "Conversation shared successfully" });
    }
  }, [user?.id]);

  return {
    conversations,
    loadingConversations,
    activeConversationId,
    messages,
    isStreaming,
    campaignContext,
    setCampaignContext,
    loadConversation,
    createConversation,
    sendMessage,
    stopStreaming,
    deleteConversation,
    newConversation,
    shareConversation,
  };
}
