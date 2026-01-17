/**
 * API Logger - Logs all external API calls with full URLs and responses
 * 
 * This module provides a standardized way to log API calls for debugging.
 * Every API call logs:
 * 1. The full endpoint URL (before the call)
 * 2. The response result (after the call)
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

/**
 * Log the API request URL before making the call
 */
export function logApiRequest(url: string, options: ApiLogOptions): void {
  const prefix = `[${options.functionName}]`;
  const contextStr = options.context ? ` (${options.context})` : '';
  
  console.log(`${prefix} 🌐 API REQUEST${contextStr}:`);
  console.log(`${prefix} → URL: ${options.method} ${url}`);
  
  if (options.body) {
    const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    console.log(`${prefix} → BODY: ${bodyStr}`);
  }
}

/**
 * Log the API response after receiving it
 */
export function logApiResponse(url: string, response: any, options: ApiLogOptions): void {
  const prefix = `[${options.functionName}]`;
  const contextStr = options.context ? ` (${options.context})` : '';
  
  console.log(`${prefix} 📥 API RESPONSE${contextStr}:`);
  console.log(`${prefix} ← URL: ${url}`);
  console.log(`${prefix} ← RESULT: ${typeof response === 'string' ? response : JSON.stringify(response)}`);
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
    
    fetch: async (url: string, init: RequestInit, context?: string) =>
      fetchWithLogging(url, init, { functionName, context }),
  };
}
