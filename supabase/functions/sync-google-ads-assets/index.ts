import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getGooglePlatformCandidatesForCustomer } from "../_shared/platform-connection-resolver.ts";
import { getAccessTokenWithRefresh } from "../_shared/vault-helper.ts";

/**
 * SYNC-GOOGLE-ADS-ASSETS
 *
 * Fetches and caches assets (images, videos, YouTube videos) from Google Ads
 * asset library. Supports PMax asset groups, Demand Gen, and standard campaigns.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_ADS_API_VERSION = "v23";

const GEO_ID_TO_COUNTRY: Record<string, string> = {
  "2784": "AE",
  "2682": "SA",
  "2414": "KW",
  "2634": "QA",
  "2512": "OM",
  "2048": "BH",
  "2840": "US",
  "2826": "GB",
  "2276": "DE",
  "2250": "FR",
  "2380": "IT",
  "2724": "ES",
  "2356": "IN",
  "2036": "AU",
  "2124": "CA",
  "2392": "JP",
  "2076": "BR",
  "2484": "MX",
  "2566": "NG",
  "2710": "ZA",
  "2818": "EG",
  "2792": "TR",
  "2586": "PK",
  "2360": "ID",
  "2458": "MY",
  "2702": "SG",
  "2764": "TH",
  "2704": "VN",
  "2608": "PH",
  "2410": "KR",
  "2158": "TW",
  "2344": "HK",
  "2400": "JO",
  "2422": "LB",
  "2368": "IQ",
};

const CHANNEL_TYPE_GOAL_MAP: Record<string, string> = {
  SEARCH: "SEARCH_CLICKS",
  DISPLAY: "DISPLAY_IMPRESSIONS",
  VIDEO: "VIDEO_VIEWS",
  SHOPPING: "SHOPPING_CONVERSIONS",
  PERFORMANCE_MAX: "PMAX_CONVERSIONS",
  DEMAND_GEN: "DEMAND_GEN_CLICKS",
};

interface SyncRequest {
  customerId: string;
  assetTypes?: ("IMAGE" | "YOUTUBE_VIDEO" | "MEDIA_BUNDLE")[];
}

interface BenchmarkAccumulator {
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

serve(async (req: Request) => {
  console.log("🔄 sync-google-ads-assets: Request received");

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
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);
    if (userError || !user) throw new Error("Unauthorized");

    const body: SyncRequest = await req.json();
    const { customerId, assetTypes = ["IMAGE", "YOUTUBE_VIDEO"] } = body;

    if (!customerId) throw new Error("customerId is required");

    console.log(`Syncing Google Ads assets for customer ${customerId}`);

    const platformCandidates = await getGooglePlatformCandidatesForCustomer(
      supabase,
      user.id,
      customerId,
    );
    const platform = platformCandidates[0];

    if (!platform) {
      throw new Error(`Google Ads platform not connected for customer ${customerId}`);
    }

    console.log(`Using Google platform ${platform.id} for customer ${customerId}`);

    const accessToken = await getAccessTokenWithRefresh(supabase, platform.id, platform.access_token, "google");
    if (!accessToken) throw new Error("Google Ads access token not found or refresh failed");

    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN not set");

    const cleanCustomerId = customerId.replace(/-/g, "");

    const { data: googleAccount } = await supabase
      .from("google_ad_accounts")
      .select("manager_customer_id")
      .eq("customer_id", cleanCustomerId)
      .eq("user_id", user.id)
      .maybeSingle();

    const loginCustomerId = (googleAccount?.manager_customer_id || Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID") || cleanCustomerId)
      .replace(/-/g, "");

    const assetTypeFilter = assetTypes.map((type) => `'${type}'`).join(", ");
    const assetQuery = `
      SELECT
        asset.id,
        asset.name,
        asset.type,
        asset.resource_name,
        asset.image_asset.file_size,
        asset.image_asset.full_size.width_pixels,
        asset.image_asset.full_size.height_pixels,
        asset.image_asset.full_size.url,
        asset.youtube_video_asset.youtube_video_id,
        asset.youtube_video_asset.youtube_video_title
      FROM asset
      WHERE asset.type IN (${assetTypeFilter})
      ORDER BY asset.id DESC
      LIMIT 500
    `;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "login-customer-id": loginCustomerId,
      "Content-Type": "application/json",
    };

    console.log(`Using login-customer-id: ${headers["login-customer-id"]} for customer ${cleanCustomerId}`);

    const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;
    const response = await fetch(searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: assetQuery }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Ads asset fetch failed:", errorText);
      throw new Error(`Google Ads API error: ${response.status}`);
    }

    const responseData = await response.json();
    const results = responseData?.[0]?.results || [];
    console.log(`Fetched ${results.length} assets from Google Ads`);

    let synced = 0;
    let errors = 0;

    const { data: teamData } = await supabase
      .from("user_roles")
      .select("team_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    for (const row of results) {
      const asset = row.asset;
      try {
        const assetType = asset.type === "IMAGE" ? "image" : "video";
        const width = asset.imageAsset?.fullSize?.widthPixels || null;
        const height = asset.imageAsset?.fullSize?.heightPixels || null;
        const previewUrl = asset.imageAsset?.fullSize?.url || null;
        const fileSize = asset.imageAsset?.fileSize || null;
        const youtubeId = asset.youtubeVideoAsset?.youtubeVideoId || null;
        const youtubeThumbnail = youtubeId
          ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
          : null;

        const assetRecord = {
          platform: "google",
          platform_asset_id: String(asset.id),
          advertiser_id: cleanCustomerId,
          asset_type: assetType,
          asset_name: asset.name || youtubeId || `Asset ${asset.id}`,
          preview_url: previewUrl || youtubeThumbnail,
          thumbnail_url: previewUrl || youtubeThumbnail,
          width,
          height,
          file_size_bytes: fileSize,
          is_usable: true,
          user_id: user.id,
          team_id: teamData?.team_id || null,
          synced_at: new Date().toISOString(),
          platform_metadata: {
            resource_name: asset.resourceName,
            youtube_video_id: youtubeId,
            youtube_title: asset.youtubeVideoAsset?.youtubeVideoTitle,
          },
        };

        const { error: upsertError } = await supabase
          .from("creative_library_assets")
          .upsert(assetRecord, {
            onConflict: "platform,platform_asset_id,advertiser_id",
          });

        if (upsertError) {
          console.error(`Failed to upsert asset ${asset.id}:`, upsertError.message);
          errors++;
        } else {
          synced++;
        }
      } catch (e) {
        console.error("Error processing asset:", e);
        errors++;
      }
    }

    let benchmarksSynced = 0;
    try {
      console.log(`[SYNC-GOOGLE-ADS-ASSETS] Syncing benchmarks for customer ${cleanCustomerId}...`);
      const benchmarkResult = await syncGoogleAdsBenchmarks(
        supabase,
        user.id,
        cleanCustomerId,
        accessToken,
        developerToken,
        loginCustomerId,
      );
      benchmarksSynced = benchmarkResult.synced;
      console.log(`[SYNC-GOOGLE-ADS-ASSETS] Benchmarks synced: ${benchmarksSynced}`);
    } catch (benchmarkError) {
      console.error("[SYNC-GOOGLE-ADS-ASSETS] Benchmark sync error:", benchmarkError);
    }

    console.log(`✅ Sync complete: ${synced} synced, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        errors,
        total: results.length,
        benchmarksSynced,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("sync-google-ads-assets error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function syncGoogleAdsBenchmarks(
  supabase: any,
  userId: string,
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
): Promise<{ synced: number }> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);

  const dateRangeStart = startDate.toISOString().split("T")[0];
  const dateRangeEnd = endDate.toISOString().split("T")[0];

  console.log(`[GOOGLE-BENCHMARK] Date range: ${dateRangeStart} to ${dateRangeEnd}`);

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
  } else {
    console.log(`[GOOGLE-BENCHMARK] No client linked to account ${customerId}, industry will be null`);
  }

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      geographic_view.country_criterion_id,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value
    FROM geographic_view
    WHERE segments.date BETWEEN '${dateRangeStart}' AND '${dateRangeEnd}'
      AND metrics.cost_micros > 0
  `;

  console.log(`[GOOGLE-BENCHMARK] Fetching performance data for customer ${customerId} (login: ${loginCustomerId})...`);

  const allResults: any[] = [];
  let nextPageToken: string | undefined;

  do {
    const requestBody: Record<string, unknown> = { query };
    if (nextPageToken) {
      requestBody.pageToken = nextPageToken;
    }

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "login-customer-id": loginCustomerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GOOGLE-BENCHMARK] Error fetching performance data: ${errorText}`);
      return { synced: 0 };
    }

    const responseData = await response.json();
    const pageResults = responseData.results || [];
    allResults.push(...pageResults);
    nextPageToken = responseData.nextPageToken;
    console.log(`[GOOGLE-BENCHMARK] Fetched ${pageResults.length} rows (total: ${allResults.length})`);
  } while (nextPageToken);

  if (allResults.length === 0) {
    console.log(`[GOOGLE-BENCHMARK] No performance data found for customer ${customerId}`);
    return { synced: 0 };
  }

  const benchmarkMap = new Map<string, BenchmarkAccumulator>();

  for (const row of allResults) {
    const geoId = String(row.geographicView?.countryCriterionId || "");
    const market = GEO_ID_TO_COUNTRY[geoId] || (geoId ? `GEO_${geoId}` : "UNKNOWN");
    const costMicros = Number(row.metrics?.costMicros || 0);
    const spend = costMicros / 1_000_000;
    const impressions = Number(row.metrics?.impressions || 0);
    const clicks = Number(row.metrics?.clicks || 0);
    const conversions = Number(row.metrics?.conversions || 0);
    const revenue = Number(row.metrics?.conversionsValue || row.metrics?.allConversionsValue || 0);
    const channelType = row.campaign?.advertisingChannelType || "UNKNOWN";
    const optimizationGoal = CHANNEL_TYPE_GOAL_MAP[channelType] || channelType;

    let results = 0;
    if (channelType === "SEARCH" || channelType === "DEMAND_GEN") {
      results = clicks;
    } else if (channelType === "VIDEO") {
      results = clicks;
    } else if (channelType === "SHOPPING" || channelType === "PERFORMANCE_MAX") {
      results = conversions > 0 ? conversions : clicks;
    } else if (channelType === "DISPLAY") {
      results = clicks > 0 ? clicks : impressions / 1000;
    } else {
      results = clicks > 0 ? clicks : impressions / 1000;
    }

    const key = `${market}_${optimizationGoal}`;
    if (!benchmarkMap.has(key)) {
      benchmarkMap.set(key, {
        market,
        optimization_goal: optimizationGoal,
        total_spend: 0,
        total_results: 0,
        impressions: 0,
        clicks: 0,
        link_clicks: 0,
        landing_page_views: 0,
        revenue: 0,
        campaign_count: 0,
        industry,
      });
    }

    const benchmark = benchmarkMap.get(key)!;
    benchmark.total_spend += spend;
    benchmark.total_results += results;
    benchmark.impressions += impressions;
    benchmark.clicks += clicks;
    benchmark.revenue += revenue;
    benchmark.campaign_count += 1;

    if (clicks > 0) {
      const clickKey = `${market}_CLICK`;
      if (!benchmarkMap.has(clickKey)) {
        benchmarkMap.set(clickKey, {
          market,
          optimization_goal: "CLICK",
          total_spend: 0,
          total_results: 0,
          impressions: 0,
          clicks: 0,
          link_clicks: 0,
          landing_page_views: 0,
          revenue: 0,
          campaign_count: 0,
          industry,
        });
      }
      const clickBenchmark = benchmarkMap.get(clickKey)!;
      clickBenchmark.total_spend += spend;
      clickBenchmark.total_results += clicks;
      clickBenchmark.impressions += impressions;
      clickBenchmark.clicks += clicks;
      clickBenchmark.revenue += revenue;
      clickBenchmark.campaign_count += 1;
    }

    if (conversions > 0) {
      const conversionKey = `${market}_CONVERSION`;
      if (!benchmarkMap.has(conversionKey)) {
        benchmarkMap.set(conversionKey, {
          market,
          optimization_goal: "CONVERSION",
          total_spend: 0,
          total_results: 0,
          impressions: 0,
          clicks: 0,
          link_clicks: 0,
          landing_page_views: 0,
          revenue: 0,
          campaign_count: 0,
          industry,
        });
      }
      const conversionBenchmark = benchmarkMap.get(conversionKey)!;
      conversionBenchmark.total_spend += spend;
      conversionBenchmark.total_results += conversions;
      conversionBenchmark.impressions += impressions;
      conversionBenchmark.clicks += clicks;
      conversionBenchmark.revenue += revenue;
      conversionBenchmark.campaign_count += 1;
    }
  }

  console.log(`[GOOGLE-BENCHMARK] Calculated ${benchmarkMap.size} unique benchmarks`);

  let storedCount = 0;
  for (const [key, benchmark] of benchmarkMap.entries()) {
    const avgCostPerResult = benchmark.total_results > 0
      ? benchmark.total_spend / benchmark.total_results
      : null;

    const { error } = await supabase
      .from("campaign_performance_benchmarks")
      .upsert(
        {
          user_id: userId,
          platform: "google",
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
        },
        {
          onConflict: "user_id,platform,market,optimization_goal,industry,date_range_start,date_range_end",
        },
      );

    if (error) {
      console.error(`[GOOGLE-BENCHMARK] Error storing ${key}:`, error);
      continue;
    }

    storedCount++;
    console.log(
      `[GOOGLE-BENCHMARK] ✓ ${benchmark.market}/${benchmark.optimization_goal}: CPR $${avgCostPerResult?.toFixed(2) || "N/A"}`,
    );
  }

  console.log(`[GOOGLE-BENCHMARK] ✅ Stored ${storedCount} benchmarks`);
  return { synced: storedCount };
}
