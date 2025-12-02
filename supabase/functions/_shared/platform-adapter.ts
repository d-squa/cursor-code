/**
 * Platform Abstraction Layer
 * Provides unified interface for all advertising platforms (Meta, TikTok, etc.)
 * Ensures consistent behavior across platforms while isolating platform-specific implementation
 */

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
      const body: any = {
        advertiser_id: params.accountId,
        campaign_name: params.campaignName,
        objective_type: params.objective,
        budget_mode: params.budgetMode === 'daily' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL',
        budget: Math.round(params.budget * 100) / 100, // Round to 2 decimal places for currency precision
        operation_status: params.status === 'PAUSED' ? 'DISABLE' : 'ENABLE',
      };
      
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
        metadata: data.data,
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
    try {
      // STRICT BILLING EVENT MAPPING from TikTok matrix
      const getBillingEventForOptimization = (optimizationGoal: string): string => {
        const mapping: Record<string, string> = {
          'REACH': 'CPM',
          'CLICK': 'CPC',
          'LANDING_PAGE': 'OCPM',
          '6S_VIDEO_VIEW': 'CPV',
          '15S_VIDEO_VIEW': 'CPV',
          'CONVERT': 'OCPM',
          'VALUE': 'OCPM',
          'APP_INSTALL': 'CPC',
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
      
      // AUTOMATIC FALLBACK: TikTok requires 90+ days of conversion data for CONVERT optimization
      if (finalOptimizationGoal === 'CONVERT') {
        console.warn("⚠️ CONVERT optimization detected - Falling back to CLICK (TikTok requires 90+ days conversion data)");
        finalOptimizationGoal = 'CLICK';
        requiredBillingEvent = 'CPC';
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
      
      // STEP 6: Map promotion_type from UI values to TikTok API values
      const mapPromotionType = (location?: string, appName?: string): string => {
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
      console.log(`Promotion type: ${params.optimizationLocation} → ${promotionType}`);
      
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
      
      const body: any = {
        advertiser_id: params.accountId,
        campaign_id: params.campaignId,
        adgroup_name: params.adGroupName,
        promotion_type: promotionType,
        placement_type: params.placementType || "PLACEMENT_TYPE_AUTOMATIC",
        placements: params.placements,
        gender: this.mapGender(normalizedGenders),
        age_groups: this.mapAgeGroups(params.targeting.age_min, params.targeting.age_max),
        optimization_goal: finalOptimizationGoal,
        billing_event: requiredBillingEvent,
        bid_type: bidType,
        bid: finalBidAmount,
        operation_status: params.status === 'PAUSED' ? 'DISABLE' : 'ENABLE',
        pacing: "PACING_MODE_SMOOTH", // Standard delivery (not accelerated)
      };
      
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
      
      // Add TikTok detailed targeting (interests, behaviors, actions)
      const interestIds: string[] = [];
      const actionIds: string[] = [];
      
      // Validate TikTok interest ID format
      // TikTok interest category IDs are typically:
      // - Main categories: 4-5 digit numbers (e.g., "2010" for Sports)
      // - Subcategories: 5-6 digit numbers (e.g., "28101" for Sports equipment)
      // IDs with patterns like "999" or very long numbers (10+ digits) are often invalid/placeholder IDs
      const isValidTikTokInterestId = (id: string): boolean => {
        if (!id || typeof id !== 'string') return false;
        
        // Must be numeric
        if (!/^\d+$/.test(id)) return false;
        
        // IDs containing "999" patterns are often placeholder/synthetic IDs
        if (id.includes('999')) {
          console.log(`  ⚠️ Skipping suspicious interest ID (contains 999): ${id}`);
          return false;
        }
        
        // Very long IDs (10+ digits) that don't match known patterns are suspicious
        if (id.length >= 10) {
          console.log(`  ⚠️ Skipping suspicious interest ID (too long): ${id}`);
          return false;
        }
        
        return true;
      };
      
      // Extract TikTok interests with validation
      if (params.targeting.tiktokInterests && Array.isArray(params.targeting.tiktokInterests)) {
        console.log(`🎯 Processing ${params.targeting.tiktokInterests.length} TikTok interests`);
        params.targeting.tiktokInterests.forEach((interest: any) => {
          if (interest.id) {
            const idStr = String(interest.id);
            if (isValidTikTokInterestId(idStr)) {
              interestIds.push(idStr);
              console.log(`  ✓ Valid interest: ${interest.name} (${idStr})`);
            } else {
              console.log(`  ⏭️ Skipping invalid interest ID: ${interest.name} (${idStr})`);
            }
          }
        });
      } else {
        console.log(`⚠️ No TikTok interests (tiktokInterests: ${JSON.stringify(params.targeting.tiktokInterests)})`);
      }
      
      // Extract TikTok behaviors/actions - ALL go to action_category_ids
      // The tiktokBehaviors array contains all action-based targeting (behaviors, purchase intention, etc.)
      // Only tiktokInterests should populate interest_category_ids
      if (params.targeting.tiktokBehaviors && Array.isArray(params.targeting.tiktokBehaviors)) {
        console.log(`🎯 Processing ${params.targeting.tiktokBehaviors.length} TikTok behaviors`);
        params.targeting.tiktokBehaviors.forEach((behavior: any) => {
          if (behavior.id) {
            const idStr = String(behavior.id);
            // Apply same validation to action IDs
            if (isValidTikTokInterestId(idStr)) {
              actionIds.push(idStr);
              console.log(`  → Action category: ${behavior.name} (${idStr})${behavior.category ? ` - ${behavior.category}` : ''}`);
            } else {
              console.log(`  ⏭️ Skipping invalid action ID: ${behavior.name} (${idStr})`);
            }
          }
        });
      } else {
        console.log(`⚠️ No TikTok behaviors (tiktokBehaviors: ${JSON.stringify(params.targeting.tiktokBehaviors)})`);
      }
      
      // TikTok demographics are handled through age/gender/location - not through interest IDs
      // Skipping tiktokDemographics as they're not supported in interest_category_ids
      if (params.targeting.tiktokDemographics && Array.isArray(params.targeting.tiktokDemographics) && params.targeting.tiktokDemographics.length > 0) {
        console.log(`⚠️ Skipping ${params.targeting.tiktokDemographics.length} TikTok demographics (not supported in interest targeting)`);
      }
      
      // Add interest targeting
      if (interestIds.length > 0) {
        body.interest_category_ids = interestIds;
        console.log(`✅ Interest targeting: ${interestIds.length} valid interests`);
      } else {
        console.log(`⚠️ No interest_category_ids added to body (all IDs were invalid or none provided)`);
      }
      
      // Add action/behavior targeting
      if (actionIds.length > 0) {
        body.action_category_ids = actionIds;
        console.log(`✅ Action/Behavior targeting: ${actionIds.length} valid actions`);
      } else {
        console.log(`⚠️ No action_category_ids added to body (all IDs were invalid or none provided)`);
      }
      
      // Add optional TikTok fields from matrix
      if (params.clickWindow) body.conversion_window = { click_window: params.clickWindow };
      if (params.viewWindow) body.conversion_window = { ...body.conversion_window, view_window: params.viewWindow };
      
      // Frequency cap - always pass if value exists (required for REACH campaigns)
      if (params.frequencySchedule) {
        body.frequency = params.frequencySchedule;
        body.frequency_schedule = 7; // Per 7 days as per TikTok API
        console.log(`✅ Frequency cap configured: ${params.frequencySchedule} impressions per 7 days`);
      }
      
      if (params.appId) body.app_id = params.appId;
      if (params.eventCount) body.event_count = params.eventCount; // "every_conversion" or "once"
      if (params.smartPlusEnabled) body.is_smart_performance_campaign = true;
      
      console.log(`✅ Ad group configuration complete:`, {
        optimization_goal: body.optimization_goal,
        billing_event: body.billing_event,
        bid_type: body.bid_type,
        bid: body.bid,
      });


      // Location targeting - filter out restricted markets (US)
      const locationIds = this.mapLocationIds(params.targeting.geo_locations?.countries || [])
        .filter(id => id !== "6252001"); // Remove US (restricted)
      
      if (locationIds.length > 0) {
        body.location_ids = locationIds;
        console.log(`✅ Location targeting: ${locationIds.join(', ')}`);
      } else {
        console.warn("⚠️ Using broad targeting (no location restrictions)");
      }

      // Schedule dates (required for TikTok)
      if (params.startDate && params.endDate) {
        body.schedule_type = "SCHEDULE_START_END";
        const formatDateForTikTok = (dateStr: string) => {
          const date = new Date(dateStr);
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          const hours = String(date.getUTCHours()).padStart(2, '0');
          const minutes = String(date.getUTCMinutes()).padStart(2, '0');
          const seconds = String(date.getUTCSeconds()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        };
        body.schedule_start_time = formatDateForTikTok(params.startDate);
        body.schedule_end_time = formatDateForTikTok(params.endDate);
      }

      // Budget (rounded to 2 decimals for TikTok currency precision)
      if (params.budget) {
        body.budget_mode = params.budgetMode === 'daily' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL';
        body.budget = Math.round(params.budget * 100) / 100;
      }
      
      // Landing page URL (ALWAYS required for WEBSITE promotion type)
      body.landing_page_url = params.landingPageUrl || "https://example.com";
      console.log(`Landing page URL: ${body.landing_page_url}`);
      
      // Only add conversion tracking for CONVERT optimization goal (not for CLICK/REACH/etc)
      if (params.optimizationGoal === 'CONVERT' && params.pixelId) {
        body.pixel_code = params.pixelId;
        body.optimization_event = "ON_WEB_ORDER"; // Default conversion event
        body.deep_external_action = "ON_WEB_ORDER";
        console.log(`✅ Conversion tracking configured: pixel=${params.pixelId}, event=ON_WEB_ORDER`);
      }
      
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
    // Map country codes to TikTok location IDs (ISO 3166-1 numeric codes)
    const countryCodeToLocationId: Record<string, number> = {
      "US": 6252001, "GB": 2635167, "CA": 6251999, "AU": 2077456, "DE": 2921044,
      "FR": 3017382, "IT": 3175395, "ES": 2510769, "MX": 3996063, "BR": 3469034,
      "AR": 3865483, "CL": 3895114, "CO": 3686110, "PE": 3932488, "VE": 3625428,
      "NL": 2750405, "BE": 2802361, "SE": 2661886, "NO": 3144096, "DK": 2623032,
      "FI": 660013, "PL": 798544, "CZ": 3077311, "AT": 2782113, "CH": 2658434,
      "PT": 2264397, "GR": 390903, "IE": 2963597, "RO": 798549, "HU": 719819,
      "JP": 1861060, "KR": 1835841, "CN": 1814991, "IN": 1269750, "ID": 1643084,
      "TH": 1605651, "VN": 1562822, "PH": 1694008, "MY": 1733045, "SG": 1880251,
      "NZ": 2186224, "ZA": 953987, "NG": 2328926, "EG": 357994, "SA": 102358,
      "AE": 290557, "IL": 294640, "TR": 298795, "RU": 2017370, "UA": 690791,
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
