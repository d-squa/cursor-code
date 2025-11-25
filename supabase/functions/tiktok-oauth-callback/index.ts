import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { code, platformType, redirectUri, platformId } = await req.json();

    if (!code) {
      throw new Error("Authorization code is required");
    }

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

    // Fetch advertiser account details and business center information
    const accounts = [];
    const businessCenters = new Map(); // Cache business center info by bc_id
    
    console.log('Starting to fetch advertiser details for:', advertiser_ids);
    
    for (const advertiserId of advertiser_ids) {
      try {
        console.log(`Fetching advertiser info for: ${advertiserId}`);
        const advertiserResponse = await fetch(
          `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=[${advertiserId}]`,
          {
            headers: {
              "Access-Token": access_token,
            },
          }
        );

        const advertiserData = await advertiserResponse.json();
        console.log(`Advertiser data response for ${advertiserId}:`, advertiserData);
        
        if (advertiserData.code === 0 && advertiserData.data && advertiserData.data.list && advertiserData.data.list.length > 0) {
          const advertiserInfo = advertiserData.data.list[0];
          const bcId = advertiserInfo.bc_id;
          
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
      console.log(`Reconnecting platform ${platformId} with ${accounts.length} accounts`);
      const { error: updateError } = await supabase
        .from("connected_platforms")
        .update({
          access_token: access_token,
          updated_at: new Date().toISOString(),
          is_active: true,
          metadata: { 
            advertiser_ids, 
            accounts,
            business_centers: Array.from(businessCenters.values())
          }
        })
        .eq("id", platformId)
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      console.log("Updated existing TikTok platform connection");
      console.log("Returning accounts for selection:", accounts);
      
      // Return accounts for selection even on reconnection
      return new Response(
        JSON.stringify({
          success: true,
          platformId,
          accounts,
          message: "TikTok connection renewed - please select accounts to sync"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create new platform connection
    const { data: newPlatform, error: insertError } = await supabase
      .from("connected_platforms")
      .insert({
        user_id: user.id,
        platform_type: "tiktok",
        platform_name: "TikTok Ads",
        access_token: access_token,
        is_active: true,
        metadata: { 
          advertiser_ids, 
          accounts,
          business_centers: Array.from(businessCenters.values())
        }
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log("TikTok OAuth callback completed successfully");

    // Return accounts for user selection (don't auto-insert)
    return new Response(
      JSON.stringify({
        success: true,
        platformId: newPlatform.id,
        accounts,
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
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
