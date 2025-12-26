import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * Returns whether the current user is an admin/owner for the ACTIVE workspace.
 * Uses a backend permission function to avoid client-side RLS edge cases.
 */
export function useWorkspaceAdminAccess() {
  const { user } = useAuth();
  const {
    activeWorkspaceId,
    loading: workspaceLoading,
    workspaces,
  } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [canAccess, setCanAccess] = useState(false);

  useEffect(() => {
    if (!user) {
      setCanAccess(false);
      setLoading(false);
      return;
    }

    if (workspaceLoading) {
      setLoading(true);
      return;
    }

    // `useWorkspace` derives `activeWorkspaceId` in an effect.
    // There can be a render where `workspaceLoading=false` but `activeWorkspaceId=null`
    // even though workspaces have loaded. In that case, keep loading to avoid a false-deny.
    if (!activeWorkspaceId) {
      if ((workspaces?.length ?? 0) > 0) {
        setLoading(true);
        return;
      }
      setCanAccess(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.rpc("can_view_roles_in_team", {
          _viewer_id: user.id,
          _team_id: activeWorkspaceId,
        });

        if (error) throw error;
        if (!cancelled) setCanAccess(data === true);
      } catch (err) {
        console.warn("[useWorkspaceAdminAccess] failed", err);
        if (!cancelled) setCanAccess(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [user, activeWorkspaceId, workspaceLoading, workspaces?.length]);

  return { canAccess, loading, activeWorkspaceId };
}
