import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { storePlatformToken } from "../_shared/vault-helper.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const oauthInputSchema = z.object({
  code: z.string().min(1).max(2000),
  platformType: z.string().optional().nullable(),
  redirectUri: z.string().optional().nullable(),
  platformId: z.string().uuid().optional().nullable()
});

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const parseResult = oauthInputSchema.safeParse(body);
    if (!parseResult.success) {
      console.error("Validation error:", parseResult.error);
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const { code, platformType, redirectUri, platformId } = parseResult.data;

    const tiktokAppId = Deno.env.get("TIKTOK_APP_ID");
    const tiktokAppSecret = Deno.env.get("TIKTOK_APP_SECRET");

    if (!tiktokAppId || !tiktokAppSecret) {
      throw new Error("TikTok app credentials not configured");
    }

    console.log("Exchanging TikTok authorization code for access token...");

    // Exchange code for access token
    const tokenResponse = await fetch(
      "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          app_id: tiktokAppId,
          secret: tiktokAppSecret,
          auth_code: code,
        }),
      }
    );

    const tokenData = await tokenResponse.json();
    
    if (tokenData.code !== 0) {
      console.error("TikTok token exchange error:", tokenData);
      throw new Error(tokenData.message || "Failed to exchange authorization code");
    }

    const { access_token, advertiser_ids } = tokenData.data;

    if (!access_token || !advertiser_ids || advertiser_ids.length === 0) {
      throw new Error("No access token or advertiser accounts returned");
    }

    console.log(`Received access token for ${advertiser_ids.length} advertiser account(s)`);

    // ========== TOKEN CONTEXT DETECTION ==========
    // Detect if token is USER-context or ADVERTISER-context
    // USER-context tokens fail for Dark Ads (CUSTOMIZED_USER)
    // ADVERTISER-context tokens work for Dark Ads
    let tokenContext: "USER" | "ADVERTISER" = "ADVERTISER"; // Default to advertiser
    let tiktokUserInfo: any = null;
    
    try {
      console.log("Detecting token context via /oauth2/user/info/...");
      const userInfoResponse = await fetch(
        "https://business-api.tiktok.com/open_api/v1.3/oauth2/user/info/",
        {
          method: "GET",
          headers: {
            "Access-Token": access_token,
          },
        }
      );
      
      const userInfoData = await userInfoResponse.json();
      console.log("User info response:", JSON.stringify(userInfoData));
      
      if (userInfoData.code === 0 && userInfoData.data) {
        const userData = userInfoData.data;
        // If we get TikTok user metadata (display_name, avatar_url, open_id), it's USER context
        if (userData.display_name || userData.avatar_url || userData.open_id) {
          tokenContext = "USER";
          tiktokUserInfo = {
            display_name: userData.display_name,
            avatar_url: userData.avatar_url,
            open_id: userData.open_id,
          };
          console.log(`⚠️ Token is USER-context (TikTok user: ${userData.display_name || userData.open_id})`);
          console.log("⚠️ This token will ONLY work for Spark Ads, NOT for Dark Ads (CUSTOMIZED_USER)");
        } else {
          console.log("✅ Token is ADVERTISER-context (no TikTok user profile returned)");
        }
      } else {
        // No user info returned = advertiser context
        console.log("✅ Token is ADVERTISER-context (user/info endpoint returned no profile)");
      }
    } catch (userInfoError) {
      console.log("Could not detect token context (defaulting to ADVERTISER):", userInfoError);
    }

    // Fetch advertiser account details and business center information
    const accounts = [];
    const businessCenters = new Map(); // Cache business center info by bc_id
    
    console.log('Starting to fetch advertiser details for:', advertiser_ids);
    
    for (const advertiserId of advertiser_ids) {
      try {
        console.log(`Fetching advertiser info for: ${advertiserId}`);
        const urlWithParams = `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=["${advertiserId}"]`;
        const advertiserResponse = await fetch(urlWithParams, {
          headers: {
            "Access-Token": access_token,
          },
        });

        const advertiserData = await advertiserResponse.json();
        console.log(`Advertiser data response for ${advertiserId}:`, advertiserData);
        
        if (advertiserData.code === 0 && advertiserData.data && advertiserData.data.list && advertiserData.data.list.length > 0) {
          const advertiserInfo = advertiserData.data.list[0];
          const bcId = advertiserInfo.owner_bc_id || advertiserInfo.bc_id;
          
          let businessCenterInfo = null;
          
          // Fetch business center details if bc_id is available and not cached
          if (bcId && !businessCenters.has(bcId)) {
            try {
              const bcResponse = await fetch(
                `https://business-api.tiktok.com/open_api/v1.3/bc/get/?bc_id=${bcId}`,
                {
                  headers: {
                    "Access-Token": access_token,
                  },
                }
              );
              
              const bcData = await bcResponse.json();
              
              if (bcData.code === 0 && bcData.data) {
                businessCenterInfo = {
                  bc_id: bcId,
                  name: bcData.data.name || `Business Center ${bcId}`,
                  role: bcData.data.role,
                  status: bcData.data.status,
                };
                businessCenters.set(bcId, businessCenterInfo);
                console.log(`Fetched business center: ${businessCenterInfo.name}`);
              } else {
                console.log(`Could not fetch business center ${bcId}: ${bcData.message || 'Unknown error'}`);
              }
            } catch (bcError) {
              console.error(`Error fetching business center ${bcId}:`, bcError);
            }
          } else if (bcId) {
            businessCenterInfo = businessCenters.get(bcId);
          }
          
          accounts.push({
            advertiser_id: advertiserId,
            name: advertiserInfo.name || `Advertiser ${advertiserId}`,
            currency: advertiserInfo.currency || "USD",
            timezone: advertiserInfo.timezone || "UTC",
            status: advertiserInfo.status || "ENABLE",
            bc_id: bcId || null,
            business_center: businessCenterInfo,
          });
        }
      } catch (error) {
        console.error(`Error fetching advertiser ${advertiserId}:`, error);
        // Add advertiser with minimal info on error
        accounts.push({
          advertiser_id: advertiserId,
          name: `Advertiser ${advertiserId}`,
          currency: "USD",
          timezone: "UTC",
          status: "UNKNOWN",
          bc_id: null,
          business_center: null,
        });
      }
    }

    console.log(`Finished fetching advertiser details. Total accounts: ${accounts.length}`, accounts);

    // If reconnecting existing platform
    if (platformId) {
      console.log(`Reconnecting platform ${platformId} with ${accounts.length} accounts, token_context: ${tokenContext}`);
      const { error: updateError } = await supabase
        .from("connected_platforms")
        .update({
          updated_at: new Date().toISOString(),
          is_active: true,
          metadata: { 
            advertiser_ids, 
            accounts,
            business_centers: Array.from(businessCenters.values()),
            token_context: tokenContext,
            tiktok_user_info: tiktokUserInfo,
          }
        })
        .eq("id", platformId)
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      // Store token securely in Vault
      await storePlatformToken(supabase, platformId, access_token, 'access');

      console.log("Updated existing TikTok platform connection");
      console.log("Returning accounts for selection:", accounts);
      
      // Return accounts for selection even on reconnection
      // Include token context warning if USER context
      const warningMessage = tokenContext === "USER" 
        ? "⚠️ WARNING: This token is USER-context. It will ONLY work for Spark Ads. Dark Ads (CUSTOMIZED_USER) will fail. Re-authenticate from Business Center (not TikTok app) for Dark Ads support."
        : null;
      
      return new Response(
        JSON.stringify({
          success: true,
          platformId,
          accounts,
          token_context: tokenContext,
          warning: warningMessage,
          message: "TikTok connection renewed - please select accounts to sync"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create new platform connection
    console.log(`Creating new platform connection, token_context: ${tokenContext}`);
    const { data: newPlatform, error: insertError } = await supabase
      .from("connected_platforms")
      .insert({
        user_id: user.id,
        platform_type: "tiktok",
        platform_name: "TikTok Ads",
        is_active: true,
        metadata: { 
          advertiser_ids, 
          accounts,
          business_centers: Array.from(businessCenters.values()),
          token_context: tokenContext,
          tiktok_user_info: tiktokUserInfo,
        }
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Store token securely in Vault
    await storePlatformToken(supabase, newPlatform.id, access_token, 'access');

    console.log("TikTok OAuth callback completed successfully");

    // Return accounts for user selection with token context info
    const warningMessage = tokenContext === "USER" 
      ? "⚠️ WARNING: This token is USER-context. It will ONLY work for Spark Ads. Dark Ads (CUSTOMIZED_USER) will fail. Re-authenticate from Business Center (not TikTok app) for Dark Ads support."
      : null;

    return new Response(
      JSON.stringify({
        success: true,
        platformId: newPlatform.id,
        accounts,
        token_context: tokenContext,
        warning: warningMessage,
        message: "TikTok connected successfully"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("TikTok OAuth callback error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to connect TikTok account" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
