import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSampleMode } from "@/contexts/SampleModeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Trash2, Mail, Send, Copy, MoreHorizontal, UserMinus, AlertTriangle } from "lucide-react";
import { FeatureGate } from "@/components/FeatureGate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** PostgREST may return smallints as string or wrap scalars; NaN must not count as success. */
function parseRpcInt(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "boolean") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (Array.isArray(v)) return v.length === 0 ? 0 : parseRpcInt(v[0]);
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if ("count" in o) return parseRpcInt(o.count);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Trace roster + RPCs: localStorage actiplan.debugUserMgmt=1 or .env VITE_DEBUG_USER_MGMT=1 (reload). */
function userMgmtDebugEnabled(): boolean {
  if (import.meta.env.VITE_DEBUG_USER_MGMT === "1") return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("actiplan.debugUserMgmt") === "1";
  } catch {
    return false;
  }
}

function logUserMgmt(event: string, detail: Record<string, unknown>) {
  if (!userMgmtDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info(`[UserMgmt:${event}]`, {
    t: new Date().toISOString(),
    ...detail,
  });
}

const ROLE_PRIORITY = [
  "owner",
  "admin",
  "campaign_manager",
  "collaborator",
  "member",
  "viewer",
] as const;

function strongestAppRole(roles: Set<string>): string {
  for (const p of ROLE_PRIORITY) {
    if (roles.has(p)) return p;
  }
  return "member";
}

/** Client-side roster when RPC is missing; mirrors subscription roster + team labels. */
async function fetchBillingWorkspaceMembersFromTables(workspaceId: string) {
  const { data: subs, error: subsErr } = await supabase
    .from("workspace_subscription_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId);
  if (subsErr) throw subsErr;

  const { data: wsTeams, error: teamsErr } = await supabase
    .from("teams")
    .select("id, name, owner_id")
    .eq("workspace_id", workspaceId);
  if (teamsErr) throw teamsErr;

  const teamList = wsTeams ?? [];
  const teamIds = teamList.map((t: { id: string }) => t.id).filter(Boolean);
  const teamNameById = new Map<string, string>(
    teamList.map((t: { id: string; name: string }) => [t.id, t.name]),
  );

  const { data: wsRow, error: wsErr } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();
  if (wsErr) throw wsErr;
  const billingOwnerId = wsRow?.owner_id as string | undefined;

  const subByUser = new Map<string, string>();
  (subs ?? []).forEach((r: { user_id: string; role: string }) => subByUser.set(r.user_id, r.role));

  let teamRoles: { user_id: string; team_id: string }[] = [];
  if (teamIds.length > 0) {
    const { data: tr, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, team_id")
      .in("team_id", teamIds);
    if (rolesError) throw rolesError;
    teamRoles = (tr ?? []) as { user_id: string; team_id: string }[];
  }

  const userIds = new Set<string>();
  subByUser.forEach((_r, uid) => userIds.add(uid));
  if (billingOwnerId) userIds.add(billingOwnerId);

  if (userIds.size === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .in("id", Array.from(userIds))
    .order("created_at", { ascending: false });
  if (profilesError) throw profilesError;

  const teamNamesByUser = new Map<string, Set<string>>();
  teamRoles.forEach((r) => {
    const nm = teamNameById.get(r.team_id);
    if (!nm) return;
    const set = teamNamesByUser.get(r.user_id) ?? new Set<string>();
    set.add(nm);
    teamNamesByUser.set(r.user_id, set);
  });

  const pickRole = (uid: string) => {
    if (billingOwnerId && uid === billingOwnerId) return "owner";
    return subByUser.get(uid) ?? "member";
  };

  const visibleProfiles = (profiles ?? []).filter((profile: { id: string }) => {
    const uid = profile.id;
    return subByUser.has(uid) || (billingOwnerId && uid === billingOwnerId);
  });

  return visibleProfiles.map((profile: Record<string, unknown>) => ({
    ...profile,
    role: pickRole(profile.id as string),
    team_names: Array.from(teamNamesByUser.get(profile.id as string) ?? []).sort(),
  }));
}

export default function UserManagement() {
  const { user } = useAuth();
  const { workspaces, activeWorkspaceId, activeWorkspace, loading: workspacesLoading } = useWorkspace();
  const queryClient = useQueryClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [removeConfirm, setRemoveConfirm] = useState<{
    userId: string;
    email: string;
    kind: "subscription" | "team" | "workspace";
  } | null>(null);

  /** Billing workspace for this user — not driven by the team/workspace switcher. */
  const { data: billingWorkspaceId, isLoading: billingWorkspaceResolving } = useQuery({
    queryKey: ["billing-workspace-id", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return null as string | null;

      const { data: ownedList, error: ownedErr } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (ownedErr) throw ownedErr;
      if (ownedList?.[0]?.id) return ownedList[0].id as string;

      const { data: smList, error: smErr } = await supabase
        .from("workspace_subscription_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .order("workspace_id", { ascending: true })
        .limit(1);
      if (smErr) throw smErr;
      if (smList?.[0]?.workspace_id) return smList[0].workspace_id as string;

      const { data: roleRows, error: rolesErr } = await supabase
        .from("user_roles")
        .select("team_id")
        .eq("user_id", user.id);
      if (rolesErr) throw rolesErr;
      const teamIds = (roleRows ?? []).map((r: { team_id?: string }) => r.team_id).filter(Boolean) as string[];
      if (teamIds.length === 0) return null;

      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("workspace_id")
        .in("id", teamIds)
        .not("workspace_id", "is", null);
      if (teamErr) throw teamErr;
      const wids = [
        ...new Set(
          (teamRows ?? [])
            .map((t: { workspace_id?: string | null }) => t.workspace_id)
            .filter(Boolean) as string[],
        ),
      ].sort();
      return wids[0] ?? null;
    },
  });

  /** Must match `users` useQuery key so mutations refetch the list that is actually mounted. */
  const usersListQueryKey = useMemo(
    () => ["users-with-roles", user?.id ?? "", billingWorkspaceId ?? ""] as const,
    [user?.id, billingWorkspaceId],
  );

  const { data: mySubscriptionMgmtRole } = useQuery({
    queryKey: ["user-mgmt-subscription-role", user?.id, billingWorkspaceId],
    enabled: !!user?.id && !!billingWorkspaceId,
    queryFn: async () => {
      if (!user?.id || !billingWorkspaceId) return null;
      const { data: ws, error: wsErr } = await supabase
        .from("workspaces")
        .select("owner_id")
        .eq("id", billingWorkspaceId)
        .maybeSingle();
      if (wsErr) throw wsErr;
      if (ws?.owner_id === user.id) return "owner";
      const { data: sm, error: smErr } = await supabase
        .from("workspace_subscription_members")
        .select("role")
        .eq("workspace_id", billingWorkspaceId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (smErr) throw smErr;
      return (sm?.role as string | null) ?? "member";
    },
  });

  const { data: myTeamRole } = useQuery({
    queryKey: [
      "user-mgmt-my-role",
      user?.id,
      activeWorkspaceId,
      activeWorkspace?.owner_id,
    ],
    enabled: !!user?.id && !!activeWorkspaceId && !billingWorkspaceId,
    queryFn: async () => {
      if (!user?.id || !activeWorkspaceId) return null;

      if (activeWorkspace?.owner_id === user.id) return "owner";

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("team_id", activeWorkspaceId)
        .maybeSingle();

      if (error) throw error;
      return (data?.role as string | null) ?? "member";
    },
  });

  const canManageUsers = billingWorkspaceId
    ? mySubscriptionMgmtRole === "owner" || mySubscriptionMgmtRole === "admin"
    : myTeamRole === "owner" || myTeamRole === "admin";
  const { isSampleMode, guardWrite } = useSampleMode();

  useEffect(() => {
    logUserMgmt("session.capabilities", {
      myTeamRole,
      mySubscriptionMgmtRole,
      canManageUsers,
      billingWorkspaceId,
      activeWorkspaceId,
      activeTeamWorkspaceId: activeWorkspace?.workspace_id ?? null,
      activeTeamOwnerId: activeWorkspace?.owner_id ?? null,
      authUserId: user?.id ?? null,
    });
  }, [
    myTeamRole,
    mySubscriptionMgmtRole,
    canManageUsers,
    billingWorkspaceId,
    activeWorkspaceId,
    activeWorkspace?.workspace_id,
    activeWorkspace?.owner_id,
    user?.id,
  ]);

  /** Roles that appear in the edit dropdown (must match DB enum + RPC expectations). */
  const EDIT_ROLE_VALUES = useMemo(
    () =>
      new Set(["admin", "campaign_manager", "collaborator", "member", "viewer"]),
    [],
  );

  const { data: billingWorkspaceMeta } = useQuery({
    queryKey: ["billing-workspace-meta", billingWorkspaceId],
    enabled: !!billingWorkspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, owner_id")
        .eq("id", billingWorkspaceId as string)
        .single();
      if (error) throw error;
      return data as { id: string; name: string; owner_id: string };
    },
  });

  const billingTitle = billingWorkspaceMeta?.name ?? activeWorkspace?.name ?? "Workspace";

  // Subscription roster (billing workspace) or legacy single-team scope
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: usersListQueryKey,
    queryFn: async () => {
      if (!user?.id) return [];

      if (billingWorkspaceId) {
        logUserMgmt("users.fetch.start", {
          mode: "billing_rpc",
          billingWorkspaceId,
        });
        const { data: rows, error: rpcErr } = await supabase.rpc("get_workspace_member_summaries", {
          p_workspace_id: billingWorkspaceId,
        });
        if (!rpcErr) {
          const mapped = (rows ?? []).map((row) => ({
            id: row.id,
            email: row.email,
            company_name: row.company_name,
            created_at: row.created_at,
            role: row.role,
            team_names: (row as { team_names?: string[] }).team_names ?? [],
          }));
          logUserMgmt("users.fetch.done", {
            mode: "billing_rpc",
            count: mapped.length,
            sample: mapped.slice(0, 8).map((r) => ({ id: r.id, role: r.role })),
          });
          return mapped;
        }

        logUserMgmt("users.fetch.rpc_fallback", {
          message: rpcErr.message,
          code: rpcErr.code,
          details: rpcErr.details,
          hint: rpcErr.hint,
        });
        // eslint-disable-next-line no-console
        console.warn(
          "[UserMgmt] get_workspace_member_summaries failed; using client-side roster. Apply latest workspace migrations on Supabase.",
          rpcErr.message,
        );

        const fallback = await fetchBillingWorkspaceMembersFromTables(billingWorkspaceId);
        logUserMgmt("users.fetch.done", {
          mode: "billing_tables_fallback",
          count: fallback.length,
          sample: fallback.slice(0, 8).map((r: { id?: string; role?: unknown }) => ({ id: r.id, role: r.role })),
        });
        return fallback;
      }

      if (!activeWorkspaceId) return [];

      logUserMgmt("users.fetch.start", { mode: "legacy_team", activeWorkspaceId });
      const [{ data: team, error: teamError }, { data: teamRoles, error: rolesError }] = await Promise.all([
        supabase.from("teams").select("id, owner_id").eq("id", activeWorkspaceId).single(),
        supabase.from("user_roles").select("user_id, role").eq("team_id", activeWorkspaceId),
      ]);

      if (teamError) throw teamError;
      if (rolesError) throw rolesError;

      const userIds = new Set<string>();
      (teamRoles ?? []).forEach((r: { user_id: string }) => userIds.add(r.user_id));
      if (team?.owner_id) userIds.add(team.owner_id);

      if (userIds.size === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", Array.from(userIds))
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const rolesByUser = new Map<string, Set<string>>();
      (teamRoles ?? []).forEach((r: { user_id: string; role: string }) => {
        const set = rolesByUser.get(r.user_id) ?? new Set<string>();
        set.add(r.role);
        rolesByUser.set(r.user_id, set);
      });

      const pickRole = (uid: string) => {
        if (team?.owner_id && uid === team.owner_id) return "owner";

        const roles = rolesByUser.get(uid);
        if (!roles || roles.size === 0) return "member";
        return strongestAppRole(roles);
      };

      const visibleProfiles = (profiles ?? []).filter((profile: { id: string }) => {
        const uid = profile.id;
        if (team?.owner_id && uid === team.owner_id) return true;
        return (teamRoles ?? []).some((r: { user_id: string }) => r.user_id === uid);
      });

      const legacy = visibleProfiles.map((profile: Record<string, unknown>) => ({
        ...profile,
        role: pickRole(profile.id as string),
        team_names: [] as string[],
      }));
      logUserMgmt("users.fetch.done", {
        mode: "legacy_team",
        count: legacy.length,
        teamRolesCount: (teamRoles ?? []).length,
        sample: legacy.slice(0, 8).map((r) => ({ id: r.id, role: r.role })),
      });
      return legacy;
    },
    enabled: !!user?.id && (!!billingWorkspaceId || !!activeWorkspaceId),
  });

  // Pending invitations for this billing account (not tied to the team switcher)
  const { data: invitations } = useQuery({
    queryKey: ["invitations", billingWorkspaceId ?? "legacy", activeWorkspaceId ?? ""],
    queryFn: async () => {
      const baseSelect = `
          *,
          teams (name)
        `;

      if (billingWorkspaceId) {
        const { data: tidRows } = await supabase
          .from("teams")
          .select("id")
          .eq("workspace_id", billingWorkspaceId);
        const teamIdList = (tidRows ?? []).map((t: { id: string }) => t.id).filter(Boolean);

        const [{ data: byWs, error: e1 }, { data: legacyTeams, error: e2 }] = await Promise.all([
          supabase
            .from("invitations")
            .select(baseSelect)
            .eq("status", "pending")
            .eq("workspace_id", billingWorkspaceId)
            .order("created_at", { ascending: false }),
          teamIdList.length > 0
            ? supabase
                .from("invitations")
                .select(baseSelect)
                .eq("status", "pending")
                .in("team_id", teamIdList)
                .is("workspace_id", null)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [] as unknown[], error: null }),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;
        const seen = new Set<string>();
        return [...(byWs ?? []), ...(legacyTeams ?? [])].filter((row: { id?: string }) => {
          const id = row?.id;
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }

      if (!activeWorkspaceId) return [];

      const { data: ctxTeam } = await supabase
        .from("teams")
        .select("workspace_id")
        .eq("id", activeWorkspaceId)
        .maybeSingle();

      const wid = ctxTeam?.workspace_id as string | undefined;

      if (wid) {
        const [{ data: byWs, error: e1 }, { data: legacy, error: e2 }] = await Promise.all([
          supabase
            .from("invitations")
            .select(baseSelect)
            .eq("status", "pending")
            .eq("workspace_id", wid)
            .order("created_at", { ascending: false }),
          supabase
            .from("invitations")
            .select(baseSelect)
            .eq("status", "pending")
            .eq("team_id", activeWorkspaceId)
            .is("workspace_id", null)
            .order("created_at", { ascending: false }),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;
        const seen = new Set<string>();
        return [...(byWs ?? []), ...(legacy ?? [])].filter((row: { id?: string }) => {
          const id = row?.id;
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }

      const { data, error } = await supabase
        .from("invitations")
        .select(baseSelect)
        .eq("status", "pending")
        .eq("team_id", activeWorkspaceId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && (!!billingWorkspaceId || !!activeWorkspaceId),
  });

  // Create invitation mutation (subscription roster: subscription_access_only; no automatic team powers)
  const createInvitation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!billingWorkspaceId) throw new Error("No billing workspace");

      const token = crypto.randomUUID();

      const { data: ws, error: wsError } = await supabase
        .from("workspaces")
        .select("default_team_id, name")
        .eq("id", billingWorkspaceId)
        .single();

      if (wsError) throw wsError;
      const inviteTeamId = (ws?.default_team_id as string | null) ?? null;
      if (!inviteTeamId) {
        throw new Error("Workspace has no default team; run migrations or contact support.");
      }

      const { data: invitation, error: inviteError } = await supabase
        .from("invitations")
        .insert([
          {
            email,
            role: role as any,
            team_id: inviteTeamId,
            workspace_id: billingWorkspaceId,
            subscription_access_only: true,
            token,
            created_by: user?.id,
          },
        ])
        .select()
        .single();

      if (inviteError) throw inviteError;

      const { data: team } = await supabase.from("teams").select("name").eq("id", inviteTeamId).single();

      const displayName = ws?.name ?? team?.name ?? "Subscription";

      const { error: emailError } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email,
          teamName: displayName,
          role,
          invitationToken: token,
          origin: window.location.origin,
        },
      });

      if (emailError) throw emailError;

      return invitation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      void queryClient.invalidateQueries({ queryKey: ["users-with-roles", user?.id] });
      toast.success("Invitation sent successfully!");
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("member");
    },
    onError: (error) => {
      toast.error("Failed to send invitation: " + error.message);
    },
  });

  /** Legacy single-team: remove team membership only (does not change subscription roster). */
  const removeUserFromTeam = useMutation({
    mutationFn: async (userId: string) => {
      if (!guardWrite("Removing team members")) throw new Error("Read-only (Sample Mode or blocked)");
      if (!activeWorkspaceId) throw new Error("No active workspace");
      const { data: removed, error } = await supabase.rpc("remove_team_member_from_team", {
        p_target_user_id: userId,
        p_team_id: activeWorkspaceId,
      });
      if (error) throw error;
      const n = parseRpcInt(removed);
      if (n < 1) {
        throw new Error(
          "No membership row was removed. They may already be removed, or you may lack permission.",
        );
      }
    },
    onSuccess: async (_data, removedUserId) => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: usersListQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["invitations"] }),
        queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
        queryClient.invalidateQueries({ queryKey: ["user-mgmt-my-role"] }),
      ]);
      toast.success(`Removed from ${activeWorkspace?.name ?? "this team"}.`);
      setRemoveConfirm(null);
    },
    onError: (error: Error) => {
      if (error.message.includes("Read-only")) return;
      toast.error("Failed to remove user: " + error.message);
    },
  });

  /** Removes target from subscription (and all teams in that billing workspace). */
  const removeUserFromWorkspace = useMutation({
    mutationFn: async ({
      userId,
      workspaceId: workspaceIdOverride,
    }: {
      userId: string;
      workspaceId?: string | null;
    }) => {
      const wid = (workspaceIdOverride ?? billingWorkspaceId) ?? undefined;
      logUserMgmt("remove.workspace.start", {
        userId,
        wid,
        activeWorkspaceId,
        isSampleMode,
      });
      if (!guardWrite("Removing team members")) {
        logUserMgmt("remove.workspace.blocked", { reason: "guardWrite" });
        throw new Error("Read-only (Sample Mode or blocked)");
      }
      if (!wid) {
        logUserMgmt("remove.workspace.blocked", { reason: "no_billing_workspace" });
        throw new Error(
          "No billing workspace resolved. Run database migrations or contact support.",
        );
      }

      const { data: removed, error } = await supabase.rpc("remove_member_from_workspace", {
        p_workspace_id: wid,
        p_target_user_id: userId,
      });

      if (error) {
        logUserMgmt("remove.workspace.rpc_error", {
          message: error.message,
          code: error.code,
          details: error.details,
        });
        throw error;
      }
      const n = parseRpcInt(removed);
      logUserMgmt("remove.workspace.rpc_ok", {
        rawRpcData: removed,
        typeofRaw: typeof removed,
        parsedRowCount: n,
      });
      if (n < 1) {
        throw new Error(
          "No memberships were removed. The user may have no team roles in this workspace, or you may lack permission.",
        );
      }
    },
    onSuccess: async (_data, variables) => {
      const removedUserId = variables.userId;
      logUserMgmt("remove.workspace.success", { removedUserId });
      queryClient.setQueryData(usersListQueryKey, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.filter((row: { id?: string }) => row?.id !== removedUserId);
      });
      await Promise.all([
        queryClient.refetchQueries({ queryKey: usersListQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["invitations"] }),
        queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
        queryClient.invalidateQueries({ queryKey: ["user-mgmt-my-role"] }),
        queryClient.invalidateQueries({ queryKey: ["user-mgmt-subscription-role"] }),
        queryClient.invalidateQueries({ queryKey: ["billing-workspace-id"] }),
      ]);
      const rowsAfter = queryClient.getQueryData(usersListQueryKey) as Array<{ id?: string }> | undefined;
      logUserMgmt("remove.workspace.list_after", {
        removedUserId,
        listLength: rowsAfter?.length,
        targetStillListed: rowsAfter?.some((r) => r.id === removedUserId) ?? false,
      });
      toast.success("User removed from this subscription");
      setRemoveConfirm(null);
    },
    onError: (error: Error) => {
      logUserMgmt("remove.workspace.error", { message: error.message });
      if (error.message.includes("Read-only")) return;
      toast.error("Failed to remove user: " + error.message);
    },
  });

  // Update user role mutation (SECURITY DEFINER RPC — client UPDATE often no-ops under RLS with no error)
  const updateUserRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      logUserMgmt("role.update.start", {
        userId,
        newRole,
        billingWorkspaceId,
        activeWorkspaceId,
        currentUserId: user?.id,
      });
      if (!guardWrite("Changing roles")) {
        logUserMgmt("role.update.blocked", { reason: "guardWrite" });
        throw new Error("Read-only (Sample Mode or blocked)");
      }
      if (!billingWorkspaceId && !activeWorkspaceId) throw new Error("No workspace context");

      if (billingWorkspaceId) {
        const { data: updated, error } = await supabase.rpc("update_subscription_member_role", {
          p_workspace_id: billingWorkspaceId,
          p_target_user_id: userId,
          p_new_role: newRole,
        });
        if (error) {
          logUserMgmt("role.update.rpc_error", {
            rpc: "update_subscription_member_role",
            message: error.message,
            code: error.code,
            details: error.details,
          });
          throw error;
        }
        const n = parseRpcInt(updated);
        logUserMgmt("role.update.rpc_ok", {
          rpc: "update_subscription_member_role",
          rawRpcData: updated,
          typeofRaw: typeof updated,
          parsedRowCount: n,
        });
        if (n < 1) {
          throw new Error(
            "Subscription role was not updated. They may lack a subscription row, or you may lack permission.",
          );
        }
        return;
      }

      if (!activeWorkspaceId) throw new Error("No active workspace");

      const { data: updated, error } = await supabase.rpc("update_team_member_role", {
        p_team_id: activeWorkspaceId,
        p_target_user_id: userId,
        p_new_role: newRole,
      });

      if (error) {
        logUserMgmt("role.update.rpc_error", {
          rpc: "update_team_member_role",
          message: error.message,
          code: error.code,
          details: error.details,
        });
        throw error;
      }
      const n = parseRpcInt(updated);
      logUserMgmt("role.update.rpc_ok", {
        rpc: "update_team_member_role",
        rawRpcData: updated,
        typeofRaw: typeof updated,
        parsedRowCount: n,
      });
      if (n < 1) {
        throw new Error(
          "Role was not updated. You may lack permission, or this member has no role row for this workspace.",
        );
      }
    },
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({ queryKey: usersListQueryKey });
      queryClient.invalidateQueries({ queryKey: ["user-mgmt-my-role"] });
      queryClient.invalidateQueries({ queryKey: ["user-mgmt-subscription-role"] });
      const rows = queryClient.getQueryData(usersListQueryKey) as
        | Array<{ id?: string; role?: string }>
        | undefined;
      const row = rows?.find((r) => r.id === variables.userId);
      logUserMgmt("role.update.after_refetch", {
        userId: variables.userId,
        requestedRole: variables.newRole,
        rowRoleAfter: row?.role,
        listLength: rows?.length,
      });
      if (billingWorkspaceId && row && row.role !== variables.newRole) {
        toast.warning("Subscription role did not fully apply", {
          description: "Refresh the page or check billing owner / admin permissions.",
        });
      } else if (!billingWorkspaceId && row && row.role !== variables.newRole) {
        toast.warning("Role only partly updated", {
          description:
            "They still have an owner row on a team they own, or another role row the workspace RPC did not change. Transfer team ownership first if you need to remove owner-level access.",
        });
      } else {
        toast.success("Role updated successfully");
      }
    },
    onError: (error: Error) => {
      logUserMgmt("role.update.error", { message: error.message });
      if (error.message.includes("Read-only")) return;
      toast.error("Failed to update role: " + error.message);
    },
  });

  // Cancel invitation mutation
  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "cancelled" })
        .eq("id", invitationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation cancelled");
    },
    onError: (error) => {
      toast.error("Failed to cancel invitation: " + error.message);
    },
  });

  // Resend invitation mutation
  const resendInvitation = useMutation({
    mutationFn: async (invitation: any) => {
      const { data: team } = await supabase
        .from("teams")
        .select("name")
        .eq("id", invitation.team_id)
        .single();

      const { error: emailError } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: invitation.email,
          teamName: team?.name || "Team",
          role: invitation.role,
          invitationToken: invitation.token,
        },
      });

      if (emailError) throw emailError;
    },
    onSuccess: () => {
      toast.success("Invitation resent successfully!");
    },
    onError: (error) => {
      toast.error("Failed to resend invitation: " + error.message);
    },
  });

  const copyInvitationUrl = (token: string) => {
    const baseUrl = window.location.origin;
    const invitationUrl = `${baseUrl}/accept-invitation?token=${token}`;
    
    navigator.clipboard.writeText(invitationUrl).then(() => {
      toast.success("Invitation URL copied to clipboard!");
    }).catch(() => {
      toast.error("Failed to copy URL");
    });
  };

  const handleInvite = () => {
    if (!inviteEmail || !inviteRole || !billingWorkspaceId) {
      toast.error("Please fill in all fields");
      return;
    }

    createInvitation.mutate({
      email: inviteEmail,
      role: inviteRole,
    });
  };

  if (billingWorkspaceResolving || (!billingWorkspaceId && workspacesLoading) || loadingUsers) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading members…</div>
      </div>
    );
  }

  return (
    <FeatureGate feature="user_management">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Subscription users</h1>
          <p className="text-muted-foreground mt-1">
            {billingWorkspaceId ? (
              <>
                Manage who can access this subscription and their{" "}
                <span className="font-medium text-foreground">subscription role</span> (billing account:{" "}
                <span className="font-medium text-foreground">{billingTitle}</span>). Team membership and team roles
                are managed under <span className="font-medium text-foreground">Manage Your Team</span>; changing those
                does not change subscription roles here.
              </>
            ) : (
              <>
                Team: <span className="font-medium text-foreground">{activeWorkspace?.name ?? "Workspace"}</span>
                <span className="block text-xs mt-1">
                  Subscription roster requires a billing workspace. Use Manage Your Team for this team&apos;s members.
                </span>
              </>
            )}
          </p>
        </div>

        {canManageUsers && billingWorkspaceId && (
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isSampleMode} title={isSampleMode ? "Disabled in Sample Mode" : undefined}>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite subscription user
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite subscription user</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="actiplanner@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="team">Subscription</Label>
                  <Input value={billingWorkspaceId ? billingTitle : "—"} disabled className="bg-muted" />
                </div>

                <div>
                  <Label htmlFor="role">Subscription role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="campaign_manager">Campaign Manager</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleInvite} 
                  className="w-full"
                  disabled={createInvitation.isPending}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Send Invitation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Pending Invitations - only show to admins/owners */}
      {canManageUsers && invitations && invitations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Pending Invitations</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation: any) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>
                    {invitation.subscription_access_only ? (
                      <Badge variant="secondary">Subscription only</Badge>
                    ) : (
                      invitation.teams?.name || "Team"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{invitation.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(invitation.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {new Date(invitation.expires_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resendInvitation.mutate(invitation)}
                        title="Resend invitation"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyInvitationUrl(invitation.token)}
                        title="Copy invitation URL"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelInvitation.mutate(invitation.id)}
                        title="Cancel invitation"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Active ActiPlanners */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">People on this subscription</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Subscription role</TableHead>
              <TableHead>Teams</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Joined</TableHead>
              {canManageUsers && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((userItem: any) => {
              const isOwner = userItem.role === "owner";
              const isSelf = userItem.id === user?.id;
              const canModify = canManageUsers && !isOwner && !isSelf;
              const roleKey = String(userItem.role ?? "");
              const canEditRoleWithSelect =
                canModify && !isSampleMode && EDIT_ROLE_VALUES.has(roleKey);

              return (
                <TableRow key={userItem.id}>
                  <TableCell>{userItem.email}</TableCell>
                  <TableCell>
                    {canEditRoleWithSelect ? (
                      <Select
                        value={roleKey}
                        onValueChange={(newRole) => {
                          logUserMgmt("role.select", {
                            userId: userItem.id,
                            email: userItem.email,
                            fromRole: roleKey,
                            toRole: newRole,
                          });
                          updateUserRole.mutate({ userId: userItem.id, newRole });
                        }}
                      >
                        <SelectTrigger className="w-[160px]" disabled={isSampleMode}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="campaign_manager">Campaign Manager</SelectItem>
                          <SelectItem value="collaborator">Collaborator</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : userItem.role ? (
                      <Badge
                        variant={
                          isOwner ? "default" : userItem.role === "admin" ? "secondary" : "outline"
                        }
                      >
                        {userItem.role.replace("_", " ")}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {Array.isArray(userItem.team_names) && userItem.team_names.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {userItem.team_names.map((name: string) => (
                          <Badge key={name} variant="outline" className="font-normal">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">No teams</span>
                    )}
                  </TableCell>
                  <TableCell>{userItem.company_name || "—"}</TableCell>
                  <TableCell>
                    {new Date(userItem.created_at).toLocaleDateString()}
                  </TableCell>
                  {canManageUsers && (
                    <TableCell>
                      {canModify && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" disabled={isSampleMode}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {billingWorkspaceId ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() =>
                                  setRemoveConfirm({
                                    userId: userItem.id,
                                    email: userItem.email,
                                    kind: "subscription",
                                  })
                                }
                                disabled={!billingWorkspaceId}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove from subscription
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  onClick={() =>
                                    setRemoveConfirm({
                                      userId: userItem.id,
                                      email: userItem.email,
                                      kind: "team",
                                    })
                                  }
                                >
                                  <UserMinus className="mr-2 h-4 w-4" />
                                  Remove from this team only
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() =>
                                    setRemoveConfirm({
                                      userId: userItem.id,
                                      email: userItem.email,
                                      kind: "workspace",
                                    })
                                  }
                                  disabled={!activeWorkspace?.workspace_id}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove from entire workspace (all teams)
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!removeConfirm} onOpenChange={(open) => !open && setRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {removeConfirm?.kind === "team"
                ? "Remove from this team only"
                : removeConfirm?.kind === "workspace"
                  ? "Remove from entire workspace"
                  : "Remove from subscription"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeConfirm?.kind === "team" ? (
                <>
                  This removes <strong>{removeConfirm?.email}</strong> from the team{" "}
                  <strong>{activeWorkspace?.name}</strong> only. Their subscription access here is unchanged.
                </>
              ) : removeConfirm?.kind === "workspace" ? (
                <>
                  This removes <strong>{removeConfirm?.email}</strong> from <strong>every team</strong> in this billing
                  workspace and from the subscription roster. Pending invitations for this workspace that match their
                  email will be cancelled.
                </>
              ) : (
                <>
                  This removes <strong>{removeConfirm?.email}</strong> from the subscription{" "}
                  <strong>{billingTitle}</strong> (all teams under it and their subscription row). Pending invitations
                  that match their email for this workspace will be cancelled.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!removeConfirm) return;
                logUserMgmt("remove.confirm", {
                  kind: removeConfirm.kind,
                  targetUserId: removeConfirm.userId,
                  email: removeConfirm.email,
                });
                if (removeConfirm.kind === "team") {
                  removeUserFromTeam.mutate(removeConfirm.userId);
                } else if (removeConfirm.kind === "workspace") {
                  const w = activeWorkspace?.workspace_id;
                  if (!w) {
                    toast.error("This team is not linked to a billing workspace.");
                    return;
                  }
                  removeUserFromWorkspace.mutate({
                    userId: removeConfirm.userId,
                    workspaceId: w,
                  });
                } else {
                  removeUserFromWorkspace.mutate({ userId: removeConfirm.userId });
                }
              }}
            >
              {removeConfirm?.kind === "team"
                ? "Remove from this team"
                : removeConfirm?.kind === "workspace"
                  ? "Remove from entire workspace"
                  : "Remove from subscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </FeatureGate>
  );
}
