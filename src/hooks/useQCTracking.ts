import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { QCState } from "@/utils/qcUtils";
import type { Database } from "@/integrations/supabase/types";
import { QC_STATE_LABELS } from "@/utils/qcUtils";
import { logCampaignActivity, logCampaignHistoryEntry } from "@/utils/campaignHistory";

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

const normalizeKeyPart = (value: string | null | undefined) =>
  String(value || "").trim().toLowerCase();

const normalizeTrackingPlatform = (platform: string | null | undefined) => {
  const normalized = normalizeKeyPart(platform);

  if (normalized.includes("meta") || normalized.includes("facebook") || normalized.includes("instagram")) {
    return "meta";
  }

  if (normalized.includes("tiktok")) return "tiktok";
  if (normalized.includes("linkedin")) return "linkedin";
  if (normalized.includes("google")) return "google";
  if (normalized.includes("snap")) return "snapchat";
  if (normalized === "x" || normalized.includes("twitter")) return "x";

  return normalized;
};

const normalizeTrackingEntityType = (entityType: string | null | undefined) => {
  const normalized = normalizeKeyPart(entityType);

  if (normalized.includes("campaign")) return "campaign";
  if (normalized.includes("ad_set") || normalized.includes("adset") || normalized.includes("ad_group") || normalized.includes("adgroup")) {
    return "adset";
  }
  if (normalized === "ad" || normalized === "ads" || normalized.includes("creative")) return "ad";

  return normalized;
};

/** Matches qc_tracking_entity_scope_unique (campaign + platform + type + dsp id + market + phase). */
const buildDbUniqueKey = (
  seed: Pick<TrackingSeed, "platform" | "entity_type" | "dsp_entity_id" | "market" | "phase_name">,
) =>
  [
    normalizeTrackingPlatform(seed.platform),
    normalizeTrackingEntityType(seed.entity_type),
    seed.dsp_entity_id ?? "",
    normalizeKeyPart(seed.market),
    normalizeKeyPart(seed.phase_name),
  ].join("::");

const buildTrackingKey = (seed: TrackingSeed) => {
  const normalizedEntityType = normalizeTrackingEntityType(seed.entity_type);

  return [
    normalizeTrackingPlatform(seed.platform),
    normalizedEntityType,
    normalizeKeyPart(seed.market),
    normalizeKeyPart(seed.phase_name),
    normalizeKeyPart(
      normalizedEntityType === "ad"
        ? seed.dsp_entity_id || seed.ad_set_name || seed.entity_name
        : seed.entity_name || seed.ad_set_name
    ),
  ].join("::");
};

const ENTITY_SORT_ORDER: Record<string, number> = {
  campaign: 0,
  adset: 1,
  ad: 2,
};

const normalizeTrackingItem = (item: QCTrackingItem): QCTrackingItem => ({
  ...item,
  platform: normalizeTrackingPlatform(item.platform),
  entity_type: normalizeTrackingEntityType(item.entity_type),
});

const compareTrackingItems = (a: QCTrackingItem, b: QCTrackingItem) => {
  const sortPairs: Array<[string | number, string | number]> = [
    [normalizeTrackingPlatform(a.platform), normalizeTrackingPlatform(b.platform)],
    [normalizeKeyPart(a.market), normalizeKeyPart(b.market)],
    [normalizeKeyPart(a.phase_name), normalizeKeyPart(b.phase_name)],
    [ENTITY_SORT_ORDER[normalizeTrackingEntityType(a.entity_type)] ?? 99, ENTITY_SORT_ORDER[normalizeTrackingEntityType(b.entity_type)] ?? 99],
    [normalizeKeyPart(a.entity_name), normalizeKeyPart(b.entity_name)],
    [normalizeKeyPart(a.ad_set_name), normalizeKeyPart(b.ad_set_name)],
    [normalizeKeyPart(a.dsp_entity_id), normalizeKeyPart(b.dsp_entity_id)],
  ];

  for (const [left, right] of sortPairs) {
    if (left < right) return -1;
    if (left > right) return 1;
  }

  return 0;
};

const dedupeTrackingItems = (rows: QCTrackingItem[]) => {
  const deduped = new Map<string, QCTrackingItem>();

  for (const row of rows) {
    const normalizedRow = normalizeTrackingItem(row);
    const key = buildTrackingKey(normalizedRow);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, normalizedRow);
      continue;
    }

    const existingUpdatedAt = new Date(existing.updated_at).getTime();
    const rowUpdatedAt = new Date(normalizedRow.updated_at).getTime();

    if (rowUpdatedAt >= existingUpdatedAt) {
      deduped.set(key, normalizedRow);
    }
  }

  return Array.from(deduped.values()).sort(compareTrackingItems);
};

export function useQCTracking({ campaignId, enabled = true }: UseQCTrackingOptions) {
  const { user } = useAuth();
  const [items, setItems] = useState<QCTrackingItem[]>([]);
  const [transitions, setTransitions] = useState<QCTransition[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const initAttemptedForCampaignRef = useRef<string | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (force = false) => {
    if (!campaignId || !user) return;
    if (!force && !enabled) return;

    try {
      if (!force) setLoading(true);

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

      setItems(dedupeTrackingItems((trackingRes.data || []) as unknown as QCTrackingItem[]));
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
          if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
          refreshTimeoutRef.current = setTimeout(() => void fetchData(true), 250);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
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
          .select("platform, entity_type, market, phase_name, entity_name, ad_set_name, dsp_entity_id")
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
      const existingDbKeys = new Set(
        (existingTrackingRes.data || []).map((item) =>
          buildDbUniqueKey({
            platform: item.platform,
            entity_type: item.entity_type,
            dsp_entity_id: item.dsp_entity_id,
            market: item.market,
            phase_name: item.phase_name,
          }),
        ),
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
        candidateSeeds.set(buildDbUniqueKey(seed), seed);
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
        candidateSeeds.set(buildDbUniqueKey(seed), seed);
      }

      const newEntries: QCTrackingInsert[] = Array.from(candidateSeeds.entries())
        .filter(([dbKey]) => !existingDbKeys.has(dbKey))
        .map(([, seed]) => ({
          campaign_id: campaignId,
          platform: normalizeTrackingPlatform(seed.platform),
          market: seed.market,
          phase_name: seed.phase_name,
          entity_type: normalizeTrackingEntityType(seed.entity_type),
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
        if (insertError && insertError.code !== "23505") throw insertError;
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

    // If no items exist and we haven't tried yet, do initial seed
    if (items.length === 0 && initAttemptedForCampaignRef.current !== campaignId) {
      initAttemptedForCampaignRef.current = campaignId;
      void initializeTracking();
      return;
    }

    // Always mark as attempted once items exist
    if (items.length > 0) {
      initAttemptedForCampaignRef.current = campaignId;
    }
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

      const entityLabel = item.entity_name || item.ad_set_name || item.dsp_entity_id || item.entity_type;
      const description = `${entityLabel} moved from ${item.current_state ? QC_STATE_LABELS[item.current_state] : "Unknown"} to ${QC_STATE_LABELS[newState]}`;

      await Promise.all([
        logCampaignHistoryEntry({
          campaignId,
          userId: user.id,
          action: "qc_transition",
          changeType: "quality_check",
          description,
        }),
        logCampaignActivity({
          campaignId,
          userId: user.id,
          actionType: "qc_transition",
          title: `QC moved to ${QC_STATE_LABELS[newState]}`,
          description,
          affectedPlatforms: item.platform ? [item.platform] : undefined,
          affectedMarkets: item.market ? [item.market] : undefined,
          affectedPhases: item.phase_name ? [item.phase_name] : undefined,
          metadata: {
            trackingId,
            entityType: item.entity_type,
            entityName: item.entity_name,
            fromState: item.current_state,
            toState: newState,
          },
        }),
      ]);

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
