import { supabase } from "@/integrations/supabase/client";

export type TeamMemberOption = {
  value: string;
  label: string;
};

export type TeamMemberLoadResult = {
  members: TeamMemberOption[];
  teamId: string | null;
  teamName: string | null;
  campaignTeamMismatch: boolean;
};

type TeamRosterRow = {
  user_id: string;
  email: string;
  label: string;
};

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

/** Approval recipients: Teams-page roster minus the signed-in user. */
export async function fetchTeamMemberOptionsForTeam(
  teamId: string,
): Promise<{ members: TeamMemberOption[]; teamId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roster = await fetchTeamRosterMatchingTeamsPage(teamId);
  const members = roster
    .filter((row) => !user?.id || row.user_id !== user.id)
    .map((row) => ({ value: row.email, label: row.label }));

  return { members, teamId };
}

/**
 * Uses the workspace switcher team (teams.id) — not subscription-wide rosters.
 * Does not fall back to campaign.team_id when a workspace team is selected (fixes stale team_id).
 */
export async function fetchTeamMemberOptionsForCampaign(
  workspaceTeamId: string | null | undefined,
  campaignId?: string,
): Promise<TeamMemberLoadResult> {
  const teamId = workspaceTeamId?.trim() || null;
  let campaignTeamMismatch = false;

  if (campaignId && teamId) {
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("team_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError) throw campaignError;

    if (campaign?.team_id && campaign.team_id !== teamId) {
      campaignTeamMismatch = true;
      console.warn(
        "[teamMembers] ActiPlan team_id does not match workspace switcher; approval uses workspace team.",
        { campaignTeamId: campaign.team_id, workspaceTeamId: teamId },
      );
    }
  }

  if (!teamId) {
    return { members: [], teamId: null, teamName: null, campaignTeamMismatch: false };
  }

  const { data: team } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  const { members } = await fetchTeamMemberOptionsForTeam(teamId);

  return {
    members,
    teamId,
    teamName: team?.name ?? null,
    campaignTeamMismatch,
  };
}
