export interface Market {
  id: string;
  name: string;
  budgetPercentage: number;
  phases?: Phase[];
  useGlobalFunnel?: boolean;
  adFormats?: string[];
  accountName?: string;
  adAccountId?: string; // Meta Ad Account ID or TikTok Advertiser ID
  page?: string;
  pageId?: string; // Meta Page ID
  pixel?: string; // Meta Pixel ID
  catalog?: string; // Meta Catalog ID
  productSet?: string; // Meta Product Set ID
  conversionEvent?: string; // Conversion event for conversion campaigns
  // TikTok-specific fields
  tiktokPixel?: string; // TikTok Pixel ID
  tiktokIdentity?: string; // TikTok Account/Identity ID
  tiktokCatalog?: string; // TikTok Catalog ID
  tiktokProductSet?: string; // TikTok Product Set ID
  tiktokOptimizationEvent?: string; // TikTok Optimization Event
  strategy?: string; // Strategy type per market
  strategyFocus?: string;
  instagramActorId?: string;
  // Campaign settings
  isCBOEnabled?: boolean;
  isLifetimeBudget?: boolean;
  // Targeting settings
  countries?: string[];
  gender?: string;
  languages?: number[];
  ageMin?: number;
  ageMax?: number;
  publisherPlatforms?: string[];
  positions?: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  };
  detailedTargeting?: Array<{ id: string; type: string; name?: string }>;
}

export interface FunnelStage {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetPercentage: number;
}

export interface Phase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetPercentage: number;
  assetTypes?: string[];
  isLoyaltyPhase?: boolean;
  objective?: string;
  optimizationGoal?: string;
  funnelStage?: string;
  budgetType?: "daily" | "lifetime";
  // Campaign-level overrides (inherits from market/generic if not set)
  publisherPlatforms?: string[];
  positions?: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  };
  countries?: string[];
  gender?: string;
  languages?: number[];
  ageMin?: number;
  ageMax?: number;
  detailedTargeting?: Array<{ id: string; type: string; name?: string }>;
  audiences?: Array<{
    id: string;
    name: string;
    type: string;
    source: string;
    subtype?: string;
    approximate_count?: number;
  }>;
}

export interface Campaign {
  id: string;
  name: string;
  budgetPercentage: number;
  objective?: string;
  funnelStage?: string;
}

export interface PlatformWithMarkets {
  id: string;
  name: string;
  enabled: boolean;
  budgetPercentage: number;
  markets: Market[];
}
