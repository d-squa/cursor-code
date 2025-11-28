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
  budget?: number;
  budgetMode?: 'daily' | 'lifetime';
  status: string;
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
        budget: params.budget, // TikTok expects budget in dollars (not cents)
        operation_status: params.status === 'PAUSED' ? 'DISABLE' : 'ENABLE',
      };
      
      console.log("TikTok campaign creation request:", JSON.stringify(body, null, 2));

      const response = await fetch(`${this.API_BASE}/campaign/create/`, {
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

      const response = await fetch(`${this.API_BASE}/campaign/update/`, {
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
        location_ids: params.targeting.geo_locations?.countries || [],
        gender: this.mapGender(params.targeting.genders),
        age_groups: this.mapAgeGroups(params.targeting.age_min, params.targeting.age_max),
        optimization_goal: params.optimizationGoal,
        operation_status: params.status === 'PAUSED' ? 'DISABLE' : 'ENABLE',
      };

      if (params.budget) {
        body.budget_mode = params.budgetMode === 'daily' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL';
        body.budget = params.budget; // TikTok expects budget in dollars (not cents)
      }
      
      console.log("TikTok ad group creation request:", JSON.stringify(body, null, 2));

      const response = await fetch(`${this.API_BASE}/adgroup/create/`, {
        method: "POST",
        headers: {
          "Access-Token": params.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.code !== 0) {
        console.error("TikTok ad group creation error:", JSON.stringify(data, null, 2));
        return {
          success: false,
          adGroupId: "",
          platform: "tiktok",
          error: `${data.message || "Failed to create ad group"} (Code: ${data.code})`,
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

      const response = await fetch(`${this.API_BASE}/ad/create/`, {
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

      const response = await fetch(`${this.API_BASE}/reports/integrated/get/`, {
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
