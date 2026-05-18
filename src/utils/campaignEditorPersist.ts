import type { PlatformWithMarkets } from "@/types/mediaplan";
import type { Market } from "@/types/mediaplan";
import { extensionMarketLockKey } from "@/utils/campaignLaunchLocks";

/** Serialize a market row for campaigns.market_splits (must stay in sync with MediaPlanEditor autosave). */
export function mapMarketForCampaignPersist(m: Market) {
  return {
    id: m.id,
    name: m.name,
    budgetPercentage: m.budgetPercentage,
    accountName: m.accountName,
    adAccountId: m.adAccountId,
    page: m.page,
    pageId: m.pageId,
    pixel: m.pixel,
    catalog: m.catalog,
    productSet: m.productSet,
    conversionEvent: m.conversionEvent,
    adFormats: m.adFormats,
    phases: m.phases,
    isCBOEnabled: m.isCBOEnabled,
    isLifetimeBudget: m.isLifetimeBudget,
    instagramActorId: m.instagramActorId,
    strategy: m.strategy,
    strategyFocus: m.strategyFocus,
    tiktokPixel: m.tiktokPixel,
    tiktokIdentity: m.tiktokIdentity,
    tiktokCatalog: m.tiktokCatalog,
    tiktokProductSet: m.tiktokProductSet,
    tiktokOptimizationEvent: m.tiktokOptimizationEvent,
    tiktokLandingPageUrl: m.tiktokLandingPageUrl,
    tiktokBidStrategy: m.tiktokBidStrategy,
    tiktokBidAmount: m.tiktokBidAmount,
    tiktokOptimizationLocation: m.tiktokOptimizationLocation,
    tiktokAppId: m.tiktokAppId,
    tiktokAppName: m.tiktokAppName,
    tiktokMessagingApp: (m as Record<string, unknown>).tiktokMessagingApp,
    tiktokFacebookPageId: (m as Record<string, unknown>).tiktokFacebookPageId,
    tiktokMessageEventSet: (m as Record<string, unknown>).tiktokMessageEventSet,
    tiktokWhatsappNumber: (m as Record<string, unknown>).tiktokWhatsappNumber,
    tiktokZaloAccountId: (m as Record<string, unknown>).tiktokZaloAccountId,
    tiktokLineBusinessId: (m as Record<string, unknown>).tiktokLineBusinessId,
    tiktokPlacementType: m.tiktokPlacementType,
    tiktokPlacements: m.tiktokPlacements,
    tiktokClickWindow: (m as Record<string, unknown>).tiktokClickWindow,
    tiktokViewWindow: (m as Record<string, unknown>).tiktokViewWindow,
    metaBidStrategy: m.metaBidStrategy,
    metaBidAmount: m.metaBidAmount,
    metaOptimizationLocation: (m as Record<string, unknown>).metaOptimizationLocation,
    metaAppStore: (m as Record<string, unknown>).metaAppStore,
    metaAppId: (m as Record<string, unknown>).metaAppId,
    metaMessagingMode: (m as Record<string, unknown>).metaMessagingMode,
    metaMessengerEnabled: (m as Record<string, unknown>).metaMessengerEnabled,
    metaInstagramDmEnabled: (m as Record<string, unknown>).metaInstagramDmEnabled,
    metaWhatsappEnabled: (m as Record<string, unknown>).metaWhatsappEnabled,
    metaWhatsappNumber: (m as Record<string, unknown>).metaWhatsappNumber,
    metaLandingPageUrl: (m as Record<string, unknown>).metaLandingPageUrl,
    metaPublisherPlatforms: m.metaPublisherPlatforms || m.publisherPlatforms,
    metaPositions: m.metaPositions || m.positions,
    googleObjective: m.googleObjective,
    googleLandingPageUrl: m.googleLandingPageUrl,
    googleBidStrategy: m.googleBidStrategy,
    googleTargetCpa: m.googleTargetCpa,
    googleTargetRoas: m.googleTargetRoas,
    googleMaxCpcBid: m.googleMaxCpcBid,
  };
}

export function getSelectedPlatformsWithMarkets(platformsWithMarkets: PlatformWithMarkets[]) {
  return platformsWithMarkets.filter((p) => p.id !== "");
}

export function buildBudgetAllocationFromPlatforms(platformsWithMarkets: PlatformWithMarkets[]) {
  return getSelectedPlatformsWithMarkets(platformsWithMarkets).reduce(
    (acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }),
    {} as Record<string, number>,
  );
}

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  meta: "Meta",
  google: "Google Ads",
  google_ads: "Google Ads",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
  pinterest: "Pinterest",
};

/** Rebuild Step 1 platforms from campaigns row (platforms array and/or market_splits). */
export function restorePlatformsFromCampaignRecord(c: {
  platforms?: unknown;
  market_splits?: Record<string, unknown>;
  budget_allocation?: Record<string, number>;
}): PlatformWithMarkets[] {
  const alloc = c.budget_allocation || {};
  const splits = (c.market_splits || {}) as Record<string, Market[]>;
  const declared: any[] = Array.isArray(c.platforms) ? c.platforms : [];

  const mapMarkets = (platformId: string, markets: Market[]) => {
    if (platformId !== "tiktok") return markets;
    return markets.map((m) => {
      if (!Array.isArray((m as { countries?: string[] }).countries)) return m;
      return {
        ...m,
        countries: (m as { countries: string[] }).countries.filter((code) => code !== "US"),
      };
    });
  };

  if (declared.length > 0) {
    return declared.map((dp) => {
      const splitMarkets = splits[dp.id];
      const markets =
        Array.isArray(splitMarkets) && splitMarkets.length > 0
          ? splitMarkets
          : Array.isArray(dp.markets)
            ? dp.markets
            : [];
      return {
        id: dp.id,
        name: dp.name || PLATFORM_DISPLAY_NAMES[dp.id] || dp.id,
        enabled: true,
        budgetPercentage: alloc[dp.id] ?? dp.budgetPercentage ?? 0,
        markets: mapMarkets(dp.id, markets as Market[]),
      };
    });
  }

  const platformIds = Object.keys(splits).filter(Boolean);
  return platformIds.map((id) => ({
    id,
    name: PLATFORM_DISPLAY_NAMES[id] || id,
    enabled: true,
    budgetPercentage: alloc[id] ?? 0,
    markets: mapMarkets(id, (splits[id] || []) as Market[]),
  }));
}

export type ExtensionHydratedLockIds = {
  platformIds: Set<string>;
  marketIds: Set<string>;
};

export function buildExtensionLockIdsFromPlatforms(
  platforms: PlatformWithMarkets[],
): ExtensionHydratedLockIds {
  return {
    platformIds: new Set(platforms.map((p) => p.id).filter(Boolean) as string[]),
    marketIds: new Set(
      platforms.flatMap((p) =>
        p.id ? p.markets.map((m) => extensionMarketLockKey(p.id, m)) : [],
      ),
    ),
  };
}

function extensionLocksStorageKey(campaignId: string) {
  return `actiplan-extension-locks:${campaignId}`;
}

export function persistExtensionLockIds(campaignId: string, locks: ExtensionHydratedLockIds) {
  try {
    sessionStorage.setItem(
      extensionLocksStorageKey(campaignId),
      JSON.stringify({
        platformIds: [...locks.platformIds],
        marketIds: [...locks.marketIds],
      }),
    );
  } catch {
    /* ignore */
  }
}

export function loadExtensionLockIds(campaignId: string): ExtensionHydratedLockIds | null {
  try {
    const raw = sessionStorage.getItem(extensionLocksStorageKey(campaignId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { platformIds?: string[]; marketIds?: string[] };
    return {
      platformIds: new Set(parsed.platformIds || []),
      marketIds: new Set(parsed.marketIds || []),
    };
  } catch {
    return null;
  }
}

export function buildMarketSplitsFromPlatforms(platformsWithMarkets: PlatformWithMarkets[]) {
  return getSelectedPlatformsWithMarkets(platformsWithMarkets).reduce(
    (acc, platform) => {
      acc[platform.id] = platform.markets.map(mapMarketForCampaignPersist);
      return acc;
    },
    {} as Record<string, ReturnType<typeof mapMarketForCampaignPersist>[]>,
  );
}

/** Stable key for whether step-1 budget splits still match a saved forecast snapshot. */
export function buildPlanBudgetFingerprint(
  totalBudget: number,
  platformsWithMarkets: PlatformWithMarkets[],
): string {
  const selected = getSelectedPlatformsWithMarkets(platformsWithMarkets);
  return JSON.stringify({
    t: Math.round((totalBudget || 0) * 100) / 100,
    p: selected
      .map((p) => ({
        id: p.id,
        bp: Math.round((p.budgetPercentage || 0) * 10) / 10,
        m: (p.markets || []).map((m) => ({
          id: m.id,
          bp: Math.round((m.budgetPercentage || 0) * 10) / 10,
          pc: m.phases?.length ?? 0,
        })),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

/** True when current plan builder budgets match a stored forecast version snapshot. */
export function planBudgetMatchesSnapshot(
  currentTotalBudget: number,
  currentPlatforms: PlatformWithMarkets[],
  snapshotPlatforms: unknown,
  snapshotTotalBudget?: number | null,
): boolean {
  if (!snapshotPlatforms || !Array.isArray(snapshotPlatforms)) return false;
  const currentFp = buildPlanBudgetFingerprint(currentTotalBudget, currentPlatforms);
  const snapshotFp = buildPlanBudgetFingerprint(snapshotTotalBudget ?? currentTotalBudget, snapshotPlatforms as PlatformWithMarkets[]);
  return currentFp === snapshotFp;
}
