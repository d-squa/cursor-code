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

    // Get user from token
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const userId = user.id;

    // Check if already seeded
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

    // Get user's team
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
        user_id: userId,
        team_id: teamId,
        platform_type: "meta",
        platform_name: "Meta Business Suite",
        ad_account_id: "act_sample_123456",
        ad_account_name: "Sample Meta Ad Account",
        is_active: true,
        is_sample: true,
        metadata: { business_name: "Tour Demo Business" },
      },
      {
        user_id: userId,
        team_id: teamId,
        platform_type: "tiktok",
        platform_name: "TikTok Business Center",
        ad_account_id: "sample_tt_789012",
        ad_account_name: "Sample TikTok Ad Account",
        is_active: true,
        is_sample: true,
        metadata: { business_name: "Tour Demo Business" },
      },
      {
        user_id: userId,
        team_id: teamId,
        platform_type: "google",
        platform_name: "Google Ads",
        ad_account_id: "sample_gads_345678",
        ad_account_name: "Sample Google Ads Account",
        is_active: true,
        is_sample: true,
        metadata: { business_name: "Tour Demo Business" },
      },
    ];

    const { error: connError } = await supabase.from("connected_platforms").insert(platformConnections);
    if (connError) console.error("Platform insert error:", connError);

    // ===== 2. Seed sample ActiPlan =====
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 45); // started 45 days ago
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 15); // ends in 15 days

    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    const platforms = [
      {
        id: "meta",
        name: "Meta",
        enabled: true,
        budgetPercentage: 50,
        markets: [
          {
            id: "meta-us",
            name: "United States",
            budgetPercentage: 60,
            accountName: "act_sample_123456",
            page: "sample_page_123",
            pixel: "sample_pixel_456",
            countries: ["US"],
            ageMin: 18,
            ageMax: 65,
            adFormats: ["Video ads", "Image ads"],
            phases: [
              {
                id: "meta-us-awareness",
                name: "Awareness",
                objective: "OUTCOME_AWARENESS",
                optimizationGoal: "REACH",
                budgetPercentage: 40,
                buyType: "AUCTION",
                billingEvent: "IMPRESSIONS",
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                strategyFocus: "awareness",
                adSets: [
                  { id: "as-1", name: "Broad 18-45", budgetPercentage: 50, ageMin: 18, ageMax: 45 },
                  { id: "as-2", name: "Interest-Based 25-55", budgetPercentage: 50, ageMin: 25, ageMax: 55 },
                ],
              },
              {
                id: "meta-us-consideration",
                name: "Consideration",
                objective: "OUTCOME_TRAFFIC",
                optimizationGoal: "LINK_CLICKS",
                budgetPercentage: 35,
                buyType: "AUCTION",
                billingEvent: "IMPRESSIONS",
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                strategyFocus: "consideration",
                adSets: [
                  { id: "as-3", name: "Website Visitors", budgetPercentage: 60 },
                  { id: "as-4", name: "Lookalike 1%", budgetPercentage: 40 },
                ],
              },
              {
                id: "meta-us-conversion",
                name: "Conversion",
                objective: "OUTCOME_SALES",
                optimizationGoal: "OFFSITE_CONVERSIONS",
                budgetPercentage: 25,
                buyType: "AUCTION",
                billingEvent: "IMPRESSIONS",
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                strategyFocus: "conversion",
                adSets: [
                  { id: "as-5", name: "Retargeting 7d", budgetPercentage: 50 },
                  { id: "as-6", name: "Retargeting 30d", budgetPercentage: 50 },
                ],
              },
            ],
          },
          {
            id: "meta-uk",
            name: "United Kingdom",
            budgetPercentage: 40,
            accountName: "act_sample_123456",
            page: "sample_page_uk",
            pixel: "sample_pixel_uk",
            countries: ["GB"],
            ageMin: 18,
            ageMax: 55,
            adFormats: ["Video ads"],
            phases: [
              {
                id: "meta-uk-awareness",
                name: "Awareness",
                objective: "OUTCOME_AWARENESS",
                optimizationGoal: "REACH",
                budgetPercentage: 50,
                buyType: "AUCTION",
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                adSets: [{ id: "as-7", name: "Broad UK", budgetPercentage: 100 }],
              },
              {
                id: "meta-uk-conversion",
                name: "Conversion",
                objective: "OUTCOME_SALES",
                optimizationGoal: "OFFSITE_CONVERSIONS",
                budgetPercentage: 50,
                buyType: "AUCTION",
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                adSets: [{ id: "as-8", name: "Retargeting UK", budgetPercentage: 100 }],
              },
            ],
          },
        ],
      },
      {
        id: "tiktok",
        name: "TikTok",
        enabled: true,
        budgetPercentage: 30,
        markets: [
          {
            id: "tiktok-us",
            name: "United States",
            budgetPercentage: 100,
            accountName: "sample_tt_789012",
            pixel: "sample_tt_pixel",
            countries: ["US"],
            ageMin: 18,
            ageMax: 45,
            adFormats: ["In-Feed ads", "TopView ads"],
            phases: [
              {
                id: "tt-us-awareness",
                name: "Awareness",
                objective: "REACH",
                optimizationGoal: "REACH",
                budgetPercentage: 50,
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                adSets: [{ id: "as-9", name: "Gen Z & Millennials", budgetPercentage: 100 }],
              },
              {
                id: "tt-us-traffic",
                name: "Traffic",
                objective: "TRAFFIC",
                optimizationGoal: "CLICK",
                budgetPercentage: 50,
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                adSets: [{ id: "as-10", name: "Interest Targeting", budgetPercentage: 100 }],
              },
            ],
          },
        ],
      },
      {
        id: "google",
        name: "Google Ads",
        enabled: true,
        budgetPercentage: 20,
        markets: [
          {
            id: "google-us",
            name: "United States",
            budgetPercentage: 100,
            accountName: "sample_gads_345678",
            countries: ["US"],
            adFormats: ["Search ads", "Display ads"],
            phases: [
              {
                id: "gads-us-search",
                name: "Search",
                objective: "SEARCH",
                optimizationGoal: "CONVERSIONS",
                budgetPercentage: 60,
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                adSets: [
                  { id: "as-11", name: "Brand Keywords", budgetPercentage: 40 },
                  { id: "as-12", name: "Non-Brand Keywords", budgetPercentage: 60 },
                ],
              },
              {
                id: "gads-us-display",
                name: "Display",
                objective: "DISPLAY",
                optimizationGoal: "CLICKS",
                budgetPercentage: 40,
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                adSets: [{ id: "as-13", name: "In-Market Audiences", budgetPercentage: 100 }],
              },
            ],
          },
        ],
      },
    ];

    // Generate realistic forecast data
    const forecastData = generateForecastData(75000, platforms);

    const campaignPayload = {
      user_id: userId,
      team_id: teamId,
      name: "🎓 [Sample Tour] Q1 2026 Cross-Platform Campaign",
      total_budget: 75000,
      objective: "Multi-Objective",
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      platforms: platforms,
      budget_allocation: { meta: 50, tiktok: 30, google: 20 },
      market_splits: { "United States": 70, "United Kingdom": 30 },
      status: "qc_in_progress",
      forecast_data: forecastData,
      is_sample: true,
      bo_number: "TOUR-2026-001",
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

    // ===== 5. Seed performance data (2 months of realistic daily metrics) =====
    const insightsData = generatePerformanceInsights(campaignId, startDate, now);
    for (const insight of insightsData) {
      const { error: insErr } = await supabase.from("campaign_insights").insert(insight);
      if (insErr) console.error("Insight insert error:", insErr);
    }

    // ===== 6. Seed launch status =====
    const launchStatuses = generateLaunchStatuses(campaignId, platforms);
    const { error: lsError } = await supabase.from("campaign_launch_status").insert(launchStatuses);
    if (lsError) console.error("Launch status error:", lsError);

    // ===== 7. Update tour state =====
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
        activity_logs: activityLogs.length,
        change_history: changeHistory.length,
        insights: insightsData.length,
        launch_statuses: launchStatuses.length,
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
    { offset: 1, title: "Platforms Configured", action_type: "config", description: "Configured 3 platforms across 2 markets (US, UK)" },
    { offset: 2, title: "Budget Allocated", action_type: "budget", description: "Distributed $75,000 budget: Meta 50%, TikTok 30%, Google 20%" },
    { offset: 3, title: "Audiences Defined", action_type: "targeting", description: "Set up 13 ad sets with broad, interest, lookalike, and retargeting audiences" },
    { offset: 5, title: "Forecast Generated", action_type: "forecast", description: "Generated cross-platform forecast: 4.2M reach, 285K clicks, 4.2K conversions" },
    { offset: 7, title: "Creatives Uploaded", action_type: "creative", description: "Uploaded 24 creative assets (12 video, 8 image, 4 carousel)" },
    { offset: 8, title: "Creative Mesh Completed", action_type: "creative_mesh", description: "Assigned creatives to all ad sets across platforms" },
    { offset: 10, title: "Campaign Pushed to DSP", action_type: "push", description: "Successfully pushed campaign shell to Meta, TikTok, and Google Ads" },
    { offset: 12, title: "QC Started", action_type: "qc", description: "Quality check process initiated for all platforms" },
    { offset: 15, title: "Budget Optimization", action_type: "optimization", description: "Shifted 5% budget from awareness to conversion based on early performance" },
    { offset: 20, title: "Creative Refresh", action_type: "creative", description: "Swapped 3 underperforming creatives with new variants" },
    { offset: 25, title: "Audience Expansion", action_type: "targeting", description: "Expanded lookalike audience from 1% to 2% on Meta US" },
    { offset: 30, title: "Mid-Campaign Review", action_type: "review", description: "Performance on track: CPA $16.50 vs target $18.00, ROAS 4.1x" },
    { offset: 35, title: "Pacing Adjustment", action_type: "budget", description: "Increased daily budget by 10% to capture remaining reach opportunity" },
    { offset: 40, title: "Performance Report Sent", action_type: "report", description: "Shared weekly performance report with stakeholders" },
  ];

  return logs.map((log) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + log.offset);
    return {
      campaign_id: campaignId,
      user_id: userId,
      title: log.title,
      action_type: log.action_type,
      description: log.description,
      created_at: d.toISOString(),
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
    { offset: 5, action: "Added UK market", change_type: "market", description: "Added United Kingdom with 30% of Meta budget" },
    { offset: 7, action: "Updated targeting", change_type: "targeting", description: "Added lookalike audiences to Meta US consideration phase" },
    { offset: 10, action: "Published forecast", change_type: "forecast", description: "Published v2 forecast with updated CPM benchmarks" },
    { offset: 12, action: "Pushed to DSP", change_type: "push", description: "Campaign shell pushed to all 3 platforms" },
    { offset: 15, action: "Budget reallocation", change_type: "budget", description: "Moved $2,000 from awareness to conversion" },
    { offset: 25, action: "Creative swap", change_type: "creative", description: "Replaced 3 underperforming video creatives" },
    { offset: 35, action: "Phase date extended", change_type: "schedule", description: "Extended conversion phase by 5 days" },
  ];

  return changes.map((c) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + c.offset);
    return {
      campaign_id: campaignId,
      user_id: userId,
      action: c.action,
      change_type: c.change_type,
      description: c.description || null,
      created_at: d.toISOString(),
      is_sample: true,
    };
  });
}

function generatePerformanceInsights(campaignId: string, startDate: Date, now: Date) {
  const insights: any[] = [];
  const platformConfigs = [
    {
      platform: "meta",
      baseCpm: 4.2,
      baseCtr: 1.6,
      baseCvr: 1.5,
      budgetShare: 0.5,
    },
    {
      platform: "tiktok",
      baseCpm: 3.8,
      baseCtr: 1.3,
      baseCvr: 1.1,
      budgetShare: 0.3,
    },
    {
      platform: "google",
      baseCpm: 5.5,
      baseCtr: 2.8,
      baseCvr: 2.5,
      budgetShare: 0.2,
    },
  ];

  const totalDays = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const dailyBudget = 75000 / 60; // 60-day campaign

  for (const pc of platformConfigs) {
    const weeklyMetrics: any[] = [];
    let cumulativeSpend = 0;
    let cumulativeImpressions = 0;
    let cumulativeClicks = 0;
    let cumulativeConversions = 0;
    let weekSpend = 0;
    let weekImpressions = 0;
    let weekClicks = 0;
    let weekConversions = 0;

    for (let day = 0; day < totalDays; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + day);
      const dayOfWeek = date.getDay();

      // Realistic patterns
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const weekendMultiplier = isWeekend ? 0.75 : 1.1;

      // Gradual optimization improvement (learning phase first 7 days, then improve)
      const learningMultiplier = day < 7 ? 1.3 : 1.0;
      const optimizationImprovement = 1 - (day / totalDays) * 0.15; // 15% improvement over campaign

      // Random daily variance
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
      weekSpend += dayBudget;
      weekImpressions += impressions;
      weekClicks += clicks;
      weekConversions += conversions;

      // Weekly aggregation
      if (dayOfWeek === 0 || day === totalDays - 1) {
        weeklyMetrics.push({
          week_start: new Date(date.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          week_end: date.toISOString().split("T")[0],
          spend: Math.round(weekSpend * 100) / 100,
          impressions: weekImpressions,
          clicks: weekClicks,
          conversions: weekConversions,
          cpm: Math.round((weekSpend / weekImpressions) * 1000 * 100) / 100,
          ctr: Math.round((weekClicks / weekImpressions) * 100 * 100) / 100,
          cpc: Math.round((weekSpend / weekClicks) * 100) / 100,
          cpa: weekConversions > 0 ? Math.round((weekSpend / weekConversions) * 100) / 100 : 0,
        });
        weekSpend = 0;
        weekImpressions = 0;
        weekClicks = 0;
        weekConversions = 0;
      }
    }

    insights.push({
      campaign_id: campaignId,
      platform: pc.platform,
      ad_account_id: pc.platform === "meta" ? "act_sample_123456" : pc.platform === "tiktok" ? "sample_tt_789012" : "sample_gads_345678",
      metrics: {
        spend: Math.round(cumulativeSpend * 100) / 100,
        impressions: cumulativeImpressions,
        clicks: cumulativeClicks,
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
      // Platform level
      statuses.push({
        campaign_id: campaignId,
        platform: platform.id,
        market: market.name,
        entity_type: "campaign",
        entity_name: `${platform.name} - ${market.name}`,
        status: "pushed",
        dsp_status: "ACTIVE",
        dsp_entity_id: `sample_dsp_${platform.id}_${market.id}`,
        planned_budget: 75000 * (platform.budgetPercentage / 100) * ((market.budgetPercentage || 100) / 100),
        is_sample: true,
      });

      for (const phase of (market.phases || [])) {
        statuses.push({
          campaign_id: campaignId,
          platform: platform.id,
          market: market.name,
          entity_type: "adset",
          entity_name: phase.name,
          phase_name: phase.name,
          status: "pushed",
          dsp_status: "ACTIVE",
          dsp_entity_id: `sample_dsp_${phase.id}`,
          is_sample: true,
        });
      }
    }
  }

  return statuses;
}
