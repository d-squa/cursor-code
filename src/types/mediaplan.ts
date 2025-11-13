export interface Market {
  id: string;
  name: string;
  budgetPercentage: number;
  phases?: Phase[];
  useGlobalFunnel?: boolean;
  adFormats?: string[];
  accountName?: string;
  adAccountId?: string; // Meta Ad Account ID
  page?: string;
  pageId?: string; // Meta Page ID
  pixel?: string;
  catalog?: string;
  productSet?: string; // Meta Product Set ID
  conversionEvent?: string; // Conversion event for conversion campaigns
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
