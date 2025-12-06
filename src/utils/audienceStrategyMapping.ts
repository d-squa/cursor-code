/**
 * Maps objectives and optimization goals to audience type configurations
 * Determines which audience controls should be visible and their default states
 */

export interface AudienceStrategyConfig {
  useBroadTargeting: boolean;
  showInheritedTargeting: boolean;
  showRetargetingAudiences: boolean;
  showLookalikeAudiences: boolean;
  rationale: string;
}

interface ObjectiveGoalKey {
  objective: string;
  optimizationGoal?: string;
}

// Meta Audience Strategy Matrix
const META_AUDIENCE_STRATEGY: Record<string, AudienceStrategyConfig> = {
  // Awareness objectives - Broad targeting
  "OUTCOME_AWARENESS:Reach": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Maximum reach for brand exposure",
  },
  "OUTCOME_AWARENESS:Brand Awareness": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Maximum reach for brand awareness",
  },
  "OUTCOME_AWARENESS": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Broad reach for awareness",
  },
  
  // Engagement objectives - Mixed strategy
  "OUTCOME_ENGAGEMENT:Post Engagement": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Engaged users + expansion",
  },
  "OUTCOME_ENGAGEMENT:Video Views": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "New audiences for content",
  },
  "OUTCOME_ENGAGEMENT:ThruPlay": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "Quality video viewers",
  },
  "OUTCOME_ENGAGEMENT": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Engaged users + growth",
  },
  
  // Traffic objectives - Mixed strategy
  "OUTCOME_TRAFFIC:Link Clicks": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Mixed strategy for traffic",
  },
  "OUTCOME_TRAFFIC:Landing Page Views": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Quality traffic needs targeting",
  },
  "OUTCOME_TRAFFIC": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Traffic with targeting",
  },
  
  // Lead generation - Warm + lookalike
  "OUTCOME_LEADS:Lead Generation": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Warm + similar audiences",
  },
  "OUTCOME_LEADS:Conversions": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Intent-focused targeting",
  },
  "OUTCOME_LEADS": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Lead generation focus",
  },
  
  // App promotion - Depends on goal
  "OUTCOME_APP_PROMOTION:App Installs": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "New user acquisition",
  },
  "OUTCOME_APP_PROMOTION:App Events": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: false,
    rationale: "Re-engage existing users",
  },
  "OUTCOME_APP_PROMOTION": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "App growth strategy",
  },
  
  // Sales objectives - Full funnel
  "OUTCOME_SALES:Conversions": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Full funnel approach",
  },
  "OUTCOME_SALES:Catalog Sales": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Product remarketing focus",
  },
  "OUTCOME_SALES:Value": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "High-value customers",
  },
  "OUTCOME_SALES": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Sales conversion focus",
  },
};

// TikTok Audience Strategy Matrix
const TIKTOK_AUDIENCE_STRATEGY: Record<string, AudienceStrategyConfig> = {
  // Reach objective - Broad
  "REACH:Reach": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Maximum reach",
  },
  "REACH": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Broad audience reach",
  },
  
  // Traffic objective - Mixed
  "TRAFFIC:Click": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Quality traffic drive",
  },
  "TRAFFIC:Landing Page View": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Quality visitors",
  },
  "TRAFFIC": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Traffic with targeting",
  },
  
  // Video views - Broad for discovery
  "VIDEO_VIEWS:Video View": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Broad video discovery",
  },
  "VIDEO_VIEWS:6s Video View": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "Engaged viewers",
  },
  "VIDEO_VIEWS:15s Video View": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "High-engagement viewers",
  },
  "VIDEO_VIEWS:Focused View": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "Focused attention",
  },
  "VIDEO_VIEWS": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Video reach strategy",
  },
  
  // Lead generation - Warm + similar
  "LEAD_GENERATION:Lead": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Warm + similar audiences",
  },
  "LEAD_GENERATION": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Lead generation focus",
  },
  
  // App promotion
  "APP_PROMOTION:App Install": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "New user acquisition",
  },
  "APP_PROMOTION:App Event": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: false,
    rationale: "Re-engage existing users",
  },
  "APP_PROMOTION": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "App growth strategy",
  },
  
  // Web conversions - Full funnel
  "WEB_CONVERSIONS:Conversion": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Full funnel approach",
  },
  "WEB_CONVERSIONS:Web Conversion": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Full funnel approach",
  },
  "WEB_CONVERSIONS": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Conversion optimization",
  },
  "CONVERSIONS:Conversion": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Full funnel approach",
  },
  "CONVERSIONS": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Conversion focus",
  },
  
  // Product sales - Remarketing focus
  "PRODUCT_SALES:Product Sales": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Product remarketing",
  },
  "PRODUCT_SALES": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Sales focus",
  },
};

// Default fallback configuration
const DEFAULT_STRATEGY: AudienceStrategyConfig = {
  useBroadTargeting: false,
  showInheritedTargeting: true,
  showRetargetingAudiences: true,
  showLookalikeAudiences: true,
  rationale: "Mixed targeting strategy",
};

/**
 * Get audience strategy configuration based on platform, objective, and optimization goal
 */
export function getAudienceStrategyConfig(
  platform: string,
  objective?: string,
  optimizationGoal?: string
): AudienceStrategyConfig {
  if (!objective) {
    return DEFAULT_STRATEGY;
  }

  const isTikTok = platform.toLowerCase().includes('tiktok');
  const strategyMap = isTikTok ? TIKTOK_AUDIENCE_STRATEGY : META_AUDIENCE_STRATEGY;

  // Try exact match first (objective:optimizationGoal)
  if (optimizationGoal) {
    const exactKey = `${objective}:${optimizationGoal}`;
    if (strategyMap[exactKey]) {
      return strategyMap[exactKey];
    }
  }

  // Try objective-only match
  if (strategyMap[objective]) {
    return strategyMap[objective];
  }

  // Return default
  return DEFAULT_STRATEGY;
}

/**
 * Get a human-readable label for the audience strategy
 */
export function getAudienceStrategyLabel(config: AudienceStrategyConfig): string {
  if (config.useBroadTargeting) {
    return "Broad";
  }
  
  const parts: string[] = [];
  if (config.showInheritedTargeting) parts.push("Native");
  if (config.showRetargetingAudiences) parts.push("Retarget");
  if (config.showLookalikeAudiences) parts.push("Expand");
  
  if (parts.length === 0) return "Custom";
  if (parts.length === 1) return parts[0];
  return "Mixed";
}
