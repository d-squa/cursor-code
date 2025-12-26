import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * Returns whether the current user is an admin/owner for the ACTIVE workspace.
 * Uses a backend permission function to avoid client-side RLS edge cases.
 */
export function useWorkspaceAdminAccess() {
  const { user, loading: authLoading } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    // Still loading auth or workspace
    if (authLoading || workspaceLoading) {
      setLoading(true);
      return;
    }

    // No user = no access
    if (!user) {
      setCanAccess(false);
      setLoading(false);
      return;
    }

    // No active workspace yet = keep loading (don't deny prematurely)
    if (!activeWorkspaceId) {
      setLoading(true);
      return;
    }

    // Already checked this exact combo
    if (checkedRef.current === `${user.id}:${activeWorkspaceId}`) {
      return;
    }

    let cancelled = false;

    const checkAccess = async () => {
      setLoading(true);
      try {
        console.log("[useWorkspaceAdminAccess] Checking access", {
          userId: user.id,
          workspaceId: activeWorkspaceId,
        });

        const { data, error } = await supabase.rpc("can_view_roles_in_team", {
          _viewer_id: user.id,
          _team_id: activeWorkspaceId,
        });

        if (error) {
          console.error("[useWorkspaceAdminAccess] RPC error:", error);
          throw error;
        }

        console.log("[useWorkspaceAdminAccess] Result:", data);

        if (!cancelled) {
          checkedRef.current = `${user.id}:${activeWorkspaceId}`;
          setCanAccess(data === true);
        }
      } catch (err) {
        console.error("[useWorkspaceAdminAccess] Error:", err);
        if (!cancelled) {
          setCanAccess(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [user, activeWorkspaceId, authLoading, workspaceLoading]);

  return { canAccess, loading, activeWorkspaceId };
}
