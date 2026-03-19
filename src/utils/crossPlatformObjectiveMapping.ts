/**
 * Cross-Platform Objective Translation
 * Maps objectives and optimization goals between platforms intelligently
 * by matching on funnel intent rather than literal API values.
 */

import {
  META_OBJECTIVE_MAPPING,
  TIKTOK_OBJECTIVE_MAPPING,
  GOOGLE_ADS_OBJECTIVE_MAPPING,
  SNAPCHAT_OBJECTIVE_MAPPING,
  type ObjectiveMapping,
  type OptimizationGoalOption,
} from "./objectiveOptimizationMapping";

// ── Intent categories that unify objectives across platforms ──────────────

type FunnelIntent =
  | "reach"
  | "video_views"
  | "engagement"
  | "traffic"
  | "leads"
  | "app_promotion"
  | "conversions"
  | "product_sales";

// ── Per-platform objective → intent mapping ──────────────────────────────

const META_INTENT_MAP: Record<string, FunnelIntent> = {
  OUTCOME_AWARENESS: "reach",
  OUTCOME_ENGAGEMENT: "engagement",
  OUTCOME_TRAFFIC: "traffic",
  OUTCOME_LEADS: "leads",
  OUTCOME_APP_PROMOTION: "app_promotion",
  OUTCOME_SALES: "conversions",
};

const TIKTOK_INTENT_MAP: Record<string, FunnelIntent> = {
  REACH: "reach",
  VIDEO_VIEWS: "video_views",
  COMMUNITY_INTERACTION: "engagement",
  TRAFFIC: "traffic",
  LEAD_GENERATION: "leads",
  APP_PROMOTION: "app_promotion",
  CONVERSIONS: "conversions",
  PRODUCT_SALES: "product_sales",
};

const GOOGLE_INTENT_MAP: Record<string, FunnelIntent> = {
  AWARENESS_DISPLAY: "reach",
  AWARENESS_VIDEO_EFFICIENT_REACH: "reach",
  AWARENESS_VIDEO_NON_SKIPPABLE: "reach",
  AWARENESS_VIDEO_TARGET_FREQUENCY: "reach",
  AWARENESS_AD_SEQUENCE: "reach",
  AWARENESS_VIDEO_VIEWS: "video_views",
  AWARENESS_AUDIO_REACH: "reach",
  CONSIDERATION_DEMAND_GEN: "traffic",
  CONVERSION_SEARCH: "conversions",
  CONSIDERATION_PMAX: "conversions",
  CONSIDERATION_APP_INSTALLS: "app_promotion",
  CONSIDERATION_APP_ENGAGEMENT: "app_promotion",
  CONSIDERATION_APP_PRE_REGISTRATION: "app_promotion",
  CONVERSION_SHOPPING: "product_sales",
};

const SNAPCHAT_INTENT_MAP: Record<string, FunnelIntent> = {
  AWARENESS: "reach",
  VIDEO_VIEWS: "video_views",
  TRAFFIC: "traffic",
  ENGAGEMENT: "engagement",
  APP_INSTALLS: "app_promotion",
  LEAD_GENERATION: "leads",
  CONVERSIONS: "conversions",
  CATALOG_SALES: "product_sales",
};

// ── Intent → preferred target objective per platform ─────────────────────

const INTENT_TO_META: Record<FunnelIntent, { objective: string; goalHint?: string }> = {
  reach:          { objective: "OUTCOME_AWARENESS", goalHint: "REACH" },
  video_views:    { objective: "OUTCOME_ENGAGEMENT", goalHint: "THRUPLAY" },
  engagement:     { objective: "OUTCOME_ENGAGEMENT", goalHint: "POST_ENGAGEMENT" },
  traffic:        { objective: "OUTCOME_TRAFFIC", goalHint: "LANDING_PAGE_VIEWS" },
  leads:          { objective: "OUTCOME_LEADS", goalHint: "LEAD_GENERATION" },
  app_promotion:  { objective: "OUTCOME_APP_PROMOTION", goalHint: "APP_INSTALLS" },
  conversions:    { objective: "OUTCOME_SALES", goalHint: "OFFSITE_CONVERSIONS" },
  product_sales:  { objective: "OUTCOME_SALES", goalHint: "VALUE" },
};

const INTENT_TO_TIKTOK: Record<FunnelIntent, { objective: string; goalHint?: string }> = {
  reach:          { objective: "REACH", goalHint: "REACH" },
  video_views:    { objective: "VIDEO_VIEWS", goalHint: "FOCUSED_VIEW" },
  engagement:     { objective: "COMMUNITY_INTERACTION", goalHint: "PROFILE_VISIT" },
  traffic:        { objective: "TRAFFIC", goalHint: "LANDING_PAGE_VIEW" },
  leads:          { objective: "LEAD_GENERATION", goalHint: "FORM" },
  app_promotion:  { objective: "APP_PROMOTION", goalHint: "APP_INSTALL" },
  conversions:    { objective: "CONVERSIONS", goalHint: "CONVERT" },
  product_sales:  { objective: "PRODUCT_SALES", goalHint: "VALUE" },
};

const INTENT_TO_GOOGLE: Record<FunnelIntent, { objective: string; goalHint?: string }> = {
  reach:          { objective: "AWARENESS_DISPLAY", goalHint: "CPM" },
  video_views:    { objective: "AWARENESS_VIDEO_VIEWS", goalHint: "TARGET_CPM" },
  engagement:     { objective: "CONSIDERATION_DEMAND_GEN", goalHint: "MAXIMIZE_CLICKS" },
  traffic:        { objective: "CONSIDERATION_DEMAND_GEN", goalHint: "MAXIMIZE_CLICKS" },
  leads:          { objective: "CONVERSION_SEARCH", goalHint: "MAXIMIZE_CONVERSIONS" },
  app_promotion:  { objective: "CONSIDERATION_APP_INSTALLS", goalHint: "TARGET_CPA" },
  conversions:    { objective: "CONSIDERATION_PMAX", goalHint: "MAXIMIZE_CONVERSIONS" },
  product_sales:  { objective: "CONVERSION_SHOPPING", goalHint: "TARGET_ROAS" },
};

const INTENT_TO_SNAPCHAT: Record<FunnelIntent, { objective: string; goalHint?: string }> = {
  reach:          { objective: "AWARENESS", goalHint: "IMPRESSIONS" },
  video_views:    { objective: "VIDEO_VIEWS", goalHint: "VIDEO_VIEWS" },
  engagement:     { objective: "ENGAGEMENT", goalHint: "SWIPES" },
  traffic:        { objective: "TRAFFIC", goalHint: "SWIPES" },
  leads:          { objective: "LEAD_GENERATION", goalHint: "LEAD_FORM_SUBMISSIONS" },
  app_promotion:  { objective: "APP_INSTALLS", goalHint: "APP_INSTALLS" },
  conversions:    { objective: "CONVERSIONS", goalHint: "PIXEL_PURCHASE" },
  product_sales:  { objective: "CATALOG_SALES", goalHint: "CATALOG_SALES" },
};

// ── Helpers ──────────────────────────────────────────────────────────────

function getIntentMap(platform: string): Record<string, FunnelIntent> {
  const p = platform.toLowerCase();
  if (p.includes("meta") || p.includes("facebook") || p.includes("instagram")) return META_INTENT_MAP;
  if (p.includes("tiktok")) return TIKTOK_INTENT_MAP;
  if (p.includes("google")) return GOOGLE_INTENT_MAP;
  if (p.includes("snap")) return SNAPCHAT_INTENT_MAP;
  return {};
}

function getIntentToTarget(platform: string): Record<FunnelIntent, { objective: string; goalHint?: string }> {
  const p = platform.toLowerCase();
  if (p.includes("meta") || p.includes("facebook") || p.includes("instagram")) return INTENT_TO_META;
  if (p.includes("tiktok")) return INTENT_TO_TIKTOK;
  if (p.includes("google")) return INTENT_TO_GOOGLE;
  if (p.includes("snap")) return INTENT_TO_SNAPCHAT;
  return INTENT_TO_META; // fallback
}

function getObjectiveMappings(platform: string): ObjectiveMapping[] {
  const p = platform.toLowerCase();
  if (p.includes("meta") || p.includes("facebook") || p.includes("instagram")) return META_OBJECTIVE_MAPPING;
  if (p.includes("tiktok")) return TIKTOK_OBJECTIVE_MAPPING;
  if (p.includes("google")) return GOOGLE_ADS_OBJECTIVE_MAPPING;
  if (p.includes("snap")) return SNAPCHAT_OBJECTIVE_MAPPING;
  return META_OBJECTIVE_MAPPING;
}

/**
 * Try to find the best-matching optimization goal in the target platform.
 * Strategy: prefer the goalHint, but also try to match by similar label keywords.
 */
function findBestGoal(
  targetObjectiveDef: ObjectiveMapping | undefined,
  goalHint?: string,
  sourceGoalLabel?: string
): string | undefined {
  if (!targetObjectiveDef || targetObjectiveDef.optimizationGoals.length === 0) return undefined;

  // 1. Exact hint match
  if (goalHint) {
    const exact = targetObjectiveDef.optimizationGoals.find((g) => g.value === goalHint);
    if (exact) return exact.value;
  }

  // 2. Label-keyword match (e.g. "Landing Page" → match LPV on another platform)
  if (sourceGoalLabel) {
    const lowerLabel = sourceGoalLabel.toLowerCase();
    const keywords = lowerLabel.split(/[\s()/]+/).filter((w) => w.length > 3);
    for (const goal of targetObjectiveDef.optimizationGoals) {
      const targetLabel = goal.label.toLowerCase();
      if (keywords.some((kw) => targetLabel.includes(kw))) {
        return goal.value;
      }
    }
  }

  // 3. First available
  return targetObjectiveDef.optimizationGoals[0].value;
}

// ── Public API ───────────────────────────────────────────────────────────

export interface TranslatedObjective {
  objective: string;
  optimizationGoal: string;
  /** true if an intelligent mapping was applied (vs. just copying as-is) */
  translated: boolean;
  /** human-readable note about the mapping */
  note?: string;
}

/**
 * Translate an objective + optimization goal from one platform to another.
 * Optionally accepts phase context for placement-aware mapping (e.g. TikTok Search → Google Search).
 *
 * @example
 * translateObjective("VIDEO_VIEWS", "FOCUSED_VIEW", "tiktok", "google_ads")
 * // → { objective: "AWARENESS_VIDEO_VIEWS", optimizationGoal: "TARGET_CPM", translated: true }
 */
export function translateObjective(
  sourceObjective: string,
  sourceOptimizationGoal: string,
  sourcePlatform: string,
  targetPlatform: string,
  phaseContext?: { tiktokPlacementType?: string; tiktokPlacements?: string[]; keywords?: any[]; searchKeywords?: any[] }
): TranslatedObjective {
  // Same platform → no translation needed
  if (sourcePlatform.toLowerCase() === targetPlatform.toLowerCase()) {
    return { objective: sourceObjective, optimizationGoal: sourceOptimizationGoal, translated: false };
  }

  // Placement-aware overrides before generic intent mapping
  const placementOverride = getPlacementAwareOverride(sourcePlatform, targetPlatform, sourceObjective, phaseContext);
  if (placementOverride) return placementOverride;

  // Step 1: Resolve funnel intent from source objective
  const sourceIntentMap = getIntentMap(sourcePlatform);
  const intent: FunnelIntent | undefined = sourceIntentMap[sourceObjective];

  if (!intent) {
    // Unknown source objective – try fuzzy intent detection from objective string
    const fallbackIntent = guessIntentFromString(sourceObjective);
    if (fallbackIntent) {
      return mapIntentToTarget(fallbackIntent, targetPlatform, sourceOptimizationGoal, sourceObjective);
    }
    // Complete fallback
    const targetMappings = getObjectiveMappings(targetPlatform);
    const first = targetMappings[0];
    return {
      objective: first?.value || sourceObjective,
      optimizationGoal: first?.optimizationGoals[0]?.value || sourceOptimizationGoal,
      translated: true,
      note: `Could not map "${sourceObjective}" – using default`,
    };
  }

  // Step 2: Map intent to target
  return mapIntentToTarget(intent, targetPlatform, sourceOptimizationGoal, sourceObjective);
}

function mapIntentToTarget(
  intent: FunnelIntent,
  targetPlatform: string,
  sourceGoal: string,
  sourceObjective: string
): TranslatedObjective {
  const intentToTarget = getIntentToTarget(targetPlatform);
  const target = intentToTarget[intent];
  const targetMappings = getObjectiveMappings(targetPlatform);
  const targetObjDef = targetMappings.find((m) => m.value === target.objective);

  // Find the source goal label for fuzzy matching
  // (we don't have the source platform mappings here, so just pass the value)
  const bestGoal = findBestGoal(targetObjDef, target.goalHint, sourceGoal) || target.goalHint || "";

  return {
    objective: target.objective,
    optimizationGoal: bestGoal,
    translated: true,
    note: `${sourceObjective} → ${intent} → ${target.objective}`,
  };
}

function guessIntentFromString(objective: string): FunnelIntent | undefined {
  const upper = objective.toUpperCase();
  if (upper.includes("REACH") || upper.includes("AWARENESS")) return "reach";
  if (upper.includes("VIDEO")) return "video_views";
  if (upper.includes("ENGAGEMENT") || upper.includes("COMMUNITY") || upper.includes("INTERACTION")) return "engagement";
  if (upper.includes("TRAFFIC") || upper.includes("CLICK")) return "traffic";
  if (upper.includes("LEAD")) return "leads";
  if (upper.includes("APP")) return "app_promotion";
  if (upper.includes("PRODUCT") || upper.includes("CATALOG") || upper.includes("SHOPPING")) return "product_sales";
  if (upper.includes("CONVERSION") || upper.includes("SALES") || upper.includes("PURCHASE")) return "conversions";
  return undefined;
}

/**
 * Translate a Google Ads campaign type based on the translated objective.
 * Returns the most appropriate campaign type for the given Google objective.
 */
export function translateGoogleCampaignType(googleObjective: string): string | undefined {
  const obj = googleObjective.toUpperCase();
  if (obj.includes("DISPLAY")) return "Display";
  if (obj.includes("VIDEO") || obj.includes("AUDIO")) return "Video";
  if (obj.includes("SEARCH")) return "Search";
  if (obj.includes("PMAX")) return "Performance Max";
  if (obj.includes("DEMAND_GEN")) return "Demand Gen";
  if (obj.includes("APP")) return "App Promotion";
  if (obj.includes("SHOPPING")) return "Shopping";
  return undefined;
}
