import { supabase } from "@/integrations/supabase/client";

export type TeamMemberOption = {
  value: string;
  label: string;
};

export type TeamMemberLoadResult = {
  members: TeamMemberOption[];
  /** Team used for the recipient list */
  teamId: string | null;
  teamName: string | null;
  /** Saved on campaigns.team_id */
  campaignTeamId: string | null;
  campaignTeamName: string | null;
  /** Workspace switcher (teams.id) when it differs from campaign team */
  switcherTeamId: string | null;
  switcherTeamName: string | null;
  campaignTeamMismatch: boolean;
};

type TeamRosterRow = {
  user_id: string;
  email: string;
  label: string;
};

async function loadTeamName(teamId: string): Promise<string | null> {
  const { data } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  return data?.name ?? null;
}

/**
 * Same member set as Settings → Manage Your Team (Teams.tsx):
 * user_roles for the team, plus team owner when they have no role row.
 */
export async function fetchTeamRosterMatchingTeamsPage(teamId: string): Promise<TeamRosterRow[]> {
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, owner_id")
    .eq("id", teamId)
    .maybeSingle();

  if (teamError) throw teamError;
  if (!team) return [];

  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("team_id", teamId);

  if (rolesError) throw rolesError;

  const userIds = new Set<string>((roleRows ?? []).map((r) => r.user_id).filter(Boolean));

  if (team.owner_id && !userIds.has(team.owner_id)) {
    userIds.add(team.owner_id);
  }

  if (userIds.size === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, company_name")
    .in("id", [...userIds]);

  if (profilesError) throw profilesError;

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return [...userIds].map((userId) => {
    const profile = byId.get(userId);
    const email = profile?.email ?? userId;
    return {
      user_id: userId,
      email,
      label: profile?.company_name || email,
    };
  });
}

/** Approval recipients: exact team roster via RPC (bypasses RLS/client drift). */
export async function fetchTeamMemberOptionsForTeam(
  teamId: string,
): Promise<{ members: TeamMemberOption[]; teamId: string }> {
  const { data: rpcRows, error: rpcError } = await supabase.rpc("get_team_approval_recipients", {
    p_team_id: teamId,
  });

  if (!rpcError && rpcRows) {
    const seen = new Set<string>();
    const members: TeamMemberOption[] = [];
    for (const row of rpcRows) {
      const email = row.email?.trim();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      members.push({ value: email, label: row.display_label || email });
    }
    return { members, teamId };
  }

  if (rpcError) {
    console.warn(
      "[teamMembers] get_team_approval_recipients failed; using client roster. Apply migration 20260516190000.",
      rpcError.message,
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roster = await fetchTeamRosterMatchingTeamsPage(teamId);
  const seen = new Set<string>();
  const members: TeamMemberOption[] = [];
  for (const row of roster) {
    if (user?.id && row.user_id === user.id) continue;
    if (!row.email || seen.has(row.email)) continue;
    seen.add(row.email);
    members.push({ value: row.email, label: row.label });
  }

  return { members, teamId };
}

/**
 * Approval recipients for an ActiPlan: always the team saved on the campaign row.
 * The workspace switcher is shown only for mismatch warnings (not as the recipient source).
 */
export async function fetchTeamMemberOptionsForCampaign(
  workspaceTeamId: string | null | undefined,
  campaignId?: string,
): Promise<TeamMemberLoadResult> {
  const switcherTeamId = workspaceTeamId?.trim() || null;
  let switcherTeamName: string | null = null;
  if (switcherTeamId) {
    switcherTeamName = await loadTeamName(switcherTeamId);
  }

  let campaignTeamId: string | null = null;
  let campaignTeamName: string | null = null;

  if (campaignId) {
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("team_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError) throw campaignError;

    campaignTeamId = campaign?.team_id ?? null;
    if (campaignTeamId) {
      campaignTeamName = await loadTeamName(campaignTeamId);
    }
  }

  const teamId = campaignTeamId ?? switcherTeamId;
  const campaignTeamMismatch = Boolean(
    campaignTeamId && switcherTeamId && campaignTeamId !== switcherTeamId,
  );

  if (!teamId) {
    return {
      members: [],
      teamId: null,
      teamName: null,
      campaignTeamId,
      campaignTeamName,
      switcherTeamId,
      switcherTeamName,
      campaignTeamMismatch: false,
    };
  }

  const teamName = campaignTeamName ?? switcherTeamName ?? (await loadTeamName(teamId));
  const { members } = await fetchTeamMemberOptionsForTeam(teamId);

  return {
    members,
    teamId,
    teamName,
    campaignTeamId,
    campaignTeamName,
    switcherTeamId,
    switcherTeamName,
    campaignTeamMismatch,
  };
}
