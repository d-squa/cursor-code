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

    // Fetch Facebook Pages (using the ad account's promoted_objects endpoint)
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v21.0/act_${adAccountId}?fields=promote_pages.limit(100){id,name}&access_token=${accessToken}`
    );

    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      console.error("Failed to fetch pages:", errorText);
      // Don't throw, just log and continue with empty pages
      console.log("Continuing without pages data");
    }

    const pagesData = pagesResponse.ok ? await pagesResponse.json() : { promote_pages: { data: [] } };
    const pages = pagesData.promote_pages?.data || [];

    // Fetch Instagram accounts connected to the ad account
    const igAccountsResponse = await fetch(
      `https://graph.facebook.com/v21.0/act_${adAccountId}?fields=instagram_accounts.limit(100){id,username,name,profile_picture_url}&access_token=${accessToken}`
    );

    if (!igAccountsResponse.ok) {
      const errorText = await igAccountsResponse.text();
      console.error("Failed to fetch Instagram accounts:", errorText);
      // Don't throw, just log and continue with empty accounts
      console.log("Continuing without Instagram accounts data");
    }

    const igAccountsData = igAccountsResponse.ok ? await igAccountsResponse.json() : { instagram_accounts: { data: [] } };
    const instagramAccounts = igAccountsData.instagram_accounts?.data || [];

    console.log("Fetched accounts:", {
      pages: pages.length,
      instagramAccounts: instagramAccounts.length,
    });

    return new Response(
      JSON.stringify({
        pages: pages,
        instagramAccounts: instagramAccounts,
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
