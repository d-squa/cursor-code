import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
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
  campaign_count: number;
  industry: string | null;
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

    const { advertiserId } = await req.json();

    if (!advertiserId) {
      throw new Error("Advertiser ID is required");
    }

    console.log("=".repeat(60));
    console.log("🚀 STARTING TIKTOK BENCHMARK SYNC");
    console.log("User ID:", user.id);
    console.log("Advertiser ID:", advertiserId);
    console.log("Timestamp:", new Date().toISOString());
    console.log("=".repeat(60));

    // Get user's active TikTok platform connection
    const { data: platformData, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "tiktok")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (platformError || !platformData) {
      console.error("❌ Platform lookup error:", platformError);
      throw new Error("No active TikTok platform connection found");
    }

    // Get access token from Vault (with fallback to database column)
    const accessToken = await getAccessToken(supabase, platformData.id, platformData.access_token);
    
    if (!accessToken) {
      throw new Error("Failed to retrieve access token");
    }

    // Get client industry for this advertiser
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
      console.log(`[BENCHMARK] Found client industry: ${industry}`);
    } else {
      console.log(`[BENCHMARK] No client linked to advertiser ${advertiserId}, industry will be null`);
    }

    // Calculate date range (last 3 months)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    const dateRangeStart = startDate.toISOString().split("T")[0];
    const dateRangeEnd = endDate.toISOString().split("T")[0];

    console.log(`📅 Date Range: ${dateRangeStart} to ${dateRangeEnd}`);

    // Fetch insights from TikTok API with country breakdown
    const benchmarkMap = new Map<string, BenchmarkData>();

    // TikTok Integrated Reports API - fetch at campaign level with location breakdown
    const reportPayload = {
      advertiser_id: advertiserId,
      report_type: "BASIC",
      data_level: "AUCTION_ADGROUP", // Ad group level has optimization_goal
      dimensions: ["adgroup_id", "country_code"],
      metrics: [
        "spend",
        "impressions",
        "clicks",
        "conversion",
        "reach",
        "video_views_p100"
      ],
      start_date: dateRangeStart,
      end_date: dateRangeEnd,
      page_size: 1000,
    };

    console.log(`[BENCHMARK] Fetching TikTok insights...`);
    
    const insightsResponse = await fetch(`${TIKTOK_API_BASE}/report/integrated/get/`, {
      method: "POST",
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reportPayload),
    });

    if (!insightsResponse.ok) {
      const errorText = await insightsResponse.text();
      console.error(`[BENCHMARK] Error fetching insights: ${errorText}`);
      throw new Error(`Failed to fetch TikTok insights: ${errorText}`);
    }

    const insightsData = await insightsResponse.json();
    
    if (insightsData.code !== 0) {
      console.error(`[BENCHMARK] TikTok API error:`, insightsData.message);
      throw new Error(`TikTok API error: ${insightsData.message}`);
    }

    const insights = insightsData.data?.list || [];
    console.log(`[BENCHMARK] Retrieved ${insights.length} insight rows`);

    // We need to get optimization_goal from ad groups table or API
    // First, fetch all ad groups for this advertiser to get their optimization goals
    const adGroupOptimizationMap = new Map<string, string>();
    
    // Try to get ad group optimization goals from API
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

    // Map TikTok optimization goals to standardized names
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

    // Process insights
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

      // Get optimization goal for this ad group
      let rawGoal = adGroupOptimizationMap.get(adGroupId) || "UNKNOWN";
      const optimizationGoal = optimizationGoalMap[rawGoal] || rawGoal;

      // Skip if no spend
      if (spend <= 0) continue;

      // Determine result based on optimization goal
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
        results = conversions; // App installs come through as conversions
      } else if (optimizationGoal === "LEAD_GENERATION") {
        results = conversions;
      } else {
        results = impressions / 1000; // Fallback to CPM-style
      }

      const key = `${country}_${optimizationGoal}`;
      
      if (!benchmarkMap.has(key)) {
        benchmarkMap.set(key, {
          market: country,
          optimization_goal: optimizationGoal,
          total_spend: 0,
          total_results: 0,
          impressions: 0,
          campaign_count: 0,
          industry: industry,
        });
      }

      const benchmark = benchmarkMap.get(key)!;
      benchmark.total_spend += spend;
      benchmark.total_results += results;
      benchmark.impressions += impressions;
      benchmark.campaign_count += 1;
    }

    // Also add REACH and CLICK benchmarks if we have the data
    // These are useful for broad targeting campaigns
    const countrySpendMap = new Map<string, { spend: number; reach: number; clicks: number; impressions: number }>();
    
    for (const insight of insights) {
      const dimensions = insight.dimensions || {};
      const metrics = insight.metrics || {};
      const country = dimensions.country_code || "UNKNOWN";
      const spend = parseFloat(metrics.spend || "0");
      const reach = parseFloat(metrics.reach || "0");
      const clicks = parseFloat(metrics.clicks || "0");
      const impressions = parseFloat(metrics.impressions || "0");

      if (!countrySpendMap.has(country)) {
        countrySpendMap.set(country, { spend: 0, reach: 0, clicks: 0, impressions: 0 });
      }
      const countryData = countrySpendMap.get(country)!;
      countryData.spend += spend;
      countryData.reach += reach;
      countryData.clicks += clicks;
      countryData.impressions += impressions;
    }

    // Add aggregated REACH and CLICK benchmarks per country
    for (const [country, data] of countrySpendMap.entries()) {
      if (data.reach > 0 && !benchmarkMap.has(`${country}_REACH`)) {
        benchmarkMap.set(`${country}_REACH`, {
          market: country,
          optimization_goal: "REACH",
          total_spend: data.spend,
          total_results: data.reach,
          impressions: data.impressions,
          campaign_count: 1,
          industry: industry,
        });
      }
      if (data.clicks > 0 && !benchmarkMap.has(`${country}_CLICK`)) {
        benchmarkMap.set(`${country}_CLICK`, {
          market: country,
          optimization_goal: "CLICK",
          total_spend: data.spend,
          total_results: data.clicks,
          impressions: data.impressions,
          campaign_count: 1,
          industry: industry,
        });
      }
    }

    console.log(`[BENCHMARK] Calculated ${benchmarkMap.size} unique benchmarks`);

    // Store benchmarks in database
    let storedCount = 0;
    
    for (const [key, benchmark] of benchmarkMap.entries()) {
      const avgCostPerResult = benchmark.total_results > 0
        ? benchmark.total_spend / benchmark.total_results
        : null;

      const { error } = await supabase
        .from("campaign_performance_benchmarks")
        .upsert({
          user_id: user.id,
          platform: 'tiktok',
          market: benchmark.market,
          optimization_goal: benchmark.optimization_goal,
          industry: benchmark.industry,
          avg_cost_per_result: avgCostPerResult,
          total_spend: benchmark.total_spend,
          total_results: benchmark.total_results,
          impressions: benchmark.impressions,
          campaign_count: benchmark.campaign_count,
          date_range_start: dateRangeStart,
          date_range_end: dateRangeEnd,
        }, {
          onConflict: "user_id,platform,market,optimization_goal,industry,date_range_start,date_range_end"
        });

      if (error) {
        console.error(`[BENCHMARK] Error storing ${key}:`, error);
      } else {
        console.log(`[BENCHMARK] ✓ ${benchmark.market}/${benchmark.optimization_goal}: CPR $${avgCostPerResult?.toFixed(2) || 'N/A'} (${benchmark.total_results.toFixed(0)} results)`);
        storedCount++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`✅ TIKTOK BENCHMARK SYNC COMPLETED - ${storedCount} benchmarks stored`);
    console.log("=".repeat(60));

    return new Response(
      JSON.stringify({
        success: true,
        advertiserId,
        benchmarksSynced: storedCount,
        dateRange: { start: dateRangeStart, end: dateRangeEnd }
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
