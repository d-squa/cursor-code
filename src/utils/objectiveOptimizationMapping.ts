/**
 * Comprehensive Objective ↔ Optimization Goal Mapping for Meta and TikTok
 * This provides two-way mapping between objectives and their valid optimization goals
 */

export interface OptimizationGoalOption {
  value: string;
  label: string;
  billingEvent?: string;
}

export interface ObjectiveMapping {
  value: string;
  label: string;
  optimizationGoals: OptimizationGoalOption[];
}

// =============================================================================
// META OBJECTIVE ↔ OPTIMIZATION GOAL MAPPING
// =============================================================================

export const META_OBJECTIVE_MAPPING: ObjectiveMapping[] = [
  {
    value: "OUTCOME_AWARENESS",
    label: "Awareness",
    optimizationGoals: [
      { value: "REACH", label: "Reach", billingEvent: "IMPRESSIONS" },
      { value: "IMPRESSIONS", label: "Impressions", billingEvent: "IMPRESSIONS" },
      { value: "AD_RECALL_LIFT", label: "Ad Recall Lift", billingEvent: "IMPRESSIONS" },
      { value: "THRUPLAY", label: "ThruPlay", billingEvent: "THRUPLAY" },
    ]
  },
  {
    value: "OUTCOME_TRAFFIC",
    label: "Traffic",
    optimizationGoals: [
      { value: "LINK_CLICKS", label: "Link Clicks", billingEvent: "LINK_CLICKS" },
      { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views", billingEvent: "IMPRESSIONS" },
      { value: "REACH", label: "Reach (Daily Unique)", billingEvent: "IMPRESSIONS" },
      { value: "IMPRESSIONS", label: "Impressions", billingEvent: "IMPRESSIONS" },
    ]
  },
  {
    value: "OUTCOME_ENGAGEMENT",
    label: "Engagement",
    optimizationGoals: [
      // Video destination (ON_VIDEO)
      { value: "THRUPLAY", label: "Video Views (ThruPlay)", billingEvent: "THRUPLAY" },
      { value: "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", label: "Video Views (2-Second)", billingEvent: "IMPRESSIONS" },
      // Post destination (ON_POST)
      { value: "POST_ENGAGEMENT", label: "Interactions (Post Engagement)", billingEvent: "IMPRESSIONS" },
      // Event destination (ON_EVENT)
      { value: "EVENT_RESPONSES", label: "Event Responses", billingEvent: "IMPRESSIONS" },
      { value: "REMINDERS_SET", label: "Reminders Set", billingEvent: "IMPRESSIONS" },
      // Page destination (ON_PAGE)
      { value: "PAGE_LIKES", label: "Page Likes", billingEvent: "IMPRESSIONS" },
      // Message destinations (MESSENGER)
      { value: "CONVERSATIONS", label: "Conversations (Messaging)", billingEvent: "IMPRESSIONS" },
      // Calls destination (PHONE_CALL)
      { value: "QUALITY_CALL", label: "Calls", billingEvent: "IMPRESSIONS" },
      // Website destination (UNDEFINED)
      { value: "OFFSITE_CONVERSIONS", label: "Conversions (Website)", billingEvent: "IMPRESSIONS" },
      { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views (Website)", billingEvent: "IMPRESSIONS" },
      { value: "LINK_CLICKS", label: "Link Clicks (Website)", billingEvent: "LINK_CLICKS" },
    ]
  },
  {
    value: "OUTCOME_LEADS",
    label: "Lead Generation",
    optimizationGoals: [
      { value: "LEAD_GENERATION", label: "Leads (Instant Forms)", billingEvent: "IMPRESSIONS" },
      { value: "CONVERSATIONS", label: "Conversations (Messaging)", billingEvent: "IMPRESSIONS" },
      { value: "OFFSITE_CONVERSIONS", label: "Conversions (Website)", billingEvent: "IMPRESSIONS" },
      { value: "APP_INSTALLS", label: "Leads (App)", billingEvent: "IMPRESSIONS" },
      { value: "LINK_CLICKS", label: "Link Clicks", billingEvent: "LINK_CLICKS" },
    ]
  },
  {
    value: "OUTCOME_APP_PROMOTION",
    label: "App Promotion",
    optimizationGoals: [
      { value: "APP_INSTALLS", label: "App Installs", billingEvent: "IMPRESSIONS" },
      { value: "APP_EVENTS", label: "App Events", billingEvent: "IMPRESSIONS" },
      { value: "VALUE", label: "Value (App ROAS)", billingEvent: "IMPRESSIONS" },
      { value: "LINK_CLICKS", label: "Link Clicks", billingEvent: "LINK_CLICKS" },
    ]
  },
  {
    value: "OUTCOME_SALES",
    label: "Sales",
    optimizationGoals: [
      { value: "OFFSITE_CONVERSIONS", label: "Conversions", billingEvent: "IMPRESSIONS" },
      { value: "VALUE", label: "Conversion Value (ROAS)", billingEvent: "IMPRESSIONS" },
      { value: "LINK_CLICKS", label: "Link Clicks", billingEvent: "LINK_CLICKS" },
      { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views", billingEvent: "IMPRESSIONS" },
      { value: "CONVERSATIONS", label: "Conversations", billingEvent: "IMPRESSIONS" },
    ]
  },
];

// Legacy Meta objectives for backward compatibility
export const META_LEGACY_OBJECTIVES: ObjectiveMapping[] = [
  {
    value: "Brand Awareness",
    label: "Brand Awareness (Legacy)",
    optimizationGoals: [
      { value: "AD_RECALL_LIFT", label: "Ad Recall Lift" },
      { value: "REACH", label: "Reach" },
    ]
  },
  {
    value: "Reach",
    label: "Reach (Legacy)",
    optimizationGoals: [
      { value: "REACH", label: "Reach", billingEvent: "IMPRESSIONS" },
      { value: "IMPRESSIONS", label: "Impressions", billingEvent: "IMPRESSIONS" },
    ]
  },
  {
    value: "Video Views",
    label: "Video Views (Legacy)",
    optimizationGoals: [
      { value: "THRUPLAY", label: "ThruPlay", billingEvent: "THRUPLAY" },
      { value: "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", label: "2-Second Video Views", billingEvent: "IMPRESSIONS" },
    ]
  },
  {
    value: "Catalog Sales",
    label: "Catalog Sales (Legacy)",
    optimizationGoals: [
      { value: "OFFSITE_CONVERSIONS", label: "Conversions", billingEvent: "IMPRESSIONS" },
      { value: "VALUE", label: "Conversion Value", billingEvent: "IMPRESSIONS" },
      { value: "LINK_CLICKS", label: "Link Clicks", billingEvent: "LINK_CLICKS" },
    ]
  },
];

// =============================================================================
// TIKTOK OBJECTIVE ↔ OPTIMIZATION GOAL MAPPING
// Based on TikTok's advertising matrix
// =============================================================================

export const TIKTOK_OBJECTIVE_MAPPING: ObjectiveMapping[] = [
  {
    value: "REACH",
    label: "Reach",
    optimizationGoals: [
      { value: "REACH", label: "Reach", billingEvent: "CPM" },
    ]
  },
  {
    value: "TRAFFIC",
    label: "Traffic",
    optimizationGoals: [
      { value: "LANDING_PAGE_VIEW", label: "Landing Page Views", billingEvent: "OCPM" },
      { value: "CLICK", label: "Clicks", billingEvent: "CPC" },
      { value: "ENGAGED_SESSION", label: "Engaged Sessions", billingEvent: "OCPM" },
    ]
  },
  {
    value: "VIDEO_VIEWS",
    label: "Video Views",
    optimizationGoals: [
      { value: "VIDEO_VIEW", label: "Video View (6s)", billingEvent: "CPV" },
      { value: "FOCUSED_VIEW", label: "Focused View (15s)", billingEvent: "CPV" },
    ]
  },
  {
    value: "COMMUNITY_INTERACTION",
    label: "Community Interaction",
    optimizationGoals: [
      { value: "PROFILE_VISIT", label: "Profile Visit", billingEvent: "OCPM" },
      { value: "FOLLOW", label: "Follow", billingEvent: "OCPM" },
    ]
  },
  {
    value: "APP_PROMOTION",
    label: "App Promotion",
    optimizationGoals: [
      { value: "APP_INSTALL", label: "App Install", billingEvent: "OCPM" },
      { value: "APP_EVENT", label: "App Event", billingEvent: "OCPM" },
      { value: "VALUE", label: "Value (App ROAS)", billingEvent: "OCPM" },
    ]
  },
  {
    value: "LEAD_GENERATION",
    label: "Lead Generation",
    optimizationGoals: [
      { value: "CLICK", label: "Click (Website)", billingEvent: "CPC" },
      { value: "CONVERT", label: "Conversion (Website)", billingEvent: "OCPM" },
      { value: "FORM", label: "Form Submission (Instant Form)", billingEvent: "OCPM" },
      { value: "LEAD", label: "Lead (Instant Form)", billingEvent: "OCPM" },
      { value: "MESSAGING", label: "Messaging", billingEvent: "OCPM" },
      { value: "PHONE_CALL", label: "Phone Call", billingEvent: "OCPM" },
    ]
  },
  {
    value: "CONVERSIONS",
    label: "Conversions / Sales",
    optimizationGoals: [
      { value: "LANDING_PAGE_VIEW", label: "Landing Page Views", billingEvent: "OCPM" },
      { value: "ENGAGED_SESSION", label: "Engaged Sessions", billingEvent: "OCPM" },
      { value: "CONVERT", label: "Conversion", billingEvent: "OCPM" },
      { value: "CLICK", label: "Clicks", billingEvent: "CPC" },
      { value: "VALUE", label: "Value Optimization (ROAS)", billingEvent: "OCPM" },
    ]
  },
  {
    value: "PRODUCT_SALES",
    label: "Product Sales (Catalog)",
    optimizationGoals: [
      { value: "CONVERT", label: "Catalog Conversion", billingEvent: "OCPM" },
      { value: "VALUE", label: "Catalog Value", billingEvent: "OCPM" },
    ]
  },
];

// =============================================================================
// SNAPCHAT OBJECTIVE ↔ OPTIMIZATION GOAL MAPPING
// Based on Snapchat Marketing API
// =============================================================================

export const SNAPCHAT_OBJECTIVE_MAPPING: ObjectiveMapping[] = [
  {
    value: "AWARENESS",
    label: "Awareness",
    optimizationGoals: [
      { value: "IMPRESSIONS", label: "Impressions", billingEvent: "CPM" },
      { value: "REACH", label: "Reach", billingEvent: "CPM" },
    ]
  },
  {
    value: "VIDEO_VIEWS",
    label: "Video Views",
    optimizationGoals: [
      { value: "VIDEO_VIEWS", label: "Video Views (2s)", billingEvent: "CPM" },
      { value: "VIDEO_VIEWS_15S", label: "Video Views (15s)", billingEvent: "CPM" },
    ]
  },
  {
    value: "TRAFFIC",
    label: "Traffic",
    optimizationGoals: [
      { value: "SWIPES", label: "Swipe-Ups", billingEvent: "CPS" },
      { value: "STORY_OPENS", label: "Story Opens", billingEvent: "CPM" },
    ]
  },
  {
    value: "ENGAGEMENT",
    label: "Engagement",
    optimizationGoals: [
      { value: "SWIPES", label: "Swipe-Ups", billingEvent: "CPS" },
      { value: "SHARES", label: "Shares", billingEvent: "CPM" },
      { value: "STORY_OPENS", label: "Story Opens", billingEvent: "CPM" },
    ]
  },
  {
    value: "APP_INSTALLS",
    label: "App Installs",
    optimizationGoals: [
      { value: "APP_INSTALLS", label: "App Installs", billingEvent: "CPI" },
      { value: "APP_PURCHASES", label: "App Purchases", billingEvent: "OCPM" },
      { value: "APP_SIGNUPS", label: "App Sign-Ups", billingEvent: "OCPM" },
      { value: "APP_ROAS", label: "App ROAS", billingEvent: "OCPM" },
    ]
  },
  {
    value: "LEAD_GENERATION",
    label: "Lead Generation",
    optimizationGoals: [
      { value: "LEAD_FORM_SUBMISSIONS", label: "Lead Form Submissions", billingEvent: "OCPM" },
      { value: "SIGN_UPS", label: "Sign-Ups (Pixel)", billingEvent: "OCPM" },
    ]
  },
  {
    value: "CONVERSIONS",
    label: "Web Conversions",
    optimizationGoals: [
      { value: "PIXEL_PURCHASE", label: "Pixel Purchase", billingEvent: "OCPM" },
      { value: "PIXEL_SIGNUP", label: "Pixel Sign-Up", billingEvent: "OCPM" },
      { value: "PIXEL_ADD_TO_CART", label: "Pixel Add to Cart", billingEvent: "OCPM" },
      { value: "PIXEL_PAGE_VIEW", label: "Pixel Page View", billingEvent: "OCPM" },
    ]
  },
  {
    value: "CATALOG_SALES",
    label: "Catalog Sales",
    optimizationGoals: [
      { value: "CATALOG_SALES", label: "Catalog Sales", billingEvent: "OCPM" },
      { value: "CATALOG_ROAS", label: "Catalog ROAS", billingEvent: "OCPM" },
    ]
  },
];

// =============================================================================
// GOOGLE ADS OBJECTIVE ↔ OPTIMIZATION GOAL (BID STRATEGY) MAPPING
// Based on comprehensive Google Ads campaign type matrix
// =============================================================================

export const GOOGLE_ADS_OBJECTIVE_MAPPING: ObjectiveMapping[] = [
  {
    value: "AWARENESS_DISPLAY",
    label: "Awareness — Display",
    optimizationGoals: [
      { value: "VIEWABLE_IMPRESSIONS", label: "Viewable Impressions", billingEvent: "CPM" },
      { value: "CPM", label: "CPM", billingEvent: "CPM" },
      { value: "MAXIMIZE_CLICKS", label: "Maximize Clicks", billingEvent: "CPC" },
      { value: "MAXIMUM_CPC", label: "Maximum CPC", billingEvent: "CPC" },
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", billingEvent: "CPA" },
      { value: "TARGET_CPA", label: "Target CPA", billingEvent: "CPA" },
      { value: "MAXIMIZE_CONVERSION_VALUE", label: "Maximize Conversion Value", billingEvent: "ROAS" },
      { value: "TARGET_ROAS", label: "Target ROAS", billingEvent: "ROAS" },
    ],
  },
  {
    value: "AWARENESS_VIDEO_EFFICIENT_REACH",
    label: "Awareness — Video (Efficient Reach)",
    optimizationGoals: [
      { value: "TARGET_CPM", label: "Target CPM", billingEvent: "CPM" },
    ],
  },
  {
    value: "AWARENESS_VIDEO_NON_SKIPPABLE",
    label: "Awareness — Video (Non-skippable Reach)",
    optimizationGoals: [
      { value: "TARGET_CPM", label: "Target CPM", billingEvent: "CPM" },
    ],
  },
  {
    value: "AWARENESS_VIDEO_TARGET_FREQUENCY",
    label: "Awareness — Video (Target Frequency)",
    optimizationGoals: [
      { value: "TARGET_CPM", label: "Target CPM", billingEvent: "CPM" },
    ],
  },
  {
    value: "AWARENESS_AD_SEQUENCE",
    label: "Awareness — Video (Ad Sequence)",
    optimizationGoals: [
      { value: "TARGET_CPM", label: "Target CPM", billingEvent: "CPM" },
    ],
  },
  {
    value: "AWARENESS_VIDEO_VIEWS",
    label: "Awareness — Video Views",
    optimizationGoals: [
      { value: "TARGET_CPM", label: "Target CPM", billingEvent: "CPM" },
    ],
  },
  {
    value: "AWARENESS_AUDIO_REACH",
    label: "Awareness — Audio Reach",
    optimizationGoals: [
      { value: "TARGET_CPM", label: "Target CPM", billingEvent: "CPM" },
    ],
  },
  {
    value: "CONVERSION_SEARCH",
    label: "Conversion — Search",
    optimizationGoals: [
      { value: "MANUAL_CPC", label: "Manual CPC", billingEvent: "CPC" },
      { value: "MAXIMIZE_CLICKS", label: "Maximize Clicks", billingEvent: "CPC" },
      { value: "MAXIMUM_CPC", label: "Maximum CPC", billingEvent: "CPC" },
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", billingEvent: "CPA" },
      { value: "TARGET_CPA", label: "Target CPA", billingEvent: "CPA" },
      { value: "MAXIMIZE_CONVERSION_VALUE", label: "Maximize Conversion Value", billingEvent: "ROAS" },
      { value: "TARGET_ROAS", label: "Target ROAS", billingEvent: "ROAS" },
      { value: "TARGET_IMPRESSION_SHARE", label: "Target Impression Share", billingEvent: "CPM" },
    ],
  },
  {
    value: "CONSIDERATION_PMAX",
    label: "Consideration — Performance Max",
    optimizationGoals: [
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", billingEvent: "CPA" },
      { value: "MAXIMIZE_CONVERSION_VALUE", label: "Maximize Conversion Value", billingEvent: "ROAS" },
      { value: "TARGET_CPA", label: "Target CPA", billingEvent: "CPA" },
      { value: "TARGET_ROAS", label: "Target ROAS", billingEvent: "ROAS" },
    ],
  },
  {
    value: "CONSIDERATION_APP_INSTALLS",
    label: "Consideration — App Installs",
    optimizationGoals: [
      { value: "TARGET_CPA", label: "Target CPA", billingEvent: "CPA" },
      { value: "TARGET_ROAS", label: "Target ROAS", billingEvent: "ROAS" },
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", billingEvent: "CPA" },
    ],
  },
  {
    value: "CONSIDERATION_APP_ENGAGEMENT",
    label: "Consideration — App Engagement",
    optimizationGoals: [
      { value: "TARGET_CPA", label: "Target CPA", billingEvent: "CPA" },
      { value: "TARGET_ROAS", label: "Target ROAS", billingEvent: "ROAS" },
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", billingEvent: "CPA" },
    ],
  },
  {
    value: "CONSIDERATION_APP_PRE_REGISTRATION",
    label: "Consideration — App Pre-registration",
    optimizationGoals: [
      { value: "TARGET_CPA", label: "Target CPA", billingEvent: "CPA" },
      { value: "TARGET_ROAS", label: "Target ROAS", billingEvent: "ROAS" },
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", billingEvent: "CPA" },
    ],
  },
  {
    value: "CONSIDERATION_DEMAND_GEN",
    label: "Consideration — Demand Gen",
    optimizationGoals: [
      { value: "MAXIMIZE_CLICKS", label: "Maximize Clicks", billingEvent: "CPC" },
      { value: "MAXIMUM_CPC", label: "Maximum CPC", billingEvent: "CPC" },
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", billingEvent: "CPA" },
      { value: "TARGET_CPA", label: "Target CPA", billingEvent: "CPA" },
      { value: "MAXIMIZE_CONVERSION_VALUE", label: "Maximize Conversion Value", billingEvent: "ROAS" },
      { value: "TARGET_ROAS", label: "Target ROAS", billingEvent: "ROAS" },
    ],
  },
  {
    value: "CONVERSION_SHOPPING",
    label: "Conversion — Shopping",
    optimizationGoals: [
      { value: "MANUAL_CPC", label: "Manual CPC", billingEvent: "CPC" },
      { value: "MAXIMUM_CPC", label: "Maximum CPC", billingEvent: "CPC" },
      { value: "MAXIMIZE_CLICKS", label: "Maximize Clicks", billingEvent: "CPC" },
      { value: "TARGET_ROAS", label: "Target ROAS", billingEvent: "ROAS" },
    ],
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all objectives for a platform
 */
export function getObjectivesForPlatform(platform: "meta" | "tiktok" | "snapchat" | "google"): ObjectiveMapping[] {
  if (platform === "meta") {
    return [...META_OBJECTIVE_MAPPING, ...META_LEGACY_OBJECTIVES];
  }
  if (platform === "snapchat") {
    return SNAPCHAT_OBJECTIVE_MAPPING;
  }
  if (platform === "google") {
    return GOOGLE_ADS_OBJECTIVE_MAPPING;
  }
  return TIKTOK_OBJECTIVE_MAPPING;
}

/**
 * Get valid optimization goals for a specific objective
 */
export function getOptimizationGoalsForObjective(
  platform: "meta" | "tiktok" | "snapchat" | "google",
  objective: string
): OptimizationGoalOption[] {
  const objectives = getObjectivesForPlatform(platform);
  const found = objectives.find(obj => obj.value === objective);
  return found?.optimizationGoals || [];
}

/**
 * Get the objective that corresponds to an optimization goal (reverse mapping)
 */
export function getObjectiveForOptimizationGoal(
  platform: "meta" | "tiktok" | "snapchat" | "google",
  optimizationGoal: string
): string | null {
  const objectives = getObjectivesForPlatform(platform);
  
  for (const obj of objectives) {
    const hasGoal = obj.optimizationGoals.some(g => g.value === optimizationGoal);
    if (hasGoal) {
      return obj.value;
    }
  }
  return null;
}

/**
 * Validate if an objective and optimization goal combination is valid
 */
export function isValidObjectiveGoalCombination(
  platform: "meta" | "tiktok" | "snapchat" | "google",
  objective: string,
  optimizationGoal: string
): boolean {
  const goals = getOptimizationGoalsForObjective(platform, objective);
  return goals.some(g => g.value === optimizationGoal);
}

/**
 * Get the billing event for an optimization goal under a specific objective
 */
export function getBillingEventForGoal(
  platform: "meta" | "tiktok" | "snapchat" | "google",
  objective: string,
  optimizationGoal: string
): string | undefined {
  const goals = getOptimizationGoalsForObjective(platform, objective);
  const goal = goals.find(g => g.value === optimizationGoal);
  return goal?.billingEvent;
}

/**
 * Get default optimization goal for an objective
 */
export function getDefaultOptimizationGoal(
  platform: "meta" | "tiktok" | "snapchat" | "google",
  objective: string
): string | null {
  const goals = getOptimizationGoalsForObjective(platform, objective);
  return goals.length > 0 ? goals[0].value : null;
}

/**
 * Detect platform from string (e.g., platform name)
 */
export function detectPlatformType(platformName: string): "meta" | "tiktok" | "snapchat" | "google" | null {
  const lower = platformName.toLowerCase();
  if (lower.includes("meta") || lower.includes("facebook") || lower.includes("instagram")) {
    return "meta";
  }
  if (lower.includes("tiktok")) {
    return "tiktok";
  }
  if (lower.includes("google")) {
    return "google";
  }
  if (lower.includes("snapchat") || lower.includes("snap")) {
    return "snapchat";
  }
  return null;
}

/**
 * Auto-correct invalid objective/goal combinations
 * Returns corrected values if needed, or original values if valid
 */
export function autoCorrectObjectiveGoal(
  platform: "meta" | "tiktok" | "snapchat" | "google",
  objective: string,
  optimizationGoal: string
): { objective: string; optimizationGoal: string; corrected: boolean } {
  // If combination is valid, return as-is
  if (isValidObjectiveGoalCombination(platform, objective, optimizationGoal)) {
    return { objective, optimizationGoal, corrected: false };
  }

  // If objective is valid but goal isn't, get default goal for that objective
  const validGoals = getOptimizationGoalsForObjective(platform, objective);
  if (validGoals.length > 0) {
    return { 
      objective, 
      optimizationGoal: validGoals[0].value, 
      corrected: true 
    };
  }

  // If goal is valid, find its objective
  const correctObjective = getObjectiveForOptimizationGoal(platform, optimizationGoal);
  if (correctObjective) {
    return { 
      objective: correctObjective, 
      optimizationGoal, 
      corrected: true 
    };
  }

  // Fallback to defaults
  const objectives = getObjectivesForPlatform(platform);
  const defaultObj = objectives[0];
  return {
    objective: defaultObj.value,
    optimizationGoal: defaultObj.optimizationGoals[0]?.value || "",
    corrected: true
  };
}
