import { getObjectiveFromPhaseName } from './phaseObjectiveMapping';
import { getAudienceStrategyConfig } from './audienceStrategyMapping';
import { getStrategyById, generatePhasesFromStrategy, getStrategyGroupsForPlatform } from './strategyMatrix';
import type { StrategyDefinition } from './strategyMatrix';

// Funnel phase mapping based on Strategy Focus (legacy support)
export interface PhaseTemplate {
  name: string;
  description: string;
}

export interface FunnelTemplate {
  phases: PhaseTemplate[];
  description: string;
}

// Legacy funnel templates kept for backward compatibility with auto-detect mode
export const funnelTemplates: Record<string, FunnelTemplate> = {
  "Awareness": {
    phases: [
      { name: "Reach", description: "Initial exposure" },
      { name: "Consideration", description: "Product consideration" },
      { name: "Preference", description: "Brand preference" },
    ],
    description: "Focused on building visibility and mental availability for the brand.",
  },
  "Market Presence": {
    phases: [
      { name: "Visibility", description: "Brand visibility" },
      { name: "Authority", description: "Industry authority" },
      { name: "Engagement", description: "Audience engagement" },
      { name: "Trust", description: "Trust building" },
    ],
    description: "Builds consistent exposure and credibility to strengthen brand equity.",
  },
  "In-App Actions": {
    phases: [
      { name: "Acquisition", description: "User acquisition" },
      { name: "Onboarding", description: "User onboarding" },
      { name: "Engagement", description: "In-app engagement" },
      { name: "Retention", description: "User retention" },
    ],
    description: "Encourages discovery, in-app activity, and long-term user retention.",
  },
  "Purchases": {
    phases: [
      { name: "Awareness", description: "Product awareness" },
      { name: "Consideration", description: "Product interest" },
      { name: "Conversion", description: "Purchase action" },
      { name: "Loyalty", description: "Customer loyalty" },
    ],
    description: "The classic AIDA funnel, focused on moving users from awareness to buying.",
  },
  "Actions": {
    phases: [
      { name: "Awareness", description: "Brand exposure" },
      { name: "Engagement", description: "Active engagement" },
      { name: "Conversion", description: "Action conversion" },
    ],
    description: "Generalized funnel emphasizing stimulating and sustaining user actions.",
  },
  "Conversions": {
    phases: [
      { name: "Interest", description: "Generate interest" },
      { name: "Intent", description: "Build intent" },
      { name: "Conversion", description: "Drive conversion" },
    ],
    description: "Performance-oriented funnel focused on stimulating intent and maximizing conversions.",
  },
  "Leads": {
    phases: [
      { name: "Awareness", description: "Lead awareness" },
      { name: "Interest", description: "Lead interest" },
      { name: "Capture", description: "Lead submission" },
      { name: "Nurture", description: "Lead nurturing" },
    ],
    description: "Built for trust and qualification before lead capture, followed by post-lead nurturing.",
  },
  "Revenue": {
    phases: [
      { name: "Acquisition", description: "Customer acquisition" },
      { name: "Activation", description: "Customer activation" },
      { name: "Expansion", description: "Revenue expansion" },
      { name: "Retention", description: "Customer retention" },
    ],
    description: "Focused on customer lifecycle value: gaining users, driving repeat sales, and upselling.",
  },
};

/**
 * Generates phases from the NEW strategy matrix (preferred path)
 */
export const generatePhasesFromStrategyId = (
  strategyId: string,
  startDate: string,
  endDate: string
) => {
  const strategy = getStrategyById(strategyId);
  if (!strategy) return [];
  return generatePhasesFromStrategy(strategy, startDate, endDate);
};

/**
 * Generates default phases based on strategy focus and platform (legacy path)
 */
export const getDefaultPhases = (
  strategyFocus: string, 
  startDate: string, 
  endDate: string,
  platform: string = "meta"
) => {
  const template = funnelTemplates[strategyFocus];
  if (!template) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const phaseCount = template.phases.length;
  const daysPerPhase = Math.floor(totalDays / phaseCount);
  const budgetPerPhase = Math.round(100 / phaseCount);
  
  return template.phases.map((phase, index) => {
    const phaseStart = new Date(start);
    phaseStart.setDate(phaseStart.getDate() + (daysPerPhase * index));
    
    const phaseEnd = index === phaseCount - 1 
      ? new Date(end) 
      : new Date(phaseStart.getTime() + (daysPerPhase * 1000 * 60 * 60 * 24));
    
    const { objective, optimizationGoal } = getObjectiveFromPhaseName(phase.name, strategyFocus, platform);
    const audienceStrategy = getAudienceStrategyConfig(platform, objective, optimizationGoal);
    
    return {
      id: `phase-${index}-${Date.now()}`,
      name: phase.name,
      startDate: phaseStart.toISOString().split('T')[0],
      endDate: phaseEnd.toISOString().split('T')[0],
      budgetPercentage: budgetPerPhase,
      objective,
      optimizationGoal,
      useBroadTargeting: audienceStrategy.useBroadTargeting,
      overrideTargeting: audienceStrategy.useBroadTargeting ? false : undefined,
    };
  });
};

/**
 * Maps auto-detect signals to the best strategy from the strategy matrix.
 * Returns the Base variant of the matched strategy.
 */
function getAutoDetectStrategyId(
  adFormats: string[],
  hasPixel: boolean,
  hasCatalog: boolean,
  platform: string,
  hasKeywords: boolean = false
): string {
  const p = platform.toLowerCase();
  const normalizedPlatform = p.includes("tiktok") ? "tiktok" : p.includes("google") ? "google" : "meta";
  const formatString = adFormats.join(" ").toLowerCase();

  // ── Google Ads ──
  if (normalizedPlatform === "google") {
    if (formatString.includes("app")) return "google-app-growth-base";
    if (formatString.includes("shopping") || formatString.includes("product") || hasCatalog) return "google-shopping-base";
    if (formatString.includes("video") || formatString.includes("in-stream") || formatString.includes("shorts") || formatString.includes("bumper")) return "google-video-awareness-base";
    if (formatString.includes("demand gen") || formatString.includes("carousel") || formatString.includes("single image")) return "google-demand-gen-base";
    if (formatString.includes("asset group") || formatString.includes("performance max")) return "google-pmax-full-funnel-base";
    // Keywords present → must include Search
    if (hasKeywords || formatString.includes("search") || formatString.includes("responsive search")) return "google-search-conversions-base";
    // Default: PMax full funnel (includes a Search phase)
    return "google-pmax-full-funnel-base";
  }

  if (normalizedPlatform === "tiktok") {
    if (formatString.includes("lead") || formatString.includes("instant form")) {
      return "tiktok-lead-engine-base";
    }
    if (formatString.includes("app")) {
      return "tiktok-app-growth-base";
    }
    if (formatString.includes("video views") || formatString.includes("brand awareness") || formatString.includes("reach")) {
      return "tiktok-awareness-base";
    }
    return "tiktok-revenue-accelerator-base";
  }

  // Meta strategies
  if (formatString.includes("lead") || formatString.includes("instant form")) {
    return "meta-qualified-lead-base";
  }
  if (formatString.includes("app")) {
    return "meta-app-growth-base";
  }
  if (formatString.includes("video views") || formatString.includes("brand awareness") || formatString.includes("reach")) {
    return "meta-awareness-visibility-base";
  }
  if (formatString.includes("dynamic") || formatString.includes("catalog") || formatString.includes("shopping") || hasCatalog) {
    return "meta-revenue-acceleration-base";
  }
  if (formatString.includes("message") || formatString.includes("conversation") || formatString.includes("whatsapp")) {
    return "meta-conversation-base";
  }
  if (hasPixel) {
    return "meta-performance-domination-base";
  }
  return "meta-revenue-acceleration-base";
}

/**
 * Generates phases for auto-detect strategy using the strategy matrix
 */
export const generateAutoDetectPhases = (
  adFormats: string[],
  hasPixel: boolean,
  hasCatalog: boolean,
  startDate: string,
  endDate: string,
  platform: string = "meta"
) => {
  const strategyId = getAutoDetectStrategyId(adFormats, hasPixel, hasCatalog, platform);
  const strategy = getStrategyById(strategyId);
  
  if (!strategy) {
    // Fallback to legacy path if strategy not found
    return getDefaultPhases("Conversions", startDate, endDate, platform);
  }
  
  return generatePhasesFromStrategy(strategy, startDate, endDate);
};
