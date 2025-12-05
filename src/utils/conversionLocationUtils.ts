/**
 * Utility functions for handling conversion location data
 * Converts between flat database fields and structured ConfiguredLocation objects
 */

import { 
  META_OPTIMIZATION_LOCATIONS, 
  TIKTOK_OPTIMIZATION_LOCATIONS 
} from "./destinationOptions";

export interface ConversionLocationData {
  landingPageUrl?: string;
  appStore?: string;
  appId?: string;
  appName?: string;
  messagingMode?: string;
  messengerEnabled?: boolean;
  instagramDmEnabled?: boolean;
  whatsappEnabled?: boolean;
  whatsappNumber?: string;
  messagingApp?: string;
  facebookPageId?: string;
  messageEventSet?: string;
  zaloAccountId?: string;
  lineBusinessId?: string;
}

export interface ConfiguredLocation {
  locationType: string;
  data: ConversionLocationData;
}

interface FlatDefaults {
  default_landing_page_url?: string | null;
  default_app_store?: string | null;
  default_app_id?: string | null;
  default_app_name?: string | null;
  default_messaging_mode?: string | null;
  default_messenger_enabled?: boolean | null;
  default_instagram_dm_enabled?: boolean | null;
  default_whatsapp_enabled?: boolean | null;
  default_whatsapp_number?: string | null;
  default_messaging_app?: string | null;
  default_facebook_page_id?: string | null;
  default_message_event_set?: string | null;
  default_zalo_account_id?: string | null;
  default_line_business_id?: string | null;
}

/**
 * Extract configured locations from flat defaults for Meta
 */
export function extractMetaLocations(defaults: FlatDefaults): ConfiguredLocation[] {
  const locations: ConfiguredLocation[] = [];
  
  // Website - configured if landing page URL is set
  if (defaults.default_landing_page_url) {
    locations.push({
      locationType: "WEBSITE",
      data: {
        landingPageUrl: defaults.default_landing_page_url,
      }
    });
  }
  
  // App - configured if app store is set
  if (defaults.default_app_store) {
    locations.push({
      locationType: "APP",
      data: {
        appStore: defaults.default_app_store,
        appId: defaults.default_app_id || undefined,
        appName: defaults.default_app_name || undefined,
      }
    });
  }
  
  // Messaging - configured if messaging mode is set
  if (defaults.default_messaging_mode) {
    locations.push({
      locationType: "MESSAGING_APPS",
      data: {
        messagingMode: defaults.default_messaging_mode,
        messengerEnabled: defaults.default_messenger_enabled || false,
        instagramDmEnabled: defaults.default_instagram_dm_enabled || false,
        whatsappEnabled: defaults.default_whatsapp_enabled || false,
        whatsappNumber: defaults.default_whatsapp_number || undefined,
      }
    });
  }
  
  // Calls - always considered configured (uses page from other settings)
  // We'll add it as configured if the user explicitly adds it
  
  return locations;
}

/**
 * Extract configured locations from flat defaults for TikTok
 */
export function extractTiktokLocations(defaults: FlatDefaults): ConfiguredLocation[] {
  const locations: ConfiguredLocation[] = [];
  
  // Website - configured if landing page URL is set
  if (defaults.default_landing_page_url) {
    locations.push({
      locationType: "Website",
      data: {
        landingPageUrl: defaults.default_landing_page_url,
      }
    });
  }
  
  // App - configured if app ID is set
  if (defaults.default_app_id) {
    locations.push({
      locationType: "App",
      data: {
        appId: defaults.default_app_id,
        appName: defaults.default_app_name || undefined,
      }
    });
  }
  
  // Instant Messaging Apps - configured if messaging app is set
  if (defaults.default_messaging_app) {
    locations.push({
      locationType: "Instant Messaging Apps",
      data: {
        messagingApp: defaults.default_messaging_app,
        facebookPageId: defaults.default_facebook_page_id || undefined,
        messageEventSet: defaults.default_message_event_set || undefined,
        whatsappNumber: defaults.default_whatsapp_number || undefined,
        zaloAccountId: defaults.default_zalo_account_id || undefined,
        lineBusinessId: defaults.default_line_business_id || undefined,
      }
    });
  }
  
  return locations;
}

/**
 * Convert location data to flat defaults for Meta
 */
export function metaLocationToDefaults(
  locationType: string, 
  data: ConversionLocationData
): Partial<FlatDefaults> {
  switch (locationType) {
    case "WEBSITE":
      return {
        default_landing_page_url: data.landingPageUrl || null,
      };
    case "APP":
      return {
        default_app_store: data.appStore || null,
        default_app_id: data.appId || null,
        default_app_name: data.appName || null,
      };
    case "MESSAGING_APPS":
      return {
        default_messaging_mode: data.messagingMode || null,
        default_messenger_enabled: data.messengerEnabled || false,
        default_instagram_dm_enabled: data.instagramDmEnabled || false,
        default_whatsapp_enabled: data.whatsappEnabled || false,
        default_whatsapp_number: data.whatsappNumber || null,
      };
    case "CALLS":
      // Calls uses the page from other settings, no specific fields
      return {};
    default:
      return {};
  }
}

/**
 * Convert location data to flat defaults for TikTok
 */
export function tiktokLocationToDefaults(
  locationType: string, 
  data: ConversionLocationData
): Partial<FlatDefaults> {
  switch (locationType) {
    case "Website":
    case "TikTok Instant Page":
      return {
        default_landing_page_url: data.landingPageUrl || null,
      };
    case "App":
      return {
        default_app_id: data.appId || null,
        default_app_name: data.appName || null,
      };
    case "Website & App":
      return {
        default_landing_page_url: data.landingPageUrl || null,
        default_app_id: data.appId || null,
        default_app_name: data.appName || null,
      };
    case "Instant Messaging Apps":
      return {
        default_messaging_app: data.messagingApp || null,
        default_facebook_page_id: data.facebookPageId || null,
        default_message_event_set: data.messageEventSet || null,
        default_whatsapp_number: data.whatsappNumber || null,
        default_zalo_account_id: data.zaloAccountId || null,
        default_line_business_id: data.lineBusinessId || null,
      };
    case "TikTok Direct Messages":
    case "Phone Call":
    case "Instant Form":
    case "TikTok Shop":
      // These have no configurable sub-fields at defaults level
      return {};
    default:
      return {};
  }
}

/**
 * Get fields to clear when deleting a location for Meta
 */
export function getMetaLocationClearFields(locationType: string): (keyof FlatDefaults)[] {
  switch (locationType) {
    case "WEBSITE":
      return ["default_landing_page_url"];
    case "APP":
      return ["default_app_store", "default_app_id", "default_app_name"];
    case "MESSAGING_APPS":
      return [
        "default_messaging_mode",
        "default_messenger_enabled",
        "default_instagram_dm_enabled",
        "default_whatsapp_enabled",
        "default_whatsapp_number",
      ];
    default:
      return [];
  }
}

/**
 * Get fields to clear when deleting a location for TikTok
 */
export function getTiktokLocationClearFields(locationType: string): (keyof FlatDefaults)[] {
  switch (locationType) {
    case "Website":
    case "TikTok Instant Page":
      return ["default_landing_page_url"];
    case "App":
      return ["default_app_id", "default_app_name"];
    case "Website & App":
      return ["default_landing_page_url", "default_app_id", "default_app_name"];
    case "Instant Messaging Apps":
      return [
        "default_messaging_app",
        "default_facebook_page_id",
        "default_message_event_set",
        "default_whatsapp_number",
        "default_zalo_account_id",
        "default_line_business_id",
      ];
    default:
      return [];
  }
}
