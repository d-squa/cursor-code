/**
 * Maps funnel phase names to platform-specific objectives and optimization goals
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
  
  // Default to Meta mapping
  return getMetaObjectiveFromPhaseName(phaseName, strategyFocus);
}

/**
 * Meta-specific objective mapping
 */
function getMetaObjectiveFromPhaseName(
  phaseName: string,
  strategyFocus?: string
): PhaseObjectiveMapping {
  const normalizedPhase = phaseName.toLowerCase();
  
  // Awareness/Reach phases
  if (normalizedPhase.includes("awareness") || normalizedPhase.includes("reach") || normalizedPhase.includes("visibility")) {
    return {
      objective: "Brand Awareness",
      optimizationGoal: "Reach",
      destination: "On Your Ad"
    };
  }
  
  // Video/Engagement phases
  if (normalizedPhase.includes("engagement") || normalizedPhase.includes("authority") || normalizedPhase.includes("trust")) {
    return {
      objective: "Engagement",
      optimizationGoal: "Post Engagement",
      destination: "Post Engagement"
    };
  }
  
  // Consideration phases
  if (normalizedPhase.includes("consideration") || normalizedPhase.includes("interest") || normalizedPhase.includes("preference")) {
    return {
      objective: "Traffic",
      optimizationGoal: "Landing Page Views",
      destination: "Website"
    };
  }
  
  // Lead-focused phases
  if (normalizedPhase.includes("capture") || normalizedPhase.includes("nurture") || strategyFocus === "Leads") {
    if (normalizedPhase.includes("capture")) {
      return {
        objective: "Lead Generation",
        optimizationGoal: "Leads",
        destination: "Instant Forms"
      };
    }
    return {
      objective: "Lead Generation",
      optimizationGoal: "Conversions",
      destination: "Website"
    };
  }
  
  // Conversion/Purchase phases
  if (normalizedPhase.includes("conversion") || normalizedPhase.includes("purchase") || normalizedPhase.includes("intent")) {
    return {
      objective: "Conversions",
      optimizationGoal: "Conversions",
      destination: "Website"
    };
  }
  
  // Loyalty/Retention phases
  if (normalizedPhase.includes("loyalty") || normalizedPhase.includes("retention") || normalizedPhase.includes("expansion")) {
    return {
      objective: "Conversions",
      optimizationGoal: "Value",
      destination: "Website"
    };
  }
  
  // App-specific phases
  if (normalizedPhase.includes("acquisition") || normalizedPhase.includes("onboarding") || normalizedPhase.includes("activation")) {
    return {
      objective: "App Installs",
      optimizationGoal: "App Installs",
      destination: "App"
    };
  }
  
  // Default to traffic
  return {
    objective: "Traffic",
    optimizationGoal: "Link Clicks",
    destination: "Website"
  };
}

/**
 * TikTok-specific objective mapping
 */
function getTikTokObjectiveFromPhaseName(
  phaseName: string,
  strategyFocus?: string
): PhaseObjectiveMapping {
  const normalizedPhase = phaseName.toLowerCase();
  
  // Awareness/Reach phases
  if (normalizedPhase.includes("awareness") || normalizedPhase.includes("reach") || normalizedPhase.includes("visibility")) {
    return {
      objective: "Reach",
      optimizationGoal: "Reach",
      destination: "On Your Ad"
    };
  }
  
  // Video/Engagement phases
  if (normalizedPhase.includes("engagement") || normalizedPhase.includes("authority") || normalizedPhase.includes("trust")) {
    return {
      objective: "Community Interaction",
      optimizationGoal: "Engagement",
      destination: "TikTok Profile"
    };
  }
  
  // Consideration/Traffic phases
  if (normalizedPhase.includes("consideration") || normalizedPhase.includes("interest") || normalizedPhase.includes("preference")) {
    return {
      objective: "Traffic",
      optimizationGoal: "Landing Page View",
      destination: "Website"
    };
  }
  
  // Lead-focused phases
  if (normalizedPhase.includes("capture") || normalizedPhase.includes("nurture") || strategyFocus === "Leads") {
    return {
      objective: "Lead Generation",
      optimizationGoal: "Lead Generation",
      destination: "Instant Form"
    };
  }
  
  // Conversion/Purchase phases
  if (normalizedPhase.includes("conversion") || normalizedPhase.includes("purchase") || normalizedPhase.includes("intent")) {
    return {
      objective: "Sales",
      optimizationGoal: "Web Conversion",
      destination: "Website"
    };
  }
  
  // Loyalty/Retention phases
  if (normalizedPhase.includes("loyalty") || normalizedPhase.includes("retention") || normalizedPhase.includes("expansion")) {
    return {
      objective: "Sales",
      optimizationGoal: "Value Optimization",
      destination: "Website"
    };
  }
  
  // App-specific phases
  if (normalizedPhase.includes("acquisition") || normalizedPhase.includes("onboarding") || normalizedPhase.includes("activation")) {
    return {
      objective: "App Promotion",
      optimizationGoal: "App Install",
      destination: "App"
    };
  }
  
  // Default to traffic
  return {
    objective: "Traffic",
    optimizationGoal: "Click",
    destination: "Website"
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
