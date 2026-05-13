import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Workspace = {
  id: string;
  name: string;
  owner_id: string | null;
  /** Billing workspace id when teams carry workspace_id (subscription container). */
  workspace_id: string | null;
};

function storageKey(userId: string) {
  return `actiplan.activeWorkspaceId:${userId}`;
}

export function useWorkspace() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeWorkspaceId, _setActiveWorkspaceId] = useState<string | null>(null);
  // Track whether we've resolved the active workspace after loading completes
  const [workspaceResolved, setWorkspaceResolved] = useState(false);

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["workspaces", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return [];

      // NOTE: We intentionally avoid PostgREST embedded joins here (e.g. `teams(...)`).
      // In this project, `user_roles.team_id` is not guaranteed to have a FK to `teams.id`,
      // which can make embedded joins fail and break workspace resolution.
      const [{ data: ownedTeams, error: ownedError }, { data: roles, error: rolesError }] = await Promise.all([
        supabase.from("teams").select("id, name, owner_id, workspace_id").eq("owner_id", user.id),
        supabase.from("user_roles").select("team_id").eq("user_id", user.id),
      ]);

      if (ownedError) throw ownedError;

      // If roles query fails for any reason, degrade gracefully (still show owned workspaces).
      const teamIds = (rolesError ? [] : (roles ?? []))
        .map((r: any) => r?.team_id)
        .filter(Boolean);

      const { data: memberTeams, error: memberTeamsError } = teamIds.length
        ? await supabase.from("teams").select("id, name, owner_id, workspace_id").in("id", teamIds)
        : ({ data: [] as any[], error: null } as any);

      if (memberTeamsError) throw memberTeamsError;

      const byId = new Map<string, Workspace>();

      (ownedTeams ?? []).forEach((t: any) => {
        if (t?.id)
          byId.set(t.id, {
            id: t.id,
            name: t.name,
            owner_id: t.owner_id ?? null,
            workspace_id: (t.workspace_id as string | null) ?? null,
          });
      });

      (memberTeams ?? []).forEach((t: any) => {
        if (t?.id)
          byId.set(t.id, {
            id: t.id,
            name: t.name,
            owner_id: t.owner_id ?? null,
            workspace_id: (t.workspace_id as string | null) ?? null,
          });
      });

      // Subscription-only members (roster without team user_roles): attach default team for billing context.
      if (byId.size === 0) {
        const { data: subRows, error: subErr } = await supabase
          .from("workspace_subscription_members")
          .select("workspace_id")
          .eq("user_id", user.id);
        if (subErr) throw subErr;
        const wsIds = [
          ...new Set((subRows ?? []).map((r: { workspace_id?: string }) => r.workspace_id).filter(Boolean)),
        ] as string[];
        if (wsIds.length > 0) {
          const { data: wsList, error: wsListErr } = await supabase
            .from("workspaces")
            .select("id, name, owner_id, default_team_id")
            .in("id", wsIds);
          if (wsListErr) throw wsListErr;
          (wsList ?? []).forEach((w: any) => {
            const dt = w?.default_team_id as string | null | undefined;
            const wid = w?.id as string | undefined;
            if (dt && wid) {
              byId.set(dt, {
                id: dt,
                name: (w.name as string) || "Subscription",
                owner_id: (w.owner_id as string | null) ?? null,
                workspace_id: wid,
              });
            }
          });
        }
      }

      return Array.from(byId.values()).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    },
  });

  useEffect(() => {
    if (!user?.id) {
      _setActiveWorkspaceId(null);
      setWorkspaceResolved(false);
      return;
    }
    if (isLoading) {
      setWorkspaceResolved(false);
      return;
    }

    // If no workspaces exist, set to null and exit (this is a valid end state)
    if (workspaces.length === 0) {
      _setActiveWorkspaceId(null);
      setWorkspaceResolved(true);
      return;
    }

    const saved = localStorage.getItem(storageKey(user.id));
    const savedIsValid = !!saved && workspaces.some((w) => w.id === saved);

    const next = savedIsValid ? (saved as string) : workspaces[0]?.id ?? null;
    _setActiveWorkspaceId(next);
    setWorkspaceResolved(true);

    if (next) localStorage.setItem(storageKey(user.id), next);
  }, [user?.id, isLoading, workspaces]);

  const setActiveWorkspaceId = useCallback(
    (nextId: string) => {
      if (!user?.id) return;
      if (!workspaces.some((w) => w.id === nextId)) return;
      if (nextId === activeWorkspaceId) return;

      _setActiveWorkspaceId(nextId);
      localStorage.setItem(storageKey(user.id), nextId);

      // Invalidate all workspace-dependent queries to trigger a refetch
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });

      // Some screens keep local state that doesn't automatically reset on workspace change;
      // force a reload so the UI always reflects the newly selected workspace.
      setTimeout(() => window.location.reload(), 0);
    },
    [user?.id, workspaces, queryClient, activeWorkspaceId]
  );

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  );

  // Loading is true until BOTH the query completes AND we've resolved the active workspace
  // This prevents race conditions where workspaceLoading is false but activeWorkspaceId isn't set yet
  const loading = isLoading || !workspaceResolved;

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    loading,
  };
}
