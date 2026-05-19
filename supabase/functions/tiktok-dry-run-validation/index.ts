import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ====================================================================
// TIKTOK DRY-RUN VALIDATION
// Tests objective × optimization-goal × bid-strategy × budget-type
// × placement × targeting combinations by creating DISABLED entities
// then immediately deleting them. TikTok has no `validation_only` flag.
// ====================================================================

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";

// ----- TikTok Objective × Optimization Goal matrix -----
interface OptGoal {
  value: string;
  label: string;
  billingEvent: string;
  promotionType?: string;
  requiresPixel?: boolean;
}

interface ObjEntry {
  objective: string;
  label: string;
  goals: OptGoal[];
}

const OBJECTIVES: ObjEntry[] = [
  {
    objective: "REACH",
    label: "Reach / Awareness",
    goals: [
      { value: "REACH", label: "Reach", billingEvent: "CPM" },
    ],
  },
  {
    objective: "TRAFFIC",
    label: "Traffic",
    goals: [
      { value: "CLICK", label: "Clicks", billingEvent: "CPC", promotionType: "WEBSITE" },
      { value: "LANDING_PAGE_VIEW", label: "Landing Page Views", billingEvent: "OCPM", promotionType: "WEBSITE" },
    ],
  },
  {
    objective: "VIDEO_VIEWS",
    label: "Video Views",
    goals: [
      { value: "VIDEO_VIEW", label: "Video View (2s)", billingEvent: "OCPM" },
      { value: "FOCUSED_VIEW", label: "Focused View (6s+)", billingEvent: "OCPM" },
      { value: "6S_VIDEO_VIEW", label: "6s Video View", billingEvent: "OCPM" },
    ],
  },
  {
    objective: "LEAD_GENERATION",
    label: "Lead Generation",
    goals: [
      { value: "CLICK", label: "Clicks", billingEvent: "CPC", promotionType: "WEBSITE" },
      { value: "CONVERT", label: "Conversions", billingEvent: "OCPM", promotionType: "WEBSITE", requiresPixel: true },
    ],
  },
  {
    objective: "CONVERSIONS",
    label: "Conversions / Sales",
    goals: [
      { value: "CONVERT", label: "Conversions", billingEvent: "OCPM", promotionType: "WEBSITE", requiresPixel: true },
      { value: "VALUE", label: "Value (ROAS)", billingEvent: "OCPM", promotionType: "WEBSITE", requiresPixel: true },
      { value: "CLICK", label: "Clicks", billingEvent: "CPC", promotionType: "WEBSITE" },
    ],
  },
  {
    objective: "COMMUNITY_INTERACTION",
    label: "Community Interaction",
    goals: [
      { value: "FOLLOW", label: "Followers", billingEvent: "OCPM" },
      { value: "PROFILE_VISIT", label: "Profile Visits", billingEvent: "OCPM" },
    ],
  },
];

const BID_STRATEGIES = [
  { value: "BID_TYPE_NO_BID", label: "Lowest Cost (Auto)" },
  { value: "BID_TYPE_CUSTOM", label: "Cost Cap (Manual)" },
];

const BUDGET_TYPES = ["daily", "lifetime"] as const;

const PLACEMENT_CONFIGS = [
  { name: "Automatic", placementType: "PLACEMENT_TYPE_AUTOMATIC", placements: ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"] },
  { name: "Manual: TikTok only", placementType: "PLACEMENT_TYPE_NORMAL", placements: ["PLACEMENT_TIKTOK"] },
  { name: "Manual: TikTok + Pangle", placementType: "PLACEMENT_TYPE_NORMAL", placements: ["PLACEMENT_TIKTOK", "PLACEMENT_PANGLE"] },
];

const TARGETING_CONFIGS = [
  { name: "Broad (18-55+, all genders)", ageGroups: ["AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"], gender: "GENDER_UNLIMITED" },
  { name: "Male 25-44", ageGroups: ["AGE_25_34", "AGE_35_44"], gender: "GENDER_MALE" },
  { name: "Female 18-34", ageGroups: ["AGE_18_24", "AGE_25_34"], gender: "GENDER_FEMALE" },
];

const CONVERSION_EVENTS = ["ON_WEB_ORDER", "ON_WEB_CART", "ON_WEB_ADD_TO_WISHLIST", "ON_WEB_REGISTER", "ON_WEB_DETAIL"];

// Country code → GeoName location ID (same as platform-adapter)
const COUNTRY_LOCATION_MAP: Record<string, number> = {
  "GB": 2635167, "DE": 2921044, "FR": 3017382, "IT": 3175395, "ES": 2510769,
  "NL": 2750405, "BE": 2802361, "CH": 2658434, "AT": 2782113, "SE": 2661886,
  "AU": 2077456, "JP": 1861060, "KR": 1835841, "ID": 1643084, "TH": 1605651,
  "VN": 1562822, "PH": 1694008, "MY": 1733045, "SG": 1880251, "AE": 290557,
  "SA": 102358, "EG": 357994, "TR": 298795,
};

interface TestResult {
  testId: string;
  dimension: string;
  objective: string;
  objectiveLabel: string;
  optimizationGoal: string;
  optimizationGoalLabel: string;
  bidStrategy: string;
  budgetType: string;
  placementConfig: string;
  targetingConfig: string;
  conversionEvent: string | null;
  campaignValidation: { success: boolean; error: any | null };
  adGroupValidation: { success: boolean; error: any | null };
}

function buildDates() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 13);
  const fmt = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd} 00:00:00`;
  };
  return { start: fmt(start), end: fmt(end), days: 14 };
}

async function createCampaign(
  accessToken: string,
  advertiserId: string,
  objective: string,
  budgetMode: string,
  budget: number,
): Promise<{ success: boolean; campaignId?: string; error?: any }> {
  const body: any = {
    advertiser_id: advertiserId,
    campaign_name: `DRYRUN_${objective}_${Date.now()}`,
    objective_type: objective,
    budget_mode: budgetMode === "daily" ? "BUDGET_MODE_DAY" : "BUDGET_MODE_TOTAL",
    budget: Math.round(budget * 100) / 100,
    operation_status: "DISABLE",
  };

  const resp = await fetch(`${TIKTOK_API}/campaign/create/`, {
    method: "POST",
    headers: { "Access-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.code !== 0) {
    return { success: false, error: { code: data.code, message: data.message, request_id: data.request_id } };
  }
  return { success: true, campaignId: data.data?.campaign_id };
}

async function deleteCampaign(accessToken: string, advertiserId: string, campaignId: string) {
  try {
    await fetch(`${TIKTOK_API}/campaign/status/update/`, {
      method: "POST",
      headers: { "Access-Token": accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        advertiser_id: advertiserId,
        campaign_ids: [campaignId],
        opt_status: "DELETE",
      }),
    });
  } catch (e) {
    console.error(`Failed to delete campaign ${campaignId}:`, e);
  }
}

async function deleteAdGroup(accessToken: string, advertiserId: string, adgroupId: string) {
  try {
    await fetch(`${TIKTOK_API}/adgroup/status/update/`, {
      method: "POST",
      headers: { "Access-Token": accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        advertiser_id: advertiserId,
        adgroup_ids: [adgroupId],
        opt_status: "DELETE",
      }),
    });
  } catch (e) {
    console.error(`Failed to delete ad group ${adgroupId}:`, e);
  }
}

async function createAdGroup(
  accessToken: string,
  advertiserId: string,
  campaignId: string,
  params: {
    optimizationGoal: string;
    billingEvent: string;
    bidType: string;
    bidAmount?: number;
    budgetMode: string;
    budget: number;
    placementType: string;
    placements: string[];
    ageGroups: string[];
    gender: string;
    locationIds: string[];
    startTime: string;
    endTime: string;
    promotionType?: string | null;
    pixelId?: string | null;
    conversionEvent?: string | null;
    frequencyCap?: boolean;
  },
): Promise<{ success: boolean; adGroupId?: string; error?: any }> {
  const body: any = {
    advertiser_id: advertiserId,
    campaign_id: campaignId,
    adgroup_name: `DRYRUN_ADGROUP_${params.optimizationGoal}_${Date.now()}`,
    placement_type: params.placementType,
    placements: params.placements,
    optimization_goal: params.optimizationGoal,
    billing_event: params.billingEvent,
    bid_type: params.bidType,
    operation_status: "DISABLE",
    pacing: "PACING_MODE_SMOOTH",
    budget_mode: params.budgetMode === "daily" ? "BUDGET_MODE_DAY" : "BUDGET_MODE_TOTAL",
    budget: Math.round(params.budget * 100) / 100,
    schedule_type: "SCHEDULE_START_END",
    schedule_start_time: params.startTime,
    schedule_end_time: params.endTime,
    location_ids: params.locationIds,
    age_groups: params.ageGroups,
    gender: params.gender,
    landing_page_url: "https://example.com",
  };

  // Add bid amount for manual bidding
  if (params.bidType === "BID_TYPE_CUSTOM") {
    if (params.billingEvent === "OCPM") {
      body.conversion_bid_price = params.bidAmount || 5;
    } else {
      body.bid_price = params.bidAmount || 10;
    }
  }

  // Add promotion type if applicable
  if (params.promotionType) {
    body.promotion_type = params.promotionType;
  }

  // Add conversion tracking for conversion goals
  if (params.pixelId && params.conversionEvent) {
    body.pixel_code = params.pixelId;
    body.optimization_event = params.conversionEvent;
    body.deep_external_action = params.conversionEvent;
  }

  // REACH requires frequency cap
  if (params.frequencyCap) {
    body.frequency = 3;
    body.frequency_schedule = 7;
  }

  const resp = await fetch(`${TIKTOK_API}/adgroup/create/`, {
    method: "POST",
    headers: { "Access-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.code !== 0) {
    return { success: false, error: { code: data.code, message: data.message, request_id: data.request_id } };
  }
  return { success: true, adGroupId: data.data?.adgroup_id };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const pixelId = body.pixelId || null;
    const advertiserIdOverride = body.advertiserId || null;
    const countryCode = body.countryCode || "GB";
    const enabledDimensions: string[] = body.dimensions || [
      "objective_optgoal",
      "bid_budget",
      "placements",
      "targeting",
      "conversion_events",
    ];

    // Get TikTok connection
    let accessToken: string | null = null;
    let platformAdvertiserId: string | null = null;

    const { data: platforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform_type", "tiktok")
      .eq("is_active", true);

    if (platforms && platforms.length > 0) {
      const platform = platforms[0];
      accessToken = await getAccessToken(supabase, platform.id, platform.access_token);
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "No active TikTok platform connected. Please connect TikTok first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine advertiser ID
    let advertiserId = advertiserIdOverride;
    if (!advertiserId) {
      const { data: tiktokAccounts } = await supabase
        .from("tiktok_ad_accounts")
        .select("advertiser_id")
        .eq("user_id", user.id)
        .limit(1);
      if (tiktokAccounts && tiktokAccounts.length > 0) {
        advertiserId = tiktokAccounts[0].advertiser_id;
      }
    }
    if (!advertiserId) {
      return new Response(JSON.stringify({ error: "No TikTok advertiser ID found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🧪 Starting TikTok dry-run validation for advertiser ${advertiserId}`);
    console.log(`📋 Enabled dimensions: ${enabledDimensions.join(", ")}`);

    const { start, end, days } = buildDates();
    const totalBudget = 700; // $700 total (meets TikTok minimums)
    const dailyBudget = Math.round((totalBudget / days) * 100) / 100;

    const locationId = COUNTRY_LOCATION_MAP[countryCode.toUpperCase()] || COUNTRY_LOCATION_MAP["GB"];
    const locationIds = [String(locationId)];

    const results: TestResult[] = [];
    let testCounter = 0;

    // ============= DIMENSION 1: Objective × Optimization Goal =============
    if (enabledDimensions.includes("objective_optgoal")) {
      console.log("\n🔬 === DIMENSION 1: Objective × Optimization Goal ===");

      for (const obj of OBJECTIVES) {
        for (const goal of obj.goals) {
          // Skip conversion goals without pixel
          if (goal.requiresPixel && !pixelId) {
            console.log(`Skipping ${obj.label}→${goal.label} (requires pixel)`);
            continue;
          }

          testCounter++;
          const testId = `OBJ_${testCounter}`;
          console.log(`\n${testId}: ${obj.label} → ${goal.label}`);

          const campResult = await createCampaign(accessToken, advertiserId, obj.objective, "lifetime", totalBudget);

          let adGroupResult: { success: boolean; error?: any; adGroupId?: string } = { success: false, error: { message: "Campaign creation failed" } };

          if (campResult.success && campResult.campaignId) {
            adGroupResult = await createAdGroup(accessToken, advertiserId, campResult.campaignId, {
              optimizationGoal: goal.value,
              billingEvent: goal.billingEvent,
              bidType: "BID_TYPE_NO_BID",
              budgetMode: "lifetime",
              budget: totalBudget,
              placementType: obj.objective === "REACH" || obj.objective === "LEAD_GENERATION" || obj.objective === "VIDEO_VIEWS"
                ? "PLACEMENT_TYPE_NORMAL" : "PLACEMENT_TYPE_AUTOMATIC",
              placements: obj.objective === "REACH" || obj.objective === "LEAD_GENERATION" || obj.objective === "VIDEO_VIEWS"
                ? ["PLACEMENT_TIKTOK"] : ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"],
              ageGroups: ["AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"],
              gender: "GENDER_UNLIMITED",
              locationIds,
              startTime: start,
              endTime: end,
              promotionType: goal.promotionType || null,
              pixelId: goal.requiresPixel ? pixelId : null,
              conversionEvent: goal.requiresPixel ? "ON_WEB_ORDER" : null,
              frequencyCap: obj.objective === "REACH",
            });

            // Cleanup
            if (adGroupResult.adGroupId) await deleteAdGroup(accessToken, advertiserId, adGroupResult.adGroupId);
            await deleteCampaign(accessToken, advertiserId, campResult.campaignId);
          }

          results.push({
            testId,
            dimension: "objective_optgoal",
            objective: obj.objective,
            objectiveLabel: obj.label,
            optimizationGoal: goal.value,
            optimizationGoalLabel: goal.label,
            bidStrategy: "BID_TYPE_NO_BID",
            budgetType: "lifetime",
            placementConfig: "Default for objective",
            targetingConfig: "Broad (18-55+, all genders)",
            conversionEvent: null,
            campaignValidation: { success: campResult.success, error: campResult.error || null },
            adGroupValidation: { success: adGroupResult.success, error: adGroupResult.error || null },
          });
        }
      }
    }

    // ============= DIMENSION 2: Bid Strategy × Budget Type =============
    if (enabledDimensions.includes("bid_budget")) {
      console.log("\n🔬 === DIMENSION 2: Bid Strategy × Budget Type ===");

      const testObjective = "TRAFFIC";
      const testOptGoal = "CLICK";

      for (const bid of BID_STRATEGIES) {
        for (const budgetType of BUDGET_TYPES) {
          testCounter++;
          const testId = `BID_${testCounter}`;
          console.log(`\n${testId}: ${bid.label} / ${budgetType}`);

          const budget = budgetType === "daily" ? dailyBudget : totalBudget;
          const campResult = await createCampaign(accessToken, advertiserId, testObjective, budgetType, budget);

          let adGroupResult: { success: boolean; error?: any; adGroupId?: string } = { success: false, error: { message: "Campaign failed" } };
          if (campResult.success && campResult.campaignId) {
            adGroupResult = await createAdGroup(accessToken, advertiserId, campResult.campaignId, {
              optimizationGoal: testOptGoal,
              billingEvent: "CPC",
              bidType: bid.value,
              bidAmount: bid.value === "BID_TYPE_CUSTOM" ? 10 : undefined,
              budgetMode: budgetType,
              budget,
              placementType: "PLACEMENT_TYPE_AUTOMATIC",
              placements: ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"],
              ageGroups: ["AGE_18_24", "AGE_25_34", "AGE_35_44"],
              gender: "GENDER_UNLIMITED",
              locationIds,
              startTime: start,
              endTime: end,
              promotionType: "WEBSITE",
            });

            if (adGroupResult.adGroupId) await deleteAdGroup(accessToken, advertiserId, adGroupResult.adGroupId);
            await deleteCampaign(accessToken, advertiserId, campResult.campaignId);
          }

          results.push({
            testId,
            dimension: "bid_budget",
            objective: testObjective,
            objectiveLabel: "Traffic",
            optimizationGoal: testOptGoal,
            optimizationGoalLabel: "Clicks",
            bidStrategy: bid.label,
            budgetType,
            placementConfig: "Automatic",
            targetingConfig: "Broad (18-44)",
            conversionEvent: null,
            campaignValidation: { success: campResult.success, error: campResult.error || null },
            adGroupValidation: { success: adGroupResult.success, error: adGroupResult.error || null },
          });
        }
      }
    }

    // ============= DIMENSION 3: Placements =============
    if (enabledDimensions.includes("placements")) {
      console.log("\n🔬 === DIMENSION 3: Placements ===");

      const testObjective = "TRAFFIC";
      const testOptGoal = "CLICK";

      const campResult = await createCampaign(accessToken, advertiserId, testObjective, "lifetime", totalBudget);

      if (campResult.success && campResult.campaignId) {
        for (const placement of PLACEMENT_CONFIGS) {
          testCounter++;
          const testId = `PLC_${testCounter}`;
          console.log(`\n${testId}: ${placement.name}`);

          const adGroupResult = await createAdGroup(accessToken, advertiserId, campResult.campaignId, {
            optimizationGoal: testOptGoal,
            billingEvent: "CPC",
            bidType: "BID_TYPE_NO_BID",
            budgetMode: "lifetime",
            budget: totalBudget,
            placementType: placement.placementType,
            placements: placement.placements,
            ageGroups: ["AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"],
            gender: "GENDER_UNLIMITED",
            locationIds,
            startTime: start,
            endTime: end,
            promotionType: "WEBSITE",
          });

          if (adGroupResult.adGroupId) await deleteAdGroup(accessToken, advertiserId, adGroupResult.adGroupId);

          results.push({
            testId,
            dimension: "placements",
            objective: testObjective,
            objectiveLabel: "Traffic",
            optimizationGoal: testOptGoal,
            optimizationGoalLabel: "Clicks",
            bidStrategy: "Lowest Cost",
            budgetType: "lifetime",
            placementConfig: placement.name,
            targetingConfig: "Broad (18-55+, all genders)",
            conversionEvent: null,
            campaignValidation: { success: true, error: null },
            adGroupValidation: { success: adGroupResult.success, error: adGroupResult.error || null },
          });
        }

        await deleteCampaign(accessToken, advertiserId, campResult.campaignId);
      }
    }

    // ============= DIMENSION 4: Targeting Variations =============
    if (enabledDimensions.includes("targeting")) {
      console.log("\n🔬 === DIMENSION 4: Targeting ===");

      const testObjective = "TRAFFIC";
      const testOptGoal = "CLICK";

      const campResult = await createCampaign(accessToken, advertiserId, testObjective, "lifetime", totalBudget);

      if (campResult.success && campResult.campaignId) {
        for (const tConfig of TARGETING_CONFIGS) {
          testCounter++;
          const testId = `TGT_${testCounter}`;
          console.log(`\n${testId}: ${tConfig.name}`);

          const adGroupResult = await createAdGroup(accessToken, advertiserId, campResult.campaignId, {
            optimizationGoal: testOptGoal,
            billingEvent: "CPC",
            bidType: "BID_TYPE_NO_BID",
            budgetMode: "lifetime",
            budget: totalBudget,
            placementType: "PLACEMENT_TYPE_AUTOMATIC",
            placements: ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"],
            ageGroups: tConfig.ageGroups,
            gender: tConfig.gender,
            locationIds,
            startTime: start,
            endTime: end,
            promotionType: "WEBSITE",
          });

          if (adGroupResult.adGroupId) await deleteAdGroup(accessToken, advertiserId, adGroupResult.adGroupId);

          results.push({
            testId,
            dimension: "targeting",
            objective: testObjective,
            objectiveLabel: "Traffic",
            optimizationGoal: testOptGoal,
            optimizationGoalLabel: "Clicks",
            bidStrategy: "Lowest Cost",
            budgetType: "lifetime",
            placementConfig: "Automatic",
            targetingConfig: tConfig.name,
            conversionEvent: null,
            campaignValidation: { success: true, error: null },
            adGroupValidation: { success: adGroupResult.success, error: adGroupResult.error || null },
          });
        }

        await deleteCampaign(accessToken, advertiserId, campResult.campaignId);
      }
    }

    // ============= DIMENSION 5: Conversion Events =============
    if (enabledDimensions.includes("conversion_events") && pixelId) {
      console.log("\n🔬 === DIMENSION 5: Conversion Events ===");

      const testObjective = "CONVERSIONS";
      const campResult = await createCampaign(accessToken, advertiserId, testObjective, "lifetime", totalBudget);

      if (campResult.success && campResult.campaignId) {
        for (const event of CONVERSION_EVENTS) {
          testCounter++;
          const testId = `CONV_${testCounter}`;
          console.log(`\n${testId}: ${event}`);

          const adGroupResult = await createAdGroup(accessToken, advertiserId, campResult.campaignId, {
            optimizationGoal: "CONVERT",
            billingEvent: "OCPM",
            bidType: "BID_TYPE_NO_BID",
            budgetMode: "lifetime",
            budget: totalBudget,
            placementType: "PLACEMENT_TYPE_NORMAL",
            placements: ["PLACEMENT_TIKTOK"],
            ageGroups: ["AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"],
            gender: "GENDER_UNLIMITED",
            locationIds,
            startTime: start,
            endTime: end,
            promotionType: "WEBSITE",
            pixelId,
            conversionEvent: event,
          });

          if (adGroupResult.adGroupId) await deleteAdGroup(accessToken, advertiserId, adGroupResult.adGroupId);

          results.push({
            testId,
            dimension: "conversion_events",
            objective: testObjective,
            objectiveLabel: "Conversions",
            optimizationGoal: "CONVERT",
            optimizationGoalLabel: "Conversions",
            bidStrategy: "Lowest Cost",
            budgetType: "lifetime",
            placementConfig: "Manual: TikTok only",
            targetingConfig: "Broad (18-55+, all genders)",
            conversionEvent: event,
            campaignValidation: { success: true, error: null },
            adGroupValidation: { success: adGroupResult.success, error: adGroupResult.error || null },
          });
        }

        await deleteCampaign(accessToken, advertiserId, campResult.campaignId);
      }
    }

    // ============= SUMMARY =============
    const passed = results.filter((r) => r.campaignValidation.success && r.adGroupValidation.success);
    const failed = results.filter((r) => !r.campaignValidation.success || !r.adGroupValidation.success);

    const summary = {
      totalTests: results.length,
      passed: passed.length,
      failed: failed.length,
      passRate: results.length > 0 ? `${Math.round((passed.length / results.length) * 100)}%` : "N/A",
      advertiserId,
      testedAt: new Date().toISOString(),
      dimensions: enabledDimensions,
      country: countryCode,
    };

    console.log(`\n📊 === SUMMARY ===`);
    console.log(`Total: ${summary.totalTests} | Passed: ${summary.passed} | Failed: ${summary.failed} | Rate: ${summary.passRate}`);

    // Group failures by error
    const errorGroups: Record<string, { count: number; tests: string[]; error: any }> = {};
    for (const f of failed) {
      const err = f.adGroupValidation.error || f.campaignValidation.error;
      const key = err?.code?.toString() || err?.message?.substring(0, 80) || "unknown";
      if (!errorGroups[key]) {
        errorGroups[key] = { count: 0, tests: [], error: err };
      }
      errorGroups[key].count++;
      errorGroups[key].tests.push(f.testId);
    }

    return new Response(
      JSON.stringify({ summary, errorGroups, results, failures: failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("❌ TikTok dry-run validation error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Validation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
