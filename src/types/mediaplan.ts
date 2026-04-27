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
  tiktokBillingEvent?: string; // TikTok billing event (OCPM, CPC, CPV, CPM)
  // TikTok messaging/destination fields
  tiktokMessagingApp?: string; // TikTok Messaging App (MESSENGER, WHATSAPP, ZALO, LINE)
  tiktokFacebookPageId?: string; // Facebook Page ID for Messenger
  tiktokMessageEventSet?: string; // Message Event Set ID
  tiktokWhatsappNumber?: string; // WhatsApp Business number
  tiktokZaloAccountId?: string; // Zalo Official Account ID
  tiktokLineBusinessId?: string; // LINE Business ID
  metaBidStrategy?: string; // Meta Bid Strategy (LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP, etc.)
  metaBidAmount?: number; // Meta Bid Amount (required for LOWEST_COST_WITH_BID_CAP and COST_CAP)
  metaBillingEvent?: string; // Meta Billing Event (IMPRESSIONS, LINK_CLICKS, etc.)
  metaLandingPageUrl?: string; // Meta Landing Page URL for traffic campaigns
  metaOptimizationLocation?: string; // Meta Optimization Location (WEBSITE, APP, MESSAGING_APPS, CALLS)
  metaClickWindow?: number; // Meta Click-through attribution window in days (1, 7, 28)
  metaViewWindow?: number; // Meta View-through attribution window in days (1, 7)
  // Meta destination/app fields
  metaAppStore?: string; // Meta App Store (GOOGLE_PLAY, APPLE_APP_STORE, etc.)
  metaAppId?: string; // Meta App ID for app campaigns
  // Meta messaging fields
  metaMessagingMode?: string; // Meta Messaging Mode (AUTOMATIC, MANUAL)
  metaMessengerEnabled?: boolean; // Facebook Messenger enabled
  metaInstagramDmEnabled?: boolean; // Instagram DM enabled
  metaWhatsappEnabled?: boolean; // WhatsApp enabled
  metaWhatsappNumber?: string; // WhatsApp Business number
  metaAdvantagePlusPlacements?: boolean; // Meta Advantage+ placements toggle
  // Meta placement fields
  metaPublisherPlatforms?: string[]; // Meta Publisher Platforms
  metaPositions?: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  }; // Meta Positions per publisher
  // Google Ads-specific fields
  googleObjective?: string; // SALES, LEADS, WEBSITE_TRAFFIC, APP_PROMOTION, AWARENESS_CONSIDERATION, LOCAL_STORE
  googleBidStrategy?: string; // MAXIMIZE_CONVERSIONS, MAXIMIZE_CLICKS, TARGET_CPA, TARGET_ROAS, MANUAL_CPC
  googleTargetCpa?: number; // Target CPA amount
  googleTargetRoas?: number; // Target ROAS percentage
  googleMaxCpcBid?: number; // Max CPC bid for manual bidding
  googleTargetCpm?: number; // Target CPM amount (Video reach campaigns)
  googleTargetFrequency?: number; // Target frequency cap per user (Target Frequency subtype)
  googleTargetFrequencyPeriod?: string; // WEEK | MONTH (default WEEK)
  googleConversionAction?: string; // Google Ads conversion action
  googleLandingPageUrl?: string; // Landing page URL
  googleMerchantCenterId?: string; // Merchant Center ID for product feeds
  googleFeedLabel?: string; // Feed label (e.g. US, EU)
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
  advantagePlusPlacements?: boolean; // Meta Advantage+ placements toggle (legacy)
  detailedTargeting?: Array<{ id: string; type: string; name?: string }>;
}

export interface FunnelStage {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetPercentage: number;
}

// Represents a single ad set configuration within a phase split
export interface AdSetConfig {
  id: string;
  name: string;
  // The value for the split dimension (e.g., specific placement, language, etc.)
  dimensionValue: string | string[] | number | { min: number; max: number };
  budgetPercentage: number; // Budget share within the phase
  // Optional overrides for specific fields based on dimension
  placements?: string[];
  tiktokPlacements?: string[];
  publisherPlatforms?: string[];
  positions?: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  };
  languages?: number[] | string[];
  countries?: string[];
  gender?: string;
  devices?: string[];
  ageMin?: number;
  ageMax?: number;
  optimizationGoal?: string;
  // Placement preset for ad format splitting
  placementPreset?: string; // in_feed, stories, in_feed_carousel, story_carousel
  // Bid strategy and related parameters (especially needed for optimization_goal splits)
  bidStrategy?: string; // Meta: LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP; TikTok: BID_TYPE_NO_BID, BID_TYPE_CUSTOM
  bidAmount?: number; // Required when bidStrategy is LOWEST_COST_WITH_BID_CAP or COST_CAP
  billingEvent?: string; // Meta: IMPRESSIONS, LINK_CLICKS, etc.; TikTok: OCPM, CPC, CPV, CPM
  audiences?: Array<{
    id: string;
    name: string;
    type: string;
    source: string;
    subtype?: string;
    approximate_count?: number;
  }>;
  // Excluded audiences for cross-negation
  excludedAudiences?: Array<{
    id: string;
    name: string;
    type: string;
    source: string;
  }>;
}

// Dimensions available for splitting ad sets
export type AdSetSplitDimension = 
  | 'none'
  | 'placement'
  | 'ad_format'
  | 'optimization_goal'
  | 'audience'
  | 'audience_selection'
  | 'language'
  | 'location'
  | 'gender'
  | 'device'
  | 'age';

// Meta Placement Preset type
export type MetaPlacementPreset = 
  | 'automatic' 
  | 'stories' 
  | 'in_feed' 
  | 'in_feed_carousel' 
  | 'story_carousel' 
  | 'custom';

// Per-platform split dimension configuration
export type AdSetSplitDimensionPerPlatform = Record<string, AdSetSplitDimension>;

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
  // Ad Set Split configuration
  adSetSplitDimension?: AdSetSplitDimension;
  adSets?: AdSetConfig[];
  useCBO?: boolean; // Campaign Budget Optimization (true) vs Ad Set Budget Optimization (false)
  /**
   * Internal marker used by the UI to know whether the phase split was created by
   * copying the campaign-level default split.
   */
  adSetSplitSource?: 'default' | 'phase';
  // Taxonomy values for naming
  campaignTaxonomyValues?: Record<string, string>;
  adsetTaxonomyValues?: Record<string, string>;
  // TikTok-specific fields at phase level
  tiktokOptimizationLocation?: string; // Optimization location (Website, App, etc.)
  tiktokAppName?: string; // App name for app campaigns
  tiktokAppId?: string; // App ID for app campaigns
  tiktokFrequencyEnabled?: boolean; // Whether frequency capping is enabled
  tiktokFrequencySchedule?: number; // Frequency schedule
  tiktokClickWindow?: number; // Click attribution window
  tiktokViewWindow?: number; // View attribution window
  tiktokEventCount?: string; // Event count type: "every_conversion" or "once"
  tiktokSmartPlusEnabled?: boolean; // Smart Performance Campaign enabled
  tiktokSmartCreativeEnabled?: boolean; // Smart Creative Optimization
  tiktokAutoTargetingEnabled?: boolean; // Smart+ auto-targeting
  tiktokBidStrategy?: string; // Bid strategy override at phase level
  tiktokBidAmount?: number; // Bid amount override at phase level
  tiktokCatalog?: string; // TikTok Catalog ID at phase level
  tiktokProductSet?: string; // TikTok Product Set ID at phase level
  tiktokPlacementType?: string; // PLACEMENT_TYPE_AUTOMATIC or PLACEMENT_TYPE_NORMAL
  tiktokPlacements?: string[]; // Array of placement positions when manual
  // TikTok destination-specific fields
  tiktokMessagingApp?: string; // MESSENGER, WHATSAPP, ZALO, LINE, URL
  tiktokFacebookPageId?: string; // Facebook page ID for Messenger
  tiktokMessageEventSet?: string; // Message event set for conversation goals
  tiktokWhatsappNumber?: string; // WhatsApp number
  tiktokZaloAccountId?: string; // Zalo Official Account ID
  tiktokLineBusinessId?: string; // LINE Business ID
  tiktokBillingEvent?: string; // TikTok billing event (OCPM, CPC, CPV, CPM)
  tiktokLandingPageUrl?: string; // TikTok Landing Page URL for Website destination
  tiktokIdentityId?: string; // TikTok Identity ID for Direct Messages
  tiktokPhoneNumber?: string; // Phone number for Phone Call destination
  tiktokCampaignType?: string; // Search, In-Feed, etc. (mirrors Google's googleCampaignType)
  // Meta-specific fields at phase level
  metaBillingEvent?: string; // IMPRESSIONS, LINK_CLICKS, POST_ENGAGEMENT, etc.
  metaLandingPageUrl?: string; // Default landing page URL
  metaOptimizationLocation?: string; // WEBSITE, APP, MESSAGING_APPS, CALLS
  metaClickWindow?: number; // Click-through attribution window in days (1, 7, 28)
  metaViewWindow?: number; // View-through attribution window in days (1, 7)
  metaBidStrategy?: string; // LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP
  metaBidAmount?: number; // Bid amount when bid cap is required
  metaAdvantagePlusCampaign?: boolean; // Advantage+ Shopping Campaign mode
  metaAdvantagePlusAudience?: boolean; // Advantage+ Audience (targeting_automation)
  metaAdvantagePlusCreative?: boolean; // Advantage+ Creative optimization
  metaConversionCount?: string; // all_conversions or one_per_click
  metaCatalogId?: string; // Catalog ID for Advantage+ Shopping
  metaProductSetId?: string; // Product Set ID for Advantage+ Shopping
  // Meta destination-specific fields
  metaAppStore?: string; // Store for app destination
  metaAppId?: string; // App identifier from the selected store
  metaMessagingMode?: string; // AUTOMATIC or MANUAL
  metaMessengerEnabled?: boolean; // Facebook Messenger enabled
  metaInstagramDmEnabled?: boolean; // Instagram DM enabled
  metaWhatsappEnabled?: boolean; // WhatsApp enabled
  metaWhatsappNumber?: string; // WhatsApp Business number
  metaPageId?: string; // Facebook Page ID for Messenger
  metaInstagramAccountId?: string; // Instagram Account ID for DM
  // Campaign-level overrides (inherits from market/generic if not set)
  publisherPlatforms?: string[];
  positions?: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  };
  advantagePlusPlacements?: boolean; // Meta Advantage+ placements toggle
  placementPreset?: MetaPlacementPreset; // Meta Placement Preset for taxonomy/creative matching
  countries?: string[];
  gender?: string;
  languages?: number[];
  ageMin?: number;
  ageMax?: number;
  detailedTargeting?: Array<{ id: string; type: string; name?: string }>;
  // Override for campaign-level targeting
  overrideTargeting?: boolean;
  useBroadTargeting?: boolean; // Use broad targeting (no demographics or interests)
  targeting?: {
    adFormats?: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: string[];
    devices?: string[];
    targetingExpansion?: boolean;
    os?: string[];
    language?: string;
    languages?: string[];
    interests?: string;
    websiteAudience?: string;
    keywordList?: string;
    customerList?: string;
    lookalikeAudience?: string;
    selectedItems?: Array<{
      id: string;
      name: string;
      category: string;
      platforms: string[];
      platform_ids?: Record<string, string>;
    }>;
    useBroadTargeting?: boolean;
  };
  audiences?: Array<{
    id: string;
    name: string;
    type: string;
    source: string;
    subtype?: string;
    approximate_count?: number;
  }>;
  // Excluded audiences for auto-negation
  excludedAudiences?: Array<{
    id: string;
    name: string;
    type: string;
    source: string;
  }>;
  // Auto-exclude toggle
  autoExcludeAudiences?: boolean;
  // Snapchat-specific fields at phase level
  snapchatBidStrategy?: string; // AUTO_BID, TARGET_COST, MIN_ROAS, MAX_BID
  snapchatBidAmount?: number; // Bid amount for TARGET_COST / MAX_BID
  snapchatMinRoas?: number; // Minimum ROAS for MIN_ROAS strategy
  snapchatDestinationUrl?: string; // Swipe-up destination URL
  snapchatPixelId?: string; // Snap Pixel ID
  snapchatFrequencyCap?: number; // Frequency cap (impressions per day)
  snapchatPlacementType?: string; // AUTOMATIC or MANUAL
  snapchatPlacements?: string[]; // Manual placement selections
  // Google Ads-specific fields at phase level
  googleCampaignType?: string; // Display, Search, Performance Max, Video, App Promotion, Demand Gen, Shopping
  googleCampaignSubtype?: string; // Efficient Reach, Non-skippable Reach, Target Frequency, Ad Sequence, etc.
  googleBidStrategy?: string; // Maximize Conversions, Target CPA, Target ROAS, Manual CPC, etc.
  googleTargetCpa?: number; // Target CPA amount
  googleTargetRoas?: number; // Target ROAS percentage
  googleMaxCpcBid?: number; // Max CPC bid
  googleTargetCpm?: number; // Target CPM amount (Video reach campaigns)
  googleTargetFrequency?: number; // Target frequency cap per user
  googleTargetFrequencyPeriod?: string; // WEEK | MONTH
  googleLandingPageUrl?: string; // Landing page URL
  googleConversionAction?: string; // Conversion action
  googleSearchPartner?: boolean; // Include Search Partners
  googleDisplayNetwork?: boolean; // Include Display Network
  googleInventoryType?: string; // Expanded, Standard, Limited (Video only)
  googleCustomerAcquisition?: string; // "New Customers Only" or "Everyone"
  googleProductFeed?: boolean; // Product feed enabled
  googleMerchantCenterId?: string; // Google Merchant Center ID
  googleFeedLabel?: string; // Feed label (e.g. US, EU)
  googleOptimizedTargeting?: boolean; // Optimized targeting
  googleAiMax?: boolean; // AI maximization
  googleAiMaxOptions?: string[]; // Text customization, Final URL expansion
  googleAppPlatform?: string; // iOS, Android (App Promotion only)
  googleAppId?: string; // App ID
  googleExclude?: boolean; // Exclusion enabled
  googleExcludedPlacements?: string[]; // Excluded websites/channels/apps (one per line)
  googleExcludedKeywords?: string[]; // Negative keywords
  googleExcludedTopics?: string[]; // Excluded topics
  googleExcludedContentLabels?: string[]; // Excluded content labels (e.g. DL-MA, live streaming)
  googleDemographics?: string[]; // Gender, Age, Parental Status, Household Income
  googleTopics?: boolean; // Topics targeting
  googlePlacements?: string[]; // Websites, YouTube Channels, YouTube Videos, Apps, App Categories
  googleKeywords?: string[]; // Keywords
  googleSearchThemes?: string[]; // Search themes (PMax)
  googleLocationTargeting?: string; // PRESENCE_OR_INTEREST or PRESENCE
  googleBrandGuidelines?: boolean; // Brand Guidelines enabled (PMax)
  googleBusinessName?: string; // Business name for Brand Guidelines (PMax)
  /**
   * For Google Search phases that have an ad set split: whether the split is
   * materialised as separate campaigns or separate ad groups inside a single
   * campaign. Defaults to 'adgroup' when unset.
   */
  googleSearchSplitLevel?: 'campaign' | 'adgroup';
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
