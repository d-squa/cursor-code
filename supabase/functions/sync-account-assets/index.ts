import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { getAccessToken, getAccessTokenWithRefresh } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { accountId, platform } = await req.json();

    if (!accountId) {
      throw new Error("Account ID is required");
    }

    if (!platform || (platform !== "meta" && platform !== "google")) {
      throw new Error("Platform must be 'meta' or 'google'");
    }

    console.log(`[SYNC-ACCOUNT-ASSETS] Starting asset sync for ${platform} account ${accountId}, user ${user.id}`);

    // Route to Google Ads sync if platform is google
    if (platform === "google") {
      return await syncGoogleAdsAssets(supabase, user, accountId, req.headers.get("authorization")!);
    }

    // Find the correct Meta platform connection for this specific ad account
    // First check if the ad account has a known platform_id mapping
    let platformId: string | null = null;
    let fallbackToken: string | null = null;

    // Try to find the platform connection that was used to sync this ad account
    const { data: metaAdAccount } = await supabase
      .from("meta_ad_accounts")
      .select("user_id, team_id")
      .eq("account_id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    // Get all active Meta platform connections for this user
    const { data: metaPlatforms, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, access_token, ad_account_id, metadata, team_id")
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .or(`user_id.eq.${user.id}${metaAdAccount?.team_id ? `,team_id.eq.${metaAdAccount.team_id}` : ""}`)
      .order("updated_at", { ascending: false });

    if (platformError || !metaPlatforms || metaPlatforms.length === 0) {
      console.error("[SYNC-ACCOUNT-ASSETS] Platform lookup error:", platformError);
      throw new Error("No active Meta platform connection found");
    }

    // Prefer the platform connection whose metadata contains this ad account
    let platformData = metaPlatforms[0]; // default to most recent
    for (const p of metaPlatforms) {
      const accounts = Array.isArray(p.metadata?.ad_accounts) ? p.metadata.ad_accounts : [];
      const hasAccount = accounts.some((a: any) => 
        String(a?.account_id || a?.id || "") === accountId || 
        String(a?.account_id || a?.id || "").replace("act_", "") === accountId.replace("act_", "")
      );
      if (hasAccount) {
        platformData = p;
        console.log(`[SYNC-ACCOUNT-ASSETS] Matched platform ${p.id} via metadata for account ${accountId}`);
        break;
      }
    }

    console.log(`[SYNC-ACCOUNT-ASSETS] Using platform connection ${platformData.id} for Meta account ${accountId}`);

    // Get access token from Vault (with fallback to database column)
    const accessToken = await getAccessToken(supabase, platformData.id, platformData.access_token);
    
    if (!accessToken) {
      throw new Error("Failed to retrieve access token");
    }

    const syncResults = {
      pixels: 0,
      pages: 0,
      instagramAccounts: 0,
      catalogs: 0,
      productSets: 0,
      conversionEvents: 0,
    };

    // 1. Fetch pixels directly associated with this ad account
    try {
      console.log(`[SYNC-ACCOUNT-ASSETS] Fetching pixels for ${accountId}...`);
      const pixelsResponse = await fetch(
        `https://graph.facebook.com/v21.0/${accountId}/adspixels?fields=id,name&limit=100&access_token=${accessToken}`
      );
      const pixelsData = await pixelsResponse.json();
      
      if (pixelsData?.data && pixelsData.data.length > 0) {
        // Delete existing pixels for this specific account
        await supabase
          .from("meta_pixels")
          .delete()
          .eq("user_id", user.id)
          .eq("ad_account_id", accountId);

        const pixelsToInsert = pixelsData.data.map((pixel: any) => ({
          user_id: user.id,
          ad_account_id: accountId,
          pixel_id: pixel.id,
          pixel_name: pixel.name,
          synced_at: new Date().toISOString(),
        }));

        const { error: pixelsError } = await supabase.from("meta_pixels").insert(pixelsToInsert);
        if (pixelsError) {
          console.error("[SYNC-ACCOUNT-ASSETS] Error inserting pixels:", pixelsError);
        } else {
          syncResults.pixels = pixelsToInsert.length;
          console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.pixels} pixels`);
        }

        // Sync conversion events for each pixel
        for (const pixel of pixelsToInsert) {
          const standardEvents = [
            'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
            'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead', 'CompleteRegistration'
          ];

          const eventsToInsert = standardEvents.map(eventName => ({
            user_id: user.id,
            ad_account_id: accountId,
            pixel_id: pixel.pixel_id,
            event_name: eventName,
            event_type: 'standard',
            synced_at: new Date().toISOString(),
          }));

          // Fetch custom conversions for this account
          try {
            const customConversionsResponse = await fetch(
              `https://graph.facebook.com/v21.0/${accountId}/customconversions?fields=name&limit=100&access_token=${accessToken}`
            );
            const customConversionsData = await customConversionsResponse.json();

            if (customConversionsData?.data) {
              customConversionsData.data.forEach((customConversion: any) => {
                eventsToInsert.push({
                  user_id: user.id,
                  ad_account_id: accountId,
                  pixel_id: pixel.pixel_id,
                  event_name: customConversion.name,
                  event_type: 'custom',
                  synced_at: new Date().toISOString(),
                });
              });
            }
          } catch (error) {
            console.error(`[SYNC-ACCOUNT-ASSETS] Error fetching custom conversions:`, error);
          }

          // Delete and re-insert events for this account+pixel combo
          await supabase
            .from("meta_conversion_events")
            .delete()
            .eq("user_id", user.id)
            .eq("ad_account_id", accountId)
            .eq("pixel_id", pixel.pixel_id);
          
          const { error: eventsError } = await supabase.from("meta_conversion_events").insert(eventsToInsert);
          if (!eventsError) {
            syncResults.conversionEvents += eventsToInsert.length;
          }
        }
        console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.conversionEvents} conversion events`);
      }
    } catch (error) {
      console.error("[SYNC-ACCOUNT-ASSETS] Error fetching pixels:", error);
    }

    // 2. Fetch pages assigned to this specific ad account
    try {
      console.log(`[SYNC-ACCOUNT-ASSETS] Fetching pages assigned to ad account ${accountId}...`);
      const assignedPagesResponse = await fetch(
        `https://graph.facebook.com/v21.0/${accountId}/promote_pages?fields=id,name,instagram_business_account{id,username}&limit=100&access_token=${accessToken}`
      );
      const assignedPagesData = await assignedPagesResponse.json();
      
      if (assignedPagesData?.data && assignedPagesData.data.length > 0) {
        // Delete existing pages for this specific account
        await supabase
          .from("meta_pages")
          .delete()
          .eq("user_id", user.id)
          .eq("ad_account_id", accountId);

        const pagesToInsert = assignedPagesData.data.map((page: any) => ({
          user_id: user.id,
          ad_account_id: accountId,
          page_id: page.id,
          page_name: page.name,
          synced_at: new Date().toISOString(),
        }));

        const { error: pagesError } = await supabase.from("meta_pages").insert(pagesToInsert);
        if (!pagesError) {
          syncResults.pages = pagesToInsert.length;
          console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.pages} pages`);
        }

        // Delete existing Instagram accounts for this ad account
        await supabase
          .from("meta_instagram_accounts")
          .delete()
          .eq("user_id", user.id)
          .eq("ad_account_id", accountId);

        const instagramToInsert: any[] = [];
        const seenInstagramIds = new Set<string>();
        assignedPagesData.data.forEach((page: any) => {
          if (page.instagram_business_account) {
            const igId = String(page.instagram_business_account.id);
            if (seenInstagramIds.has(igId)) return;
            seenInstagramIds.add(igId);
            instagramToInsert.push({
              user_id: user.id,
              ad_account_id: accountId,
              instagram_account_id: igId,
              username: page.instagram_business_account.username || page.name,
              synced_at: new Date().toISOString(),
            });
          }
        });

        if (instagramToInsert.length > 0) {
          const { error: igError } = await supabase.from("meta_instagram_accounts").upsert(
            instagramToInsert,
            { onConflict: "user_id,instagram_account_id" },
          );
          if (!igError) {
            syncResults.instagramAccounts = instagramToInsert.length;
            console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.instagramAccounts} Instagram accounts`);
          }
        }
      } else {
        console.log(`[SYNC-ACCOUNT-ASSETS] No pages assigned to ad account ${accountId}`);
      }
    } catch (error) {
      console.error("[SYNC-ACCOUNT-ASSETS] Error fetching pages:", error);
    }

    // 3. Fetch catalogs accessible by this ad account
    try {
      console.log(`[SYNC-ACCOUNT-ASSETS] Fetching catalogs for ad account ${accountId}...`);
      const catalogsResponse = await fetch(
        `https://graph.facebook.com/v21.0/${accountId}/product_catalogs?fields=id,name&limit=100&access_token=${accessToken}`
      );
      const catalogsData = await catalogsResponse.json();
      
      if (catalogsData?.data && catalogsData.data.length > 0) {
        // Delete existing catalogs for this specific account
        await supabase
          .from("meta_catalogs")
          .delete()
          .eq("user_id", user.id)
          .eq("ad_account_id", accountId);

        const catalogsToInsert = catalogsData.data.map((catalog: any) => ({
          user_id: user.id,
          ad_account_id: accountId,
          catalog_id: catalog.id,
          catalog_name: catalog.name,
          synced_at: new Date().toISOString(),
        }));

        const { error: catalogsError } = await supabase.from("meta_catalogs").insert(catalogsToInsert);
        if (!catalogsError) {
          syncResults.catalogs = catalogsToInsert.length;
          console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.catalogs} catalogs`);
        }

        // Fetch product sets for each catalog
        for (const catalog of catalogsData.data) {
          try {
            const productSetsResponse = await fetch(
              `https://graph.facebook.com/v21.0/${catalog.id}/product_sets?fields=id,name&limit=100&access_token=${accessToken}`
            );
            const productSetsData = await productSetsResponse.json();

            if (productSetsData?.data && productSetsData.data.length > 0) {
              const productSetsToInsert = productSetsData.data.map((productSet: any) => ({
                user_id: user.id,
                ad_account_id: accountId,
                catalog_id: catalog.id,
                product_set_id: productSet.id,
                product_set_name: productSet.name,
                synced_at: new Date().toISOString(),
              }));

              // Delete existing product sets for this account+catalog combo
              await supabase
                .from("meta_product_sets")
                .delete()
                .eq("user_id", user.id)
                .eq("ad_account_id", accountId)
                .eq("catalog_id", catalog.id);
              
              const { error: psError } = await supabase.from("meta_product_sets").insert(productSetsToInsert);
              if (!psError) {
                syncResults.productSets += productSetsToInsert.length;
              }
            }
          } catch (error) {
            console.error(`[SYNC-ACCOUNT-ASSETS] Error fetching product sets for catalog ${catalog.id}:`, error);
          }
        }
        console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.productSets} product sets`);
      } else {
        console.log(`[SYNC-ACCOUNT-ASSETS] No catalogs accessible by ad account ${accountId}`);
      }
    } catch (error) {
      console.error("[SYNC-ACCOUNT-ASSETS] Error fetching catalogs:", error);
    }

    console.log(`[SYNC-ACCOUNT-ASSETS] ✓ Asset sync complete for ${accountId}:`, syncResults);

    // 4. Sync performance benchmarks for this specific account
    let benchmarkResults = { synced: 0, error: null as string | null };
    try {
      console.log(`[SYNC-ACCOUNT-ASSETS] Syncing performance benchmarks for ${accountId}...`);
      benchmarkResults = await syncAccountBenchmarks(supabase, user.id, accountId, accessToken);
      console.log(`[SYNC-ACCOUNT-ASSETS] ✓ Synced ${benchmarkResults.synced} benchmarks`);
    } catch (error: any) {
      console.error("[SYNC-ACCOUNT-ASSETS] Error syncing benchmarks:", error);
      benchmarkResults.error = error.message;
    }

    return new Response(
      JSON.stringify({
        success: true,
        accountId,
        syncResults,
        benchmarksSynced: benchmarkResults.synced,
        message: `Synced ${syncResults.pixels} pixels, ${syncResults.pages} pages, ${syncResults.instagramAccounts} Instagram accounts, ${syncResults.catalogs} catalogs, ${syncResults.productSets} product sets, ${syncResults.conversionEvents} conversion events`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[SYNC-ACCOUNT-ASSETS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Sync performance benchmarks for a specific ad account
 * Fetches campaign insights from Meta API and calculates CPR by market/optimization goal
 */
async function syncAccountBenchmarks(
  supabase: any,
  userId: string,
  accountId: string,
  accessToken: string
): Promise<{ synced: number; error: string | null }> {
  // Get client industry for this account
  let industry: string | null = null;
  
  const { data: accountData } = await supabase
    .from("meta_ad_accounts")
    .select("client_id")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (accountData?.client_id) {
    const { data: clientData } = await supabase
      .from("clients")
      .select("industry")
      .eq("id", accountData.client_id)
      .maybeSingle();
    
    industry = clientData?.industry || null;
    console.log(`[BENCHMARK] Found client industry: ${industry}`);
  }

  // Generate 12 monthly date ranges (last 12 full months)
  const monthlyRanges = generateMonthlyRanges(12);
  console.log(`[BENCHMARK] Will sync ${monthlyRanges.length} monthly segments`);

  let totalStored = 0;

  for (const { start, end } of monthlyRanges) {
    console.log(`[BENCHMARK] Processing month: ${start} to ${end}`);
    
    const monthCount = await syncMetaBenchmarksForPeriod(
      supabase, userId, accountId, accessToken, industry, start, end
    );
    totalStored += monthCount;
  }

  console.log(`[BENCHMARK] ✅ Total Meta benchmarks stored: ${totalStored}`);
  return { synced: totalStored, error: null };
}

/**
 * Generate monthly date ranges for the last N full months (excluding current partial month)
 */
function generateMonthlyRanges(months: number): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  const now = new Date();
  
  for (let i = 1; i <= months; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // last day of month
    
    ranges.push({
      start: monthStart.toISOString().split("T")[0],
      end: monthEnd.toISOString().split("T")[0],
    });
  }
  
  return ranges.reverse(); // oldest first
}

/**
 * Sync Meta benchmarks for a single month period
 */
/**
 * Map campaign objective to PRIMARY result action type.
 * Spend is attributed ONLY to this goal — no double-counting across action types.
 */
const metaObjectiveToPrimary: Record<string, { actionTypes: string[]; goal: string }> = {
  "OUTCOME_TRAFFIC": { actionTypes: ["link_click", "landing_page_view"], goal: "LINK_CLICKS" },
  "OUTCOME_ENGAGEMENT": { actionTypes: ["post_engagement", "page_engagement", "post", "comment", "like"], goal: "POST_ENGAGEMENT" },
  "OUTCOME_AWARENESS": { actionTypes: ["__reach__"], goal: "REACH" },
  "OUTCOME_LEADS": { actionTypes: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped", "leadgen_grouped"], goal: "LEAD_GENERATION" },
  "OUTCOME_SALES": { actionTypes: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "complete_registration"], goal: "PURCHASE" },
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

async function syncMetaBenchmarksForPeriod(
  supabase: any,
  userId: string,
  accountId: string,
  accessToken: string,
  industry: string | null,
  dateRangeStart: string,
  dateRangeEnd: string
): Promise<number> {
  const benchmarkMap = new Map<string, {
    market: string; optimization_goal: string;
    total_spend: number; total_results: number;
    impressions: number; clicks: number;
    link_clicks: number; landing_page_views: number;
    revenue: number; campaign_count: number; industry: string | null;
  }>();

  // Fetch at CAMPAIGN level with objective so we can properly attribute spend
  const insightsUrl = `https://graph.facebook.com/v21.0/${accountId}/insights?` +
    `time_range={'since':'${dateRangeStart}','until':'${dateRangeEnd}'}` +
    `&fields=campaign_id,campaign_name,objective,spend,impressions,actions,action_values,clicks,reach` +
    `&breakdowns=country` +
    `&level=campaign` +
    `&limit=500` +
    `&access_token=${accessToken}`;

  const insightsResponse = await fetch(insightsUrl);
  if (!insightsResponse.ok) {
    const errorText = await insightsResponse.text();
    console.warn(`[BENCHMARK] Skipping ${accountId} for ${dateRangeStart} - API error: ${errorText}`);
    return 0;
  }

  const insightsData = await insightsResponse.json();
  const insights = insightsData.data || [];
  if (insights.length === 0) return 0;

  for (const insight of insights) {
    const country = insight.country || "UNKNOWN";
    const spend = parseFloat(insight.spend || "0");
    const impressions = parseFloat(insight.impressions || "0");
    const clicks = parseFloat(insight.clicks || "0");
    const reach = parseFloat(insight.reach || "0");
    const actions = insight.actions || [];
    const actionValues = insight.action_values || [];
    const objective = insight.objective || "UNKNOWN";

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

    // Determine primary optimization goal from campaign objective
    const primaryConfig = metaObjectiveToPrimary[objective];
    let optimizationGoal = primaryConfig?.goal || objective;
    let results = 0;

    if (primaryConfig) {
      if (primaryConfig.actionTypes.includes("__reach__")) {
        results = reach;
      } else {
        for (const actionType of primaryConfig.actionTypes) {
          const action = actions.find((a: any) => a.action_type === actionType);
          if (action) {
            results = parseFloat(action.value || "0");
            break;
          }
        }
      }
    }

    // Fallback to clicks if no primary results
    if (results <= 0 && clicks > 0) {
      results = clicks;
      if (!primaryConfig) optimizationGoal = "CLICK";
    }

    if (results <= 0) continue;

    // Attribute spend to PRIMARY goal only
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
    benchmark.link_clicks += linkClicks;
    benchmark.landing_page_views += landingPageViews;
    benchmark.revenue += revenue;
    benchmark.campaign_count += 1;
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

  console.log(`[BENCHMARK] Month ${dateRangeStart}: ${storedCount} benchmarks stored`);
  return storedCount;
}

/**
 * Sync Google Ads account assets (conversion actions, audiences, etc.)
 */
async function syncGoogleAdsAssets(
  supabase: any,
  user: any,
  accountId: string,
  authHeader: string
): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  try {
    // Get user's active Google platform connection
    const { data: platformData, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, access_token, refresh_token")
      .eq("user_id", user.id)
      .eq("platform_type", "google")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (platformError || !platformData) {
      console.error("[SYNC-ACCOUNT-ASSETS] Google platform lookup error:", platformError);
      throw new Error("No active Google Ads platform connection found");
    }

    // Get access token from Vault with automatic refresh for Google
    const accessToken = await getAccessTokenWithRefresh(supabase, platformData.id, platformData.access_token, "google");
    
    if (!accessToken) {
      throw new Error("Failed to retrieve Google access token");
    }

    const syncResults = {
      conversionActions: 0,
      audiences: 0,
      geoTargets: 0,
    };

    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    
    // Resolve manager account ID from DB first, then env var, then fall back to client ID
    const cleanAccountId_pre = accountId.replace("customers/", "").replace(/-/g, "");
    const { data: googleAccountData } = await supabase
      .from("google_ad_accounts")
      .select("manager_customer_id")
      .eq("customer_id", cleanAccountId_pre)
      .eq("user_id", user.id)
      .maybeSingle();
    
    const managerAccountId = (googleAccountData?.manager_customer_id || Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID") || "")?.replace(/-/g, "");
    console.log(`[SYNC-ACCOUNT-ASSETS] Resolved login-customer-id: ${managerAccountId || cleanAccountId_pre} for customer ${cleanAccountId_pre}`);
    
    if (!developerToken) {
      console.warn("[SYNC-ACCOUNT-ASSETS] Google Ads developer token not configured");
    }

    // Clean account ID (remove 'customers/' prefix if present)
    const cleanAccountId = accountId.replace("customers/", "").replace(/-/g, "");

    // 1. Sync conversion actions
    try {
      console.log(`[SYNC-ACCOUNT-ASSETS] Fetching conversion actions for Google account ${cleanAccountId}...`);
      
      const conversionQuery = `
        SELECT 
          conversion_action.id,
          conversion_action.name,
          conversion_action.type,
          conversion_action.status,
          conversion_action.category
        FROM conversion_action
        WHERE conversion_action.status = 'ENABLED'
      `;

      const conversionResponse = await fetch(
        `https://googleads.googleapis.com/v23/customers/${cleanAccountId}/googleAds:searchStream`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "developer-token": developerToken || "",
            "login-customer-id": managerAccountId || cleanAccountId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: conversionQuery }),
        }
      );

      if (conversionResponse.ok) {
        const conversionData = await conversionResponse.json();
        const conversions: any[] = [];
        
        if (Array.isArray(conversionData)) {
          for (const chunk of conversionData) {
            if (chunk.results) {
              conversions.push(...chunk.results);
            }
          }
        }

        if (conversions.length > 0) {
          // Delete existing conversion actions for this account
          await supabase
            .from("google_conversion_actions")
            .delete()
            .eq("user_id", user.id)
            .eq("customer_id", cleanAccountId);

          const conversionsToInsert = conversions.map((conv: any) => ({
            user_id: user.id,
            customer_id: cleanAccountId,
            conversion_action_id: conv.conversionAction?.id || "",
            conversion_action_name: conv.conversionAction?.name || "",
            conversion_type: conv.conversionAction?.type || "",
            category: conv.conversionAction?.category || "",
            status: conv.conversionAction?.status || "",
            synced_at: new Date().toISOString(),
          }));

          const { error: insertError } = await supabase
            .from("google_conversion_actions")
            .insert(conversionsToInsert);

          if (!insertError) {
            syncResults.conversionActions = conversionsToInsert.length;
            console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.conversionActions} Google conversion actions`);
          } else {
            console.error("[SYNC-ACCOUNT-ASSETS] Error inserting conversion actions:", insertError);
          }
        }
      } else {
        const errorText = await conversionResponse.text();
        console.error("[SYNC-ACCOUNT-ASSETS] Error fetching conversion actions:", errorText);
      }
    } catch (error) {
      console.error("[SYNC-ACCOUNT-ASSETS] Error syncing conversion actions:", error);
    }

    // 2. Sync user lists/audiences
    try {
      console.log(`[SYNC-ACCOUNT-ASSETS] Fetching audiences for Google account ${cleanAccountId}...`);
      
      const audienceQuery = `
        SELECT 
          user_list.id,
          user_list.name,
          user_list.type,
          user_list.size_for_display,
          user_list.size_for_search
        FROM user_list
        WHERE user_list.membership_status = 'OPEN'
      `;

      const audienceResponse = await fetch(
        `https://googleads.googleapis.com/v23/customers/${cleanAccountId}/googleAds:searchStream`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "developer-token": developerToken || "",
            "login-customer-id": managerAccountId || cleanAccountId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: audienceQuery }),
        }
      );

      if (audienceResponse.ok) {
        const audienceData = await audienceResponse.json();
        const audiences: any[] = [];
        
        if (Array.isArray(audienceData)) {
          for (const chunk of audienceData) {
            if (chunk.results) {
              audiences.push(...chunk.results);
            }
          }
        }

        if (audiences.length > 0) {
          syncResults.audiences = audiences.length;
          console.log(`[SYNC-ACCOUNT-ASSETS] Found ${syncResults.audiences} Google audiences (storage skipped - table not yet created)`);
        }
      } else {
        const errorText = await audienceResponse.text();
        console.error("[SYNC-ACCOUNT-ASSETS] Error fetching audiences:", errorText);
      }
    } catch (error) {
      console.error("[SYNC-ACCOUNT-ASSETS] Error syncing audiences:", error);
    }

    console.log(`[SYNC-ACCOUNT-ASSETS] ✓ Google Ads asset sync complete for ${cleanAccountId}:`, syncResults);

    // 3. Sync Google Ads benchmarks (performance data)
    try {
      console.log(`[SYNC-ACCOUNT-ASSETS] Syncing Google Ads benchmarks for ${cleanAccountId}...`);
      const benchmarkResult = await syncGoogleAdsBenchmarks(supabase, user.id, cleanAccountId, accessToken, developerToken || "", managerAccountId || cleanAccountId);
      console.log(`[SYNC-ACCOUNT-ASSETS] ✓ Google Ads benchmarks synced: ${benchmarkResult.synced} benchmarks`);
    } catch (benchmarkError) {
      console.error("[SYNC-ACCOUNT-ASSETS] Google Ads benchmark sync error (non-fatal):", benchmarkError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        accountId: cleanAccountId,
        platform: "google",
        syncResults,
        message: `Synced ${syncResults.conversionActions} conversion actions, ${syncResults.audiences} audiences`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[SYNC-ACCOUNT-ASSETS] Google sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Sync Google Ads performance benchmarks
 * Fetches campaign performance data and calculates CPR by market/optimization goal
 */
async function syncGoogleAdsBenchmarks(
  supabase: any,
  userId: string,
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ synced: number }> {
  // Get client industry
  let industry: string | null = null;
  const { data: accountData } = await supabase
    .from("google_ad_accounts")
    .select("client_id")
    .eq("customer_id", customerId)
    .eq("user_id", userId)
    .maybeSingle();

  if (accountData?.client_id) {
    const { data: clientData } = await supabase
      .from("clients")
      .select("industry")
      .eq("id", accountData.client_id)
      .maybeSingle();
    industry = clientData?.industry || null;
    console.log(`[GOOGLE-BENCHMARK] Found client industry: ${industry}`);
  }

  const cleanCustomerId = customerId.replace(/-/g, "");
  const cleanLoginCustomerId = loginCustomerId.replace(/-/g, "");

  // Generate 12 monthly date ranges
  const monthlyRanges = generateMonthlyRanges(12);
  console.log(`[GOOGLE-BENCHMARK] Will sync ${monthlyRanges.length} monthly segments`);

  let totalStored = 0;

  for (const { start, end } of monthlyRanges) {
    console.log(`[GOOGLE-BENCHMARK] Processing month: ${start} to ${end}`);
    const monthCount = await syncGoogleBenchmarksForPeriod(
      supabase, userId, cleanCustomerId, accessToken, developerToken,
      cleanLoginCustomerId, industry, start, end
    );
    totalStored += monthCount;
  }

  console.log(`[GOOGLE-BENCHMARK] ✅ Total stored: ${totalStored} benchmarks`);
  return { synced: totalStored };
}

async function syncGoogleBenchmarksForPeriod(
  supabase: any,
  userId: string,
  cleanCustomerId: string,
  accessToken: string,
  developerToken: string,
  cleanLoginCustomerId: string,
  industry: string | null,
  dateRangeStart: string,
  dateRangeEnd: string
): Promise<number> {
  // Use campaign-level query to get video_views alongside other metrics
  // geographic_view doesn't support video_views, so we use campaign with geo segments
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      segments.geo_target_country,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value,
      metrics.video_views
    FROM campaign
    WHERE segments.date BETWEEN '${dateRangeStart}' AND '${dateRangeEnd}'
      AND metrics.cost_micros > 0
  `;

  let allResults: any[] = [];
  let nextPageToken: string | undefined;

  do {
    const requestBody: any = { query };
    if (nextPageToken) requestBody.pageToken = nextPageToken;

    const response = await fetch(
      `https://googleads.googleapis.com/v23/customers/${cleanCustomerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "login-customer-id": cleanLoginCustomerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GOOGLE-BENCHMARK] Error for ${dateRangeStart}: ${errorText}`);
      return 0;
    }

    const responseData = await response.json();
    const results = responseData.results || [];
    allResults.push(...results);
    nextPageToken = responseData.nextPageToken;
  } while (nextPageToken);

  if (allResults.length === 0) return 0;

  const geoIdToCountry: Record<string, string> = {
    "2784": "AE", "2682": "SA", "2414": "KW", "2634": "QA",
    "2512": "OM", "2048": "BH", "2840": "US", "2826": "GB",
    "2276": "DE", "2250": "FR", "2380": "IT", "2724": "ES",
    "2356": "IN", "2036": "AU", "2124": "CA", "2392": "JP",
    "2076": "BR", "2484": "MX", "2566": "NG", "2710": "ZA",
    "2818": "EG", "2792": "TR", "2586": "PK", "2360": "ID",
    "2458": "MY", "2702": "SG", "2764": "TH", "2704": "VN",
    "2608": "PH", "2410": "KR", "2158": "TW", "2344": "HK",
    "2400": "JO", "2422": "LB", "2368": "IQ",
  };

  const channelTypeGoalMap: Record<string, string> = {
    "SEARCH": "SEARCH_CLICKS",
    "DISPLAY": "DISPLAY_IMPRESSIONS",
    "VIDEO": "VIDEO_VIEWS",
    "SHOPPING": "SHOPPING_CONVERSIONS",
    "PERFORMANCE_MAX": "PMAX_CONVERSIONS",
    "DEMAND_GEN": "DEMAND_GEN_CLICKS",
  };

  const benchmarkMap = new Map<string, {
    market: string; optimization_goal: string;
    total_spend: number; total_results: number; impressions: number;
    clicks: number; link_clicks: number; landing_page_views: number;
    revenue: number; campaign_count: number; industry: string | null;
  }>();

  for (const row of allResults) {
    // New query uses segments.geo_target_country (returns country name like "US")
    const geoTarget = row.segments?.geoTargetCountry || "";
    // Extract country code from geo target resource name: "geoTargetConstants/XXXX"
    const geoId = String(geoTarget).replace("geoTargetConstants/", "");
    const country = geoIdToCountry[geoId] || geoId || "UNKNOWN";
    const costMicros = parseInt(row.metrics?.costMicros || "0");
    const spend = costMicros / 1_000_000;
    const impressions = parseInt(row.metrics?.impressions || "0");
    const clicks = parseInt(row.metrics?.clicks || "0");
    const conversions = parseFloat(row.metrics?.conversions || "0");
    const videoViews = parseInt(row.metrics?.videoViews || "0");
    const revenue = Number(row.metrics?.conversionsValue || row.metrics?.allConversionsValue || 0);
    const channelType = row.campaign?.advertisingChannelType || "UNKNOWN";

    const optimizationGoal = channelTypeGoalMap[channelType] || channelType;

    // Use the correct result metric per channel type
    let results = 0;
    if (channelType === "SEARCH" || channelType === "DEMAND_GEN") {
      results = clicks;
    } else if (channelType === "VIDEO") {
      results = videoViews > 0 ? videoViews : clicks;
    } else if (channelType === "SHOPPING" || channelType === "PERFORMANCE_MAX") {
      results = conversions > 0 ? conversions : clicks;
    } else if (channelType === "DISPLAY") {
      results = clicks > 0 ? clicks : impressions / 1000;
    } else {
      results = clicks > 0 ? clicks : impressions / 1000;
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

    // Generic CLICK benchmark
    if (clicks > 0) {
      const clickKey = `${country}_CLICK`;
      if (!benchmarkMap.has(clickKey)) {
        benchmarkMap.set(clickKey, {
          market: country, optimization_goal: "CLICK",
          total_spend: 0, total_results: 0, impressions: 0, clicks: 0,
          link_clicks: 0, landing_page_views: 0, revenue: 0, campaign_count: 0, industry,
        });
      }
      const clickBm = benchmarkMap.get(clickKey)!;
      clickBm.total_spend += spend;
      clickBm.total_results += clicks;
      clickBm.impressions += impressions;
      clickBm.clicks += clicks;
      clickBm.revenue += revenue;
      clickBm.campaign_count += 1;
    }

    // Generic CONVERSION benchmark
    if (conversions > 0) {
      const convKey = `${country}_CONVERSION`;
      if (!benchmarkMap.has(convKey)) {
        benchmarkMap.set(convKey, {
          market: country, optimization_goal: "CONVERSION",
          total_spend: 0, total_results: 0, impressions: 0, clicks: 0,
          link_clicks: 0, landing_page_views: 0, revenue: 0, campaign_count: 0, industry,
        });
      }
      const convBm = benchmarkMap.get(convKey)!;
      convBm.total_spend += spend;
      convBm.total_results += conversions;
      convBm.impressions += impressions;
      convBm.clicks += clicks;
      convBm.revenue += revenue;
      convBm.campaign_count += 1;
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
        platform: 'google',
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
      console.error(`[GOOGLE-BENCHMARK] Error storing ${key}:`, error);
    } else {
      storedCount++;
    }
  }

  console.log(`[GOOGLE-BENCHMARK] Month ${dateRangeStart}: ${storedCount} benchmarks stored`);
  return storedCount;
}
