import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DspConfigChange {
  id: string;
  campaign_id: string;
  platform: string;
  entity_type: string;
  entity_name: string | null;
  dsp_entity_id: string;
  market: string | null;
  phase_name: string | null;
  change_category: string;
  field_name: string;
  field_label: string | null;
  actiplan_value: string | null;
  dsp_value: string | null;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  detected_at: string;
  synced_at: string;
}

interface UseDspConfigSyncOptions {
  campaignId: string | undefined;
  enabled?: boolean;
  autoSyncOnMount?: boolean;
}

export function useDspConfigSync({ campaignId, enabled = true, autoSyncOnMount = true }: UseDspConfigSyncOptions) {
  const { user, getAccessToken } = useAuth();
  const [changes, setChanges] = useState<DspConfigChange[]>([]);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Fetch existing changes from DB
  const fetchChanges = useCallback(async () => {
    if (!campaignId || !user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("dsp_config_changes")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("detected_at", { ascending: false });

      if (error) {
        console.error("Error fetching DSP config changes:", error);
        return;
      }

      const typedData = (data || []) as unknown as DspConfigChange[];
      setChanges(typedData);
      setUnacknowledgedCount(typedData.filter((c) => !c.is_acknowledged).length);

      if (typedData.length > 0) {
        setLastSyncedAt(typedData[0].synced_at);
      }
    } finally {
      setLoading(false);
    }
  }, [campaignId, user]);

  // Trigger DSP config sync via edge function
  const syncFromDsp = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!campaignId || !accessToken || syncing) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-dsp-config", {
        body: { campaignId },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) {
        console.error("DSP config sync error:", error);
        return;
      }

      console.log("DSP config sync result:", data);
      // Refresh changes from DB
      await fetchChanges();
      setLastSyncedAt(new Date().toISOString());

      // Also trigger QC sync alongside DSP sync
      try {
        await supabase.functions.invoke("qc-sync", {
          body: { campaignId, mode: "sync" },
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        console.log("QC sync completed alongside DSP sync");
      } catch (qcError) {
        console.warn("QC sync warning:", qcError);
      }
    } finally {
      setSyncing(false);
    }
  }, [campaignId, syncing, fetchChanges, getAccessToken]);

  // Acknowledge a single change
  const acknowledgeChange = useCallback(
    async (changeId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("dsp_config_changes")
        .update({
          is_acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
        } as any)
        .eq("id", changeId);

      if (error) {
        console.error("Error acknowledging change:", error);
        return;
      }

      // Log to campaign history
      const change = changes.find((c) => c.id === changeId);
      if (change && campaignId) {
        await supabase.from("campaign_change_history").insert({
          campaign_id: campaignId,
          user_id: user.id,
          action: `Acknowledged DSP change: ${change.field_label || change.field_name} updated to "${change.dsp_value}" on ${change.platform} ${change.entity_type}`,
          change_type: "dsp_sync",
          description: `${change.platform} ${change.entity_type} "${change.entity_name}" - ${change.field_label || change.field_name} changed from "${change.actiplan_value || "N/A"}" to "${change.dsp_value}"`,
        });
      }

      await fetchChanges();
    },
    [user, changes, campaignId, fetchChanges],
  );

  // Acknowledge all changes
  const acknowledgeAll = useCallback(async () => {
    if (!user || !campaignId) return;
    const unacked = changes.filter((c) => !c.is_acknowledged);
    if (unacked.length === 0) return;

    const { error } = await supabase
      .from("dsp_config_changes")
      .update({
        is_acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: user.id,
      } as any)
      .eq("campaign_id", campaignId)
      .eq("is_acknowledged", false);

    if (error) {
      console.error("Error acknowledging all changes:", error);
      return;
    }

    // Log bulk acknowledgment to history
    await supabase.from("campaign_change_history").insert({
      campaign_id: campaignId,
      user_id: user.id,
      action: `Acknowledged ${unacked.length} DSP config change(s)`,
      change_type: "dsp_sync_bulk",
      description: `Bulk acknowledged ${unacked.length} changes detected from DSP platforms`,
    });

    await fetchChanges();
  }, [user, campaignId, changes, fetchChanges]);

  // Auto-fetch on mount
  useEffect(() => {
    if (enabled && campaignId && user) {
      fetchChanges();
    }
  }, [enabled, campaignId, user, fetchChanges]);

  // Auto-sync on mount (if campaign has DSP entities)
  useEffect(() => {
    if (enabled && autoSyncOnMount && campaignId && user && getAccessToken()) {
      // Small delay to not block initial page load
      const timer = setTimeout(() => {
        syncFromDsp();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [enabled, autoSyncOnMount, campaignId, user, syncFromDsp, getAccessToken]);

  return {
    changes,
    unacknowledgedCount,
    syncing,
    loading,
    lastSyncedAt,
    syncFromDsp,
    acknowledgeChange,
    acknowledgeAll,
    fetchChanges,
  };
}
