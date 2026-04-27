/**
 * Google Ads Campaign Type Matrix
 * 
 * Comprehensive reference for all campaign types, subtypes, ad formats,
 * bid strategies, network settings, targeting options, and feature availability.
 * 
 * Source: Google Ads platform specifications (2025)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface GoogleAdsCampaignType {
  phase: string; // Funnel phase: Awareness, Consideration, Conversion
  optimizationGoal: string;
  campaignType: string; // Display, Search, Performance Max, Video, App Promotion, Demand Gen, Shopping
  subtype?: string;
  adFormats: string[];
  bidStrategies: string[];
  budgetTypes: string[]; // "Daily", "Manual" (lifetime)
  devices: string[];
  // Network settings
  networks: {
    searchPartner: boolean | "optional"; // Yes/No or user choice
    searchNetwork: boolean;
    displayNetwork: boolean | "optional";
    gmail: boolean;
    discover: boolean;
    youtube: boolean;
    googleTv: boolean;
    videoPartner: boolean;
  };
  // Targeting
  targeting: {
    location: "All" | string;
    language: "All" | string;
    aiMax: boolean | "optional"; // AI maximization (Text customization, Final URL expansion)
    aiMaxOptions?: string[];
    audienceTargetingLevel: "Campaign" | "Ad Group" | "Asset Group";
    audienceSegments: string[]; // Website visitors, Customer segments, YouTube users, App users, Custom combination, Callers
    searchThemes: boolean;
    keywords: boolean;
    demographics: string[]; // Gender, Age, Parental Status, Household income
    topics: boolean;
    placements: string[]; // Websites, Youtube Channels, Youtube Videos, Apps, App Categories
    optimizedTargeting: boolean;
    interestsOrBehavior: boolean;
  };
  // Video-specific
  videoSettings?: {
    inventoryType: string[]; // Expanded, Standard, Limited
  };
  // Features
  features: {
    conversionGoal: boolean;
    appPlatform: boolean; // App Promotion Only
    customerAcquisition: string | false; // "New Customers Only, Everyone" or false
    exclude: boolean;
    productFeed: boolean;
  };
}

// ============================================================================
// CAMPAIGN TYPE MATRIX
// ============================================================================

export const GOOGLE_ADS_CAMPAIGN_MATRIX: GoogleAdsCampaignType[] = [
  // ─── AWARENESS ────────────────────────────────────────────────────────
  {
    phase: "Awareness",
    optimizationGoal: "Reach",
    campaignType: "Display",
    adFormats: ["Responsive Display Ads", "Uploaded Image Ads", "HTML5 Ads"],
    bidStrategies: ["Viewable Impressions", "CPM", "Maximize Clicks", "Maximum CPC", "Maximize Conversions", "Target CPA", "Maximize Conversion Value", "Target ROAS"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: false,
      searchNetwork: false,
      displayNetwork: true,
      gmail: false,
      discover: false,
      youtube: false,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: true,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: true,
      placements: ["Websites", "YouTube Channels", "YouTube Videos", "Apps", "App Categories"],
      optimizedTargeting: true,
      interestsOrBehavior: false,
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: false,
      exclude: false,
      productFeed: false,
    },
  },

  // ─── AWARENESS: VIDEO - EFFICIENT REACH ───────────────────────────────
  {
    phase: "Awareness",
    optimizationGoal: "Reach",
    campaignType: "Video",
    subtype: "Efficient Reach",
    adFormats: ["In-stream Ads (Bumper, Skippable)", "In-feed Ads", "Shorts Ads"],
    bidStrategies: ["Target CPM"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: false,
      searchNetwork: false,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: true,
      googleTv: true,
      videoPartner: true,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: true,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: true,
      placements: ["Websites", "YouTube Channels", "YouTube Videos", "Apps", "App Categories"],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    videoSettings: {
      inventoryType: ["Expanded", "Standard", "Limited"],
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: false,
      exclude: true,
      productFeed: true,
    },
  },

  // ─── AWARENESS: VIDEO - NON-SKIPPABLE REACH ──────────────────────────
  {
    phase: "Awareness",
    optimizationGoal: "Reach",
    campaignType: "Video",
    subtype: "Non-skippable Reach",
    adFormats: ["15 Seconds", "30 Seconds", "Bumper and 15 Seconds"],
    bidStrategies: ["Target CPM"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: false,
      searchNetwork: false,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: true,
      googleTv: true,
      videoPartner: true,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: true,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: true,
      placements: ["Websites", "YouTube Channels", "YouTube Videos", "Apps", "App Categories"],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    videoSettings: {
      inventoryType: ["Expanded", "Standard", "Limited"],
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: false,
      exclude: true,
      productFeed: true,
    },
  },

  // ─── AWARENESS: VIDEO - TARGET FREQUENCY ──────────────────────────────
  {
    phase: "Awareness",
    optimizationGoal: "Reach",
    campaignType: "Video",
    subtype: "Target Frequency",
    adFormats: [
      "Multi-format Ads (Skippable In-stream, Bumper, In-feed, Shorts)",
      "Non-skippable In-stream Ads",
      "Skippable In-stream and Bumper Ads",
    ],
    bidStrategies: ["Target CPM"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: false,
      searchNetwork: false,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: true,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: true,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: true,
      placements: ["Websites", "YouTube Channels", "YouTube Videos", "Apps", "App Categories"],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    videoSettings: {
      inventoryType: ["Expanded", "Standard", "Limited"],
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: false,
      exclude: true,
      productFeed: true,
    },
  },

  // ─── AWARENESS: VIDEO - AD SEQUENCE ───────────────────────────────────
  {
    phase: "Awareness",
    optimizationGoal: "Ad Sequence",
    campaignType: "Video",
    subtype: "Ad Sequence",
    adFormats: ["Skippable In-stream Ads", "Non-skippable In-stream Ads", "Bumper Ads"],
    bidStrategies: ["Target CPM"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: false,
      searchNetwork: false,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: true,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: true,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: true,
      placements: ["Websites", "YouTube Channels", "YouTube Videos", "Apps", "App Categories"],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    videoSettings: {
      inventoryType: ["Expanded", "Standard", "Limited"],
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: false,
      exclude: true,
      productFeed: true,
    },
  },

  // ─── AWARENESS: VIDEO - VIDEO VIEWS ───────────────────────────────────
  {
    phase: "Awareness",
    optimizationGoal: "Video Views",
    campaignType: "Video",
    subtype: "Video Views",
    adFormats: ["In-stream Ads (Bumper, Skippable)", "In-feed Ads", "Shorts Ads"],
    bidStrategies: ["Target CPM"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: false,
      searchNetwork: false,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: true,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: true,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: true,
      placements: ["Websites", "YouTube Channels", "YouTube Videos", "Apps", "App Categories"],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    videoSettings: {
      inventoryType: ["Expanded", "Standard", "Limited"],
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: false,
      exclude: true,
      productFeed: true,
    },
  },

  // ─── AWARENESS: VIDEO - AUDIO REACH ───────────────────────────────────
  {
    phase: "Awareness",
    optimizationGoal: "Audio Reach",
    campaignType: "Video",
    subtype: "Audio Reach",
    adFormats: ["Audio Ads"],
    bidStrategies: ["Target CPM"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: false,
      searchNetwork: false,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: true,
      googleTv: false,
      videoPartner: true,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: true,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: true,
      placements: ["Websites", "YouTube Channels", "YouTube Videos", "Apps", "App Categories"],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    videoSettings: {
      inventoryType: ["Expanded", "Standard", "Limited"],
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: false,
      exclude: true,
      productFeed: true,
    },
  },

  // ─── CONVERSION: SEARCH ───────────────────────────────────────────────
  {
    phase: "Conversion",
    optimizationGoal: "Search",
    campaignType: "Search",
    adFormats: ["Responsive Search Ads", "Text Ads"],
    bidStrategies: ["Manual CPC", "Maximize Clicks", "Maximum CPC", "Maximize Conversions", "Target CPA", "Maximize Conversion Value", "Target ROAS", "Target Impression Share"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: "optional",
      searchNetwork: true,
      displayNetwork: "optional",
      gmail: false,
      discover: false,
      youtube: false,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: "optional",
      aiMaxOptions: ["Text customization", "Final URL expansion"],
      audienceTargetingLevel: "Campaign",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: true,
      demographics: [],
      topics: false,
      placements: [],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: "New Customers Only, Everyone",
      exclude: true,
      productFeed: true,
    },
  },

  // ─── CONSIDERATION: PERFORMANCE MAX ───────────────────────────────────
  {
    phase: "Consideration",
    optimizationGoal: "Performance Max",
    campaignType: "Performance Max",
    adFormats: ["Asset Groups (Auto-generated)"],
    bidStrategies: ["Maximize Conversions", "Maximize Conversion Value", "Target CPA", "Target ROAS"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: true,
      searchNetwork: true,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: false,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Asset Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: true,
      keywords: false,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: false,
      placements: [],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: "New Customers Only, Everyone",
      exclude: true,
      productFeed: true,
    },
  },

  // ─── CONSIDERATION: APP PROMOTION - APP INSTALLS ──────────────────────
  {
    phase: "Consideration",
    optimizationGoal: "App Installs",
    campaignType: "App Promotion",
    subtype: "App Installs",
    adFormats: ["App Install Ads (Auto-generated)"],
    bidStrategies: ["Target CPA", "Target ROAS", "Maximize Conversions"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: true,
      searchNetwork: true,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: false,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: false,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: false,
      placements: [],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    features: {
      conversionGoal: true,
      appPlatform: true,
      customerAcquisition: false,
      exclude: true,
      productFeed: true,
    },
  },

  // ─── CONSIDERATION: APP PROMOTION - APP ENGAGEMENT ────────────────────
  {
    phase: "Consideration",
    optimizationGoal: "App Engagement",
    campaignType: "App Promotion",
    subtype: "App Engagement",
    adFormats: ["App Engagement Ads (Auto-generated)"],
    bidStrategies: ["Target CPA", "Target ROAS", "Maximize Conversions"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: true,
      searchNetwork: true,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: false,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: false,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: false,
      placements: [],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    features: {
      conversionGoal: true,
      appPlatform: true,
      customerAcquisition: false,
      exclude: true,
      productFeed: true,
    },
  },

  // ─── CONSIDERATION: APP PROMOTION - APP PRE-REGISTRATION ──────────────
  {
    phase: "Consideration",
    optimizationGoal: "App Pre-registration",
    campaignType: "App Promotion",
    subtype: "App Pre-registration",
    adFormats: ["App Pre-registration Ads (Auto-generated)"],
    bidStrategies: ["Target CPA", "Target ROAS", "Maximize Conversions"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: true,
      searchNetwork: true,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: false,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: false,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: false,
      placements: [],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    features: {
      conversionGoal: true,
      appPlatform: true,
      customerAcquisition: false,
      exclude: true,
      productFeed: true,
    },
  },

  // ─── CONSIDERATION: DEMAND GEN ────────────────────────────────────────
  {
    phase: "Consideration",
    optimizationGoal: "Conversions",
    campaignType: "Demand Gen",
    adFormats: ["Single Image Ads", "Video Ads", "Carousel Ads", "Product Ads"],
    bidStrategies: ["Maximize Clicks", "Maximum CPC", "Maximize Conversions", "Target CPA", "Maximize Conversion Value", "Target ROAS"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: false,
      searchNetwork: true,
      displayNetwork: false,
      gmail: true,
      discover: true,
      youtube: true,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: false,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: false,
      placements: [],
      optimizedTargeting: true,
      interestsOrBehavior: true,
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: "New Customers Only, Everyone",
      exclude: true,
      productFeed: true,
    },
  },

  // ─── CONVERSION: SHOPPING ─────────────────────────────────────────────
  {
    phase: "Conversion",
    optimizationGoal: "Shopping",
    campaignType: "Shopping",
    subtype: "Standard Shopping",
    adFormats: ["Product Shopping Ads", "Showcase Shopping Ads"],
    bidStrategies: ["Manual CPC", "Maximum CPC", "Maximize Clicks", "Target ROAS"],
    budgetTypes: ["Daily", "Manual"],
    devices: ["Computers", "Mobile Phones", "Tablets", "TV Screens"],
    networks: {
      searchPartner: "optional",
      searchNetwork: true,
      displayNetwork: false,
      gmail: false,
      discover: false,
      youtube: false,
      googleTv: false,
      videoPartner: false,
    },
    targeting: {
      location: "All",
      language: "All",
      aiMax: false,
      audienceTargetingLevel: "Ad Group",
      audienceSegments: ["Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"],
      searchThemes: false,
      keywords: false,
      demographics: ["Gender", "Age", "Parental Status", "Household Income"],
      topics: false,
      placements: [],
      optimizedTargeting: false,
      interestsOrBehavior: false,
    },
    features: {
      conversionGoal: true,
      appPlatform: false,
      customerAcquisition: "New Customers Only, Everyone",
      exclude: true,
      productFeed: true,
    },
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all unique campaign types
 */
export function getGoogleAdsCampaignTypes(): string[] {
  return [...new Set(GOOGLE_ADS_CAMPAIGN_MATRIX.map(c => c.campaignType))];
}

/**
 * Get subtypes for a campaign type
 */
export function getGoogleAdsSubtypes(campaignType: string): string[] {
  return GOOGLE_ADS_CAMPAIGN_MATRIX
    .filter(c => c.campaignType === campaignType && c.subtype)
    .map(c => c.subtype!);
}

/**
 * Get campaign configs matching campaign type (and optionally subtype)
 */
export function getGoogleAdsCampaignConfig(
  campaignType: string,
  subtype?: string
): GoogleAdsCampaignType | undefined {
  return GOOGLE_ADS_CAMPAIGN_MATRIX.find(
    c => c.campaignType === campaignType && (subtype ? c.subtype === subtype : !c.subtype)
  );
}

/**
 * Get all configs for a campaign type (including subtypes)
 */
export function getGoogleAdsCampaignConfigs(campaignType: string): GoogleAdsCampaignType[] {
  return GOOGLE_ADS_CAMPAIGN_MATRIX.filter(c => c.campaignType === campaignType);
}

/**
 * Get valid bid strategies for a campaign type + subtype
 */
export function getGoogleAdsBidStrategies(campaignType: string, subtype?: string): string[] {
  const config = getGoogleAdsCampaignConfig(campaignType, subtype);
  return config?.bidStrategies || [];
}

/**
 * Get valid ad formats for a campaign type + subtype
 */
export function getGoogleAdsAdFormats(campaignType: string, subtype?: string): string[] {
  const config = getGoogleAdsCampaignConfig(campaignType, subtype);
  return config?.adFormats || [];
}

/**
 * Get network availability for a campaign type
 */
export function getGoogleAdsNetworks(campaignType: string, subtype?: string) {
  const config = getGoogleAdsCampaignConfig(campaignType, subtype);
  return config?.networks;
}

/**
 * Check if a feature is available for a campaign type
 */
export function isGoogleAdsFeatureAvailable(
  campaignType: string,
  feature: keyof GoogleAdsCampaignType["features"],
  subtype?: string
): boolean {
  const config = getGoogleAdsCampaignConfig(campaignType, subtype);
  if (!config) return false;
  return !!config.features[feature];
}

/**
 * Get targeting options for a campaign type
 */
export function getGoogleAdsTargetingOptions(campaignType: string, subtype?: string) {
  const config = getGoogleAdsCampaignConfig(campaignType, subtype);
  return config?.targeting;
}

/**
 * Check if keywords are supported for a campaign type
 */
export function supportsKeywords(campaignType: string, subtype?: string): boolean {
  const config = getGoogleAdsCampaignConfig(campaignType, subtype);
  return config?.targeting.keywords ?? false;
}

/**
 * Check if topics targeting is available
 */
export function supportsTopics(campaignType: string, subtype?: string): boolean {
  const config = getGoogleAdsCampaignConfig(campaignType, subtype);
  return config?.targeting.topics ?? false;
}

/**
 * Check if placements targeting is available
 */
export function supportsPlacements(campaignType: string, subtype?: string): boolean {
  const config = getGoogleAdsCampaignConfig(campaignType, subtype);
  return (config?.targeting.placements?.length ?? 0) > 0;
}

/**
 * Get campaign types for a funnel phase
 */
export function getCampaignTypesForPhase(phase: string): GoogleAdsCampaignType[] {
  return GOOGLE_ADS_CAMPAIGN_MATRIX.filter(
    c => c.phase.toLowerCase() === phase.toLowerCase()
  );
}

/**
 * Get video settings (inventory types) if applicable
 */
export function getVideoSettings(campaignType: string, subtype?: string) {
  const config = getGoogleAdsCampaignConfig(campaignType, subtype);
  return config?.videoSettings;
}

/**
 * Get all demographics available for a campaign type
 */
export function getAvailableDemographics(campaignType: string, subtype?: string): string[] {
  const config = getGoogleAdsCampaignConfig(campaignType, subtype);
  return config?.targeting.demographics || [];
}

/**
 * Map phase name to appropriate Google Ads campaign types
 */
export function mapPhaseToGoogleAdsCampaignTypes(phaseName: string): string[] {
  const lower = phaseName.toLowerCase();
  
  if (lower.includes("awareness") || lower.includes("reach")) {
    return ["Display", "Video"];
  }
  if (lower.includes("consideration") || lower.includes("interest")) {
    return ["Performance Max", "Demand Gen", "Video", "App Promotion"];
  }
  if (lower.includes("conversion") || lower.includes("purchase") || lower.includes("sale")) {
    return ["Search", "Shopping", "Performance Max"];
  }
  if (lower.includes("app")) {
    return ["App Promotion"];
  }
  
  return ["Search", "Performance Max", "Demand Gen"];
}
