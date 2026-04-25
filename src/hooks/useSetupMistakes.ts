import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SetupMistake {
  id: string;
  campaign_id: string;
  qc_tracking_id: string | null;
  team_id: string | null;
  platform: string | null;
  market: string | null;
  phase_name: string | null;
  ad_set_name: string | null;
  ad_name: string | null;
  entity_type: string | null;
  title: string;
  description: string | null;
  status: "open" | "resolved";
  created_by: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface UseSetupMistakesOptions {
  campaignId?: string;
  enabled?: boolean;
}

export function useSetupMistakes({ campaignId, enabled = true }: UseSetupMistakesOptions) {
  const { user } = useAuth();
  const [mistakes, setMistakes] = useState<SetupMistake[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMistakes = useCallback(async () => {
    if (!user || !enabled) return;
    try {
      setLoading(true);
      let query = (supabase.from("setup_mistakes" as any) as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (campaignId) query = query.eq("campaign_id", campaignId);

      const { data, error } = await query;
      if (error) throw error;
      setMistakes((data || []) as SetupMistake[]);
    } catch (err) {
      console.error("Error loading setup mistakes:", err);
    } finally {
      setLoading(false);
    }
  }, [user, campaignId, enabled]);

  useEffect(() => {
    fetchMistakes();
  }, [fetchMistakes]);

  const resolveMistake = useCallback(
    async (id: string, notes?: string) => {
      if (!user) return;
      const { error } = await (supabase.from("setup_mistakes" as any) as any)
        .update({
          status: "resolved",
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          resolution_notes: notes ?? null,
        })
        .eq("id", id);
      if (error) throw error;
      await fetchMistakes();
    },
    [user, fetchMistakes]
  );

  const reopenMistake = useCallback(
    async (id: string) => {
      const { error } = await (supabase.from("setup_mistakes" as any) as any)
        .update({
          status: "open",
          resolved_by: null,
          resolved_at: null,
          resolution_notes: null,
        })
        .eq("id", id);
      if (error) throw error;
      await fetchMistakes();
    },
    [fetchMistakes]
  );

  const hasOpenMistakeForTracking = useCallback(
    (trackingId: string) => mistakes.some((m) => m.qc_tracking_id === trackingId && m.status === "open"),
    [mistakes]
  );

  const openMistakesForTracking = useCallback(
    (trackingId: string) => mistakes.filter((m) => m.qc_tracking_id === trackingId && m.status === "open"),
    [mistakes]
  );

  return {
    mistakes,
    loading,
    refresh: fetchMistakes,
    resolveMistake,
    reopenMistake,
    hasOpenMistakeForTracking,
    openMistakesForTracking,
  };
}
