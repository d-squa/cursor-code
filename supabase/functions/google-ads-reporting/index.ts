import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

/**
 * GOOGLE-ADS-REPORTING
 * 
 * Fetches campaign performance metrics from Google Ads API.
 * Stores results in campaign_insights for caching.
 * 
 * Supports: Campaign, Ad Group, and Ad level metrics.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_ADS_API_VERSION = "v18";

interface ReportRequest {
  customerId: string;
  campaignId?: string;           // Internal campaign ID for caching
  dspCampaignIds?: string[];     // Google Ads campaign IDs
  startDate: string;             // YYYY-MM-DD
  endDate: string;               // YYYY-MM-DD
  level?: "campaign" | "ad_group" | "ad";
  metrics?: string[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) throw new Error("Unauthorized");

    const body: ReportRequest = await req.json();
    const {
      customerId,
      campaignId,
      dspCampaignIds,
      startDate,
      endDate,
      level = "campaign",
      metrics: requestedMetrics,
    } = body;

    if (!customerId || !startDate || !endDate) {
      throw new Error("customerId, startDate, and endDate are required");
    }

    console.log(`📊 Fetching Google Ads report: ${level} level, ${startDate} to ${endDate}`);

    // Get platform connection
    const { data: platform } = await supabase
      .from("connected_platforms")
      .select("id, access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "google")
      .eq("is_active", true)
      .single();

    if (!platform) throw new Error("Google Ads platform not connected");

    const accessToken = await getAccessToken(supabase, platform.id, platform.access_token);
    if (!accessToken) throw new Error("Google Ads access token not found");

    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN not set");

    const managerAccountId = Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID");
    const cleanCustomerId = customerId.replace(/-/g, "");

    const apiHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    if (managerAccountId) {
      apiHeaders["login-customer-id"] = managerAccountId.replace(/-/g, "");
    }

    // Build GAQL query based on level
    const defaultMetrics = [
      "metrics.impressions",
      "metrics.clicks",
      "metrics.cost_micros",
      "metrics.conversions",
      "metrics.conversions_value",
      "metrics.ctr",
      "metrics.average_cpc",
      "metrics.average_cpm",
      "metrics.video_views",
      "metrics.video_view_rate",
    ];

    const metricsFields = requestedMetrics?.map(m => `metrics.${m}`) || defaultMetrics;

    let entityFields: string;
    let fromClause: string;
    let whereClause = `segments.date BETWEEN '${startDate}' AND '${endDate}'`;

    switch (level) {
      case "ad_group":
        entityFields = "ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name";
        fromClause = "ad_group";
        break;
      case "ad":
        entityFields = "ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group.id, campaign.id";
        fromClause = "ad_group_ad";
        break;
      default:
        entityFields = "campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type";
        fromClause = "campaign";
    }

    if (dspCampaignIds && dspCampaignIds.length > 0) {
      const ids = dspCampaignIds.join(", ");
      whereClause += ` AND campaign.id IN (${ids})`;
    }

    const gaql = `
      SELECT
        ${entityFields},
        ${metricsFields.join(", ")},
        segments.date
      FROM ${fromClause}
      WHERE ${whereClause}
      ORDER BY segments.date DESC
      LIMIT 1000
    `;

    const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;
    const response = await fetch(searchUrl, {
      method: "POST",
      headers: apiHeaders,
      body: JSON.stringify({ query: gaql }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Ads reporting failed:", errorText);
      throw new Error(`Google Ads reporting API error: ${response.status}`);
    }

    const responseData = await response.json();
    const results = responseData?.[0]?.results || [];
    console.log(`Fetched ${results.length} report rows`);

    // Transform results
    const reportRows = results.map((row: any) => {
      const metrics = row.metrics || {};
      return {
        date: row.segments?.date,
        campaignId: row.campaign?.id,
        campaignName: row.campaign?.name,
        campaignStatus: row.campaign?.status,
        channelType: row.campaign?.advertisingChannelType,
        adGroupId: row.adGroup?.id,
        adGroupName: row.adGroup?.name,
        impressions: Number(metrics.impressions || 0),
        clicks: Number(metrics.clicks || 0),
        spend: Number(metrics.costMicros || 0) / 1_000_000,
        conversions: Number(metrics.conversions || 0),
        conversionValue: Number(metrics.conversionsValue || 0),
        ctr: Number(metrics.ctr || 0),
        avgCpc: Number(metrics.averageCpc || 0) / 1_000_000,
        avgCpm: Number(metrics.averageCpm || 0) / 1_000_000,
        videoViews: Number(metrics.videoViews || 0),
        videoViewRate: Number(metrics.videoViewRate || 0),
      };
    });

    // Aggregate totals
    const totals = reportRows.reduce(
      (acc: any, row: any) => ({
        impressions: acc.impressions + row.impressions,
        clicks: acc.clicks + row.clicks,
        spend: acc.spend + row.spend,
        conversions: acc.conversions + row.conversions,
        conversionValue: acc.conversionValue + row.conversionValue,
        videoViews: acc.videoViews + row.videoViews,
      }),
      { impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0, videoViews: 0 }
    );

    totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
    totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
    totals.costPerConversion = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
    totals.roas = totals.spend > 0 ? totals.conversionValue / totals.spend : 0;

    // Cache in campaign_insights if campaignId provided
    if (campaignId) {
      const { error: cacheError } = await supabase
        .from("campaign_insights")
        .upsert({
          campaign_id: campaignId,
          platform: "google",
          ad_account_id: cleanCustomerId,
          metrics: totals,
          weekly_metrics: groupByWeek(reportRows),
          fetched_at: new Date().toISOString(),
        }, {
          onConflict: "campaign_id,platform",
        });

      if (cacheError) {
        console.error("Failed to cache insights:", cacheError.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totals,
        rows: reportRows,
        rowCount: reportRows.length,
        dateRange: { startDate, endDate },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("google-ads-reporting error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function groupByWeek(rows: any[]): Record<string, any> {
  const weeks: Record<string, any> = {};
  for (const row of rows) {
    if (!row.date) continue;
    const date = new Date(row.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split("T")[0];

    if (!weeks[weekKey]) {
      weeks[weekKey] = { impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0, videoViews: 0 };
    }
    weeks[weekKey].impressions += row.impressions;
    weeks[weekKey].clicks += row.clicks;
    weeks[weekKey].spend += row.spend;
    weeks[weekKey].conversions += row.conversions;
    weeks[weekKey].conversionValue += row.conversionValue;
    weeks[weekKey].videoViews += row.videoViews;
  }
  return weeks;
}
