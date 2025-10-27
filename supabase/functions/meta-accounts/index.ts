import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    const adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");

    if (!accessToken || !adAccountId) {
      throw new Error("Meta credentials not configured");
    }

    console.log("Fetching Facebook Pages and Instagram accounts for ad account:", adAccountId);

    // Fetch Facebook Pages connected to the ad account
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v21.0/act_${adAccountId}/agencies?fields=id,name&access_token=${accessToken}`
    );

    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      console.error("Failed to fetch pages:", errorText);
      throw new Error(`Failed to fetch pages: ${errorText}`);
    }

    const pagesData = await pagesResponse.json();

    // Fetch Instagram accounts connected to the ad account
    const igAccountsResponse = await fetch(
      `https://graph.facebook.com/v21.0/act_${adAccountId}/instagram_accounts?fields=id,username,name,profile_picture_url&access_token=${accessToken}`
    );

    if (!igAccountsResponse.ok) {
      const errorText = await igAccountsResponse.text();
      console.error("Failed to fetch Instagram accounts:", errorText);
      throw new Error(`Failed to fetch Instagram accounts: ${errorText}`);
    }

    const igAccountsData = await igAccountsResponse.json();

    console.log("Fetched accounts:", {
      pages: pagesData.data?.length || 0,
      instagramAccounts: igAccountsData.data?.length || 0,
    });

    return new Response(
      JSON.stringify({
        pages: pagesData.data || [],
        instagramAccounts: igAccountsData.data || [],
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Meta accounts fetch error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
