/**
 * Maps funnel phase names to Meta objectives and optimization goals
 */

export interface PhaseObjectiveMapping {
  objective: string;
  optimizationGoal: string;
  destination: string;
}

/**
 * Determines the objective and optimization goal based on phase name and strategy focus
 */
export function getObjectiveFromPhaseName(
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
