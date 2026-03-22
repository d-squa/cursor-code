export type SearchStrategy = "brand" | "generic" | "competition";

export interface SearchKeywordLike {
  platform?: string | null;
  market?: string | null;
  avgMonthlySearches?: number | null;
  strategy?: string | null;
  isNegative?: boolean | null;
}

export interface SearchStrategyGroup<TKeyword extends SearchKeywordLike = SearchKeywordLike> {
  strategy: SearchStrategy;
  label: string;
  positives: TKeyword[];
  negatives: TKeyword[];
  totalVolume: number;
  budgetShare: number;
  budgetPercentage: number;
}

const STRATEGY_LABELS: Record<SearchStrategy, string> = {
  brand: "Brand",
  generic: "Generic",
  competition: "Competition",
};

const STRATEGIES: SearchStrategy[] = ["brand", "generic", "competition"];

const normalizeValue = (value?: string | null) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const normalizePlatform = (platformId?: string | null): "google" | "tiktok" | null => {
  const value = String(platformId || "").toLowerCase();
  if (value.includes("google")) return "google";
  if (value.includes("tiktok")) return "tiktok";
  return null;
};

const extractKeywordArray = <TKeyword extends SearchKeywordLike>(value: unknown): TKeyword[] =>
  Array.isArray(value) ? (value as TKeyword[]) : [];

const getMarketIdentifiers = (market?: unknown): Set<string> => {
  const identifiers = new Set<string>();

  const addIdentifier = (value?: string | null) => {
    const normalized = normalizeValue(value);
    if (normalized) identifiers.add(normalized);
  };

  if (typeof market === "string") {
    addIdentifier(market);
    return identifiers;
  }

  if (market && typeof market === "object") {
    const marketRecord = market as Record<string, unknown>;
    [
      marketRecord.id,
      marketRecord.name,
      marketRecord.marketName,
      marketRecord.marketCode,
      marketRecord.code,
      marketRecord.countryCode,
      marketRecord.label,
    ].forEach((value) => addIdentifier(typeof value === "string" ? value : undefined));
  }

  return identifiers;
};

const matchesMarket = (keywordMarket: string | null | undefined, market?: unknown) => {
  if (!keywordMarket) return true;

  const identifiers = getMarketIdentifiers(market);
  if (identifiers.size === 0) return true;

  return identifiers.has(normalizeValue(keywordMarket));
};

export const isSearchPhaseLike = ({
  platformId,
  phase,
}: {
  platformId?: string | null;
  phase?: Record<string, unknown> | null;
}) => {
  const normalizedPlatform = normalizePlatform(platformId);
  const googleCampaignType = String(
    phase?.googleCampaignType || phase?.campaignType || "",
  ).toLowerCase();
  const tiktokCampaignType = String(phase?.tiktokCampaignType || "").toLowerCase();
  const hasTikTokSearchToggle = phase?.tiktokSearchEnabled === true || phase?.searchEnabled === true;

  if (normalizedPlatform === "google") {
    return googleCampaignType === "search" || googleCampaignType.includes("search");
  }

  if (normalizedPlatform === "tiktok") {
    return hasTikTokSearchToggle || tiktokCampaignType === "search" || tiktokCampaignType.includes("search");
  }

  return String(phase?.name || "").toLowerCase().includes("search");
};

export function getEffectiveSearchKeywords<TKeyword extends SearchKeywordLike>({
  keywords,
  platformId,
  market,
  phase,
}: {
  keywords?: TKeyword[];
  platformId?: string | null;
  market?: Record<string, unknown> | null;
  phase?: Record<string, unknown> | null;
}): TKeyword[] {
  const normalizedPlatform = normalizePlatform(platformId);

  const filterKeywords = (items: TKeyword[]) =>
    items.filter((keyword) => {
      const keywordPlatform = normalizePlatform(keyword.platform);
      const platformMatches = !normalizedPlatform || !keyword.platform || keywordPlatform === normalizedPlatform;
      return platformMatches && matchesMarket(keyword.market, market);
    });

  const phaseKeywords = filterKeywords([
    ...extractKeywordArray<TKeyword>(phase?.keywords),
    ...extractKeywordArray<TKeyword>(phase?.searchKeywords),
    ...extractKeywordArray<TKeyword>(phase?.selectedKeywords),
  ]);

  if (phaseKeywords.length > 0) return phaseKeywords;

  const marketKeywords = filterKeywords([
    ...extractKeywordArray<TKeyword>(market?.keywords),
    ...extractKeywordArray<TKeyword>(market?.searchKeywords),
    ...extractKeywordArray<TKeyword>(market?.selectedKeywords),
  ]);

  if (marketKeywords.length > 0) return marketKeywords;

  return filterKeywords(keywords || []);
}

export const buildSearchStrategyCampaignName = (phaseName: string, strategyLabel: string) =>
  `${phaseName} - ${strategyLabel}`;

export function getSearchStrategyGroups<TKeyword extends SearchKeywordLike>({
  keywords,
  platformId,
  market,
}: {
  keywords?: TKeyword[];
  platformId?: string | null;
  market?: unknown;
}): SearchStrategyGroup<TKeyword>[] {
  const normalizedPlatform = normalizePlatform(platformId);
  if (!normalizedPlatform || !keywords?.length) return [];

  const platformKeywords = keywords.filter(
    (keyword) => normalizePlatform(keyword.platform) === normalizedPlatform,
  );

  const marketKeywords = platformKeywords.filter((keyword) => matchesMarket(keyword.market, market));

  const groups = STRATEGIES.map((strategy) => {
    const positives = marketKeywords.filter(
      (keyword) => keyword.strategy === strategy && !keyword.isNegative,
    );
    const negatives = marketKeywords.filter(
      (keyword) => keyword.strategy === strategy && !!keyword.isNegative,
    );
    const totalVolume = positives.reduce(
      (sum, keyword) => sum + Number(keyword.avgMonthlySearches || 0),
      0,
    );

    return {
      strategy,
      label: STRATEGY_LABELS[strategy],
      positives,
      negatives,
      totalVolume,
      budgetShare: 0,
      budgetPercentage: 0,
    } satisfies SearchStrategyGroup<TKeyword>;
  }).filter((group) => group.positives.length > 0 || group.negatives.length > 0);

  if (groups.length === 0) return [];

  const totalVolume = groups.reduce((sum, group) => sum + group.totalVolume, 0);
  const equalShare = 1 / groups.length;

  return groups.map((group) => {
    const budgetShare = totalVolume > 0 ? group.totalVolume / totalVolume : equalShare;
    return {
      ...group,
      budgetShare,
      budgetPercentage: Number((budgetShare * 100).toFixed(2)),
    };
  });
}