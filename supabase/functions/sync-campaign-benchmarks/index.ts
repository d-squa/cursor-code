import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CampaignInsight {
  spend: string;
  impressions: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  country?: string;
}

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
    console.log("🚀 STARTING BENCHMARK SYNC");
    console.log("User ID:", user.id);
    console.log("Timestamp:", new Date().toISOString());
    console.log("=".repeat(60));

    // Get active Meta connection
    const { data: connection, error: connError } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .single();

    if (connError || !connection) {
      console.error("❌ No active Meta connection found:", connError);
      throw new Error("No active Meta connection found");
    }

    console.log("✅ Meta connection found:", connection.platform_name);

    const accessToken = connection.access_token;
    if (!accessToken) {
      console.error("❌ No access token available");
      throw new Error("No access token available");
    }

    console.log("✅ Access token retrieved");

    // Get all ad accounts for the user with client industry
    const { data: adAccounts } = await supabase
      .from("meta_ad_accounts")
      .select(`
        account_id,
        client_id,
        clients!inner(industry)
      `)
      .eq("user_id", user.id);

    if (!adAccounts || adAccounts.length === 0) {
      console.log("⚠️ No ad accounts found for user");
      return new Response(
        JSON.stringify({ message: "No ad accounts found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Found ${adAccounts.length} ad accounts to process`);

    // Calculate date range (last 3 months)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    const dateRangeStart = startDate.toISOString().split("T")[0];
    const dateRangeEnd = endDate.toISOString().split("T")[0];

    console.log(`📅 Date Range: ${dateRangeStart} to ${dateRangeEnd}`);

    // Process each ad account
    const benchmarkMap = new Map<string, BenchmarkData>();
    let processedAccounts = 0;
    let failedAccounts = 0;

    for (const account of adAccounts) {
      try {
        console.log(`\n📱 Processing account ${processedAccounts + 1}/${adAccounts.length}: ${account.account_id}`);
        
        // Fetch campaigns in batches to avoid API limits
        await processCampaignsBatch(
          account.account_id,
          accessToken,
          dateRangeStart,
          dateRangeEnd,
          benchmarkMap,
          (account.clients as any)?.industry || null
        );
        
        processedAccounts++;
        console.log(`✅ Account ${account.account_id} processed successfully`);
        
        // Add delay between accounts to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        failedAccounts++;
        console.error(`❌ Error processing account ${account.account_id}:`, error);
        // Continue with next account
      }
    }

    console.log(`\n📊 Processing Summary:`);
    console.log(`  - Accounts processed: ${processedAccounts}`);
    console.log(`  - Accounts failed: ${failedAccounts}`);
    console.log(`  - Unique benchmarks found: ${benchmarkMap.size}`);

    // Store benchmarks in database
    console.log(`\n💾 Storing ${benchmarkMap.size} benchmarks in database...`);
    
    let storedCount = 0;
    let storageErrors = 0;
    
    for (const [key, benchmark] of benchmarkMap.entries()) {
      const avgCostPerResult = benchmark.total_results > 0
        ? benchmark.total_spend / benchmark.total_results
        : null;
      const avgCtr = benchmark.impressions > 0
        ? (benchmark.clicks / benchmark.impressions) * 100
        : null;
      const avgRoas = benchmark.total_spend > 0 && benchmark.revenue > 0
        ? benchmark.revenue / benchmark.total_spend
        : null;

      try {
        const { error } = await supabase
          .from("campaign_performance_benchmarks")
          .upsert({
            user_id: user.id,
            platform: 'meta',
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
            avg_ctr: avgCtr,
            avg_roas: avgRoas,
            campaign_count: benchmark.campaign_count,
            date_range_start: dateRangeStart,
            date_range_end: dateRangeEnd,
          }, {
            onConflict: "user_id,platform,market,optimization_goal,industry,date_range_start,date_range_end"
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
    console.log("✅ BENCHMARK SYNC COMPLETED");
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
    console.error("Error in sync-campaign-benchmarks:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processCampaignsBatch(
  accountId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  benchmarkMap: Map<string, BenchmarkData>,
  industry: string | null
): Promise<void> {
  let nextUrl = `https://graph.facebook.com/v21.0/act_${accountId}/campaigns?fields=id,name,objective,status&limit=100&access_token=${accessToken}`;
  let totalCampaigns = 0;
  let pageNumber = 0;

  while (nextUrl) {
    pageNumber++;
    console.log(`  📄 Fetching campaigns page ${pageNumber}...`);
    
    const campaignsResponse = await fetch(nextUrl);
    
    if (!campaignsResponse.ok) {
      const errorText = await campaignsResponse.text();
      console.error(`  ❌ Error fetching campaigns page ${pageNumber}: ${errorText}`);
      break;
    }

    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.data || [];

    console.log(`  ✅ Retrieved ${campaigns.length} campaigns from page ${pageNumber}`);
    totalCampaigns += campaigns.length;

    // Process campaigns in smaller batches to avoid timeouts
    for (let i = 0; i < campaigns.length; i += 20) {
      const batch = campaigns.slice(i, i + 20);
      const batchNumber = Math.floor(i / 20) + 1;
      console.log(`    🔄 Processing batch ${batchNumber} (campaigns ${i + 1}-${Math.min(i + 20, campaigns.length)})...`);
      
      await Promise.all(
        batch.map((campaign: any) => 
          processCampaignInsights(
            campaign,
            accessToken,
            startDate,
            endDate,
            benchmarkMap,
            industry
          )
        )
      );
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Check for next page
    nextUrl = campaignsData.paging?.next || null;
    
    if (nextUrl) {
      console.log(`  ➡️  More campaigns available, fetching next page...`);
      // Add delay before fetching next page
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`  ✅ Total campaigns processed for account: ${totalCampaigns}`);
}

async function processCampaignInsights(
  campaign: any,
  accessToken: string,
  startDate: string,
  endDate: string,
  benchmarkMap: Map<string, BenchmarkData>,
  industry: string | null
): Promise<void> {
  try {
    const insightsUrl = `https://graph.facebook.com/v21.0/${campaign.id}/insights?` +
      `time_range={'since':'${startDate}','until':'${endDate}'}` +
      `&fields=spend,impressions,clicks,actions,action_values,country` +
      `&level=campaign` +
      `&breakdowns=country` +
      `&access_token=${accessToken}`;

    const insightsResponse = await fetch(insightsUrl);
    
    if (!insightsResponse.ok) {
      console.log(`      ⚠️  Skipping campaign ${campaign.id} - no insights available`);
      return; // Skip this campaign on error
    }

    const insightsData = await insightsResponse.json();
    const insights: CampaignInsight[] = insightsData.data || [];

    if (insights.length === 0) {
      console.log(`      ⚠️  Campaign ${campaign.name || campaign.id} - no data for date range`);
      return;
    }

    const objective = campaign.objective || "UNKNOWN";
    let benchmarksAdded = 0;

    for (const insight of insights) {
      const country = insight.country || "UNKNOWN";
      const spend = parseFloat(insight.spend || "0");
      const impressions = parseFloat(insight.impressions || "0");

      // Extract results based on actions
      const actions = insight.actions || [];
      
      // Map action types to optimization goals
      const actionTypeMap: { [key: string]: string } = {
        "link_click": "LINK_CLICKS",
        "post_engagement": "POST_ENGAGEMENT",
        "page_engagement": "PAGE_LIKES",
        "video_view": "VIDEO_VIEWS",
        "offsite_conversion.fb_pixel_purchase": "OFFSITE_CONVERSIONS",
        "offsite_conversion.fb_pixel_lead": "LEAD_GENERATION",
        "omni_purchase": "PURCHASE",
        "app_install": "APP_INSTALLS",
        "landing_page_view": "LANDING_PAGE_VIEWS",
        "thruplay": "THRUPLAY",
      };

      for (const action of actions) {
        const optimizationGoal = actionTypeMap[action.action_type] || objective;
        const results = parseFloat(action.value || "0");

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
        benchmarksAdded++;
      }

      // If no actions, still store by objective
      if (actions.length === 0 && spend > 0) {
        const key = `${country}_${objective}`;
        
        if (!benchmarkMap.has(key)) {
          benchmarkMap.set(key, {
            market: country,
            optimization_goal: objective,
            total_spend: 0,
            total_results: 0,
            impressions: 0,
            campaign_count: 0,
            industry: industry,
          });
        }

        const benchmark = benchmarkMap.get(key)!;
        benchmark.total_spend += spend;
        benchmark.impressions += impressions;
        benchmark.campaign_count += 1;
        benchmarksAdded++;
      }
    }
    
    if (benchmarksAdded > 0) {
      console.log(`      ✅ Campaign ${campaign.name || campaign.id} - added ${benchmarksAdded} benchmark(s)`);
    }
  } catch (error) {
    console.error(`      ❌ Error processing campaign ${campaign.id}:`, error);
  }
}
