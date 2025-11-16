/**
 * Audience Recommendation Matrix
 * Maps platform phases to audience types and strategies
 */

export type AudiencePhase = "Awareness" | "Consideration" | "Conversion";
export type AudienceStrategy = "Retarget" | "Expand" | "Acquire";
export type AudienceType = "Custom Audience" | "Lookalike Audience" | "New Audience" | "Saved Audience";

export interface AudienceMatrixEntry {
  platform: string;
  phase: AudiencePhase;
  source: string;
  features?: string;
  type: AudienceType;
  strategy: AudienceStrategy;
  description?: string;
}

export const AUDIENCE_MATRIX: AudienceMatrixEntry[] = [
  // Conversion Phase - Retargeting
  {
    platform: "Meta",
    phase: "Conversion",
    source: "App Activity",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users who engaged with your app"
  },
  {
    platform: "Meta",
    phase: "Conversion",
    source: "Catalog",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users who viewed products in your catalog"
  },
  {
    platform: "Meta",
    phase: "Conversion",
    source: "Customer List",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target your existing customers"
  },
  {
    platform: "Meta",
    phase: "Conversion",
    source: "Website",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target website visitors who showed purchase intent"
  },
  {
    platform: "Meta",
    phase: "Conversion",
    source: "Offline Activity",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users based on offline interactions"
  },
  
  // Consideration Phase - Engagement Retargeting
  {
    platform: "Meta",
    phase: "Consideration",
    source: "Events",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users who attended or engaged with your events"
  },
  {
    platform: "Meta",
    phase: "Consideration",
    source: "Facebook Page",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users who engaged with your Facebook Page"
  },
  {
    platform: "Meta",
    phase: "Consideration",
    source: "Instagram Account",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users who engaged with your Instagram Account"
  },
  {
    platform: "Meta",
    phase: "Consideration",
    source: "Instant Experience",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users who interacted with instant experiences"
  },
  {
    platform: "Meta",
    phase: "Consideration",
    source: "Lead Form",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users who filled out lead forms"
  },
  {
    platform: "Meta",
    phase: "Consideration",
    source: "On-Facebook Listings",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users who engaged with your Facebook listings"
  },
  {
    platform: "Meta",
    phase: "Consideration",
    source: "Shopping",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users who engaged with shopping features"
  },
  {
    platform: "Meta",
    phase: "Consideration",
    source: "Video",
    type: "Custom Audience",
    strategy: "Retarget",
    description: "Target users who watched your videos"
  },
  {
    platform: "Meta",
    phase: "Consideration",
    source: "Lookalikes",
    type: "Lookalike Audience",
    strategy: "Expand",
    description: "Find new users similar to your best audiences"
  },
  
  // Awareness Phase - New Audience Expansion
  {
    platform: "Meta",
    phase: "Awareness",
    source: "Native Audience",
    features: "Location",
    type: "New Audience",
    strategy: "Expand",
    description: "Target users by geographic location"
  },
  {
    platform: "Meta",
    phase: "Awareness",
    source: "Native Audience",
    features: "Age",
    type: "New Audience",
    strategy: "Expand",
    description: "Target users by age range"
  },
  {
    platform: "Meta",
    phase: "Awareness",
    source: "Native Audience",
    features: "Gender",
    type: "New Audience",
    strategy: "Expand",
    description: "Target users by gender"
  },
  {
    platform: "Meta",
    phase: "Awareness",
    source: "Native Audience",
    features: "Demographics",
    type: "New Audience",
    strategy: "Expand",
    description: "Target users by demographic characteristics"
  },
  {
    platform: "Meta",
    phase: "Awareness",
    source: "Native Audience",
    features: "Interests",
    type: "New Audience",
    strategy: "Expand",
    description: "Target users based on their interests"
  },
  {
    platform: "Meta",
    phase: "Awareness",
    source: "Native Audience",
    features: "Behaviors",
    type: "New Audience",
    strategy: "Expand",
    description: "Target users based on purchase behaviors and intent"
  },
  {
    platform: "Meta",
    phase: "Awareness",
    source: "Native Audience",
    features: "Language",
    type: "New Audience",
    strategy: "Expand",
    description: "Target users by language preference"
  },
  {
    platform: "Meta",
    phase: "Awareness",
    source: "Native Audience",
    features: "Audience Expansion",
    type: "New Audience",
    strategy: "Expand",
    description: "Let Meta find additional qualified users automatically"
  },
  {
    platform: "Meta",
    phase: "Awareness",
    source: "Saved Audience",
    type: "Saved Audience",
    strategy: "Expand",
    description: "Use pre-configured saved audiences"
  },
];

/**
 * Strategy focus to phase mapping
 */
export const STRATEGY_FOCUS_PHASES: Record<string, AudiencePhase[]> = {
  "purchase": ["Conversion", "Consideration", "Awareness"],
  "leads": ["Conversion", "Consideration", "Awareness"],
  "app-installs": ["Conversion", "Consideration", "Awareness"],
  "conversions": ["Conversion", "Consideration", "Awareness"],
  "brand-awareness": ["Awareness", "Consideration"],
};

/**
 * Get phases for a strategy focus
 */
export function getPhasesForStrategyFocus(focus: string): AudiencePhase[] {
  return STRATEGY_FOCUS_PHASES[focus] || ["Awareness", "Consideration", "Conversion"];
}

/**
 * Get matrix entries for a specific phase
 */
export function getEntriesForPhase(phase: AudiencePhase, platform: string = "Meta"): AudienceMatrixEntry[] {
  return AUDIENCE_MATRIX.filter(entry => entry.phase === phase && entry.platform === platform);
}

/**
 * Get matrix entries by strategy
 */
export function getEntriesByStrategy(strategy: AudienceStrategy, platform: string = "Meta"): AudienceMatrixEntry[] {
  return AUDIENCE_MATRIX.filter(entry => entry.strategy === strategy && entry.platform === platform);
}

/**
 * Get matrix entries by type
 */
export function getEntriesByType(type: AudienceType, platform: string = "Meta"): AudienceMatrixEntry[] {
  return AUDIENCE_MATRIX.filter(entry => entry.type === type && entry.platform === platform);
}
