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

  const fetchData = useCallback(async (force = false) => {
    if (!campaignId || !user) return;
    if (!force && !enabled) return;

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

  // Initialize QC tracking from launch statuses (creates entries for entities that don't have tracking yet)
  // Works at individual entity level - any entity with a launch status gets a QC entry
  const initializeTracking = useCallback(async () => {
    if (!campaignId || !user) return;

    try {
      // Get ALL launch statuses for this campaign (any status, not just fully pushed)
      const { data: launchStatuses } = await supabase
        .from("campaign_launch_status")
        .select("*")
        .eq("campaign_id", campaignId);

      // Get campaign team_id
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("team_id")
        .eq("id", campaignId)
        .single();

      // Get existing tracking entries fresh from DB to avoid stale state
      const { data: existingTracking } = await supabase
        .from("qc_tracking")
        .select("platform, entity_type, market, phase_name, dsp_entity_id")
        .eq("campaign_id", campaignId);

      const existingKeys = new Set(
        (existingTracking || []).map((i: any) => `${i.platform}-${i.entity_type}-${i.market}-${i.phase_name || ''}`)
      );
      const existingAdKeys = new Set(
        (existingTracking || []).filter((i: any) => i.entity_type === 'ad').map((i: any) => `${i.platform}-${i.market}-${i.dsp_entity_id}`)
      );

      const newEntries: any[] = [];

      // Create tracking entries for each launch status entity (campaign, adset levels)
      if (launchStatuses) {
        for (const ls of launchStatuses) {
          const key = `${ls.platform}-${ls.entity_type}-${ls.market}-${ls.phase_name || ''}`;
          if (!existingKeys.has(key)) {
            newEntries.push({
              campaign_id: campaignId,
              platform: ls.platform,
              market: ls.market,
              phase_name: ls.phase_name,
              entity_type: ls.entity_type,
              entity_name: ls.entity_name,
              dsp_entity_id: ls.dsp_entity_id,
              current_state: 'waiting_for_final_qc',
              is_valid: true,
              user_id: user.id,
              team_id: campaign?.team_id,
            });
          }
        }
      }

      // Also create tracking for creative assignments (ads)
      const { data: assignments } = await supabase
        .from("creative_assignments")
        .select("id, platform, market, phase_name, ad_set_name, creative_id, status")
        .eq("campaign_id", campaignId);

      if (assignments) {
        for (const a of assignments) {
          const adKey = `${a.platform}-${a.market}-${a.id}`;
          if (!existingAdKeys.has(adKey)) {
            newEntries.push({
              campaign_id: campaignId,
              platform: a.platform,
              market: a.market,
              phase_name: a.phase_name,
              entity_type: 'ad',
              entity_name: `Ad in ${a.ad_set_name}`,
              dsp_entity_id: a.id,
              current_state: 'waiting_for_final_qc',
              is_valid: true,
              user_id: user.id,
              team_id: campaign?.team_id,
            });
          }
        }
      }

      if (newEntries.length > 0) {
        console.log(`[QC] Inserting ${newEntries.length} new tracking entries`);
        const { error: insertError, data: insertData } = await supabase.from("qc_tracking").insert(newEntries).select();
        if (insertError) {
          console.error("[QC] Insert failed:", insertError);
        } else {
          console.log(`[QC] Successfully inserted ${insertData?.length || 0} entries`);
        }
        await fetchData();
      } else {
        console.log(`[QC] No new entries needed. Existing: ${existingTracking?.length || 0}, Launch statuses: ${launchStatuses?.length || 0}, Assignments: ${assignments?.length || 0}`);
        // Always refresh to show existing entries
        await fetchData();
      }
    } catch (error) {
      console.error("Error initializing QC tracking:", error);
    }
  }, [campaignId, user, fetchData]);

  // Update QC state for a tracking item
  const updateState = useCallback(async (trackingId: string, newState: QCState) => {
    if (!user || !campaignId) return;

    const item = items.find(i => i.id === trackingId);
    if (!item) return;

    try {
      // Update tracking
      await supabase
        .from("qc_tracking")
        .update({
          current_state: newState,
          previous_state: item.current_state,
          is_valid: true,
        })
        .eq("id", trackingId);

      // Log transition
      await supabase.from("qc_state_transitions").insert({
        qc_tracking_id: trackingId,
        campaign_id: campaignId,
        from_state: item.current_state,
        to_state: newState,
        detected_via: "manual",
        impressions_at_transition: item.impressions_count,
        metadata: { set_by: user.id },
      });

      // Update local state immediately
      setItems(prev => prev.map(i => 
        i.id === trackingId 
          ? { ...i, current_state: newState, previous_state: i.current_state }
          : i
      ));
    } catch (error) {
      console.error("Error updating QC state:", error);
    }
  }, [user, campaignId, items]);

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
    initializeTracking,
    updateState,
  };
}
