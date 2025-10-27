// Platform configuration
// Note: These are public identifiers, not secrets

export const PLATFORM_CONFIG = {
  meta: {
    appId: import.meta.env.VITE_META_APP_ID || "",
    oauthScopes: "ads_management,pages_read_engagement,instagram_basic,instagram_manage_insights",
    apiVersion: "v21.0"
  }
} as const;
