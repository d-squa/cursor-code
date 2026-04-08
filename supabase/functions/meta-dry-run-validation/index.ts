import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ====================================================================
// META DRY-RUN VALIDATION
// Tests all objective × optimization-goal × bid-strategy × budget-type
// × placement × targeting × conversion/attribution combinations
// using Meta's `validation_only=true` so nothing is actually created.
// ====================================================================

const META_API = "https://graph.facebook.com/v22.0";

// ----- Objective × Optimization Goal matrix -----
interface OptGoal {
  value: string;
  label: string;
  billingEvent: string;
}

interface ObjEntry {
  objective: string;
  label: string;
  goals: OptGoal[];
}

const OBJECTIVES: ObjEntry[] = [
  {
    objective: "OUTCOME_AWARENESS",
    label: "Awareness",
    goals: [
      { value: "REACH", label: "Reach", billingEvent: "IMPRESSIONS" },
      { value: "IMPRESSIONS", label: "Impressions", billingEvent: "IMPRESSIONS" },
      { value: "AD_RECALL_LIFT", label: "Ad Recall Lift", billingEvent: "IMPRESSIONS" },
      { value: "THRUPLAY", label: "ThruPlay", billingEvent: "THRUPLAY" },
    ],
  },
  {
    objective: "OUTCOME_TRAFFIC",
    label: "Traffic",
    goals: [
      { value: "LINK_CLICKS", label: "Link Clicks", billingEvent: "LINK_CLICKS" },
      { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views", billingEvent: "IMPRESSIONS" },
      { value: "REACH", label: "Reach", billingEvent: "IMPRESSIONS" },
      { value: "IMPRESSIONS", label: "Impressions", billingEvent: "IMPRESSIONS" },
    ],
  },
  {
    objective: "OUTCOME_ENGAGEMENT",
    label: "Engagement",
    goals: [
      { value: "THRUPLAY", label: "ThruPlay", billingEvent: "THRUPLAY" },
      { value: "POST_ENGAGEMENT", label: "Post Engagement", billingEvent: "IMPRESSIONS" },
      { value: "PAGE_LIKES", label: "Page Likes", billingEvent: "IMPRESSIONS" },
      { value: "CONVERSATIONS", label: "Conversations", billingEvent: "IMPRESSIONS" },
    ],
  },
  {
    objective: "OUTCOME_LEADS",
    label: "Lead Generation",
    goals: [
      { value: "LEAD_GENERATION", label: "Leads (Instant Forms)", billingEvent: "IMPRESSIONS" },
      { value: "CONVERSATIONS", label: "Conversations", billingEvent: "IMPRESSIONS" },
      { value: "OFFSITE_CONVERSIONS", label: "Conversions (Website)", billingEvent: "IMPRESSIONS" },
      { value: "LINK_CLICKS", label: "Link Clicks", billingEvent: "LINK_CLICKS" },
    ],
  },
  {
    objective: "OUTCOME_APP_PROMOTION",
    label: "App Promotion",
    goals: [
      { value: "APP_INSTALLS", label: "App Installs", billingEvent: "IMPRESSIONS" },
      { value: "APP_EVENTS", label: "App Events", billingEvent: "IMPRESSIONS" },
      { value: "VALUE", label: "Value (ROAS)", billingEvent: "IMPRESSIONS" },
      { value: "LINK_CLICKS", label: "Link Clicks", billingEvent: "LINK_CLICKS" },
    ],
  },
  {
    objective: "OUTCOME_SALES",
    label: "Sales",
    goals: [
      { value: "OFFSITE_CONVERSIONS", label: "Conversions", billingEvent: "IMPRESSIONS" },
      { value: "VALUE", label: "Value (ROAS)", billingEvent: "IMPRESSIONS" },
      { value: "LINK_CLICKS", label: "Link Clicks", billingEvent: "LINK_CLICKS" },
      { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views", billingEvent: "IMPRESSIONS" },
      { value: "CONVERSATIONS", label: "Conversations", billingEvent: "IMPRESSIONS" },
    ],
  },
];

const BID_STRATEGIES = [
  "LOWEST_COST_WITHOUT_CAP",
  "COST_CAP",
  "LOWEST_COST_WITH_BID_CAP",
];

const BUDGET_TYPES = ["lifetime", "daily"] as const;

const PLACEMENT_CONFIGS = [
  { name: "Advantage+ (auto)", advantagePlus: true, publisherPlatforms: null, positions: null },
  {
    name: "Manual: FB+IG",
    advantagePlus: false,
    publisherPlatforms: ["facebook", "instagram"],
    positions: {
      facebook: ["feed", "video_feeds", "story"],
      instagram: ["stream", "story", "reels"],
    },
  },
  {
    name: "Manual: IG only",
    advantagePlus: false,
    publisherPlatforms: ["instagram"],
    positions: { instagram: ["stream", "story", "reels", "explore"] },
  },
  {
    name: "Manual: FB+IG+AN",
    advantagePlus: false,
    publisherPlatforms: ["facebook", "instagram", "audience_network"],
    positions: {
      facebook: ["feed", "instream_video", "marketplace", "search", "video_feeds", "story"],
      instagram: ["stream", "story", "explore", "explore_home", "reels"],
      audience_network: ["classic", "rewarded_video"],
    },
  },
];

const TARGETING_CONFIGS = [
  { name: "Broad (18-65, all genders)", ageMin: 18, ageMax: 65, genders: null, devices: null },
  { name: "Male 25-44 mobile", ageMin: 25, ageMax: 44, genders: [1], devices: ["mobile"] },
  { name: "Female 18-34", ageMin: 18, ageMax: 34, genders: [2], devices: null },
  { name: "Desktop only 35-65", ageMin: 35, ageMax: 65, genders: null, devices: ["desktop"] },
];

const CONVERSION_EVENTS = ["PURCHASE", "LEAD", "ADD_TO_CART", "COMPLETE_REGISTRATION", "CONTENT_VIEW"];

const ATTRIBUTION_WINDOWS = [
  { click: 1, view: 0 },
  { click: 1, view: 1 },
  { click: 7, view: 0 },
  { click: 7, view: 1 },
];

const DESTINATION_TYPES = ["WEBSITE", "APP", "MESSENGER", "INSTAGRAM_DIRECT", "ON_POST", "ON_VIDEO", "ON_PAGE", "ON_EVENT"];

// Helpers
function buildDates(budgetType: string) {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 13); // 14-day campaign
  return { start: start.toISOString(), end: end.toISOString(), days: 14 };
}

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
  attributionWindow: string | null;
  destinationType: string | null;
  campaignValidation: { success: boolean; error: any | null };
  adSetValidation: { success: boolean; error: any | null };
}

async function validateCampaign(
  accessToken: string,
  adAccountPath: string,
  objective: string,
  budgetType: string,
  useCBO: boolean,
  phaseBudgetCents: number,
  dailyBudgetCents: number,
): Promise<{ success: boolean; error: any | null; campaignId?: string }> {
  const payload: any = {
    name: `DRY_RUN_${objective}_${Date.now()}`,
    objective,
    status: "PAUSED",
    special_ad_categories: [],
    validation_only: true,
    access_token: accessToken,
  };

  if (useCBO) {
    if (budgetType === "lifetime") {
      payload.lifetime_budget = phaseBudgetCents;
    } else {
      payload.daily_budget = dailyBudgetCents;
    }
  }

  const resp = await fetch(`${META_API}/${adAccountPath}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (data.error) {
    return { success: false, error: data.error };
  }
  return { success: true, error: null, campaignId: data.id };
}

async function validateAdSet(
  accessToken: string,
  adAccountPath: string,
  campaignId: string,
  params: {
    optimizationGoal: string;
    billingEvent: string;
    bidStrategy: string;
    bidAmount?: number;
    budgetType: string;
    lifetimeBudgetCents: number;
    dailyBudgetCents: number;
    targeting: any;
    startTime: string;
    endTime: string;
    attributionClick: number;
    attributionView: number;
    promotedObject?: any;
    destinationType?: string;
    useCBO: boolean;
  },
): Promise<{ success: boolean; error: any | null }> {
  const payload: any = {
    name: `DRY_RUN_ADSET_${params.optimizationGoal}_${Date.now()}`,
    campaign_id: campaignId,
    billing_event: params.billingEvent,
    optimization_goal: params.optimizationGoal,
    status: "PAUSED",
    start_time: params.startTime,
    end_time: params.endTime,
    targeting: params.targeting,
    validation_only: true,
    access_token: accessToken,
  };

  // Bid strategy
  if (params.bidStrategy !== "LOWEST_COST_WITHOUT_CAP") {
    payload.bid_strategy = params.bidStrategy;
    if (params.bidAmount && params.bidAmount > 0) {
      payload.bid_amount = params.bidAmount;
    }
  } else {
    payload.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  }

  // Budget (only if not CBO)
  if (!params.useCBO) {
    if (params.budgetType === "lifetime") {
      payload.lifetime_budget = params.lifetimeBudgetCents;
    } else {
      payload.daily_budget = params.dailyBudgetCents;
    }
  }

  // Attribution
  payload.attribution_spec = [
    { event_type: "CLICK_THROUGH", window_days: params.attributionClick },
    { event_type: "VIEW_THROUGH", window_days: params.attributionView },
  ];

  // Promoted object for conversion objectives
  if (params.promotedObject) {
    payload.promoted_object = params.promotedObject;
  }

  // Destination type
  if (params.destinationType) {
    payload.destination_type = params.destinationType;
  }

  // DSA compliance
  payload.dsa_beneficiary = "Test Advertiser";
  payload.dsa_payor = "Test Advertiser";

  const resp = await fetch(`${META_API}/${adAccountPath}/adsets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (data.error) {
    return { success: false, error: data.error };
  }
  return { success: true, error: null };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse optional filters from body
    const body = await req.json().catch(() => ({}));
    const filterObjective = body.objective || null;
    const filterBidStrategy = body.bidStrategy || null;
    const filterBudgetType = body.budgetType || null;
    const pixelId = body.pixelId || null;
    const adAccountIdOverride = body.adAccountId || null;
    // Control which dimensions to test
    const enabledDimensions: string[] = body.dimensions || [
      "objective_optgoal",
      "bid_budget",
      "placements",
      "targeting",
      "conversion_attribution",
    ];

    // Get user's connected Meta platform OR fall back to META_ACCESS_TOKEN secret
    let accessToken: string | null = null;
    let platformAdAccountId: string | null = null;

    const { data: platforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true);

    if (platforms && platforms.length > 0) {
      const platform = platforms[0];
      accessToken = await getAccessToken(supabase, platform.id, platform.access_token);
      platformAdAccountId = platform.ad_account_id;
    }

    // Fallback to META_ACCESS_TOKEN secret for testing without a connected platform
    if (!accessToken) {
      accessToken = Deno.env.get("META_ACCESS_TOKEN") || null;
      console.log("[DRY-RUN] No connected platform found, using META_ACCESS_TOKEN secret fallback");
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "No Meta access token available. Either connect a Meta platform or set the META_ACCESS_TOKEN secret." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine ad account
    let rawAdAccountId = adAccountIdOverride || platformAdAccountId || Deno.env.get("META_AD_ACCOUNT_ID");
    if (!rawAdAccountId) {
      // Try to get from meta_ad_accounts
      const { data: metaAccounts } = await supabase
        .from("meta_ad_accounts")
        .select("account_id")
        .eq("user_id", user.id)
        .limit(1);
      if (metaAccounts && metaAccounts.length > 0) {
        rawAdAccountId = metaAccounts[0].account_id;
      }
    }
    if (!rawAdAccountId) {
      return new Response(JSON.stringify({ error: "No Meta ad account found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adAccountPath = String(rawAdAccountId).startsWith("act_")
      ? String(rawAdAccountId)
      : `act_${String(rawAdAccountId).replace(/^act_/, "")}`;

    console.log(`🧪 Starting Meta dry-run validation on ${adAccountPath}`);
    console.log(`📋 Enabled dimensions: ${enabledDimensions.join(", ")}`);

    const { start, end, days } = buildDates("lifetime");
    const phaseBudget = 5000; // $50
    const phaseBudgetCents = phaseBudget * 100;
    const dailyBudgetCents = Math.round((phaseBudget / days) * 100);
    const defaultBidAmount = 500; // $5 in cents

    const results: TestResult[] = [];
    let testCounter = 0;

    // ============= DIMENSION 1: Objective × Optimization Goal =============
    if (enabledDimensions.includes("objective_optgoal")) {
      console.log("\n🔬 === DIMENSION 1: Objective × Optimization Goal ===");

      for (const obj of OBJECTIVES) {
        if (filterObjective && obj.objective !== filterObjective) continue;

        for (const goal of obj.goals) {
          testCounter++;
          const testId = `OBJ_${testCounter}`;
          console.log(`\n${testId}: ${obj.label} → ${goal.label}`);

          // Create campaign (validation_only)
          const campResult = await validateCampaign(
            accessToken, adAccountPath, obj.objective, "lifetime", false, phaseBudgetCents, dailyBudgetCents,
          );

          // For validation_only, Meta returns a success even though no real campaign is created
          // We still need a campaign_id for ad set validation, so create a real PAUSED campaign
          // if validation succeeds, then delete it afterwards. Or use a single real campaign.
          // Actually, validation_only on campaigns returns {success: true} but no id.
          // For ad sets we need a real campaign_id. Let's create one real campaign per objective.
          
          let realCampaignId: string | null = null;
          if (campResult.success) {
            // Create a real (PAUSED) campaign to use for ad set validation
            const realResp = await fetch(`${META_API}/${adAccountPath}/campaigns`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: `DRYRUN_TEST_${obj.objective}_${Date.now()}`,
                objective: obj.objective,
                status: "PAUSED",
                special_ad_categories: [],
                access_token: accessToken,
              }),
            });
            const realData = await realResp.json();
            if (realData.id) {
              realCampaignId = realData.id;
              console.log(`  Created test campaign: ${realCampaignId}`);
            } else {
              console.error(`  Failed to create test campaign:`, realData.error);
            }
          }

          let adSetResult: { success: boolean; error: any | null } = { success: false, error: { message: "Campaign validation failed - skipped ad set" } };
          if (realCampaignId) {
            const targeting: any = {
              geo_locations: { countries: ["US"] },
              age_min: 18,
              age_max: 65,
            };

            // Check if conversion-related goal needs promoted_object
            const conversionGoals = ["OFFSITE_CONVERSIONS", "VALUE"];
            let promotedObject = undefined;
            if (conversionGoals.includes(goal.value) && pixelId) {
              promotedObject = { pixel_id: pixelId, custom_event_type: "PURCHASE" };
            }

            adSetResult = await validateAdSet(accessToken, adAccountPath, realCampaignId, {
              optimizationGoal: goal.value,
              billingEvent: goal.billingEvent,
              bidStrategy: "LOWEST_COST_WITHOUT_CAP",
              budgetType: "lifetime",
              lifetimeBudgetCents: phaseBudgetCents,
              dailyBudgetCents,
              targeting,
              startTime: start,
              endTime: end,
              attributionClick: 1,
              attributionView: 0,
              promotedObject,
              useCBO: false,
            });

            // Cleanup: delete test campaign
            await fetch(`${META_API}/${realCampaignId}?access_token=${accessToken}`, { method: "DELETE" });
            console.log(`  Cleaned up test campaign: ${realCampaignId}`);
          }

          results.push({
            testId,
            dimension: "objective_optgoal",
            objective: obj.objective,
            objectiveLabel: obj.label,
            optimizationGoal: goal.value,
            optimizationGoalLabel: goal.label,
            bidStrategy: "LOWEST_COST_WITHOUT_CAP",
            budgetType: "lifetime",
            placementConfig: "Advantage+ (auto)",
            targetingConfig: "Broad (18-65, all genders)",
            conversionEvent: null,
            attributionWindow: "1d click / 0d view",
            destinationType: null,
            campaignValidation: campResult,
            adSetValidation: adSetResult,
          });
        }
      }
    }

    // ============= DIMENSION 2: Bid Strategy × Budget Type =============
    if (enabledDimensions.includes("bid_budget")) {
      console.log("\n🔬 === DIMENSION 2: Bid Strategy × Budget Type ===");

      // Use OUTCOME_SALES/OFFSITE_CONVERSIONS as baseline (supports all bid strategies)
      const testObjective = "OUTCOME_SALES";
      const testOptGoal = "OFFSITE_CONVERSIONS";
      const testBillingEvent = "IMPRESSIONS";

      for (const bidStrategy of BID_STRATEGIES) {
        if (filterBidStrategy && bidStrategy !== filterBidStrategy) continue;

        for (const budgetType of BUDGET_TYPES) {
          if (filterBudgetType && budgetType !== filterBudgetType) continue;

          // Also test CBO on/off
          for (const useCBO of [false, true]) {
            testCounter++;
            const testId = `BID_${testCounter}`;
            const label = `${bidStrategy} / ${budgetType} / CBO:${useCBO}`;
            console.log(`\n${testId}: ${label}`);

            const campResult = await validateCampaign(
              accessToken, adAccountPath, testObjective, budgetType, useCBO, phaseBudgetCents, dailyBudgetCents,
            );

            let realCampaignId: string | null = null;
            if (campResult.success) {
              const campPayload: any = {
                name: `DRYRUN_BID_${bidStrategy}_${Date.now()}`,
                objective: testObjective,
                status: "PAUSED",
                special_ad_categories: [],
                access_token: accessToken,
              };
              if (useCBO) {
                if (budgetType === "lifetime") {
                  campPayload.lifetime_budget = phaseBudgetCents;
                } else {
                  campPayload.daily_budget = dailyBudgetCents;
                }
              }
              const realResp = await fetch(`${META_API}/${adAccountPath}/campaigns`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(campPayload),
              });
              const realData = await realResp.json();
              realCampaignId = realData.id || null;
              if (realData.error) {
                console.error(`  Campaign creation failed:`, realData.error);
              }
            }

            let adSetResult: { success: boolean; error: any | null } = { success: false, error: { message: "Campaign failed" } };
            if (realCampaignId) {
              const needsBidAmount = bidStrategy === "COST_CAP" || bidStrategy === "LOWEST_COST_WITH_BID_CAP";

              adSetResult = await validateAdSet(accessToken, adAccountPath, realCampaignId, {
                optimizationGoal: testOptGoal,
                billingEvent: testBillingEvent,
                bidStrategy,
                bidAmount: needsBidAmount ? defaultBidAmount : undefined,
                budgetType,
                lifetimeBudgetCents: phaseBudgetCents,
                dailyBudgetCents,
                targeting: { geo_locations: { countries: ["US"] }, age_min: 18, age_max: 65 },
                startTime: start,
                endTime: end,
                attributionClick: 7,
                attributionView: 1,
                promotedObject: pixelId ? { pixel_id: pixelId, custom_event_type: "PURCHASE" } : undefined,
                useCBO,
              });

              await fetch(`${META_API}/${realCampaignId}?access_token=${accessToken}`, { method: "DELETE" });
            }

            results.push({
              testId,
              dimension: "bid_budget",
              objective: testObjective,
              objectiveLabel: "Sales",
              optimizationGoal: testOptGoal,
              optimizationGoalLabel: "Conversions",
              bidStrategy,
              budgetType,
              placementConfig: `Advantage+ (auto) / CBO:${useCBO}`,
              targetingConfig: "Broad (18-65, all genders)",
              conversionEvent: pixelId ? "PURCHASE" : null,
              attributionWindow: "7d click / 1d view",
              destinationType: null,
              campaignValidation: campResult,
              adSetValidation: adSetResult,
            });
          }
        }
      }
    }

    // ============= DIMENSION 3: Placements =============
    if (enabledDimensions.includes("placements")) {
      console.log("\n🔬 === DIMENSION 3: Placements ===");

      const testObjective = "OUTCOME_TRAFFIC";
      const testOptGoal = "LINK_CLICKS";
      const testBillingEvent = "LINK_CLICKS";

      // Create one campaign for all placement tests
      const campResp = await fetch(`${META_API}/${adAccountPath}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `DRYRUN_PLACEMENT_${Date.now()}`,
          objective: testObjective,
          status: "PAUSED",
          special_ad_categories: [],
          access_token: accessToken,
        }),
      });
      const campData = await campResp.json();
      const placementCampaignId = campData.id;

      if (placementCampaignId) {
        for (const placement of PLACEMENT_CONFIGS) {
          testCounter++;
          const testId = `PLC_${testCounter}`;
          console.log(`\n${testId}: ${placement.name}`);

          const targeting: any = {
            geo_locations: { countries: ["US"] },
            age_min: 18,
            age_max: 65,
          };

          if (!placement.advantagePlus) {
            if (placement.publisherPlatforms) {
              targeting.publisher_platforms = placement.publisherPlatforms;
            }
            if (placement.positions) {
              if (placement.positions.facebook) targeting.facebook_positions = placement.positions.facebook;
              if (placement.positions.instagram) targeting.instagram_positions = placement.positions.instagram;
              if ((placement.positions as any).audience_network) targeting.audience_network_positions = (placement.positions as any).audience_network;
            }
          }

          const adSetResult = await validateAdSet(accessToken, adAccountPath, placementCampaignId, {
            optimizationGoal: testOptGoal,
            billingEvent: testBillingEvent,
            bidStrategy: "LOWEST_COST_WITHOUT_CAP",
            budgetType: "lifetime",
            lifetimeBudgetCents: phaseBudgetCents,
            dailyBudgetCents,
            targeting,
            startTime: start,
            endTime: end,
            attributionClick: 1,
            attributionView: 0,
            useCBO: false,
          });

          results.push({
            testId,
            dimension: "placements",
            objective: testObjective,
            objectiveLabel: "Traffic",
            optimizationGoal: testOptGoal,
            optimizationGoalLabel: "Link Clicks",
            bidStrategy: "LOWEST_COST_WITHOUT_CAP",
            budgetType: "lifetime",
            placementConfig: placement.name,
            targetingConfig: "Broad (18-65, all genders)",
            conversionEvent: null,
            attributionWindow: "1d click / 0d view",
            destinationType: null,
            campaignValidation: { success: true, error: null },
            adSetValidation: adSetResult,
          });
        }

        // Cleanup
        await fetch(`${META_API}/${placementCampaignId}?access_token=${accessToken}`, { method: "DELETE" });
      }
    }

    // ============= DIMENSION 4: Targeting Variations =============
    if (enabledDimensions.includes("targeting")) {
      console.log("\n🔬 === DIMENSION 4: Targeting ===");

      const testObjective = "OUTCOME_TRAFFIC";
      const testOptGoal = "LINK_CLICKS";
      const testBillingEvent = "LINK_CLICKS";

      const campResp = await fetch(`${META_API}/${adAccountPath}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `DRYRUN_TARGETING_${Date.now()}`,
          objective: testObjective,
          status: "PAUSED",
          special_ad_categories: [],
          access_token: accessToken,
        }),
      });
      const campData = await campResp.json();
      const targetingCampaignId = campData.id;

      if (targetingCampaignId) {
        for (const tConfig of TARGETING_CONFIGS) {
          testCounter++;
          const testId = `TGT_${testCounter}`;
          console.log(`\n${testId}: ${tConfig.name}`);

          const targeting: any = {
            geo_locations: { countries: ["US"] },
            age_min: tConfig.ageMin,
            age_max: tConfig.ageMax,
          };
          if (tConfig.genders) targeting.genders = tConfig.genders;
          if (tConfig.devices) targeting.device_platforms = tConfig.devices;

          const adSetResult = await validateAdSet(accessToken, adAccountPath, targetingCampaignId, {
            optimizationGoal: testOptGoal,
            billingEvent: testBillingEvent,
            bidStrategy: "LOWEST_COST_WITHOUT_CAP",
            budgetType: "lifetime",
            lifetimeBudgetCents: phaseBudgetCents,
            dailyBudgetCents,
            targeting,
            startTime: start,
            endTime: end,
            attributionClick: 1,
            attributionView: 0,
            useCBO: false,
          });

          results.push({
            testId,
            dimension: "targeting",
            objective: testObjective,
            objectiveLabel: "Traffic",
            optimizationGoal: testOptGoal,
            optimizationGoalLabel: "Link Clicks",
            bidStrategy: "LOWEST_COST_WITHOUT_CAP",
            budgetType: "lifetime",
            placementConfig: "Advantage+ (auto)",
            targetingConfig: tConfig.name,
            conversionEvent: null,
            attributionWindow: "1d click / 0d view",
            destinationType: null,
            campaignValidation: { success: true, error: null },
            adSetValidation: adSetResult,
          });
        }

        await fetch(`${META_API}/${targetingCampaignId}?access_token=${accessToken}`, { method: "DELETE" });
      }
    }

    // ============= DIMENSION 5: Conversion & Attribution =============
    if (enabledDimensions.includes("conversion_attribution")) {
      console.log("\n🔬 === DIMENSION 5: Conversion & Attribution ===");

      const testObjective = "OUTCOME_SALES";

      const campResp = await fetch(`${META_API}/${adAccountPath}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `DRYRUN_CONV_${Date.now()}`,
          objective: testObjective,
          status: "PAUSED",
          special_ad_categories: [],
          access_token: accessToken,
        }),
      });
      const campData = await campResp.json();
      const convCampaignId = campData.id;

      if (convCampaignId) {
        // Test conversion events × attribution windows
        for (const event of CONVERSION_EVENTS) {
          for (const attrWindow of ATTRIBUTION_WINDOWS) {
            testCounter++;
            const testId = `CONV_${testCounter}`;
            const label = `${event} / ${attrWindow.click}d click, ${attrWindow.view}d view`;
            console.log(`\n${testId}: ${label}`);

            const adSetResult = await validateAdSet(accessToken, adAccountPath, convCampaignId, {
              optimizationGoal: "OFFSITE_CONVERSIONS",
              billingEvent: "IMPRESSIONS",
              bidStrategy: "LOWEST_COST_WITHOUT_CAP",
              budgetType: "lifetime",
              lifetimeBudgetCents: phaseBudgetCents,
              dailyBudgetCents,
              targeting: { geo_locations: { countries: ["US"] }, age_min: 18, age_max: 65 },
              startTime: start,
              endTime: end,
              attributionClick: attrWindow.click,
              attributionView: attrWindow.view,
              promotedObject: pixelId ? { pixel_id: pixelId, custom_event_type: event } : undefined,
              useCBO: false,
            });

            results.push({
              testId,
              dimension: "conversion_attribution",
              objective: testObjective,
              objectiveLabel: "Sales",
              optimizationGoal: "OFFSITE_CONVERSIONS",
              optimizationGoalLabel: "Conversions",
              bidStrategy: "LOWEST_COST_WITHOUT_CAP",
              budgetType: "lifetime",
              placementConfig: "Advantage+ (auto)",
              targetingConfig: "Broad (18-65, all genders)",
              conversionEvent: event,
              attributionWindow: `${attrWindow.click}d click / ${attrWindow.view}d view`,
              destinationType: null,
              campaignValidation: { success: true, error: null },
              adSetValidation: adSetResult,
            });
          }
        }

        // Test destination types
        for (const dest of DESTINATION_TYPES) {
          testCounter++;
          const testId = `DEST_${testCounter}`;
          console.log(`\n${testId}: Destination ${dest}`);

          const adSetResult = await validateAdSet(accessToken, adAccountPath, convCampaignId, {
            optimizationGoal: "OFFSITE_CONVERSIONS",
            billingEvent: "IMPRESSIONS",
            bidStrategy: "LOWEST_COST_WITHOUT_CAP",
            budgetType: "lifetime",
            lifetimeBudgetCents: phaseBudgetCents,
            dailyBudgetCents,
            targeting: { geo_locations: { countries: ["US"] }, age_min: 18, age_max: 65 },
            startTime: start,
            endTime: end,
            attributionClick: 7,
            attributionView: 1,
            promotedObject: pixelId ? { pixel_id: pixelId, custom_event_type: "PURCHASE" } : undefined,
            destinationType: dest,
            useCBO: false,
          });

          results.push({
            testId,
            dimension: "conversion_attribution",
            objective: testObjective,
            objectiveLabel: "Sales",
            optimizationGoal: "OFFSITE_CONVERSIONS",
            optimizationGoalLabel: "Conversions",
            bidStrategy: "LOWEST_COST_WITHOUT_CAP",
            budgetType: "lifetime",
            placementConfig: "Advantage+ (auto)",
            targetingConfig: "Broad (18-65, all genders)",
            conversionEvent: "PURCHASE",
            attributionWindow: "7d click / 1d view",
            destinationType: dest,
            campaignValidation: { success: true, error: null },
            adSetValidation: adSetResult,
          });
        }

        await fetch(`${META_API}/${convCampaignId}?access_token=${accessToken}`, { method: "DELETE" });
      }
    }

    // ============= SUMMARY =============
    const passed = results.filter((r) => r.campaignValidation.success && r.adSetValidation.success);
    const failed = results.filter((r) => !r.campaignValidation.success || !r.adSetValidation.success);

    const summary = {
      totalTests: results.length,
      passed: passed.length,
      failed: failed.length,
      passRate: results.length > 0 ? `${Math.round((passed.length / results.length) * 100)}%` : "N/A",
      adAccount: adAccountPath,
      testedAt: new Date().toISOString(),
      dimensions: enabledDimensions,
    };

    console.log(`\n📊 === SUMMARY ===`);
    console.log(`Total: ${summary.totalTests} | Passed: ${summary.passed} | Failed: ${summary.failed} | Rate: ${summary.passRate}`);

    // Group failures by error type
    const errorGroups: Record<string, { count: number; tests: string[]; error: any }> = {};
    for (const f of failed) {
      const err = f.adSetValidation.error || f.campaignValidation.error;
      const key = err?.error_subcode
        ? `${err.code}_${err.error_subcode}`
        : err?.code?.toString() || err?.message?.substring(0, 80) || "unknown";
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
    console.error("❌ Dry-run validation error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Validation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
