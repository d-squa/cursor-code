import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  CreativeAssignmentItem,
  CreativeAssignmentStatus,
  AdSetStatus,
} from "@/components/launch/LaunchProgressTracker";

interface UseLaunchProgressOptions {
  campaignId: string | undefined;
  enabled?: boolean;
}

export function useLaunchProgress({ campaignId, enabled = true }: UseLaunchProgressOptions) {
  const [adSetStatuses, setAdSetStatuses] = useState<AdSetStatus[]>([]);
  const [creativeAssignments, setCreativeAssignments] = useState<CreativeAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load initial data
  const loadData = useCallback(async () => {
    if (!campaignId || !enabled) return;

    try {
      setLoading(true);

      // Fetch ad set statuses
      const { data: statusData, error: statusError } = await supabase
        .from("campaign_launch_status")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("platform", { ascending: true });

      if (statusError) throw statusError;

      const mappedStatuses: AdSetStatus[] = (statusData || []).map((s) => ({
        id: s.id,
        platform: s.platform,
        market: s.market,
        phaseName: s.phase_name,
        entityType: s.entity_type,
        entityName: s.entity_name || undefined,
        status: s.status,
        dspEntityId: s.dsp_entity_id,
        errorMessage: s.error_message || undefined,
      }));
      setAdSetStatuses(mappedStatuses);

      // Fetch creative assignments with creative details
      const { data: assignmentData, error: assignmentError } = await supabase
        .from("creative_assignments")
        .select(
          `
          id,
          creative_id,
          platform,
          market,
          phase_name,
          ad_set_name,
          display_name,
          status,
          error_message,
          url_parameters,
          creative:creatives(name, media_type)
        `
        )
        .eq("campaign_id", campaignId)
        .order("platform", { ascending: true });

      if (assignmentError) throw assignmentError;

      const mappedAssignments: CreativeAssignmentItem[] = (assignmentData || []).map((a: any) => ({
        id: a.id,
        creative_id: a.creative_id,
        // Use display_name (DSP ad name) first, fallback to creative name
        creativeName: a.display_name || a.creative?.name || "Unknown Creative",
        mediaType: a.creative?.media_type || "image",
        platform: a.platform,
        market: a.market,
        phaseName: a.phase_name,
        adSetName: a.ad_set_name || undefined,
        status: (a.status || "pending") as CreativeAssignmentStatus,
        errorMessage: a.error_message || undefined,
        urlParameters: a.url_parameters || undefined,
      }));
      setCreativeAssignments(mappedAssignments);
    } catch (error) {
      console.error("Error loading launch progress:", error);
    } finally {
      setLoading(false);
    }
  }, [campaignId, enabled]);

  // Set up realtime subscription for creative_assignments changes
  useEffect(() => {
    if (!campaignId || !enabled) return;

    // Load initial data
    loadData();

    // Subscribe to realtime changes on creative_assignments
    const channel = supabase
      .channel(`launch-progress-${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "creative_assignments",
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setCreativeAssignments((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    status: (updated.status || "pending") as CreativeAssignmentStatus,
                    errorMessage: updated.error_message || undefined,
                  }
                : item
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "campaign_launch_status",
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setAdSetStatuses((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    status: updated.status,
                    dspEntityId: updated.dsp_entity_id,
                    errorMessage: updated.error_message || undefined,
                  }
                : item
            )
          );
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
  }, [campaignId, enabled, loadData]);

  // Refresh function
  const refresh = useCallback(() => {
    loadData();
  }, [loadData]);

  return {
    adSetStatuses,
    creativeAssignments,
    loading,
    refresh,
  };
}
