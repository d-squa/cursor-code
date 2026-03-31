/**
 * Maps Meta optimization goals to their KPIs, cost metrics, and rate calculations
 */

export interface OptimizationGoalMetrics {
  objective: string;
  destination: string;
  goalNameOnInterface: string;
  goal: string;
  kpi: string;
  costPerResultFormula: string;
  rateName: string;
  resultRateFormula: string;
}

export const OPTIMIZATION_GOAL_METRICS: OptimizationGoalMetrics[] = [
  // OUTCOME_TRAFFIC
  { objective: "OUTCOME_TRAFFIC", destination: "App", goalNameOnInterface: "Maximize number of Link Clicks", goal: "LINK_CLICKS", kpi: "CPLC-A", costPerResultFormula: "amountSpent/LINK_CLICKS", rateName: "LCTR", resultRateFormula: "LINK_CLICKS/impressions" },
  { objective: "OUTCOME_TRAFFIC", destination: "Calls", goalNameOnInterface: "Maximize number of calls", goal: "OUTBOUND_CALLS", kpi: "CPCALL", costPerResultFormula: "amountSpent/OUTBOUND_CALLS", rateName: "CALLTR", resultRateFormula: "OUTBOUND_CALLS/impressions" },
  { objective: "OUTCOME_TRAFFIC", destination: "Instagram Or Facebook", goalNameOnInterface: "Maximize number of Instagram profile visits", goal: "LINK_CLICKS", kpi: "CPPV", costPerResultFormula: "amountSpent/LINK_CLICKS", rateName: "PVTR", resultRateFormula: "LINK_CLICKS/impressions" },
  { objective: "OUTCOME_TRAFFIC", destination: "Messaging Apps", goalNameOnInterface: "Maximize Number Of Conversations", goal: "CONVERSATIONS", kpi: "CPCON-M", costPerResultFormula: "amountSpent/CONVERSATIONS", rateName: "CONTR", resultRateFormula: "CONVERSATIONS/impressions" },
  { objective: "OUTCOME_TRAFFIC", destination: "Website", goalNameOnInterface: "Maximize Number of Landing Page Views", goal: "LANDING_PAGE_VIEWS", kpi: "CPLV", costPerResultFormula: "amountSpent/LANDING_PAGE_VIEWS", rateName: "LPVTR", resultRateFormula: "LANDING_PAGE_VIEWS/impressions" },
  { objective: "OUTCOME_TRAFFIC", destination: "Website", goalNameOnInterface: "Maximize Number of Link Clicks", goal: "LINK_CLICKS", kpi: "CPLC-W", costPerResultFormula: "amountSpent/LINK_CLICKS", rateName: "LCTR", resultRateFormula: "LINK_CLICKS/impressions" },
  
  // OUTCOME_ENGAGEMENT
  { objective: "OUTCOME_ENGAGEMENT", destination: "App", goalNameOnInterface: "Maximize Number Of App Events", goal: "APP_EVENTS", kpi: "CPAE", costPerResultFormula: "amountSpent/APP_EVENTS", rateName: "AETR", resultRateFormula: "APP_EVENTS/impressions" },
  { objective: "OUTCOME_ENGAGEMENT", destination: "Calls", goalNameOnInterface: "Maximize number of calls", goal: "OUTBOUND_CALLS", kpi: "CPCALL", costPerResultFormula: "amountSpent/OUTBOUND_CALLS", rateName: "CALLTR", resultRateFormula: "OUTBOUND_CALLS/impressions" },
  { objective: "OUTCOME_ENGAGEMENT", destination: "Event Response", goalNameOnInterface: "Maximize Number Of Event Responses", goal: "EVENT_RESPONSES", kpi: "CPER", costPerResultFormula: "amountSpent/EVENT_RESPONSES", rateName: "ERTR", resultRateFormula: "EVENT_RESPONSES/impressions" },
  { objective: "OUTCOME_ENGAGEMENT", destination: "Facebook Page", goalNameOnInterface: "Maximize Number Of Follows or likes", goal: "FOLLOWS_OR_LIKES", kpi: "CPFL", costPerResultFormula: "amountSpent/FOLLOWS_OR_LIKES", rateName: "FLTR", resultRateFormula: "FOLLOWS_OR_LIKES/impressions" },
  { objective: "OUTCOME_ENGAGEMENT", destination: "Messaging Apps", goalNameOnInterface: "Maximize Number Of Conversations", goal: "CONVERSATIONS", kpi: "CPCON-M", costPerResultFormula: "amountSpent/CONVERSATIONS", rateName: "CONTR", resultRateFormula: "CONVERSATIONS/impressions" },
  { objective: "OUTCOME_ENGAGEMENT", destination: "Post Engagement", goalNameOnInterface: "Maximize Interactions", goal: "INTERACTIONS", kpi: "CPE-P", costPerResultFormula: "amountSpent/INTERACTIONS", rateName: "PETR", resultRateFormula: "INTERACTIONS/impressions" },
  // Legacy POST_ENGAGEMENT mapping for backward compatibility
  { objective: "OUTCOME_ENGAGEMENT", destination: "Post Engagement", goalNameOnInterface: "Maximize Engagement With A Post", goal: "POST_ENGAGEMENT", kpi: "CPE-P", costPerResultFormula: "amountSpent/POST_ENGAGEMENT", rateName: "PETR", resultRateFormula: "POST_ENGAGEMENT/impressions" },
  { objective: "OUTCOME_ENGAGEMENT", destination: "Video Views", goalNameOnInterface: "Maximize Thruplay Views", goal: "THRUPLAY", kpi: "CPV", costPerResultFormula: "amountSpent/THRUPLAY", rateName: "TTR", resultRateFormula: "THRUPLAY/impressions" },
  { objective: "OUTCOME_ENGAGEMENT", destination: "Video Views", goalNameOnInterface: "Maximize 2-second Continuous Video Plays", goal: "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", kpi: "CPV2SC", costPerResultFormula: "amountSpent/TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", rateName: "2SCTR", resultRateFormula: "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS/impressions" },
  { objective: "OUTCOME_ENGAGEMENT", destination: "Website", goalNameOnInterface: "Maximize Number Of Conversions", goal: "OFFSITE_CONVERSIONS", kpi: "CPOC-W", costPerResultFormula: "amountSpent/OFFSITE_CONVERSIONS", rateName: "OCR", resultRateFormula: "OFFSITE_CONVERSIONS/impressions" },
  
  // OUTCOME_LEADS
  { objective: "OUTCOME_LEADS", destination: "App", goalNameOnInterface: "Maximize Number Of App Events", goal: "APP_EVENTS", kpi: "CPAE", costPerResultFormula: "amountSpent/APP_EVENTS", rateName: "AETR", resultRateFormula: "APP_EVENTS/impressions" },
  { objective: "OUTCOME_LEADS", destination: "Calls", goalNameOnInterface: "Maximize number of calls", goal: "OUTBOUND_CALLS", kpi: "CPCALL", costPerResultFormula: "amountSpent/OUTBOUND_CALLS", rateName: "CALLTR", resultRateFormula: "OUTBOUND_CALLS/impressions" },
  { objective: "OUTCOME_LEADS", destination: "Instagram", goalNameOnInterface: "Maximize Number Of Leads", goal: "LEADS", kpi: "CPL-IG", costPerResultFormula: "amountSpent/LEADS", rateName: "LTR", resultRateFormula: "LEADS/impressions" },
  { objective: "OUTCOME_LEADS", destination: "Instant Forms", goalNameOnInterface: "Maximize Number Of Leads", goal: "LEADS", kpi: "CPL-IF", costPerResultFormula: "amountSpent/LEADS", rateName: "LTR", resultRateFormula: "LEADS/impressions" },
  { objective: "OUTCOME_LEADS", destination: "Instant Forms & Messenger", goalNameOnInterface: "Maximize Number Of Leads", goal: "LEADS", kpi: "CPL-IFM", costPerResultFormula: "amountSpent/LEADS", rateName: "LTR", resultRateFormula: "LEADS/impressions" },
  { objective: "OUTCOME_LEADS", destination: "Messenger", goalNameOnInterface: "Maximize Number Of Leads", goal: "LEADS", kpi: "CPL-M", costPerResultFormula: "amountSpent/LEADS", rateName: "LTR", resultRateFormula: "LEADS/impressions" },
  { objective: "OUTCOME_LEADS", destination: "Website", goalNameOnInterface: "Maximize Number Of Conversions", goal: "OFFSITE_CONVERSIONS", kpi: "CPCON-W", costPerResultFormula: "amountSpent/OFFSITE_CONVERSIONS", rateName: "OCTR", resultRateFormula: "(OFFSITE_CONVERSIONS/impressions)*100" },
  { objective: "OUTCOME_LEADS", destination: "Website", goalNameOnInterface: "Maximize Value of Conversions", goal: "VALUE", kpi: "ROAS-W", costPerResultFormula: "(VALUE/amountSpent)*100", rateName: "ABV", resultRateFormula: "VALUE/websitePurchase" },
  { objective: "OUTCOME_LEADS", destination: "Whatsapp", goalNameOnInterface: "Maximize Number Of Conversations", goal: "CONVERSATIONS", kpi: "CPL-WA", costPerResultFormula: "amountSpent/CONVERSATIONS", rateName: "CONTR", resultRateFormula: "CONVERSATIONS/impressions" },
  
  // OUTCOME_APP_PROMOTION
  { objective: "OUTCOME_APP_PROMOTION", destination: "App", goalNameOnInterface: "Maximize Number Of App Events", goal: "APP_EVENTS", kpi: "CPAE", costPerResultFormula: "amountSpent/APP_EVENTS", rateName: "AETR", resultRateFormula: "APP_EVENTS/impressions" },
  { objective: "OUTCOME_APP_PROMOTION", destination: "App", goalNameOnInterface: "Maximize Number Of App Installs", goal: "APP_INSTALLS", kpi: "CPI", costPerResultFormula: "amountSpent/APP_INSTALLS", rateName: "AITR", resultRateFormula: "APP_INSTALLS/impressions" },
  { objective: "OUTCOME_APP_PROMOTION", destination: "App", goalNameOnInterface: "Maximize Value of Conversions", goal: "VALUE", kpi: "ROAS-A", costPerResultFormula: "(VALUE/amountSpent)*100", rateName: "ABV", resultRateFormula: "VALUE/websitePurchase" },
  
  // OUTCOME_SALES
  { objective: "OUTCOME_SALES", destination: "App", goalNameOnInterface: "Maximize Number Of App Events", goal: "APP_EVENTS", kpi: "CPAE", costPerResultFormula: "amountSpent/APP_EVENTS", rateName: "AETR", resultRateFormula: "APP_EVENTS/impressions" },
  { objective: "OUTCOME_SALES", destination: "Calls", goalNameOnInterface: "Maximize number of calls", goal: "OUTBOUND_CALLS", kpi: "CPCALL", costPerResultFormula: "amountSpent/OUTBOUND_CALLS", rateName: "CALLTR", resultRateFormula: "OUTBOUND_CALLS/impressions" },
  { objective: "OUTCOME_SALES", destination: "Messaging Apps", goalNameOnInterface: "Maximize Number Of Conversations", goal: "CONVERSATIONS", kpi: "CPCON-M", costPerResultFormula: "amountSpent/CONVERSATIONS", rateName: "CONTR", resultRateFormula: "CONVERSATIONS/impressions" },
  { objective: "OUTCOME_SALES", destination: "Website", goalNameOnInterface: "Maximize Number of Conversions", goal: "OFFSITE_CONVERSIONS", kpi: "CPOC-W", costPerResultFormula: "amountSpent/OFFSITE_CONVERSIONS", rateName: "OCTR", resultRateFormula: "(OFFSITE_CONVERSIONS/impressions)*100" },
  { objective: "OUTCOME_SALES", destination: "Website", goalNameOnInterface: "Maximize Value of Conversions", goal: "VALUE", kpi: "ROAS-W", costPerResultFormula: "(VALUE/amountSpent)*100", rateName: "ABV", resultRateFormula: "VALUE/websitePurchase" },
  { objective: "OUTCOME_SALES", destination: "Website & App", goalNameOnInterface: "Maximize Number of Conversions", goal: "OFFSITE_CONVERSIONS", kpi: "CPOC-A", costPerResultFormula: "amountSpent/OFFSITE_CONVERSIONS", rateName: "OCTR", resultRateFormula: "(OFFSITE_CONVERSIONS/impressions)*100" },
  { objective: "OUTCOME_SALES", destination: "Website & App", goalNameOnInterface: "Maximize Value of Conversions", goal: "VALUE", kpi: "ROAS", costPerResultFormula: "(VALUE/amountSpent)*100", rateName: "ABV", resultRateFormula: "VALUE/websitePurchase" },
  
  // OUTCOME_AWARENESS
  { objective: "OUTCOME_AWARENESS", destination: "On Your Ad", goalNameOnInterface: "Maximize reach of ads", goal: "REACH", kpi: "CPR", costPerResultFormula: "amountSpent/(REACH/1000)", rateName: "RTR", resultRateFormula: "(REACH/impressions)*100" },
  { objective: "OUTCOME_AWARENESS", destination: "On Your Ad", goalNameOnInterface: "Maximize Number of impressions", goal: "IMPRESSIONS", kpi: "CPM", costPerResultFormula: "amountSpent/(IMPRESSIONS/1000)", rateName: "ITR", resultRateFormula: "(REACH/impressions)*100" },
  { objective: "OUTCOME_AWARENESS", destination: "On Your Ad", goalNameOnInterface: "Maximize Ad Recall Lift", goal: "AD_RECALL_LIFT", kpi: "CPARL", costPerResultFormula: "amountSpent/AD_RECALL_LIFT", rateName: "ADTR", resultRateFormula: "AD_RECALL_LIFT/impressions" },
  { objective: "OUTCOME_AWARENESS", destination: "On Your Ad", goalNameOnInterface: "Maximize Thruplay Views", goal: "THRUPLAY", kpi: "CPV", costPerResultFormula: "amountSpent/THRUPLAY", rateName: "TTR", resultRateFormula: "THRUPLAY/impressions" },
  { objective: "OUTCOME_AWARENESS", destination: "On Your Ad", goalNameOnInterface: "Maximize 2-second Continuous Video Plays", goal: "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", kpi: "CPV-2SC", costPerResultFormula: "amountSpent/TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", rateName: "2SCTR", resultRateFormula: "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS/impressions" },
];

/**
 * Get the metrics configuration for a specific optimization goal
 */
export function getOptimizationGoalMetrics(
  objective: string,
  optimizationGoal: string,
  destination?: string
): OptimizationGoalMetrics | undefined {
  // First try exact match with destination
  if (destination) {
    const exactMatch = OPTIMIZATION_GOAL_METRICS.find(
      m => m.objective === objective && m.goal === optimizationGoal && m.destination === destination
    );
    if (exactMatch) return exactMatch;
  }
  
  // Fallback to objective + goal match
  return OPTIMIZATION_GOAL_METRICS.find(
    m => m.objective === objective && m.goal === optimizationGoal
  );
}

/**
 * Get human-readable result label from goal
 */
export function getResultLabel(goal: string): string {
  const labels: Record<string, string> = {
    LINK_CLICKS: "Link Clicks",
    APP_EVENTS: "App Events",
    APP_INSTALLS: "App Installs",
    VALUE: "Conversion Value",
    OUTBOUND_CALLS: "Calls",
    EVENT_RESPONSES: "Event Responses",
    FOLLOWS_OR_LIKES: "Follows/Likes",
    LEADS: "Leads",
    CONVERSATIONS: "Conversations",
    LANDING_PAGE_VIEWS: "Landing Page Views",
    OFFSITE_CONVERSIONS: "Conversions",
    REACH: "Reach",
    IMPRESSIONS: "Impressions",
    AD_RECALL_LIFT: "Ad Recall Lift",
    THRUPLAY: "ThruPlay Views",
    TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "2-Second Video Views",
    POST_ENGAGEMENT: "Interactions",
    INTERACTIONS: "Interactions",
  };
  
  return labels[goal] || goal;
}

/**
 * Calculate result value based on impressions and default benchmarks
 */
export function calculateResultFromImpressions(
  impressions: number,
  budget: number,
  goal: string
): number {
  // Realistic benchmark rates (result / impressions) per optimization goal.
  // These are conservative global averages — the cost hierarchy MUST hold:
  //   Impressions > Reach > Video Views > Clicks > LPV > Engaged Sessions > Leads > Conversions > Value
  // i.e., upper-funnel goals yield MORE results per impression (cheaper CPR),
  //        lower-funnel goals yield FEWER results (more expensive CPR).
  const benchmarkRates: Record<string, number> = {
    // Upper funnel — high volume, low CPR
    IMPRESSIONS: 1.0,           // 100%
    REACH: 0.70,                // 70% of impressions
    AD_RECALL_LIFT: 0.04,       // 4%
    TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: 0.20, // 20%
    THRUPLAY: 0.08,             // 8%
    VIDEO_VIEW: 0.10,           // 10%
    FOCUSED_VIEW: 0.06,         // 6%
    POST_ENGAGEMENT: 0.025,     // 2.5%

    // Mid funnel — moderate volume
    LINK_CLICKS: 0.008,         // 0.8% CTR
    CLICK: 0.008,               // 0.8% (TikTok equivalent)
    LANDING_PAGE_VIEWS: 0.006,  // 0.6% LPVR
    LANDING_PAGE_VIEW: 0.006,   // 0.6% (TikTok equivalent)
    ENGAGED_SESSION: 0.004,     // 0.4%
    FOLLOWS_OR_LIKES: 0.003,    // 0.3%
    PROFILE_VISIT: 0.005,       // 0.5%
    FOLLOW: 0.002,              // 0.2%

    // Lower funnel — low volume, high CPR
    CONVERSATIONS: 0.002,       // 0.2%
    LEADS: 0.0015,              // 0.15%
    LEAD: 0.0015,               // 0.15% (TikTok)
    FORM: 0.0015,               // 0.15% (TikTok)
    LEAD_GENERATION: 0.0015,    // 0.15%
    APP_INSTALLS: 0.002,        // 0.2%
    APP_INSTALL: 0.002,         // 0.2% (TikTok)
    APP_EVENTS: 0.001,          // 0.1%
    APP_EVENT: 0.001,           // 0.1% (TikTok)

    // Bottom funnel — very low volume, highest CPR
    OFFSITE_CONVERSIONS: 0.0008, // 0.08% conversion rate
    CONVERT: 0.0008,             // 0.08% (TikTok)
    CONVERSION: 0.0008,          // 0.08% (TikTok)
    VALUE: 0.0005,               // 0.05% (ROAS optimization, fewer but higher-value conversions)

    // Calls
    OUTBOUND_CALLS: 0.001,       // 0.1%
    PHONE_CALL: 0.001,           // 0.1% (TikTok)
    MESSAGING: 0.002,            // 0.2% (TikTok)
    EVENT_RESPONSES: 0.002,      // 0.2%
  };

  const rate = benchmarkRates[goal] || benchmarkRates[goal.toUpperCase()] || 0.005;
  return Math.max(1, Math.round(impressions * rate));
}
