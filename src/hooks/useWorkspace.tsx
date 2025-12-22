import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Workspace = {
  id: string;
  name: string;
  owner_id: string | null;
};

function storageKey(userId: string) {
  return `actiplan.activeWorkspaceId:${userId}`;
}

export function useWorkspace() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeWorkspaceId, _setActiveWorkspaceId] = useState<string | null>(null);

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["workspaces", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return [];

      const [{ data: ownedTeams, error: ownedError }, { data: memberships, error: memberError }] = await Promise.all([
        supabase.from("teams").select("id, name, owner_id").eq("owner_id", user.id),
        supabase.from("user_roles").select("team_id, teams(id, name, owner_id)").eq("user_id", user.id),
      ]);

      if (ownedError) throw ownedError;
      if (memberError) throw memberError;

      const byId = new Map<string, Workspace>();

      (ownedTeams ?? []).forEach((t: any) => {
        if (t?.id) byId.set(t.id, { id: t.id, name: t.name, owner_id: t.owner_id ?? null });
      });

      (memberships ?? []).forEach((m: any) => {
        const t = m?.teams;
        if (t?.id) byId.set(t.id, { id: t.id, name: t.name, owner_id: t.owner_id ?? null });
      });

      return Array.from(byId.values()).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    },
  });

  useEffect(() => {
    if (!user?.id) {
      _setActiveWorkspaceId(null);
      return;
    }
    if (isLoading) return;

    const saved = localStorage.getItem(storageKey(user.id));
    const savedIsValid = !!saved && workspaces.some((w) => w.id === saved);

    const next = savedIsValid ? (saved as string) : workspaces[0]?.id ?? null;
    _setActiveWorkspaceId(next);

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

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    loading: isLoading,
  };
}
