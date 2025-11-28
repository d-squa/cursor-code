import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const supabaseUrl = Deno.env.get("VITE_SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    console.log("=".repeat(60));
    console.log("🚀 STARTING TIKTOK BENCHMARK SYNC");
    console.log("User ID:", user.id);
    console.log("Timestamp:", new Date().toISOString());
    console.log("=".repeat(60));

    // Get all TikTok ad accounts for the user with client industry
    const { data: adAccounts, error: accountsError } = await supabase
      .from("tiktok_ad_accounts")
      .select(`
        advertiser_id,
        client_id,
        clients!inner(industry)
      `)
      .eq("user_id", user.id);

    if (accountsError) {
      console.error("❌ Error fetching ad accounts:", accountsError);
      throw accountsError;
    }

    if (!adAccounts || adAccounts.length === 0) {
      console.log("⚠️ No TikTok ad accounts found for user");
      return new Response(
        JSON.stringify({ message: "No TikTok ad accounts found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Found ${adAccounts.length} TikTok ad accounts to process`);

    // Calculate date range (last 3 months)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    const dateRangeStart = startDate.toISOString().split("T")[0];
    const dateRangeEnd = endDate.toISOString().split("T")[0];

    console.log(`📅 Date Range: ${dateRangeStart} to ${dateRangeEnd}`);

    // Process each ad account's metrics
    const benchmarkMap = new Map<string, BenchmarkData>();
    let processedAccounts = 0;
    let failedAccounts = 0;

    for (const account of adAccounts) {
      try {
        console.log(`\n📱 Processing account ${processedAccounts + 1}/${adAccounts.length}: ${account.advertiser_id}`);
        
        // Get all campaigns for this advertiser
        const { data: campaigns } = await supabase
          .from("tiktok_campaigns")
          .select("tiktok_campaign_id, objective_type")
          .eq("advertiser_id", account.advertiser_id)
          .eq("user_id", user.id);

        if (!campaigns || campaigns.length === 0) {
          console.log(`  ⚠️  No campaigns found for advertiser ${account.advertiser_id}`);
          processedAccounts++;
          continue;
        }

        console.log(`  ✅ Found ${campaigns.length} campaigns`);

        // Get ad groups to access targeting/market data
        const { data: adGroups } = await supabase
          .from("tiktok_ad_groups")
          .select("tiktok_ad_group_id, tiktok_campaign_id, optimization_goal, targeting")
          .eq("advertiser_id", account.advertiser_id)
          .eq("user_id", user.id)
          .in("tiktok_campaign_id", campaigns.map(c => c.tiktok_campaign_id));

        console.log(`  ✅ Found ${adGroups?.length || 0} ad groups`);

        // Fetch metrics for this advertiser in the date range
        const { data: metrics } = await supabase
          .from("tiktok_metrics")
          .select("*")
          .eq("advertiser_id", account.advertiser_id)
          .eq("user_id", user.id)
          .gte("date", dateRangeStart)
          .lte("date", dateRangeEnd);

        if (!metrics || metrics.length === 0) {
          console.log(`  ⚠️  No metrics found for date range`);
          processedAccounts++;
          continue;
        }

        console.log(`  ✅ Retrieved ${metrics.length} metric records`);

        // Group metrics by campaign and ad group
        const campaignMetricsMap = new Map<string, any[]>();
        const adGroupMetricsMap = new Map<string, any[]>();

        for (const metric of metrics) {
          if (metric.tiktok_campaign_id) {
            if (!campaignMetricsMap.has(metric.tiktok_campaign_id)) {
              campaignMetricsMap.set(metric.tiktok_campaign_id, []);
            }
            campaignMetricsMap.get(metric.tiktok_campaign_id)!.push(metric);
          }
          if (metric.tiktok_ad_group_id) {
            if (!adGroupMetricsMap.has(metric.tiktok_ad_group_id)) {
              adGroupMetricsMap.set(metric.tiktok_ad_group_id, []);
            }
            adGroupMetricsMap.get(metric.tiktok_ad_group_id)!.push(metric);
          }
        }

        // Process ad group level benchmarks (more granular)
        for (const adGroup of (adGroups || [])) {
          const adGroupMetrics = adGroupMetricsMap.get(adGroup.tiktok_ad_group_id) || [];
          if (adGroupMetrics.length === 0) continue;

          // Extract market from targeting
          const targeting = adGroup.targeting as any;
          const markets = targeting?.location_ids || targeting?.countries || [];
          const market = markets.length > 0 ? markets[0] : "UNKNOWN";

          const optimizationGoal = adGroup.optimization_goal || "UNKNOWN";

          // Aggregate metrics
          const totalSpend = adGroupMetrics.reduce((sum, m) => sum + (m.spend || 0), 0);
          const totalImpressions = adGroupMetrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
          const totalConversions = adGroupMetrics.reduce((sum, m) => sum + (m.conversions || 0), 0);
          const totalClicks = adGroupMetrics.reduce((sum, m) => sum + (m.clicks || 0), 0);

          // Determine result count based on optimization goal
          let results = 0;
          if (optimizationGoal.includes("CONVERSION") || optimizationGoal.includes("PURCHASE")) {
            results = totalConversions;
          } else if (optimizationGoal.includes("CLICK")) {
            results = totalClicks;
          } else {
            results = totalImpressions / 1000; // Use impressions as fallback
          }

          const key = `${market}_${optimizationGoal}`;

          if (!benchmarkMap.has(key)) {
            benchmarkMap.set(key, {
              market,
              optimization_goal: optimizationGoal,
              total_spend: 0,
              total_results: 0,
              impressions: 0,
              campaign_count: 0,
              industry: (account.clients as any)?.industry || null,
            });
          }

          const benchmark = benchmarkMap.get(key)!;
          benchmark.total_spend += totalSpend;
          benchmark.total_results += results;
          benchmark.impressions += totalImpressions;
          benchmark.campaign_count += 1;
        }

        processedAccounts++;
        console.log(`✅ Account ${account.advertiser_id} processed successfully`);
        
      } catch (error) {
        failedAccounts++;
        console.error(`❌ Error processing account ${account.advertiser_id}:`, error);
      }
    }

    console.log(`\n📊 Processing Summary:`);
    console.log(`  - Accounts processed: ${processedAccounts}`);
    console.log(`  - Accounts failed: ${failedAccounts}`);
    console.log(`  - Unique benchmarks found: ${benchmarkMap.size}`);

    // Store benchmarks in database
    console.log(`\n💾 Storing ${benchmarkMap.size} TikTok benchmarks in database...`);
    
    let storedCount = 0;
    let storageErrors = 0;
    
    for (const [key, benchmark] of benchmarkMap.entries()) {
      const avgCostPerResult = benchmark.total_results > 0
        ? benchmark.total_spend / benchmark.total_results
        : null;

      try {
        const { error } = await supabase
          .from("campaign_performance_benchmarks")
          .upsert({
            user_id: user.id,
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
            onConflict: "user_id,market,optimization_goal,date_range_start,date_range_end"
          });

        if (error) {
          console.error(`❌ Error storing benchmark ${key}:`, error);
          storageErrors++;
        } else {
          console.log(`✅ Stored: ${benchmark.market} / ${benchmark.optimization_goal} - CPR: $${avgCostPerResult?.toFixed(2) || 'N/A'} (${benchmark.campaign_count} campaigns)`);
          storedCount++;
        }
      } catch (error) {
        console.error(`❌ Exception storing benchmark ${key}:`, error);
        storageErrors++;
      }
    }

    console.log(`\n💾 Storage Summary:`);
    console.log(`  - Successfully stored: ${storedCount}`);
    console.log(`  - Storage errors: ${storageErrors}`);
    console.log("\n" + "=".repeat(60));
    console.log("✅ TIKTOK BENCHMARK SYNC COMPLETED");
    console.log("=".repeat(60));

    return new Response(
      JSON.stringify({
        success: true,
        benchmarks_synced: benchmarkMap.size,
        date_range: { start: dateRangeStart, end: dateRangeEnd }
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
