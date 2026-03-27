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

    console.log("🚀 STARTING BENCHMARK SYNC (12-month monthly)");

    // Get active Meta connection
    const { data: connection, error: connError } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .single();

    if (connError || !connection) {
      throw new Error("No active Meta connection found");
    }

    const accessToken = connection.access_token;
    if (!accessToken) {
      throw new Error("No access token available");
    }

    // Get all ad accounts with client industry
    const { data: adAccounts } = await supabase
      .from("meta_ad_accounts")
      .select(`account_id, client_id, clients!inner(industry)`)
      .eq("user_id", user.id);

    if (!adAccounts || adAccounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No ad accounts found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Found ${adAccounts.length} ad accounts to process`);

    // Generate 12 monthly date ranges
    const monthlyRanges = generateMonthlyRanges(12);
    console.log(`📅 Will sync ${monthlyRanges.length} monthly segments`);

    let totalStored = 0;
    let processedAccounts = 0;
    let failedAccounts = 0;

    for (const account of adAccounts) {
      try {
        console.log(`\n📱 Processing account ${processedAccounts + 1}/${adAccounts.length}: ${account.account_id}`);
        const industry = (account.clients as any)?.industry || null;

        for (const { start, end } of monthlyRanges) {
          const benchmarkMap = new Map<string, BenchmarkData>();
          
          await processCampaignsBatch(
            account.account_id, accessToken, start, end, benchmarkMap, industry
          );

          // Store benchmarks for this month
          for (const [key, benchmark] of benchmarkMap.entries()) {
            const avgCostPerResult = benchmark.total_results > 0
              ? benchmark.total_spend / benchmark.total_results
              : null;

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
                campaign_count: benchmark.campaign_count,
                date_range_start: start,
                date_range_end: end,
              }, {
                onConflict: "user_id,platform,market,optimization_goal,industry,date_range_start,date_range_end"
              });

            if (!error) totalStored++;
          }
        }

        processedAccounts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        failedAccounts++;
        console.error(`❌ Error processing account ${account.account_id}:`, error);
      }
    }

    console.log(`✅ BENCHMARK SYNC COMPLETED - ${totalStored} benchmarks stored`);

    return new Response(
      JSON.stringify({
        success: true,
        benchmarks_synced: totalStored,
        accounts_processed: processedAccounts,
        accounts_failed: failedAccounts,
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
  let pageNumber = 0;

  while (nextUrl) {
    pageNumber++;
    const campaignsResponse = await fetch(nextUrl);
    
    if (!campaignsResponse.ok) {
      console.error(`  ❌ Error fetching campaigns page ${pageNumber}: ${await campaignsResponse.text()}`);
      break;
    }

    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.data || [];

    for (let i = 0; i < campaigns.length; i += 20) {
      const batch = campaigns.slice(i, i + 20);
      await Promise.all(
        batch.map((campaign: any) => 
          processCampaignInsights(campaign, accessToken, startDate, endDate, benchmarkMap, industry)
        )
      );
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    nextUrl = campaignsData.paging?.next || null;
    if (nextUrl) await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

/**
 * Map campaign objective to the PRIMARY result action type.
 * Spend is attributed ONLY to this goal — no double-counting.
 */
const objectiveToPrimary: Record<string, { actionTypes: string[]; goal: string }> = {
  "OUTCOME_TRAFFIC": { actionTypes: ["link_click", "landing_page_view"], goal: "LINK_CLICKS" },
  "OUTCOME_ENGAGEMENT": { actionTypes: ["post_engagement", "page_engagement", "post", "comment", "like", "onsite_conversion.post_save", "photo_view"], goal: "POST_ENGAGEMENT" },
  "OUTCOME_AWARENESS": { actionTypes: ["__reach__"], goal: "REACH" },
  "OUTCOME_LEADS": { actionTypes: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped", "leadgen_grouped"], goal: "LEAD_GENERATION" },
  "OUTCOME_SALES": { actionTypes: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "complete_registration", "offsite_conversion.fb_pixel_complete_registration"], goal: "PURCHASE" },
  "OUTCOME_APP_PROMOTION": { actionTypes: ["app_install", "mobile_app_install"], goal: "APP_INSTALLS" },
  "LINK_CLICKS": { actionTypes: ["link_click", "landing_page_view"], goal: "LINK_CLICKS" },
  "POST_ENGAGEMENT": { actionTypes: ["post_engagement", "page_engagement"], goal: "POST_ENGAGEMENT" },
  "BRAND_AWARENESS": { actionTypes: ["__reach__"], goal: "REACH" },
  "REACH": { actionTypes: ["__reach__"], goal: "REACH" },
  "VIDEO_VIEWS": { actionTypes: ["video_view", "thruplay"], goal: "THRUPLAY" },
  "CONVERSIONS": { actionTypes: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "offsite_conversion.fb_pixel_lead", "lead", "complete_registration"], goal: "OFFSITE_CONVERSIONS" },
  "LEAD_GENERATION": { actionTypes: ["lead", "offsite_conversion.fb_pixel_lead", "leadgen_grouped"], goal: "LEAD_GENERATION" },
  "APP_INSTALLS": { actionTypes: ["app_install", "mobile_app_install"], goal: "APP_INSTALLS" },
};

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
      `&fields=spend,impressions,clicks,reach,actions,action_values` +
      `&level=campaign` +
      `&breakdowns=country` +
      `&access_token=${accessToken}`;

    const insightsResponse = await fetch(insightsUrl);
    if (!insightsResponse.ok) return;

    const insightsData = await insightsResponse.json();
    const insights = insightsData.data || [];
    if (insights.length === 0) return;

    const objective = campaign.objective || "UNKNOWN";
    const primaryConfig = objectiveToPrimary[objective];

    for (const insight of insights) {
      const country = insight.country || "UNKNOWN";
      const spend = parseFloat(insight.spend || "0");
      const impressions = parseFloat(insight.impressions || "0");
      const totalClicks = parseFloat(insight.clicks || "0");
      const reach = parseFloat(insight.reach || "0");
      const actions = insight.actions || [];
      const actionValues = insight.action_values || [];

      if (spend <= 0) continue;

      const linkClickAction = actions.find((a: any) => a.action_type === "link_click");
      const lpvAction = actions.find((a: any) => a.action_type === "landing_page_view");
      const linkClicks = linkClickAction ? parseFloat(linkClickAction.value || "0") : 0;
      const landingPageViews = lpvAction ? parseFloat(lpvAction.value || "0") : 0;

      let revenue = 0;
      for (const av of actionValues) {
        if (["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"].includes(av.action_type)) {
          revenue += parseFloat(av.value || "0");
        }
      }

      // Determine primary optimization goal and result count from campaign objective
      let optimizationGoal = primaryConfig?.goal || objective;
      let results = 0;

      if (primaryConfig) {
        if (primaryConfig.actionTypes.includes("__reach__")) {
          // REACH/AWARENESS objective: result = reach
          results = reach;
        } else {
          // Find the first matching action for the primary goal
          for (const actionType of primaryConfig.actionTypes) {
            const action = actions.find((a: any) => a.action_type === actionType);
            if (action) {
              results = parseFloat(action.value || "0");
              break;
            }
          }
        }
      }

      // Fallback: if no primary results found, use clicks
      if (results <= 0 && totalClicks > 0) {
        results = totalClicks;
        if (!primaryConfig) optimizationGoal = "CLICK";
      }

      // Skip if no measurable results at all
      if (results <= 0) continue;

      // Attribute spend to the PRIMARY goal only
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
      benchmark.clicks += totalClicks;
      benchmark.link_clicks += linkClicks;
      benchmark.landing_page_views += landingPageViews;
      benchmark.revenue += revenue;
      benchmark.campaign_count += 1;
    }
  } catch (error) {
    console.error(`Error processing campaign ${campaign.id}:`, error);
  }
}
