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
  const reloadTimeoutRef = useRef<number | null>(null);

  const scheduleReload = useCallback((delayMs = 150) => {
    if (reloadTimeoutRef.current !== null) {
      globalThis.clearTimeout(reloadTimeoutRef.current);
    }

    reloadTimeoutRef.current = globalThis.setTimeout(() => {
      reloadTimeoutRef.current = null;
      loadData();
    }, delayMs);
  }, []);

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
          creative:creatives(name, media_type, original_filename, creative_type)
        `
        )
        .eq("campaign_id", campaignId)
        .order("platform", { ascending: true });

      if (assignmentError) throw assignmentError;

      const { data: groupData, error: groupError } = await supabase
        .from("asset_customization_groups")
        .select(
          `
          id,
          group_name,
          status,
          market,
          phase_name,
          ad_set_name,
          validation_errors,
          asset_customization_group_members(assignment_id)
        `,
        )
        .eq("campaign_id", campaignId)
        .in("status", ["ready", "pending", "pushing", "pushed", "error"]);

      if (groupError) throw groupError;

      const assignmentById = new Map<string, any>();
      for (const assignment of assignmentData || []) {
        assignmentById.set(assignment.id, assignment);
      }

      const groupedAssignmentIds = new Set<string>();
      const groupedItems: CreativeAssignmentItem[] = [];

      for (const group of groupData || []) {
        const memberIds = ((group as any).asset_customization_group_members || [])
          .map((member: any) => member.assignment_id)
          .filter(Boolean);

        const memberAssignments = memberIds
          .map((assignmentId: string) => assignmentById.get(assignmentId))
          .filter(Boolean);

        if (memberAssignments.length === 0) continue;

        memberAssignments.forEach((assignment: any) => groupedAssignmentIds.add(assignment.id));

        const firstAssignment = memberAssignments[0];
        const memberStatuses = memberAssignments.map((assignment: any) => assignment.status || "pending");
        const groupedStatus: CreativeAssignmentStatus = memberStatuses.some((status: string) => status === "error")
          ? "error"
          : memberStatuses.some((status: string) => status === "pushing")
            ? "pushing"
            : memberStatuses.every((status: string) => status === "pushed") || group.status === "pushed"
              ? "pushed"
              : "pending";

        const validationErrors = Array.isArray(group.validation_errors)
          ? group.validation_errors
          : [];

        groupedItems.push({
          id: group.id,
          creative_id: group.id,
          creativeName: group.group_name || "Asset Customization Group",
          originalFilename: `${memberAssignments.length} grouped asset${memberAssignments.length === 1 ? "" : "s"}`,
          mediaType: memberAssignments.some((assignment: any) => assignment.creative?.media_type === "video") ? "video" : "image",
          creativeType: "asset_customization",
          platform: firstAssignment.platform,
          market: group.market || firstAssignment.market,
          phaseName: group.phase_name || firstAssignment.phase_name,
          adSetName: group.ad_set_name || firstAssignment.ad_set_name || undefined,
          status: groupedStatus,
          errorMessage:
            memberAssignments.find((assignment: any) => assignment.error_message)?.error_message ||
            validationErrors.find((entry: any) => typeof entry?.message === "string")?.message ||
            undefined,
          urlParameters: firstAssignment.url_parameters || undefined,
          isGrouped: true,
          memberCount: memberAssignments.length,
        });
      }

      const mappedAssignments: CreativeAssignmentItem[] = (assignmentData || [])
        .filter((assignment: any) => !groupedAssignmentIds.has(assignment.id))
        .map((a: any) => ({
          id: a.id,
          creative_id: a.creative_id,
          creativeName: a.display_name || a.creative?.name || "Unknown Creative",
          originalFilename: a.creative?.original_filename || undefined,
          mediaType: a.creative?.media_type || "image",
          creativeType: a.creative?.creative_type || "dark_post",
          platform: a.platform,
          market: a.market,
          phaseName: a.phase_name,
          adSetName: a.ad_set_name || undefined,
          status: (a.status || "pending") as CreativeAssignmentStatus,
          errorMessage: a.error_message || undefined,
          urlParameters: a.url_parameters || undefined,
        }));

      setCreativeAssignments([...groupedItems, ...mappedAssignments]);
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
            prev.some((item) => item.isGrouped)
              ? (scheduleReload(), prev)
              : prev.map((item) =>
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
          event: "DELETE",
          schema: "public",
          table: "creative_assignments",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "creative_assignments",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "asset_customization_groups",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "asset_customization_group_members",
        },
        () => scheduleReload()
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
      if (reloadTimeoutRef.current !== null) {
        globalThis.clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = null;
      }

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [campaignId, enabled, loadData, scheduleReload]);

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
