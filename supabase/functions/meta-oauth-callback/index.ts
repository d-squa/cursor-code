import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { code, platformType, redirectUri } = await req.json();

    if (!code || platformType !== "meta" || !redirectUri) {
      throw new Error("Invalid parameters");
    }

    // Exchange code for access token
    const clientId = Deno.env.get("META_APP_ID");
    const clientSecret = Deno.env.get("META_APP_SECRET");

    if (!clientId || !clientSecret) {
      throw new Error("Meta credentials not configured");
    }

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Token exchange failed:", errorData);
      throw new Error("Failed to exchange code for token");
    }

    const { access_token } = await tokenResponse.json();

    // Get user's ad accounts
    const adAccountsResponse = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&access_token=${access_token}`
    );

    if (!adAccountsResponse.ok) {
      throw new Error("Failed to fetch ad accounts");
    }

    const adAccountsData = await adAccountsResponse.json();
    const adAccounts = adAccountsData.data || [];

    if (adAccounts.length === 0) {
      throw new Error("No ad accounts found");
    }

    // Store each ad account as a separate connected platform
    const connectedPlatforms = [];
    
    for (const adAccount of adAccounts) {
      const { data: platformData, error: platformError } = await supabase
        .from("connected_platforms")
        .insert({
          user_id: user.id,
          platform_type: "meta",
          platform_name: "Meta (Facebook & Instagram)",
          access_token: access_token,
          ad_account_id: adAccount.id,
          ad_account_name: adAccount.name,
        })
        .select()
        .single();

      if (platformError) {
        console.error("Failed to insert platform:", platformError);
        continue;
      }

      connectedPlatforms.push(platformData);

      // Sync platform accounts (pages, Instagram accounts)
      try {
        await fetch(`${supabaseUrl}/functions/v1/sync-platform-accounts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ connectedPlatformId: platformData.id })
        });
      } catch (syncError) {
        console.error("Failed to sync accounts:", syncError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        platformsConnected: connectedPlatforms.length,
        adAccounts: adAccounts.map((acc: any) => ({
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
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
