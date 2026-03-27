import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessTokenWithRefresh } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SNAPCHAT_API_BASE = "https://adsapi.snapchat.com/v1";

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

    let adAccountId: string | undefined;
    try {
      const body = await req.text();
      if (body && body.trim()) {
        const parsed = JSON.parse(body);
        adAccountId = parsed.adAccountId;
      }
    } catch {
      throw new Error("Invalid request body - expected JSON with adAccountId");
    }

    if (!adAccountId) {
      throw new Error("adAccountId is required");
    }

    console.log(`🚀 STARTING SNAPCHAT BENCHMARK SYNC - Ad Account: ${adAccountId}`);

    // Get Snapchat platform connection
    const { data: platformData } = await supabase
      .from("connected_platforms")
      .select("id, access_token, refresh_token")
      .eq("user_id", user.id)
      .eq("platform_type", "snapchat")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!platformData) {
      throw new Error("No active Snapchat connection found");
    }

    const accessToken = await getAccessTokenWithRefresh(supabase, platformData.id, platformData.access_token, "snapchat");
    if (!accessToken) {
      throw new Error("Failed to retrieve Snapchat access token");
    }

    // Get client industry
    let industry: string | null = null;
    const { data: accountData } = await supabase
      .from("snapchat_ad_accounts")
      .select("client_id")
      .eq("account_id", adAccountId)
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

    // First, get all campaigns for this ad account
    const campaignsResponse = await fetch(
      `${SNAPCHAT_API_BASE}/adaccounts/${adAccountId}/campaigns`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );

    if (!campaignsResponse.ok) {
      throw new Error(`Failed to fetch Snapchat campaigns: ${await campaignsResponse.text()}`);
    }

    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.campaigns || [];

    if (campaigns.length === 0) {
      console.log("No campaigns found for this Snapchat ad account");
      return new Response(
        JSON.stringify({ success: true, benchmarksSynced: 0, message: "No campaigns found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[BENCHMARK] Found ${campaigns.length} Snapchat campaigns`);

    // Map Snapchat objectives to optimization goals
    const objectiveGoalMap: Record<string, string> = {
      "BRAND_AWARENESS": "REACH",
      "WEB_VIEW": "LINK_CLICKS",
      "WEB_CONVERSIONS": "CONVERSION",
      "APP_INSTALLS": "APP_INSTALLS",
      "VIDEO_VIEWS": "VIDEO_VIEWS",
      "ENGAGEMENT": "POST_ENGAGEMENT",
      "LEAD_GENERATION": "LEAD_GENERATION",
      "CATALOG_SALES": "PURCHASE",
      "TRAFFIC": "LINK_CLICKS",
    };

    // Build campaign objective map
    const campaignObjectiveMap = new Map<string, string>();
    for (const c of campaigns) {
      const campaign = c.campaign || c;
      campaignObjectiveMap.set(campaign.id, campaign.objective || "UNKNOWN");
    }

    // Generate 12 monthly ranges
    const monthlyRanges = generateMonthlyRanges(12);
    console.log(`[BENCHMARK] Will sync ${monthlyRanges.length} monthly segments`);

    let totalStored = 0;

    for (const { start, end } of monthlyRanges) {
      console.log(`[BENCHMARK] Processing month: ${start} to ${end}`);

      const benchmarkMap = new Map<string, BenchmarkData>();

      // Fetch stats for each campaign for this month
      for (const c of campaigns) {
        const campaign = c.campaign || c;
        const campaignId = campaign.id;
        const objective = campaign.objective || "UNKNOWN";
        const optimizationGoal = objectiveGoalMap[objective] || objective;

        try {
          // Snapchat stats endpoint with country breakdown
          const statsUrl = `${SNAPCHAT_API_BASE}/campaigns/${campaignId}/stats?` +
            `start_time=${start}T00:00:00.000-00:00&end_time=${end}T23:59:59.000-00:00` +
            `&granularity=TOTAL&breakdown=country`;

          const statsResponse = await fetch(statsUrl, {
            headers: { "Authorization": `Bearer ${accessToken}` },
          });

          if (!statsResponse.ok) {
            console.warn(`[BENCHMARK] Stats error for campaign ${campaignId}: ${statsResponse.status}`);
            continue;
          }

          const statsData = await statsResponse.json();
          const timeseries = statsData.timeseries_stats || statsData.total_stats || [];

          for (const ts of timeseries) {
            const stats = ts.timeseries_stat || ts.total_stat || ts;
            const breakdown = stats.breakdown_stats?.country || stats.dimension_stats || [];
            
            // If no breakdown, use the aggregate
            const entries = breakdown.length > 0 ? breakdown : [{ country: "UNKNOWN", ...stats }];

            for (const entry of entries) {
              const country = entry.country || entry.dimension_value || "UNKNOWN";
              const s = entry.stats || entry;
              
              const spend = parseFloat(s.spend || s.total_amount_spent || "0") / 1_000_000; // Snapchat uses micro-currency
              const impressions = parseInt(s.impressions || "0");
              const clicks = parseInt(s.swipes || s.clicks || "0"); // Snapchat calls clicks "swipes"
              const conversions = parseInt(s.conversion_purchases || s.conversions || "0");
              const videoViews = parseInt(s.video_views || s.quartile_3 || "0");
              const revenue = parseFloat(s.conversion_purchases_value || "0") / 1_000_000;

              if (spend <= 0) continue;

              let results = 0;
              if (optimizationGoal === "REACH") results = parseInt(s.reach || String(impressions));
              else if (optimizationGoal === "LINK_CLICKS") results = clicks;
              else if (optimizationGoal === "CONVERSION" || optimizationGoal === "PURCHASE") results = conversions > 0 ? conversions : clicks;
              else if (optimizationGoal === "VIDEO_VIEWS") results = videoViews > 0 ? videoViews : clicks;
              else if (optimizationGoal === "APP_INSTALLS") results = conversions;
              else results = clicks > 0 ? clicks : impressions / 1000;

              const key = `${country}_${optimizationGoal}`;
              if (!benchmarkMap.has(key)) {
                benchmarkMap.set(key, {
                  market: country, optimization_goal: optimizationGoal,
                  total_spend: 0, total_results: 0, impressions: 0, clicks: 0,
                  link_clicks: 0, landing_page_views: 0, revenue: 0,
                  campaign_count: 0, industry,
                });
              }

              const bm = benchmarkMap.get(key)!;
              bm.total_spend += spend;
              bm.total_results += results;
              bm.impressions += impressions;
              bm.clicks += clicks;
              bm.revenue += revenue;
              bm.campaign_count += 1;
            }
          }
        } catch (error) {
          console.warn(`[BENCHMARK] Error processing Snapchat campaign ${campaignId}:`, error);
        }
      }

      // Store benchmarks for this month
      for (const [key, benchmark] of benchmarkMap.entries()) {
        const avgCostPerResult = benchmark.total_results > 0
          ? benchmark.total_spend / benchmark.total_results
          : null;

        const { error } = await supabase
          .from("campaign_performance_benchmarks")
          .upsert({
            user_id: user.id,
            platform: 'snapchat',
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
            date_range_start: start,
            date_range_end: end,
          }, {
            onConflict: "user_id,platform,market,optimization_goal,industry,date_range_start,date_range_end"
          });

        if (!error) totalStored++;
      }

      console.log(`[BENCHMARK] Month ${start}: ${benchmarkMap.size} Snapchat benchmarks`);
    }

    console.log(`✅ SNAPCHAT BENCHMARK SYNC COMPLETED - ${totalStored} benchmarks stored`);

    return new Response(
      JSON.stringify({
        success: true,
        adAccountId,
        benchmarksSynced: totalStored,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in sync-snapchat-benchmarks:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
