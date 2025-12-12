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
