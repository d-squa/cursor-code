import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";

export function useRole() {
  const { user } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();

  const [role, setRole] = useState<string | null>(null);
  const [isTeamOwner, setIsTeamOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setIsTeamOwner(false);
      setLoading(false);
      return;
    }

    if (workspaceLoading) {
      setLoading(true);
      return;
    }

    // Ensure consumers don't treat role as resolved while we fetch it
    setLoading(true);

    const fetchRole = async () => {
      try {
        // Role is scoped to the active workspace.
        // Owners are derived from the teams.owner_id field even if no user_roles row exists.
        if (activeWorkspaceId) {
          const { data: ownerTeam, error: ownerError } = await supabase
            .from("teams")
            .select("id", { head: false })
            .eq("id", activeWorkspaceId)
            .eq("owner_id", user.id)
            .maybeSingle();

          if (ownerError) {
            console.warn("Error checking workspace ownership:", ownerError);
          }

          const ownsWorkspace = !!ownerTeam;

          if (ownsWorkspace) {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.debug("[useRole] workspace owner", { userId: user.id, activeWorkspaceId });
            }
            setRole("owner");
            setIsTeamOwner(true);
            return;
          }

          const { data: roleRows, error: roleError } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("team_id", activeWorkspaceId);

          if (roleError) {
            console.warn("Error fetching role for workspace:", roleError);
          }

          const roleOrder = [
            "owner",
            "admin",
            "campaign_manager",
            "collaborator",
            "member",
            "viewer",
          ] as const;

          const roleRank = new Map<string, number>(roleOrder.map((r, idx) => [r, idx]));
          const highest = (roleRows ?? [])
            .map((r) => r?.role as string | undefined)
            .filter(Boolean)
            .sort((a, b) => (roleRank.get(a!) ?? 999) - (roleRank.get(b!) ?? 999))[0];

          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug("[useRole] workspace role", { userId: user.id, activeWorkspaceId, roles: roleRows, highest });
          }

          setRole(highest ?? null);
          setIsTeamOwner(false);
          return;
        }

        // Fallback: if no active workspace (should be rare), keep previous RPC behavior.
        const [{ data: highestRole, error: roleError }, { data: isOwnerResult, error: ownerError }] =
          await Promise.all([
            supabase.rpc("get_user_highest_role", { _user_id: user.id }),
            supabase.rpc("is_team_owner", { _user_id: user.id }),
          ]);

        if (roleError) console.warn("Error fetching role via RPC:", roleError);
        if (ownerError) console.warn("Error checking team ownership:", ownerError);

        const ownsTeam = isOwnerResult === true;
        const fetchedRole = highestRole as string | null;

        if (ownsTeam) {
          setRole("owner");
          setIsTeamOwner(true);
        } else {
          setRole(fetchedRole);
          setIsTeamOwner(false);
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setRole(null);
        setIsTeamOwner(false);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [user, activeWorkspaceId, workspaceLoading]);

  const isOwner = role === "owner" || isTeamOwner;
  const isAdmin = role === "admin" || isOwner;
  const canManageClients = isAdmin;
  const canViewClients = !!role; // All authenticated users with a role

  return { role, loading, isAdmin, isOwner, canManageClients, canViewClients };
}
