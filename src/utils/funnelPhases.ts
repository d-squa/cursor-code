import { getObjectiveFromPhaseName } from './phaseObjectiveMapping';

// Funnel phase mapping based on Strategy Focus
export interface PhaseTemplate {
  name: string;
  description: string;
}

export interface FunnelTemplate {
  phases: PhaseTemplate[];
  description: string;
}

export const funnelTemplates: Record<string, FunnelTemplate> = {
  "Awareness": {
    phases: [
      { name: "Reach", description: "Initial exposure" },
      { name: "Consideration", description: "Product consideration" },
      { name: "Preference", description: "Brand preference" },
    ],
    description: "Focused on building visibility and mental availability for the brand. Builds consistent exposure and credibility.",
  },
  "Market Presence": {
    phases: [
      { name: "Visibility", description: "Brand visibility" },
      { name: "Authority", description: "Industry authority" },
      { name: "Engagement", description: "Audience engagement" },
      { name: "Trust", description: "Trust building" },
    ],
    description: "Builds consistent exposure and credibility to strengthen brand equity. Encourages discovery.",
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
    description: "The classic AIDA funnel, focused on moving users from awareness to buying and retention.",
  },
  "Actions": {
    phases: [
      { name: "Awareness", description: "Brand exposure" },
      { name: "Engagement", description: "Active engagement" },
      { name: "Conversion", description: "Action conversion" },
    ],
    description: "Generalized funnel emphasizing stimulating and sustaining user actions. Performance-oriented.",
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
 * Generates default phases based on strategy focus and platform
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
    
    // Auto-determine objective and optimization goal based on phase name and platform
    const { objective, optimizationGoal } = getObjectiveFromPhaseName(phase.name, strategyFocus, platform);
    
    return {
      id: `phase-${index}-${Date.now()}`,
      name: phase.name,
      startDate: phaseStart.toISOString().split('T')[0],
      endDate: phaseEnd.toISOString().split('T')[0],
      budgetPercentage: budgetPerPhase,
      objective,
      optimizationGoal,
    };
  });
};

/**
 * Generates phases for auto-detect strategy based on platform/market configuration
 */
export const generateAutoDetectPhases = (
  adFormats: string[],
  hasPixel: boolean,
  hasCatalog: boolean,
  startDate: string,
  endDate: string,
  platform: string = "meta"
) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  
  // Determine which template to use based on ad formats and pixel/catalog
  let strategyFocus = "Conversions"; // default
  
  const formatString = adFormats.join(" ").toLowerCase();
  
  if (formatString.includes("lead") || formatString.includes("instant form")) {
    strategyFocus = "Leads";
  } else if (formatString.includes("dynamic") || formatString.includes("catalog") || formatString.includes("shopping") || hasCatalog) {
    strategyFocus = "Purchases";
  } else if (formatString.includes("app")) {
    strategyFocus = "In-App Actions";
  } else if (formatString.includes("video views") || formatString.includes("brand awareness")) {
    strategyFocus = "Awareness";
  } else if (hasPixel) {
    strategyFocus = "Conversions";
  }
  
  return getDefaultPhases(strategyFocus, startDate, endDate, platform);
};
