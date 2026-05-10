import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { storePlatformToken } from "../_shared/vault-helper.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const FUNCTION_NAME = "google-ads-oauth-callback";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const oauthInputSchema = z.object({
  code: z.string().min(1).max(2000),
  redirectUri: z.string().url(),
  platformId: z.string().uuid().optional().nullable(),
});

// Google Ads API version
const GOOGLE_ADS_API_VERSION = "v23";

/**
 * Fetch accessible Google Ads customer accounts using the Google Ads API.
 * Uses the `listAccessibleCustomers` endpoint first, then fetches details for each.
 */
async function fetchGoogleAdsAccounts(
  accessToken: string,
  developerToken: string
): Promise<{ accounts: any[]; managerCustomerId: string | null }> {
  console.log(`[${FUNCTION_NAME}] Fetching accessible Google Ads customers...`);

  // Step 1: List accessible customers
  const listUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`;
  console.log(`[${FUNCTION_NAME}] listAccessibleCustomers URL: ${listUrl}`);
  console.log(`[${FUNCTION_NAME}] developer-token length: ${developerToken?.length}, starts with: ${developerToken?.substring(0, 5)}`);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };

  const listResponse = await fetch(listUrl, { headers });
  console.log(`[${FUNCTION_NAME}] listAccessibleCustomers response status: ${listResponse.status}`);

  if (!listResponse.ok) {
    const errorBody = await listResponse.text();
    console.error(`[${FUNCTION_NAME}] listAccessibleCustomers failed:`, errorBody);
    throw new Error(`Failed to list accessible customers: ${listResponse.status} - ${errorBody}`);
  }

  const listData = await listResponse.json();
  const resourceNames: string[] = listData.resourceNames || [];
  console.log(`[${FUNCTION_NAME}] Found ${resourceNames.length} accessible customers`);

  if (resourceNames.length === 0) {
    return { accounts: [], managerCustomerId: null };
  }

  // Extract customer IDs from resource names (format: "customers/1234567890")
  const customerIds = resourceNames.map((rn: string) => rn.split("/")[1]);

  // Step 2: Fetch details for each directly accessible customer
  const accounts: any[] = [];
  const seenCustomerIds = new Set<string>();
  let detectedManagerId: string | null = null;
  const managerIds: string[] = [];

  for (const customerId of customerIds) {
    try {
      const queryUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;
      
      const queryHeaders: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      };

      const query = `
        SELECT
          customer.id,
          customer.descriptive_name,
          customer.currency_code,
          customer.time_zone,
          customer.manager,
          customer.status,
          customer.test_account
        FROM customer
        LIMIT 1
      `;

      const queryResponse = await fetch(queryUrl, {
        method: "POST",
        headers: queryHeaders,
        body: JSON.stringify({ query }),
      });

      if (!queryResponse.ok) {
        const errorBody = await queryResponse.text();
        console.warn(`[${FUNCTION_NAME}] Failed to query customer ${customerId}:`, errorBody);
        
        if (!seenCustomerIds.has(customerId)) {
          seenCustomerIds.add(customerId);
          accounts.push({
            customer_id: customerId,
            name: `Account ${customerId}`,
            currency: "USD",
            timezone: "UTC",
            is_manager: false,
            status: "UNKNOWN",
            is_test_account: false,
          });
        }
        continue;
      }

      const queryData = await queryResponse.json();
      const results = queryData[0]?.results || queryData?.results || [];
      const customer = results[0]?.customer;

      if (customer) {
        const isManager = customer.manager === true;
        const cid = customer.id?.toString() || customerId;
        
        if (isManager) {
          managerIds.push(cid);
          if (!detectedManagerId) {
            detectedManagerId = cid;
            console.log(`[${FUNCTION_NAME}] Detected manager account: ${customer.descriptiveName} (${cid})`);
          }
        }

        if (!seenCustomerIds.has(cid)) {
          seenCustomerIds.add(cid);
          accounts.push({
            customer_id: cid,
            name: customer.descriptiveName || `Account ${customerId}`,
            currency: customer.currencyCode || "USD",
            timezone: customer.timeZone || "UTC",
            is_manager: isManager,
            status: customer.status || "UNKNOWN",
            is_test_account: customer.testAccount === true,
          });
        }
      } else if (!seenCustomerIds.has(customerId)) {
        seenCustomerIds.add(customerId);
        accounts.push({
          customer_id: customerId,
          name: `Account ${customerId}`,
          currency: "USD",
          timezone: "UTC",
          is_manager: false,
          status: "UNKNOWN",
          is_test_account: false,
        });
      }
    } catch (err) {
      console.error(`[${FUNCTION_NAME}] Error fetching customer ${customerId}:`, err);
      if (!seenCustomerIds.has(customerId)) {
        seenCustomerIds.add(customerId);
        accounts.push({
          customer_id: customerId,
          name: `Account ${customerId}`,
          currency: "USD",
          timezone: "UTC",
          is_manager: false,
          status: "UNKNOWN",
          is_test_account: false,
        });
      }
    }
  }

  // Step 3: For each manager account, fetch sub-accounts (client accounts under MCC)
  for (const managerId of managerIds) {
    try {
      console.log(`[${FUNCTION_NAME}] Fetching sub-accounts under manager ${managerId}...`);
      const queryUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${managerId}/googleAds:searchStream`;
      
      const queryHeaders: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "login-customer-id": managerId,
        "Content-Type": "application/json",
      };

      const query = `
        SELECT
          customer_client.client_customer,
          customer_client.descriptive_name,
          customer_client.currency_code,
          customer_client.time_zone,
          customer_client.manager,
          customer_client.status,
          customer_client.test_account,
          customer_client.id
        FROM customer_client
        WHERE customer_client.manager = false
          AND customer_client.status = 'ENABLED'
      `;

      const queryResponse = await fetch(queryUrl, {
        method: "POST",
        headers: queryHeaders,
        body: JSON.stringify({ query }),
      });

      if (!queryResponse.ok) {
        const errorBody = await queryResponse.text();
        console.warn(`[${FUNCTION_NAME}] Failed to fetch sub-accounts for manager ${managerId}:`, errorBody);
        continue;
      }

      const queryData = await queryResponse.json();
      const results = queryData[0]?.results || queryData?.results || [];
      
      console.log(`[${FUNCTION_NAME}] Found ${results.length} sub-accounts under manager ${managerId}`);

      for (const result of results) {
        const cc = result.customerClient;
        if (!cc) continue;
        
        const clientId = cc.id?.toString() || cc.clientCustomer?.split("/")[1];
        if (!clientId || seenCustomerIds.has(clientId)) continue;

        seenCustomerIds.add(clientId);
        accounts.push({
          customer_id: clientId,
          name: cc.descriptiveName || `Account ${clientId}`,
          currency: cc.currencyCode || "USD",
          timezone: cc.timeZone || "UTC",
          is_manager: false,
          status: cc.status || "UNKNOWN",
          is_test_account: cc.testAccount === true,
        });
      }
    } catch (err) {
      console.error(`[${FUNCTION_NAME}] Error fetching sub-accounts for manager ${managerId}:`, err);
    }
  }

  console.log(`[${FUNCTION_NAME}] Fetched details for ${accounts.length} accounts (${accounts.filter(a => a.is_manager).length} managers, ${accounts.filter(a => !a.is_manager).length} client accounts)`);

  return { accounts, managerCustomerId: detectedManagerId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    const body = await req.json();
    const parseResult = oauthInputSchema.safeParse(body);
    if (!parseResult.success) {
      console.error(`[${FUNCTION_NAME}] Validation error:`, parseResult.error);
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, redirectUri, platformId } = parseResult.data;
    const isReconnection = !!platformId;

    // Get Google OAuth credentials
    const clientId = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID")?.trim();
    const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")?.trim();
    const rawDeveloperToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
    const developerToken = rawDeveloperToken.replace(/\s+/g, "");

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({
          error: "Google Ads OAuth credentials not configured",
          hint:
            "This function exchanges OAuth codes for Google Ads API access (Platform Connections → Connect Google Ads). It is not used for Supabase “Sign in with Google”. Add Edge Function secrets GOOGLE_ADS_OAUTH_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET (OAuth client from Google Cloud), redeploy google-ads-oauth-callback, and ensure redirect URIs match your app’s Google Ads OAuth redirect.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!developerToken) {
      return new Response(
        JSON.stringify({
          error: "Google Ads Developer Token not configured",
          hint:
            "Add GOOGLE_ADS_DEVELOPER_TOKEN from Google Ads API Center as a secret on this Edge Function. Required to call the Google Ads API after OAuth.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[${FUNCTION_NAME}] developer-token fingerprint: len=${developerToken.length}, start=${developerToken.slice(0, 5)}, end=${developerToken.slice(-5)}`
    );

    // Exchange authorization code for tokens
    console.log(`[${FUNCTION_NAME}] Exchanging code for access token...`);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error(`[${FUNCTION_NAME}] Token exchange failed:`, errorData);
      throw new Error(`Failed to exchange code: ${errorData.error_description || errorData.error || "Unknown error"}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;
    console.log(`[${FUNCTION_NAME}] Successfully obtained access token (expires in ${expires_in}s)`);

    // Fetch the login customer ID from secrets (MCC account)
    const loginCustomerId = Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID")?.replace(/\D/g, "");

    // Fetch accessible Google Ads accounts
    const { accounts, managerCustomerId } = await fetchGoogleAdsAccounts(
      access_token,
      developerToken
    );

    if (accounts.length === 0) {
      throw new Error("No Google Ads accounts found. Please ensure you have access to at least one account.");
    }

    // Save or update platform connection
    let platformData;
    const tokenExpiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    const metadata = {
      accounts,
      manager_customer_id: managerCustomerId || loginCustomerId,
      token_expires_in: expires_in,
    };

    if (isReconnection) {
      console.log(`[${FUNCTION_NAME}] Reconnecting existing platform: ${platformId}`);
      const { data: updatedPlatform, error: updateError } = await supabase
        .from("connected_platforms")
        .update({
          is_active: true,
          token_expires_at: tokenExpiresAt,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", platformId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) {
        console.error(`[${FUNCTION_NAME}] Failed to update platform:`, updateError);
        throw new Error("Failed to reconnect platform");
      }
      platformData = updatedPlatform;
    } else {
      console.log(`[${FUNCTION_NAME}] Creating new platform connection...`);
      const { data: newPlatform, error: insertError } = await supabase
        .from("connected_platforms")
        .insert({
          user_id: user.id,
          platform_type: "google",
          platform_name: "Google Ads",
          is_active: true,
          token_expires_at: tokenExpiresAt,
          metadata,
        })
        .select()
        .single();

      if (insertError) {
        console.error(`[${FUNCTION_NAME}] Failed to insert platform:`, insertError);
        throw new Error("Failed to save platform connection");
      }
      platformData = newPlatform;
    }

    // Store tokens securely in Vault
    await storePlatformToken(supabase, platformData.id, access_token, "access");
    if (refresh_token) {
      await storePlatformToken(supabase, platformData.id, refresh_token, "refresh");
    }

    console.log(`[${FUNCTION_NAME}] ✓ Platform connected, ID: ${platformData.id}, ${accounts.length} accounts found`);

    // Return accounts for frontend selection (filter out manager accounts)
    const clientAccounts = accounts.filter((acc) => !acc.is_manager);

    return new Response(
      JSON.stringify({
        success: true,
        platformId: platformData.id,
        accounts: clientAccounts.map((acc) => ({
          id: acc.customer_id,
          name: acc.name,
          currency: acc.currency,
          timezone: acc.timezone,
          status: acc.status,
          is_test_account: acc.is_test_account,
        })),
        managerAccounts: accounts
          .filter((acc) => acc.is_manager)
          .map((acc) => ({ id: acc.customer_id, name: acc.name })),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error(`[${FUNCTION_NAME}] Error:`, error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to connect Google Ads account" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
