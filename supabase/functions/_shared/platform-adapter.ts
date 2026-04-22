/**
 * Platform Abstraction Layer
 * Provides unified interface for all advertising platforms (Meta, TikTok, etc.)
 * Ensures consistent behavior across platforms while isolating platform-specific implementation
 */

/**
 * Extract a YouTube video ID from a YouTube URL (watch, youtu.be, shorts, embed).
 * Returns undefined if no ID can be extracted.
 */
function extractYouTubeId(input?: string | null): string | undefined {
  if (!input) return undefined;
  const s = String(input).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : undefined;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "shorts" || p === "embed" || p === "v");
      if (idx >= 0 && parts[idx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[idx + 1])) {
        return parts[idx + 1];
      }
    }
  } catch {
    // not a URL
  }
  return undefined;
}

/**
 * Map a Google Ads CTA enum (e.g. LEARN_MORE) or a UI label ("Learn More")
 * to the exact display string Google Ads expects on the button ("Learn more").
 *
 * Google's `AdCallToActionAsset.text` and `DemandGenMultiAssetAdInfo.call_to_action_text`
 * accept a free-form string but only render a fixed allowlist of phrases.
 * Mirrors `src/utils/googleCtaOptions.ts` (kept inline here because edge
 * functions cannot import from `src/`).
 */
const GOOGLE_CTA_DISPLAY_MAP: Record<string, string> = {
  LEARN_MORE: "Learn more",
  SHOP_NOW: "Shop now",
  SIGN_UP: "Sign up",
  SUBSCRIBE: "Subscribe",
  DOWNLOAD: "Download",
  BOOK_NOW: "Book now",
  CONTACT_US: "Contact us",
  GET_QUOTE: "Get quote",
  APPLY_NOW: "Apply now",
  ORDER_NOW: "Order now",
  INSTALL: "Install",
  WATCH_NOW: "Watch now",
  GET_OFFER: "Get offer",
  VISIT_SITE: "Visit site",
  SEE_MORE: "See more",
};

function mapGoogleCtaToDisplay(input?: string | null): string {
  if (!input) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  // Try direct enum hit first.
  const upper = raw.toUpperCase().replace(/\s+/g, "_");
  if (GOOGLE_CTA_DISPLAY_MAP[upper]) return GOOGLE_CTA_DISPLAY_MAP[upper];
  // Then try matching by display text (case-insensitive).
  const lower = raw.toLowerCase();
  for (const display of Object.values(GOOGLE_CTA_DISPLAY_MAP)) {
    if (display.toLowerCase() === lower) return display;
  }
  // Common aliases.
  if (/^install[_ ]?(app|now)$/i.test(raw)) return "Install";
  if (/^watch[_ ]?more$/i.test(raw)) return "Watch now";
  return "";
}

/** Normalize a UI label/enum/display string into the canonical Google CTA enum. */
function mapGoogleCtaToEnum(input?: string | null): string {
  if (!input) return "LEARN_MORE";
  const raw = String(input).trim();
  if (!raw) return "LEARN_MORE";
  const upper = raw.toUpperCase().replace(/\s+/g, "_");
  if (GOOGLE_CTA_DISPLAY_MAP[upper]) return upper;
  const lower = raw.toLowerCase();
  for (const [enumVal, display] of Object.entries(GOOGLE_CTA_DISPLAY_MAP)) {
    if (display.toLowerCase() === lower) return enumVal;
  }
  if (/^install[_ ]?(app|now)$/i.test(raw)) return "INSTALL";
  if (/^watch[_ ]?more$/i.test(raw)) return "WATCH_NOW";
  return "LEARN_MORE";
}


export interface PlatformAdapter {
  createCampaign(params: CreateCampaignParams): Promise<CreateCampaignResult>;
  updateCampaign(params: UpdateCampaignParams): Promise<UpdateCampaignResult>;
  createAdGroup(params: CreateAdGroupParams): Promise<CreateAdGroupResult>;
  createCreative(params: CreateCreativeParams): Promise<CreateCreativeResult>;
  fetchMetrics(params: FetchMetricsParams): Promise<FetchMetricsResult>;
  handleWebhook?(params: WebhookParams): Promise<WebhookResult>;
}

// Common interfaces
export interface CreateCampaignParams {
  accountId: string;
  accessToken: string;
  campaignName: string;
  objective: string;
  budget: number;
  budgetMode: 'daily' | 'lifetime';
  startDate: string;
  endDate: string;
  status: string;
  metadata?: Record<string, any>;
}

export interface CreateCampaignResult {
  success: boolean;
  campaignId: string;
  platform: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface UpdateCampaignParams {
  accountId: string;
  accessToken: string;
  campaignId: string;
  updates: {
    name?: string;
    status?: string;
    budget?: number;
    [key: string]: any;
  };
}

export interface UpdateCampaignResult {
  success: boolean;
  campaignId: string;
  platform: string;
  error?: string;
}

export interface CreateAdGroupParams {
  accountId: string;
  accessToken: string;
  campaignId: string;
  adGroupName: string;
  targeting: Record<string, any>;
  placements: string[];
  placementType?: string; // PLACEMENT_TYPE_AUTOMATIC or PLACEMENT_TYPE_NORMAL
  optimizationGoal: string;
  billingEvent?: string;
  budget?: number;
  budgetMode?: 'daily' | 'lifetime';
  startDate?: string;
  endDate?: string;
  status: string;
  pixelId?: string;
  conversionId?: string;
  landingPageUrl?: string;
  bidStrategy?: string;
  bidAmount?: number;
  metaBidStrategy?: string;
  metaBidAmount?: number;
  // TikTok-specific advanced fields from matrix
  optimizationLocation?: string;
  appName?: string;
  appId?: string;
  frequencyEnabled?: boolean;
  frequencySchedule?: number;
  clickWindow?: number;
  viewWindow?: number;
  eventCount?: string; // "every_conversion" or "once"
  smartPlusEnabled?: boolean;
  smartCreativeEnabled?: boolean;
  autoTargetingEnabled?: boolean;
  // TikTok Search Ads
  searchEnabled?: boolean;
  searchKeywords?: Array<{ text: string; matchType?: string }>;
  // Conversion event for pixel-based optimization
  conversionEvent?: string;
}

export interface CreateAdGroupResult {
  success: boolean;
  adGroupId: string;
  platform: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface CreateCreativeParams {
  accountId: string;
  accessToken: string;
  adGroupId: string;
  creativeName: string;
  creativeType: string;
  assets: {
    videoId?: string;
    imageIds?: string[];
    videoUrl?: string;
    imageUrls?: string[];
    // Google Demand Gen / Video specific:
    youtubeVideoId?: string; // Pre-uploaded YouTube video ID (preferred for Demand Gen video ads)
    imageUrl?: string;       // Source image URL — will be uploaded as a Google Ads imageAsset
    logoUrl?: string;        // Optional brand/logo URL
  };
  adText: string;
  callToAction: string;
  landingPageUrl: string;
}

export interface CreateCreativeResult {
  success: boolean;
  creativeId: string;
  platform: string;
  error?: string;
}

export interface FetchMetricsParams {
  accountId: string;
  accessToken: string;
  entityIds: string[];
  entityType: 'campaign' | 'adgroup' | 'ad';
  startDate: string;
  endDate: string;
}

export interface FetchMetricsResult {
  success: boolean;
  metrics: Array<{
    entityId: string;
    date: string;
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    [key: string]: any;
  }>;
  platform: string;
  error?: string;
}

export interface WebhookParams {
  body: any;
  headers: Record<string, string>;
}

export interface WebhookResult {
  success: boolean;
  processed: boolean;
  message?: string;
}

// Factory function to get the appropriate adapter
export function getPlatformAdapter(platform: string): PlatformAdapter {
  const normalizedPlatform = platform.toLowerCase();
  
  switch (normalizedPlatform) {
    case 'meta':
    case 'facebook':
    case 'instagram':
      return new MetaAdapter();
    case 'tiktok':
      return new TikTokAdapter();
    case 'google':
    case 'google_ads':
      return new GoogleAdsAdapter();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Meta Adapter Implementation
class MetaAdapter implements PlatformAdapter {
  async createCampaign(params: CreateCampaignParams): Promise<CreateCampaignResult> {
    // Meta-specific campaign creation logic remains unchanged
    throw new Error("Meta adapter should use existing implementation in push-campaign-to-dsp");
  }

  async updateCampaign(params: UpdateCampaignParams): Promise<UpdateCampaignResult> {
    throw new Error("Not implemented");
  }

  async createAdGroup(params: CreateAdGroupParams): Promise<CreateAdGroupResult> {
    throw new Error("Meta adapter should use existing implementation in push-campaign-to-dsp");
  }

  async createCreative(params: CreateCreativeParams): Promise<CreateCreativeResult> {
    throw new Error("Not implemented");
  }

  async fetchMetrics(params: FetchMetricsParams): Promise<FetchMetricsResult> {
    throw new Error("Not implemented");
  }

  async handleWebhook(params: WebhookParams): Promise<WebhookResult> {
    throw new Error("Not implemented");
  }
}

// TikTok Adapter Implementation
class TikTokAdapter implements PlatformAdapter {
  private readonly API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

  async createCampaign(params: CreateCampaignParams): Promise<CreateCampaignResult> {
    try {
      // Check if Smart+ campaign
      const isSmartPlus = params.metadata?.smartPlusEnabled === true;

      // OBJECTIVE NORMALIZATION: Map to correct TikTok API objective_type enum values
      // TikTok valid objective_type values: TRAFFIC, WEB_CONVERSIONS, REACH, VIDEO_VIEWS, 
      // LEAD_GENERATION, APP_PROMOTION, PRODUCT_CATALOG_PRODUCT_SALES
      // IMPORTANT: "CONVERSIONS" is NOT a valid TikTok objective — use "WEB_CONVERSIONS"
      let finalObjective = params.objective;
      let objectiveFallbackApplied = false;
      
      // Normalize CONVERSIONS → WEB_CONVERSIONS (correct TikTok enum)
      if (finalObjective === 'CONVERSIONS') {
        console.log("📋 Normalizing CONVERSIONS → WEB_CONVERSIONS (correct TikTok API enum)");
        finalObjective = 'WEB_CONVERSIONS';
        // This is a normalization, not a fallback
      }
      
      // Normalize VIDEO_VIEW variants
      if (finalObjective === 'VIDEO_VIEW') {
        finalObjective = 'VIDEO_VIEWS';
      }

      if (isSmartPlus) {
        // ============= SMART+ CAMPAIGN - USE DEDICATED API =============
        console.log(`🚀 Creating TikTok Smart+ Campaign via /smart_plus/campaign/create/`);
        
        const smartPlusBody: any = {
          advertiser_id: params.accountId,
          campaign_name: params.campaignName,
          objective_type: finalObjective,
          budget_mode: params.budgetMode === 'daily' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL',
          budget: Math.round(params.budget * 100) / 100,
          operation_status: params.status === 'PAUSED' ? 'DISABLE' : 'ENABLE',
        };

        const endpoint = `${this.API_BASE}/smart_plus/campaign/create/`;
        console.log("TikTok Smart+ Campaign creation request:", JSON.stringify(smartPlusBody, null, 2));

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Access-Token": params.accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(smartPlusBody),
        });

        const data = await response.json();

        if (data.code !== 0) {
          console.error("TikTok Smart+ campaign creation error:", JSON.stringify(data, null, 2));
          // Fallback to regular campaign creation if Smart+ endpoint fails
          console.warn("⚠️ Smart+ campaign creation failed, falling back to regular campaign with is_smart_performance_campaign flag");
        } else {
          console.log("TikTok Smart+ campaign created successfully:", data.data?.campaign_id);
          return {
            success: true,
            campaignId: data.data.campaign_id,
            platform: "tiktok",
            metadata: {
              ...data.data,
              actual_objective: finalObjective,
              original_objective: params.objective,
              objective_fallback_applied: objectiveFallbackApplied,
              is_smart_plus: true,
            },
          };
        }
      }

      // ============= REGULAR CAMPAIGN CREATION =============
      const body: any = {
        advertiser_id: params.accountId,
        campaign_name: params.campaignName,
        objective_type: finalObjective,
        budget_mode: params.budgetMode === 'daily' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL',
        budget: Math.round(params.budget * 100) / 100,
        operation_status: params.status === 'PAUSED' ? 'DISABLE' : 'ENABLE',
      };
      
      // If Smart+ was requested but dedicated endpoint failed, try flag approach
      if (isSmartPlus) {
        body.campaign_type = "SMART_PERFORMANCE_CAMPAIGN";
        console.log(`🚀 Fallback: Setting campaign_type=SMART_PERFORMANCE_CAMPAIGN on regular endpoint`);
      }
      
      // Set is_search_campaign flag for TikTok Search Ads campaigns
      if (params.metadata?.isSearchCampaign) {
        body.is_search_campaign = true;
        console.log(`🔍 Setting is_search_campaign=true for TikTok Search campaign`);
      }
      
      const endpoint = `${this.API_BASE}/campaign/create/`;
      console.log("TikTok API Full Request:", {
        endpoint,
        method: "POST",
        headers: { "Access-Token": "[REDACTED]", "Content-Type": "application/json" },
        body
      });
      console.log("TikTok campaign creation request body:", JSON.stringify(body, null, 2));

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Access-Token": params.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.code !== 0) {
        console.error("TikTok campaign creation error:", JSON.stringify(data, null, 2));
        console.error("Failed request body was:", JSON.stringify(body, null, 2));
        return {
          success: false,
          campaignId: "",
          platform: "tiktok",
          error: `${data.message || "Failed to create campaign"} (Code: ${data.code})`,
        };
      }
      
      console.log("TikTok campaign created successfully:", data.data?.campaign_id);

      return {
        success: true,
        campaignId: data.data.campaign_id,
        platform: "tiktok",
        metadata: { 
          ...data.data, 
          actual_objective: finalObjective,
          original_objective: params.objective,
          objective_fallback_applied: objectiveFallbackApplied,
          is_smart_plus: isSmartPlus,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        campaignId: "",
        platform: "tiktok",
        error: error.message,
      };
    }
  }

  async updateCampaign(params: UpdateCampaignParams): Promise<UpdateCampaignResult> {
    try {
      const body: any = {
        advertiser_id: params.accountId,
        campaign_id: params.campaignId,
      };

      if (params.updates.name) body.campaign_name = params.updates.name;
      if (params.updates.status) {
        body.operation_status = params.updates.status === 'PAUSED' ? 'DISABLE' : 'ENABLE';
      }
      if (params.updates.budget) body.budget = params.updates.budget;

      const endpoint = `${this.API_BASE}/campaign/update/`;
      console.log("TikTok API Full Request:", {
        endpoint,
        method: "POST",
        headers: { "Access-Token": "[REDACTED]", "Content-Type": "application/json" },
        body
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Access-Token": params.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      return {
        success: data.code === 0,
        campaignId: params.campaignId,
        platform: "tiktok",
        error: data.code !== 0 ? data.message : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        campaignId: params.campaignId,
        platform: "tiktok",
        error: error.message,
      };
    }
  }

  async createAdGroup(params: CreateAdGroupParams): Promise<CreateAdGroupResult> {
    console.log(`🎯 TikTokAdapter.createAdGroup ENTRY - campaignId: ${params.campaignId}`);
    try {
      console.log(`🎯 TikTokAdapter.createAdGroup TRY block entered`);
      // STRICT BILLING EVENT MAPPING from TikTok matrix
      // NOTE: TikTok billing requirements can vary by optimization goal/account type.
      // Observed via API errors:
      // - CLICK: "Only CPC is supported."
      // - TRAFFIC_LANDING_PAGE_VIEW: "You can only select oCPM for your billing event."
      const getBillingEventForOptimization = (optimizationGoal: string): string => {
        const mapping: Record<string, string> = {
          'REACH': 'CPM',
          'CLICK': 'CPC',
          'TRAFFIC_LANDING_PAGE_VIEW': 'OCPM',
          'LANDING_PAGE': 'OCPM',
          'LANDING_PAGE_VIEW': 'OCPM',
          '6S_VIDEO_VIEW': 'OCPM',
          '15S_VIDEO_VIEW': 'OCPM',
          'VIDEO_VIEW': 'OCPM',
          'FOCUSED_VIEW': 'OCPM',
          'CONVERT': 'OCPM',
          'VALUE': 'OCPM',
          'APP_INSTALL': 'OCPM',
          'ENGAGEMENT': 'OCPM',
          'FOLLOW': 'OCPM',
          'FORM_SUBMIT': 'OCPM',
          'CONVERSATION': 'OCPM',
        };
        return mapping[optimizationGoal] || 'OCPM';
      };
      
      // STEP 2: Define TikTok minimum bid requirements
      const TIKTOK_MIN_BIDS: Record<string, number> = {
        CPC: 10,   // €10 minimum for CPC
        CPM: 5,    // €5 minimum for CPM
        CPV: 2,    // €2 minimum for CPV
        OCPM: 1,   // €1 minimum for OCPM
      };
      
      // STEP 3: Determine final optimization goal and billing event
      let finalOptimizationGoal = params.optimizationGoal;
      let requiredBillingEvent = getBillingEventForOptimization(finalOptimizationGoal);
      
      // IMPORTANT: Do NOT fall back from CONVERT to CLICK for objectives that require OCPM
      // TikTok objectives like LEAD_GENERATION, CONVERSIONS, APP_INSTALL only support OCPM billing
      // The previous fallback was causing "You can only select oCPM for your billing event" errors
      // Objectives that ONLY support OCPM: CONVERSIONS, LEAD_GENERATION, APP_PROMOTION
      const ocpmOnlyObjectives = ['CONVERSIONS', 'WEB_CONVERSIONS', 'LEAD_GENERATION', 'APP_PROMOTION', 'APP_INSTALL'];
      const campaignObjective = params.campaignId ? 'UNKNOWN' : 'UNKNOWN'; // We don't have objective here, rely on optimization goal
      
      // For conversion-type optimization goals, always use OCPM (TikTok requirement)
      const ocpmOnlyOptGoals = ['CONVERT', 'VALUE', 'FORM_SUBMIT', 'INSTALL', 'ENGAGEMENT', 'CONVERSATION'];
      if (ocpmOnlyOptGoals.includes(finalOptimizationGoal)) {
        requiredBillingEvent = 'OCPM';
        console.log(`📋 OCPM-only optimization goal detected (${finalOptimizationGoal}), enforcing OCPM billing`);
      }
      
      console.log(`Using optimization goal: ${finalOptimizationGoal}, required billing event: ${requiredBillingEvent}`);
      
      // STEP 4: Validate and enforce minimum bid
      const minimumBid = TIKTOK_MIN_BIDS[requiredBillingEvent] || 1;
      let finalBidAmount = params.bidAmount || minimumBid;
      
      if (finalBidAmount < minimumBid) {
        console.error(`❌ CRITICAL: Bid €${finalBidAmount} is below TikTok minimum €${minimumBid} for ${requiredBillingEvent}`);
        console.error(`Setting bid to minimum: €${minimumBid}`);
        finalBidAmount = minimumBid;
      }
      
      console.log(`Final bid amount: €${finalBidAmount} (minimum: €${minimumBid})`);
      
      // STEP 5: Map bid strategy to TikTok's bid_type
      const mapBidStrategy = (strategy?: string): string => {
        if (strategy === "COST_CAP") {
          return "BID_TYPE_CUSTOM"; // Manual bidding
        } else if (strategy === "LOWEST_COST_WITH_BID_CAP") {
          return "BID_TYPE_CUSTOM"; // Manual bidding with cap
        } else {
          return "BID_TYPE_NO_BID"; // Automatic bidding
        }
      };
      
      const bidType = mapBidStrategy(params.bidStrategy);
      console.log(`Bid strategy: ${params.bidStrategy} → ${bidType}`);
      
      // STEP 6: Validate and map promotion_type based on objective/optimization goal matrix
      // Some objectives don't support optimization location
      const objectivesWithoutLocation = ['REACH', 'VIDEO_VIEWS', 'VIDEO_VIEW', 'FOCUSED_VIEW', '6S_VIDEO_VIEW', '15S_VIDEO_VIEW', 'COMMUNITY_INTERACTION', 'PROFILE_VISIT', 'FOLLOW'];
      // TRAFFIC/CLICK objectives only support Website/App destinations, not Lead Gen types
      const trafficObjectives = ['TRAFFIC', 'CLICK', 'TRAFFIC_LANDING_PAGE_VIEW', 'LANDING_PAGE', 'LANDING_PAGE_VIEW', 'LANDING_PAGE_VIEWS'];
      const isTrafficObjective = trafficObjectives.includes(finalOptimizationGoal.toUpperCase()) ||
                                  trafficObjectives.includes(params.optimizationGoal?.toUpperCase() || '');
      const skipPromotionType = objectivesWithoutLocation.includes(finalOptimizationGoal.toUpperCase()) ||
                                 objectivesWithoutLocation.includes(params.optimizationGoal?.toUpperCase() || '');
      
      console.log(`📍 Optimization location check: objective=${finalOptimizationGoal}, location=${params.optimizationLocation}, skip=${skipPromotionType}, isTraffic=${isTrafficObjective}`);
      
      const mapPromotionType = (location?: string, appName?: string): string | null => {
        // If objective doesn't support location, return null to skip promotion_type
        if (skipPromotionType) {
          console.log(`⚠️ Skipping promotion_type - ${finalOptimizationGoal} doesn't support optimization location`);
          return null;
        }
        
        // TRAFFIC objective only supports WEBSITE, APP, TIKTOK_SHOP - not Lead Gen types
        if (isTrafficObjective) {
          // Map only traffic-compatible locations
          if (location === 'App' && appName) {
            if (appName.toLowerCase().includes('ios') || appName.toLowerCase().includes('iphone')) {
              return 'APP_IOS';
            }
            return 'APP_ANDROID';
          }
          // For Traffic, force WEBSITE for any incompatible location (Lead Gen types)
          const trafficMapping: Record<string, string> = {
            'Website': 'WEBSITE',
            'App': 'APP_ANDROID',
            'TikTok Shop': 'TIKTOK_SHOP',
          };
          const mappedType = trafficMapping[location || ''] || 'WEBSITE';
          if (!trafficMapping[location || '']) {
            console.warn(`⚠️ Traffic objective doesn't support "${location}" - falling back to WEBSITE`);
          }
          return mappedType;
        }
        
        // Handle App promotion with specific app types
        if (location === 'App' && appName) {
          if (appName.toLowerCase().includes('ios') || appName.toLowerCase().includes('iphone')) {
            return 'APP_IOS';
          }
          return 'APP_ANDROID'; // Default to Android
        }
        
        const mapping: Record<string, string> = {
          'Website': 'WEBSITE',
          'App': 'APP_ANDROID', // Default when no appName specified
          'TikTok Shop': 'TIKTOK_SHOP',
          'Instant Form': 'LEAD_GENERATION',
          'TikTok Direct Messages': 'LEAD_GEN_CLICK_TO_TT_DIRECT_MESSAGE',
          'Instant Messaging Apps': 'LEAD_GEN_CLICK_TO_SOCIAL_MEDIA_APP_MESSAGE',
          'Phone Call': 'LEAD_GEN_CLICK_TO_CALL',
          'TikTok Instant Page': 'WEBSITE_OR_DISPLAY',
          'Website & App': 'WEBSITE', // Default to website for hybrid
        };
        return mapping[location || ''] || 'WEBSITE';
      };
      
      const promotionType = mapPromotionType(params.optimizationLocation, params.appName);
      console.log(`Promotion type: ${params.optimizationLocation} → ${promotionType || '(not set - skipped)'}`);
      
      // STEP 7: Build ad group body with all TikTok matrix fields
      
      // Convert gender strings to numbers for mapGender
      console.log(`🎯 Raw targeting data:`, JSON.stringify({
        genders: params.targeting.genders,
        age_min: params.targeting.age_min,
        age_max: params.targeting.age_max,
        devices: params.targeting.devices,
        os: params.targeting.os,
        languages: params.targeting.languages,
        tiktokInterests: params.targeting.tiktokInterests,
        tiktokBehaviors: params.targeting.tiktokBehaviors,
        tiktokDemographics: params.targeting.tiktokDemographics
      }, null, 2));
      
      const normalizedGenders = params.targeting.genders && Array.isArray(params.targeting.genders)
        ? params.targeting.genders
            .filter((g: any) => g !== 'all' && g !== null && g !== undefined && g !== '')
            .map((g: any) => parseInt(String(g)))
            .filter((g: number) => !isNaN(g))
        : undefined;
      
      console.log(`🎯 Normalized genders:`, normalizedGenders, `(original: ${JSON.stringify(params.targeting.genders)})`);
      
      // VIDEO_VIEWS objectives require manual placement - override automatic placement
      const objectivesRequiringManualPlacement = ['VIDEO_VIEW', 'VIDEO_VIEWS', '6S_VIDEO_VIEW', '15S_VIDEO_VIEW', 'FOCUSED_VIEW'];
      // REACH objective requires manual placement AND only supports PLACEMENT_TIKTOK
      const reachObjectives = ['REACH'];
      // LEAD_GENERATION objectives require manual placement with PLACEMENT_TIKTOK only
      const leadGenObjectives = ['LEAD_GENERATION', 'LEADS', 'CONVERSION_LEADS', 'PREFERRED_LEAD', 'FORM_SUBMIT'];
      const isReachObjective = reachObjectives.includes(finalOptimizationGoal.toUpperCase()) ||
                                reachObjectives.includes(params.optimizationGoal?.toUpperCase() || '');
      const isLeadGenObjective = leadGenObjectives.includes(finalOptimizationGoal.toUpperCase()) ||
                                  leadGenObjectives.includes(params.optimizationGoal?.toUpperCase() || '');
      // Search ads with WEB_CONVERSIONS also require manual placement
      const isSearchWithManualPlacement = params.searchEnabled && params.searchKeywords && params.searchKeywords.length > 0;
      const requiresManualPlacement = objectivesRequiringManualPlacement.includes(finalOptimizationGoal.toUpperCase()) ||
                                       objectivesRequiringManualPlacement.includes(params.optimizationGoal?.toUpperCase() || '') ||
                                       isReachObjective || isLeadGenObjective || isSearchWithManualPlacement;
      
      let finalPlacementType = params.placementType || "PLACEMENT_TYPE_AUTOMATIC";
      let finalPlacements = params.placements;
      
      if (isReachObjective || isLeadGenObjective) {
        // REACH and LEAD_GENERATION objectives only support TikTok placement
        console.warn(`⚠️ ${isReachObjective ? 'REACH' : 'LEAD_GENERATION'} objective - forcing PLACEMENT_TYPE_NORMAL with PLACEMENT_TIKTOK only`);
        finalPlacementType = "PLACEMENT_TYPE_NORMAL";
        finalPlacements = ["PLACEMENT_TIKTOK"];
      } else if (isSearchWithManualPlacement) {
        // Search ads ONLY support PLACEMENT_TIKTOK with manual placement
        console.warn(`⚠️ Search ads enabled - forcing PLACEMENT_TYPE_NORMAL with PLACEMENT_TIKTOK only`);
        finalPlacementType = "PLACEMENT_TYPE_NORMAL";
        finalPlacements = ["PLACEMENT_TIKTOK"];
      } else if (requiresManualPlacement) {
        console.warn(`⚠️ ${finalOptimizationGoal} objective requires manual placement - overriding to PLACEMENT_TYPE_NORMAL`);
        finalPlacementType = "PLACEMENT_TYPE_NORMAL";
        // Ensure we have valid placements for manual mode
        if (!finalPlacements || finalPlacements.length === 0) {
          finalPlacements = ["PLACEMENT_TIKTOK"];
        }
      }
      
      const body: any = {
        advertiser_id: params.accountId,
        campaign_id: params.campaignId,
        adgroup_name: params.adGroupName,
        placement_type: finalPlacementType,
        placements: finalPlacements,
        gender: this.mapGender(normalizedGenders),
        age_groups: this.mapAgeGroups(params.targeting.age_min, params.targeting.age_max),
        optimization_goal: finalOptimizationGoal,
        billing_event: requiredBillingEvent,
        bid_type: bidType,
        operation_status: params.status === 'PAUSED' ? 'DISABLE' : 'ENABLE',
        pacing: "PACING_MODE_SMOOTH", // Standard delivery (not accelerated)
      };
      
      // Only add promotion_type when objective supports optimization location
      if (promotionType) {
        body.promotion_type = promotionType;
        console.log(`✅ Including promotion_type: ${promotionType}`);
      } else {
        console.log(`⚠️ Skipping promotion_type - not applicable for ${finalOptimizationGoal} objective`);
      }
      
      // Only add bid when bid_type requires it (not for BID_TYPE_NO_BID)
      // TikTok API uses different field names depending on billing event:
      // - For CPC/CPM/CPV: use bid_price
      // - For OCPM: use conversion_bid_price
      if (bidType !== "BID_TYPE_NO_BID") {
        if (requiredBillingEvent === 'OCPM') {
          body.conversion_bid_price = finalBidAmount;
          console.log(`✅ Including conversion_bid_price: €${finalBidAmount} for OCPM billing`);
        } else {
          body.bid_price = finalBidAmount;
          console.log(`✅ Including bid_price: €${finalBidAmount} for ${requiredBillingEvent} billing`);
        }
      } else {
        console.log(`⚠️ Skipping bid field for bid_type: ${bidType} (automatic bidding)`);
      }
      
      console.log(`🎯 Mapped gender: ${body.gender}, age_groups: ${JSON.stringify(body.age_groups)}`);
      
      // Skip device_model_ids - TikTok expects specific numeric device model IDs (e.g., iPhone 12, Galaxy S21)
      // Generic device types like "mobile" or "desktop" are not supported
      // Device targeting is handled through placement selection instead
      console.log(`⚠️ Device targeting skipped - TikTok requires specific device model IDs, not device types`);
      
      // Add OS targeting (only if not 'all' and valid values)
      if (params.targeting.os && Array.isArray(params.targeting.os) && params.targeting.os.length > 0) {
        const filteredOs = params.targeting.os.filter((o: any) => o !== 'all' && o !== null && o !== undefined && o !== '');
        console.log(`🎯 Processing OS: original=${JSON.stringify(params.targeting.os)}, filtered=${JSON.stringify(filteredOs)}`);
        if (filteredOs.length > 0) {
          const osList = filteredOs
            .map((os: string) => {
              const osMap: Record<string, string> = {
                'ios': 'IOS',
                'android': 'ANDROID',
              };
              return osMap[os.toLowerCase()] || null;
            })
            .filter(Boolean);
          if (osList.length > 0) {
            body.operating_systems = osList;
            console.log(`✅ OS targeting: ${osList.join(', ')}`);
          }
        }
      } else {
        console.log(`⚠️ No OS targeting (os: ${JSON.stringify(params.targeting.os)})`);
      }
      
      // Map languages to TikTok language codes
      if (params.targeting.languages && Array.isArray(params.targeting.languages) && params.targeting.languages.length > 0) {
        const languageMap: { [key: string]: string } = {
          // Meta numeric IDs to TikTok codes
          '6': 'en', '24': 'es', '8': 'fr', '9': 'de', '11': 'it', '19': 'pt', 
          '25': 'nl', '28': 'ru', '29': 'ja', '30': 'ko', '31': 'zh', '32': 'ar',
          // English language names
          'english': 'en', 'spanish': 'es', 'french': 'fr', 'german': 'de', 
          'italian': 'it', 'portuguese': 'pt', 'dutch': 'nl', 'russian': 'ru',
          'japanese': 'ja', 'korean': 'ko', 'chinese': 'zh', 'arabic': 'ar',
          // Direct TikTok codes (pass through)
          'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it', 'pt': 'pt',
          'nl': 'nl', 'ru': 'ru', 'ja': 'ja', 'ko': 'ko', 'zh': 'zh', 'ar': 'ar'
        };
        
        const filteredLanguages = params.targeting.languages.filter((lang: any) => lang !== 'all' && lang !== null && lang !== undefined && lang !== '');
        console.log(`🎯 Processing languages: original=${JSON.stringify(params.targeting.languages)}, filtered=${JSON.stringify(filteredLanguages)}`);
        
        if (filteredLanguages.length > 0) {
          const languageCodes = filteredLanguages
            .map((lang: any) => {
              const langStr = String(lang).toLowerCase();
              return languageMap[langStr] || null;
            })
            .filter((code: string | null) => code !== null);
          
          if (languageCodes.length > 0) {
            body.languages = languageCodes;
            console.log(`✅ Language targeting: ${languageCodes.join(', ')}`);
          } else {
            console.log(`⚠️ No valid language codes mapped from: ${JSON.stringify(filteredLanguages)}`);
          }
        }
      } else {
        console.log(`⚠️ No language targeting (languages: ${JSON.stringify(params.targeting.languages)})`);
      }
      
      // TikTok interest/behavior targeting - DISABLED
      // The unified targeting system maps internal IDs that TikTok API doesn't recognize
      // Until we implement direct TikTok targeting API integration with proper ID validation,
      // we skip interest_category_ids and action_category_ids to prevent ad group creation failures
      // Ad groups will still be created with age/gender/location targeting
      
      console.log(`⚠️ SKIPPING interest/behavior targeting - TikTok requires IDs from their Targeting API`);
      console.log(`⚠️ Provided interests: ${params.targeting.tiktokInterests?.length || 0}, behaviors: ${params.targeting.tiktokBehaviors?.length || 0}`);
      console.log(`⚠️ Ad group will use demographic targeting only (age, gender, location)`);
      
      // NOTE: When proper TikTok targeting search is implemented, uncomment and fix the following:
      // The IDs must come from TikTok's /interest_category/get/ or /targeting/search/ endpoints
      // Current unified targeting IDs (e.g., "2010", "28101") are not recognized by TikTok API
      
      // Add optional TikTok fields from matrix
      // TikTok conversion_window expects specific enum values, not integers
      // Valid values: SEVEN_DAY_CLICK_OR_ONE_DAY_VIEW, ONE_DAY_VIEW, ONE_DAY_CLICK, ONE_DAY_CLICK_OR_ONE_DAY_VIEW, SEVEN_DAY_CLICK
      if (params.clickWindow || params.viewWindow) {
        const clickDays = params.clickWindow || 7;
        const viewDays = params.viewWindow || 1;
        
        // Map to TikTok enum values
        let conversionWindow = 'SEVEN_DAY_CLICK_OR_ONE_DAY_VIEW'; // Default
        if (clickDays === 7 && viewDays === 1) {
          conversionWindow = 'SEVEN_DAY_CLICK_OR_ONE_DAY_VIEW';
        } else if (clickDays === 1 && viewDays === 1) {
          conversionWindow = 'ONE_DAY_CLICK_OR_ONE_DAY_VIEW';
        } else if (clickDays === 7 && !params.viewWindow) {
          conversionWindow = 'SEVEN_DAY_CLICK';
        } else if (clickDays === 1 && !params.viewWindow) {
          conversionWindow = 'ONE_DAY_CLICK';
        } else if (!params.clickWindow && viewDays === 1) {
          conversionWindow = 'ONE_DAY_VIEW';
        }
        
        body.conversion_window = conversionWindow;
        console.log(`✅ Conversion window configured: ${conversionWindow} (click: ${clickDays}, view: ${viewDays})`);
      }
      
      // Frequency cap - required for REACH campaigns
      // Apply default (3 impressions per 7 days) for REACH if no frequency cap is configured
      const isReachCampaign = finalOptimizationGoal.toUpperCase() === 'REACH' || 
                               params.optimizationGoal?.toUpperCase() === 'REACH';
      
      if (params.frequencySchedule) {
        body.frequency = params.frequencySchedule;
        body.frequency_schedule = 7; // Per 7 days as per TikTok API
        console.log(`✅ Frequency cap configured: ${params.frequencySchedule} impressions per 7 days`);
      } else if (isReachCampaign) {
        // REACH campaigns require frequency cap - use default if not provided
        body.frequency = 3; // Default: 3 impressions
        body.frequency_schedule = 7; // Per 7 days
        console.log(`✅ Frequency cap defaulted for REACH campaign: 3 impressions per 7 days`);
      }
      
      if (params.appId) body.app_id = params.appId;
      if (params.eventCount) body.event_count = params.eventCount; // "every_conversion" or "once"

      // TikTok Search Ads toggle — only enable if keywords are actually present
      if (params.searchEnabled && params.searchKeywords && params.searchKeywords.length > 0) {
        body.search_result_enabled = true;
        console.log(`✅ TikTok Search Ads ENABLED for this ad group`);

        const tiktokMatchTypeMap: Record<string, string> = {
          "BROAD": "BROAD_WORD",
          "EXACT": "PRECISE_WORD",
          "PHRASE": "PHRASE_WORD",
          "BROAD_WORD": "BROAD_WORD",
          "PRECISE_WORD": "PRECISE_WORD",
          "PHRASE_WORD": "PHRASE_WORD",
        };
        body.search_keywords = params.searchKeywords.map((kw: any) => {
          const rawMatch = (typeof kw === "object" && kw.matchType) ? kw.matchType.toUpperCase() : "BROAD";
          return {
            keyword: typeof kw === "string" ? kw : (kw.text || kw.keyword || kw),
            match_type: tiktokMatchTypeMap[rawMatch] || "BROAD_WORD",
          };
        });
        console.log(`✅ Added ${body.search_keywords.length} search keywords to TikTok ad group`);
      } else if (params.searchEnabled) {
        console.warn(`⚠️ Search Ads enabled but no keywords provided — skipping search_result_enabled to prevent API error`);
      }

      if (params.smartPlusEnabled) body.is_smart_performance_campaign = true;
      if (params.smartCreativeEnabled) {
        body.creative_material_mode = "DYNAMIC"; // Enable dynamic creative optimization
        console.log(`✅ Smart Creative Optimization enabled - creative_material_mode=DYNAMIC`);
      }
      if (params.autoTargetingEnabled) {
        body.auto_targeting_enabled = true;
        console.log(`✅ Auto-Targeting enabled for TikTok ad group`);
      }
      
      console.log(`✅ Ad group configuration complete:`, {
        optimization_goal: body.optimization_goal,
        billing_event: body.billing_event,
        bid_type: body.bid_type,
        bid_price: body.bid_price,
        conversion_bid_price: body.conversion_bid_price,
      });


      // Location targeting - TikTok REQUIRES location_ids or zipcode_ids
      // First try geo_locations.countries, then fall back to extracting from market name
      let countriesToMap = params.targeting.geo_locations?.countries || [];
      
      // If no countries provided, try to extract from market name (e.g., "United Kingdom" -> "GB")
      if (countriesToMap.length === 0) {
        console.log(`⚠️ No countries in geo_locations, checking for market-based targeting`);
        // Market name is usually passed in the targeting context - we can try some common mappings
      }
      
      console.log(`🌍 Countries to map: ${JSON.stringify(countriesToMap)}`);
      
      let locationIds = this.mapLocationIds(countriesToMap)
        .filter(id => id !== "6252001"); // Remove US (restricted for many advertisers)
      
      // TikTok REQUIRES location_ids - if none found, return error instead of proceeding
      if (locationIds.length === 0) {
        // Try to use a sensible default based on account region or common markets
        // Most TikTok ad accounts have access to UK, DE, FR, ES, IT, NL, etc.
        console.warn("⚠️ No valid location_ids found from countries. Attempting to derive from market.");
        
        // Last resort: check if we have any fallback countries we can use
        // This is a critical error - TikTok won't accept ad groups without location targeting
        console.error("❌ CRITICAL: TikTok requires location_ids but none could be mapped.");
        console.error(`   Input countries: ${JSON.stringify(countriesToMap)}`);
        console.error(`   Please configure valid country codes (e.g., GB, DE, FR) for the market.`);
        
        return {
          success: false,
          adGroupId: "",
          platform: "tiktok",
          error: `TikTok requires location targeting. No valid countries could be mapped from: ${JSON.stringify(countriesToMap)}. Please configure valid ISO country codes (e.g., GB, DE, FR) for this market.`,
        };
      }
      
      body.location_ids = locationIds;
      console.log(`✅ Location targeting: ${locationIds.join(', ')} (from countries: ${countriesToMap.join(', ')})`);

      // Schedule dates (required for TikTok)
      if (params.startDate && params.endDate) {
        body.schedule_type = "SCHEDULE_START_END";
        const formatDateForTikTok = (date: Date) => {
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          const hours = String(date.getUTCHours()).padStart(2, '0');
          const minutes = String(date.getUTCMinutes()).padStart(2, '0');
          const seconds = String(date.getUTCSeconds()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        };
        
        // TikTok requires start time to be in the future
        // If configured start date is in the past, use current time + 5 minutes
        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
        const configuredStartDate = new Date(params.startDate);
        const actualStartDate = configuredStartDate < fiveMinutesFromNow ? fiveMinutesFromNow : configuredStartDate;
        
        if (configuredStartDate < fiveMinutesFromNow) {
          console.log(`⚠️ Configured start date ${params.startDate} is in the past, using ${actualStartDate.toISOString()} instead`);
        }
        
        body.schedule_start_time = formatDateForTikTok(actualStartDate);
        body.schedule_end_time = formatDateForTikTok(new Date(params.endDate));
      }

      // Budget (rounded to 2 decimals for TikTok currency precision)
      if (params.budget) {
        body.budget_mode = params.budgetMode === 'daily' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL';
        body.budget = Math.round(params.budget * 100) / 100;
      }
      
      // Landing page URL (ALWAYS required for WEBSITE promotion type)
      body.landing_page_url = params.landingPageUrl || "https://example.com";
      console.log(`Landing page URL: ${body.landing_page_url}`);
      
      // Conversion event normalization helper
      const convEventMap: Record<string, string> = {
        "COMPLETEPAYMENT": "ON_WEB_ORDER",
        "PURCHASE": "ON_WEB_ORDER",
        "ADDTOCART": "ON_WEB_CART",
        "VIEWCONTENT": "ON_WEB_DETAIL",
        "REGISTRATION": "ON_WEB_REGISTER",
        "SEARCH": "ON_WEB_SEARCH",
        "SUBSCRIBE": "ON_WEB_SUBSCRIBE",
        "ADDTOWISHLIST": "ON_WEB_ADD_TO_WISHLIST",
        "CLICKBUTTON": "CLICK_WEBSITE",
        "SUBMITFORM": "FORM",
        "DOWNLOAD": "DOWNLOAD_FINISH",
        "CONTACT": "CONSULT",
        "PLACEANORDER": "INITIATE_ORDER",
        "INITIATECHECKOUT": "INITIATE_ORDER",
        "ADDPAYMENTINFO": "ADD_PAYMENT_INFO",
        "COMPLETETUTORIAL": "COMPLETE_TUTORIAL",
        "STARTTRIAL": "START_TRIAL",
      };

      const normalizeConversionEvent = (rawValue?: string): string => {
        const raw = String(rawValue || "").trim();
        if (!raw) return "ON_WEB_ORDER";
        const normalizedKey = raw.replace(/[\s_-]+/g, "").toUpperCase();
        const mapped = convEventMap[normalizedKey];
        return mapped || raw.toUpperCase();
      };

      // Only add conversion tracking for CONVERT optimization goal (not for CLICK/REACH/etc)
      // IMPORTANT: Use finalOptimizationGoal (after fallback) not params.optimizationGoal (original)
      // TikTok rejects optimization_event for non-conversion objectives like TRAFFIC, REACH, VIDEO_VIEWS
      const conversionGoals = ['CONVERT', 'VALUE', 'APP_INSTALL', 'FORM_SUBMIT'];
      const isConversionGoal = conversionGoals.includes(finalOptimizationGoal.toUpperCase());
      
      if (isConversionGoal && params.pixelId) {
        body.pixel_id = params.pixelId;
        body.optimization_event = normalizeConversionEvent(params.conversionEvent);
        console.log(`✅ Conversion tracking configured: pixel=${params.pixelId}, event=${body.optimization_event}`);
      } else if (params.pixelId) {
        // Log why we're skipping conversion tracking even though pixel was provided
        console.log(`⚠️ Skipping conversion tracking - ${finalOptimizationGoal} is not a conversion goal (original: ${params.optimizationGoal})`);
      }

      // (Search Ads keywords already set above in the main searchEnabled block)
      
      const endpoint = `${this.API_BASE}/adgroup/create/`;
      console.log("TikTok API Full Request:", {
        endpoint,
        method: "POST",
        headers: { "Access-Token": "[REDACTED]", "Content-Type": "application/json" },
        body
      });
      console.log("TikTok ad group creation request body:", JSON.stringify(body, null, 2));

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Access-Token": params.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      console.log("=== TIKTOK API RESPONSE DEBUG ===");
      console.log("Status:", response.status, response.statusText);
      console.log("Headers:", JSON.stringify(Object.fromEntries(response.headers.entries())));
      
      const responseText = await response.text();
      console.log("Raw response body:", responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse TikTok response:", e);
        return {
          success: false,
          adGroupId: "",
          platform: "tiktok",
          error: `Invalid response from TikTok: ${responseText.substring(0, 200)}`,
        };
      }

      if (data.code !== 0) {
        const errorMessage = String(data.message || "");
        const isMissingPixelEvent = errorMessage.toLowerCase().includes("pixel event type does not exist");

        // Auto-retry with alternative pixel events when the configured event is unavailable
        if (isMissingPixelEvent && body.pixel_id) {
          try {
            const pixelEndpoint = `${this.API_BASE}/pixel/list/?advertiser_id=${params.accountId}&pixel_ids=["${body.pixel_id}"]`;
            const pixelResp = await fetch(pixelEndpoint, {
              method: "GET",
              headers: {
                "Access-Token": params.accessToken,
                "Content-Type": "application/json",
              },
            });

            const pixelData = await pixelResp.json();
            const pixelEvents = pixelData?.data?.pixels?.[0]?.events || [];
            const availableEvents = Array.from(new Set(
              pixelEvents
                .map((evt: any) => normalizeConversionEvent(evt?.event_name || evt?.event_type || evt?.name || ""))
                .filter(Boolean),
            ));

            const webFallbackEvents = [
              "ON_WEB_ORDER",
              "ON_WEB_CART",
              "ON_WEB_DETAIL",
              "LANDING_PAGE_VIEW",
              "PAGE_VIEW",
              "FORM",
              "ON_WEB_REGISTER",
              "ON_WEB_SEARCH",
              "ON_WEB_SUBSCRIBE",
              "ON_WEB_ADD_TO_WISHLIST",
              "CLICK_WEBSITE",
            ];

            const retryCandidates = Array.from(
              new Set([
                ...availableEvents,
                ...webFallbackEvents,
              ].filter((evt) => evt && evt !== body.optimization_event)),
            );

            console.warn(
              `⚠️ Pixel event '${body.optimization_event}' not found on pixel ${body.pixel_id}. Retrying with candidates: ${JSON.stringify(retryCandidates)}`,
            );

            for (const candidateEvent of retryCandidates) {
              const retryBody = { ...body, optimization_event: candidateEvent };

              const retryResponse = await fetch(endpoint, {
                method: "POST",
                headers: {
                  "Access-Token": params.accessToken,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(retryBody),
              });

              const retryText = await retryResponse.text();
              let retryData: any;
              try {
                retryData = JSON.parse(retryText);
              } catch {
                console.error(`Retry parse failed for event '${candidateEvent}':`, retryText);
                continue;
              }

              if (retryData.code === 0) {
                console.log(`✅ TikTok ad group created on retry with optimization_event='${candidateEvent}':`, retryData.data?.adgroup_id);
                return {
                  success: true,
                  adGroupId: retryData.data.adgroup_id,
                  platform: "tiktok",
                  metadata: retryData.data,
                };
              }

              const retryMsg = String(retryData?.message || "");
              if (!retryMsg.toLowerCase().includes("pixel event type does not exist")) {
                console.error(`Retry failed with non-pixel-event error for '${candidateEvent}':`, JSON.stringify(retryData, null, 2));
                break;
              }
            }

            console.error(`❌ Could not find a valid optimization_event for pixel ${body.pixel_id}. Pixel reported events: ${JSON.stringify(availableEvents)}`);
          } catch (retryErr: any) {
            console.error("Failed to auto-recover pixel event error:", retryErr?.message || retryErr);
          }
        }

        console.error("=== TIKTOK AD GROUP CREATION FAILED ===");
        console.error("Error code:", data.code);
        console.error("Error message:", data.message);
        console.error("Request ID:", data.request_id);
        console.error("Full error response:", JSON.stringify(data, null, 2));
        console.error("Request body that was sent:", JSON.stringify(body, null, 2));
        
        // Check for specific error patterns
        if (data.message?.includes("location")) {
          console.error("⚠️ LOCATION TARGETING ERROR - Account doesn't have permission for specified locations");
          console.error("Tried to target location_ids:", body.location_ids);
          console.error("Solution: Remove location targeting or use different locations");
        }
        if (data.message?.includes("Unknown error")) {
          console.error("⚠️ GENERIC ERROR (40002) - Possible causes:");
          console.error("  1. Missing or invalid landing_page_url");
          console.error("  2. Invalid conversion event or pixel configuration");
          console.error("  3. Missing required fields for this objective/optimization goal combination");
          console.error("  4. Account-level restrictions or permissions");
        }
        if (!body.landing_page_url) {
          console.error("⚠️ MISSING landing_page_url - This is required for WEBSITE promotion type");
        }
        
        return {
          success: false,
          adGroupId: "",
          platform: "tiktok",
          error: `${data.message || "Failed to create ad group"} (Code: ${data.code}, Request ID: ${data.request_id})`,
        };
      }
      
      console.log("TikTok ad group created successfully:", data.data?.adgroup_id);

      return {
        success: true,
        adGroupId: data.data.adgroup_id,
        platform: "tiktok",
        metadata: data.data,
      };
    } catch (error: any) {
      return {
        success: false,
        adGroupId: "",
        platform: "tiktok",
        error: error.message,
      };
    }
  }

  async createCreative(params: CreateCreativeParams): Promise<CreateCreativeResult> {
    try {
      const body: any = {
        advertiser_id: params.accountId,
        adgroup_id: params.adGroupId,
        creatives: [
          {
            ad_name: params.creativeName,
            ad_format: params.creativeType,
            ad_text: params.adText,
            call_to_action: params.callToAction,
            landing_page_url: params.landingPageUrl,
            video_id: params.assets.videoId,
            image_ids: params.assets.imageIds,
          },
        ],
      };

      const endpoint = `${this.API_BASE}/ad/create/`;
      console.log("TikTok API Full Request:", {
        endpoint,
        method: "POST",
        headers: { "Access-Token": "[REDACTED]", "Content-Type": "application/json" },
        body
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Access-Token": params.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.code !== 0 || !data.data?.ad_ids?.[0]) {
        return {
          success: false,
          creativeId: "",
          platform: "tiktok",
          error: data.message || "Failed to create creative",
        };
      }

      return {
        success: true,
        creativeId: data.data.ad_ids[0],
        platform: "tiktok",
      };
    } catch (error: any) {
      return {
        success: false,
        creativeId: "",
        platform: "tiktok",
        error: error.message,
      };
    }
  }

  async fetchMetrics(params: FetchMetricsParams): Promise<FetchMetricsResult> {
    try {
      const body = {
        advertiser_id: params.accountId,
        data_level: params.entityType.toUpperCase(),
        dimensions: [params.entityType === 'campaign' ? 'campaign_id' : 'adgroup_id'],
        metrics: ["impressions", "clicks", "spend", "conversions", "ctr", "cpc", "cpm"],
        start_date: params.startDate,
        end_date: params.endDate,
        page_size: 1000,
      };

      const endpoint = `${this.API_BASE}/reports/integrated/get/`;
      console.log("TikTok API Full Request:", {
        endpoint,
        method: "POST",
        headers: { "Access-Token": "[REDACTED]", "Content-Type": "application/json" },
        body
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Access-Token": params.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.code !== 0) {
        return {
          success: false,
          metrics: [],
          platform: "tiktok",
          error: data.message,
        };
      }

      const normalizedMetrics = (data.data.list || []).map((item: any) => ({
        entityId: item.dimensions.campaign_id || item.dimensions.adgroup_id,
        date: item.dimensions.stat_time_day,
        impressions: parseInt(item.metrics.impressions || "0"),
        clicks: parseInt(item.metrics.clicks || "0"),
        spend: parseFloat(item.metrics.spend || "0") / 100,
        conversions: parseInt(item.metrics.conversions || "0"),
        ctr: parseFloat(item.metrics.ctr || "0"),
        cpc: parseFloat(item.metrics.cpc || "0") / 100,
        cpm: parseFloat(item.metrics.cpm || "0") / 100,
      }));

      return {
        success: true,
        metrics: normalizedMetrics,
        platform: "tiktok",
      };
    } catch (error: any) {
      return {
        success: false,
        metrics: [],
        platform: "tiktok",
        error: error.message,
      };
    }
  }

  // Helper methods for TikTok-specific mapping
  private mapLocationIds(countryCodes: string[]): string[] {
    // Map country codes to TikTok location IDs (GeoName IDs used by TikTok API)
    const countryCodeToLocationId: Record<string, number> = {
      // Americas
      "US": 6252001, "CA": 6251999, "MX": 3996063, "BR": 3469034, "AR": 3865483,
      "CL": 3895114, "CO": 3686110, "PE": 3932488, "VE": 3625428,
      // Europe - Western
      "GB": 2635167, "DE": 2921044, "FR": 3017382, "IT": 3175395, "ES": 2510769,
      "NL": 2750405, "BE": 2802361, "CH": 2658434, "AT": 2782113, "IE": 2963597,
      "PT": 2264397, "GR": 390903,
      // Europe - Nordic
      "SE": 2661886, "NO": 3144096, "DK": 2623032, "FI": 660013,
      // Europe - Central/Eastern
      "PL": 798544, "CZ": 3077311, "RO": 798549, "HU": 719819, "UA": 690791, "RU": 2017370,
      // Asia-Pacific
      "AU": 2077456, "NZ": 2186224, "JP": 1861060, "KR": 1835841, "CN": 1814991,
      "IN": 1269750, "ID": 1643084, "TH": 1605651, "VN": 1562822, "PH": 1694008,
      "MY": 1733045, "SG": 1880251,
      // Middle East & North Africa
      "AE": 290557, "SA": 102358, "EG": 357994, "IL": 294640, "TR": 298795,
      "KW": 285570, "BH": 290291, "QA": 289688, "OM": 286963, "LB": 272103,
      // Africa
      "ZA": 953987, "NG": 2328926,
    };

    return countryCodes
      .map(code => countryCodeToLocationId[code.toUpperCase()])
      .filter(id => id !== undefined)
      .map(id => String(id));
  }

  private mapGender(genders?: number[]): string {
    // If no genders specified or empty array, target all genders
    if (!genders || genders.length === 0) {
      return "GENDER_UNLIMITED";
    }
    
    // If targeting both male and female, use unlimited
    const hasMale = genders.includes(1);
    const hasFemale = genders.includes(2);
    
    if (hasMale && hasFemale) return "GENDER_UNLIMITED";
    if (hasMale) return "GENDER_MALE";
    if (hasFemale) return "GENDER_FEMALE";
    
    // Default to unlimited if no valid gender codes
    return "GENDER_UNLIMITED";
  }

  private mapAgeGroups(ageMin?: number, ageMax?: number): string[] {
    // TikTok age groups: AGE_13_17, AGE_18_24, AGE_25_34, AGE_35_44, AGE_45_54, AGE_55_100
    const ageGroups = [];
    const min = ageMin || 18;
    const max = ageMax || 65;

    if (min <= 17) ageGroups.push("AGE_13_17");
    if (min <= 24 && max >= 18) ageGroups.push("AGE_18_24");
    if (min <= 34 && max >= 25) ageGroups.push("AGE_25_34");
    if (min <= 44 && max >= 35) ageGroups.push("AGE_35_44");
    if (min <= 54 && max >= 45) ageGroups.push("AGE_45_54");
    if (max >= 55) ageGroups.push("AGE_55_100");

    return ageGroups.length > 0 ? ageGroups : ["AGE_18_100"];
  }
}

// =====================================================================
// Google Ads Adapter Implementation
// Supports: Search, Display, Video, PMax, Demand Gen
// =====================================================================
class GoogleAdsAdapter implements PlatformAdapter {
  private readonly API_BASE = `https://googleads.googleapis.com/v23`;

  private summarizeGoogleAdsError(errorText: string): string {
    try {
      const parsed = JSON.parse(errorText);
      const firstError = parsed?.error?.details?.[0]?.errors?.[0];
      const contextError = firstError?.errorCode?.contextError;
      const trigger = firstError?.trigger?.stringValue;

      if (contextError === "OPERATION_NOT_PERMITTED_FOR_CONTEXT" && trigger === "OWNED_AND_OPERATED") {
        return "This Google ad group does not accept Responsive Search Ads. The current phase is using a Video or Demand Gen context, so this creative type is not supported there.";
      }

      return firstError?.message || parsed?.error?.message || errorText;
    } catch {
      return errorText;
    }
  }

  private getHeaders(accessToken: string, developerToken: string, loginCustomerId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    if (loginCustomerId) {
      headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");
    }
    return headers;
  }

  /**
   * Upload an image (downloaded from a URL) to the Google Ads asset library
   * as an imageAsset. Returns the asset resource name (customers/X/assets/Y).
   */
  private async uploadImageAsset(
    customerId: string,
    headers: Record<string, string>,
    imageUrl: string,
    name: string,
  ): Promise<string> {
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) {
      throw new Error(`Failed to download image (${imgResp.status})`);
    }
    const arrayBuffer = await imgResp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + chunkSize)),
      );
    }
    const base64Data = btoa(binary);

    const safeName = `${(name || "image").replace(/[^a-zA-Z0-9_\- ]/g, "").substring(0, 80)} ${Date.now()}`;
    const assetOp = {
      create: {
        name: safeName,
        type: "IMAGE",
        imageAsset: { data: base64Data },
      },
    };

    const url = `${this.API_BASE}/customers/${customerId}/assets:mutate`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations: [assetOp] }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Image asset upload failed: ${this.summarizeGoogleAdsError(errText)}`);
    }

    const data = await resp.json();
    const resourceName = data?.results?.[0]?.resourceName;
    if (!resourceName) {
      throw new Error("Image asset upload returned no resourceName");
    }
    return resourceName;
  }

  /**
   * Ensure a YouTube video asset exists in the account; create it if not.
   * Returns the asset resource name (customers/X/assets/Y).
   */
  private async ensureYouTubeVideoAsset(
    customerId: string,
    headers: Record<string, string>,
    youtubeVideoId: string,
    name: string,
  ): Promise<string> {
    try {
      const gaql = `SELECT asset.resource_name, asset.youtube_video_asset.youtube_video_id FROM asset WHERE asset.type = 'YOUTUBE_VIDEO' AND asset.youtube_video_asset.youtube_video_id = '${youtubeVideoId}' LIMIT 1`;
      const searchUrl = `${this.API_BASE}/customers/${customerId}/googleAds:search`;
      const searchResp = await fetch(searchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: gaql }),
      });
      if (searchResp.ok) {
        const searchData = await searchResp.json();
        const existing = searchData?.results?.[0]?.asset?.resourceName;
        if (existing) return existing;
      }
    } catch (e) {
      console.warn("[google.ensureYouTubeVideoAsset] lookup failed:", e);
    }

    const safeName = `${(name || "youtube").replace(/[^a-zA-Z0-9_\- ]/g, "").substring(0, 80)} ${youtubeVideoId}`;
    const assetOp = {
      create: {
        name: safeName,
        type: "YOUTUBE_VIDEO",
        youtubeVideoAsset: { youtubeVideoId },
      },
    };

    const url = `${this.API_BASE}/customers/${customerId}/assets:mutate`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations: [assetOp] }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`YouTube video asset creation failed: ${this.summarizeGoogleAdsError(errText)}`);
    }

    const data = await resp.json();
    const resourceName = data?.results?.[0]?.resourceName;
    if (!resourceName) {
      throw new Error("YouTube video asset creation returned no resourceName");
    }
    return resourceName;
  }

  /**
   * Ensure a CALL_TO_ACTION asset exists for the given CTA enum value
   * (e.g. "LEARN_MORE"). Demand Gen Video Responsive Ads reference these via
   * `AdCallToActionAsset.asset` (a resource name), NOT inline text.
   * Returns the asset resource name.
   */
  private async ensureCallToActionAsset(
    customerId: string,
    headers: Record<string, string>,
    ctaEnum: string,
  ): Promise<string> {
    const enumValue = (ctaEnum || "LEARN_MORE").toUpperCase();
    try {
      const gaql = `SELECT asset.resource_name, asset.call_to_action_asset.call_to_action FROM asset WHERE asset.type = 'CALL_TO_ACTION' AND asset.call_to_action_asset.call_to_action = '${enumValue}' LIMIT 1`;
      const searchUrl = `${this.API_BASE}/customers/${customerId}/googleAds:search`;
      const searchResp = await fetch(searchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: gaql }),
      });
      if (searchResp.ok) {
        const searchData = await searchResp.json();
        const existing = searchData?.results?.[0]?.asset?.resourceName;
        if (existing) return existing;
      }
    } catch (e) {
      console.warn("[google.ensureCallToActionAsset] lookup failed:", e);
    }

    const assetOp = {
      create: {
        name: `CTA ${enumValue} ${Date.now()}`,
        callToActionAsset: { callToAction: enumValue },
      },
    };

    const url = `${this.API_BASE}/customers/${customerId}/assets:mutate`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations: [assetOp] }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Call-to-action asset creation failed: ${this.summarizeGoogleAdsError(errText)}`);
    }

    const data = await resp.json();
    const resourceName = data?.results?.[0]?.resourceName;
    if (!resourceName) {
      throw new Error("Call-to-action asset creation returned no resourceName");
    }
    return resourceName;
  }

  async createCampaign(params: CreateCampaignParams): Promise<CreateCampaignResult> {
    try {
      const customerId = params.accountId.replace(/-/g, "");
      const developerToken = params.metadata?.developerToken || "";
      const loginCustomerId = params.metadata?.loginCustomerId;
      const headers = this.getHeaders(params.accessToken, developerToken, loginCustomerId);

      // Step 1: Create campaign budget
      const budgetMicros = this.normalizeBudgetMicros(params.budget);
      const budgetOp = {
        create: {
          name: `${params.campaignName} Budget`,
          amountMicros: budgetMicros,
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      };

      const budgetUrl = `${this.API_BASE}/customers/${customerId}/campaignBudgets:mutate`;
      const budgetResp = await fetch(budgetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [budgetOp] }),
      });

      if (!budgetResp.ok) {
        const errText = await budgetResp.text();
        console.error("Google Ads budget creation failed:", errText);
        return { success: false, campaignId: "", platform: "google", error: `Budget creation failed: ${errText}` };
      }

      const budgetData = await budgetResp.json();
      const budgetResourceName = budgetData.results?.[0]?.resourceName;
      if (!budgetResourceName) {
        return { success: false, campaignId: "", platform: "google", error: "No budget resource name returned" };
      }

      // Step 2: Create campaign
      const requestedChannelType = params.metadata?.advertisingChannelType || "SEARCH";
      let startDateTime = this.toGoogleDateTime(params.startDate, "start");
      const endDateTime = params.endDate ? this.toGoogleDateTime(params.endDate, "end") : undefined;

      // Clamp start date to today if it's in the past
      const now = new Date();
      const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")} 00:00:00`;
      if (startDateTime < todayStr) {
        console.warn(`⚠️ Start date ${startDateTime} is in the past, clamping to today: ${todayStr}`);
        startDateTime = todayStr;
      }
      const buildCampaignOperation = (channelType: string, biddingConfig: Record<string, any>) => {
        const hasBrandAssets = !!(params.metadata?.businessName);
        const brandGuidelinesEnabled = channelType === "PERFORMANCE_MAX"
          ? (params.metadata?.brandGuidelines === true && hasBrandAssets)
          : undefined;

        return {
          create: {
            name: params.campaignName,
            advertisingChannelType: channelType,
            status: params.status === "PAUSED" ? "PAUSED" : "ENABLED",
            campaignBudget: budgetResourceName,
            startDateTime,
            ...(endDateTime ? { endDateTime } : {}),
            ...this.sanitizeCampaignBiddingConfig(biddingConfig),
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
            ...(channelType === "PERFORMANCE_MAX" ? { brandGuidelinesEnabled: brandGuidelinesEnabled ?? false } : {}),
            ...((channelType === "PERFORMANCE_MAX" || channelType === "SHOPPING") && params.metadata?.merchantCenterId ? {
              shoppingSetting: {
                merchantId: String(params.metadata.merchantCenterId),
                ...(params.metadata.feedLabel ? { feedLabel: params.metadata.feedLabel } : {}),
              },
            } : {}),
          },
        };
      };

      const requestedStrategyName = this.normalizeCampaignBiddingStrategy(
        requestedChannelType,
        params.metadata?.biddingStrategy || "MAXIMIZE_CONVERSIONS",
      );
      const requestedBiddingStrategy = this.sanitizeCampaignBiddingConfig(this.buildBiddingStrategy(
        requestedStrategyName,
        params.metadata?.bidAmount,
      ));

      console.log(
        `📊 Google Ads bidding normalization: requested=${params.metadata?.biddingStrategy || "MAXIMIZE_CONVERSIONS"}, effective=${requestedStrategyName}, channel=${requestedChannelType}, fields=${Object.keys(requestedBiddingStrategy).join(",")}`,
      );

      const campaignUrl = `${this.API_BASE}/customers/${customerId}/campaigns:mutate`;
      let finalChannelType = requestedChannelType;
      let finalBiddingStrategy = requestedBiddingStrategy;

      let campaignResp = await fetch(campaignUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [buildCampaignOperation(requestedChannelType, requestedBiddingStrategy)] }),
      });

      if (!campaignResp.ok) {
        const errText = await campaignResp.text();

        const shouldFallbackFromVideo =
          requestedChannelType === "VIDEO" &&
          errText.includes("MUTATE_NOT_ALLOWED") &&
          errText.includes("\"VIDEO\"");

        if (!shouldFallbackFromVideo) {
          console.error("Google Ads campaign creation failed:", errText);
          return { success: false, campaignId: "", platform: "google", error: `Campaign creation failed: ${errText}` };
        }

        console.warn("⚠️ VIDEO campaign mutate not allowed for this account, retrying with DEMAND_GEN fallback");
        finalChannelType = "DEMAND_GEN";

        const fallbackRequestedStrategy = params.metadata?.biddingStrategy || "MAXIMIZE_CONVERSIONS";
        const fallbackStrategyName = this.normalizeCampaignBiddingStrategy(
          finalChannelType,
          fallbackRequestedStrategy === "TARGET_CPM" ? "MAXIMIZE_CLICKS" : fallbackRequestedStrategy,
        );
        finalBiddingStrategy = this.sanitizeCampaignBiddingConfig(
          this.buildBiddingStrategy(fallbackStrategyName, params.metadata?.bidAmount),
        );

        console.log(
          `📊 Google Ads fallback bidding normalization: requested=${fallbackRequestedStrategy}, effective=${fallbackStrategyName}, channel=${finalChannelType}, fields=${Object.keys(finalBiddingStrategy).join(",")}`,
        );

        campaignResp = await fetch(campaignUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ operations: [buildCampaignOperation(finalChannelType, finalBiddingStrategy)] }),
        });

        if (!campaignResp.ok) {
          const fallbackErrText = await campaignResp.text();
          console.error("Google Ads campaign creation failed after VIDEO fallback:", fallbackErrText);
          return {
            success: false,
            campaignId: "",
            platform: "google",
            error: `Campaign creation failed: ${fallbackErrText}`,
          };
        }
      }

      const campaignData = await campaignResp.json();
      const campaignResourceName = campaignData.results?.[0]?.resourceName;
      // Extract campaign ID from resource name "customers/123/campaigns/456"
      const campaignId = campaignResourceName?.split("/").pop() || "";

      console.log(`✅ Google Ads campaign created: ${campaignId}`);

      return {
        success: true,
        campaignId,
        platform: "google",
        metadata: {
          resourceName: campaignResourceName,
          budgetResourceName,
          channelType: finalChannelType,
          biddingStrategy: params.metadata?.biddingStrategy,
          effectiveBiddingStrategy: finalChannelType === requestedChannelType ? requestedStrategyName : undefined,
          fallbackApplied: finalChannelType !== requestedChannelType,
          originalChannelType: requestedChannelType,
        },
      };
    } catch (error: any) {
      return { success: false, campaignId: "", platform: "google", error: error.message };
    }
  }

  async updateCampaign(params: UpdateCampaignParams): Promise<UpdateCampaignResult> {
    try {
      const customerId = params.accountId.replace(/-/g, "");
      const developerToken = params.updates?.developerToken || "";
      const loginCustomerId = params.updates?.loginCustomerId;
      const headers = this.getHeaders(params.accessToken, developerToken, loginCustomerId);

      const resourceName = `customers/${customerId}/campaigns/${params.campaignId}`;
      const updateFields: Record<string, any> = {};
      const updateMask: string[] = [];

      if (params.updates.name) { updateFields.name = params.updates.name; updateMask.push("name"); }
      if (params.updates.status) { updateFields.status = params.updates.status; updateMask.push("status"); }

      const campaignOp = {
        update: { resourceName, ...updateFields },
        updateMask: updateMask.join(","),
      };

      const url = `${this.API_BASE}/customers/${customerId}/campaigns:mutate`;
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [campaignOp] }),
      });

      const ok = resp.ok;
      const body = await resp.text();
      return { success: ok, campaignId: params.campaignId, platform: "google", error: ok ? undefined : body };
    } catch (error: any) {
      return { success: false, campaignId: params.campaignId, platform: "google", error: error.message };
    }
  }

  async createAdGroup(params: CreateAdGroupParams): Promise<CreateAdGroupResult> {
    try {
      const customerId = params.accountId.replace(/-/g, "");
      const developerToken = params.targeting?.developerToken || "";
      const loginCustomerId = params.targeting?.loginCustomerId;
      const headers = this.getHeaders(params.accessToken, developerToken, loginCustomerId);

      const campaignResourceName = `customers/${customerId}/campaigns/${params.campaignId}`;

      const requestedAdGroupType = params.targeting?.adGroupType;
      const explicitType =
        typeof requestedAdGroupType === "string" && requestedAdGroupType.startsWith("SEARCH_")
          ? requestedAdGroupType
          : undefined;

      const adGroupOp = {
        create: {
          name: params.adGroupName,
          campaign: campaignResourceName,
          status: params.status === "PAUSED" ? "PAUSED" : "ENABLED",
          ...(explicitType ? { type: explicitType } : {}),
          ...(params.bidAmount ? { cpcBidMicros: String(Math.round(params.bidAmount * 1_000_000)) } : {}),
        },
      };

      const url = `${this.API_BASE}/customers/${customerId}/adGroups:mutate`;
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [adGroupOp] }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return { success: false, adGroupId: "", platform: "google", error: errText };
      }

      const data = await resp.json();
      const adGroupResourceName = data.results?.[0]?.resourceName;
      const adGroupId = adGroupResourceName?.split("/").pop() || "";

      // Add targeting criteria if provided
      if (params.targeting?.keywords?.length) {
        console.log(`📝 Adding ${params.targeting.keywords.length} keywords to Google Ads ad group ${adGroupId}:`, 
          JSON.stringify(params.targeting.keywords.slice(0, 5)));
        await this.addKeywordCriteria(customerId, adGroupId, params.targeting.keywords, headers);
      } else {
        console.log(`ℹ️ No keywords to add to Google Ads ad group ${adGroupId} (keywords: ${JSON.stringify(params.targeting?.keywords)})`);
      }

      // Add audience targeting criteria at ad group level
      if (params.targeting?.audiences?.length) {
        console.log(`🎯 Adding ${params.targeting.audiences.length} audience criteria to ad group ${adGroupId}`);
        await this.addAudienceCriteria(customerId, adGroupId, params.targeting.audiences, headers);
      }

      // Add geo targeting at ad group level (for Demand Gen, Display, etc.)
      if (params.targeting?.adGroupGeoTargets?.length) {
        console.log(`🌍 Adding ${params.targeting.adGroupGeoTargets.length} geo targets to ad group ${adGroupId}`);
        await this.addAdGroupGeoCriteria(customerId, adGroupId, params.targeting.adGroupGeoTargets, headers);
      }

      // Add language targeting at ad group level
      if (params.targeting?.adGroupLanguages?.length) {
        console.log(`🗣️ Adding ${params.targeting.adGroupLanguages.length} language targets to ad group ${adGroupId}`);
        await this.addAdGroupLanguageCriteria(customerId, adGroupId, params.targeting.adGroupLanguages, headers);
      }

      // Add demographic targeting (gender, age) at ad group level
      if (params.targeting?.genders || params.targeting?.ageMin || params.targeting?.ageMax) {
        await this.addDemographicCriteria(customerId, adGroupId, params.targeting, headers);
      }

      return {
        success: true,
        adGroupId,
        platform: "google",
        metadata: { resourceName: adGroupResourceName },
      };
    } catch (error: any) {
      return { success: false, adGroupId: "", platform: "google", error: error.message };
    }
  }

  async createCreative(params: CreateCreativeParams): Promise<CreateCreativeResult> {
    try {
      const customerId = params.accountId.replace(/-/g, "");
      const developerToken = (params as any).developerToken || "";
      const loginCustomerId = (params as any).loginCustomerId;
      const headers = this.getHeaders(params.accessToken, developerToken, loginCustomerId);

      const adGroupResourceName = `customers/${customerId}/adGroups/${params.adGroupId}`;

      // Discover the parent campaign's advertisingChannelType so we choose the right ad format.
      // RSA is ONLY valid for SEARCH campaigns. For VIDEO/DEMAND_GEN/DISPLAY/PMAX,
      // headlines & descriptions are parameters of the corresponding ad format
      // (videoResponsiveAd, demandGenVideoResponsiveAd, responsiveDisplayAd, asset group), not RSA.
      let channelType = "SEARCH";
      try {
        const gaql = `SELECT campaign.advertising_channel_type, campaign.advertising_channel_sub_type FROM ad_group WHERE ad_group.id = ${params.adGroupId} LIMIT 1`;
        const searchUrl = `${this.API_BASE}/customers/${customerId}/googleAds:search`;
        const searchResp = await fetch(searchUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: gaql }),
        });
        if (searchResp.ok) {
          const searchData = await searchResp.json();
          const row = searchData?.results?.[0];
          channelType = row?.campaign?.advertisingChannelType || "SEARCH";
        }
      } catch (lookupErr) {
        console.warn("[google.createCreative] Failed to resolve channel type, defaulting to SEARCH:", lookupErr);
      }

      // Collect headlines/descriptions provided by the caller (text-asset overrides),
      // falling back to legacy single-string fields for backwards compatibility.
      const rawHeadlines: string[] = Array.isArray((params as any).headlines) && (params as any).headlines.length > 0
        ? (params as any).headlines
        : [params.creativeName, params.adText, params.callToAction].filter(Boolean);
      const rawDescriptions: string[] = Array.isArray((params as any).descriptions) && (params as any).descriptions.length > 0
        ? (params as any).descriptions
        : [params.adText, params.creativeName].filter(Boolean);

      const headlines = rawHeadlines
        .map((h: string) => String(h || "").trim())
        .filter(Boolean)
        .map((h: string) => h.substring(0, 30));
      const descriptions = rawDescriptions
        .map((d: string) => String(d || "").trim())
        .filter(Boolean)
        .map((d: string) => d.substring(0, 90));
      const longHeadline = (headlines[0] || params.creativeName || "Learn More").substring(0, 90);
      const businessName = (params as any).businessName || params.creativeName || "Brand";

      const upperChannel = String(channelType || "SEARCH").toUpperCase();
      let ad: Record<string, any>;

      if (upperChannel === "SEARCH") {
        if (headlines.length < 3 || descriptions.length < 2) {
          return {
            success: false,
            creativeId: "",
            platform: "google",
            error: `Responsive Search Ad requires at least 3 headlines and 2 descriptions (got ${headlines.length} headlines, ${descriptions.length} descriptions).`,
          };
        }
        ad = {
          responsiveSearchAd: {
            headlines: headlines.slice(0, 15).map((text) => ({ text })),
            descriptions: descriptions.slice(0, 4).map((text) => ({ text })),
          },
          finalUrls: [params.landingPageUrl],
        };
      } else if (upperChannel === "DISPLAY") {
        // ResponsiveDisplayAd accepts an optional `callToActionText` string —
        // must be a Google-recognised display phrase, not a raw enum.
        const ctaDisplayDisp = mapGoogleCtaToDisplay(String(params.callToAction || "").trim());
        ad = {
          responsiveDisplayAd: {
            headlines: headlines.slice(0, 5).map((text) => ({ text })),
            longHeadline: { text: longHeadline },
            descriptions: descriptions.slice(0, 5).map((text) => ({ text })),
            businessName,
            ...(ctaDisplayDisp ? { callToActionText: ctaDisplayDisp } : {}),
          },
          finalUrls: [params.landingPageUrl],
        };
      } else if (upperChannel === "VIDEO" || upperChannel === "DEMAND_GEN") {
        // For VIDEO/DEMAND_GEN, the actual creative is a video/image asset.
        // Headlines & descriptions are parameters of that asset.
        // We auto-upload the media to Google Ads as assets, then build the appropriate ad.
        const assets = (params as any).assets || {};
        const youtubeVideoId: string | undefined = assets.youtubeVideoId
          || extractYouTubeId(assets.videoUrl);
        const imageUrl: string | undefined = assets.imageUrl
          || assets.imageUrls?.[0];
        const logoUrl: string | undefined = assets.logoUrl;

        // Demand Gen / Video field limits (Google Ads API):
        //   headline: 40 chars, description: 90, longHeadline: 90, businessName: 25
        // Re-derive from raw inputs because the upstream `headlines` array was
        // already clipped to 30 chars for SEARCH RSA. We also strip file extensions
        // from businessName when callers accidentally pass a creative filename.
        const dgHeadlines = rawHeadlines
          .map((h: string) => String(h || "").trim())
          .filter(Boolean)
          .map((h: string) => h.substring(0, 40));
        const dgDescriptions = rawDescriptions
          .map((d: string) => String(d || "").trim())
          .filter(Boolean)
          .map((d: string) => d.substring(0, 90));
        const dgLongHeadline = (dgHeadlines[0] || params.creativeName || "Learn More").substring(0, 90);
        const rawBusinessName = String((params as any).businessName || params.creativeName || "Brand").trim();
        // Drop trailing file extension (e.g. ".JPG", ".mp4") if present.
        const cleanedBusinessName = rawBusinessName.replace(/\.[a-zA-Z0-9]{2,5}$/, "");
        const businessNameDg = (cleanedBusinessName || "Brand").substring(0, 25);

        // Validate minimums for Demand Gen
        if (dgHeadlines.length === 0 || dgDescriptions.length === 0) {
          return {
            success: false,
            creativeId: "",
            platform: "google",
            error: `Demand Gen ads require at least 1 headline and 1 description (got ${dgHeadlines.length} headlines, ${dgDescriptions.length} descriptions). Add text assets to this creative before pushing.`,
          };
        }

        try {
          if (youtubeVideoId) {
            // ---- Demand Gen / Video: video ad ----
            const youtubeAssetResource = await this.ensureYouTubeVideoAsset(
              customerId,
              headers,
              youtubeVideoId,
              params.creativeName,
            );

            // Upload optional logo image as imageAsset (square logos help Demand Gen)
            let logoAssetResource: string | null = null;
            if (logoUrl) {
              try {
                logoAssetResource = await this.uploadImageAsset(
                  customerId,
                  headers,
                  logoUrl,
                  `${params.creativeName} logo`,
                );
              } catch (e) {
                console.warn("[google.createCreative] Failed to upload logo asset:", e);
              }
            }

            // DemandGenVideoResponsiveAdInfo.call_to_actions is a repeated
            // AdCallToActionAsset whose only field is `asset` (a resource name
            // pointing at a CALL_TO_ACTION asset). We must create/lookup the
            // CTA asset first, then reference it.
            const ctaEnumDg = mapGoogleCtaToEnum(params.callToAction);
            let ctaAssetResource: string | null = null;
            try {
              ctaAssetResource = await this.ensureCallToActionAsset(
                customerId,
                headers,
                ctaEnumDg,
              );
            } catch (e) {
              console.warn("[google.createCreative] CTA asset creation failed, omitting:", e);
            }

            ad = {
              demandGenVideoResponsiveAd: {
                headlines: dgHeadlines.slice(0, 5).map((text) => ({ text })),
                longHeadlines: [{ text: dgLongHeadline }],
                descriptions: dgDescriptions.slice(0, 5).map((text) => ({ text })),
                // businessName is an AdTextAsset, not a raw string.
                businessName: { text: businessNameDg },
                videos: [{ asset: youtubeAssetResource }],
                ...(logoAssetResource ? { logoImages: [{ asset: logoAssetResource }] } : {}),
                ...(ctaAssetResource ? { callToActions: [{ asset: ctaAssetResource }] } : {}),
              },
              finalUrls: [params.landingPageUrl],
            };
          } else if (imageUrl) {
            // ---- Demand Gen: image ad ----
            const imageAssetResource = await this.uploadImageAsset(
              customerId,
              headers,
              imageUrl,
              params.creativeName,
            );

            let logoAssetResource: string | null = null;
            if (logoUrl) {
              try {
                logoAssetResource = await this.uploadImageAsset(
                  customerId,
                  headers,
                  logoUrl,
                  `${params.creativeName} logo`,
                );
              } catch (e) {
                console.warn("[google.createCreative] Failed to upload logo asset:", e);
              }
            }

            const ctaDisplayMa = mapGoogleCtaToDisplay(String(params.callToAction || "").trim()) || "Learn more";

            ad = {
              demandGenMultiAssetAd: {
                headlines: headlines.slice(0, 5).map((text) => ({ text })),
                descriptions: descriptions.slice(0, 5).map((text) => ({ text })),
                // businessName is an AdTextAsset, not a raw string.
                businessName: { text: businessNameDg },
                marketingImages: [{ asset: imageAssetResource }],
                ...(logoAssetResource ? { logoImages: [{ asset: logoAssetResource }] } : {}),
                // DemandGenMultiAssetAdInfo uses a plain string field.
                callToActionText: ctaDisplayMa,
              },
              finalUrls: [params.landingPageUrl],
            };
          } else {
            return {
              success: false,
              creativeId: "",
              platform: "google",
              error:
                `${upperChannel === "VIDEO" ? "Video" : "Demand Gen"} ads require a video (YouTube) or image asset. ` +
                `Attach a YouTube video URL or an image to this creative before pushing.`,
            };
          }
        } catch (assetErr: any) {
          return {
            success: false,
            creativeId: "",
            platform: "google",
            error: `Failed to prepare Google Ads asset: ${assetErr?.message || assetErr}`,
          };
        }
      } else if (upperChannel === "PERFORMANCE_MAX") {
        return {
          success: false,
          creativeId: "",
          platform: "google",
          error:
            `Performance Max campaigns use Asset Groups, not standalone ads. Headlines/descriptions must be pushed via the asset group flow.`,
        };
      } else {
        return {
          success: false,
          creativeId: "",
          platform: "google",
          error: `Unsupported Google Ads channel type "${channelType}" for text-asset push.`,
        };
      }

      const adOp = { create: { adGroup: adGroupResourceName, status: "ENABLED", ad } };

      const url = `${this.API_BASE}/customers/${customerId}/adGroupAds:mutate`;
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [adOp] }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return {
          success: false,
          creativeId: "",
          platform: "google",
          error: this.summarizeGoogleAdsError(errText),
        };
      }

      const data = await resp.json();
      const adResourceName = data.results?.[0]?.resourceName;
      const adId = adResourceName?.split("/").pop() || "";

      return { success: true, creativeId: adId, platform: "google" };
    } catch (error: any) {
      return { success: false, creativeId: "", platform: "google", error: error.message };
    }
  }

  async fetchMetrics(params: FetchMetricsParams): Promise<FetchMetricsResult> {
    try {
      const customerId = params.accountId.replace(/-/g, "");
      const developerToken = (params as any).developerToken || "";
      const loginCustomerId = (params as any).loginCustomerId;
      const headers = this.getHeaders(params.accessToken, developerToken, loginCustomerId);

      const entityIds = params.entityIds.join(", ");
      const gaql = `
        SELECT
          campaign.id, campaign.name,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.conversions, metrics.conversions_value,
          segments.date
        FROM campaign
        WHERE campaign.id IN (${entityIds})
          AND segments.date BETWEEN '${params.startDate}' AND '${params.endDate}'
        ORDER BY segments.date DESC
      `;

      const searchUrl = `${this.API_BASE}/customers/${customerId}/googleAds:searchStream`;
      const resp = await fetch(searchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: gaql }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return { success: false, metrics: [], platform: "google", error: errText };
      }

      const data = await resp.json();
      const rows = data?.[0]?.results || [];

      const metrics = rows.map((r: any) => ({
        entityId: String(r.campaign?.id),
        date: r.segments?.date,
        impressions: Number(r.metrics?.impressions || 0),
        clicks: Number(r.metrics?.clicks || 0),
        spend: Number(r.metrics?.costMicros || 0) / 1_000_000,
        conversions: Number(r.metrics?.conversions || 0),
        conversionValue: Number(r.metrics?.conversionsValue || 0),
      }));

      return { success: true, metrics, platform: "google" };
    } catch (error: any) {
      return { success: false, metrics: [], platform: "google", error: error.message };
    }
  }

  private normalizeBudgetMicros(amount: number): string {
    const minimumCurrencyUnitMicros = 10_000; // 0.01 in micros (for 2-decimal currencies)
    const rawMicros = Math.round(Number(amount || 0) * 1_000_000);
    const normalizedMicros = Math.round(rawMicros / minimumCurrencyUnitMicros) * minimumCurrencyUnitMicros;
    return String(normalizedMicros);
  }

  private toGoogleDateTime(dateInput: string, boundary: "start" | "end"): string {
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
      const datePart = dateInput.split("T")[0];
      return `${datePart} ${boundary === "start" ? "00:00:00" : "23:59:59"}`;
    }

    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${boundary === "start" ? "00:00:00" : "23:59:59"}`;
  }

  private buildBiddingStrategy(strategy: string, bidAmount?: number): Record<string, any> {
    switch (strategy) {
      case "MAXIMIZE_CONVERSIONS":
        return { maximizeConversions: bidAmount ? { targetCpaMicros: String(Math.round(bidAmount * 1_000_000)) } : {} };
      case "MAXIMIZE_CONVERSION_VALUE":
        return { maximizeConversionValue: bidAmount ? { targetRoas: bidAmount } : {} };
      case "TARGET_CPA":
        return { targetCpa: { targetCpaMicros: String(Math.round((bidAmount || 10) * 1_000_000)) } };
      case "TARGET_ROAS":
        return { targetRoas: { targetRoas: bidAmount || 2.0 } };
      case "MAXIMIZE_CLICKS":
        return { targetSpend: bidAmount ? { cpcBidCeilingMicros: String(Math.round(bidAmount * 1_000_000)) } : {} };
      case "TARGET_CPM":
        return { targetCpm: {} };
      case "MANUAL_CPC":
        return { manualCpc: { enhancedCpcEnabled: true } };
      default:
        return { maximizeConversions: {} };
    }
  }

  private normalizeCampaignBiddingStrategy(channelType: string, strategy: string): string {
    const normalizedChannelType = (channelType || "").toUpperCase();
    const normalizedStrategy = (strategy || "MAXIMIZE_CONVERSIONS").toUpperCase();

    const unsupportedByChannel: Record<string, Set<string>> = {
      PERFORMANCE_MAX: new Set(["MAXIMIZE_CLICKS", "TARGET_CPM", "MANUAL_CPC", "TARGET_IMPRESSION_SHARE"]),
      SHOPPING: new Set(["MAXIMIZE_CLICKS", "TARGET_CPM", "TARGET_IMPRESSION_SHARE"]),
    };

    if (unsupportedByChannel[normalizedChannelType]?.has(normalizedStrategy)) {
      console.warn(
        `⚠️ Unsupported Google Ads bidding strategy ${normalizedStrategy} for ${normalizedChannelType}; falling back to MAXIMIZE_CONVERSIONS`,
      );
      return "MAXIMIZE_CONVERSIONS";
    }

    return normalizedStrategy;
  }

  private sanitizeCampaignBiddingConfig(biddingConfig: Record<string, any>): Record<string, any> {
    if (!biddingConfig || typeof biddingConfig !== "object") {
      return {};
    }

    const sanitizedConfig = { ...biddingConfig };

    if ("maximizeClicks" in sanitizedConfig) {
      const maximizeClicksConfig = sanitizedConfig.maximizeClicks;
      delete sanitizedConfig.maximizeClicks;
      sanitizedConfig.targetSpend = maximizeClicksConfig && typeof maximizeClicksConfig === "object"
        ? maximizeClicksConfig
        : {};
    }

    return sanitizedConfig;
  }

  private async addKeywordCriteria(
    customerId: string,
    adGroupId: string,
    keywords: Array<{ text: string; matchType?: string }>,
    headers: Record<string, string>
  ): Promise<void> {
    console.log(`📝 addKeywordCriteria: Adding ${keywords.length} keywords to ad group ${adGroupId}`);
    
    const operations = keywords.map((kw) => ({
      create: {
        adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
        status: "ENABLED",
        keyword: {
          text: kw.text,
          matchType: kw.matchType || "BROAD",
        },
      },
    }));

    console.log(`📝 Keyword operations sample:`, JSON.stringify(operations.slice(0, 3), null, 2));

    const url = `${this.API_BASE}/customers/${customerId}/adGroupCriteria:mutate`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`❌ Failed to add keyword criteria to ad group ${adGroupId}:`, errText);
    } else {
      const data = await resp.json();
      console.log(`✅ Added ${keywords.length} keywords to ad group ${adGroupId}. Results: ${data.results?.length || 0}`);
    }
  }

  // Add campaign-level geo targeting criteria
  async addCampaignGeoCriteria(
    customerId: string,
    campaignId: string,
    countryCodes: string[],
    locationTargetingType: string,
    headers: Record<string, string>,
    channelType?: string
  ): Promise<void> {
    if (!countryCodes || countryCodes.length === 0) return;

    const geoTargetMap: Record<string, string> = {
      US: "2840", GB: "2826", DE: "2276", FR: "2250", AE: "2784",
      SA: "2682", EG: "2818", IN: "2356", BR: "2076", AU: "2036",
      CA: "2124", JP: "2392", KR: "2410", MX: "2484", IT: "2380",
      ES: "2724", NL: "2528", SE: "2752", NO: "2578", DK: "2208",
      TR: "2792", PL: "2616", ZA: "2710", NG: "2566", KE: "2404",
      BE: "2056", CH: "2756", AT: "2040", IE: "2372", PT: "2620",
      GR: "2300", CZ: "2203", RO: "2642", HU: "2348", FI: "2246",
      RU: "2643", UA: "2804", PH: "2608", MY: "2458", SG: "2702",
      TH: "2764", VN: "2704", ID: "2360", NZ: "2554", AR: "2032",
      CL: "2152", CO: "2170", PE: "2604",
      BH: "2048", QA: "2634", KW: "2414", OM: "2512", LB: "2422",
    };

    const operations = countryCodes
      .map(cc => geoTargetMap[cc.toUpperCase()])
      .filter(Boolean)
      .map(geoTargetId => ({
        create: {
          campaign: `customers/${customerId}/campaigns/${campaignId}`,
          location: {
            geoTargetConstant: `geoTargetConstants/${geoTargetId}`,
          },
          negative: false,
        },
      }));

    if (operations.length === 0) {
      console.warn(`⚠️ No valid geo targets found for countries: ${countryCodes.join(', ')}`);
      return;
    }

    // Performance Max does not support geo_target_type_setting updates
    if (channelType !== "PERFORMANCE_MAX") {
      const campaignUpdateUrl = `${this.API_BASE}/customers/${customerId}/campaigns:mutate`;
      const campaignUpdateOp = {
        update: {
          resourceName: `customers/${customerId}/campaigns/${campaignId}`,
          geoTargetTypeSetting: {
            positiveGeoTargetType: locationTargetingType === "PRESENCE" ? "PRESENCE" : "PRESENCE_OR_INTEREST",
            negativeGeoTargetType: "PRESENCE_OR_INTEREST",
          },
        },
        updateMask: "geoTargetTypeSetting.positiveGeoTargetType,geoTargetTypeSetting.negativeGeoTargetType",
      };

      const campaignUpdateResp = await fetch(campaignUpdateUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations: [campaignUpdateOp] }),
      });

      if (!campaignUpdateResp.ok) {
        const errText = await campaignUpdateResp.text();
        console.error(`❌ Failed to set geo target type setting:`, errText);
      } else {
        console.log(`✅ Campaign geo target type set to: ${locationTargetingType === "PRESENCE" ? "PRESENCE" : "PRESENCE_OR_INTEREST"}`);
      }
    } else {
      console.log(`ℹ️ Skipping geo_target_type_setting for Performance Max campaign`);
    }

    // Add geo target criteria
    const url = `${this.API_BASE}/customers/${customerId}/campaignCriteria:mutate`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`❌ Failed to add geo targeting to campaign ${campaignId}:`, errText);
    } else {
      const data = await resp.json();
      console.log(`✅ Added ${operations.length} geo targets to campaign ${campaignId}. Results: ${data.results?.length || 0}`);
    }
  }

  // Add campaign-level language targeting criteria
  async addCampaignLanguageCriteria(
    customerId: string,
    campaignId: string,
    languageCodes: string[],
    headers: Record<string, string>
  ): Promise<void> {
    if (!languageCodes || languageCodes.length === 0) return;

    // Google Ads language constant IDs
    const languageMap: Record<string, string> = {
      en: "1000", ar: "1019", zh: "1017", da: "1009", nl: "1010",
      fi: "1011", fr: "1002", de: "1001", el: "1022", he: "1027",
      hi: "1023", hu: "1018", id: "1025", it: "1004", ja: "1005",
      ko: "1012", ms: "1102", no: "1013", pl: "1030", pt: "1014",
      ro: "1032", ru: "1031", es: "1003", sv: "1015", th: "1044",
      tr: "1037", uk: "1036", vi: "1040", cs: "1021",
      // Regional variants map to base
      en_US: "1000", en_GB: "1000", es_ES: "1003", es_MX: "1003",
      pt_BR: "1014", zh_CN: "1017", zh_TW: "1018",
    };

    const operations = languageCodes
      .map(code => languageMap[code] || languageMap[code.split("_")[0]])
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i) // deduplicate
      .map(langId => ({
        create: {
          campaign: `customers/${customerId}/campaigns/${campaignId}`,
          language: { languageConstant: `languageConstants/${langId}` },
          negative: false,
        },
      }));

    if (operations.length === 0) {
      console.warn(`⚠️ No valid language constants found for: ${languageCodes.join(', ')}`);
      return;
    }

    const url = `${this.API_BASE}/customers/${customerId}/campaignCriteria:mutate`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`❌ Failed to add language targeting to campaign ${campaignId}:`, errText);
    } else {
      const data = await resp.json();
      console.log(`✅ Added ${operations.length} language targets to campaign ${campaignId}. Results: ${data.results?.length || 0}`);
    }
  }

  // Add campaign-level network settings
  async setCampaignNetworkSettings(
    customerId: string,
    campaignId: string,
    searchPartnerNetwork: boolean,
    displayNetwork: boolean,
    headers: Record<string, string>
  ): Promise<void> {
    const campaignUpdateUrl = `${this.API_BASE}/customers/${customerId}/campaigns:mutate`;
    const updateOp = {
      update: {
        resourceName: `customers/${customerId}/campaigns/${campaignId}`,
        networkSettings: {
          targetSearchNetwork: searchPartnerNetwork,
          targetContentNetwork: displayNetwork,
          targetPartnerSearchNetwork: false,
        },
      },
      updateMask: "networkSettings.targetSearchNetwork,networkSettings.targetContentNetwork,networkSettings.targetPartnerSearchNetwork",
    };

    const resp = await fetch(campaignUpdateUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations: [updateOp] }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`❌ Failed to set network settings for campaign ${campaignId}:`, errText);
    } else {
      console.log(`✅ Campaign network settings: searchPartner=${searchPartnerNetwork}, displayNetwork=${displayNetwork}`);
    }
  }

  // Add audience targeting at ad group level
  private async addAudienceCriteria(
    customerId: string,
    adGroupId: string,
    audiences: Array<{ id: string; name: string; type: string; source?: string }>,
    headers: Record<string, string>
  ): Promise<void> {
    if (!audiences || audiences.length === 0) return;

    const operations = audiences.map((aud) => {
      // Determine the correct criterion type based on audience source/type
      const isUserList = aud.type === "audience" || aud.source === "google" || aud.type === "user_list";
      
      if (isUserList) {
        return {
          create: {
            adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
            status: "ENABLED",
            userList: {
              userList: `customers/${customerId}/userLists/${aud.id}`,
            },
          },
        };
      } else {
        // For interest/affinity/in-market audiences, use audience criterion
        return {
          create: {
            adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
            status: "ENABLED",
            userInterest: {
              userInterestCategory: `customers/${customerId}/userInterests/${aud.id}`,
            },
          },
        };
      }
    });

    const url = `${this.API_BASE}/customers/${customerId}/adGroupCriteria:mutate`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`❌ Failed to add audience criteria to ad group ${adGroupId}:`, errText);
    } else {
      const data = await resp.json();
      console.log(`✅ Added ${audiences.length} audience criteria to ad group ${adGroupId}. Results: ${data.results?.length || 0}`);
    }
  }

  // Add geo targeting at ad group level (for Demand Gen, Display, etc.)
  private async addAdGroupGeoCriteria(
    customerId: string,
    adGroupId: string,
    countryCodes: string[],
    headers: Record<string, string>
  ): Promise<void> {
    if (!countryCodes || countryCodes.length === 0) return;

    const geoTargetMap: Record<string, string> = {
      US: "2840", GB: "2826", DE: "2276", FR: "2250", AE: "2784",
      SA: "2682", EG: "2818", IN: "2356", BR: "2076", AU: "2036",
      CA: "2124", JP: "2392", KR: "2410", MX: "2484", IT: "2380",
      ES: "2724", NL: "2528", SE: "2752", NO: "2578", DK: "2208",
      TR: "2792", PL: "2616", ZA: "2710", NG: "2566", KE: "2404",
      BE: "2056", CH: "2756", AT: "2040", IE: "2372", PT: "2620",
    };

    const operations = countryCodes
      .map(cc => geoTargetMap[cc.toUpperCase()])
      .filter(Boolean)
      .map(geoTargetId => ({
        create: {
          adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
          geoTargetConstant: `geoTargetConstants/${geoTargetId}`,
          negative: false,
        },
      }));

    if (operations.length === 0) return;

    const url = `${this.API_BASE}/customers/${customerId}/adGroupCriteria:mutate`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`❌ Failed to add geo targeting to ad group ${adGroupId}:`, errText);
    } else {
      console.log(`✅ Added geo targets to ad group ${adGroupId}`);
    }
  }

  // Add language targeting at ad group level
  private async addAdGroupLanguageCriteria(
    customerId: string,
    adGroupId: string,
    languageCodes: string[],
    headers: Record<string, string>
  ): Promise<void> {
    if (!languageCodes || languageCodes.length === 0) return;

    const languageMap: Record<string, string> = {
      en: "1000", ar: "1019", fr: "1002", de: "1001", es: "1003",
      it: "1004", ja: "1005", ko: "1012", pt: "1014", nl: "1010",
      pl: "1030", sv: "1015", no: "1013", da: "1009", fi: "1011",
      ru: "1031", tr: "1037", hi: "1023", th: "1044", vi: "1040",
      id: "1025", ms: "1102", cs: "1021", hu: "1018", ro: "1032",
      el: "1022", he: "1027", uk: "1036",
    };

    const operations = languageCodes
      .map(code => languageMap[code] || languageMap[code.split("_")[0]])
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .map(langId => ({
        create: {
          adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
          language: { languageConstant: `languageConstants/${langId}` },
          negative: false,
        },
      }));

    if (operations.length === 0) return;

    const url = `${this.API_BASE}/customers/${customerId}/adGroupCriteria:mutate`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`❌ Failed to add language targeting to ad group ${adGroupId}:`, errText);
    } else {
      console.log(`✅ Added language targets to ad group ${adGroupId}`);
    }
  }
  // Add demographic (gender, age) targeting at ad group level
  private async addDemographicCriteria(
    customerId: string,
    adGroupId: string,
    targeting: any,
    headers: Record<string, string>
  ): Promise<void> {
    const operations: any[] = [];
    const adGroupResource = `customers/${customerId}/adGroups/${adGroupId}`;

    // Gender targeting - exclude unwanted genders
    // Google Ads uses negative gender criteria: to target "male", exclude FEMALE and UNDETERMINED
    const genders = Array.isArray(targeting.genders) ? targeting.genders : (targeting.gender ? [targeting.gender] : []);
    const genderValues = genders.map((g: any) => String(g).toLowerCase());
    
    // Only apply gender filtering if a specific gender is selected (not "all")
    if (genderValues.length > 0 && !genderValues.includes("all") && !genderValues.includes("")) {
      // Google Ads gender resource names: MALE=10, FEMALE=11, UNDETERMINED=20
      const genderMap: Record<string, string> = { male: "10", female: "11" };
      const allGenderIds = ["10", "11", "20"]; // MALE, FEMALE, UNDETERMINED
      
      // Convert selected genders to IDs
      const selectedGenderIds = new Set<string>();
      for (const g of genderValues) {
        if (g === "1" || g === "male") selectedGenderIds.add("10");
        else if (g === "2" || g === "female") selectedGenderIds.add("11");
      }
      
      // Exclude genders NOT selected
      for (const gId of allGenderIds) {
        if (!selectedGenderIds.has(gId)) {
          operations.push({
            create: {
              adGroup: adGroupResource,
              status: "ENABLED",
              negative: true,
              gender: { type: gId === "10" ? "MALE" : gId === "11" ? "FEMALE" : "UNDETERMINED" },
            },
          });
        }
      }
      
      console.log(`🎯 Gender targeting: selected=${genderValues.join(",")}, excluding ${allGenderIds.length - selectedGenderIds.size} genders`);
    }

    // Age targeting - exclude unwanted age ranges
    // Google Ads age range types: AGE_RANGE_18_24, AGE_RANGE_25_34, AGE_RANGE_35_44, AGE_RANGE_45_54, AGE_RANGE_55_64, AGE_RANGE_65_UP, AGE_RANGE_UNDETERMINED
    const ageMin = Number(targeting.ageMin) || 0;
    const ageMax = Number(targeting.ageMax) || 0;
    
    if (ageMin > 0 || (ageMax > 0 && ageMax < 65)) {
      const ageRanges = [
        { type: "AGE_RANGE_18_24", min: 18, max: 24 },
        { type: "AGE_RANGE_25_34", min: 25, max: 34 },
        { type: "AGE_RANGE_35_44", min: 35, max: 44 },
        { type: "AGE_RANGE_45_54", min: 45, max: 54 },
        { type: "AGE_RANGE_55_64", min: 55, max: 64 },
        { type: "AGE_RANGE_65_UP", min: 65, max: 999 },
      ];
      
      const effectiveMin = ageMin || 18;
      const effectiveMax = ageMax || 999;
      
      for (const range of ageRanges) {
        // Exclude this age range if it falls completely outside the desired range
        if (range.max < effectiveMin || range.min > effectiveMax) {
          operations.push({
            create: {
              adGroup: adGroupResource,
              status: "ENABLED",
              negative: true,
              ageRange: { type: range.type },
            },
          });
        }
      }
      
      console.log(`🎯 Age targeting: ${effectiveMin}-${effectiveMax}, excluding ${operations.filter(o => o.create.ageRange).length} age ranges`);
    }

    if (operations.length === 0) {
      console.log(`ℹ️ No demographic exclusions needed for ad group ${adGroupId}`);
      return;
    }

    const url = `${this.API_BASE}/customers/${customerId}/adGroupCriteria:mutate`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`❌ Failed to add demographic criteria to ad group ${adGroupId}:`, errText);
    } else {
      const data = await resp.json();
      console.log(`✅ Added ${operations.length} demographic criteria to ad group ${adGroupId}. Results: ${data.results?.length || 0}`);
    }
  }
}
