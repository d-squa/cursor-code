/**
 * Destination/Optimization Location configuration options for Meta and TikTok
 * These options define where the optimization occurs and what destination-specific fields are required
 */

// =============================================================================
// META DESTINATION OPTIONS
// =============================================================================

export const META_OPTIMIZATION_LOCATIONS = [
  { value: "WEBSITE", label: "Website" },
  { value: "APP", label: "App" },
  { value: "MESSAGING_APPS", label: "Messaging Apps" },
  { value: "CALLS", label: "Calls" },
] as const;

export const META_APP_STORES = [
  { value: "GOOGLE_PLAY", label: "Google Play Store" },
  { value: "ITUNES", label: "Apple App Store" },
  { value: "ITUNES_IPAD", label: "Apple App Store for iPad" },
  { value: "FB_CANVAS", label: "Facebook Canvas" },
  { value: "AMAZON_APP_STORE", label: "Amazon Appstore" },
  { value: "WINDOWS_10_STORE", label: "Games" },
  { value: "OCULUS_APP_STORE", label: "Meta Quest App Store" },
] as const;

export const META_MESSAGING_MODES = [
  { value: "AUTOMATIC", label: "Automatic (Recommended)" },
  { value: "MANUAL", label: "Manual" },
] as const;

// =============================================================================
// TIKTOK DESTINATION OPTIONS
// =============================================================================

export const TIKTOK_OPTIMIZATION_LOCATIONS = [
  { value: "Website", label: "Website" },
  { value: "App", label: "App" },
  { value: "TikTok Shop", label: "TikTok Shop" },
  { value: "Instant Form", label: "Instant Form" },
  { value: "TikTok Direct Messages", label: "TikTok Direct Messages" },
  { value: "Instant Messaging Apps", label: "Instant Messaging Apps" },
  { value: "Phone Call", label: "Phone Call" },
  { value: "TikTok Instant Page", label: "TikTok Instant Page" },
  { value: "Website & App", label: "Website & App" },
] as const;

export interface TikTokMessagingApp {
  value: string;
  label: string;
  requiredFields: string[];
  conversationFields: string[];
  description: string;
}

export const TIKTOK_MESSAGING_APPS: TikTokMessagingApp[] = [
  { 
    value: "MESSENGER", 
    label: "Messenger",
    requiredFields: ["facebook_page_id"],
    conversationFields: ["message_event_set"],
    description: "Requires Facebook Page ID. Message event set required for conversation goals."
  },
  { 
    value: "WHATSAPP", 
    label: "WhatsApp",
    requiredFields: ["whatsapp_number"],
    conversationFields: ["message_event_set"],
    description: "Requires WhatsApp number. Message event set required for conversation goals."
  },
  { 
    value: "ZALO", 
    label: "Zalo",
    requiredFields: ["zalo_account_id"],
    conversationFields: [],
    description: "Requires Zalo Official Account ID or phone number."
  },
  { 
    value: "LINE", 
    label: "LINE",
    requiredFields: ["line_business_id"],
    conversationFields: [],
    description: "Requires LINE Business ID."
  },
  { 
    value: "URL", 
    label: "Instant Messaging URL",
    requiredFields: [],
    conversationFields: [],
    description: "No additional configuration required."
  },
];

// =============================================================================
// OBJECTIVE TO DESTINATION MAPPING
// =============================================================================

/**
 * Maps objectives to their valid optimization locations for Meta
 * Based on Meta Marketing API documentation:
 * - OUTCOME_AWARENESS: No destination selection (ad recall, impressions, reach)
 * - OUTCOME_TRAFFIC: Website, App, Messaging Apps, Calls
 * - OUTCOME_ENGAGEMENT: No destination selection (post engagement, page likes, video views)
 * - OUTCOME_LEADS: Website, App, Messaging Apps, Calls (Instant Forms)
 * - OUTCOME_APP_PROMOTION: App only
 * - OUTCOME_SALES: Website, App, Messaging Apps
 */
export const META_OBJECTIVE_DESTINATIONS: Record<string, string[]> = {
  "OUTCOME_AWARENESS": [], // No destination - awareness objectives use impressions/reach
  "OUTCOME_TRAFFIC": ["WEBSITE", "APP", "MESSAGING_APPS", "CALLS"],
  "OUTCOME_ENGAGEMENT": ["WEBSITE", "APP", "MESSAGING_APPS", "CALLS"], // Destinations depend on optimization goal
  "OUTCOME_LEADS": ["WEBSITE", "APP", "MESSAGING_APPS", "CALLS"],
  "OUTCOME_APP_PROMOTION": ["APP"],
  "OUTCOME_SALES": ["WEBSITE", "APP", "MESSAGING_APPS"],
};

/**
 * Maps Meta optimization goals to their required destination
 * Some goals require a specific destination to be selected
 */
export const META_OPTIMIZATION_GOAL_DESTINATIONS: Record<string, string | null> = {
  // On Your Ad - no destination required
  "THRUPLAY": null,
  "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS": null,
  "POST_ENGAGEMENT": null,
  "EVENT_RESPONSES": null,
  "PAGE_LIKES": null,
  // Destination-specific goals
  "CONVERSATIONS": "MESSAGING_APPS",
  "QUALITY_CALL": "CALLS",
  "LANDING_PAGE_VIEWS": "WEBSITE",
  "LINK_CLICKS": "WEBSITE",
  "APP_INSTALLS": "APP",
  // Traffic objective - these show optimization location
  "REACH": "WEBSITE", // Reach (Daily Unique) requires destination
  "IMPRESSIONS": "WEBSITE", // Impressions requires destination
  // Awareness - no destination
  "AD_RECALL_LIFT": null,
  // Lead Generation
  "LEAD_GENERATION": null, // Instant Forms - no destination selection
  "LEAD_GENERATION_APP": "APP", // Leads via App
  "OFFSITE_CONVERSIONS": null, // Shows all available destinations (Website, App, Messaging, Calls)
  "APP_EVENTS": "APP",
  "VALUE": null,
};

/**
 * Get the required destination for a Meta optimization goal
 */
export function getDestinationForOptimizationGoal(optimizationGoal: string): string | null {
  return META_OPTIMIZATION_GOAL_DESTINATIONS[optimizationGoal] ?? null;
}

/**
 * Maps objectives to their valid optimization locations for TikTok
 * Based on TikTok Marketing API documentation:
 * - REACH: No destination selection (CPM-based reach campaigns)
 * - TRAFFIC: Website, App
 * - VIDEO_VIEWS: No destination selection (video view optimization only)
 * - COMMUNITY_INTERACTION: No destination selection (profile visits, follows)
 * - APP_PROMOTION: App only
 * - LEAD_GENERATION: Website, Instant Form, TikTok Direct Messages, Instant Messaging Apps, Phone Call
 * - CONVERSIONS: Website, App, TikTok Instant Page, Website & App
 * - PRODUCT_SALES: Website, TikTok Shop, Website & App
 */
export const TIKTOK_OBJECTIVE_DESTINATIONS: Record<string, string[]> = {
  "REACH": [], // No destination selection for REACH
  "TRAFFIC": ["Website", "App"],
  "VIDEO_VIEWS": [], // No destination selection
  "COMMUNITY_INTERACTION": [], // No destination selection
  "APP_PROMOTION": ["App"],
  "LEAD_GENERATION": ["Website", "Instant Form", "TikTok Direct Messages", "Instant Messaging Apps", "Phone Call"],
  "CONVERSIONS": ["Website", "App", "TikTok Instant Page", "Website & App"],
  "PRODUCT_SALES": ["Website", "TikTok Shop", "Website & App"],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get valid optimization locations for a given objective and platform
 */
export function getDestinationsForObjective(
  platform: "meta" | "tiktok",
  objective: string
): Array<{ value: string; label: string }> {
  const mapping = platform === "meta" ? META_OBJECTIVE_DESTINATIONS : TIKTOK_OBJECTIVE_DESTINATIONS;
  const locations = platform === "meta" ? META_OPTIMIZATION_LOCATIONS : TIKTOK_OPTIMIZATION_LOCATIONS;
  
  const validDestinations = mapping[objective] || [];
  
  if (validDestinations.length === 0) {
    return []; // No destination selection for this objective
  }
  
  return locations.filter(loc => validDestinations.includes(loc.value));
}

/**
 * Check if a destination requires app configuration
 */
export function destinationRequiresApp(
  platform: "meta" | "tiktok",
  destination: string
): boolean {
  if (platform === "meta") {
    return destination === "APP";
  }
  return destination === "App" || destination === "Website & App";
}

/**
 * Check if a destination requires messaging configuration
 */
export function destinationRequiresMessaging(
  platform: "meta" | "tiktok",
  destination: string
): boolean {
  if (platform === "meta") {
    return destination === "MESSAGING_APPS";
  }
  return destination === "Instant Messaging Apps";
}

/**
 * Check if a destination requires website URL
 */
export function destinationRequiresWebsite(
  platform: "meta" | "tiktok",
  destination: string
): boolean {
  if (platform === "meta") {
    return destination === "WEBSITE";
  }
  return destination === "Website" || destination === "Website & App" || destination === "TikTok Instant Page";
}

/**
 * Get required fields for a TikTok messaging app
 */
export function getTikTokMessagingAppFields(
  messagingApp: string,
  optimizationGoal?: string
): string[] {
  const app = TIKTOK_MESSAGING_APPS.find(a => a.value === messagingApp);
  if (!app) return [];
  
  const fields = [...app.requiredFields];
  
  // Add conversation fields if the goal is conversation-related
  if (optimizationGoal && ["MESSAGING", "CONVERSATION", "CONVERT"].includes(optimizationGoal.toUpperCase())) {
    fields.push(...app.conversationFields);
  }
  
  return fields;
}

/**
 * Get label for an app store
 */
export function getAppStoreLabel(storeValue: string): string {
  const store = META_APP_STORES.find(s => s.value === storeValue);
  return store?.label || storeValue;
}

/**
 * Get label for a TikTok messaging app
 */
export function getMessagingAppLabel(appValue: string): string {
  const app = TIKTOK_MESSAGING_APPS.find(a => a.value === appValue);
  return app?.label || appValue;
}
