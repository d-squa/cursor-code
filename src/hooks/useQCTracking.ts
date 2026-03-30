import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { QCState } from "@/utils/qcUtils";

export interface QCTrackingItem {
  id: string;
  campaign_id: string;
  platform: string;
  market: string | null;
  phase_name: string | null;
  entity_type: string;
  entity_name: string | null;
  dsp_entity_id: string | null;
  current_state: QCState;
  previous_state: QCState | null;
  qc_parameter_raw: string | null;
  impressions_count: number;
  auto_completed: boolean;
  auto_completed_at: string | null;
  qc_removed_from_dsp: boolean;
  qc_removed_at: string | null;
  validation_error: string | null;
  is_valid: boolean;
  state_history: any[];
  created_at: string;
  updated_at: string;
}

export interface QCTransition {
  id: string;
  qc_tracking_id: string;
  campaign_id: string;
  from_state: QCState | null;
  to_state: QCState;
  transitioned_at: string;
  detected_via: string;
  impressions_at_transition: number;
  metadata: any;
}

interface UseQCTrackingOptions {
  campaignId: string | undefined;
  enabled?: boolean;
}

export function useQCTracking({ campaignId, enabled = true }: UseQCTrackingOptions) {
  const { user } = useAuth();
  const [items, setItems] = useState<QCTrackingItem[]>([]);
  const [transitions, setTransitions] = useState<QCTransition[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    if (!campaignId || !enabled || !user) return;

    try {
      setLoading(true);

      const [trackingRes, transitionsRes] = await Promise.all([
        supabase
          .from("qc_tracking")
          .select("*")
          .eq("campaign_id", campaignId)
          .order("platform")
          .order("entity_type"),
        supabase
          .from("qc_state_transitions")
          .select("*")
          .eq("campaign_id", campaignId)
          .order("transitioned_at", { ascending: true }),
      ]);

      if (trackingRes.error) throw trackingRes.error;
      if (transitionsRes.error) throw transitionsRes.error;

      setItems((trackingRes.data || []) as unknown as QCTrackingItem[]);
      setTransitions((transitionsRes.data || []) as unknown as QCTransition[]);
    } catch (error) {
      console.error("Error loading QC tracking:", error);
    } finally {
      setLoading(false);
    }
  }, [campaignId, enabled, user]);

  // Set up realtime subscription
  useEffect(() => {
    if (!campaignId || !enabled || !user) return;

    fetchData();

    const channel = supabase
      .channel(`qc-tracking-${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qc_tracking",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [campaignId, enabled, user, fetchData]);

  // Summary stats
  const summary = {
    total: items.length,
    waitingForQC: items.filter(i => i.current_state === 'waiting_for_final_qc').length,
    inQC: items.filter(i => i.current_state === 'qc').length,
    pushedLive: items.filter(i => i.current_state === 'pushed_live').length,
    delivering: items.filter(i => i.current_state === 'delivering').length,
    errors: items.filter(i => !i.is_valid).length,
    autoCompleted: items.filter(i => i.auto_completed).length,
  };

  return {
    items,
    transitions,
    loading,
    summary,
    refresh: fetchData,
  };
}
