import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

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

    if (platform !== "meta") {
      throw new Error("Only Meta account asset sync is currently supported");
    }

    console.log(`[SYNC-ACCOUNT-ASSETS] Starting asset sync for Meta account ${accountId}, user ${user.id}`);

    // Get user's active Meta platform connection
    const { data: platformData, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (platformError || !platformData) {
      console.error("[SYNC-ACCOUNT-ASSETS] Platform lookup error:", platformError);
      throw new Error("No active Meta platform connection found");
    }

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
        assignedPagesData.data.forEach((page: any) => {
          if (page.instagram_business_account) {
            instagramToInsert.push({
              user_id: user.id,
              ad_account_id: accountId,
              instagram_account_id: page.instagram_business_account.id,
              username: page.instagram_business_account.username || page.name,
              synced_at: new Date().toISOString(),
            });
          }
        });

        if (instagramToInsert.length > 0) {
          const { error: igError } = await supabase.from("meta_instagram_accounts").insert(instagramToInsert);
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
        syncResults: {
          ...syncResults,
          benchmarks: benchmarkResults.synced,
        },
        message: `Synced ${syncResults.pixels} pixels, ${syncResults.pages} pages, ${syncResults.instagramAccounts} Instagram accounts, ${syncResults.catalogs} catalogs, ${syncResults.productSets} product sets, ${syncResults.conversionEvents} conversion events, ${benchmarkResults.synced} benchmarks`,
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
  // Calculate date range (last 3 months)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);

  const dateRangeStart = startDate.toISOString().split("T")[0];
  const dateRangeEnd = endDate.toISOString().split("T")[0];

  console.log(`[BENCHMARK] Date range: ${dateRangeStart} to ${dateRangeEnd}`);

  // Get client industry for this account
  const { data: accountData } = await supabase
    .from("meta_ad_accounts")
    .select("client_id, clients(industry)")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  const industry = (accountData?.clients as any)?.industry || null;

  // Fetch campaign insights with country breakdown
  const benchmarkMap = new Map<string, {
    market: string;
    optimization_goal: string;
    total_spend: number;
    total_results: number;
    impressions: number;
    campaign_count: number;
    industry: string | null;
  }>();

  // Fetch insights at ad account level with country breakdown
  const insightsUrl = `https://graph.facebook.com/v21.0/${accountId}/insights?` +
    `time_range={'since':'${dateRangeStart}','until':'${dateRangeEnd}'}` +
    `&fields=spend,impressions,actions,clicks,reach` +
    `&breakdowns=country` +
    `&level=account` +
    `&limit=500` +
    `&access_token=${accessToken}`;

  console.log(`[BENCHMARK] Fetching account-level insights...`);
  
  const insightsResponse = await fetch(insightsUrl);
  if (!insightsResponse.ok) {
    const errorText = await insightsResponse.text();
    console.error(`[BENCHMARK] Error fetching insights: ${errorText}`);
    throw new Error(`Failed to fetch insights: ${errorText}`);
  }

  const insightsData = await insightsResponse.json();
  const insights = insightsData.data || [];

  console.log(`[BENCHMARK] Retrieved ${insights.length} insight rows`);

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
    "onsite_conversion.post_save": "POST_ENGAGEMENT",
    "comment": "POST_ENGAGEMENT",
    "like": "POST_ENGAGEMENT",
    "post": "POST_ENGAGEMENT",
    "photo_view": "POST_ENGAGEMENT",
    "complete_registration": "COMPLETE_REGISTRATION",
    "lead": "LEAD_GENERATION",
    "purchase": "PURCHASE",
  };

  for (const insight of insights) {
    const country = insight.country || "UNKNOWN";
    const spend = parseFloat(insight.spend || "0");
    const impressions = parseFloat(insight.impressions || "0");
    const clicks = parseFloat(insight.clicks || "0");
    const reach = parseFloat(insight.reach || "0");

    // Process actions
    const actions = insight.actions || [];
    
    for (const action of actions) {
      const optimizationGoal = actionTypeMap[action.action_type];
      if (!optimizationGoal) continue; // Skip unmapped action types
      
      const results = parseFloat(action.value || "0");
      if (results <= 0) continue;

      const key = `${country}_${optimizationGoal}`;
      
      if (!benchmarkMap.has(key)) {
        benchmarkMap.set(key, {
          market: country,
          optimization_goal: optimizationGoal,
          total_spend: 0,
          total_results: 0,
          impressions: 0,
          campaign_count: 1, // Account-level aggregation
          industry: industry,
        });
      }

      const benchmark = benchmarkMap.get(key)!;
      benchmark.total_spend = spend; // Use full spend for this country
      benchmark.total_results += results;
      benchmark.impressions = impressions;
    }

    // Also add REACH and IMPRESSIONS benchmarks
    if (reach > 0) {
      const reachKey = `${country}_REACH`;
      if (!benchmarkMap.has(reachKey)) {
        benchmarkMap.set(reachKey, {
          market: country,
          optimization_goal: "REACH",
          total_spend: spend,
          total_results: reach,
          impressions: impressions,
          campaign_count: 1,
          industry: industry,
        });
      }
    }

    // ThruPlay (video views >=15s or completed if shorter)
    const thruplayAction = actions.find((a: any) => a.action_type === "video_view" || a.action_type === "thruplay");
    if (thruplayAction) {
      const thruplayKey = `${country}_THRUPLAY`;
      if (!benchmarkMap.has(thruplayKey)) {
        benchmarkMap.set(thruplayKey, {
          market: country,
          optimization_goal: "THRUPLAY",
          total_spend: spend,
          total_results: parseFloat(thruplayAction.value || "0"),
          impressions: impressions,
          campaign_count: 1,
          industry: industry,
        });
      }
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
        user_id: userId,
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
      console.error(`[BENCHMARK] Error storing ${key}:`, error);
    } else {
      console.log(`[BENCHMARK] ✓ ${benchmark.market}/${benchmark.optimization_goal}: CPR $${avgCostPerResult?.toFixed(2) || 'N/A'} (${benchmark.total_results.toFixed(0)} results)`);
      storedCount++;
    }
  }

  return { synced: storedCount, error: null };
}
