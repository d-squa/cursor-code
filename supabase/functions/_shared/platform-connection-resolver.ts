interface ConnectedPlatformRecord {
  id: string;
  user_id: string;
  team_id: string | null;
  access_token: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  metadata: Record<string, any> | null;
  token_expires_at: string | null;
  updated_at: string | null;
}

const PLATFORM_SELECT = "id, user_id, team_id, access_token, ad_account_id, ad_account_name, metadata, token_expires_at, updated_at";

function normalizeExternalId(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/[-\s]/g, "").trim();
}

function normalizeMetaAdAccountId(value: string | number | null | undefined): string {
  return normalizeExternalId(value).replace(/^act_/i, "");
}

function isAccessibleRecord(
  record: { user_id?: string | null; team_id?: string | null },
  userId: string,
  teamIds: string[],
): boolean {
  if (record.user_id && record.user_id === userId) {
    return true;
  }

  if (record.team_id && teamIds.includes(record.team_id)) {
    return true;
  }

  return false;
}

function getUpdatedAtScore(value: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function dedupePlatforms(platforms: ConnectedPlatformRecord[]): ConnectedPlatformRecord[] {
  const seen = new Set<string>();

  return platforms.filter((platform) => {
    if (seen.has(platform.id)) {
      return false;
    }

    seen.add(platform.id);
    return true;
  });
}

function metadataHasTikTokAdvertiser(metadata: Record<string, any> | null, advertiserId: string): boolean {
  const normalizedAdvertiserId = normalizeExternalId(advertiserId);
  const accounts = Array.isArray(metadata?.accounts) ? metadata.accounts : [];

  return accounts.some((account: any) => {
    const candidateIds = [
      account?.advertiser_id,
      account?.advertiserId,
      account?.account_id,
      account?.accountId,
      account?.id,
    ];

    return candidateIds.some((candidateId) => normalizeExternalId(candidateId) === normalizedAdvertiserId);
  });
}

async function getAccessibleTeamIds(supabase: any, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("team_id")
    .eq("user_id", userId)
    .not("team_id", "is", null);

  if (error) {
    console.error("Failed to load user team memberships:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row: { team_id: string | null }) => row.team_id)
    .filter((teamId: string | null): teamId is string => Boolean(teamId));
}

async function getActivePlatformConnections(
  supabase: any,
  userId: string,
  platformType: string,
  teamIds: string[],
): Promise<ConnectedPlatformRecord[]> {
  let query = supabase
    .from("connected_platforms")
    .select(PLATFORM_SELECT)
    .eq("platform_type", platformType)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (teamIds.length > 0) {
    const scopedFilters = [
      `user_id.eq.${userId}`,
      ...teamIds.map((teamId) => `team_id.eq.${teamId}`),
    ];

    query = query.or(scopedFilters.join(","));
  } else {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`Failed to load ${platformType} platform connections:`, error.message);
    return [];
  }

  return dedupePlatforms(data ?? []);
}

export async function getGooglePlatformCandidatesForCustomer(
  supabase: any,
  userId: string,
  customerId: string,
): Promise<ConnectedPlatformRecord[]> {
  const normalizedCustomerId = normalizeExternalId(customerId);
  const teamIds = await getAccessibleTeamIds(supabase, userId);

  const { data: googleAccounts, error: accountError } = await supabase
    .from("google_ad_accounts")
    .select("platform_id, user_id, team_id, customer_id")
    .eq("customer_id", normalizedCustomerId);

  if (accountError) {
    console.error("Failed to load Google ad account mapping:", accountError.message);
  }

  const accessibleAccounts = (googleAccounts ?? []).filter((account: any) =>
    isAccessibleRecord(account, userId, teamIds),
  );

  const preferredPlatformIds = new Set<string>(
    accessibleAccounts
      .map((account: any) => account.platform_id)
      .filter((platformId: string | null): platformId is string => Boolean(platformId)),
  );

  const platformCandidates = await getActivePlatformConnections(supabase, userId, "google", teamIds);

  return platformCandidates.sort((a, b) => {
    const aScore = preferredPlatformIds.has(a.id)
      ? 300
      : normalizeExternalId(a.ad_account_id) === normalizedCustomerId
        ? 200
        : 0;
    const bScore = preferredPlatformIds.has(b.id)
      ? 300
      : normalizeExternalId(b.ad_account_id) === normalizedCustomerId
        ? 200
        : 0;

    if (bScore !== aScore) {
      return bScore - aScore;
    }

    return getUpdatedAtScore(b.updated_at) - getUpdatedAtScore(a.updated_at);
  });
}

export async function getTikTokPlatformCandidatesForAdvertiser(
  supabase: any,
  userId: string,
  advertiserId: string,
): Promise<ConnectedPlatformRecord[]> {
  const normalizedAdvertiserId = normalizeExternalId(advertiserId);
  const teamIds = await getAccessibleTeamIds(supabase, userId);

  const { data: tiktokAccounts, error: accountError } = await supabase
    .from("tiktok_ad_accounts")
    .select("user_id, team_id, advertiser_id, account_id")
    .eq("advertiser_id", normalizedAdvertiserId);

  if (accountError) {
    console.error("Failed to load TikTok ad account mapping:", accountError.message);
  }

  const hasAccessibleAccount = (tiktokAccounts ?? []).some((account: any) =>
    isAccessibleRecord(account, userId, teamIds),
  );

  const platformCandidates = await getActivePlatformConnections(supabase, userId, "tiktok", teamIds);

  return platformCandidates.sort((a, b) => {
    const aScore = normalizeExternalId(a.ad_account_id) === normalizedAdvertiserId
      ? 300
      : metadataHasTikTokAdvertiser(a.metadata, normalizedAdvertiserId)
        ? 250
        : hasAccessibleAccount && isAccessibleRecord(a, userId, teamIds)
          ? 100
          : 0;
    const bScore = normalizeExternalId(b.ad_account_id) === normalizedAdvertiserId
      ? 300
      : metadataHasTikTokAdvertiser(b.metadata, normalizedAdvertiserId)
        ? 250
        : hasAccessibleAccount && isAccessibleRecord(b, userId, teamIds)
          ? 100
          : 0;

    if (bScore !== aScore) {
      return bScore - aScore;
    }

    return getUpdatedAtScore(b.updated_at) - getUpdatedAtScore(a.updated_at);
  });
}

export async function getMetaPlatformCandidatesForAdAccount(
  supabase: any,
  userId: string,
  adAccountId?: string,
): Promise<ConnectedPlatformRecord[]> {
  const normalizedAdAccountId = normalizeMetaAdAccountId(adAccountId);
  const teamIds = await getAccessibleTeamIds(supabase, userId);
  const platformCandidates = await getActivePlatformConnections(supabase, userId, "meta", teamIds);

  if (!normalizedAdAccountId) {
    return platformCandidates;
  }

  const adAccountVariants = [`act_${normalizedAdAccountId}`, normalizedAdAccountId];
  const { data: metaAccounts, error: accountError } = await supabase
    .from("meta_ad_accounts")
    .select("platform_id, user_id, team_id, account_id")
    .in("account_id", adAccountVariants);

  if (accountError) {
    console.error("Failed to load Meta ad account mapping:", accountError.message);
  }

  const accessibleAccounts = (metaAccounts ?? []).filter((account: any) =>
    isAccessibleRecord(account, userId, teamIds),
  );

  const preferredPlatformIds = new Set<string>(
    accessibleAccounts
      .map((account: any) => account.platform_id)
      .filter((platformId: string | null): platformId is string => Boolean(platformId)),
  );

  const hasAccessibleAccountMatch = accessibleAccounts.some(
    (account: any) => normalizeMetaAdAccountId(account.account_id) === normalizedAdAccountId,
  );

  return platformCandidates.sort((a, b) => {
    const aScore = preferredPlatformIds.has(a.id)
      ? 400
      : normalizeMetaAdAccountId(a.ad_account_id) === normalizedAdAccountId
        ? 300
        : hasAccessibleAccountMatch && isAccessibleRecord(a, userId, teamIds)
          ? 100
          : 0;
    const bScore = preferredPlatformIds.has(b.id)
      ? 400
      : normalizeMetaAdAccountId(b.ad_account_id) === normalizedAdAccountId
        ? 300
        : hasAccessibleAccountMatch && isAccessibleRecord(b, userId, teamIds)
          ? 100
          : 0;

    if (bScore !== aScore) {
      return bScore - aScore;
    }

    return getUpdatedAtScore(b.updated_at) - getUpdatedAtScore(a.updated_at);
  });
}
