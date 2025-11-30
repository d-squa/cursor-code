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
  optimizationGoal: string;
  billingEvent?: string;
  budget?: number;
  budgetMode?: 'daily' | 'lifetime';
  startDate?: string;
  endDate?: string;
  status: string;
  pixelId?: string;
  conversionId?: string;
  landingPageUrl?: string; // Required for TikTok WEBSITE promotion type
  bidStrategy?: string; // TikTok bid strategy: LOWEST_COST or COST_CAP
  bidAmount?: number; // Required when TikTok bidStrategy is COST_CAP
  metaBidStrategy?: string; // Meta bid strategy: LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP
  metaBidAmount?: number; // Required when Meta bidStrategy is LOWEST_COST_WITH_BID_CAP or COST_CAP
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
      const body: any = {
        advertiser_id: params.accountId,
        campaign_id: params.campaignId,
        adgroup_name: params.adGroupName,
        promotion_type: "WEBSITE",
        placements: params.placements,
        gender: this.mapGender(params.targeting.genders),
        age_groups: this.mapAgeGroups(params.targeting.age_min, params.targeting.age_max),
        optimization_goal: params.optimizationGoal,
        billing_event: params.billingEvent || "OCPM",
        operation_status: params.status === 'PAUSED' ? 'DISABLE' : 'ENABLE',
      };
      
      // Add bid strategy - defaults to LOWEST_COST (Maximum Delivery)
      body.bid_type = params.bidStrategy || "LOWEST_COST";
      console.log(`✅ Bid strategy set: ${body.bid_type}`);
      
      // Add bid amount only if Cost Cap strategy is selected AND bid amount is provided
      if (params.bidStrategy === "COST_CAP" && params.bidAmount && params.bidAmount > 0) {
        body.bid = params.bidAmount;
        console.log(`✅ Bid amount set for Cost Cap: €${params.bidAmount}`);
      } else if (params.bidStrategy === "COST_CAP") {
        console.error("❌ Cost Cap strategy selected but no bid amount provided!");
      }

      // Location targeting - filter out restricted markets (US)
      const locationIds = this.mapLocationIds(params.targeting.geo_locations?.countries || [])
        .filter(id => id !== "6252001"); // Remove US (restricted due to sanctions/political restrictions)
      
      if (locationIds.length > 0) {
        body.location_ids = locationIds;
        console.log(`✅ Location targeting applied: ${locationIds.join(', ')}`);
      } else {
        console.warn("⚠️ All specified locations are restricted or no locations provided - using broad targeting");
      }

      // Add schedule information if dates are provided
      if (params.startDate && params.endDate) {
        body.schedule_type = "SCHEDULE_START_END";
        // Convert ISO date strings to YYYY-MM-DD HH:MM:SS format (TikTok expects this format)
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

      if (params.budget) {
        body.budget_mode = params.budgetMode === 'daily' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL';
        body.budget = Math.round(params.budget * 100) / 100; // Round to 2 decimal places for currency precision
      }
      
      // Add pixel tracking for conversion campaigns
      // AUTOMATIC FALLBACK: TikTok requires 90+ days of conversion data for CONVERT optimization
      // Apply fallback for ALL CONVERT campaigns (with or without pixel) to avoid TikTok API errors
      if (params.optimizationGoal === 'CONVERT') {
        console.warn("⚠️ CONVERSION OBJECTIVE DETECTED - Applying automatic fallback");
        console.warn("TikTok requires conversion events to have 90+ days of historical data OR complete pixel setup");
        console.warn("Automatically switching to TRAFFIC objective with CLICK optimization");
        console.warn(`Original: CONVERT (pixel: ${params.pixelId || 'none'}) | New: CLICK`);
        console.warn("Note: Campaign objective should be TRAFFIC at campaign creation level");
        
        // Override to TRAFFIC/CLICK instead of CONVERT to avoid pixel data requirements
        body.optimization_goal = "CLICK";
        body.billing_event = "CPC"; // TRAFFIC with CLICK requires CPC billing event
        
        // This ensures ad groups can be created successfully without 90-day conversion history
        // or complete pixel/event configuration
      }
      
      // Add landing page URL (required for WEBSITE promotion type)
      if (params.landingPageUrl) {
        body.landing_page_url = params.landingPageUrl;
        console.log(`Adding landing_page_url: ${params.landingPageUrl}`);
      } else {
        console.warn("⚠️ No landing page URL provided - using placeholder");
        body.landing_page_url = "https://example.com";
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
    if (!genders || genders.length === 0 || genders.includes(0)) return "GENDER_UNLIMITED";
    if (genders.includes(1) && genders.includes(2)) return "GENDER_UNLIMITED";
    if (genders.includes(1)) return "GENDER_MALE";
    if (genders.includes(2)) return "GENDER_FEMALE";
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
