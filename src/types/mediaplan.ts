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
  tiktokLandingPageUrl?: string; // TikTok Landing Page URL
  tiktokBidStrategy?: string; // TikTok Bid Strategy (LOWEST_COST or COST_CAP)
  tiktokBidAmount?: number; // TikTok Bid Amount (required when bidStrategy is COST_CAP)
  tiktokOptimizationLocation?: string; // TikTok Optimization Location (Website, App, etc.)
  tiktokAppName?: string; // TikTok App Name for app campaigns
  tiktokAppId?: string; // TikTok App ID for app campaigns
  tiktokFrequencyEnabled?: boolean; // Whether frequency capping is enabled
  tiktokFrequencySchedule?: number; // Frequency schedule (impressions per period)
  tiktokClickWindow?: number; // Click-through attribution window in days
  tiktokViewWindow?: number; // View-through attribution window in days
  tiktokEventCount?: string; // Event count type: "every_conversion" or "once"
  tiktokSmartPlusEnabled?: boolean; // Whether Smart+ is enabled
  tiktokPlacementType?: string; // PLACEMENT_TYPE_AUTOMATIC or PLACEMENT_TYPE_NORMAL
  tiktokPlacements?: string[]; // Array of placement positions when manual
  metaBidStrategy?: string; // Meta Bid Strategy (LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP, etc.)
  metaBidAmount?: number; // Meta Bid Amount (required for LOWEST_COST_WITH_BID_CAP and COST_CAP)
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
  // TikTok-specific fields at phase level
  tiktokOptimizationLocation?: string; // Optimization location (Website, App, etc.)
  tiktokAppName?: string; // App name for app campaigns
  tiktokAppId?: string; // App ID for app campaigns
  tiktokFrequencyEnabled?: boolean; // Whether frequency capping is enabled
  tiktokFrequencySchedule?: number; // Frequency schedule
  tiktokClickWindow?: number; // Click attribution window
  tiktokViewWindow?: number; // View attribution window
  tiktokEventCount?: string; // Event count type: "every_conversion" or "once"
  tiktokSmartPlusEnabled?: boolean; // Smart+ enabled
  tiktokBidStrategy?: string; // Bid strategy override at phase level
  tiktokBidAmount?: number; // Bid amount override at phase level
  tiktokCatalog?: string; // TikTok Catalog ID at phase level
  tiktokProductSet?: string; // TikTok Product Set ID at phase level
  tiktokPlacementType?: string; // PLACEMENT_TYPE_AUTOMATIC or PLACEMENT_TYPE_NORMAL
  tiktokPlacements?: string[]; // Array of placement positions when manual
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
