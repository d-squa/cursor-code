import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { QCState } from "@/utils/qcUtils";
import type { Database } from "@/integrations/supabase/types";

export interface QCTrackingItem {
  id: string;
  campaign_id: string;
  platform: string;
  market: string | null;
  phase_name: string | null;
  entity_type: string;
  entity_name: string | null;
  ad_set_name: string | null;
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

type QCTrackingInsert = Database["public"]["Tables"]["qc_tracking"]["Insert"];

type TrackingSeed = {
  platform: string;
  market: string | null;
  phase_name: string | null;
  entity_type: string;
  entity_name: string | null;
  ad_set_name: string | null;
  dsp_entity_id: string | null;
};

const buildTrackingKey = (seed: TrackingSeed) =>
  [
    seed.platform,
    seed.entity_type,
    seed.market || "",
    seed.phase_name || "",
    seed.dsp_entity_id || "",
  ].join("::");

export function useQCTracking({ campaignId, enabled = true }: UseQCTrackingOptions) {
  const { user } = useAuth();
  const [items, setItems] = useState<QCTrackingItem[]>([]);
  const [transitions, setTransitions] = useState<QCTransition[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const initAttemptedForCampaignRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!campaignId || !enabled || !user) return;

    void fetchData();

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
          void fetchData(true);
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

  const initializeTracking = useCallback(async () => {
    if (!campaignId || !user) return;

    try {
      const [launchStatusesRes, campaignRes, existingTrackingRes, assignmentsRes] = await Promise.all([
        supabase
          .from("campaign_launch_status")
          .select("platform, market, phase_name, entity_type, entity_name, dsp_entity_id, status")
          .eq("campaign_id", campaignId)
          .in("status", ["pushed_to_dsp", "live", "partially_pushed"]),
        supabase
          .from("campaigns")
          .select("team_id")
          .eq("id", campaignId)
          .single(),
        supabase
          .from("qc_tracking")
          .select("platform, entity_type, market, phase_name, dsp_entity_id")
          .eq("campaign_id", campaignId),
        supabase
          .from("creative_assignments")
          .select("id, platform, market, phase_name, ad_set_name, display_name, status")
          .eq("campaign_id", campaignId)
          .eq("status", "pushed"),
      ]);

      if (launchStatusesRes.error) throw launchStatusesRes.error;
      if (campaignRes.error) throw campaignRes.error;
      if (existingTrackingRes.error) throw existingTrackingRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      const campaign = campaignRes.data;
      const existingKeys = new Set(
        (existingTrackingRes.data || []).map((item) =>
          buildTrackingKey({
            platform: item.platform,
            market: item.market,
            phase_name: item.phase_name,
            entity_type: item.entity_type,
            entity_name: null,
            ad_set_name: null,
            dsp_entity_id: item.dsp_entity_id,
          })
        )
      );
      const candidateSeeds = new Map<string, TrackingSeed>();

      for (const launchStatus of launchStatusesRes.data || []) {
        const seed: TrackingSeed = {
          platform: launchStatus.platform,
          market: launchStatus.market,
          phase_name: launchStatus.phase_name,
          entity_type: launchStatus.entity_type,
          entity_name: launchStatus.entity_name,
          ad_set_name: null,
          dsp_entity_id: launchStatus.dsp_entity_id,
        };
        candidateSeeds.set(buildTrackingKey(seed), seed);
      }

      for (const assignment of assignmentsRes.data || []) {
        const seed: TrackingSeed = {
          platform: assignment.platform,
          market: assignment.market,
          phase_name: assignment.phase_name,
          entity_type: "ad",
          entity_name: assignment.display_name || `Ad in ${assignment.ad_set_name}`,
          ad_set_name: assignment.ad_set_name,
          dsp_entity_id: assignment.id,
        };
        candidateSeeds.set(buildTrackingKey(seed), seed);
      }

      const newEntries: QCTrackingInsert[] = Array.from(candidateSeeds.entries())
        .filter(([key]) => !existingKeys.has(key))
        .map(([, seed]) => ({
          campaign_id: campaignId,
          platform: seed.platform,
          market: seed.market,
          phase_name: seed.phase_name,
          entity_type: seed.entity_type,
          entity_name: seed.entity_name,
          ad_set_name: seed.ad_set_name,
          dsp_entity_id: seed.dsp_entity_id,
          current_state: "waiting_for_final_qc",
          is_valid: true,
          user_id: user.id,
          team_id: campaign.team_id,
        }));

      if (newEntries.length > 0) {
        const { error: insertError } = await supabase.from("qc_tracking").insert(newEntries);
        if (insertError) throw insertError;
      }

      await fetchData(true);
    } catch (error) {
      console.error("Error initializing QC tracking:", error);
    }
  }, [campaignId, user, fetchData]);

  useEffect(() => {
    initAttemptedForCampaignRef.current = null;
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId || !enabled || !user || loading) return;

    if (items.length > 0) {
      initAttemptedForCampaignRef.current = campaignId;
      return;
    }

    if (initAttemptedForCampaignRef.current === campaignId) return;

    initAttemptedForCampaignRef.current = campaignId;
    void initializeTracking();
  }, [campaignId, enabled, user, loading, items.length, initializeTracking]);

  const updateState = useCallback(async (trackingId: string, newState: QCState) => {
    if (!user || !campaignId) return;

    const item = items.find((entry) => entry.id === trackingId);
    if (!item) return;

    try {
      await supabase
        .from("qc_tracking")
        .update({
          current_state: newState,
          previous_state: item.current_state,
          is_valid: true,
        })
        .eq("id", trackingId);

      await supabase.from("qc_state_transitions").insert({
        qc_tracking_id: trackingId,
        campaign_id: campaignId,
        from_state: item.current_state,
        to_state: newState,
        detected_via: "manual",
        impressions_at_transition: item.impressions_count,
        metadata: { set_by: user.id },
      });

      setItems((prev) =>
        prev.map((entry) =>
          entry.id === trackingId
            ? { ...entry, current_state: newState, previous_state: entry.current_state }
            : entry
        )
      );
    } catch (error) {
      console.error("Error updating QC state:", error);
    }
  }, [user, campaignId, items]);

  const summary = {
    total: items.length,
    waitingForQC: items.filter((item) => item.current_state === "waiting_for_final_qc").length,
    inQC: items.filter((item) => item.current_state === "qc").length,
    pushedLive: items.filter((item) => item.current_state === "pushed_live").length,
    delivering: items.filter((item) => item.current_state === "delivering").length,
    errors: items.filter((item) => !item.is_valid).length,
    autoCompleted: items.filter((item) => item.auto_completed).length,
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
