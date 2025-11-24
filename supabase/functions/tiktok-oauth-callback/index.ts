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

    // Fetch advertiser account details
    const accounts = [];
    for (const advertiserId of advertiser_ids) {
      const advertiserResponse = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_id=${advertiserId}`,
        {
          headers: {
            "Access-Token": access_token,
          },
        }
      );

      const advertiserData = await advertiserResponse.json();
      
      if (advertiserData.code === 0 && advertiserData.data) {
        accounts.push({
          advertiser_id: advertiserId,
          name: advertiserData.data.name || `Advertiser ${advertiserId}`,
          currency: advertiserData.data.currency || "USD",
          timezone: advertiserData.data.timezone || "UTC",
          status: advertiserData.data.status || "ENABLE",
        });
      }
    }

    // If reconnecting existing platform
    if (platformId) {
      const { error: updateError } = await supabase
        .from("connected_platforms")
        .update({
          access_token: access_token,
          updated_at: new Date().toISOString(),
          is_active: true,
          metadata: { advertiser_ids, accounts }
        })
        .eq("id", platformId)
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      console.log("Updated existing TikTok platform connection");
      
      return new Response(
        JSON.stringify({
          success: true,
          platformId,
          accounts,
          message: "TikTok connection renewed successfully"
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
        metadata: { advertiser_ids, accounts }
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Insert TikTok ad accounts
    const adAccountInserts = accounts.map(account => ({
      user_id: user.id,
      account_id: account.advertiser_id,
      account_name: account.name,
      advertiser_id: account.advertiser_id,
      account_status: account.status,
      currency: account.currency,
      timezone: account.timezone,
      synced_at: new Date().toISOString(),
    }));

    if (adAccountInserts.length > 0) {
      const { error: accountError } = await supabase
        .from("tiktok_ad_accounts")
        .insert(adAccountInserts);

      if (accountError) {
        console.error("Error inserting TikTok ad accounts:", accountError);
      }
    }

    console.log("TikTok OAuth callback completed successfully");

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
