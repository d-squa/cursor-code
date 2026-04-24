import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { storePlatformToken } from "../_shared/vault-helper.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema - platformId can be null, undefined, or a valid UUID
const oauthInputSchema = z.object({
  code: z.string().min(1).max(2000),
  platformType: z.literal("meta"),
  redirectUri: z.string().url(),
  platformId: z.string().uuid().nullish() // Allow null, undefined, or valid UUID
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const body = await req.json();
    const parseResult = oauthInputSchema.safeParse(body);
    if (!parseResult.success) {
      console.error("Validation error:", parseResult.error);
      return new Response(
        JSON.stringify({ error: "Invalid request parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const { code, platformType, redirectUri, platformId } = parseResult.data;

    const isReconnection = !!platformId;

    // Exchange code for access token
    const clientId = Deno.env.get("META_APP_ID");
    const clientSecret = Deno.env.get("META_APP_SECRET");

    if (!clientId || !clientSecret) {
      throw new Error("Meta credentials not configured");
    }

    console.log("Exchanging code for access token...");
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Token exchange failed:", errorData);
      
      // Check for managed account specific errors
      if (errorData.error?.message?.includes("managed") || errorData.error?.code === 190) {
        throw new Error("Managed account authentication failed. Please ensure you're using the correct Meta account type.");
      }
      
      throw new Error(`Failed to exchange code for token: ${errorData.error?.message || 'Unknown error'}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;
    
    console.log("Successfully obtained access token");

    // Try to fetch accessible Business Managers first
    console.log("Fetching Business Managers...");
    let selectedBmId: string | null = null;
    let businessesMeta: Array<{ id: string; name: string }> = [];
    let adAccounts: any[] = [];
    
    try {
      const businessesResponse = await fetch(
        `https://graph.facebook.com/v21.0/me/businesses?fields=id,name,verification_status&access_token=${access_token}`
      );
      
      if (businessesResponse.ok) {
        const businessesData = await businessesResponse.json();
        const businesses = Array.isArray(businessesData?.data) ? businessesData.data : [];
        businessesMeta = businesses.map((b: any) => ({ id: b.id, name: b.name }));
        console.log(`Found ${businesses.length} Business Managers`);
        
        if (businesses.length > 0) {
          console.log(`[META-OAUTH] Fetching ad accounts from ${businesses.length} Business Managers with pagination...`);
          
          const fetchAllAccountsFromBM = async (bmId: string): Promise<any[]> => {
            const accounts: any[] = [];
            let url: string | null = `https://graph.facebook.com/v21.0/${bmId}/owned_ad_accounts?fields=id,name,account_status,currency,timezone_name&limit=200&access_token=${access_token}`;
            
            console.log(`[META-OAUTH] Starting fetch for BM ${bmId}`);
            let pageCount = 0;
            
            while (url) {
              try {
                pageCount++;
                console.log(`[META-OAUTH] BM ${bmId} - Fetching page ${pageCount}, current total: ${accounts.length}`);
                const response: Response = await fetch(url);
                if (!response.ok) {
                  const errorText = await response.text();
                  console.error(`[META-OAUTH] Failed to fetch accounts from BM ${bmId} on page ${pageCount}:`, errorText);
                  break;
                }
                const data: any = await response.json();
                if (data.data) {
                  accounts.push(...data.data);
                  console.log(`[META-OAUTH] BM ${bmId} page ${pageCount}: Added ${data.data.length} accounts, total now: ${accounts.length}`);
                }
                // Follow pagination if more results exist
                url = data.paging?.next || null;
                if (url) {
                  console.log(`[META-OAUTH] BM ${bmId}: More pages available, continuing...`);
                }
              } catch (e) {
                console.error(`[META-OAUTH] Exception fetching accounts from BM ${bmId} on page ${pageCount}:`, e);
                break;
              }
            }
            console.log(`[META-OAUTH] Completed fetch for BM ${bmId}: ${accounts.length} total accounts across ${pageCount} pages`);
            return accounts;
          };
          
          const allAccountPromises = businesses.map((bm: any) => fetchAllAccountsFromBM(bm.id));
          const allAccountsResults = await Promise.all(allAccountPromises);
          adAccounts = allAccountsResults.flat();
          
          // Use first BM as selectedBmId for backwards compatibility
          selectedBmId = businesses[0].id;
          
          console.log(`[META-OAUTH] ✓ Found ${adAccounts.length} total ad accounts across ${businesses.length} Business Managers`);
          if (adAccounts.length > 0) {
            console.log(`[META-OAUTH] Sample accounts:`, adAccounts.slice(0, 5).map((acc: any) => `${acc.id}: ${acc.name}`).join(", "));
          }
        }
      } else {
        const errorData = await businessesResponse.json();
        console.log("[META-OAUTH] Business Manager fetch warning:", errorData.error?.message);
      }
    } catch (e: any) {
      console.log("[META-OAUTH] Could not fetch Business Managers:", e.message);
    }
    
    // Fallback to user's ad accounts if BM fetch failed
    if (adAccounts.length === 0) {
      console.log("[META-OAUTH] No BM accounts found, fetching from user's personal accounts with pagination...");
      let userAccountsUrl: string | null = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency,timezone_name&limit=200&access_token=${access_token}`;
      
      let userPageCount = 0;
      while (userAccountsUrl) {
        userPageCount++;
        console.log(`[META-OAUTH] User accounts - Fetching page ${userPageCount}, current total: ${adAccounts.length}`);
        const adAccountsResponse: Response = await fetch(userAccountsUrl);

        if (!adAccountsResponse.ok) {
          const errorData = await adAccountsResponse.json();
          console.error(`[META-OAUTH] Failed to fetch user ad accounts on page ${userPageCount}:`, errorData);
          
          if (errorData.error?.code === 200 || errorData.error?.code === 190) {
            throw new Error("Permission denied. Please ensure your account has access to ad accounts and try reconnecting.");
          }
          
          throw new Error(`Failed to fetch ad accounts: ${errorData.error?.message || 'Unknown error'}`);
        }

        const adAccountsData: any = await adAccountsResponse.json();
        if (adAccountsData.data) {
          adAccounts.push(...adAccountsData.data);
          console.log(`[META-OAUTH] User page ${userPageCount}: Added ${adAccountsData.data.length} accounts, total now: ${adAccounts.length}`);
        }
        // Follow pagination if more results exist
        userAccountsUrl = adAccountsData.paging?.next || null;
      }
      
      console.log(`[META-OAUTH] ✓ Found ${adAccounts.length} ad accounts from user across ${userPageCount} pages`);
      if (adAccounts.length > 0) {
        console.log(`[META-OAUTH] Sample accounts:`, adAccounts.slice(0, 5).map((acc: any) => `${acc.id}: ${acc.name}`).join(", "));
      }
    }

    
    if (adAccounts.length === 0) {
      console.error("[META-OAUTH] ERROR: No ad accounts found after checking both BM and user accounts");
      throw new Error("No ad accounts found. Please ensure you have access to at least one ad account in your Business Manager.");
    }

    let platformData;

    if (isReconnection) {
      // Update existing platform connection
      console.log(`Reconnecting existing platform: ${platformId}`);
      const { data: updatedPlatform, error: updateError } = await supabase
        .from("connected_platforms")
        .update({
          is_active: true,
          business_manager_id: selectedBmId,
          metadata: businessesMeta.length > 0 ? { businesses: businessesMeta } : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", platformId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) {
        console.error("Failed to update platform:", updateError);
        throw new Error("Failed to reconnect platform");
      }
      platformData = updatedPlatform;
      
      // Store token securely in Vault
      await storePlatformToken(supabase, platformData.id, access_token, 'access');
      console.log(`[META-OAUTH] ✓ Platform reconnected successfully, ID: ${platformData.id}`);
    } else {
      // Create new platform connection (allow multiple connections)
      console.log("[META-OAUTH] Creating new platform connection...");
      const platformName = selectedBmId && businessesMeta.length > 0
        ? `Meta - ${businessesMeta[0].name}`
        : "Meta (Facebook & Instagram)";

      const { data: newPlatform, error: insertError } = await supabase
        .from("connected_platforms")
        .insert({
          user_id: user.id,
          platform_type: "meta",
          platform_name: platformName,
          is_active: true,
          business_manager_id: selectedBmId,
          metadata: businessesMeta.length > 0 ? { businesses: businessesMeta } : null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Failed to insert platform:", insertError);
        throw new Error("Failed to save platform connection");
      }
      platformData = newPlatform;
      
      // Store token securely in Vault
      await storePlatformToken(supabase, platformData.id, access_token, 'access');
      console.log(`[META-OAUTH] ✓ Platform connected successfully, ID: ${platformData.id}`);
    }

    // Return token and ad accounts - frontend will trigger sync after user confirms
    console.log(`[META-OAUTH] ✓ Returning ${adAccounts.length} accounts to frontend for user selection`);

    return new Response(
      JSON.stringify({
        success: true,
        platformId: platformData.id,
        accounts: adAccounts.map((acc: any) => ({
          id: acc.id,
          name: acc.name
        }))
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Meta OAuth callback error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to connect Meta account" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
