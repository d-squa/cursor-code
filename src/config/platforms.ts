// Platform configuration
// Note: These are public identifiers, not secrets

export const PLATFORM_CONFIG = {
  meta: {
    appId: import.meta.env.VITE_META_APP_ID || "",
    oauthScopes: "ads_management,ads_read,pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights,business_management,catalog_management,read_insights",
    apiVersion: "v21.0",
    // Support for managed accounts
    authType: "reauthenticate",
    responseType: "code"
  }
} as const;
