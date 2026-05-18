import { getAccessToken, getAccessTokenWithRefresh } from "./vault-helper.ts";

export type PlatformConnectionType = "meta" | "tiktok" | "google";

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

async function getAccessibleTeamIds(
  supabase: any,
  userId: string,
  extraTeamIds: string[] = [],
): Promise<string[]> {
  const teamIds = new Set<string>(extraTeamIds.filter(Boolean));

  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("team_id")
    .eq("user_id", userId)
    .not("team_id", "is", null);

  if (rolesError) {
    console.error("Failed to load user team memberships:", rolesError.message);
  } else {
    for (const row of roleRows ?? []) {
      if (row.team_id) teamIds.add(row.team_id);
    }
  }

  const { data: ownedTeams } = await supabase
    .from("teams")
    .select("id")
    .eq("owner_id", userId);

  for (const team of ownedTeams ?? []) {
    if (team.id) teamIds.add(team.id);
  }

  const { data: subscriptionRows } = await supabase
    .from("workspace_subscription_members")
    .select("workspace_id")
    .eq("user_id", userId);

  const workspaceIds = (subscriptionRows ?? [])
    .map((row: { workspace_id: string | null }) => row.workspace_id)
    .filter((workspaceId: string | null): workspaceId is string => Boolean(workspaceId));

  if (workspaceIds.length > 0) {
    const { data: workspaceTeams } = await supabase
      .from("teams")
      .select("id")
      .in("workspace_id", workspaceIds);

    for (const team of workspaceTeams ?? []) {
      if (team.id) teamIds.add(team.id);
    }
  }

  return [...teamIds];
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

export function resolvePlatformConnectionType(platformName: string): PlatformConnectionType | null {
  const normalized = String(platformName || "").toLowerCase();
  if (normalized.includes("meta") || normalized.includes("facebook") || normalized.includes("instagram")) {
    return "meta";
  }
  if (normalized.includes("tiktok")) {
    return "tiktok";
  }
  if (normalized.includes("google")) {
    return "google";
  }
  return null;
}

export function inferAccountExternalIdFromMarkets(
  platformType: PlatformConnectionType,
  markets: Record<string, unknown>,
): string | undefined {
  for (const market of Object.values(markets ?? {})) {
    const marketRecord = market as Record<string, unknown>;
    if (platformType === "meta") {
      const accountId = marketRecord.adAccountId ?? marketRecord.ad_account_id;
      if (accountId) return String(accountId);
    }
    if (platformType === "tiktok") {
      const advertiserId = marketRecord.advertiserId ?? marketRecord.advertiser_id ?? marketRecord.ad_account_id;
      if (advertiserId) return String(advertiserId);
    }
    if (platformType === "google") {
      const customerId = marketRecord.googleCustomerId ?? marketRecord.adAccountId ?? marketRecord.ad_account_id;
      if (customerId) return String(customerId).replace(/-/g, "");
    }
  }
  return undefined;
}

async function loadPlatformCandidates(
  supabase: any,
  userId: string,
  platformType: PlatformConnectionType,
  accountExternalId: string | undefined,
  campaignTeamId?: string | null,
): Promise<ConnectedPlatformRecord[]> {
  if (platformType === "meta") {
    return getMetaPlatformCandidatesForAdAccount(supabase, userId, accountExternalId, campaignTeamId);
  }
  if (platformType === "tiktok") {
    return getTikTokPlatformCandidatesForAdvertiser(
      supabase,
      userId,
      accountExternalId ?? "",
      campaignTeamId,
    );
  }
  return getGooglePlatformCandidatesForCustomer(
    supabase,
    userId,
    accountExternalId ?? "",
    campaignTeamId,
  );
}

/** Pick the first connected_platforms row that has a readable Vault (or legacy) access token. */
export async function resolveConnectedPlatformWithAccessToken(
  supabase: any,
  params: {
    userId: string;
    platformType: PlatformConnectionType;
    campaignTeamId?: string | null;
    accountExternalId?: string;
    /** User performing the push (admin/collaborator) — may access team-scoped tokens the owner cannot. */
    additionalUserId?: string;
    /** Rows already loaded (owner/user/team); tried after ranked resolver candidates. */
    extraCandidates?: ConnectedPlatformRecord[];
  },
): Promise<(ConnectedPlatformRecord & { access_token: string }) | null> {
  const seen = new Set<string>();
  const candidates: ConnectedPlatformRecord[] = [];

  const addCandidates = (batch: ConnectedPlatformRecord[]) => {
    for (const row of batch) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        candidates.push(row);
      }
    }
  };

  const userIds = [params.userId];
  if (params.additionalUserId && params.additionalUserId !== params.userId) {
    userIds.push(params.additionalUserId);
  }

  for (const uid of userIds) {
    addCandidates(
      await loadPlatformCandidates(
        supabase,
        uid,
        params.platformType,
        params.accountExternalId,
        params.campaignTeamId,
      ),
    );
  }

  if (params.extraCandidates?.length) {
    const platformType = params.platformType;
    addCandidates(
      params.extraCandidates.filter((row) => {
        const rowType = String((row as ConnectedPlatformRecord & { platform_type?: string }).platform_type || "")
          .toLowerCase();
        return rowType === platformType;
      }),
    );
  }

  for (const candidate of candidates) {
    const accessToken = params.platformType === "google"
      ? await getAccessTokenWithRefresh(supabase, candidate.id, candidate.access_token, "google")
      : await getAccessToken(supabase, candidate.id, candidate.access_token);

    if (accessToken) {
      console.log(
        `Resolved ${params.platformType} access token via connected_platforms.id=${candidate.id} (team_id=${candidate.team_id ?? "none"}, user_id=${candidate.user_id ?? "none"})`,
      );
      return { ...candidate, access_token: accessToken };
    }
  }

  console.warn(
    `No ${params.platformType} access token among ${candidates.length} candidate connection(s) for user(s) ${userIds.join(", ")}`,
  );
  return null;
}

export async function resolveHasActivePlatformToken(
  supabase: any,
  userId: string,
  platformType: "meta" | "tiktok",
  accountExternalId: string | undefined,
  campaignTeamId?: string | null,
): Promise<boolean> {
  const candidates =
    platformType === "meta"
      ? await getMetaPlatformCandidatesForAdAccount(
        supabase,
        userId,
        accountExternalId,
        campaignTeamId,
      )
      : await getTikTokPlatformCandidatesForAdvertiser(
        supabase,
        userId,
        accountExternalId ?? "",
        campaignTeamId,
      );

  for (const candidate of candidates) {
    const token = await getAccessToken(supabase, candidate.id, candidate.access_token);
    if (token) {
      console.log(
        `Resolved ${platformType} access token via connected_platforms.id=${candidate.id} (team_id=${candidate.team_id ?? "none"})`,
      );
      return true;
    }
  }

  console.log(
    `No ${platformType} access token among ${candidates.length} candidate connection(s) for user ${userId}`,
  );
  return false;
}

export async function getGooglePlatformCandidatesForCustomer(
  supabase: any,
  userId: string,
  customerId: string,
  campaignTeamId?: string | null,
): Promise<ConnectedPlatformRecord[]> {
  const normalizedCustomerId = normalizeExternalId(customerId);
  const teamIds = await getAccessibleTeamIds(
    supabase,
    userId,
    campaignTeamId ? [campaignTeamId] : [],
  );

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
  campaignTeamId?: string | null,
): Promise<ConnectedPlatformRecord[]> {
  const normalizedAdvertiserId = normalizeExternalId(advertiserId);
  const teamIds = await getAccessibleTeamIds(
    supabase,
    userId,
    campaignTeamId ? [campaignTeamId] : [],
  );

  let tiktokAccountQuery = supabase
    .from("tiktok_ad_accounts")
    .select("user_id, team_id, advertiser_id, account_id, platform_id")
    .eq("advertiser_id", normalizedAdvertiserId);

  if (campaignTeamId) {
    tiktokAccountQuery = tiktokAccountQuery.eq("team_id", campaignTeamId);
  }

  const { data: tiktokAccounts, error: accountError } = await tiktokAccountQuery;

  if (accountError) {
    console.error("Failed to load TikTok ad account mapping:", accountError.message);
  }

  const accessibleAccounts = (tiktokAccounts ?? []).filter((account: any) =>
    isAccessibleRecord(account, userId, teamIds),
  );

  const preferredPlatformIds = new Set<string>(
    accessibleAccounts
      .map((account: any) => account.platform_id)
      .filter((platformId: string | null): platformId is string => Boolean(platformId)),
  );

  const hasAccessibleAccount = accessibleAccounts.length > 0;

  const platformCandidates = await getActivePlatformConnections(supabase, userId, "tiktok", teamIds);

  return platformCandidates.sort((a, b) => {
    const aScore = preferredPlatformIds.has(a.id)
      ? 400
      : normalizeExternalId(a.ad_account_id) === normalizedAdvertiserId
      ? 300
      : metadataHasTikTokAdvertiser(a.metadata, normalizedAdvertiserId)
        ? 250
        : hasAccessibleAccount && isAccessibleRecord(a, userId, teamIds)
          ? 100
          : 0;
    const bScore = preferredPlatformIds.has(b.id)
      ? 400
      : normalizeExternalId(b.ad_account_id) === normalizedAdvertiserId
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
  campaignTeamId?: string | null,
): Promise<ConnectedPlatformRecord[]> {
  const normalizedAdAccountId = normalizeMetaAdAccountId(adAccountId);
  const teamIds = await getAccessibleTeamIds(
    supabase,
    userId,
    campaignTeamId ? [campaignTeamId] : [],
  );
  const platformCandidates = await getActivePlatformConnections(supabase, userId, "meta", teamIds);

  if (!normalizedAdAccountId) {
    return platformCandidates;
  }

  const adAccountVariants = [`act_${normalizedAdAccountId}`, normalizedAdAccountId];
  let metaAccountQuery = supabase
    .from("meta_ad_accounts")
    .select("platform_id, user_id, team_id, account_id")
    .in("account_id", adAccountVariants);

  if (campaignTeamId) {
    metaAccountQuery = metaAccountQuery.eq("team_id", campaignTeamId);
  }

  const { data: metaAccounts, error: accountError } = await metaAccountQuery;

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
