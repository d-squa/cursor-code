import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getTikTokPlatformCandidatesForAdvertiser } from "../_shared/platform-connection-resolver.ts";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

interface BenchmarkData {
  market: string;
  optimization_goal: string;
  total_spend: number;
  total_results: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  landing_page_views: number;
  revenue: number;
  campaign_count: number;
  industry: string | null;
}

/**
 * Generate monthly date ranges for the last N full months (excluding current partial month)
 */
function generateMonthlyRanges(months: number): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  const now = new Date();
  
  for (let i = 1; i <= months; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    ranges.push({
      start: monthStart.toISOString().split("T")[0],
      end: monthEnd.toISOString().split("T")[0],
    });
  }
  
  return ranges.reverse();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    let advertiserId: string | undefined;
    try {
      const body = await req.text();
      if (body && body.trim()) {
        const parsed = JSON.parse(body);
        advertiserId = parsed.advertiserId;
      }
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      throw new Error("Invalid request body - expected JSON with advertiserId");
    }

    if (!advertiserId) {
      throw new Error("Advertiser ID is required");
    }

    console.log(`🚀 STARTING TIKTOK BENCHMARK SYNC - Advertiser: ${advertiserId}`);

    const platformCandidates = await getTikTokPlatformCandidatesForAdvertiser(
      supabase, user.id, advertiserId,
    );

    if (platformCandidates.length === 0) {
      throw new Error(`No active TikTok connection found for advertiser ${advertiserId}`);
    }

    // Get client industry
    let industry: string | null = null;
    const { data: accountData } = await supabase
      .from("tiktok_ad_accounts")
      .select("client_id")
      .eq("advertiser_id", advertiserId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (accountData?.client_id) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("industry")
        .eq("id", accountData.client_id)
        .maybeSingle();
      industry = clientData?.industry || null;
    }

    // Resolve access token
    let accessToken: string | null = null;
    let selectedPlatformId: string | null = null;

    for (const candidate of platformCandidates) {
      const candidateToken = await getAccessToken(supabase, candidate.id, candidate.access_token);
      if (candidateToken) {
        accessToken = candidateToken;
        selectedPlatformId = candidate.id;
        break;
      }
    }

    if (!accessToken || !selectedPlatformId) {
      throw new Error(`No TikTok connection has permission for advertiser ${advertiserId}`);
    }

    // Fetch ad group optimization goals once
    const adGroupOptimizationMap = new Map<string, string>();
    const adGroupResponse = await fetch(
      `${TIKTOK_API_BASE}/adgroup/get/?advertiser_id=${advertiserId}&page_size=1000`,
      {
        headers: {
          "Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (adGroupResponse.ok) {
      const adGroupData = await adGroupResponse.json();
      if (adGroupData.code === 0 && adGroupData.data?.list) {
        for (const adGroup of adGroupData.data.list) {
          adGroupOptimizationMap.set(
            adGroup.adgroup_id,
            adGroup.optimization_goal || adGroup.optimize_goal || "UNKNOWN"
          );
        }
        console.log(`[BENCHMARK] Loaded ${adGroupOptimizationMap.size} ad group optimization goals`);
      }
    }

    // Generate 12 monthly date ranges
    const monthlyRanges = generateMonthlyRanges(12);
    console.log(`[BENCHMARK] Will sync ${monthlyRanges.length} monthly segments`);

    let totalStored = 0;

    for (const { start, end } of monthlyRanges) {
      console.log(`[BENCHMARK] Processing month: ${start} to ${end}`);
      const monthCount = await syncTikTokBenchmarksForPeriod(
        supabase, user.id, advertiserId, accessToken, adGroupOptimizationMap,
        industry, start, end
      );
      totalStored += monthCount;
    }

    console.log(`✅ TIKTOK BENCHMARK SYNC COMPLETED - ${totalStored} benchmarks stored`);

    return new Response(
      JSON.stringify({
        success: true,
        advertiserId,
        benchmarksSynced: totalStored,
        platformId: selectedPlatformId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in sync-tiktok-benchmarks:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function syncTikTokBenchmarksForPeriod(
  supabase: any,
  userId: string,
  advertiserId: string,
  accessToken: string,
  adGroupOptimizationMap: Map<string, string>,
  industry: string | null,
  dateRangeStart: string,
  dateRangeEnd: string
): Promise<number> {
  const optimizationGoalMap: { [key: string]: string } = {
    "CLICK": "CLICK",
    "CONVERT": "CONVERSION",
    "SHOW": "IMPRESSION",
    "REACH": "REACH",
    "VIDEO_VIEW": "VIDEO_VIEWS",
    "ENGAGED_VIEW": "VIDEO_VIEWS",
    "SIX_SECOND_VIDEO_VIEW": "VIDEO_VIEWS",
    "TWO_SECOND_VIDEO_VIEW": "VIDEO_VIEWS",
    "INSTALL": "APP_INSTALLS",
    "IN_APP_EVENT": "IN_APP_EVENT",
    "LEAD_GENERATION": "LEAD_GENERATION",
    "ON_WEB_ORDER": "PURCHASE",
    "ON_WEB_ADD_TO_CART": "ADD_TO_CART",
    "ON_WEB_SUBSCRIBE": "SUBSCRIBE",
    "COMPLETE_PAYMENT": "PURCHASE",
    "VALUE": "VALUE_OPTIMIZATION",
  };

  const queryParams = new URLSearchParams({
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_ADGROUP",
    dimensions: JSON.stringify(["adgroup_id", "country_code"]),
    metrics: JSON.stringify([
      "spend", "impressions", "clicks", "conversion", "reach",
      "video_views_p100", "total_purchase_value", "real_time_result"
    ]),
    start_date: dateRangeStart,
    end_date: dateRangeEnd,
    page_size: "1000",
  });

  const insightsResponse = await fetch(`${TIKTOK_API_BASE}/report/integrated/get/?${queryParams.toString()}`, {
    method: "GET",
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!insightsResponse.ok) {
    console.warn(`[BENCHMARK] Skipping TikTok period ${dateRangeStart}: ${await insightsResponse.text()}`);
    return 0;
  }

  const insightsData = await insightsResponse.json();
  if (insightsData.code !== 0) {
    console.warn(`[BENCHMARK] TikTok API error for ${dateRangeStart}: ${insightsData.message}`);
    return 0;
  }

  const insights = insightsData.data?.list || [];
  if (insights.length === 0) return 0;

  const benchmarkMap = new Map<string, BenchmarkData>();

  for (const insight of insights) {
    const dimensions = insight.dimensions || {};
    const metrics = insight.metrics || {};
    
    const adGroupId = dimensions.adgroup_id;
    const country = dimensions.country_code || "UNKNOWN";
    
    const spend = parseFloat(metrics.spend || "0");
    const impressions = parseFloat(metrics.impressions || "0");
    const clicks = parseFloat(metrics.clicks || "0");
    const conversions = parseFloat(metrics.conversion || "0");
    const reach = parseFloat(metrics.reach || "0");
    const videoViews = parseFloat(metrics.video_views_p100 || "0");
    const revenue = parseFloat(metrics.total_purchase_value || "0");

    const rawGoal = adGroupOptimizationMap.get(adGroupId) || "UNKNOWN";
    const optimizationGoal = optimizationGoalMap[rawGoal] || rawGoal;

    if (spend <= 0) continue;

    let results = 0;
    if (optimizationGoal.includes("CONVERSION") || optimizationGoal.includes("PURCHASE") || optimizationGoal === "ADD_TO_CART" || optimizationGoal === "SUBSCRIBE") {
      results = conversions;
    } else if (optimizationGoal === "CLICK") {
      results = clicks;
    } else if (optimizationGoal === "REACH") {
      results = reach;
    } else if (optimizationGoal.includes("VIDEO")) {
      results = videoViews;
    } else if (optimizationGoal === "APP_INSTALLS" || optimizationGoal === "INSTALL") {
      results = conversions;
    } else if (optimizationGoal === "LEAD_GENERATION") {
      results = conversions;
    } else {
      results = impressions / 1000;
    }

    const key = `${country}_${optimizationGoal}`;
    if (!benchmarkMap.has(key)) {
      benchmarkMap.set(key, {
        market: country, optimization_goal: optimizationGoal,
        total_spend: 0, total_results: 0, impressions: 0, clicks: 0,
        link_clicks: 0, landing_page_views: 0, revenue: 0,
        campaign_count: 0, industry,
      });
    }

    const benchmark = benchmarkMap.get(key)!;
    benchmark.total_spend += spend;
    benchmark.total_results += results;
    benchmark.impressions += impressions;
    benchmark.clicks += clicks;
    benchmark.revenue += revenue;
    benchmark.campaign_count += 1;
  }

  // Add aggregated REACH and CLICK benchmarks per country
  const countrySpendMap = new Map<string, { spend: number; reach: number; clicks: number; impressions: number; revenue: number }>();
  for (const insight of insights) {
    const dimensions = insight.dimensions || {};
    const metrics = insight.metrics || {};
    const country = dimensions.country_code || "UNKNOWN";
    const spend = parseFloat(metrics.spend || "0");
    const reach = parseFloat(metrics.reach || "0");
    const clicks = parseFloat(metrics.clicks || "0");
    const impressions = parseFloat(metrics.impressions || "0");
    const revenue = parseFloat(metrics.total_purchase_value || "0");

    if (!countrySpendMap.has(country)) {
      countrySpendMap.set(country, { spend: 0, reach: 0, clicks: 0, impressions: 0, revenue: 0 });
    }
    const d = countrySpendMap.get(country)!;
    d.spend += spend; d.reach += reach; d.clicks += clicks;
    d.impressions += impressions; d.revenue += revenue;
  }

  for (const [country, data] of countrySpendMap.entries()) {
    if (data.reach > 0 && !benchmarkMap.has(`${country}_REACH`)) {
      benchmarkMap.set(`${country}_REACH`, {
        market: country, optimization_goal: "REACH",
        total_spend: data.spend, total_results: data.reach,
        impressions: data.impressions, clicks: data.clicks,
        link_clicks: 0, landing_page_views: 0, revenue: data.revenue,
        campaign_count: 1, industry,
      });
    }
    if (data.clicks > 0 && !benchmarkMap.has(`${country}_CLICK`)) {
      benchmarkMap.set(`${country}_CLICK`, {
        market: country, optimization_goal: "CLICK",
        total_spend: data.spend, total_results: data.clicks,
        impressions: data.impressions, clicks: data.clicks,
        link_clicks: 0, landing_page_views: 0, revenue: data.revenue,
        campaign_count: 1, industry,
      });
    }
  }

  // Store benchmarks
  let storedCount = 0;
  for (const [key, benchmark] of benchmarkMap.entries()) {
    const avgCostPerResult = benchmark.total_results > 0
      ? benchmark.total_spend / benchmark.total_results
      : null;

    const { error } = await supabase
      .from("campaign_performance_benchmarks")
      .upsert({
        user_id: userId,
        platform: 'tiktok',
        market: benchmark.market,
        optimization_goal: benchmark.optimization_goal,
        industry: benchmark.industry,
        avg_cost_per_result: avgCostPerResult,
        total_spend: benchmark.total_spend,
        total_results: benchmark.total_results,
        impressions: benchmark.impressions,
        clicks: benchmark.clicks,
        link_clicks: benchmark.link_clicks,
        landing_page_views: benchmark.landing_page_views,
        revenue: benchmark.revenue,
        campaign_count: benchmark.campaign_count,
        date_range_start: dateRangeStart,
        date_range_end: dateRangeEnd,
      }, {
        onConflict: "user_id,platform,market,optimization_goal,industry,date_range_start,date_range_end"
      });

    if (error) {
      console.error(`[BENCHMARK] Error storing ${key}:`, error);
    } else {
      storedCount++;
    }
  }

  console.log(`[BENCHMARK] Month ${dateRangeStart}: ${storedCount} TikTok benchmarks stored`);
  return storedCount;
}
