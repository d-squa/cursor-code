import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const userId = user.id;

    const { data: existingState } = await supabase
      .from("tour_data_state")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (existingState?.is_seeded) {
      return new Response(JSON.stringify({ 
        success: true, 
        already_seeded: true,
        campaign_id: existingState.seeded_campaign_id 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: teamData } = await supabase
      .from("teams")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .single();

    const teamId = teamData?.id || null;

    // ===== 1. Seed dummy platform connections =====
    const platformConnections = [
      {
        user_id: userId, team_id: teamId, platform_type: "meta",
        platform_name: "Meta Business Suite", ad_account_id: "act_sample_123456",
        ad_account_name: "Sample Meta Ad Account", is_active: true, is_sample: true,
        metadata: { business_name: "Tour Demo Business" },
      },
      {
        user_id: userId, team_id: teamId, platform_type: "tiktok",
        platform_name: "TikTok Business Center", ad_account_id: "sample_tt_789012",
        ad_account_name: "Sample TikTok Ad Account", is_active: true, is_sample: true,
        metadata: { business_name: "Tour Demo Business" },
      },
      {
        user_id: userId, team_id: teamId, platform_type: "google",
        platform_name: "Google Ads", ad_account_id: "sample_gads_345678",
        ad_account_name: "Sample Google Ads Account", is_active: true, is_sample: true,
        metadata: { business_name: "Tour Demo Business" },
      },
    ];

    const { error: connError } = await supabase.from("connected_platforms").insert(platformConnections);
    if (connError) console.error("Platform insert error:", connError);

    // ===== 2. Seed comprehensive Demo ActiPlan =====
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 45);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 15);
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    const sharedInterests = [
      { id: "6003139266461", type: "interests", name: "Online shopping" },
      { id: "6003107902433", type: "interests", name: "Technology" },
      { id: "6003384248805", type: "interests", name: "Fashion" },
      { id: "6003277229371", type: "interests", name: "Fitness and wellness" },
      { id: "6003012752235", type: "interests", name: "Travel" },
    ];

    const sharedAudiences = [
      { id: "aud-lal-1", name: "Lookalike 1% - Purchase", type: "lookalike", source: "meta", approximate_count: 2100000 },
      { id: "aud-ret-1", name: "Website Visitors 30d", type: "custom", source: "meta", subtype: "website", approximate_count: 85000 },
      { id: "aud-ret-2", name: "Add to Cart 14d", type: "custom", source: "meta", subtype: "website", approximate_count: 12000 },
    ];

    const platforms = [
      {
        id: "meta", name: "Meta", enabled: true, budgetPercentage: 50,
        markets: [
          {
            id: "meta-us", name: "United States", budgetPercentage: 60,
            adAccountId: "act_sample_123456", accountName: "Sample Meta Ad Account",
            pageId: "sample_page_123", page: "Demo Brand US", pixel: "sample_pixel_456",
            countries: ["US"], ageMin: 18, ageMax: 65, gender: "all",
            languages: [6, 24], // English, Spanish
            adFormats: ["Video ads", "Image ads", "Carousel ads"],
            detailedTargeting: sharedInterests,
            metaBidStrategy: "LOWEST_COST_WITHOUT_CAP",
            metaBillingEvent: "IMPRESSIONS",
            metaAdvantagePlusPlacements: true,
            strategy: "full_funnel", strategyFocus: "conversion",
            phases: [
              {
                id: "meta-us-awareness", name: "Awareness", funnelStage: "awareness",
                objective: "OUTCOME_AWARENESS", optimizationGoal: "REACH",
                budgetPercentage: 30, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                metaBidStrategy: "LOWEST_COST_WITHOUT_CAP", metaBillingEvent: "IMPRESSIONS",
                metaAdvantagePlusAudience: true, metaAdvantagePlusCreative: true,
                advantagePlusPlacements: true,
                audiences: [sharedAudiences[0]],
                detailedTargeting: sharedInterests.slice(0, 3),
                adSets: [
                  { id: "as-1", name: "Broad 18-45", budgetPercentage: 50, dimensionValue: "18-45", ageMin: 18, ageMax: 45 },
                  { id: "as-2", name: "Interest-Based 25-55", budgetPercentage: 50, dimensionValue: "25-55", ageMin: 25, ageMax: 55,
                    audiences: [sharedAudiences[0]] },
                ],
                adSetSplitDimension: "age",
              },
              {
                id: "meta-us-consideration", name: "Consideration", funnelStage: "consideration",
                objective: "OUTCOME_TRAFFIC", optimizationGoal: "LINK_CLICKS",
                budgetPercentage: 35, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                metaBidStrategy: "LOWEST_COST_WITHOUT_CAP", metaBillingEvent: "IMPRESSIONS",
                metaLandingPageUrl: "https://demo-brand.example.com/shop",
                audiences: [sharedAudiences[0], sharedAudiences[1]],
                detailedTargeting: sharedInterests,
                adSets: [
                  { id: "as-3", name: "Website Visitors LAL", budgetPercentage: 60, dimensionValue: "lal",
                    audiences: [sharedAudiences[0]] },
                  { id: "as-4", name: "Interest Targeting", budgetPercentage: 40, dimensionValue: "interest" },
                ],
                adSetSplitDimension: "audience",
              },
              {
                id: "meta-us-conversion", name: "Conversion", funnelStage: "conversion",
                objective: "OUTCOME_SALES", optimizationGoal: "OFFSITE_CONVERSIONS",
                budgetPercentage: 35, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                metaBidStrategy: "COST_CAP", metaBidAmount: 18, metaBillingEvent: "IMPRESSIONS",
                metaOptimizationLocation: "WEBSITE", metaConversionCount: "all_conversions",
                metaClickWindow: 7, metaViewWindow: 1,
                audiences: [sharedAudiences[1], sharedAudiences[2]],
                excludedAudiences: [{ id: "aud-purchasers", name: "Purchasers 30d", type: "custom", source: "meta" }],
                autoExcludeAudiences: true,
                adSets: [
                  { id: "as-5", name: "Retargeting 7d", budgetPercentage: 50, dimensionValue: "7d",
                    audiences: [sharedAudiences[2]] },
                  { id: "as-6", name: "Retargeting 30d", budgetPercentage: 50, dimensionValue: "30d",
                    audiences: [sharedAudiences[1]] },
                ],
                adSetSplitDimension: "audience",
              },
            ],
          },
          {
            id: "meta-uk", name: "United Kingdom", budgetPercentage: 40,
            adAccountId: "act_sample_123456", accountName: "Sample Meta Ad Account",
            pageId: "sample_page_uk", page: "Demo Brand UK", pixel: "sample_pixel_uk",
            countries: ["GB"], ageMin: 18, ageMax: 55, gender: "all",
            languages: [6], // English
            adFormats: ["Video ads", "Image ads"],
            detailedTargeting: sharedInterests.slice(0, 3),
            metaBidStrategy: "LOWEST_COST_WITHOUT_CAP", metaBillingEvent: "IMPRESSIONS",
            strategy: "full_funnel", strategyFocus: "awareness",
            phases: [
              {
                id: "meta-uk-awareness", name: "Awareness", funnelStage: "awareness",
                objective: "OUTCOME_AWARENESS", optimizationGoal: "REACH",
                budgetPercentage: 50, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                detailedTargeting: sharedInterests.slice(0, 2),
                adSets: [{ id: "as-7", name: "Broad UK", budgetPercentage: 100, dimensionValue: "broad" }],
              },
              {
                id: "meta-uk-conversion", name: "Conversion", funnelStage: "conversion",
                objective: "OUTCOME_SALES", optimizationGoal: "OFFSITE_CONVERSIONS",
                budgetPercentage: 50, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                metaBidStrategy: "COST_CAP", metaBidAmount: 22, metaBillingEvent: "IMPRESSIONS",
                audiences: [sharedAudiences[1]],
                adSets: [{ id: "as-8", name: "Retargeting UK", budgetPercentage: 100, dimensionValue: "retarget",
                  audiences: [sharedAudiences[1]] }],
                adSetSplitDimension: "audience",
              },
            ],
          },
        ],
      },
      {
        id: "tiktok", name: "TikTok", enabled: true, budgetPercentage: 30,
        markets: [
          {
            id: "tiktok-us", name: "United States", budgetPercentage: 70,
            adAccountId: "sample_tt_789012", accountName: "Sample TikTok Ad Account",
            tiktokPixel: "sample_tt_pixel", countries: ["US"],
            ageMin: 18, ageMax: 45, gender: "all",
            adFormats: ["In-Feed ads", "TopView ads"],
            tiktokBidStrategy: "BID_TYPE_NO_BID", tiktokBillingEvent: "OCPM",
            tiktokPlacementType: "PLACEMENT_TYPE_AUTOMATIC",
            tiktokOptimizationLocation: "WEBSITE",
            tiktokLandingPageUrl: "https://demo-brand.example.com",
            strategy: "full_funnel", strategyFocus: "traffic",
            detailedTargeting: [
              { id: "tt-int-1", type: "interests", name: "E-commerce" },
              { id: "tt-int-2", type: "interests", name: "Fashion & Accessories" },
              { id: "tt-int-3", type: "interests", name: "Beauty & Personal Care" },
            ],
            phases: [
              {
                id: "tt-us-awareness", name: "Awareness", funnelStage: "awareness",
                objective: "REACH", optimizationGoal: "REACH",
                budgetPercentage: 40, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                tiktokSmartPlusEnabled: false, tiktokPlacementType: "PLACEMENT_TYPE_AUTOMATIC",
                adSets: [{ id: "as-9", name: "Gen Z & Millennials", budgetPercentage: 100, dimensionValue: "genz" }],
              },
              {
                id: "tt-us-traffic", name: "Traffic", funnelStage: "consideration",
                objective: "TRAFFIC", optimizationGoal: "CLICK",
                budgetPercentage: 35, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                tiktokLandingPageUrl: "https://demo-brand.example.com/shop",
                adSets: [
                  { id: "as-10", name: "Interest Targeting", budgetPercentage: 60, dimensionValue: "interest" },
                  { id: "as-10b", name: "Broad Targeting", budgetPercentage: 40, dimensionValue: "broad" },
                ],
                adSetSplitDimension: "audience",
              },
              {
                id: "tt-us-conversion", name: "Conversion", funnelStage: "conversion",
                objective: "CONVERSIONS", optimizationGoal: "CONVERT",
                budgetPercentage: 25, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                tiktokBidStrategy: "BID_TYPE_CUSTOM", tiktokBidAmount: 15,
                tiktokOptimizationEvent: "COMPLETE_PAYMENT",
                adSets: [{ id: "as-10c", name: "Retargeting", budgetPercentage: 100, dimensionValue: "retarget" }],
              },
            ],
          },
          {
            id: "tiktok-de", name: "Germany", budgetPercentage: 30,
            adAccountId: "sample_tt_789012", accountName: "Sample TikTok Ad Account",
            tiktokPixel: "sample_tt_pixel_de", countries: ["DE"],
            ageMin: 18, ageMax: 40, gender: "all",
            adFormats: ["In-Feed ads"],
            tiktokPlacementType: "PLACEMENT_TYPE_AUTOMATIC",
            strategy: "awareness", strategyFocus: "awareness",
            phases: [
              {
                id: "tt-de-awareness", name: "Awareness", funnelStage: "awareness",
                objective: "REACH", optimizationGoal: "REACH",
                budgetPercentage: 60, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                adSets: [{ id: "as-11t", name: "Broad DE", budgetPercentage: 100, dimensionValue: "broad" }],
              },
              {
                id: "tt-de-traffic", name: "Traffic", funnelStage: "consideration",
                objective: "TRAFFIC", optimizationGoal: "CLICK",
                budgetPercentage: 40, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                adSets: [{ id: "as-12t", name: "Interest DE", budgetPercentage: 100, dimensionValue: "interest" }],
              },
            ],
          },
        ],
      },
      {
        id: "google", name: "Google Ads", enabled: true, budgetPercentage: 20,
        markets: [
          {
            id: "google-us", name: "United States", budgetPercentage: 65,
            adAccountId: "sample_gads_345678", accountName: "Sample Google Ads Account",
            countries: ["US"], ageMin: 18, ageMax: 65,
            adFormats: ["Search ads", "Display ads", "Performance Max"],
            googleObjective: "SALES",
            googleBidStrategy: "MAXIMIZE_CONVERSIONS",
            googleLandingPageUrl: "https://demo-brand.example.com",
            strategy: "full_funnel", strategyFocus: "conversion",
            phases: [
              {
                id: "gads-us-search", name: "Search - Brand", funnelStage: "conversion",
                googleCampaignType: "Search",
                googleBidStrategy: "TARGET_CPA", googleTargetCpa: 12,
                budgetPercentage: 35, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                googleSearchPartner: true,
                adSets: [
                  { id: "as-11", name: "Brand Keywords", budgetPercentage: 100, dimensionValue: "brand" },
                ],
              },
              {
                id: "gads-us-search-generic", name: "Search - Generic", funnelStage: "consideration",
                googleCampaignType: "Search",
                googleBidStrategy: "MAXIMIZE_CONVERSIONS",
                budgetPercentage: 30, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                adSets: [
                  { id: "as-12", name: "Non-Brand Keywords", budgetPercentage: 60, dimensionValue: "generic" },
                  { id: "as-12b", name: "Competitor Keywords", budgetPercentage: 40, dimensionValue: "competitor" },
                ],
                adSetSplitDimension: "audience",
              },
              {
                id: "gads-us-pmax", name: "Performance Max", funnelStage: "conversion",
                googleCampaignType: "Performance Max",
                googleBidStrategy: "TARGET_ROAS", googleTargetRoas: 400,
                budgetPercentage: 35, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                googleOptimizedTargeting: true,
                googleSearchThemes: ["online shopping", "fashion deals", "clothing store"],
                adSets: [{ id: "as-13", name: "PMax Asset Group", budgetPercentage: 100, dimensionValue: "pmax" }],
              },
            ],
          },
          {
            id: "google-uk", name: "United Kingdom", budgetPercentage: 35,
            adAccountId: "sample_gads_345678", accountName: "Sample Google Ads Account",
            countries: ["GB"],
            adFormats: ["Search ads", "Display ads"],
            googleObjective: "LEADS",
            googleBidStrategy: "MAXIMIZE_CONVERSIONS",
            strategy: "consideration", strategyFocus: "leads",
            phases: [
              {
                id: "gads-uk-search", name: "Search - UK", funnelStage: "consideration",
                googleCampaignType: "Search",
                googleBidStrategy: "MAXIMIZE_CLICKS",
                budgetPercentage: 60, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                adSets: [{ id: "as-14", name: "UK Keywords", budgetPercentage: 100, dimensionValue: "uk-kw" }],
              },
              {
                id: "gads-uk-display", name: "Display - UK", funnelStage: "awareness",
                googleCampaignType: "Display",
                googleBidStrategy: "TARGET_CPA", googleTargetCpa: 8,
                budgetPercentage: 40, budgetType: "daily",
                startDate: formatDate(startDate), endDate: formatDate(endDate),
                googleOptimizedTargeting: true,
                adSets: [{ id: "as-15", name: "In-Market Audiences UK", budgetPercentage: 100, dimensionValue: "in-market" }],
              },
            ],
          },
        ],
      },
    ];

    // Keywords for search campaigns
    const searchKeywords = [
      // Google - Brand
      { keyword: "demo brand", platform: "google", market: "United States", strategy: "brand", avgMonthlySearches: 14800, isNegative: false },
      { keyword: "demo brand shop", platform: "google", market: "United States", strategy: "brand", avgMonthlySearches: 6200, isNegative: false },
      { keyword: "demo brand clothing", platform: "google", market: "United States", strategy: "brand", avgMonthlySearches: 3100, isNegative: false },
      // Google - Generic
      { keyword: "online fashion store", platform: "google", market: "United States", strategy: "generic", avgMonthlySearches: 22100, isNegative: false },
      { keyword: "buy clothes online", platform: "google", market: "United States", strategy: "generic", avgMonthlySearches: 18500, isNegative: false },
      { keyword: "affordable fashion", platform: "google", market: "United States", strategy: "generic", avgMonthlySearches: 12400, isNegative: false },
      { keyword: "trendy outfits", platform: "google", market: "United States", strategy: "generic", avgMonthlySearches: 8900, isNegative: false },
      // Google - Competition
      { keyword: "competitor brand A", platform: "google", market: "United States", strategy: "competition", avgMonthlySearches: 33100, isNegative: false },
      { keyword: "competitor brand B alternative", platform: "google", market: "United States", strategy: "competition", avgMonthlySearches: 5400, isNegative: false },
      // Negative keywords
      { keyword: "free", platform: "google", market: "United States", strategy: "generic", avgMonthlySearches: 0, isNegative: true },
      { keyword: "jobs", platform: "google", market: "United States", strategy: "brand", avgMonthlySearches: 0, isNegative: true },
      // UK keywords
      { keyword: "demo brand uk", platform: "google", market: "United Kingdom", strategy: "brand", avgMonthlySearches: 4200, isNegative: false },
      { keyword: "buy fashion online uk", platform: "google", market: "United Kingdom", strategy: "generic", avgMonthlySearches: 9800, isNegative: false },
      // TikTok keywords
      { keyword: "fashion haul", platform: "tiktok", market: "United States", strategy: "generic", avgMonthlySearches: 45000, isNegative: false },
      { keyword: "outfit ideas", platform: "tiktok", market: "United States", strategy: "generic", avgMonthlySearches: 38000, isNegative: false },
      { keyword: "demo brand review", platform: "tiktok", market: "United States", strategy: "brand", avgMonthlySearches: 8200, isNegative: false },
    ];

    const forecastData = generateForecastData(75000, platforms);

    const genericConfig = {
      clientName: "Demo Brand Inc.",
      clientIndustry: "Fashion & Retail",
      searchKeywords: searchKeywords,
      selectedKeywords: searchKeywords.filter(k => !k.isNegative),
    };

    const campaignPayload = {
      user_id: userId,
      team_id: teamId,
      name: "🎓 [Demo] Q1 2026 Cross-Platform Campaign",
      total_budget: 75000,
      objective: "Multi-Objective",
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      platforms: platforms,
      budget_allocation: { meta: 50, tiktok: 30, google: 20 },
      market_splits: {
        "United States": 65,
        "United Kingdom": 20,
        "Germany": 15,
      },
      status: "live",
      forecast_data: forecastData,
      generic_config: genericConfig,
      is_sample: true,
      bo_number: "DEMO-2026-001",
    };

    const { data: campaign, error: campError } = await supabase
      .from("campaigns")
      .insert(campaignPayload)
      .select()
      .single();

    if (campError) throw campError;

    const campaignId = campaign.id;

    // ===== 3. Seed activity logs =====
    const activityLogs = generateActivityLogs(campaignId, userId, startDate);
    const { error: logError } = await supabase.from("activity_logs").insert(activityLogs);
    if (logError) console.error("Activity log error:", logError);

    // ===== 4. Seed change history =====
    const changeHistory = generateChangeHistory(campaignId, userId, startDate);
    const { error: chError } = await supabase.from("campaign_change_history").insert(changeHistory);
    if (chError) console.error("Change history error:", chError);

    // ===== 5. Seed performance data (2 months) =====
    const insightsData = generatePerformanceInsights(campaignId, startDate, now);
    for (const insight of insightsData) {
      const { error: insErr } = await supabase.from("campaign_insights").insert(insight);
      if (insErr) console.error("Insight insert error:", insErr);
    }

    // ===== 6. Seed launch status =====
    const launchStatuses = generateLaunchStatuses(campaignId, platforms);
    const { error: lsError } = await supabase.from("campaign_launch_status").insert(launchStatuses);
    if (lsError) console.error("Launch status error:", lsError);

    // ===== 7. Seed modification requests =====
    const modRequests = generateModificationRequests(campaignId, userId, startDate);
    const { error: modError } = await supabase.from("modification_requests").insert(modRequests);
    if (modError) console.error("Modification requests error:", modError);

    // ===== 8. Update tour state =====
    const { error: stateError } = await supabase.from("tour_data_state").upsert({
      user_id: userId,
      is_seeded: true,
      is_visible: true,
      seeded_campaign_id: campaignId,
      seeded_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (stateError) console.error("Tour state error:", stateError);

    return new Response(JSON.stringify({
      success: true,
      campaign_id: campaignId,
      seeded: {
        platforms: 3,
        markets: 5,
        phases: platforms.reduce((sum, p) => sum + p.markets.reduce((ms: number, m: any) => ms + (m.phases?.length || 0), 0), 0),
        activity_logs: activityLogs.length,
        change_history: changeHistory.length,
        insights: insightsData.length,
        launch_statuses: launchStatuses.length,
        modification_requests: modRequests.length,
        keywords: searchKeywords.length,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("Seed tour error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ===== HELPER FUNCTIONS =====

function generateForecastData(budget: number, platforms: any[]) {
  return {
    totalBudget: budget,
    estimatedReach: 4200000,
    estimatedImpressions: 18500000,
    estimatedClicks: 285000,
    estimatedConversions: 4200,
    estimatedCPM: 4.05,
    estimatedCPC: 0.26,
    estimatedCTR: 1.54,
    estimatedCPA: 17.86,
    estimatedROAS: 3.8,
    platforms: platforms.map((p: any) => ({
      platform: p.id,
      budget: budget * (p.budgetPercentage / 100),
      reach: Math.round(4200000 * (p.budgetPercentage / 100)),
      impressions: Math.round(18500000 * (p.budgetPercentage / 100)),
      clicks: Math.round(285000 * (p.budgetPercentage / 100)),
      conversions: Math.round(4200 * (p.budgetPercentage / 100)),
    })),
    generatedAt: new Date().toISOString(),
    isSampleData: true,
  };
}

function generateActivityLogs(campaignId: string, userId: string, startDate: Date) {
  const logs = [
    { offset: 0, title: "Campaign Created", action_type: "create", description: "Created cross-platform campaign with Meta, TikTok, and Google Ads" },
    { offset: 1, title: "Platforms Configured", action_type: "config", description: "Configured 3 platforms across 3 markets (US, UK, DE)" },
    { offset: 2, title: "Budget Allocated", action_type: "budget", description: "Distributed $75,000 budget: Meta 50%, TikTok 30%, Google 20%" },
    { offset: 3, title: "Audiences Defined", action_type: "targeting", description: "Set up 15 ad sets with broad, interest, lookalike, and retargeting audiences" },
    { offset: 4, title: "Keywords Selected", action_type: "targeting", description: "Added 16 search keywords across brand, generic, and competition strategies" },
    { offset: 5, title: "Forecast Generated", action_type: "forecast", description: "Generated cross-platform forecast: 4.2M reach, 285K clicks, 4.2K conversions" },
    { offset: 7, title: "Creatives Uploaded", action_type: "creative", description: "Uploaded 24 creative assets (12 video, 8 image, 4 carousel)" },
    { offset: 8, title: "Creative Mesh Completed", action_type: "creative_mesh", description: "Assigned creatives to all ad sets across platforms" },
    { offset: 10, title: "Campaign Pushed to DSP", action_type: "push", description: "Successfully pushed campaign shell to Meta, TikTok, and Google Ads" },
    { offset: 11, title: "QC Completed", action_type: "qc", description: "Quality check passed for all platforms" },
    { offset: 12, title: "Campaign Set Live", action_type: "status", description: "Campaign status changed to Live across all platforms" },
    { offset: 15, title: "Budget Optimization", action_type: "optimization", description: "Shifted 5% budget from awareness to conversion based on early performance" },
    { offset: 18, title: "Audience Insight", action_type: "optimization", description: "25-34 age group showing 40% higher CTR on Meta - increasing budget allocation" },
    { offset: 20, title: "Creative Refresh", action_type: "creative", description: "Swapped 3 underperforming creatives with new variants" },
    { offset: 22, title: "Google Ads Optimization", action_type: "optimization", description: "Paused low-performing generic keywords, added 5 new high-intent keywords" },
    { offset: 25, title: "Audience Expansion", action_type: "targeting", description: "Expanded lookalike audience from 1% to 2% on Meta US" },
    { offset: 28, title: "TikTok Performance Review", action_type: "review", description: "In-Feed ads outperforming TopView by 25% on CPA - reallocating budget" },
    { offset: 30, title: "Mid-Campaign Review", action_type: "review", description: "Performance on track: CPA $16.50 vs target $18.00, ROAS 4.1x" },
    { offset: 35, title: "Pacing Adjustment", action_type: "budget", description: "Increased daily budget by 10% to capture remaining reach opportunity" },
    { offset: 38, title: "Cross-Platform Analysis", action_type: "report", description: "Meta driving highest ROAS (4.5x), Google best for brand queries, TikTok best CPM" },
    { offset: 40, title: "Performance Report Sent", action_type: "report", description: "Shared weekly performance report with stakeholders" },
  ];

  return logs.map((log) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + log.offset);
    return {
      campaign_id: campaignId, user_id: userId,
      title: log.title, action_type: log.action_type,
      description: log.description, created_at: d.toISOString(),
      is_sample: true,
      estimated_hours: Math.round(Math.random() * 3 * 10) / 10 + 0.5,
      actual_hours: Math.round(Math.random() * 3 * 10) / 10 + 0.3,
      affected_platforms: ["Meta", "TikTok", "Google Ads"],
    };
  });
}

function generateChangeHistory(campaignId: string, userId: string, startDate: Date) {
  const changes = [
    { offset: 0, action: "Created campaign", change_type: "creation" },
    { offset: 2, action: "Updated budget allocation", change_type: "budget", description: "Changed Meta from 45% to 50%, reduced Google from 25% to 20%" },
    { offset: 3, action: "Added Germany market", change_type: "market", description: "Added Germany as TikTok market with 30% of TikTok budget" },
    { offset: 4, action: "Keywords configured", change_type: "targeting", description: "Added 16 search keywords for Google and TikTok search campaigns" },
    { offset: 5, action: "Added UK market", change_type: "market", description: "Added United Kingdom with 40% of Meta budget and 35% of Google budget" },
    { offset: 7, action: "Updated targeting", change_type: "targeting", description: "Added lookalike audiences and interest targeting to Meta US phases" },
    { offset: 10, action: "Published forecast", change_type: "forecast", description: "Published v2 forecast with updated CPM benchmarks" },
    { offset: 11, action: "Pushed to DSP", change_type: "push", description: "Campaign shell pushed to all 3 platforms" },
    { offset: 12, action: "Set Live", change_type: "status", description: "Campaign approved and set to Live" },
    { offset: 15, action: "Budget reallocation", change_type: "budget", description: "Moved $2,000 from awareness to conversion" },
    { offset: 22, action: "Keyword optimization", change_type: "targeting", description: "Paused 3 generic keywords, added 5 high-intent terms" },
    { offset: 25, action: "Creative swap", change_type: "creative", description: "Replaced 3 underperforming video creatives" },
    { offset: 35, action: "Phase date extended", change_type: "schedule", description: "Extended conversion phase by 5 days" },
  ];

  return changes.map((c) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + c.offset);
    return {
      campaign_id: campaignId, user_id: userId,
      action: c.action, change_type: c.change_type,
      description: c.description || null, created_at: d.toISOString(),
      is_sample: true,
    };
  });
}

function generateModificationRequests(campaignId: string, userId: string, startDate: Date) {
  const requests = [
    {
      offset: 14, title: "Increase Meta US conversion budget",
      description: "Performance data shows strong ROAS on conversion phase. Request to shift 5% from awareness to conversion.",
      priority: "high", status: "approved",
      affected_platforms: ["meta"], affected_markets: ["United States"],
    },
    {
      offset: 18, title: "Add new interest targeting on TikTok",
      description: "Recommend adding 'Sustainable Fashion' interest category based on trending content performance.",
      priority: "medium", status: "approved",
      affected_platforms: ["tiktok"], affected_markets: ["United States"],
    },
    {
      offset: 22, title: "Pause underperforming Google generic keywords",
      description: "3 generic keywords have CPA > $30 vs target $12. Recommend pausing and reallocating budget.",
      priority: "high", status: "approved",
      affected_platforms: ["google"], affected_markets: ["United States"],
    },
    {
      offset: 28, title: "Expand UK Display campaign",
      description: "UK Display showing efficient CPA of $6. Request 20% budget increase from Search.",
      priority: "medium", status: "pending",
      affected_platforms: ["google"], affected_markets: ["United Kingdom"],
    },
    {
      offset: 35, title: "Creative refresh for Meta awareness",
      description: "Awareness creatives showing fatigue (frequency > 3.5). Recommend new creative rotation.",
      priority: "high", status: "in_progress",
      affected_platforms: ["meta"], affected_markets: ["United States", "United Kingdom"],
    },
    {
      offset: 40, title: "Extend campaign end date",
      description: "Budget pacing is under by 8%. Recommend extending campaign by 5 days to fully utilize budget.",
      priority: "low", status: "pending",
      affected_platforms: ["meta", "tiktok", "google"], affected_markets: ["United States", "United Kingdom", "Germany"],
    },
  ];

  return requests.map((r) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + r.offset);
    return {
      campaign_id: campaignId, user_id: userId,
      title: r.title, description: r.description,
      priority: r.priority, status: r.status,
      affected_platforms: r.affected_platforms,
      affected_markets: r.affected_markets,
      created_at: d.toISOString(), is_sample: true,
    };
  });
}

function generatePerformanceInsights(campaignId: string, startDate: Date, now: Date) {
  const insights: any[] = [];
  const platformConfigs = [
    { platform: "meta", baseCpm: 4.2, baseCtr: 1.6, baseCvr: 1.5, budgetShare: 0.5 },
    { platform: "tiktok", baseCpm: 3.8, baseCtr: 1.3, baseCvr: 1.1, budgetShare: 0.3 },
    { platform: "google", baseCpm: 5.5, baseCtr: 2.8, baseCvr: 2.5, budgetShare: 0.2 },
  ];

  const totalDays = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const dailyBudget = 75000 / 60;

  for (const pc of platformConfigs) {
    const weeklyMetrics: any[] = [];
    let cumulativeSpend = 0, cumulativeImpressions = 0, cumulativeClicks = 0, cumulativeConversions = 0;
    let weekSpend = 0, weekImpressions = 0, weekClicks = 0, weekConversions = 0;

    for (let day = 0; day < totalDays; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + day);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const weekendMultiplier = isWeekend ? 0.75 : 1.1;
      const learningMultiplier = day < 7 ? 1.3 : 1.0;
      const optimizationImprovement = 1 - (day / totalDays) * 0.15;
      const variance = 0.85 + Math.random() * 0.3;

      const dayBudget = dailyBudget * pc.budgetShare * weekendMultiplier * variance;
      const cpm = pc.baseCpm * learningMultiplier * optimizationImprovement * (0.9 + Math.random() * 0.2);
      const impressions = Math.round((dayBudget / cpm) * 1000);
      const ctr = pc.baseCtr * (1 / learningMultiplier) * (1 + (day / totalDays) * 0.1) * (0.95 + Math.random() * 0.1);
      const clicks = Math.round(impressions * (ctr / 100));
      const cvr = pc.baseCvr * (1 / learningMultiplier) * (1 + (day / totalDays) * 0.2) * (0.9 + Math.random() * 0.2);
      const conversions = Math.round(clicks * (cvr / 100));

      cumulativeSpend += dayBudget;
      cumulativeImpressions += impressions;
      cumulativeClicks += clicks;
      cumulativeConversions += conversions;
      weekSpend += dayBudget; weekImpressions += impressions;
      weekClicks += clicks; weekConversions += conversions;

      if (dayOfWeek === 0 || day === totalDays - 1) {
        weeklyMetrics.push({
          week_start: new Date(date.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          week_end: date.toISOString().split("T")[0],
          spend: Math.round(weekSpend * 100) / 100,
          impressions: weekImpressions, clicks: weekClicks, conversions: weekConversions,
          cpm: Math.round((weekSpend / weekImpressions) * 1000 * 100) / 100,
          ctr: Math.round((weekClicks / weekImpressions) * 100 * 100) / 100,
          cpc: Math.round((weekSpend / weekClicks) * 100) / 100,
          cpa: weekConversions > 0 ? Math.round((weekSpend / weekConversions) * 100) / 100 : 0,
        });
        weekSpend = 0; weekImpressions = 0; weekClicks = 0; weekConversions = 0;
      }
    }

    insights.push({
      campaign_id: campaignId,
      platform: pc.platform,
      ad_account_id: pc.platform === "meta" ? "act_sample_123456" : pc.platform === "tiktok" ? "sample_tt_789012" : "sample_gads_345678",
      metrics: {
        spend: Math.round(cumulativeSpend * 100) / 100,
        impressions: cumulativeImpressions, clicks: cumulativeClicks,
        conversions: cumulativeConversions,
        reach: Math.round(cumulativeImpressions * 0.45),
        cpm: Math.round((cumulativeSpend / cumulativeImpressions) * 1000 * 100) / 100,
        ctr: Math.round((cumulativeClicks / cumulativeImpressions) * 100 * 100) / 100,
        cpc: Math.round((cumulativeSpend / cumulativeClicks) * 100) / 100,
        cpa: cumulativeConversions > 0 ? Math.round((cumulativeSpend / cumulativeConversions) * 100) / 100 : 0,
        roas: Math.round((cumulativeConversions * 45) / cumulativeSpend * 100) / 100,
        frequency: Math.round((cumulativeImpressions / (cumulativeImpressions * 0.45)) * 100) / 100,
        isSampleData: true,
      },
      weekly_metrics: weeklyMetrics,
      fetched_at: new Date().toISOString(),
      is_sample: true,
    });
  }

  return insights;
}

function generateLaunchStatuses(campaignId: string, platforms: any[]) {
  const statuses: any[] = [];

  for (const platform of platforms) {
    for (const market of platform.markets) {
      statuses.push({
        campaign_id: campaignId, platform: platform.id, market: market.name,
        entity_type: "campaign", entity_name: `${platform.name} - ${market.name}`,
        status: "pushed", dsp_status: "ACTIVE",
        dsp_entity_id: `sample_dsp_${platform.id}_${market.id}`,
        planned_budget: 75000 * (platform.budgetPercentage / 100) * ((market.budgetPercentage || 100) / 100),
        is_sample: true,
      });

      for (const phase of (market.phases || [])) {
        statuses.push({
          campaign_id: campaignId, platform: platform.id, market: market.name,
          entity_type: "adset", entity_name: phase.name, phase_name: phase.name,
          status: "pushed", dsp_status: "ACTIVE",
          dsp_entity_id: `sample_dsp_${phase.id}`,
          is_sample: true,
        });
      }
    }
  }

  return statuses;
}
