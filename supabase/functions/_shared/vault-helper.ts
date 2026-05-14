/**
 * Vault Helper - Secure token storage and retrieval
 * 
 * This module provides functions to store and retrieve OAuth tokens
 * from Supabase Vault instead of database columns.
 */

// Using 'any' type for Supabase client to avoid cross-import type conflicts

/**
 * Store a platform token in Supabase Vault
 * @param supabase - Supabase client with service role key
 * @param platformId - UUID of the connected platform
 * @param tokenValue - The token value to store
 * @param tokenType - Type of token ('access' or 'refresh')
 */
export async function storePlatformToken(
  supabase: any,
  platformId: string,
  tokenValue: string,
  tokenType: 'access' | 'refresh' = 'access'
): Promise<void> {
  const { error } = await supabase.rpc('store_platform_token', {
    platform_id: platformId,
    token_value: tokenValue,
    token_type: tokenType
  });

  if (error) {
    console.error(`Failed to store ${tokenType} token in Vault:`, error.message);
    throw new Error(`Failed to store token securely: ${error.message}`);
  }

  console.log(`Successfully stored ${tokenType} token in Vault for platform ${platformId}`);
}

/**
 * Retrieve a platform token from Supabase Vault
 * @param supabase - Supabase client with service role key
 * @param platformId - UUID of the connected platform
 * @param tokenType - Type of token ('access' or 'refresh')
 * @returns The token value or null if not found
 */
export async function getPlatformToken(
  supabase: any,
  platformId: string,
  tokenType: 'access' | 'refresh' = 'access'
): Promise<string | null> {
  console.log(`Attempting to retrieve ${tokenType} token from Vault for platform ${platformId}`);
  
  const { data, error } = await supabase.rpc('get_platform_token', {
    platform_id: platformId,
    token_type: tokenType
  });

  if (error) {
    console.error(`Failed to retrieve ${tokenType} token from Vault:`, error.message, error.code, error.details);
    return null;
  }

  if (data) {
    console.log(`Successfully retrieved ${tokenType} token from Vault for platform ${platformId}`);
  } else {
    console.log(`No ${tokenType} token found in Vault for platform ${platformId}`);
  }

  return data as string | null;
}

/**
 * Get access token for a platform, with fallback to database column
 * This is a transitional helper for gradual migration
 * @param supabase - Supabase client with service role key
 * @param platformId - UUID of the connected platform
 * @param fallbackToken - Optional fallback token from database column
 * @returns The access token
 */
export async function getAccessToken(
  supabase: any,
  platformId: string,
  fallbackToken?: string | null
): Promise<string | null> {
  // First try Vault
  const vaultToken = await getPlatformToken(supabase, platformId, 'access');
  
  if (vaultToken) {
    return vaultToken;
  }

  // Fall back to database column during migration period
  if (fallbackToken) {
    console.log('Using fallback token from database column - migration pending');
    return fallbackToken;
  }

  return null;
}

/** Result of resolving a Google Ads access token (Vault + refresh). */
export type GoogleAdsTokenResolution =
  | { ok: true; accessToken: string }
  | { ok: false; message: string; remediation: string };

/**
 * Resolve Google Ads access token with Vault + optional DB fallback + refresh when near expiry.
 * Returns structured errors so Edge Functions can surface fixable paths (vs generic "null token").
 */
export async function resolveGoogleAdsAccessToken(
  supabase: any,
  platformId: string,
  fallbackToken?: string | null,
): Promise<GoogleAdsTokenResolution> {
  const accessRpc = await supabase.rpc("get_platform_token", {
    platform_id: platformId,
    token_type: "access",
  });
  if (accessRpc.error) {
    console.error(
      `[resolveGoogleAdsAccessToken] Vault RPC error for access (platform ${platformId}):`,
      accessRpc.error.message,
      accessRpc.error.code,
    );
    return {
      ok: false,
      message: `Vault RPC failed when reading Google access token: ${accessRpc.error.message}`,
      remediation:
        "Confirm get_platform_token exists, Vault is enabled, and this Edge Function uses SUPABASE_SERVICE_ROLE_KEY (store/get RPCs require service_role). Check Postgres logs for details.",
    };
  }

  let accessToken: string | null =
    typeof accessRpc.data === "string" && accessRpc.data.length > 0 ? accessRpc.data : null;
  if (!accessToken && fallbackToken) {
    console.log(
      `[resolveGoogleAdsAccessToken] Using connected_platforms.access_token fallback for platform ${platformId}`,
    );
    accessToken = fallbackToken;
  }

  if (!accessToken) {
    const refreshRpc = await supabase.rpc("get_platform_token", {
      platform_id: platformId,
      token_type: "refresh",
    });
    const hasRefresh =
      !refreshRpc.error && typeof refreshRpc.data === "string" && refreshRpc.data.length > 0;
    return {
      ok: false,
      message: hasRefresh
        ? "No Google access token in Vault or DB, but a refresh token exists in Vault (inconsistent state)."
        : "No Google access token in Vault and connected_platforms.access_token is empty.",
      remediation: hasRefresh
        ? "Reconnect Google Ads from Platform Connections, or re-run google-ads-oauth-callback for this platform id so access is stored again."
        : "Complete Google Ads OAuth from Platform Connections (offline + consent). After google-ads-oauth-callback returns success, Vault must contain platform_access_token_<uuid>.",
    };
  }

  const { data: platform } = await supabase
    .from("connected_platforms")
    .select("token_expires_at")
    .eq("id", platformId)
    .maybeSingle();

  if (platform?.token_expires_at) {
    const expiresAt = new Date(platform.token_expires_at);
    const now = new Date();
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      console.log(
        `[resolveGoogleAdsAccessToken] Token expiring soon or expired for platform ${platformId}, attempting refresh...`,
      );
      const refreshedToken = await refreshGoogleToken(supabase, platformId);
      if (refreshedToken) {
        return { ok: true, accessToken: refreshedToken };
      }

      const refreshAgain = await supabase.rpc("get_platform_token", {
        platform_id: platformId,
        token_type: "refresh",
      });
      const noRefresh =
        refreshAgain.error ||
        typeof refreshAgain.data !== "string" ||
        refreshAgain.data.length === 0;
      if (noRefresh) {
        return {
          ok: false,
          message:
            "Google access token is expired or expiring and no refresh token is stored in Vault for this connection.",
          remediation:
            "Reconnect Google Ads with consent (app already sends access_type=offline and prompt=consent). Revoke the app in Google Account permissions if Google keeps omitting refresh_token.",
        };
      }
      return {
        ok: false,
        message:
          "Google access token is expired or expiring and token refresh failed (invalid refresh, revoked client, or missing GOOGLE_ADS_OAUTH_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET on the Edge runtime).",
        remediation:
          "Check Edge Function secrets match your Google Cloud OAuth client, inspect logs for 'Google token refresh failed', then reconnect Google Ads.",
      };
    }
  }

  return { ok: true, accessToken };
}

/**
 * Get access token with automatic refresh for Google OAuth tokens.
 * If the access token fails (expired), uses the refresh token to get a new one.
 * @param supabase - Supabase client with service role key
 * @param platformId - UUID of the connected platform
 * @param fallbackToken - Optional fallback token from database column
 * @param platformType - Platform type to determine refresh strategy
 * @returns The access token (refreshed if needed)
 */
export async function getAccessTokenWithRefresh(
  supabase: any,
  platformId: string,
  fallbackToken?: string | null,
  platformType?: string
): Promise<string | null> {
  if (platformType === "google") {
    const r = await resolveGoogleAdsAccessToken(supabase, platformId, fallbackToken);
    return r.ok ? r.accessToken : null;
  }

  const accessToken = await getAccessToken(supabase, platformId, fallbackToken);
  if (!accessToken) {
    return null;
  }

  return accessToken;
}

/**
 * Refresh a Google OAuth access token using the stored refresh token
 */
async function refreshGoogleToken(
  supabase: any,
  platformId: string
): Promise<string | null> {
  try {
    const refreshToken = await getPlatformToken(supabase, platformId, 'refresh');
    if (!refreshToken) {
      console.error('No refresh token found in Vault for Google platform', platformId);
      return null;
    }

    // Get Google OAuth credentials from environment
    // These are available in the edge function runtime
    const clientId = (globalThis as any).Deno?.env?.get?.('GOOGLE_ADS_OAUTH_CLIENT_ID');
    const clientSecret = (globalThis as any).Deno?.env?.get?.('GOOGLE_ADS_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('Google OAuth credentials not available for token refresh');
      return null;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Google token refresh failed:', errorData);
      return null;
    }

    const tokenData = await response.json();
    const newAccessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 3600;

    // Store the new access token in Vault
    await storePlatformToken(supabase, platformId, newAccessToken, 'access');

    // Update token_expires_at in the platform record
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    await supabase
      .from('connected_platforms')
      .update({ token_expires_at: newExpiresAt, updated_at: new Date().toISOString() })
      .eq('id', platformId);

    console.log(`Successfully refreshed Google token for platform ${platformId}`);
    return newAccessToken;
  } catch (error: any) {
    console.error('Error refreshing Google token:', error.message);
    return null;
  }
}

/**
 * Store page access token in Supabase Vault
 * @param supabase - Supabase client with service role key
 * @param pageId - UUID of the meta page record
 * @param tokenValue - The page access token value
 */
export async function storePageToken(
  supabase: any,
  pageId: string,
  tokenValue: string
): Promise<void> {
  const secretName = `page_access_token_${pageId}`;
  
  // Use raw SQL to store in Vault since we don't have a dedicated function for pages
  const { error } = await supabase.rpc('store_platform_token', {
    platform_id: pageId,
    token_value: tokenValue,
    token_type: 'access'
  });

  if (error) {
    console.error(`Failed to store page token in Vault:`, error.message);
    // Don't throw - page tokens are less critical
  }
}

/**
 * Store Ad Library user token in Supabase Vault
 * 
 * This stores a PURE Facebook Login token (public_profile only) that works
 * with the Meta Ad Library API. This is separate from business tokens.
 * 
 * @param supabase - Supabase client with service role key
 * @param userId - UUID of the user
 * @param tokenValue - The pure user access token
 */
export async function storeAdLibraryToken(
  supabase: any,
  userId: string,
  tokenValue: string
): Promise<void> {
  const secretName = `adlibrary_user_token_${userId}`;
  
  // Check if secret already exists
  const { data: existingSecret } = await supabase
    .rpc('get_vault_secret_id', { secret_name: secretName });
  
  if (existingSecret) {
    // Update existing secret
    const { error } = await supabase.rpc('update_vault_secret', {
      secret_id: existingSecret,
      new_value: tokenValue
    });
    if (error) {
      console.error(`Failed to update Ad Library token in Vault:`, error.message);
      throw new Error(`Failed to update Ad Library token: ${error.message}`);
    }
  } else {
    // Create new secret using vault.create_secret
    const { error } = await supabase.rpc('create_vault_secret', {
      secret_value: tokenValue,
      secret_name: secretName
    });
    if (error) {
      console.error(`Failed to store Ad Library token in Vault:`, error.message);
      throw new Error(`Failed to store Ad Library token: ${error.message}`);
    }
  }
  
  console.log(`Successfully stored Ad Library token in Vault for user ${userId}`);
}

/**
 * Retrieve Ad Library user token from Supabase Vault
 * 
 * @param supabase - Supabase client with service role key
 * @param userId - UUID of the user
 * @returns The Ad Library user token or null if not found
 */
export async function getAdLibraryToken(
  supabase: any,
  userId: string
): Promise<string | null> {
  const secretName = `adlibrary_user_token_${userId}`;
  
  console.log(`Attempting to retrieve Ad Library token from Vault for user ${userId}`);
  
  const { data, error } = await supabase.rpc('get_vault_secret', {
    secret_name: secretName
  });

  if (error) {
    console.error(`Failed to retrieve Ad Library token from Vault:`, error.message);
    return null;
  }

  if (data) {
    console.log(`Successfully retrieved Ad Library token from Vault for user ${userId}`);
  } else {
    console.log(`No Ad Library token found in Vault for user ${userId}`);
  }

  return data as string | null;
}
