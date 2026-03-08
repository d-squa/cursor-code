/**
 * Maps funnel phase names to platform-specific objectives and optimization goals
 * Values align with objectiveOptimizationMapping.ts for dropdown compatibility
 */

export interface PhaseObjectiveMapping {
  objective: string;
  optimizationGoal: string;
  destination: string;
}

/**
 * Determines the objective and optimization goal based on phase name, strategy focus, and platform
 */
export function getObjectiveFromPhaseName(
  phaseName: string,
  strategyFocus?: string,
  platform: string = "meta"
): PhaseObjectiveMapping {
  const platformLower = platform.toLowerCase();
  
  // Route to platform-specific mapping
  if (platformLower === "tiktok") {
    return getTikTokObjectiveFromPhaseName(phaseName, strategyFocus);
  }
  
  if (platformLower === "google" || platformLower === "google_ads") {
    return getGoogleAdsObjectiveFromPhaseName(phaseName, strategyFocus);
  }

  if (platformLower === "snapchat") {
    return getSnapchatObjectiveFromPhaseName(phaseName, strategyFocus);
  }
  
  // Default to Meta mapping
  return getMetaObjectiveFromPhaseName(phaseName, strategyFocus);
}

/**
 * Meta-specific objective mapping
 * Uses API-style values that match objectiveOptimizationMapping.ts
 */
function getMetaObjectiveFromPhaseName(
  phaseName: string,
  strategyFocus?: string
): PhaseObjectiveMapping {
  const normalizedPhase = phaseName.toLowerCase();
  
  // Awareness/Reach phases
  if (normalizedPhase.includes("awareness") || normalizedPhase.includes("reach") || normalizedPhase.includes("visibility")) {
    return {
      objective: "OUTCOME_AWARENESS",
      optimizationGoal: "REACH",
      destination: "On Your Ad"
    };
  }
  
  // Video/Engagement phases
  if (normalizedPhase.includes("engagement") || normalizedPhase.includes("authority") || normalizedPhase.includes("trust")) {
    return {
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "POST_ENGAGEMENT",
      destination: "Post Engagement"
    };
  }
  
  // Consideration phases
  if (normalizedPhase.includes("consideration") || normalizedPhase.includes("interest") || normalizedPhase.includes("preference")) {
    return {
      objective: "OUTCOME_TRAFFIC",
      optimizationGoal: "LANDING_PAGE_VIEWS",
      destination: "Website"
    };
  }
  
  // Lead-focused phases
  if (normalizedPhase.includes("capture") || normalizedPhase.includes("nurture") || strategyFocus === "Leads") {
    if (normalizedPhase.includes("capture")) {
      return {
        objective: "OUTCOME_LEADS",
        optimizationGoal: "LEAD_GENERATION",
        destination: "Instant Forms"
      };
    }
    return {
      objective: "OUTCOME_LEADS",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      destination: "Website"
    };
  }
  
  // Conversion/Purchase phases
  if (normalizedPhase.includes("conversion") || normalizedPhase.includes("purchase") || normalizedPhase.includes("intent")) {
    return {
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      destination: "Website"
    };
  }
  
  // Loyalty/Retention phases
  if (normalizedPhase.includes("loyalty") || normalizedPhase.includes("retention") || normalizedPhase.includes("expansion")) {
    return {
      objective: "OUTCOME_SALES",
      optimizationGoal: "VALUE",
      destination: "Website"
    };
  }
  
  // App-specific phases
  if (normalizedPhase.includes("acquisition") || normalizedPhase.includes("onboarding") || normalizedPhase.includes("activation")) {
    return {
      objective: "OUTCOME_APP_PROMOTION",
      optimizationGoal: "APP_INSTALLS",
      destination: "App"
    };
  }
  
  // Default to traffic
  return {
    objective: "OUTCOME_TRAFFIC",
    optimizationGoal: "LINK_CLICKS",
    destination: "Website"
  };
}

/**
 * TikTok-specific objective mapping
 * Uses API-style values that match objectiveOptimizationMapping.ts
 */
function getTikTokObjectiveFromPhaseName(
  phaseName: string,
  strategyFocus?: string
): PhaseObjectiveMapping {
  const normalizedPhase = phaseName.toLowerCase();
  
  // Awareness/Reach phases
  if (normalizedPhase.includes("awareness") || normalizedPhase.includes("reach") || normalizedPhase.includes("visibility")) {
    return {
      objective: "REACH",
      optimizationGoal: "REACH",
      destination: "On Your Ad"
    };
  }
  
  // Video/Engagement phases
  if (normalizedPhase.includes("engagement") || normalizedPhase.includes("authority") || normalizedPhase.includes("trust")) {
    return {
      objective: "COMMUNITY_INTERACTION",
      optimizationGoal: "PROFILE_VISIT",
      destination: "TikTok Profile"
    };
  }
  
  // Consideration/Traffic phases
  if (normalizedPhase.includes("consideration") || normalizedPhase.includes("interest") || normalizedPhase.includes("preference")) {
    return {
      objective: "TRAFFIC",
      optimizationGoal: "LANDING_PAGE_VIEW",
      destination: "Website"
    };
  }
  
  // Lead-focused phases
  if (normalizedPhase.includes("capture") || normalizedPhase.includes("nurture") || strategyFocus === "Leads") {
    return {
      objective: "LEAD_GENERATION",
      optimizationGoal: "FORM",
      destination: "Instant Form"
    };
  }
  
  // Conversion/Purchase phases
  if (normalizedPhase.includes("conversion") || normalizedPhase.includes("purchase") || normalizedPhase.includes("intent")) {
    return {
      objective: "CONVERSIONS",
      optimizationGoal: "CONVERT",
      destination: "Website"
    };
  }
  
  // Loyalty/Retention phases
  if (normalizedPhase.includes("loyalty") || normalizedPhase.includes("retention") || normalizedPhase.includes("expansion")) {
    return {
      objective: "CONVERSIONS",
      optimizationGoal: "VALUE",
      destination: "Website"
    };
  }
  
  // App-specific phases
  if (normalizedPhase.includes("acquisition") || normalizedPhase.includes("onboarding") || normalizedPhase.includes("activation")) {
    return {
      objective: "APP_PROMOTION",
      optimizationGoal: "APP_INSTALL",
      destination: "App"
    };
  }
  
  // Default to traffic
  return {
    objective: "TRAFFIC",
    optimizationGoal: "CLICK",
    destination: "Website"
  };
}

/**
 * Google Ads-specific objective mapping
 * Maps funnel phases to Google Ads campaign types and bidding strategies
 */
function getGoogleAdsObjectiveFromPhaseName(
  phaseName: string,
  strategyFocus?: string
): PhaseObjectiveMapping {
  const normalizedPhase = phaseName.toLowerCase();
  
  // Awareness/Reach phases → Display/Video awareness
  if (normalizedPhase.includes("awareness") || normalizedPhase.includes("reach") || normalizedPhase.includes("visibility")) {
    return {
      objective: "AWARENESS",
      optimizationGoal: "TARGET_CPM",
      destination: "Display/YouTube"
    };
  }
  
  // Video/Engagement phases → YouTube video campaigns
  if (normalizedPhase.includes("engagement") || normalizedPhase.includes("authority") || normalizedPhase.includes("trust")) {
    return {
      objective: "CONSIDERATION",
      optimizationGoal: "TARGET_CPV",
      destination: "YouTube"
    };
  }
  
  // Consideration/Traffic phases → Search/Demand Gen
  if (normalizedPhase.includes("consideration") || normalizedPhase.includes("interest") || normalizedPhase.includes("preference")) {
    return {
      objective: "WEBSITE_TRAFFIC",
      optimizationGoal: "MAXIMIZE_CLICKS",
      destination: "Search/Demand Gen"
    };
  }
  
  // Lead-focused phases → PMax/Search leads
  if (normalizedPhase.includes("capture") || normalizedPhase.includes("nurture") || strategyFocus === "Leads") {
    return {
      objective: "LEADS",
      optimizationGoal: "MAXIMIZE_CONVERSIONS",
      destination: "Search/PMax"
    };
  }
  
  // Conversion/Purchase phases → PMax/Search sales
  if (normalizedPhase.includes("conversion") || normalizedPhase.includes("purchase") || normalizedPhase.includes("intent")) {
    return {
      objective: "SALES",
      optimizationGoal: "MAXIMIZE_CONVERSIONS",
      destination: "PMax/Search"
    };
  }
  
  // Loyalty/Retention phases → PMax with ROAS
  if (normalizedPhase.includes("loyalty") || normalizedPhase.includes("retention") || normalizedPhase.includes("expansion")) {
    return {
      objective: "SALES",
      optimizationGoal: "TARGET_ROAS",
      destination: "PMax"
    };
  }
  
  // App-specific phases → App campaigns (UAC)
  if (normalizedPhase.includes("acquisition") || normalizedPhase.includes("onboarding") || normalizedPhase.includes("activation")) {
    return {
      objective: "APP_PROMOTION",
      optimizationGoal: "MAXIMIZE_CONVERSIONS",
      destination: "App Campaigns"
    };
  }
  
  // Default to website traffic
  return {
    objective: "WEBSITE_TRAFFIC",
    optimizationGoal: "MAXIMIZE_CLICKS",
    destination: "Search"
  };
}

/**
 * Get display label for strategy
 */
export function getStrategyLabel(strategy: string, strategyFocus?: string): string {
  if (strategy === "custom") {
    return "Custom Strategy";
  }
  if (strategy === "auto-detect") {
    return strategyFocus ? `Auto-Detected (${strategyFocus})` : "Auto-Detected";
  }
  return strategyFocus || strategy;
}
