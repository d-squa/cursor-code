// Platform configuration
// Note: These are public identifiers, not secrets

export const PLATFORM_CONFIG = {
  meta: {
    appId: import.meta.env.VITE_META_APP_ID || "",
    configId: "2625506637799260",
    oauthScopes: "ads_management,ads_read,pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights,business_management,catalog_management,read_insights",
    managedLoginScopes: "openid,ads_management,ads_read,pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights,business_management,catalog_management,read_insights",
    apiVersion: "v21.0",
    authType: "reauthenticate",
    responseType: "code"
  },
  tiktok: {
    appId: import.meta.env.VITE_TIKTOK_APP_ID || "",
    oauthScopes: "ad_management,user.info.basic",
    authEndpoint: "https://business-api.tiktok.com/portal/auth",
    tokenEndpoint: "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
    apiVersion: "v1.3",
    responseType: "code"
  }
} as const;
