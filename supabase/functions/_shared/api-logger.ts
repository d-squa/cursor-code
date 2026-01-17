/**
 * API Logger - Logs all external API calls with full URLs and responses
 * 
 * This module provides a standardized way to log API calls for debugging.
 * Every API call logs:
 * 1. The full endpoint URL (before the call)
 * 2. The complete payload with all parameters
 * 3. TikTok context (advertiser_id, identity_id, token context)
 * 4. The response result (after the call)
 */

export interface ApiLogOptions {
  /** Function name for log prefix */
  functionName: string;
  /** HTTP method */
  method: string;
  /** Request body (will be stringified) */
  body?: any;
  /** Additional context for the log */
  context?: string;
}

export interface TikTokApiContext {
  /** TikTok advertiser ID */
  advertiserId?: string;
  /** TikTok identity ID being used */
  identityId?: string;
  /** Identity type (CUSTOMIZED_USER, TIKTOK_ACCOUNT, etc.) */
  identityType?: string;
  /** Token context from oauth (USER or ADVERTISER) */
  tokenContext?: string;
  /** Campaign ID if applicable */
  campaignId?: string;
  /** Ad group ID if applicable */
  adGroupId?: string;
}

/**
 * Log the API request URL before making the call
 */
export function logApiRequest(url: string, options: ApiLogOptions): void {
  const prefix = `[${options.functionName}]`;
  const contextStr = options.context ? ` (${options.context})` : '';
  
  console.log(`${prefix} ═══════════════════════════════════════════════════════════`);
  console.log(`${prefix} 🌐 API REQUEST${contextStr}`);
  console.log(`${prefix} → METHOD: ${options.method}`);
  console.log(`${prefix} → URL: ${url}`);
  
  if (options.body) {
    const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body, null, 2);
    console.log(`${prefix} → PAYLOAD:`);
    console.log(bodyStr);
  }
}

/**
 * Log the API response after receiving it
 */
export function logApiResponse(url: string, response: any, options: ApiLogOptions): void {
  const prefix = `[${options.functionName}]`;
  const contextStr = options.context ? ` (${options.context})` : '';
  
  console.log(`${prefix} ───────────────────────────────────────────────────────────`);
  console.log(`${prefix} 📥 API RESPONSE${contextStr}`);
  console.log(`${prefix} ← URL: ${url}`);
  console.log(`${prefix} ← RESULT:`);
  console.log(typeof response === 'string' ? response : JSON.stringify(response, null, 2));
  console.log(`${prefix} ═══════════════════════════════════════════════════════════`);
}

/**
 * Log TikTok-specific API request with full context
 */
export function logTikTokApiRequest(
  url: string, 
  options: ApiLogOptions,
  tiktokContext: TikTokApiContext
): void {
  const prefix = `[${options.functionName}]`;
  const contextStr = options.context ? ` (${options.context})` : '';
  
  console.log(`${prefix} ═══════════════════════════════════════════════════════════`);
  console.log(`${prefix} 🎵 TIKTOK API REQUEST${contextStr}`);
  console.log(`${prefix} → METHOD: ${options.method}`);
  console.log(`${prefix} → URL: ${url}`);
  console.log(`${prefix} → TIKTOK CONTEXT:`);
  console.log(`${prefix}   • advertiser_id: ${tiktokContext.advertiserId || '(not set)'}`);
  console.log(`${prefix}   • identity_id: ${tiktokContext.identityId || '(not set)'}`);
  console.log(`${prefix}   • identity_type: ${tiktokContext.identityType || '(not set)'}`);
  console.log(`${prefix}   • token_context: ${tiktokContext.tokenContext || '(unknown)'}`);
  if (tiktokContext.campaignId) console.log(`${prefix}   • campaign_id: ${tiktokContext.campaignId}`);
  if (tiktokContext.adGroupId) console.log(`${prefix}   • adgroup_id: ${tiktokContext.adGroupId}`);
  
  if (options.body) {
    const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body, null, 2);
    console.log(`${prefix} → FULL PAYLOAD:`);
    console.log(bodyStr);
  }
}

/**
 * Log TikTok-specific API response
 */
export function logTikTokApiResponse(
  url: string, 
  response: any, 
  options: ApiLogOptions,
  tiktokContext?: TikTokApiContext
): void {
  const prefix = `[${options.functionName}]`;
  const contextStr = options.context ? ` (${options.context})` : '';
  
  console.log(`${prefix} ───────────────────────────────────────────────────────────`);
  console.log(`${prefix} 📥 TIKTOK API RESPONSE${contextStr}`);
  console.log(`${prefix} ← URL: ${url}`);
  if (tiktokContext?.advertiserId) {
    console.log(`${prefix} ← advertiser_id: ${tiktokContext.advertiserId}`);
  }
  console.log(`${prefix} ← RESULT:`);
  console.log(typeof response === 'string' ? response : JSON.stringify(response, null, 2));
  console.log(`${prefix} ═══════════════════════════════════════════════════════════`);
}

/**
 * Wrapper for fetch that automatically logs request and response
 */
export async function fetchWithLogging(
  url: string,
  init: RequestInit,
  options: Omit<ApiLogOptions, 'method'>
): Promise<{ response: Response; data: any }> {
  const method = init.method || 'GET';
  const logOptions: ApiLogOptions = { ...options, method };
  
  // Log the request
  logApiRequest(url, { ...logOptions, body: init.body });
  
  // Make the request
  const response = await fetch(url, init);
  
  // Parse and log the response
  const data = await response.json();
  logApiResponse(url, data, logOptions);
  
  return { response, data };
}

/**
 * Helper to create a logged fetch for a specific function
 */
export function createApiLogger(functionName: string) {
  return {
    logRequest: (url: string, method: string, body?: any, context?: string) => 
      logApiRequest(url, { functionName, method, body, context }),
    
    logResponse: (url: string, response: any, context?: string) => 
      logApiResponse(url, response, { functionName, method: '', context }),
    
    logTikTokRequest: (url: string, method: string, body: any, tiktokContext: TikTokApiContext, context?: string) =>
      logTikTokApiRequest(url, { functionName, method, body, context }, tiktokContext),
    
    logTikTokResponse: (url: string, response: any, tiktokContext?: TikTokApiContext, context?: string) =>
      logTikTokApiResponse(url, response, { functionName, method: '', context }, tiktokContext),
    
    fetch: async (url: string, init: RequestInit, context?: string) =>
      fetchWithLogging(url, init, { functionName, context }),
  };
}
