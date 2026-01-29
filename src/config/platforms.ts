// Platform configuration
// Note: These are public identifiers, not secrets

export const PLATFORM_CONFIG = {
  meta: {
    appId: import.meta.env.VITE_META_APP_ID || "",
    configId: "2625506637799260",
    oauthScopes: "ads_management,ads_read,pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights,business_management,catalog_management",
    managedLoginScopes: "openid,ads_management,ads_read,pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights,business_management,catalog_management",
    apiVersion: "v21.0",
    authType: "reauthenticate",
    responseType: "code"
  },
  /**
   * Meta Ad Library OAuth Configuration
   * 
   * IMPORTANT: The Meta Ad Library API (ads_archive) requires a PURE Facebook Login
   * user token - NOT a business-scoped token from Facebook Login for Business.
   * 
   * Business-scoped tokens (with ads_management, business_management, etc.) cause
   * OAuthException (code 1) errors because Ad Library is intentionally decoupled
   * from business assets like Ad Accounts, Pages, or Business Managers.
   * 
   * This separate OAuth flow captures just `public_profile` scope to get a
   * user-context token that works with the Ad Library API.
   */
  metaAdLibrary: {
    appId: import.meta.env.VITE_META_APP_ID || "",
    // Minimal supported permission (public_profile is implicit). Using `email` avoids
    // Facebook showing "This app needs at least one supported permission" for some app configs.
    oauthScopes: "email",
    apiVersion: "v21.0",
    responseType: "code",
    // Must use www.facebook.com (NOT business.facebook.com)
    authBaseUrl: "https://www.facebook.com"
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
