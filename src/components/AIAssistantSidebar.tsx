import React, { useState, useRef, useEffect } from "react";
import { useAIAssistant, AIMessage, AIConversation } from "@/hooks/useAIAssistant";
import { useFeatureGate } from "@/components/FeatureGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Bot, Send, Plus, Trash2, MessageSquare, Square, ChevronLeft, Sparkles, Share2, Lock, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { TIER_DISPLAY_NAMES } from "@/config/subscriptionTiers";

function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNew,
}: {
  conversations: AIConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <Button onClick={onNew} className="w-full gap-2" size="sm" variant="outline">
          <Plus className="h-4 w-4" /> New Conversation
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors",
                activeId === conv.id ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground",
              )}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No conversations yet. Start a new one!</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ChatMessage({ message }: { message: AIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3 py-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-4 py-2.5 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatView({
  messages,
  isStreaming,
  onSend,
  onStop,
  onBack,
  showBack,
}: {
  messages: AIMessage[];
  isStreaming: boolean;
  onSend: (msg: string) => void;
  onStop: () => void;
  onBack: () => void;
  showBack: boolean;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {showBack && (
        <div className="p-2 border-b border-border">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-xs">
            <ChevronLeft className="h-3.5 w-3.5" /> Conversations
          </Button>
        </div>
      )}
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">ActiPlan AI Assistant</h3>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Ask me about benchmarks, campaign optimization, digital marketing strategies, or anything about your
              ActiPlans.
            </p>
            <div className="mt-4 space-y-2 w-full max-w-[280px]">
              {[
                "How do I optimize my campaign CPM?",
                "Analyze my campaign performance",
                "What's a good CTR for video ads?",
                "Help me set up audience targeting",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => onSend(suggestion)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3 py-3">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary animate-pulse" />
            </div>
            <div className="bg-muted rounded-xl px-4 py-2.5">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </ScrollArea>
      <form onSubmit={handleSubmit} className="p-3 border-t border-border flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your campaigns..."
          className="text-sm"
          disabled={isStreaming}
        />
        {isStreaming ? (
          <Button type="button" size="icon" variant="outline" onClick={onStop}>
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
    </div>
  );
}

export function AIAssistantSidebar() {
  const { hasAccess, requiredTier, loading } = useFeatureGate("ai_assistant");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(true);
  const {
    conversations,
    activeConversationId,
    messages,
    isStreaming,
    loadConversation,
    sendMessage,
    stopStreaming,
    deleteConversation,
    newConversation,
  } = useAIAssistant();

  const handleSelectConversation = (id: string) => {
    loadConversation(id);
    setShowList(false);
  };

  const handleNew = () => {
    newConversation();
    setShowList(false);
  };

  const handleSend = (msg: string) => {
    sendMessage(msg);
    setShowList(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
          title="AI Assistant"
        >
          <Bot className="h-5 w-5 text-primary-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5 text-primary" />
              AI Assistant
            </SheetTitle>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !hasAccess ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <Lock className="h-10 w-10 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold mb-1">Feature Locked</h3>
            <p className="text-sm text-muted-foreground mb-4">
              AI Assistant requires the <strong>{TIER_DISPLAY_NAMES[requiredTier]}</strong> plan or higher.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setOpen(false);
                navigate("/settings/plans");
              }}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" /> Upgrade Plan
            </Button>
          </div>
        ) : showList && !activeConversationId ? (
          <ConversationList
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={handleSelectConversation}
            onDelete={deleteConversation}
            onNew={handleNew}
          />
        ) : (
          <ChatView
            messages={messages}
            isStreaming={isStreaming}
            onSend={handleSend}
            onStop={stopStreaming}
            onBack={() => {
              setShowList(true);
              newConversation();
            }}
            showBack={true}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
