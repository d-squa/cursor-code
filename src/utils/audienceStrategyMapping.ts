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
  "OUTCOME_AWARENESS:REACH": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Maximum reach for brand exposure",
  },
  "OUTCOME_AWARENESS:AD_RECALL_LIFT": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Maximum reach for brand awareness",
  },
  "OUTCOME_AWARENESS:IMPRESSIONS": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Maximum impressions for awareness",
  },
  "OUTCOME_AWARENESS:THRUPLAY": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Broad video views for awareness",
  },
  "OUTCOME_AWARENESS": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Broad reach for awareness",
  },
  
  // Engagement objectives - Mixed strategy
  "OUTCOME_ENGAGEMENT:POST_ENGAGEMENT": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Engaged users + expansion",
  },
  "OUTCOME_ENGAGEMENT:THRUPLAY": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "New audiences for video content",
  },
  "OUTCOME_ENGAGEMENT:TWO_SECOND_CONTINUOUS_VIDEO_VIEWS": {
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
  "OUTCOME_TRAFFIC:LINK_CLICKS": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Mixed strategy for traffic",
  },
  "OUTCOME_TRAFFIC:LANDING_PAGE_VIEWS": {
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
  "OUTCOME_LEADS:LEADS": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Warm + similar audiences",
  },
  "OUTCOME_LEADS:OFFSITE_CONVERSIONS": {
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
  "OUTCOME_APP_PROMOTION:APP_INSTALLS": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "New user acquisition",
  },
  "OUTCOME_APP_PROMOTION:OFFSITE_CONVERSIONS": {
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
  "OUTCOME_SALES:OFFSITE_CONVERSIONS": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Full funnel approach",
  },
  "OUTCOME_SALES:VALUE": {
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
  "REACH:REACH": {
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
  "TRAFFIC:CLICK": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Quality traffic drive",
  },
  "TRAFFIC:LANDING_PAGE_VIEW": {
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
  "VIDEO_VIEWS:VIDEO_VIEW": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Broad video discovery",
  },
  "VIDEO_VIEWS:FOCUSED_VIEW": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "Engaged viewers",
  },
  "VIDEO_VIEWS": {
    useBroadTargeting: true,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: false,
    rationale: "Video reach strategy",
  },
  
  // Community interaction
  "COMMUNITY_INTERACTION:PROFILE_VISIT": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "Profile discovery",
  },
  "COMMUNITY_INTERACTION:FOLLOW": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "Follower growth",
  },
  "COMMUNITY_INTERACTION": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "Community engagement",
  },
  
  // Lead generation - Warm + similar
  "LEAD_GENERATION:LEAD": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Warm + similar audiences",
  },
  "LEAD_GENERATION:FORM": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Form submissions",
  },
  "LEAD_GENERATION:MESSAGING": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Message leads",
  },
  "LEAD_GENERATION": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Lead generation focus",
  },
  
  // App promotion
  "APP_PROMOTION:APP_INSTALL": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: false,
    showLookalikeAudiences: true,
    rationale: "New user acquisition",
  },
  "APP_PROMOTION:APP_EVENT": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: false,
    rationale: "Re-engage existing users",
  },
  "APP_PROMOTION:VALUE": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "App ROAS optimization",
  },
  "APP_PROMOTION": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "App growth strategy",
  },
  
  // Web conversions - Full funnel
  "CONVERSIONS:CONVERT": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Full funnel approach",
  },
  "CONVERSIONS:VALUE": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Value optimization",
  },
  "CONVERSIONS:CLICK": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Click-based conversions",
  },
  "CONVERSIONS": {
    useBroadTargeting: false,
    showInheritedTargeting: true,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Conversion focus",
  },
  
  // Product sales - Remarketing focus
  "PRODUCT_SALES:CONVERT": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Product remarketing",
  },
  "PRODUCT_SALES:VALUE": {
    useBroadTargeting: false,
    showInheritedTargeting: false,
    showRetargetingAudiences: true,
    showLookalikeAudiences: true,
    rationale: "Catalog value optimization",
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
