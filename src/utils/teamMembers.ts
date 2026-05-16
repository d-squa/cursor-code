import { supabase } from "@/integrations/supabase/client";

export type TeamMemberOption = {
  value: string;
  label: string;
};

/** Recipients for approval/notify flows — scoped to the campaign's workspace team only. */
export async function fetchTeamMemberOptionsForCampaign(
  campaignId: string,
  options?: { excludeCurrentUser?: boolean },
): Promise<{ members: TeamMemberOption[]; teamId: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { members: [], teamId: null };
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("team_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError) {
    throw campaignError;
  }

  if (!campaign?.team_id) {
    return { members: [], teamId: null };
  }

  let rolesQuery = supabase
    .from("user_roles")
    .select("user_id")
    .eq("team_id", campaign.team_id);

  if (options?.excludeCurrentUser !== false) {
    rolesQuery = rolesQuery.neq("user_id", user.id);
  }

  const { data: roleRows, error: rolesError } = await rolesQuery;
  if (rolesError) {
    throw rolesError;
  }

  const memberUserIds = [...new Set((roleRows ?? []).map((r) => r.user_id).filter(Boolean))];
  if (memberUserIds.length === 0) {
    return { members: [], teamId: campaign.team_id };
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, company_name")
    .in("id", memberUserIds);

  if (profilesError) {
    throw profilesError;
  }

  const members = (profiles ?? []).map((profile) => ({
    value: profile.email,
    label: profile.company_name || profile.email,
  }));

  return { members, teamId: campaign.team_id };
}
