import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InsightMetrics {
  reach: number;
  impressions: number;
  spend: number;
  cpm: number;
  frequency: number;
  clicks?: number;
  ctr?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { campaignId, forceRefresh = false } = body;

    console.log("Fetching insights for campaign:", campaignId);

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*, platforms")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    // Check if we have cached data that's fresh (< 30 minutes)
    if (!forceRefresh) {
      const { data: cachedInsights } = await supabase
        .from("campaign_insights")
        .select("*")
        .eq("campaign_id", campaignId)
        .gte("fetched_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

      if (cachedInsights && cachedInsights.length > 0) {
        console.log("Returning cached insights");
        return new Response(
          JSON.stringify({
            cached: true,
            insights: cachedInsights,
            message: "Returned cached data (< 30 minutes old)",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get connected platforms for this campaign
    const { data: connectedPlatforms } = await supabase
      .from("connected_platforms")
      .select("id, platform_type, access_token, ad_account_id")
      .eq("user_id", campaign.user_id)
      .eq("is_active", true);

    if (!connectedPlatforms || connectedPlatforms.length === 0) {
      console.log("No connected platforms found, using forecast data");
      return new Response(
        JSON.stringify({
          cached: false,
          insights: [],
          message: "No connected platforms available",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const insights: any[] = [];

    // Fetch insights for each platform
    for (const platformConfig of campaign.platforms || []) {
      const platformType = platformConfig.type || platformConfig.name;
      
      // Find matching connected platform
      const connectedPlatform = connectedPlatforms.find(
        (cp: any) => cp.platform_type.toLowerCase() === platformType.toLowerCase()
      );

      if (!connectedPlatform) {
        console.log(`No connected platform found for ${platformType}`);
        continue;
      }

      if (platformType.toLowerCase() === "meta" || platformType.toLowerCase() === "facebook") {
        const metaInsights = await fetchMetaInsights(
          connectedPlatform,
          campaign,
          supabase
        );
        if (metaInsights) {
          insights.push(metaInsights);
        }
      } else if (platformType.toLowerCase() === "google" || platformType.toLowerCase() === "google_ads") {
        const googleInsights = await fetchGoogleAdsInsights(
          connectedPlatform,
          campaign,
          supabase
        );
        if (googleInsights) {
          insights.push(googleInsights);
        }
      }
      // Add other platforms (TikTok, etc.) here
    }

    // Save insights to database
    for (const insight of insights) {
      await supabase
        .from("campaign_insights")
        .upsert(
          {
            campaign_id: campaignId,
            platform: insight.platform,
            ad_account_id: insight.ad_account_id,
            campaign_dsp_id: insight.campaign_dsp_id,
            metrics: insight.metrics,
            weekly_metrics: insight.weekly_metrics,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "campaign_id,platform" }
        );
    }

    return new Response(
      JSON.stringify({
        cached: false,
        insights,
        message: "Fetched fresh insights from platforms",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error fetching insights:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function fetchMetaInsights(
  connectedPlatform: any,
  campaign: any,
  supabase: any
): Promise<any | null> {
  try {
    // Get token from Vault with fallback to database column
    const accessToken = await getAccessToken(supabase, connectedPlatform.id, connectedPlatform.access_token);
    const adAccountId = connectedPlatform.ad_account_id;

    if (!accessToken || !adAccountId) {
      console.log("Missing Meta credentials");
      return null;
    }

    // Get campaigns from Meta Ad Account
    // Note: This assumes campaigns were pushed to DSP and we stored the DSP campaign ID
    // In reality, you'd need to query Meta API to find campaigns by name or store the mapping
    
    const campaignQuery = new URLSearchParams({
      access_token: accessToken,
      fields: "id,name,status,objective",
      limit: "100",
    });

    const campaignsResponse = await fetch(
      `https://graph.facebook.com/v21.0/act_${adAccountId}/campaigns?${campaignQuery}`,
      { method: "GET" }
    );

    if (!campaignsResponse.ok) {
      console.error("Failed to fetch Meta campaigns:", await campaignsResponse.text());
      return null;
    }

    const campaignsData = await campaignsResponse.json();
    
    // Find campaign by name (simple matching)
    const metaCampaign = campaignsData.data?.find(
      (c: any) => c.name.toLowerCase().includes(campaign.name.toLowerCase().slice(0, 20))
    );

    if (!metaCampaign) {
      console.log(`Meta campaign not found for: ${campaign.name}`);
      return null;
    }

    // Fetch insights for the campaign
    const insightsQuery = new URLSearchParams({
      access_token: accessToken,
      fields: "reach,impressions,spend,cpm,frequency,clicks,ctr",
      level: "campaign",
      time_range: JSON.stringify({
        since: campaign.start_date,
        until: campaign.end_date || new Date().toISOString().split("T")[0],
      }),
      time_increment: "1",
      breakdowns: "[]",
    });

    const insightsResponse = await fetch(
      `https://graph.facebook.com/v21.0/${metaCampaign.id}/insights?${insightsQuery}`,
      { method: "GET" }
    );

    if (!insightsResponse.ok) {
      console.error("Failed to fetch Meta insights:", await insightsResponse.text());
      return null;
    }

    const insightsData = await insightsResponse.json();

    // Aggregate metrics
    const aggregatedMetrics: InsightMetrics = {
      reach: 0,
      impressions: 0,
      spend: 0,
      cpm: 0,
      frequency: 0,
      clicks: 0,
      ctr: 0,
    };

    const weeklyMetrics: any[] = [];
    let totalDays = 0;

    for (const dayData of insightsData.data || []) {
      aggregatedMetrics.reach += parseInt(dayData.reach || "0");
      aggregatedMetrics.impressions += parseInt(dayData.impressions || "0");
      aggregatedMetrics.spend += parseFloat(dayData.spend || "0");
      aggregatedMetrics.clicks = (aggregatedMetrics.clicks || 0) + parseInt(dayData.clicks || "0");
      totalDays++;

      // Group by week (every 7 days)
      const weekIndex = Math.floor(totalDays / 7);
      if (!weeklyMetrics[weekIndex]) {
        weeklyMetrics[weekIndex] = {
          week: `Week ${weekIndex + 1}`,
          reach: 0,
          impressions: 0,
          spend: 0,
          clicks: 0,
        };
      }

      weeklyMetrics[weekIndex].reach += parseInt(dayData.reach || "0");
      weeklyMetrics[weekIndex].impressions += parseInt(dayData.impressions || "0");
      weeklyMetrics[weekIndex].spend += parseFloat(dayData.spend || "0");
      weeklyMetrics[weekIndex].clicks += parseInt(dayData.clicks || "0");
    }

    // Calculate averages
    if (aggregatedMetrics.impressions > 0) {
      aggregatedMetrics.cpm = (aggregatedMetrics.spend / aggregatedMetrics.impressions) * 1000;
      aggregatedMetrics.frequency = aggregatedMetrics.impressions / aggregatedMetrics.reach;
      aggregatedMetrics.ctr = (aggregatedMetrics.clicks! / aggregatedMetrics.impressions) * 100;
    }

    console.log("Fetched Meta insights:", aggregatedMetrics);

    return {
      platform: "Meta",
      ad_account_id: adAccountId,
      campaign_dsp_id: metaCampaign.id,
      metrics: aggregatedMetrics,
      weekly_metrics: weeklyMetrics,
    };
  } catch (error: any) {
    console.error("Error fetching Meta insights:", error);
    return null;
  }
}

async function fetchGoogleAdsInsights(
  connectedPlatform: any,
  campaign: any,
  supabase: any
): Promise<any | null> {
  try {
    const accessToken = await getAccessToken(supabase, connectedPlatform.id, connectedPlatform.access_token);
    if (!accessToken) {
      console.log("Missing Google Ads access token");
      return null;
    }

    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    if (!developerToken) {
      console.log("GOOGLE_ADS_DEVELOPER_TOKEN not set");
      return null;
    }

    // Find the Google ad account for this campaign
    const { data: googleAccounts } = await supabase
      .from("google_ad_accounts")
      .select("customer_id")
      .eq("user_id", campaign.user_id)
      .eq("is_active", true)
      .limit(1);

    if (!googleAccounts || googleAccounts.length === 0) {
      console.log("No active Google Ads account found");
      return null;
    }

    const customerId = googleAccounts[0].customer_id.replace(/-/g, "");
    const managerAccountId = Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    if (managerAccountId) {
      headers["login-customer-id"] = managerAccountId.replace(/-/g, "");
    }

    const startDate = campaign.start_date?.split("T")[0] || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const endDate = campaign.end_date?.split("T")[0] || new Date().toISOString().split("T")[0];

    const gaql = `
      SELECT
        campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value,
        segments.date
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ORDER BY segments.date DESC
      LIMIT 500
    `;

    const searchUrl = `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`;
    const resp = await fetch(searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: gaql }),
    });

    if (!resp.ok) {
      console.error("Google Ads insights fetch failed:", await resp.text());
      return null;
    }

    const data = await resp.json();
    const rows = data?.[0]?.results || [];

    const aggregated = {
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      conversionValue: 0,
      reach: 0,
      cpm: 0,
      frequency: 0,
      ctr: 0,
    };

    const weeklyMetrics: any[] = [];
    let dayIndex = 0;

    for (const row of rows) {
      const m = row.metrics || {};
      aggregated.impressions += Number(m.impressions || 0);
      aggregated.clicks += Number(m.clicks || 0);
      aggregated.spend += Number(m.costMicros || 0) / 1_000_000;
      aggregated.conversions += Number(m.conversions || 0);
      aggregated.conversionValue += Number(m.conversionsValue || 0);

      const weekIndex = Math.floor(dayIndex / 7);
      if (!weeklyMetrics[weekIndex]) {
        weeklyMetrics[weekIndex] = { week: `Week ${weekIndex + 1}`, impressions: 0, clicks: 0, spend: 0, conversions: 0 };
      }
      weeklyMetrics[weekIndex].impressions += Number(m.impressions || 0);
      weeklyMetrics[weekIndex].clicks += Number(m.clicks || 0);
      weeklyMetrics[weekIndex].spend += Number(m.costMicros || 0) / 1_000_000;
      weeklyMetrics[weekIndex].conversions += Number(m.conversions || 0);
      dayIndex++;
    }

    if (aggregated.impressions > 0) {
      aggregated.cpm = (aggregated.spend / aggregated.impressions) * 1000;
      aggregated.ctr = (aggregated.clicks / aggregated.impressions) * 100;
    }

    console.log("Fetched Google Ads insights:", aggregated);

    return {
      platform: "Google",
      ad_account_id: customerId,
      campaign_dsp_id: null,
      metrics: aggregated,
      weekly_metrics: weeklyMetrics,
    };
  } catch (error: any) {
    console.error("Error fetching Google Ads insights:", error);
    return null;
  }
}
