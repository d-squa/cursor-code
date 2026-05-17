import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  resolveCampaignCapabilities,
  type CampaignCapabilities,
} from "@/utils/campaignPermissions";

type UseCampaignEditPermissionArgs = {
  campaignId?: string | null;
  campaignTeamId?: string | null;
  campaignCreatorId?: string | null;
  campaignStatus?: string | null;
  /** URL has mode=extend — required for collaborator extension edits. */
  extensionMode?: boolean;
};

export function useCampaignEditPermission({
  campaignId,
  campaignTeamId,
  campaignCreatorId,
  campaignStatus,
  extensionMode = false,
}: UseCampaignEditPermissionArgs) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [teamRole, setTeamRole] = useState<string | null>(null);
  const [isTeamOwner, setIsTeamOwner] = useState(false);

  const teamId = campaignTeamId ?? activeWorkspaceId ?? null;

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      if (!user?.id) {
        if (!cancelled) {
          setTeamRole(null);
          setIsTeamOwner(false);
          setLoading(false);
        }
        return;
      }

      if (!teamId) {
        if (!cancelled) {
          setTeamRole(null);
          setIsTeamOwner(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        const [{ data: teamRow }, { data: roleRow }] = await Promise.all([
          supabase.from("teams").select("owner_id").eq("id", teamId).maybeSingle(),
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("team_id", teamId)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        setIsTeamOwner(teamRow?.owner_id === user.id);
        setTeamRole((roleRow?.role as string | undefined) ?? null);
      } catch (err) {
        console.error("Failed to resolve campaign edit permission:", err);
        if (!cancelled) {
          setTeamRole(null);
          setIsTeamOwner(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [user?.id, teamId, campaignId]);

  const capabilities: CampaignCapabilities = useMemo(
    () =>
      resolveCampaignCapabilities({
        userId: user?.id,
        creatorId: campaignCreatorId,
        teamRole,
        isTeamOwner,
        status: campaignStatus,
      }),
    [user?.id, campaignCreatorId, teamRole, isTeamOwner, campaignStatus],
  );

  const canEditInEditor =
    capabilities.canEditPlan ||
    (capabilities.canEditExtension && extensionMode);

  const lockPlanFoundation =
    capabilities.isCollaborator ||
    (capabilities.canEditExtension && extensionMode && !capabilities.canEditPlan);

  return {
    loading,
    capabilities,
    teamRole,
    isTeamOwner,
    canEdit: capabilities.canEditPlan,
    canEditInEditor,
    lockPlanFoundation,
    isViewer: capabilities.isViewer,
    isCollaborator: capabilities.isCollaborator,
  };
}
