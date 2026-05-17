import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";

export type SubscriptionMember = {
  id: string;
  email: string;
  company_name: string | null;
  subscription_role: string;
  team_names: string[];
};

/** Subscription roster for a billing workspace (Settings → Subscription Users). */
export async function fetchSubscriptionMembers(workspaceId: string): Promise<SubscriptionMember[]> {
  const { data: rows, error: rpcErr } = await supabase.rpc("get_workspace_member_summaries", {
    p_workspace_id: workspaceId,
  });

  if (!rpcErr && rows) {
    return (rows ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      company_name: row.company_name,
      subscription_role: String(row.role ?? "member"),
      team_names: (row as { team_names?: string[] }).team_names ?? [],
    }));
  }

  return fetchSubscriptionMembersFromTables(workspaceId);
}

async function fetchSubscriptionMembersFromTables(workspaceId: string): Promise<SubscriptionMember[]> {
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
  const teamIds = teamList.map((t) => t.id).filter(Boolean);
  const teamNameById = new Map(teamList.map((t) => [t.id, t.name]));

  const { data: wsRow, error: wsErr } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();
  if (wsErr) throw wsErr;
  const billingOwnerId = wsRow?.owner_id as string | undefined;

  const subByUser = new Map<string, string>();
  (subs ?? []).forEach((r) => subByUser.set(r.user_id, r.role));

  let teamRoles: { user_id: string; team_id: string }[] = [];
  if (teamIds.length > 0) {
    const { data: tr, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, team_id")
      .in("team_id", teamIds);
    if (rolesError) throw rolesError;
    teamRoles = tr ?? [];
  }

  const userIds = new Set<string>();
  subByUser.forEach((_r, uid) => userIds.add(uid));
  if (billingOwnerId) userIds.add(billingOwnerId);
  if (userIds.size === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, company_name")
    .in("id", [...userIds]);
  if (profilesError) throw profilesError;

  const teamNamesByUser = new Map<string, Set<string>>();
  teamRoles.forEach((r) => {
    const nm = teamNameById.get(r.team_id);
    if (!nm) return;
    const set = teamNamesByUser.get(r.user_id) ?? new Set<string>();
    set.add(nm);
    teamNamesByUser.set(r.user_id, set);
  });

  return (profiles ?? [])
    .filter((p) => subByUser.has(p.id) || (billingOwnerId && p.id === billingOwnerId))
    .map((p) => ({
      id: p.id,
      email: p.email,
      company_name: p.company_name,
      subscription_role: billingOwnerId && p.id === billingOwnerId ? "owner" : subByUser.get(p.id) ?? "member",
      team_names: Array.from(teamNamesByUser.get(p.id) ?? []).sort(),
    }));
}

export const TEAM_ASSIGNABLE_ROLES: Enums<"app_role">[] = [
  "admin",
  "campaign_manager",
  "collaborator",
  "member",
  "viewer",
];

export function formatSubscriptionRoleLabel(role: string): string {
  return role.replace(/_/g, " ");
}
