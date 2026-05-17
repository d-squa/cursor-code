/** Verify the user may use a team-scoped resource (member, owner, or subscription roster). */
export async function assertUserCanAccessTeam(
  supabase: { from: (table: string) => any },
  userId: string,
  teamId: string,
): Promise<void> {
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, owner_id, workspace_id")
    .eq("id", teamId)
    .maybeSingle();

  if (teamError || !team) {
    throw new Error("Workspace not found");
  }

  if (team.owner_id === userId) {
    return;
  }

  const { data: teamRole } = await supabase
    .from("user_roles")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (teamRole) {
    return;
  }

  if (team.workspace_id) {
    const { data: subMember } = await supabase
      .from("workspace_subscription_members")
      .select("workspace_id")
      .eq("workspace_id", team.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (subMember) {
      return;
    }
  }

  throw new Error("Not authorized for this workspace");
}

export function teamScopedPlatformFields(teamId: string | null | undefined): { team_id?: string } {
  return teamId ? { team_id: teamId } : {};
}

type PlatformAccessRow = {
  user_id: string;
  team_id: string | null;
};

/** Caller may use a connection they created or one shared on their team. */
export async function assertUserCanUsePlatform(
  supabase: { from: (table: string) => any },
  userId: string,
  platform: PlatformAccessRow,
): Promise<void> {
  if (platform.user_id === userId) {
    return;
  }

  if (platform.team_id) {
    await assertUserCanAccessTeam(supabase, userId, platform.team_id);
    return;
  }

  throw new Error("Platform connection not found or inactive");
}

/** Disconnect/reconnect: creator or team/subscription admin on a shared connection. */
export async function assertUserCanManagePlatform(
  supabase: { from: (table: string) => any },
  userId: string,
  platform: PlatformAccessRow,
): Promise<void> {
  if (platform.user_id === userId) {
    return;
  }

  if (!platform.team_id) {
    throw new Error("Platform not found or unauthorized");
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id, owner_id, workspace_id")
    .eq("id", platform.team_id)
    .maybeSingle();

  if (!team) {
    throw new Error("Platform not found or unauthorized");
  }

  if (team.owner_id === userId) {
    return;
  }

  const { data: teamRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("team_id", platform.team_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (teamRole?.role === "owner" || teamRole?.role === "admin") {
    return;
  }

  if (team.workspace_id) {
    const { data: subMember } = await supabase
      .from("workspace_subscription_members")
      .select("role")
      .eq("workspace_id", team.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (subMember?.role === "owner" || subMember?.role === "admin") {
      return;
    }
  }

  throw new Error("Platform not found or unauthorized");
}
