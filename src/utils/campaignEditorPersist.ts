import type { PlatformWithMarkets } from "@/types/mediaplan";
import type { Market } from "@/types/mediaplan";

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

export function buildMarketSplitsFromPlatforms(platformsWithMarkets: PlatformWithMarkets[]) {
  return getSelectedPlatformsWithMarkets(platformsWithMarkets).reduce(
    (acc, platform) => {
      acc[platform.id] = platform.markets.map(mapMarketForCampaignPersist);
      return acc;
    },
    {} as Record<string, ReturnType<typeof mapMarketForCampaignPersist>[]>,
  );
}
