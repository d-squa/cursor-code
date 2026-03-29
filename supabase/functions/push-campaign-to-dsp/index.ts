import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken, getAccessTokenWithRefresh } from "../_shared/vault-helper.ts";
import { getGooglePlatformCandidatesForCustomer } from "../_shared/platform-connection-resolver.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const campaignInputSchema = z.object({
  campaignId: z.string().uuid(),
});

// ============= MINIMUM BUDGET REQUIREMENTS =============
// Platform minimum budget requirements (in account currency - e.g., EUR/USD)
// These are lifetime minimums - daily minimums are calculated based on duration
const PLATFORM_MINIMUM_BUDGETS = {
  meta: {
    // Meta requires minimum $1/day for daily budget, or $1 * days for lifetime
    dailyMinimum: 1,
    lifetimeMinimumPerDay: 1,
    currency: "USD",
    name: "Meta",
  },
  tiktok: {
    // TikTok requires higher minimums - ~€380 for short campaigns, scales with duration
    // Per TikTok docs: $50/day minimum, or $50 * campaign_days for lifetime (varies by region)
    // EU region often requires higher minimums
    dailyMinimum: 50,
    lifetimeMinimumPerDay: 50,
    // For short campaigns (< 7 days), TikTok enforces a flat minimum (~€380 in EU)
    shortCampaignMinimum: 380,
    shortCampaignDays: 7,
    currency: "EUR",
    name: "TikTok",
  },
};

interface BudgetValidationError {
  platform: string;
  market: string;
  phase: string;
  calculatedBudget: number;
  minimumRequired: number;
  budgetType: string;
  durationDays: number;
  message: string;
  fieldPath: string;
}

function validatePlatformBudgets(
  campaign: any,
  platformConfig: any,
  platformName: string,
  markets: Record<string, any>,
): BudgetValidationError[] {
  const errors: BudgetValidationError[] = [];
  const platformKey = platformName.toLowerCase().includes("meta")
    ? "meta"
    : platformName.toLowerCase().includes("tiktok")
      ? "tiktok"
      : null;

  if (!platformKey || !PLATFORM_MINIMUM_BUDGETS[platformKey]) {
    return errors; // Skip validation for unsupported platforms
  }

  const platformMinimums = PLATFORM_MINIMUM_BUDGETS[platformKey];
  const totalCampaignBudget = campaign.total_budget || 0;
  const platformBudgetPercentage = platformConfig.budgetPercentage || 100;

  for (const [marketCode, market] of Object.entries(markets) as [string, any][]) {
    const marketBudgetPercentage = market.budgetPercentage || 100;
    const phases = market.phases || [
      {
        id: "default-phase",
        name: market.name,
        startDate: campaign.start_date,
        endDate: campaign.end_date,
        budgetPercentage: 100,
      },
    ];

    for (const phase of phases) {
      const phaseBudgetPercentage = phase.budgetPercentage || 100;
      const phaseBudget =
        ((totalCampaignBudget * platformBudgetPercentage) / 100) *
        (marketBudgetPercentage / 100) *
        (phaseBudgetPercentage / 100);

      const startDate = new Date(phase.startDate || campaign.start_date);
      const endDate = new Date(phase.endDate || campaign.end_date);
      const durationDays = Math.max(
        1,
        Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      );

      const budgetType = phase.budgetType || "lifetime";

      let minimumRequired: number;
      let calculatedBudgetValue: number;

      if (budgetType === "daily") {
        // For daily budget, check daily minimum
        calculatedBudgetValue = phaseBudget / durationDays;
        minimumRequired = platformMinimums.dailyMinimum;
      } else {
        // For lifetime budget
        calculatedBudgetValue = phaseBudget;

        if (platformKey === "tiktok") {
          // TikTok has special rules for short campaigns
          if (durationDays <= (platformMinimums as any).shortCampaignDays) {
            minimumRequired = (platformMinimums as any).shortCampaignMinimum;
          } else {
            minimumRequired = platformMinimums.lifetimeMinimumPerDay * durationDays;
          }
        } else {
          minimumRequired = platformMinimums.lifetimeMinimumPerDay * durationDays;
        }
      }

      if (calculatedBudgetValue < minimumRequired) {
        errors.push({
          platform: platformMinimums.name,
          market: market.name || marketCode,
          phase: phase.name || "Default",
          calculatedBudget: Math.round(calculatedBudgetValue * 100) / 100,
          minimumRequired: minimumRequired,
          budgetType: budgetType,
          durationDays: durationDays,
          message: `${platformMinimums.name} requires a minimum ${budgetType} budget of ${platformMinimums.currency}${minimumRequired.toFixed(2)} for ${durationDays} day(s). Current budget: ${platformMinimums.currency}${calculatedBudgetValue.toFixed(2)}`,
          fieldPath: "step2", // Budget allocation step
        });
      }
    }
  }

  return errors;
}

// ============= TAXONOMY GENERATION HELPERS =============
// Replicates frontend taxonomy generation logic for campaign/ad set naming

interface TaxonomyParam {
  id: string;
  key: string;
  label: string;
  type: string;
  value?: string;
  options?: string[];
  required?: boolean;
  system?: boolean;
}

interface TaxonomyContext {
  platform?: string;
  activationName?: string;
  boNumber?: string;
  teamName?: string;
  totalBudget?: number;
  platformBudget?: number;
  market?: string;
  country?: string;
  objective?: string;
  optimizationGoal?: string;
  funnelStage?: string;
  bidStrategy?: string;
  budgetType?: string;
  phaseBudget?: number;
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  location?: string;
  devices?: string[];
  languages?: string[];
  placementType?: string;
  advantagePlusPlacements?: boolean;
  publisherPlatforms?: string[];
  targetingType?: string;
  startDate?: string;
  endDate?: string;
}

// Value shortening mappings
const VALUE_MAPPINGS: Record<string, Record<string, string>> = {
  platform: { meta: "META", tiktok: "TT", google: "GADS" },
  objective: {
    OUTCOME_AWARENESS: "AWR",
    OUTCOME_ENGAGEMENT: "ENG",
    OUTCOME_TRAFFIC: "TRF",
    OUTCOME_LEADS: "LED",
    OUTCOME_APP_PROMOTION: "APP",
    OUTCOME_SALES: "SAL",
    REACH: "RCH",
    VIDEO_VIEWS: "VV",
    TRAFFIC: "TRF",
    CONVERSIONS: "CVN",
    APP_INSTALLS: "API",
    LEAD_GENERATION: "LDG",
  },
  optimizationGoal: {
    REACH: "RCH",
    IMPRESSIONS: "IMP",
    LINK_CLICKS: "CLK",
    LANDING_PAGE_VIEWS: "LPV",
    CONVERSIONS: "CVN",
    VALUE: "VAL",
    OFFSITE_CONVERSIONS: "OCV",
    CLICK: "CLK",
    CONVERT: "CVT",
    VIDEO_VIEW: "VV",
  },
  country: {
    US: "US",
    GB: "UK",
    DE: "DE",
    FR: "FR",
    ES: "ES",
    IT: "IT",
    NL: "NL",
    BE: "BE",
    MX: "MX",
    BR: "BR",
    JP: "JP",
    AU: "AU",
  },
  bidStrategy: {
    LOWEST_COST_WITHOUT_CAP: "LC",
    LOWEST_COST_WITH_BID_CAP: "BC",
    COST_CAP: "CC",
    LOWEST_COST: "LC",
    BID_TYPE_NO_BID: "NB",
  },
  budgetType: { daily: "DLY", lifetime: "LTB" },
  placementType: { PLACEMENT_TYPE_AUTOMATIC: "AUTO", PLACEMENT_TYPE_NORMAL: "MAN", automatic: "AUTO", manual: "MAN" },
  gender: { all: "ALL", male: "M", female: "F", "1": "M", "2": "F" },
  device: { mobile: "MOB", desktop: "DSK", all: "ALL" },
  targetingType: { native: "NTV", expand: "EXP", retargeting: "RTG", broad: "BRD" },
};

function shortenValue(category: string, value: string): string {
  if (!value) return "";
  const mappings = VALUE_MAPPINGS[category];
  if (mappings && mappings[value]) return mappings[value];
  // Create short code from value
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, "");
  if (cleaned.length <= 3) return cleaned.toUpperCase();
  return cleaned.substring(0, 3).toUpperCase();
}

function formatDateForTaxonomy(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    return `${day}${month}`;
  } catch {
    return "";
  }
}

function formatBudgetForTaxonomy(budget: number): string {
  if (!budget || budget === 0) return "";
  if (budget >= 1000000) return `${Math.round(budget / 1000000)}M`;
  if (budget >= 1000) return `${Math.round(budget / 1000)}K`;
  return Math.round(budget).toString();
}

function extractTaxonomyValues(template: TaxonomyParam[], context: TaxonomyContext): Record<string, string> {
  const values: Record<string, string> = {};

  for (const param of template) {
    let rawValue: string | undefined;

    switch (param.id) {
      case "platform":
        values[param.id] = context.platform ? shortenValue("platform", context.platform) : "";
        break;
      case "objective":
        values[param.id] = context.objective ? shortenValue("objective", context.objective) : "";
        break;
      case "optimizationGoal":
        values[param.id] = context.optimizationGoal ? shortenValue("optimizationGoal", context.optimizationGoal) : "";
        break;
      case "country":
      case "market":
        rawValue = context.country || context.market;
        values[param.id] = rawValue ? shortenValue("country", rawValue.toUpperCase()) : "";
        break;
      case "location":
        rawValue = context.location || context.country || context.market;
        values[param.id] = rawValue ? shortenValue("country", rawValue.toUpperCase()) : "";
        break;
      case "bidStrategy":
        values[param.id] = context.bidStrategy ? shortenValue("bidStrategy", context.bidStrategy) : "";
        break;
      case "budgetType":
        values[param.id] = context.budgetType ? shortenValue("budgetType", context.budgetType) : "";
        break;
      case "placementType":
      case "placement":
        if (context.advantagePlusPlacements === true) {
          values[param.id] = "AUTO";
        } else if (context.placementType) {
          values[param.id] = shortenValue("placementType", context.placementType);
        } else {
          values[param.id] = "AUTO";
        }
        break;
      case "gender":
        values[param.id] = context.gender ? shortenValue("gender", context.gender) : "ALL";
        break;
      case "ageRange":
        const ageMin = context.ageMin || 18;
        const ageMax = context.ageMax || 65;
        values[param.id] = `${ageMin}${ageMax}`;
        break;
      case "devices":
        if (context.devices && context.devices.length > 0 && context.devices.length < 3) {
          values[param.id] = shortenValue("device", context.devices[0]);
        } else {
          values[param.id] = "ALL";
        }
        break;
      case "targetingType":
        values[param.id] = context.targetingType ? shortenValue("targetingType", context.targetingType) : "";
        break;
      case "activationName":
        // Don't shorten activation name - preserve as is with special chars removed
        values[param.id] = context.activationName?.replace(/[^a-zA-Z0-9]/g, "") || "";
        break;
      case "boNumber":
        values[param.id] = context.boNumber?.replace(/[^a-zA-Z0-9]/g, "") || "";
        break;
      case "teamName":
        values[param.id] = context.teamName?.replace(/[^a-zA-Z0-9]/g, "") || "";
        break;
      case "platformBudget":
      case "phaseBudget":
      case "totalBudget":
        const budget = context.platformBudget || context.phaseBudget || context.totalBudget;
        values[param.id] = budget ? formatBudgetForTaxonomy(budget) : "";
        break;
      case "startDate":
        values[param.id] = context.startDate ? formatDateForTaxonomy(context.startDate) : "";
        break;
      case "endDate":
        values[param.id] = context.endDate ? formatDateForTaxonomy(context.endDate) : "";
        break;
      case "keywordStrategy":
        rawValue = context.keywordStrategy;
        values[param.id] = rawValue ? rawValue.toUpperCase().substring(0, 5) : "";
        break;
      case "matchType":
        rawValue = context.matchType;
        if (rawValue) {
          const mtMap: Record<string, string> = { BROAD: "BRD", PHRASE: "PHR", EXACT: "EXT", BROAD_WORD: "BWD" };
          values[param.id] = mtMap[rawValue.toUpperCase()] || rawValue.substring(0, 3).toUpperCase();
        } else {
          values[param.id] = "";
        }
        break;
      case "campaignType":
        rawValue = context.campaignType;
        if (rawValue) {
          const ctMap: Record<string, string> = {
            Search: "SRC",
            Display: "DSP",
            "Performance Max": "PMAX",
            Video: "VID",
            "Demand Gen": "DGEN",
            Shopping: "SHOP",
            "App Promotion": "APP",
            SEARCH: "SRC",
            DISPLAY: "DSP",
            PERFORMANCE_MAX: "PMAX",
          };
          values[param.id] = ctMap[rawValue] || rawValue.substring(0, 4).toUpperCase();
        } else {
          values[param.id] = "";
        }
        break;
      default:
        if (param.type === "fixed" && param.value) {
          values[param.id] = param.value;
        }
        break;
    }
  }

  return values;
}

function mergeTaxonomyTemplateWithDefaults(
  template: TaxonomyParam[],
  platform: "meta" | "tiktok" | "google",
  entityType: "campaign" | "adset"
): TaxonomyParam[] {
  if (entityType !== "campaign" || (platform !== "google" && platform !== "tiktok")) {
    return template;
  }

  const missingSearchParams: TaxonomyParam[] = [
    { id: "keywordStrategy", key: "KWST", label: "Keyword Strategy", type: "options", options: ["BRAND", "GENER", "COMPE"], system: true, required: false },
    { id: "matchType", key: "MT", label: "Match Type", type: "options", options: ["BRD", "PHR", "EXT"], system: true, required: false },
    { id: "campaignType", key: "CTYP", label: "Campaign Type", type: "options", options: platform === "google" ? ["SRC", "DSP", "PMAX", "VID", "DGEN", "SHOP", "APP"] : ["SRC", "VID", "APP"], system: true, required: false },
  ];

  return [
    ...template,
    ...missingSearchParams.filter((param) => !template.some((existingParam) => existingParam.id === param.id)),
  ];
}

function generateTaxonomyString(template: TaxonomyParam[], values: Record<string, string>): string {
  const parts: string[] = [];

  for (const param of template) {
    if (param.required === false && !param.system) continue;
    const value = values[param.id] || param.value || "";
    if (value) {
      parts.push(value.toUpperCase());
    }
  }

  return parts.join("_");
}

// Helper to generate taxonomy name for campaign or adset
async function generateTaxonomyName(
  supabase: any,
  userId: string,
  platformAccountId: string, // This is the platform's native ID (e.g., TikTok advertiser_id, Meta account_id, or Google customer_id)
  platform: "meta" | "tiktok" | "google",
  entityType: "campaign" | "adset",
  context: TaxonomyContext,
  customValues?: Record<string, string>,
): Promise<string | null> {
  try {
    // First, convert platform's native account ID to our internal UUID
    // taxonomy_templates.ad_account_id stores our internal UUIDs, not platform IDs
    let internalAdAccountId: string | null = null;

    if (platform === "tiktok") {
      const { data: tiktokAccount } = await supabase
        .from("tiktok_ad_accounts")
        .select("id")
        .eq("advertiser_id", platformAccountId)
        .maybeSingle();
      internalAdAccountId = tiktokAccount?.id;
    } else if (platform === "meta") {
      const { data: metaAccount } = await supabase
        .from("meta_ad_accounts")
        .select("id")
        .eq("account_id", platformAccountId)
        .maybeSingle();
      internalAdAccountId = metaAccount?.id;
    } else if (platform === "google") {
      // Google Ads uses customer_id — try matching with or without dashes
      const cleanId = platformAccountId.replace(/-/g, "");
      const { data: googleAccount } = await supabase
        .from("google_ad_accounts")
        .select("id")
        .or(`customer_id.eq.${cleanId},customer_id.eq.${platformAccountId}`)
        .maybeSingle();
      internalAdAccountId = googleAccount?.id;
    }

    if (!internalAdAccountId) {
      console.log(`No internal account found for ${platform} account ${platformAccountId}`);
      return null;
    }

    // Fetch taxonomy template from database using internal UUID
    const { data: templateData, error } = await supabase
      .from("taxonomy_templates")
      .select("template")
      .eq("user_id", userId)
      .eq("ad_account_id", internalAdAccountId)
      .eq("platform", platform)
      .eq("entity_type", entityType)
      .maybeSingle();

    if (error || !templateData?.template) {
      console.log(
        `No taxonomy template found for ${platform} ${entityType} on account ${internalAdAccountId} (platform ID: ${platformAccountId})`,
      );
      return null;
    }

    const template = mergeTaxonomyTemplateWithDefaults(
      templateData.template as TaxonomyParam[],
      platform,
      entityType,
    );
    const extractedValues = extractTaxonomyValues(template, context);
    // Merge with custom values (custom values override extracted)
    const mergedValues = { ...extractedValues, ...customValues };
    const taxonomyString = generateTaxonomyString(template, mergedValues);

    // Append unique timestamp suffix (YYMMDDHHMMSS) to ensure uniqueness
    const now = new Date();
    const uniqueSuffix =
      now.getFullYear().toString().slice(-2) +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");
    const finalTaxonomyString = `${taxonomyString}_${uniqueSuffix}`;

    console.log(`📋 Generated ${entityType} taxonomy: ${finalTaxonomyString}`);
    return finalTaxonomyString;
  } catch (err) {
    console.error(`Error generating taxonomy name:`, err);
    return null;
  }
}

// Helper function to generate unique timestamp suffix (YYMMDDHHMMSS)
function generateTimestampSuffix(): string {
  const now = new Date();
  return (
    now.getFullYear().toString().slice(-2) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0")
  );
}

// ============= AD SET SPLIT HELPERS =============

interface AdSetConfig {
  id: string;
  name: string;
  dimensionValue: string | string[] | number | { min: number; max: number };
  budgetPercentage: number;
  placements?: string[];
  tiktokPlacements?: string[];
  publisherPlatforms?: string[];
  positions?: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  };
  languages?: (number | string)[];
  countries?: string[];
  gender?: string;
  devices?: string[];
  ageMin?: number;
  ageMax?: number;
  optimizationGoal?: string;
  // Bid strategy and related parameters (especially needed for optimization_goal splits)
  bidStrategy?: string;
  bidAmount?: number;
  billingEvent?: string;
  audiences?: Array<{
    id: string;
    name: string;
    type: string;
    source: string;
  }>;
  excludedAudiences?: Array<{
    id: string;
    name: string;
    type: string;
    source: string;
  }>;
}

// Apply ad set split overrides to Meta targeting object
function applyMetaAdSetOverrides(baseTargeting: any, adSet: AdSetConfig, dimension: string): any {
  const targeting = { ...baseTargeting };

  // Apply dimension-specific overrides
  switch (dimension) {
    case "gender":
      if (adSet.gender) {
        const genderMap: Record<string, number[]> = {
          male: [1],
          female: [2],
          all: [],
        };
        const genders = genderMap[adSet.gender.toLowerCase()];
        if (genders && genders.length > 0) {
          targeting.genders = genders;
        } else {
          delete targeting.genders; // All genders
        }
      }
      break;

    case "device":
      if (adSet.devices && adSet.devices.length > 0) {
        targeting.device_platforms = adSet.devices;
      }
      break;

    case "age":
      if (adSet.ageMin !== undefined) targeting.age_min = adSet.ageMin;
      if (adSet.ageMax !== undefined) targeting.age_max = adSet.ageMax;
      break;

    case "language":
      if (adSet.languages && adSet.languages.length > 0) {
        // Convert to Meta locale IDs if needed
        const locales = adSet.languages
          .map((lang: string | number) => parseInt(String(lang)))
          .filter((l: number) => !isNaN(l));
        if (locales.length > 0) {
          targeting.locales = locales;
        }
      }
      break;

    case "location":
      if (adSet.countries && adSet.countries.length > 0) {
        targeting.geo_locations = { countries: adSet.countries };
      }
      break;

    case "audience":
    case "audience_selection":
      // Add custom audiences from the ad set - filter out invalid IDs
      if (adSet.audiences && adSet.audiences.length > 0) {
        const validAudiences = adSet.audiences
          .filter((a) => a.id && typeof a.id === "string" && a.id.trim() !== "" && /^\d+$/.test(a.id.trim()))
          .map((a) => ({ id: a.id.trim() }));
        if (validAudiences.length > 0) {
          targeting.custom_audiences = validAudiences;
        }
      }
      // Add excluded audiences - filter out invalid IDs
      if (adSet.excludedAudiences && adSet.excludedAudiences.length > 0) {
        const validExcluded = adSet.excludedAudiences
          .filter((a) => a.id && typeof a.id === "string" && a.id.trim() !== "" && /^\d+$/.test(a.id.trim()))
          .map((a) => ({ id: a.id.trim() }));
        if (validExcluded.length > 0) {
          targeting.excluded_custom_audiences = validExcluded;
        }
      }
      break;
  }

  return targeting;
}

// Apply ad set split overrides to TikTok targeting object
function applyTikTokAdSetOverrides(baseTargeting: any, adSet: AdSetConfig, dimension: string): any {
  const targeting = { ...baseTargeting };

  switch (dimension) {
    case "gender":
      if (adSet.gender) {
        // Map string values to numeric for TikTok adapter
        const genderMap: Record<string, number[]> = {
          male: [1],
          female: [2],
          all: [],
        };
        const genders = genderMap[adSet.gender.toLowerCase()];
        targeting.genders = genders || [];
      }
      break;

    case "device":
      if (adSet.devices && adSet.devices.length > 0) {
        targeting.devices = adSet.devices;
      }
      break;

    case "age":
      if (adSet.ageMin !== undefined) targeting.age_min = adSet.ageMin;
      if (adSet.ageMax !== undefined) targeting.age_max = adSet.ageMax;
      break;

    case "language":
      if (adSet.languages && adSet.languages.length > 0) {
        targeting.languages = adSet.languages;
      }
      break;

    case "location":
      if (adSet.countries && adSet.countries.length > 0) {
        targeting.geo_locations = { countries: adSet.countries };
      }
      break;
  }

  return targeting;
}

// Get Meta placement overrides from ad set
function getMetaPlacementOverrides(adSet: AdSetConfig): {
  publisherPlatforms?: string[];
  positions?: Record<string, string[]>;
} {
  const overrides: { publisherPlatforms?: string[]; positions?: Record<string, string[]> } = {};

  if (adSet.publisherPlatforms && adSet.publisherPlatforms.length > 0) {
    overrides.publisherPlatforms = adSet.publisherPlatforms;
  }

  if (adSet.positions && Object.keys(adSet.positions).length > 0) {
    overrides.positions = adSet.positions;
  }

  return overrides;
}

// Get TikTok placement overrides from ad set
function getTikTokPlacementOverrides(adSet: AdSetConfig): {
  placements?: string[];
  placementType?: string;
} {
  if (adSet.tiktokPlacements && adSet.tiktokPlacements.length > 0) {
    return {
      placements: adSet.tiktokPlacements,
      placementType: "PLACEMENT_TYPE_NORMAL",
    };
  }
  return {};
}

// ============= END AD SET SPLIT HELPERS =============

// ============= END TAXONOMY HELPERS =============

// ============= UPDATE LAUNCH STATUS HELPER =============
async function updateLaunchStatuses(
  supabase: any,
  campaignId: string,
  platformInput: string,
  result: any,
  markets: any[],
): Promise<void> {
  // Normalize platform name - try both TikTok and Tiktok casing for compatibility
  const platformVariants =
    platformInput.toLowerCase() === "tiktok"
      ? ["TikTok", "Tiktok", "tiktok"]
      : platformInput.toLowerCase() === "meta"
        ? ["Meta", "meta"]
        : platformInput.toLowerCase().includes("google")
          ? ["Google Ads", "Google", "google", "google_ads"]
          : [platformInput];

  try {
    const successResults = result.results || [];
    const errorResults = result.errors || [];

    console.log(
      `📝 updateLaunchStatuses called for ${platformInput}: ${successResults.length} successes, ${errorResults.length} errors`,
    );

    // Update successful entities
    for (const successItem of successResults) {
      const {
        market,
        phase,
        campaignId: dspCampaignId,
        adSetId,
        adGroupId,
        campaignEntityName,
        adSetEntityName,
      } = successItem;

      console.log(
        `📝 Processing success: market=${market}, phase=${phase}, dspCampaignId=${dspCampaignId}, adGroupId=${adGroupId}`,
      );

      // Update campaign entry - try each platform variant until one works
      if (dspCampaignId) {
        for (const platformName of platformVariants) {
          const buildCampaignQuery = (exactEntityName?: string | null) => {
            let campaignQuery = supabase
            .from("campaign_launch_status")
            .update({
              status: "pushed_to_dsp",
              dsp_entity_id: dspCampaignId,
              dsp_status: "PAUSED",
              error_message: null,
              error_details: null,
              updated_at: new Date().toISOString(),
            })
            .eq("campaign_id", campaignId)
            .eq("platform", platformName)
            .eq("market", market)
            .eq("entity_type", "campaign");

            campaignQuery = phase ? campaignQuery.eq("phase_name", phase) : campaignQuery.is("phase_name", null);
            if (exactEntityName) campaignQuery = campaignQuery.eq("entity_name", exactEntityName);
            return campaignQuery;
          };

          let { data: campaignUpdateResult, error: campaignUpdateError } = await buildCampaignQuery(campaignEntityName).select();

          if ((!campaignUpdateResult || campaignUpdateResult.length === 0) && campaignEntityName) {
            ({ data: campaignUpdateResult, error: campaignUpdateError } = await buildCampaignQuery().select());
          }

          if (campaignUpdateResult && campaignUpdateResult.length > 0) {
            console.log(
              `✅ Updated campaign status for ${market}/${phase} with platform=${platformName}: ${campaignUpdateResult.length} rows`,
            );
            break; // Found matching rows, stop trying variants
          } else if (campaignUpdateError) {
            console.error(`❌ Error updating campaign status: ${campaignUpdateError.message}`);
          }
        }
      }

      // Update ad set/ad group entry
      const adEntityId = adSetId || adGroupId;
      if (adEntityId) {
        for (const platformName of platformVariants) {
          const buildAdSetQuery = (exactEntityName?: string | null) => {
            let adSetQuery = supabase
            .from("campaign_launch_status")
            .update({
              status: "pushed_to_dsp",
              dsp_entity_id: adEntityId,
              dsp_status: "PAUSED",
              error_message: null,
              error_details: null,
              updated_at: new Date().toISOString(),
            })
            .eq("campaign_id", campaignId)
            .eq("platform", platformName)
            .eq("market", market)
            .eq("entity_type", "adset");

            adSetQuery = phase ? adSetQuery.eq("phase_name", phase) : adSetQuery.is("phase_name", null);
            if (exactEntityName) adSetQuery = adSetQuery.eq("entity_name", exactEntityName);
            return adSetQuery;
          };

          let { data: adsetUpdateResult, error: adsetUpdateError } = await buildAdSetQuery(adSetEntityName).select();

          if ((!adsetUpdateResult || adsetUpdateResult.length === 0) && adSetEntityName) {
            ({ data: adsetUpdateResult, error: adsetUpdateError } = await buildAdSetQuery().select());
          }

          if (adsetUpdateResult && adsetUpdateResult.length > 0) {
            console.log(
              `✅ Updated adset status for ${market}/${phase} with platform=${platformName}: ${adsetUpdateResult.length} rows`,
            );
            break;
          } else if (adsetUpdateError) {
            console.error(`❌ Error updating adset status: ${adsetUpdateError.message}`);
          }
        }
      }
    }

    // Update failed entities with detailed API response
    // Use UPSERT to ensure failures are recorded even if no row exists
    for (const errorItem of errorResults) {
      const { market, phase, error, type, apiResponse } = errorItem;

      // Build detailed error message
      const errorMessage = typeof error === "string" ? error : error?.message || "Push failed";
      const errorDetails = [
        {
          message: errorMessage,
          type: type || "api_error",
          apiResponse: apiResponse || error,
          field: errorItem.field,
          fieldPath: errorItem.fieldPath || "step1",
        },
      ];

      // Determine entity type from error type
      const typeStr = (type || "").toLowerCase();
      let entityType = "adset"; // Default to adset for ad group/adset errors
      if (typeStr.includes("campaign") && !typeStr.includes("adgroup") && !typeStr.includes("adset")) {
        entityType = "campaign";
      }

      // Use the first platform variant as the canonical name
      const platformName = platformVariants[0];

      // First try to update existing row
      let updated = false;
      for (const pVariant of platformVariants) {
        let q = supabase
          .from("campaign_launch_status")
          .update({
            status: "push_failed",
            error_message: errorMessage,
            error_details: errorDetails,
            updated_at: new Date().toISOString(),
          })
          .eq("campaign_id", campaignId)
          .eq("platform", pVariant)
          .eq("market", market);

        if (phase) q = q.eq("phase_name", phase);
        q = q.eq("entity_type", entityType);

        const { data: failUpdateResult } = await q.select();

        if (failUpdateResult && failUpdateResult.length > 0) {
          console.log(`⚠️ Marked as failed for ${market}/${phase}: ${failUpdateResult.length} rows`);
          updated = true;
          break;
        }
      }

      // If no row was updated, INSERT a new failure row
      if (!updated) {
        console.log(
          `📝 No existing ${entityType} row found for ${platformName}/${market}/${phase}, inserting new failure row`,
        );
        const { error: insertError } = await supabase.from("campaign_launch_status").insert({
          campaign_id: campaignId,
          platform: platformName,
          market: market,
          phase_name: phase || null,
          entity_type: entityType,
          entity_name: `${phase || "Default"} - ${entityType === "adset" ? "Ad Set" : "Campaign"}`,
          status: "push_failed",
          error_message: errorMessage,
          error_details: errorDetails,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error(`❌ Failed to insert failure row: ${insertError.message}`);
        } else {
          console.log(`✅ Inserted new failure row for ${platformName}/${market}/${phase}`);
        }
      }
    }

    console.log(
      `Updated launch statuses for ${platformInput}: ${successResults.length} success, ${errorResults.length} errors`,
    );
  } catch (err) {
    console.error("Error updating launch statuses:", err);
  }
}
// ============= END UPDATE LAUNCH STATUS HELPER =============

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Service configuration error");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user authentication
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const parseResult = campaignInputSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { campaignId } = parseResult.data;

    // Get campaign data
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError) throw campaignError;

    const campaignOwnerId = campaign.user_id as string;

    // Allow access if user owns the campaign OR is a member of the campaign's team
    let canAccess = campaignOwnerId === user.id;
    if (!canAccess && campaign.team_id) {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("team_id", campaign.team_id)
        .eq("user_id", user.id)
        .limit(1);

      if (roleError) throw roleError;
      canAccess = (roleRows?.length || 0) > 0;
    }

    if (!canAccess) {
      return new Response(JSON.stringify({ error: "Unauthorized: You do not have access to this campaign" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Pushing campaign to DSP:", campaign.name, "for user:", user.id, "campaign owner:", campaignOwnerId);

    // ============= SERVER-SIDE DAILY LIMIT CHECK =============
    // Check subscription tier and enforce daily DSP push limits
    // Current price IDs (USD-standardized pricing)
    const PRICE_IDS = {
      basic: {
        monthly: "price_1SydZ7KrTGU4P754jqI2guPI",
        yearly: "price_1SydZEKrTGU4P754aNJHK8pc",
      },
      freelancer: {
        monthly: "price_1SydVjKrTGU4P754mZJJWvAq",
        yearly: "price_1SydVuKrTGU4P754zRmad5iJ",
      },
      enterprise: {
        monthly: "price_1SydW1KrTGU4P754aeyvSJP8",
        yearly: "price_1SydW3KrTGU4P754G3iA7VZM",
      },
      agency: {
        monthly: "price_1SydW5KrTGU4P754vsPg9hWw",
        yearly: "price_1SydW8KrTGU4P754AEitLX2A",
      },
    };

    // Legacy price IDs that should still map to their respective tiers
    const LEGACY_PRICE_IDS: Record<string, string> = {
      "price_1ScnOeKrTGU4P75446dvndr3": "agency",
      "price_1ScnObKrTGU4P754AAJ9Q5NU": "basic",
      "price_1ScnL9KrTGU4P754QirsF0Sd": "basic",
      "price_1SyblZKrTGU4P754e0GfARV4": "freelancer",
      "price_1SyblbKrTGU4P754Otu9dcxm": "freelancer",
      "price_1SyblcKrTGU4P754HYOgkuIQ": "enterprise",
      "price_1SybldKrTGU4P754EBnjjPos": "enterprise",
      "price_1SyblfKrTGU4P754gwTKmrsC": "agency",
      "price_1SyblfKrTGU4P754PtKbziMk": "agency",
      // Even older legacy IDs
      "price_1SyXF5KrTGU4P7548Gb4bgd6": "freelancer",
      "price_1SyXYDKrTGU4P75427F7A2ge": "freelancer",
      "price_1SyX3xKrTGU4P754lgSWx7dq": "enterprise",
      "price_1SyX8xKrTGU4P754mXynM6Qn": "enterprise",
      "price_1SyXAnKrTGU4P754hsNny2H7": "agency",
      "price_1SyXD1KrTGU4P7541vWVImFY": "agency",
    };

    const DAILY_LIMITS: Record<string, number> = {
      trial: 1,
      basic: 1,
      freelancer: 2,
      enterprise: 5,
      agency: Infinity,
    };

    const getTierFromPriceId = (priceId: string | null): string => {
      if (!priceId) return "trial";
      for (const [tier, config] of Object.entries(PRICE_IDS)) {
        if (config.monthly === priceId || config.yearly === priceId) {
          return tier;
        }
      }
      // Check legacy price IDs
      if (LEGACY_PRICE_IDS[priceId]) {
        return LEGACY_PRICE_IDS[priceId];
      }
      console.warn(`⚠️ Unrecognized price ID: ${priceId}, defaulting to trial`);
      return "trial";
    };

    // Get subscription tier - if campaign belongs to a team, use team owner's subscription
    // This matches the frontend useFeatureAccess logic
    let userTier = "trial";
    const teamId = campaign.team_id;

    try {
      let billingUserId = user.id; // Default to current user

      // If campaign has a team_id, get the team owner's subscription instead
      if (teamId) {
        const { data: team } = await supabase.from("teams").select("owner_id").eq("id", teamId).single();

        if (team?.owner_id) {
          billingUserId = team.owner_id;
          console.log(`📊 Using team owner's subscription: ${billingUserId} (team: ${teamId})`);
        }
      }

      const { data: billingCustomer } = await supabase
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", billingUserId)
        .single();

      if (billingCustomer?.stripe_customer_id) {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey) {
          const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

          const subscriptions = await stripe.subscriptions.list({
            customer: billingCustomer.stripe_customer_id,
            status: "all",
            limit: 10,
          });

          const activeSub = subscriptions.data.find(
            (s: { status: string }) => s.status === "active" || s.status === "trialing",
          );

          if (activeSub) {
            const priceId = activeSub.items?.data?.[0]?.price?.id;
            userTier = getTierFromPriceId(priceId);
            console.log(`📊 Subscription found - priceId: ${priceId}, tier: ${userTier}`);
          } else {
            console.log(`📊 No active subscription found for billing customer`);
          }
        }
      } else {
        console.log(`📊 No billing customer found for user: ${billingUserId}`);
      }
    } catch (err) {
      console.warn("Error checking subscription tier:", err);
      // Default to trial if we can't determine tier
    }

    const dailyLimit = DAILY_LIMITS[userTier] ?? 1;
    console.log(`📊 User tier: ${userTier}, daily limit: ${dailyLimit}`);

    // Count FULLY pushed campaigns to DSP today by team_id (workspace)
    // IMPORTANT: Only count campaigns with status 'pushed_to_dsp' or 'live' (ALL entities successful)
    // 'partially_pushed' campaigns do NOT count against the limit since they have failed entities
    // This ensures the limit is shared across all team members
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    ).toISOString();
    const todayEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    ).toISOString();

    // CRITICAL: Only fully successful pushes count against daily limit
    // 'partially_pushed' is intentionally excluded - user must retry and fully succeed
    const pushCountStatuses = ["pushed_to_dsp", "live"];

    // teamId already declared above when checking subscription

    let countQuery = supabase
      .from("campaigns")
      .select("id")
      .in("status", pushCountStatuses)
      .gte("published_at", todayStart)
      .lte("published_at", todayEnd);

    // If campaign has a team_id, count by team (shared limit pool)
    // Otherwise fall back to user_id (personal workspace)
    if (teamId) {
      countQuery = countQuery.eq("team_id", teamId);
      console.log(`📊 Counting by team_id: ${teamId}`);
    } else {
      countQuery = countQuery.eq("user_id", user.id);
      console.log(`📊 Counting by user_id: ${user.id} (no team context)`);
    }

    const { data: pushedWithPublishedAt, error: publishedCountError } = await countQuery;

    if (publishedCountError) {
      console.error("Error counting pushed campaigns (published_at):", publishedCountError);
    }

    // Also check for legacy campaigns without published_at
    let legacyQuery = supabase.from("campaigns").select("id").in("status", pushCountStatuses).is("published_at", null);

    if (teamId) {
      legacyQuery = legacyQuery.eq("team_id", teamId);
    } else {
      legacyQuery = legacyQuery.eq("user_id", user.id);
    }

    const { data: pushedWithNullPublishedAt, error: nullPublishedError } = await legacyQuery;

    if (nullPublishedError) {
      console.error("Error fetching pushed campaigns with null published_at:", nullPublishedError);
    }

    const allPushedToday = new Set<string>((pushedWithPublishedAt || []).map((r: { id: string }) => r.id));

    const legacyNullIds = (pushedWithNullPublishedAt || []).map((r: { id: string }) => r.id);
    if (legacyNullIds.length > 0) {
      const { data: launchRows, error: launchError } = await supabase
        .from("campaign_launch_status")
        .select("campaign_id")
        .in("campaign_id", legacyNullIds)
        .eq("entity_type", "campaign")
        .in("status", ["pushed_to_dsp", "live"])
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd);

      if (launchError) {
        console.error("Error counting pushed campaigns (launch_status fallback):", launchError);
      } else {
        for (const row of (launchRows || []) as Array<{ campaign_id: string }>) {
          allPushedToday.add(row.campaign_id);
        }
      }
    }

    // Exclude current campaign (retry case)
    allPushedToday.delete(campaignId);

    const usedToday = allPushedToday.size;
    console.log(`📊 Campaigns pushed today (excluding current): ${usedToday}/${dailyLimit}`);

    // Check if this is a first-time push (not a retry)
    // Retries of partially_pushed or pushed_to_dsp campaigns don't count as new pushes
    const isRetry = campaign.status === "partially_pushed" || campaign.status === "pushed_to_dsp";

    console.log(
      `📊 Limit check: isRetry=${isRetry}, usedToday=${usedToday}, dailyLimit=${dailyLimit}, currentStatus=${campaign.status}`,
    );

    if (!isRetry && dailyLimit !== Infinity && usedToday >= dailyLimit) {
      console.log(`🚫 Daily DSP push limit reached for tier ${userTier}`);
      return new Response(
        JSON.stringify({
          error: `Daily DSP push limit reached (${dailyLimit} per day for ${userTier} plan). Please upgrade your subscription for more pushes.`,
          limitReached: true,
          tier: userTier,
          limit: dailyLimit,
          used: usedToday,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    // ============= END DAILY LIMIT CHECK =============

    // Get connected platforms - check campaign owner, current user, and team
    let platforms: any[] = [];
    
    // 1. Check campaign owner's connections
    const { data: ownerPlatforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", campaignOwnerId)
      .eq("is_active", true);
    
    if (ownerPlatforms && ownerPlatforms.length > 0) {
      platforms = ownerPlatforms;
    }
    
    // 2. If no platforms found and current user differs, check current user
    if (platforms.length === 0 && user.id !== campaignOwnerId) {
      console.log(`No platforms found for campaign owner ${campaignOwnerId}, checking current user ${user.id}`);
      const { data: userPlatforms } = await supabase
        .from("connected_platforms")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (userPlatforms && userPlatforms.length > 0) {
        platforms = userPlatforms;
      }
    }
    
    // 3. Check team-scoped connections and merge
    if (campaign.team_id) {
      const { data: teamPlatforms } = await supabase
        .from("connected_platforms")
        .select("*")
        .eq("team_id", campaign.team_id)
        .eq("is_active", true);
      if (teamPlatforms && teamPlatforms.length > 0) {
        const existingIds = new Set(platforms.map((p: any) => p.id));
        for (const tp of teamPlatforms) {
          if (!existingIds.has(tp.id)) {
            platforms.push(tp);
          }
        }
      }
    }
    
    console.log(`Found ${platforms.length} connected platforms for push`);

    // Fetch existing launch statuses to skip already-completed entities
    const { data: existingStatuses } = await supabase
      .from("campaign_launch_status")
      .select("platform, market, phase_name, entity_type, status, dsp_entity_id")
      .eq("campaign_id", campaignId);

    // Entity-level skip keys (platform+market+phase+entityType)
    const normalizeSkipPlatform = (platformName: string): string => {
      const p = String(platformName || "").trim().toLowerCase();
      if (p.includes("meta") || p.includes("facebook") || p.includes("instagram")) return "meta";
      if (p.includes("tiktok")) return "tiktok";
      if (p.includes("google")) return "google ads";
      return p;
    };

    const buildEntityKey = (
      platformName: string,
      market: string,
      phaseName: string | null | undefined,
      entityType: string,
    ): string => {
      return `${normalizeSkipPlatform(platformName)}|${String(market || "").trim().toLowerCase()}|${String(phaseName || "").trim().toLowerCase()}|${String(entityType || "").trim().toLowerCase()}`;
    };

    const pushedEntitySet = new Set<string>();
    const existingEntitySet = new Set<string>();
    const pushedEntityIdMap = new Map<string, string>();

    for (const status of existingStatuses || []) {
      const key = buildEntityKey(status.platform || "", status.market || "", status.phase_name, status.entity_type || "");
      existingEntitySet.add(key);

      if ((status.status === "pushed_to_dsp" || status.status === "live") && status.dsp_entity_id) {
        pushedEntitySet.add(key);
        pushedEntityIdMap.set(key, status.dsp_entity_id);
      }
    }

    const isEntityPushed = (
      platformName: string,
      market: string,
      phaseName: string | null | undefined,
      entityType: "campaign" | "adset",
    ) => pushedEntitySet.has(buildEntityKey(platformName, market, phaseName, entityType));

    const hasEntityRow = (
      platformName: string,
      market: string,
      phaseName: string | null | undefined,
      entityType: "campaign" | "adset",
    ) => existingEntitySet.has(buildEntityKey(platformName, market, phaseName, entityType));

    const findPushedEntityId = (
      platformName: string,
      marketTokens: string[],
      phaseName: string | null | undefined,
      entityType: "campaign" | "adset",
    ): string | null => {
      for (const token of marketTokens) {
        const id = pushedEntityIdMap.get(buildEntityKey(platformName, token, phaseName, entityType));
        if (id) return id;
      }
      return null;
    };

    console.log(`📋 Found ${pushedEntitySet.size} already-pushed entities to skip`);

    const results = [];

    // ============= PRE-PUSH BUDGET VALIDATION =============
    // Validate minimum budget requirements for all platforms BEFORE pushing anything
    console.log("🔍 Running pre-push budget validation...");
    const allBudgetErrors: BudgetValidationError[] = [];
    const marketSplits = campaign.market_splits || {};
    const budgetAllocation = campaign.budget_allocation || {};

    for (const [platformId, markets] of Object.entries(marketSplits)) {
      const campaignPlatform = (campaign.platforms || []).find((p: any) => p.id === platformId);
      if (!campaignPlatform) continue;

      const platformName = campaignPlatform.name;
      const platformBudgetPercentage = budgetAllocation[platformId] || 0;

      // Skip already-pushed markets in validation too
      const platformKey = normalizeSkipPlatform(platformName);

      const marketsToValidate: Record<string, any> = {};
      for (const [marketCode, marketData] of Object.entries(markets as Record<string, any>)) {
        const phases = (marketData as any).phases || [];
        const filteredPhases: any[] = [];

        const marketTokens = Array.from(
          new Set(
            [marketCode, (marketData as any)?.name, (marketData as any)?.market, (marketData as any)?.code]
              .map((value) => String(value || "").trim().toLowerCase())
              .filter(Boolean),
          ),
        );

        for (const phase of phases) {
          const phaseName = String(phase?.name || "");
          const campaignPushed = marketTokens.some((token) => isEntityPushed(platformKey, token, phaseName, "campaign"));
          const adsetPushed = marketTokens.some((token) => isEntityPushed(platformKey, token, phaseName, "adset"));
          const adsetExists = marketTokens.some((token) => hasEntityRow(platformKey, token, phaseName, "adset"));
          const campaignExists = marketTokens.some((token) => hasEntityRow(platformKey, token, phaseName, "campaign"));

          // Skip phase only when ALL existing entity types are pushed
          // If both campaign and adset rows exist, BOTH must be pushed
          let phaseAlreadyComplete = false;
          if (campaignExists && adsetExists) {
            phaseAlreadyComplete = campaignPushed && adsetPushed;
          } else if (adsetExists) {
            phaseAlreadyComplete = adsetPushed;
          } else if (campaignExists) {
            phaseAlreadyComplete = campaignPushed;
          }
          if (!phaseAlreadyComplete) {
            filteredPhases.push(phase);
          }
        }

        if (filteredPhases.length > 0) {
          marketsToValidate[marketCode] = { ...marketData, phases: filteredPhases };
        }
      }

      if (Object.keys(marketsToValidate).length > 0) {
        const platformConfig = { budgetPercentage: platformBudgetPercentage };
        const budgetErrors = validatePlatformBudgets(campaign, platformConfig, platformName, marketsToValidate);
        allBudgetErrors.push(...budgetErrors);
      }
    }

    // Budget warnings are logged but do NOT block the push
    // The DSP platforms will validate and reject if budgets are truly too low
    const budgetWarnings: Array<{ platform: string; market: string; phase: string; message: string }> = [];
    if (allBudgetErrors.length > 0) {
      console.log(`⚠️ Pre-push budget warnings: ${allBudgetErrors.length} potential issue(s) (proceeding anyway)`);
      for (const err of allBudgetErrors) {
        console.log(`  ⚠️ ${err.platform}/${err.market}/${err.phase}: ${err.message}`);
        budgetWarnings.push({
          platform: err.platform,
          market: err.market,
          phase: err.phase,
          message: err.message,
        });
      }
    } else {
      console.log("✅ Pre-push budget validation passed");
    }
    // ============= END PRE-PUSH BUDGET VALIDATION =============

    // Process each platform in the campaign
    for (const [platformId, markets] of Object.entries(marketSplits)) {
      // Find the platform in campaign.platforms to get the name
      const campaignPlatform = (campaign.platforms || []).find((p: any) => p.id === platformId);
      if (!campaignPlatform) {
        console.warn(`Platform ${platformId} not found in campaign.platforms`);
        continue;
      }

      const platformName = campaignPlatform.name;
      const budgetAllocation = campaign.budget_allocation || {};
      const platformBudgetPercentage = budgetAllocation[platformId] || 0;

      // Find connected platform
      const platform = platforms.find(
        (p) =>
          p.platform_type.toLowerCase() === platformName.toLowerCase() ||
          (platformName.includes("Meta") && p.platform_type === "meta") ||
          (platformName.includes("Google") && p.platform_type === "google"),
      );

      if (!platform) {
        console.warn(`Platform ${platformName} not connected for user`);
        results.push({
          platform: platformName,
          error: "Platform not connected",
          markets: markets,
        });
        continue;
      }

      // Get access token from Vault (with refresh for Google OAuth)
      const platformType = platformName.toLowerCase().includes("google") ? "google" : undefined;
      const accessToken = platformType === "google"
        ? await getAccessTokenWithRefresh(supabase, platform.id, platform.access_token, "google")
        : await getAccessToken(supabase, platform.id, platform.access_token);
      if (!accessToken) {
        console.error(`No access token found for platform ${platformName}`);
        results.push({
          platform: platformName,
          error: "Platform access token not found",
          markets: markets,
        });
        continue;
      }

      // Add access token to platform object for adapter use
      const platformWithToken = { ...platform, access_token: accessToken };

      // Create platform config structure - filter out already-pushed markets
      const filteredMarkets: Record<string, any> = {};
      const platformKey = normalizeSkipPlatform(platformName);

      let skippedCount = 0;
      for (const [marketCode, marketData] of Object.entries(markets as Record<string, any>)) {
        // Check each phase in the market
        const phases = marketData.phases || [];
        const filteredPhases: any[] = [];

        const marketTokens = Array.from(
          new Set(
            [marketCode, (marketData as any)?.name, (marketData as any)?.market, (marketData as any)?.code]
              .map((value) => String(value || "").trim().toLowerCase())
              .filter(Boolean),
          ),
        );

        for (const phase of phases) {
          const phaseName = String(phase?.name || "");
          const campaignPushed = marketTokens.some((token) => isEntityPushed(platformKey, token, phaseName, "campaign"));
          const adsetPushed = marketTokens.some((token) => isEntityPushed(platformKey, token, phaseName, "adset"));
          const adsetExists = marketTokens.some((token) => hasEntityRow(platformKey, token, phaseName, "adset"));
          const campaignExists = marketTokens.some((token) => hasEntityRow(platformKey, token, phaseName, "campaign"));

          // Skip phase only when ALL existing entity types are pushed
          let phaseAlreadyComplete = false;
          if (campaignExists && adsetExists) {
            phaseAlreadyComplete = campaignPushed && adsetPushed;
          } else if (adsetExists) {
            phaseAlreadyComplete = adsetPushed;
          } else if (campaignExists) {
            phaseAlreadyComplete = campaignPushed;
          }

          if (phaseAlreadyComplete) {
            console.log(`⏭️ Skipping already-pushed: ${platformName}/${(marketData as any)?.name || marketCode}/${phase.name}`);
            skippedCount++;
          } else {
            const existingCampaignId = findPushedEntityId(platformKey, marketTokens, phaseName, "campaign");
            filteredPhases.push({
              ...phase,
              _existingDspCampaignId: existingCampaignId || undefined,
            });
          }
        }

        if (filteredPhases.length > 0) {
          filteredMarkets[marketCode] = { ...marketData, phases: filteredPhases };
        }
      }

      if (Object.keys(filteredMarkets).length === 0) {
        console.log(`⏭️ All ${skippedCount} entities for ${platformName} already pushed, skipping platform`);
        results.push({
          platform: platformName,
          success: true,
          skipped: true,
          message: "All entities already pushed",
          results: [],
        });
        continue;
      }

      console.log(
        `📤 Pushing ${Object.keys(filteredMarkets).length} markets for ${platformName} (skipped ${skippedCount} already-pushed)`,
      );

      const platformConfig = {
        id: platformId,
        name: platformName,
        budgetPercentage: platformBudgetPercentage,
        markets: filteredMarkets,
      };

      if (platformName.includes("Meta") || platformName.includes("Facebook")) {
        const result = await pushToMeta(campaign, platformConfig, platformWithToken, supabase);
        results.push(result);

        // Update campaign_launch_status for each pushed entity
        await updateLaunchStatuses(supabase, campaignId, platformName, result, Object.values(filteredMarkets) as any[]);
      } else if (platformName.includes("Google")) {
        const result = await pushToGoogleAds(campaign, platformConfig, platformWithToken, supabase);
        results.push(result);

        // Update campaign_launch_status for each pushed entity
        await updateLaunchStatuses(supabase, campaignId, "Google Ads", result, Object.values(filteredMarkets) as any[]);
      } else if (platformName.toLowerCase().includes("tiktok")) {
        const result = await pushToTikTok(campaign, platformConfig, platformWithToken);
        results.push(result);

        // Update campaign_launch_status for each pushed entity
        await updateLaunchStatuses(supabase, campaignId, "TikTok", result, Object.values(filteredMarkets) as any[]);
      }
    }

    // Convert any lingering "pushing" rows into explicit failures so UI never hangs indefinitely
    const { data: lingeringPushing } = await supabase
      .from("campaign_launch_status")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("status", "pushing");

    if (lingeringPushing && lingeringPushing.length > 0) {
      const lingeringIds = lingeringPushing.map((row: any) => row.id);
      console.warn(`⚠️ Found ${lingeringIds.length} lingering pushing entities, marking as push_failed`);

      const fallbackMessage = "Entity was not processed in this push attempt. Please retry this phase.";
      await supabase
        .from("campaign_launch_status")
        .update({
          status: "push_failed",
          error_message: fallbackMessage,
          error_details: [{ message: fallbackMessage, type: "incomplete_push" }],
          updated_at: new Date().toISOString(),
        })
        .in("id", lingeringIds);
    }

    // Fetch final launch statuses to determine campaign status
    const { data: finalStatuses } = await supabase
      .from("campaign_launch_status")
      .select("status")
      .eq("campaign_id", campaignId);

    const statusCounts = {
      pushed: 0,
      failed: 0,
      pending: 0,
    };

    for (const s of finalStatuses || []) {
      if (s.status === "pushed_to_dsp" || s.status === "live") statusCounts.pushed++;
      else if (s.status === "push_failed" || s.status === "validation_error") statusCounts.failed++;
      else if (s.status === "pushing")
        statusCounts.pending++; // Still processing
      else statusCounts.pending++;
    }

    // Determine final campaign status based on ALL entity statuses
    // CRITICAL: Only campaigns where ALL entities are pushed count against daily limit
    // - pushed_to_dsp: ALL entities are pushed (no failures, no pending) → COUNTS against limit
    // - partially_pushed: SOME pushed, but some failed or still pending → DOES NOT count
    // - push_failed: ALL failed (none pushed) → DOES NOT count
    // - ready_for_push: none pushed yet, still pending → DOES NOT count
    let finalStatus = "ready_for_push";
    const totalEntities = (finalStatuses || []).length;

    if (statusCounts.pushed === totalEntities && totalEntities > 0) {
      finalStatus = "pushed_to_dsp"; // All entities pushed successfully - THIS counts against limit
      console.log(`✅ All ${totalEntities} entities pushed successfully - campaign counts against daily limit`);
    } else if (statusCounts.pushed > 0 && (statusCounts.failed > 0 || statusCounts.pending > 0)) {
      finalStatus = "partially_pushed"; // Some pushed, some not - DOES NOT count against limit
      console.log(
        `⚠️ Partial push: ${statusCounts.pushed}/${totalEntities} entities succeeded - campaign DOES NOT count against daily limit`,
      );
    } else if (statusCounts.failed > 0 && statusCounts.pushed === 0) {
      finalStatus = "push_failed"; // All failed - DOES NOT count against limit
      console.log(`❌ All ${statusCounts.failed} entities failed - campaign DOES NOT count against daily limit`);
    }

    console.log(
      `📊 Launch status summary: pushed=${statusCounts.pushed}, failed=${statusCounts.failed}, pending=${statusCounts.pending} → ${finalStatus}`,
    );

    const nowIso = new Date().toISOString();
    // Only set published_at for FULLY successful pushes (pushed_to_dsp or live)
    // This timestamp is used for daily limit counting
    const shouldSetPublishedAt = (finalStatus === "pushed_to_dsp" || finalStatus === "live") && !campaign.published_at;

    await supabase
      .from("campaigns")
      .update({
        status: finalStatus,
        updated_at: nowIso,
        ...(shouldSetPublishedAt ? { published_at: nowIso } : {}),
      })
      .eq("id", campaignId);

    console.log(`Campaign push completed. Final status: ${finalStatus}`);

    return new Response(
      JSON.stringify({ success: statusCounts.failed === 0, results, hasErrors: statusCounts.failed > 0, finalStatus, budgetWarnings: budgetWarnings.length > 0 ? budgetWarnings : undefined }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error: any) {
    console.error("Error pushing campaign to DSP:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

// Helper function to map phase names to valid Meta objectives
function getMetaObjectiveFromPhase(
  phaseName: string,
  strategyFocus?: string,
  optimizationGoal?: string,
): { objective: string; optimizationGoal: string } {
  const lowerPhaseName = phaseName.toLowerCase();
  const lowerOptGoal = optimizationGoal?.toLowerCase() || "";

  // Handle Value optimization goal specifically for Conversions
  if (lowerOptGoal === "value") {
    return { objective: "OUTCOME_SALES", optimizationGoal: "VALUE" };
  }

  // Map phase names to Meta objectives
  if (lowerPhaseName.includes("awareness") || lowerPhaseName.includes("reach")) {
    return { objective: "OUTCOME_AWARENESS", optimizationGoal: "REACH" };
  }

  if (lowerPhaseName.includes("engagement") || lowerPhaseName.includes("interest")) {
    return { objective: "OUTCOME_ENGAGEMENT", optimizationGoal: "POST_ENGAGEMENT" };
  }

  if (lowerPhaseName.includes("consideration") || lowerPhaseName.includes("intent")) {
    return { objective: "OUTCOME_TRAFFIC", optimizationGoal: "LINK_CLICKS" };
  }

  if (lowerPhaseName.includes("lead")) {
    return { objective: "OUTCOME_LEADS", optimizationGoal: "LEAD_GENERATION" };
  }

  if (
    lowerPhaseName.includes("conversion") ||
    lowerPhaseName.includes("purchase") ||
    lowerPhaseName.includes("sales") ||
    lowerPhaseName.includes("loyalty")
  ) {
    // Check strategy focus for more specific mapping
    if (strategyFocus === "purchase" || strategyFocus === "conversions") {
      return { objective: "OUTCOME_SALES", optimizationGoal: "OFFSITE_CONVERSIONS" };
    }
    return { objective: "OUTCOME_SALES", optimizationGoal: "OFFSITE_CONVERSIONS" };
  }

  if (lowerPhaseName.includes("app")) {
    return { objective: "OUTCOME_APP_PROMOTION", optimizationGoal: "APP_INSTALLS" };
  }

  // Default fallback
  return { objective: "OUTCOME_TRAFFIC", optimizationGoal: "LINK_CLICKS" };
}

async function pushToMeta(campaign: any, platformConfig: any, platform: any, supabase: any) {
  console.log("Pushing to Meta...");
  console.log("📦 platformConfig.markets received:", JSON.stringify(platformConfig.markets, null, 2));

  const results = [];
  const errors = [];

  // Extract markets from the correct structure (it's an object, not array)
  const marketsObj = platformConfig.markets || {};
  console.log("📦 marketsObj keys:", Object.keys(marketsObj));

  for (const [marketCode, market] of Object.entries(marketsObj) as [string, any][]) {
    console.log(`📦 Processing market ${marketCode}:`, {
      name: market.name,
      pixel: market.pixel,
      conversionEvent: market.conversionEvent,
      adAccountId: market.adAccountId,
      pageId: market.pageId,
      page: market.page,
      metaPageId: market.metaPageId,
      defaultPageId: market.defaultPageId,
    });

    // Validate required fields for conversion campaigns
    // Optimization goals that REQUIRE a pixel and conversion event for Meta
    const conversionOptGoals = ["OFFSITE_CONVERSIONS", "VALUE", "CONVERSIONS"];

    const phasesWithMissingConversion: string[] = [];

    if (market.phases) {
      for (const phase of market.phases) {
        const phaseName = phase.name?.toLowerCase() || "";
        const objective = phase.objective?.toLowerCase() || "";
        const optGoal = phase.optimizationGoal || market.optimizationGoal || "";

        // Check if conversion event is required based on optimization goal OR phase/objective name
        const requiresConversionByOptGoal = conversionOptGoals.includes(optGoal);
        const requiresConversionByName =
          phaseName.includes("conversion") ||
          phaseName.includes("purchase") ||
          phaseName.includes("sales") ||
          phaseName.includes("lead") ||
          objective.includes("conversion") ||
          objective.includes("sales") ||
          objective.includes("lead");

        if (requiresConversionByOptGoal || requiresConversionByName) {
          // Check phase-level first, then market-level for pixel/conversion config
          const hasPixel = phase.pixel || market.pixel;
          const hasConversionEvent = phase.conversionEvent || market.conversionEvent;

          if (!hasPixel || !hasConversionEvent) {
            phasesWithMissingConversion.push(phase.name || "Default");
          }
        }
      }
    }

    if (phasesWithMissingConversion.length > 0) {
      errors.push({
        market: market.name,
        error: `Pixel and Conversion Event are required for conversion-optimized phases (${phasesWithMissingConversion.join(", ")}). Please configure them in the campaign customization.`,
        type: "validation_error",
      });
      continue;
    }

    // Get phases, or create a default phase if none exist
    const phases = market.phases || [
      {
        id: "default-phase",
        name: market.name,
        startDate: campaign.start_date,
        endDate: campaign.end_date,
        budgetPercentage: 100,
        objective: market.objective || campaign.objective || "OUTCOME_TRAFFIC",
        optimizationGoal: market.optimizationGoal || "LINK_CLICKS",
      },
    ];

    for (const phase of phases) {
      try {
        // Map phase objective to valid Meta objective - check forecast fields first
        let objective =
          phase.objective ||
          (market as any).phaseObjective ||
          market.objective ||
          campaign.objective ||
          "OUTCOME_TRAFFIC";
        let optimizationGoal =
          phase.optimizationGoal || (market as any).phaseOptimizationGoal || market.optimizationGoal || "LINK_CLICKS";

        // If objective is "auto" or invalid, map from phase name
        const validObjectives = [
          "APP_INSTALLS",
          "BRAND_AWARENESS",
          "EVENT_RESPONSES",
          "LEAD_GENERATION",
          "LINK_CLICKS",
          "LOCAL_AWARENESS",
          "MESSAGES",
          "OFFER_CLAIMS",
          "PAGE_LIKES",
          "POST_ENGAGEMENT",
          "PRODUCT_CATALOG_SALES",
          "REACH",
          "STORE_VISITS",
          "VIDEO_VIEWS",
          "OUTCOME_AWARENESS",
          "OUTCOME_ENGAGEMENT",
          "OUTCOME_LEADS",
          "OUTCOME_SALES",
          "OUTCOME_TRAFFIC",
          "OUTCOME_APP_PROMOTION",
          "CONVERSIONS",
        ];

        if (!validObjectives.includes(objective)) {
          const mapped = getMetaObjectiveFromPhase(
            phase.name,
            market.strategyFocus || campaign.strategy_focus,
            optimizationGoal,
          );
          objective = mapped.objective;
          optimizationGoal = mapped.optimizationGoal;
          console.log(
            `Mapped phase "${phase.name}" to objective: ${objective}, optimization goal: ${optimizationGoal}`,
          );
        } else {
          // Still check if we need to map optimization goal for Value
          if (optimizationGoal?.toLowerCase() === "value") {
            optimizationGoal = "VALUE";
            objective = "OUTCOME_SALES";
            console.log(`Mapped Value optimization to objective: ${objective}, optimization goal: ${optimizationGoal}`);
          }
        }

        // Create campaign - try to use taxonomy name first
        const genericConfig = campaign.generic_config || {};
        const adAccountId = (market as any).adAccountId || (market as any).ad_account_id;

        // Build context for campaign taxonomy
        const campaignTaxonomyContext: TaxonomyContext = {
          platform: "meta",
          activationName: campaign.name,
          boNumber: campaign.bo_number,
          teamName: genericConfig.teamName,
          totalBudget: campaign.total_budget,
          platformBudget:
            ((campaign.total_budget * (platformConfig.budgetPercentage || 100)) / 100) *
            ((market.budgetPercentage || 100) / 100),
          market: market.name,
          country: market.name?.substring(0, 2)?.toUpperCase(),
          objective: objective,
          optimizationGoal: optimizationGoal,
          funnelStage: phase.funnelStage,
          placementType: phase.advantagePlusPlacements ? "automatic" : phase.tiktokPlacementType || "manual",
          advantagePlusPlacements: phase.advantagePlusPlacements,
          publisherPlatforms: phase.publisherPlatforms,
          startDate: phase.startDate || campaign.start_date,
          endDate: phase.endDate || campaign.end_date,
        };

        // Generate taxonomy name or fall back to default
        const campaignTaxonomyName = adAccountId
          ? await generateTaxonomyName(
              supabase,
              campaign.user_id,
              adAccountId,
              "meta",
              "campaign",
              campaignTaxonomyContext,
              phase.campaignTaxonomyValues,
            )
          : null;

        const defaultCampaignName = `${campaign.name} - ${market.name}${phases.length > 1 ? ` - ${phase.name}` : ""}_${generateTimestampSuffix()}`;

        // Check if CBO (Campaign Budget Optimization) is enabled
        const useCBOEarly = phase.useCBO === true;

        // Pre-calculate budget for CBO campaigns (budget goes on campaign, not ad sets)
        const earlyTotalBudget = campaign.total_budget || 0;
        const earlyPlatformPct = platformConfig.budgetPercentage || 100;
        const earlyMarketPct = market.budgetPercentage || 100;
        const earlyPhasePct = phase.budgetPercentage || 100;
        const earlyPhaseBudget =
          ((earlyTotalBudget * earlyPlatformPct) / 100) * (earlyMarketPct / 100) * (earlyPhasePct / 100);

        const earlyStartDate = new Date(phase.startDate || campaign.start_date);
        const earlyEndDate = new Date(phase.endDate || campaign.end_date);
        const earlyDurationDays =
          Math.ceil((earlyEndDate.getTime() - earlyStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const earlyBudgetType = phase.budgetType || "lifetime";

        const campaignPayload: any = {
          name: campaignTaxonomyName || defaultCampaignName,
          objective: objective,
          status: "PAUSED",
          special_ad_categories: [],
        };

        // ============= ADVANTAGE+ SHOPPING CAMPAIGN SUPPORT =============
        // When Advantage+ Shopping is enabled at phase level, add smart_promotion_type
        // This creates an ASC campaign (requires OUTCOME_SALES objective)
        const isAdvantagePlusCampaign = phase.metaAdvantagePlusCampaign === true;
        if (isAdvantagePlusCampaign) {
          campaignPayload.smart_promotion_type = "AUTOMATED_SHOPPING_ADS";
          // Force objective to OUTCOME_SALES as required by ASC
          campaignPayload.objective = "OUTCOME_SALES";
          console.log(`🚀 Advantage+ Shopping Campaign enabled - setting smart_promotion_type=AUTOMATED_SHOPPING_ADS`);
        }

        // If CBO is enabled, set budget at campaign level
        if (useCBOEarly) {
          if (earlyBudgetType === "lifetime") {
            campaignPayload.lifetime_budget = Math.max(Math.round(earlyPhaseBudget * 100), 100); // in cents, min $1
          } else {
            campaignPayload.daily_budget = Math.max(Math.round((earlyPhaseBudget / earlyDurationDays) * 100), 100); // in cents, min $1/day
          }
          console.log(
            `📊 CBO enabled - Campaign ${earlyBudgetType} budget: ${earlyBudgetType === "lifetime" ? campaignPayload.lifetime_budget : campaignPayload.daily_budget} cents`,
          );
        }

        // Resolve Meta ad account id with fallbacks and ensure proper act_ prefix
        const resolvedAdAccount =
          (market as any).adAccountId ||
          (market as any).ad_account_id ||
          platform.ad_account_id ||
          Deno.env.get("META_AD_ACCOUNT_ID");
        const adAccountPath = resolvedAdAccount
          ? String(resolvedAdAccount).startsWith("act_")
            ? String(resolvedAdAccount)
            : `act_${String(resolvedAdAccount).replace(/^act_/, "")}`
          : null;

        if (!adAccountPath) {
          console.error("Missing Meta ad account id for market:", market.name);
          errors.push({
            market: market.name,
            phase: phase.name,
            error: "Missing Meta ad account id",
            type: "validation_error",
          });
          continue;
        }

        console.log("Creating Meta campaign on:", adAccountPath, campaignPayload);

        const campaignResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/campaigns`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...campaignPayload,
            access_token: platform.access_token,
          }),
        });

        const campaignData = await campaignResponse.json();

        if (campaignData.error) {
          console.error("❌ Meta Campaign Creation Error:", JSON.stringify(campaignData.error, null, 2));
          console.error("📤 Campaign Payload:", JSON.stringify(campaignPayload, null, 2));
          const errorMsg = campaignData.error.error_user_msg || campaignData.error.message || JSON.stringify(campaignData.error);
          errors.push({
            market: market.name,
            phase: phase.name,
            error: errorMsg,
            type: "campaign_creation",
            apiResponse: campaignData.error,
            fieldPath: "step3",
          });
          continue;
        }

        console.log("Meta campaign created:", campaignData.id);

        // Calculate budget
        const totalCampaignBudget = campaign.total_budget || 0;
        const platformBudgetPercentage = platformConfig.budgetPercentage || 100;
        const marketBudgetPercentage = market.budgetPercentage || 100;
        const phaseBudgetPercentage = phase.budgetPercentage || 100;

        const phaseBudget =
          ((totalCampaignBudget * platformBudgetPercentage) / 100) *
          (marketBudgetPercentage / 100) *
          (phaseBudgetPercentage / 100);

        // Calculate duration in days (including start and end day)
        const startDate = new Date(phase.startDate || campaign.start_date);
        const endDate = new Date(phase.endDate || campaign.end_date);
        const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // Use the phase's budget type (default to lifetime if not set)
        const budgetType = phase.budgetType || "lifetime";
        const dailyBudget = budgetType === "daily" ? Math.round((phaseBudget / durationDays) * 100) : null;
        const lifetimeBudget = budgetType === "lifetime" ? Math.round(phaseBudget * 100) : null;

        // Build targeting - get from phase.targeting or campaign.generic_config.basicTargeting
        const basicTargeting = campaign.generic_config?.basicTargeting || {};
        const phaseBasicTargeting = phase.targeting || {};

        // Use phase targeting if available, otherwise use basic targeting
        const effectiveBasicTargeting =
          Object.keys(phaseBasicTargeting).length > 0 ? phaseBasicTargeting : basicTargeting;

        console.log("Effective basic targeting for phase:", phase.name, effectiveBasicTargeting);

        // CRITICAL: Use market.countries if available, otherwise use market.name (ISO code)
        const marketCountries =
          Array.isArray(market.countries) && market.countries.length > 0 ? market.countries : [market.name]; // market.name is already the ISO code

        const targeting: any = {
          geo_locations: {
            countries: marketCountries,
          },
          age_min: effectiveBasicTargeting.ageMin || 18,
          age_max: effectiveBasicTargeting.ageMax || 65,
        };

        // Add gender targeting if specified (handle array of IDs like ["1", "2"])
        const genders = effectiveBasicTargeting.genders;
        if (genders && Array.isArray(genders) && genders.length > 0 && !genders.includes("all")) {
          // Convert string IDs to numbers and filter valid ones
          const genderIds = genders
            .map((g: string | number) => parseInt(String(g)))
            .filter((g: number) => !isNaN(g) && (g === 1 || g === 2));
          if (genderIds.length > 0) {
            targeting.genders = genderIds;
            console.log("Adding gender targeting:", genderIds);
          }
        }

        // Add language targeting if specified
        const languages = effectiveBasicTargeting.languages;
        if (languages && Array.isArray(languages) && languages.length > 0 && !languages.includes("all")) {
          const locales = languages
            .map((lang: string | number) => parseInt(String(lang)))
            .filter((l: number) => !isNaN(l));
          if (locales.length > 0) {
            targeting.locales = locales;
            console.log("Adding language targeting:", locales);
          }
        }

        // Add device targeting if specified (mobile, desktop, etc.)
        const devices = effectiveBasicTargeting.devices;
        if (devices && Array.isArray(devices) && devices.length > 0 && !devices.includes("all")) {
          targeting.device_platforms = devices;
          console.log("Adding device targeting:", devices);
        }

        // Add OS targeting if specified (iOS, Android, etc.)
        const os = effectiveBasicTargeting.os;
        if (os && Array.isArray(os) && os.length > 0 && !os.includes("all")) {
          targeting.user_os = os;
          console.log("Adding OS targeting:", os);
        }

        // Check for Advantage+ placements flag (Meta automatic placement optimization)
        // When enabled, don't set any publisher_platforms or positions - Meta optimizes automatically
        const advantagePlusPlacements =
          phase.advantagePlusPlacements ?? (market as any).metaAdvantagePlusPlacements ?? true;
        console.log("📍 Advantage+ placements enabled:", advantagePlusPlacements);

        if (advantagePlusPlacements) {
          // With Advantage+ placements, we don't specify any placement constraints
          // Meta will automatically optimize across all available placements
          console.log("📍 Using Advantage+ placements - Meta will auto-optimize");
          // Don't set publisher_platforms, facebook_positions, instagram_positions, etc.
        } else {
          // Manual placements mode - specify publisher platforms and positions
          // Add publisher platforms from phase (facebook, instagram, audience_network, messenger, threads)
          // Filter out 'messenger' since all messenger placements are now deprecated
          // Priority: phase.publisherPlatforms > market.metaPublisherPlatforms > defaults
          const publisherPlatforms = phase.publisherPlatforms || (market as any).metaPublisherPlatforms;
          console.log("📍 Raw publisherPlatforms from phase:", JSON.stringify(phase.publisherPlatforms));
          console.log(
            "📍 Raw metaPublisherPlatforms from market:",
            JSON.stringify((market as any).metaPublisherPlatforms),
          );
          console.log("📍 Resolved publisherPlatforms:", JSON.stringify(publisherPlatforms));
          if (publisherPlatforms && Array.isArray(publisherPlatforms) && publisherPlatforms.length > 0) {
            const filteredPlatforms = publisherPlatforms.filter((p: string) => p !== "messenger");
            if (filteredPlatforms.length > 0) {
              targeting.publisher_platforms = filteredPlatforms;
              console.log("Adding publisher platforms (messenger filtered out):", filteredPlatforms);
            }
          } else {
            // If no publisher platforms specified, default to all except messenger
            targeting.publisher_platforms = ["facebook", "instagram", "audience_network"];
            console.log("No publisherPlatforms specified, using defaults:", targeting.publisher_platforms);
          }

          // Add placements/positions from phase or market defaults
          // Priority: phase.positions > market.metaPositions > defaults
          const positions = phase.positions || (market as any).metaPositions;
          console.log("📍 Raw positions from phase:", JSON.stringify(phase.positions));
          console.log("📍 Raw metaPositions from market:", JSON.stringify((market as any).metaPositions));
          console.log("📍 Resolved positions:", JSON.stringify(positions));

          // Valid placements per Meta API (updated to remove deprecated ones)
          // NOTE: As of Oct 2025, ALL Messenger placements are deprecated:
          // - messenger_home: deprecated Oct 9, 2025
          // - sponsored_messages: deprecated May 2024
          const validFacebookPositions = [
            "feed",
            "instant_article",
            "instream_video",
            "marketplace",
            "search",
            "video_feeds",
            "story",
          ];
          const validInstagramPositions = ["stream", "story", "explore", "explore_home", "reels"];
          const validAudienceNetworkPositions = ["classic", "instream_video", "rewarded_video"];
          const validMessengerPositions: string[] = []; // Empty - all messenger placements deprecated

          // If no positions specified or positions is empty, default to all valid positions for each publisher platform
          if (!positions || Object.keys(positions).length === 0) {
            console.log("📍 No positions specified, using all valid positions for each publisher platform");
            if (targeting.publisher_platforms?.includes("facebook")) {
              targeting.facebook_positions = validFacebookPositions;
              console.log("Adding Facebook positions (default all):", validFacebookPositions);
            }
            if (targeting.publisher_platforms?.includes("instagram")) {
              targeting.instagram_positions = validInstagramPositions;
              console.log("Adding Instagram positions (default all):", validInstagramPositions);
            }
            if (targeting.publisher_platforms?.includes("audience_network")) {
              targeting.audience_network_positions = validAudienceNetworkPositions;
              console.log("Adding Audience Network positions (default all):", validAudienceNetworkPositions);
            }
          } else if (positions) {
            // Handle Facebook positions
            if (positions.facebook && Array.isArray(positions.facebook) && positions.facebook.length > 0) {
              if (positions.facebook.includes("automatic")) {
                // When automatic, use all valid positions
                targeting.facebook_positions = validFacebookPositions;
                console.log("Adding Facebook positions (automatic):", validFacebookPositions);
              } else {
                // Filter out deprecated placements
                const filteredPositions = positions.facebook.filter((p: string) => validFacebookPositions.includes(p));
                if (filteredPositions.length > 0) {
                  targeting.facebook_positions = filteredPositions;
                  console.log("Adding Facebook positions:", filteredPositions);
                }
              }
            }

            // Handle Instagram positions
            if (positions.instagram && Array.isArray(positions.instagram) && positions.instagram.length > 0) {
              if (positions.instagram.includes("automatic")) {
                targeting.instagram_positions = validInstagramPositions;
                console.log("Adding Instagram positions (automatic):", validInstagramPositions);
              } else {
                const filteredPositions = positions.instagram.filter((p: string) =>
                  validInstagramPositions.includes(p),
                );
                if (filteredPositions.length > 0) {
                  targeting.instagram_positions = filteredPositions;
                  console.log("Adding Instagram positions:", filteredPositions);
                }
              }
            }

            // Handle Audience Network positions
            if (
              positions.audience_network &&
              Array.isArray(positions.audience_network) &&
              positions.audience_network.length > 0
            ) {
              if (positions.audience_network.includes("automatic")) {
                targeting.audience_network_positions = validAudienceNetworkPositions;
                console.log("Adding Audience Network positions (automatic):", validAudienceNetworkPositions);
              } else {
                const filteredPositions = positions.audience_network.filter((p: string) =>
                  validAudienceNetworkPositions.includes(p),
                );
                if (filteredPositions.length > 0) {
                  targeting.audience_network_positions = filteredPositions;
                  console.log("Adding Audience Network positions:", filteredPositions);
                }
              }
            }

            // Handle Messenger positions - DEPRECATED: All messenger placements removed as of 2024-2025
            // messenger_home: deprecated Oct 9, 2025
            // sponsored_messages: deprecated May 2024
            // Do not add messenger_positions to targeting to avoid MESSENGER_THREAD errors
            if (positions.messenger && Array.isArray(positions.messenger) && positions.messenger.length > 0) {
              console.log("Messenger positions requested but skipped (all deprecated):", positions.messenger);
            }
            // Note: Threads positions are handled automatically by Meta when 'threads' is in publisher_platforms
            // Do not add threads_positions field as it causes API errors
          }
        }

        // Add detailed targeting (interests, behaviors)
        if (market.detailedTargeting && market.detailedTargeting.length > 0) {
          targeting.flexible_spec = market.detailedTargeting.map((t: any) => ({
            [t.type]: [{ id: t.id, name: t.name }],
          }));
        }

        // Get targeting config - use phase targeting or campaign basic targeting for ALL markets
        // This ensures targeting is applied consistently across all markets in a platform
        const campaignBasicTargeting = campaign.generic_config?.basicTargeting || {};
        const phaseTargetingConfig = phase.targeting || {};
        const effectiveTargeting =
          Object.keys(phaseTargetingConfig).length > 0 ? phaseTargetingConfig : campaignBasicTargeting;

        const targetingConfig =
          phase.overrideTargeting && phase.targeting ? phase.targeting : campaign.generic_config?.targeting || {};

        // Transform unified targeting format into Meta-specific arrays
        let metaInterests: any[] = [];
        let metaBehaviors: any[] = [];
        let metaDemographics: any[] = [];

        // If using unified targeting (selectedItems array from UnifiedTargeting component)
        if (effectiveTargeting.selectedItems && Array.isArray(effectiveTargeting.selectedItems)) {
          console.log(`🎯 Transforming ${effectiveTargeting.selectedItems.length} unified targeting items for Meta`);
          console.log(`📝 Sample item structure:`, JSON.stringify(effectiveTargeting.selectedItems[0], null, 2));

          effectiveTargeting.selectedItems.forEach((item: any) => {
            // Only process items available on Meta
            if (item.platforms && item.platforms.includes("meta")) {
              // Extract the correct Meta ID - handle different ID formats
              let metaIdValue = item.metaId || item.id;
              // Remove prefix if present (e.g., "meta-123" -> "123")
              if (typeof metaIdValue === "string" && metaIdValue.startsWith("meta-")) {
                metaIdValue = metaIdValue.substring(5);
              }
              if (typeof metaIdValue === "string" && metaIdValue.startsWith("unified-")) {
                metaIdValue = item.metaId; // For unified items, use metaId directly
              }

              const metaItem = {
                id: metaIdValue,
                name: item.name,
                category: item.category,
              };

              // Categorize by type (case-insensitive)
              const categoryLower = (item.category || "").toLowerCase();
              if (categoryLower === "interest" || categoryLower === "interests") {
                metaInterests.push(metaItem);
                console.log(`  ✓ Interest: ${item.name} (${metaItem.id})`);
              } else if (categoryLower === "behavior" || categoryLower === "behaviors") {
                metaBehaviors.push(metaItem);
                console.log(`  ✓ Behavior: ${item.name} (${metaItem.id})`);
              } else if (categoryLower === "demographic" || categoryLower === "demographics") {
                metaDemographics.push(metaItem);
                console.log(`  ✓ Demographic: ${item.name} (${metaItem.id})`);
              } else {
                console.warn(`  ⚠️ Unknown category '${item.category}' for item: ${item.name}`);
              }
            }
          });

          console.log(
            `📊 Transformed targeting - Interests: ${metaInterests.length}, Behaviors: ${metaBehaviors.length}, Demographics: ${metaDemographics.length}`,
          );
        } else {
          // Fallback to legacy format
          metaInterests = effectiveTargeting.aiInterests || effectiveTargeting.interests || [];
          metaBehaviors = effectiveTargeting.aiBehaviors || effectiveTargeting.behaviors || [];
          metaDemographics = effectiveTargeting.aiDemographics || [];
          console.log("📊 Using legacy targeting format for Meta");
        }

        if (metaInterests.length > 0 || metaBehaviors.length > 0 || metaDemographics.length > 0) {
          console.log(`Using transformed targeting for market ${market.name}:`, {
            interests: metaInterests.length,
            behaviors: metaBehaviors.length,
            demographics: metaDemographics.length,
          });

          // Override basic demographics with data
          if (effectiveTargeting.location && effectiveTargeting.location.length > 0) {
            targeting.geo_locations = { countries: effectiveTargeting.location };
          }
          if (effectiveTargeting.ageMin) {
            targeting.age_min = effectiveTargeting.ageMin;
          }
          if (effectiveTargeting.ageMax) {
            targeting.age_max = effectiveTargeting.ageMax;
          }
          if (effectiveTargeting.gender && effectiveTargeting.gender.length > 0) {
            const genderMap: any = { male: [1], female: [2] };
            const genders = effectiveTargeting.gender.flatMap((g: string) => genderMap[g.toLowerCase()] || []);
            if (genders.length > 0) {
              targeting.genders = genders;
            }
          }

          // Helper function to filter out deprecated Meta targeting categories
          const isValidMetaTargeting = (item: any): boolean => {
            const name = (item.name || "").toLowerCase();
            const id = String(item.id || "");

            // Filter out "Friends of X" categories - Meta deprecated most of these for privacy
            if (name.includes("friends of")) {
              console.log(`  ⚠️ Filtering deprecated "Friends of" category: ${item.name}`);
              return false;
            }

            // Filter out IDs that don't look like standard Meta targeting category IDs
            // Standard Meta targeting IDs are 13-14 digits starting with 6
            // Entity/Page IDs are often longer or start with other numbers
            if (id.length > 14 || (id.length > 10 && !id.startsWith("6"))) {
              console.log(`  ⚠️ Filtering suspicious ID (looks like entity ID, not targeting): ${item.name} (${id})`);
              return false;
            }

            return true;
          };

          // Add interests from transformed targeting
          if (metaInterests.length > 0) {
            const interests = metaInterests
              .map((i: any) => ({
                id: i.id || i,
                name: i.name || i,
              }))
              .filter((i: any) => i.id && isValidMetaTargeting(i));
            if (interests.length > 0) {
              targeting.flexible_spec = targeting.flexible_spec || [];
              targeting.flexible_spec.push({ interests });
              console.log(`Adding ${interests.length} interests:`, interests.map((i: any) => i.name).join(", "));
            }
          }

          // Add behaviors from transformed targeting
          if (metaBehaviors.length > 0) {
            const behaviors = metaBehaviors
              .map((b: any) => ({
                id: b.id || b,
                name: b.name || b,
              }))
              .filter((b: any) => b.id && isValidMetaTargeting(b));
            if (behaviors.length > 0) {
              targeting.flexible_spec = targeting.flexible_spec || [];
              targeting.flexible_spec.push({ behaviors });
              console.log(`Adding ${behaviors.length} behaviors:`, behaviors.map((b: any) => b.name).join(", "));
            }
          }

          // SKIP demographics for now - they're causing "Category No Longer Available" errors
          // Demographics from search API don't reliably map to valid targeting categories
          if (metaDemographics.length > 0) {
            console.log(`⚠️ Skipping ${metaDemographics.length} demographics to avoid deprecated category errors`);
          }

          // Add custom audiences
          if (effectiveTargeting.customAudiences && effectiveTargeting.customAudiences.length > 0) {
            targeting.custom_audiences = effectiveTargeting.customAudiences.map((a: any) => ({
              id: a.id,
              name: a.name,
            }));
            console.log(`Adding ${effectiveTargeting.customAudiences.length} custom audiences`);
          }

          // Add lookalike audiences
          if (effectiveTargeting.lookalikes && effectiveTargeting.lookalikes.length > 0) {
            targeting.custom_audiences = targeting.custom_audiences || [];
            effectiveTargeting.lookalikes.forEach((la: any) => {
              targeting.custom_audiences.push({
                id: la.id,
                name: la.name,
              });
            });
            console.log(`Adding ${effectiveTargeting.lookalikes.length} lookalike audiences`);
          }

          // Add customer lists
          if (effectiveTargeting.customerLists && effectiveTargeting.customerLists.length > 0) {
            targeting.custom_audiences = targeting.custom_audiences || [];
            effectiveTargeting.customerLists.forEach((cl: any) => {
              targeting.custom_audiences.push({
                id: cl.id,
                name: cl.name,
              });
            });
            console.log(`Adding ${effectiveTargeting.customerLists.length} customer lists`);
          }
        }

        // Process old targeting config format (legacy fallback)
        if (targetingConfig.websiteAudience) {
          const audienceNames = targetingConfig.websiteAudience
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
          if (audienceNames.length > 0) {
            console.warn(
              "Skipping websiteAudience fallback (names only). Audience IDs are required to target custom audiences.",
            );
          }
        }

        // Fallback to old targeting config if no AI-parsed targeting (continued)
        if (targetingConfig.lookalikeAudience) {
          const lookalikeNames = targetingConfig.lookalikeAudience
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
          if (lookalikeNames.length > 0) {
            console.warn("Skipping lookalikeAudience fallback (names only). Audience IDs are required.");
          }
        }

        // Add interests from targeting config
        if (targetingConfig.interests) {
          const interests = targetingConfig.interests
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
          if (interests.length > 0) {
            console.warn(
              "Skipping interests fallback (names only). Use AI-parsed targeting to include valid interest IDs.",
            );
          }
        }

        // Add customer list (custom audiences from file)
        if (targetingConfig.customerList) {
          const customerLists = targetingConfig.customerList
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
          if (customerLists.length > 0) {
            console.warn("Skipping customerList fallback (names only). Audience IDs are required.");
          }
        }

        // Sanitize targeting: remove invalid detailed targeting entries without IDs
        if (targeting.flexible_spec && Array.isArray(targeting.flexible_spec)) {
          targeting.flexible_spec = targeting.flexible_spec
            .map((spec: any) => {
              const cleaned: any = {};
              for (const key of Object.keys(spec)) {
                const items = Array.isArray(spec[key])
                  ? spec[key].filter((i: any) => i && typeof i.id === "string" && i.id.trim() !== "")
                  : [];
                if (items.length > 0) cleaned[key] = items;
              }
              return cleaned;
            })
            .filter((spec: any) => Object.keys(spec).length > 0);
          if (targeting.flexible_spec.length === 0) {
            delete targeting.flexible_spec;
          }
        }

        // Normalize custom_audiences: keep only valid IDs
        if (targeting.custom_audiences) {
          const normalized = (Array.isArray(targeting.custom_audiences) ? targeting.custom_audiences : [])
            .map((a: any) => {
              if (!a) return null;
              if (typeof a === "string" && /^\d+$/.test(a)) return { id: a };
              if (typeof a === "object" && a.id) return { id: String(a.id) };
              return null;
            })
            .filter(Boolean);
          if (normalized.length > 0) {
            targeting.custom_audiences = normalized;
          } else {
            delete targeting.custom_audiences;
          }
        }

        // ============= BID STRATEGY TRACKING =============
        // Log the FULL path of bid strategy values to trace where they come from
        console.log(`\n🎯 === BID STRATEGY DEBUG for ${market.name} / ${phase.name} ===`);
        console.log(`📥 Raw market data:`, {
          "market.metaBidStrategy": (market as any).metaBidStrategy,
          "market.metaBidAmount": (market as any).metaBidAmount,
        });
        console.log(`📥 Raw phase data:`, {
          "phase.metaBidStrategy": (phase as any).metaBidStrategy,
          "phase.metaBidAmount": (phase as any).metaBidAmount,
        });

        // Validate bid strategy compatibility with optimization goal
        // COST_CAP, LOWEST_COST_WITH_BID_CAP, and TARGET_COST only work with specific optimization goals
        const bidStrategyCompatibleGoals = [
          "OFFSITE_CONVERSIONS",
          "VALUE",
          "LINK_CLICKS",
          "LANDING_PAGE_VIEWS",
          "LEAD_GENERATION",
          "APP_INSTALLS",
        ];

        // Phase-level Meta fields take priority over market-level
        const requestedBidStrategy =
          phase.metaBidStrategy || (market as any).metaBidStrategy || "LOWEST_COST_WITHOUT_CAP";
        const metaBidAmount = phase.metaBidAmount || (market as any).metaBidAmount;
        const userBillingEvent = phase.metaBillingEvent || (market as any).metaBillingEvent;

        console.log(`🔧 Resolved values (phase > market > default):`, {
          requestedBidStrategy,
          metaBidAmount,
          userBillingEvent,
        });

        const metaLandingPageUrl = phase.metaLandingPageUrl || (market as any).metaLandingPageUrl;

        // Meta billing_event + optimization_goal compatibility mapping
        // The billing_event MUST be compatible with the optimization_goal or the API will reject.
        // NOTE: Some optimization goals allow multiple billing events (e.g. THRUPLAY can also be billed on IMPRESSIONS).
        const getBillingEventForOptimizationGoal = (optGoal: string, userEvent?: string): string => {
          // SPECIAL CASE: For new/limited Meta ad accounts, billing on THRUPLAY can be blocked.
          // Meta allows THRUPLAY optimization while billing on IMPRESSIONS, so honor the user's selection.
          if (optGoal === "THRUPLAY" && userEvent === "IMPRESSIONS") {
            return "IMPRESSIONS";
          }

          // Map optimization goals to their default/required billing events
          const billingEventMap: Record<string, string> = {
            // Awareness & Reach - IMPRESSIONS only
            REACH: "IMPRESSIONS",
            IMPRESSIONS: "IMPRESSIONS",
            BRAND_AWARENESS: "IMPRESSIONS",
            AD_RECALL_LIFT: "IMPRESSIONS",
            // Traffic - LINK_CLICKS or IMPRESSIONS (Meta restricts per optimization goal)
            LINK_CLICKS: "LINK_CLICKS",
            LANDING_PAGE_VIEWS: "IMPRESSIONS",
            POST_ENGAGEMENT: "IMPRESSIONS",
            PAGE_LIKES: "IMPRESSIONS",
            EVENT_RESPONSES: "IMPRESSIONS",
            // Video
            THRUPLAY: "THRUPLAY",
            TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "IMPRESSIONS",
            // Conversions - IMPRESSIONS only (despite the name)
            OFFSITE_CONVERSIONS: "IMPRESSIONS",
            VALUE: "IMPRESSIONS",
            // App - IMPRESSIONS
            APP_INSTALLS: "IMPRESSIONS",
            APP_EVENTS: "IMPRESSIONS",
            // Lead Gen - IMPRESSIONS
            LEAD_GENERATION: "IMPRESSIONS",
            QUALITY_LEAD: "IMPRESSIONS",
            // Messaging - IMPRESSIONS or REPLIES
            CONVERSATIONS: "IMPRESSIONS",
            REPLIES: "IMPRESSIONS",
          };

          const requiredEvent = billingEventMap[optGoal];
          if (requiredEvent) {
            if (userEvent && userEvent !== requiredEvent) {
              console.warn(`⚠️ Billing event ${userEvent} not compatible with ${optGoal}. Using ${requiredEvent}`);
            }
            return requiredEvent;
          }
          // Default fallback
          return userEvent || "IMPRESSIONS";
        };

        const metaBillingEvent = getBillingEventForOptimizationGoal(optimizationGoal, userBillingEvent);
        const rawMetaOptimizationLocation =
          phase.metaOptimizationLocation || (market as any).metaOptimizationLocation || "WEBSITE";

        // Map internal destination values to Meta's exact API enum values
        const metaDestinationTypeMap: Record<string, string> = {
          WEBSITE: "WEBSITE",
          website: "WEBSITE",
          Website: "WEBSITE",
          APP: "APP",
          app: "APP",
          App: "APP",
          MESSAGING_APPS: "MESSENGER",
          "Messaging Apps": "MESSENGER",
          MESSENGER: "MESSENGER",
          CALLS: "ON_AD",
          Calls: "ON_AD",
          SHOP: "SHOP_AUTOMATIC",
          Shop: "SHOP_AUTOMATIC",
        };
        const metaOptimizationLocation =
          metaDestinationTypeMap[rawMetaOptimizationLocation] || rawMetaOptimizationLocation.toUpperCase();

        // Attribution window validation - Meta enforces STRICT attribution window rules
        // Valid combinations are ONLY: (1,0), (1,1), (7,0), (7,1) for (click_through, view_through)
        // Click-through: only 1 or 7 days allowed
        // View-through: only 0 or 1 days allowed
        // Extended windows (28 days click, 7 days view) are NOT supported in 2024+ API
        const trueConversionObjectives = ["OUTCOME_SALES", "CONVERSIONS"];
        const trueConversionGoals = ["OFFSITE_CONVERSIONS", "VALUE"];
        const hasFullAttribution =
          trueConversionObjectives.includes(objective) && trueConversionGoals.includes(optimizationGoal);

        // Get raw configured values
        const rawClickWindow = phase.metaClickWindow || (market as any).metaClickWindow;
        const rawViewWindow = phase.metaViewWindow || (market as any).metaViewWindow;

        let metaClickWindow: number;
        let metaViewWindow: number;

        if (hasFullAttribution) {
          // Conversion objectives can use 7-day click window
          // But MUST clamp click to 1 or 7, view to 0 or 1
          metaClickWindow = rawClickWindow === 1 ? 1 : 7; // Default to 7 for conversions
          metaViewWindow = rawViewWindow === 0 ? 0 : 1; // Default to 1 for conversions
          console.log(
            `✅ ${objective}/${optimizationGoal} supports full attribution. Using click=${metaClickWindow}d, view=${metaViewWindow}d (raw: ${rawClickWindow}, ${rawViewWindow})`,
          );
        } else {
          // Force (1, 0) for all other objectives - Meta only supports this combination
          metaClickWindow = 1;
          metaViewWindow = 0;
          console.log(
            `⚠️ ${objective}/${optimizationGoal} only supports limited attribution (1,0). Forcing click=${metaClickWindow}d, view=${metaViewWindow}d (configured was: ${rawClickWindow}, ${rawViewWindow})`,
          );
        }

        // ============= BID STRATEGY COMPATIBILITY CHECK =============
        const requiresBidCap =
          requestedBidStrategy === "COST_CAP" ||
          requestedBidStrategy === "LOWEST_COST_WITH_BID_CAP" ||
          requestedBidStrategy === "TARGET_COST";
        const isCompatible = bidStrategyCompatibleGoals.includes(optimizationGoal);

        let finalBidStrategy = requestedBidStrategy;
        if (requiresBidCap && !isCompatible) {
          console.warn(
            `⚠️ Bid strategy ${requestedBidStrategy} is not compatible with optimization goal ${optimizationGoal}`,
          );
          console.warn(`Falling back to LOWEST_COST_WITHOUT_CAP for ${optimizationGoal}`);
          finalBidStrategy = "LOWEST_COST_WITHOUT_CAP";
        }

        console.log(`📊 Bid Strategy Decision:`, {
          requestedBidStrategy,
          finalBidStrategy,
          wasOverridden: requestedBidStrategy !== finalBidStrategy,
          reasonForOverride:
            requiresBidCap && !isCompatible ? `${requestedBidStrategy} incompatible with ${optimizationGoal}` : "none",
          metaBidAmount,
          optimizationGoal,
          isCompatibleWithBidCap: isCompatible,
        });

        // ============= AD SET SPLIT SUPPORT =============
        // If phase has adSets defined (split), iterate over each ad set
        // Otherwise, create a single ad set for the phase
        const adSetSplitDimension = phase.adSetSplitDimension || "none";
        const adSetsToCreate: Array<
          AdSetConfig & { adSetBudget: number; adSetLifetimeBudget: number | null; adSetDailyBudget: number | null }
        > = [];
        const useCBO = phase.useCBO === true; // Campaign Budget Optimization

        if (phase.adSets && Array.isArray(phase.adSets) && phase.adSets.length > 0 && adSetSplitDimension !== "none") {
          console.log(
            `📦 AD SET SPLIT DETECTED: ${phase.adSets.length} ad sets with dimension '${adSetSplitDimension}'`,
          );
          console.log(`📦 CBO mode: ${useCBO ? "ON (platform distributes budget)" : "OFF (manual budget per ad set)"}`);

          for (const adSetConfig of phase.adSets as AdSetConfig[]) {
            // Calculate budget for this ad set based on percentage
            const adSetBudgetPercentage = adSetConfig.budgetPercentage || 100 / phase.adSets.length;
            const adSetBudget = useCBO ? phaseBudget : (phaseBudget * adSetBudgetPercentage) / 100;
            const adSetLifetimeBudget = useCBO
              ? null
              : budgetType === "lifetime"
                ? Math.round(adSetBudget * 100)
                : null;
            const adSetDailyBudget = useCBO
              ? null
              : budgetType === "daily"
                ? Math.round((adSetBudget / durationDays) * 100)
                : null;

            adSetsToCreate.push({
              ...adSetConfig,
              adSetBudget,
              adSetLifetimeBudget,
              adSetDailyBudget,
            });
          }
        } else {
          // No split - create single ad set with full phase budget
          adSetsToCreate.push({
            id: "default",
            name: phase.name,
            dimensionValue: "",
            budgetPercentage: 100,
            adSetBudget: phaseBudget,
            adSetLifetimeBudget: lifetimeBudget,
            adSetDailyBudget: dailyBudget,
          });
        }

        // Create each ad set
        for (let adSetIdx = 0; adSetIdx < adSetsToCreate.length; adSetIdx++) {
          const adSetConfig = adSetsToCreate[adSetIdx];

          // Apply targeting overrides from ad set split
          let adSetTargeting = { ...targeting };
          if (adSetSplitDimension !== "none" && adSetConfig.id !== "default") {
            adSetTargeting = applyMetaAdSetOverrides(adSetTargeting, adSetConfig, adSetSplitDimension);
            console.log(`📦 Applied ${adSetSplitDimension} targeting override for ad set ${adSetConfig.name}`);
          }

          // Apply placement overrides from ad set split (placement dimension)
          let adSetPublisherPlatforms = phase.publisherPlatforms || (market as any).metaPublisherPlatforms;
          let adSetPositions = phase.positions || (market as any).metaPositions;
          let adSetAdvantagePlus = advantagePlusPlacements;

          if (adSetSplitDimension === "placement" && adSetConfig.id !== "default") {
            const placementOverrides = getMetaPlacementOverrides(adSetConfig);
            if (placementOverrides.publisherPlatforms && placementOverrides.publisherPlatforms.length > 0) {
              adSetPublisherPlatforms = placementOverrides.publisherPlatforms;
              adSetAdvantagePlus = false; // Force manual when split by placement
            }
            if (placementOverrides.positions) {
              adSetPositions = placementOverrides.positions;
            }
            console.log(
              `📦 Placement split override: publishers=${JSON.stringify(adSetPublisherPlatforms)}, positions=${JSON.stringify(adSetPositions)}`,
            );
          }

          // Apply placement targeting to ad set targeting object
          if (!adSetAdvantagePlus && adSetPublisherPlatforms && Array.isArray(adSetPublisherPlatforms)) {
            const filteredPlatforms = adSetPublisherPlatforms.filter((p: string) => p !== "messenger");
            if (filteredPlatforms.length > 0) {
              adSetTargeting.publisher_platforms = filteredPlatforms;
            }

            // Apply positions
            if (adSetPositions && Object.keys(adSetPositions).length > 0) {
              const validFacebookPositions = [
                "feed",
                "instant_article",
                "instream_video",
                "marketplace",
                "search",
                "video_feeds",
                "story",
              ];
              const validInstagramPositions = ["stream", "story", "explore", "explore_home", "reels"];
              const validAudienceNetworkPositions = ["classic", "instream_video", "rewarded_video"];

              if (adSetPositions.facebook && adSetPositions.facebook.length > 0) {
                const filtered = adSetPositions.facebook.filter((p: string) => validFacebookPositions.includes(p));
                if (filtered.length > 0) adSetTargeting.facebook_positions = filtered;
              }
              if (adSetPositions.instagram && adSetPositions.instagram.length > 0) {
                const filtered = adSetPositions.instagram.filter((p: string) => validInstagramPositions.includes(p));
                if (filtered.length > 0) adSetTargeting.instagram_positions = filtered;
              }
              if (adSetPositions.audience_network && adSetPositions.audience_network.length > 0) {
                const filtered = adSetPositions.audience_network.filter((p: string) =>
                  validAudienceNetworkPositions.includes(p),
                );
                if (filtered.length > 0) adSetTargeting.audience_network_positions = filtered;
              }
            }
          }

          // Build ad set taxonomy context
          const adsetTaxonomyContext: TaxonomyContext = {
            platform: "meta",
            objective: objective,
            optimizationGoal: adSetConfig.optimizationGoal || optimizationGoal,
            phaseBudget: adSetConfig.adSetBudget,
            budgetType: budgetType,
            ageMin: adSetConfig.ageMin || effectiveBasicTargeting.ageMin || 18,
            ageMax: adSetConfig.ageMax || effectiveBasicTargeting.ageMax || 65,
            gender: adSetConfig.gender || effectiveBasicTargeting.genders?.[0],
            location: adSetConfig.countries?.[0] || market.name,
            devices: adSetConfig.devices || effectiveBasicTargeting.devices,
            languages: adSetConfig.languages || effectiveBasicTargeting.languages,
            placementType: adSetAdvantagePlus ? "automatic" : "manual",
            advantagePlusPlacements: adSetAdvantagePlus,
            targetingType: effectiveBasicTargeting.targetingExpansion ? "expand" : "native",
            startDate: phase.startDate || campaign.start_date,
            endDate: phase.endDate || campaign.end_date,
          };

          const adsetTaxonomyName = adAccountId
            ? await generateTaxonomyName(
                supabase,
                campaign.user_id,
                adAccountId,
                "meta",
                "adset",
                adsetTaxonomyContext,
                phase.adsetTaxonomyValues,
              )
            : null;

          // Generate ad set name with split info
          const splitSuffix = adSetConfig.id !== "default" ? `_${adSetConfig.name}` : "";
          const defaultAdSetName = `${phase.name}${splitSuffix} - Ad Set_${generateTimestampSuffix()}`;

          // CRITICAL: Each ad set may have its own optimization goal, so billing event must match
          const adSetOptimizationGoal = adSetConfig.optimizationGoal || optimizationGoal;
          const adSetBillingEvent = getBillingEventForOptimizationGoal(
            adSetOptimizationGoal,
            adSetConfig.billingEvent || userBillingEvent,
          );

          // CRITICAL: Each ad set may have its own bid strategy and bid amount (especially for optimization_goal splits)
          const adSetBidStrategy = adSetConfig.bidStrategy || finalBidStrategy;
          const adSetBidAmount = adSetConfig.bidAmount ?? metaBidAmount;

          // ============= AD SET LEVEL BID STRATEGY LOGGING =============
          console.log(`\n💼 === AD SET BID STRATEGY for "${adSetConfig.name}" ===`);
          console.log(`📥 adSetConfig.bidStrategy: ${adSetConfig.bidStrategy ?? "(not set)"}`);
          console.log(`📥 adSetConfig.bidAmount: ${adSetConfig.bidAmount ?? "(not set)"}`);
          console.log(`📤 Using finalBidStrategy from phase: ${finalBidStrategy}`);
          console.log(`📤 Using metaBidAmount from phase: ${metaBidAmount ?? "(not set)"}`);
          console.log(`🎯 FINAL adSetBidStrategy: ${adSetBidStrategy}`);
          console.log(`🎯 FINAL adSetBidAmount: ${adSetBidAmount ?? "(not set)"}`);

          const adSetPayload: any = {
            name: adsetTaxonomyName || defaultAdSetName,
            campaign_id: campaignData.id,
            billing_event: adSetBillingEvent,
            optimization_goal: adSetOptimizationGoal,
            bid_strategy: adSetBidStrategy,
            status: "PAUSED",
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            targeting: {
              ...adSetTargeting,
            },
          };

          // Add attribution settings
          adSetPayload.attribution_spec = [
            { event_type: "CLICK_THROUGH", window_days: metaClickWindow },
            { event_type: "VIEW_THROUGH", window_days: metaViewWindow },
          ];

          // ============= ADVANTAGE+ AUDIENCE & CREATIVE SUPPORT =============
          // Meta now requires the advantage_audience flag inside targeting.targeting_automation
          const advantagePlusAudience = phase.metaAdvantagePlusAudience === true || isAdvantagePlusCampaign;
          adSetPayload.targeting.targeting_automation = {
            ...(adSetPayload.targeting?.targeting_automation || {}),
            advantage_audience: advantagePlusAudience ? 1 : 0,
          };
          console.log(`🎯 Advantage+ Audience ${advantagePlusAudience ? 'enabled' : 'disabled'} - setting targeting.targeting_automation.advantage_audience=${advantagePlusAudience ? 1 : 0}`);

          // Advantage+ Creative is set at ad level, but we log the intent here
          const advantagePlusCreative = phase.metaAdvantagePlusCreative === true;
          if (advantagePlusCreative) {
            console.log(`🎨 Advantage+ Creative enabled for this phase - will apply to ad creatives`);
          }

          // Catalog/Product Set for Advantage+ Shopping
          if (isAdvantagePlusCampaign && phase.metaCatalogId) {
            adSetPayload.promoted_object = {
              ...(adSetPayload.promoted_object || {}),
              product_catalog_id: phase.metaCatalogId,
            };
            if (phase.metaProductSetId) {
              adSetPayload.promoted_object.product_set_id = phase.metaProductSetId;
            }
            console.log(`🛒 ASC Catalog: ${phase.metaCatalogId}, Product Set: ${phase.metaProductSetId || 'all'}`);
          }
          // ============= END ADVANTAGE+ SUPPORT =============

          // Add destination URL for traffic campaigns
          if (
            metaLandingPageUrl &&
            (adSetPayload.optimization_goal === "LINK_CLICKS" ||
              adSetPayload.optimization_goal === "LANDING_PAGE_VIEWS")
          ) {
            adSetPayload.destination_type = metaOptimizationLocation;
          }

          // DSA compliance
          adSetPayload.dsa_beneficiary = campaign.name || "Advertiser";
          adSetPayload.dsa_payor = campaign.name || "Advertiser";

          // Add bid amount if required by the ad set's bid strategy
          // CRITICAL: LOWEST_COST_WITH_BID_CAP, COST_CAP, and TARGET_COST REQUIRE a bid_amount
          // CRITICAL: LOWEST_COST_WITHOUT_CAP must NOT have bid_amount in payload at all
          const requiresBidAmount =
            adSetBidStrategy === "LOWEST_COST_WITH_BID_CAP" ||
            adSetBidStrategy === "COST_CAP" ||
            adSetBidStrategy === "TARGET_COST";
          if (requiresBidAmount) {
            if (adSetBidAmount && adSetBidAmount > 0) {
              adSetPayload.bid_amount = Math.round(adSetBidAmount * 100);
              console.log(`💰 Bid amount set: ${adSetPayload.bid_amount} cents for strategy ${adSetBidStrategy}`);
            } else {
              // FALLBACK: If bid strategy requires amount but none provided, fall back to LOWEST_COST_WITHOUT_CAP
              console.warn(
                `⚠️ Bid strategy ${adSetBidStrategy} requires bid_amount but none provided. Falling back to LOWEST_COST_WITHOUT_CAP`,
              );
              adSetPayload.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
              // Ensure bid_amount is NOT in the payload for LOWEST_COST_WITHOUT_CAP
              delete adSetPayload.bid_amount;
            }
          } else {
            // For strategies that don't require bid_amount (like LOWEST_COST_WITHOUT_CAP),
            // ensure bid_amount is NOT included in the payload at all - Meta rejects it
            delete adSetPayload.bid_amount;
          }

          // Add conversion tracking
          const effectivePixel = phase.pixel || market.pixel;
          const effectiveConversionEvent = phase.conversionEvent || market.conversionEvent;

          if (
            effectivePixel &&
            effectiveConversionEvent &&
            (adSetPayload.optimization_goal === "OFFSITE_CONVERSIONS" || adSetPayload.optimization_goal === "VALUE")
          ) {
            const validEventTypes = [
              "AD_IMPRESSION",
              "RATE",
              "TUTORIAL_COMPLETION",
              "CONTACT",
              "CUSTOMIZE_PRODUCT",
              "DONATE",
              "FIND_LOCATION",
              "SCHEDULE",
              "START_TRIAL",
              "SUBMIT_APPLICATION",
              "SUBSCRIBE",
              "ADD_TO_CART",
              "ADD_TO_WISHLIST",
              "INITIATED_CHECKOUT",
              "ADD_PAYMENT_INFO",
              "PURCHASE",
              "LEAD",
              "COMPLETE_REGISTRATION",
              "CONTENT_VIEW",
              "SEARCH",
              "SERVICE_BOOKING_REQUEST",
              "MESSAGING_CONVERSATION_STARTED_7D",
              "LEVEL_ACHIEVED",
              "ACHIEVEMENT_UNLOCKED",
              "SPENT_CREDITS",
              "LISTING_INTERACTION",
              "D2_RETENTION",
              "D7_RETENTION",
              "OTHER",
            ];
            const normalizedEvent = effectiveConversionEvent.toUpperCase().trim();
            const eventType = validEventTypes.includes(normalizedEvent) ? normalizedEvent : "OTHER";
            adSetPayload.promoted_object = { pixel_id: effectivePixel, custom_event_type: eventType };
          }

          // ============= PROMOTED OBJECT: PAGE_ID FALLBACK =============
          // Meta requires promoted_object for most objectives. If not already set by conversion tracking
          // or Advantage+ Shopping, we must set it with the Facebook Page ID.
          // Objectives that require promoted_object with page_id:
          // LEAD_GENERATION, LINK_CLICKS, LANDING_PAGE_VIEWS, POST_ENGAGEMENT, PAGE_LIKES,
          // CONVERSATIONS, REACH, IMPRESSIONS, BRAND_AWARENESS, THRUPLAY, APP_INSTALLS, etc.
          if (!adSetPayload.promoted_object) {
            const adSetPageId = phase.metaPageId || (market as any).metaPageId || (market as any).pageId || (market as any).page || (market as any).defaultPageId;
            if (adSetPageId) {
              // For LEAD_GENERATION, just page_id is needed
              // For most other objectives, page_id in promoted_object tells Meta which page to use
              adSetPayload.promoted_object = { page_id: String(adSetPageId) };
              console.log(`📄 promoted_object.page_id set to ${adSetPageId} (from market config)`);
            } else {
              console.warn(`⚠️ No Facebook Page ID available for promoted_object - ad set may fail for objective ${adSetPayload.optimization_goal}`);
            }
          }

          // Set budget (only if not CBO - when CBO is on, budget is at campaign level)
          if (!useCBO) {
            // CRITICAL: Meta requires either daily_budget OR lifetime_budget for non-CBO ad sets
            // If budgetType is 'lifetime', set lifetime_budget; otherwise set daily_budget
            // Ensure minimum of 100 cents ($1) to avoid "Missing Daily Budget" errors
            if (budgetType === "lifetime") {
              const lifetimeBudgetCents = adSetConfig.adSetLifetimeBudget || Math.round(adSetConfig.adSetBudget * 100);
              adSetPayload.lifetime_budget = Math.max(lifetimeBudgetCents, 100); // Min $1
              console.log(
                `📊 Ad set lifetime budget: ${adSetPayload.lifetime_budget} cents (from ${adSetConfig.adSetLifetimeBudget || "calculated"})`,
              );
            } else {
              // Daily budget
              const dailyBudgetCents =
                adSetConfig.adSetDailyBudget || Math.round((adSetConfig.adSetBudget / durationDays) * 100);
              adSetPayload.daily_budget = Math.max(dailyBudgetCents, 100); // Min $1/day
              console.log(
                `📊 Ad set daily budget: ${adSetPayload.daily_budget} cents (from ${adSetConfig.adSetDailyBudget || "calculated"})`,
              );
            }
          } else {
            // With CBO, budget is set at campaign level - but Meta API may still require a budget field
            // Some Meta API versions require at least one budget field even with CBO
            // Add a minimal budget as fallback to prevent "Missing Daily Budget" errors
            console.log(`📊 CBO enabled - ad set budget controlled by campaign`);
          }

          console.log(`Creating Meta ad set [${adSetIdx + 1}/${adSetsToCreate.length}]:`, adSetPayload.name);
          console.log("📤 Meta ad set payload (bidding):", {
            bid_strategy: adSetPayload.bid_strategy,
            bid_amount: adSetPayload.bid_amount ?? "(not set)",
            optimization_goal: adSetPayload.optimization_goal,
            billing_event: adSetPayload.billing_event,
            has_bid_amount_field: "bid_amount" in adSetPayload,
          });

          const adSetResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/adsets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...adSetPayload, access_token: platform.access_token }),
          });

          let adSetData = await adSetResponse.json();

          // Handle VALUE optimization errors with fallback
          const valueOptErrorCodes = [2446368, 2446146, 1815117];
          const isValueOptError =
            adSetData.error &&
            valueOptErrorCodes.includes(adSetData.error.error_subcode) &&
            adSetPayload.optimization_goal === "VALUE";

          if (isValueOptError) {
            console.warn(`VALUE optimization error, retrying with OFFSITE_CONVERSIONS...`);
            adSetPayload.optimization_goal = "OFFSITE_CONVERSIONS";
            adSetPayload.billing_event = "IMPRESSIONS";

            const retryResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/adsets`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...adSetPayload, access_token: platform.access_token }),
            });
            adSetData = await retryResponse.json();
          }

          // Handle bid_amount required errors
          // error_subcode 1815857: Bid amount required for the bid strategy provided
          const isBidAmountRequiredError = adSetData.error?.error_subcode === 1815857;
          if (isBidAmountRequiredError) {
            const attempted = {
              bid_strategy: adSetPayload.bid_strategy,
              bid_amount: adSetPayload.bid_amount,
              has_bid_amount_field: "bid_amount" in adSetPayload,
              optimization_goal: adSetPayload.optimization_goal,
              billing_event: adSetPayload.billing_event,
            };

            const attemptedStrategy = String(adSetPayload.bid_strategy || "");
            const attemptedRequiresAmount = ["LOWEST_COST_WITH_BID_CAP", "COST_CAP", "TARGET_COST"].includes(
              attemptedStrategy,
            );
            const attemptedBidAmount = Number(adSetPayload.bid_amount);
            const hasPositiveBidAmount = Number.isFinite(attemptedBidAmount) && attemptedBidAmount > 0;

            console.warn(`Bid amount required error (subcode 1815857). Attempted bidding:`, attempted);

            // If Meta complains while we're *already* using a strategy that should not need bid_amount,
            // try omitting bid_strategy entirely and letting Meta default to lowest cost.
            if (!attemptedRequiresAmount) {
              console.warn(`Retrying 1815857 by omitting bid_strategy + bid_amount (Meta default bidding)...`);
              delete adSetPayload.bid_amount;
              delete adSetPayload.bid_strategy;

              const retryResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/adsets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...adSetPayload, access_token: platform.access_token }),
              });
              adSetData = await retryResponse.json();
            } else {
              // If the strategy really requires an amount, do NOT override the user's intent.
              // Let the error bubble so we can surface the true configuration issue.
              if (!hasPositiveBidAmount) {
                console.warn(
                  `Not retrying 1815857 because ${attemptedStrategy} requires a positive bid_amount, but none was provided.`,
                );
              } else {
                console.warn(
                  `Not retrying 1815857 because ${attemptedStrategy} already had bid_amount set; keeping original error for diagnosis.`,
                );
              }
            }
          }

          // Handle deprecated targeting interests error (subcode 1870247)
          const isDeprecatedTargetingError = adSetData.error?.error_subcode === 1870247;
          if (isDeprecatedTargetingError && adSetPayload.targeting?.flexible_spec) {
            console.warn(`⚠️ Deprecated targeting interests detected (subcode 1870247). Filtering and retrying...`);

            // Parse the error message to extract deprecated interest IDs
            const errorMsg = adSetData.error?.error_user_msg || "";
            const deprecatedIds = new Set<string>();

            // Extract deprecated_interest_id values from the error message
            const deprecatedMatches = errorMsg.matchAll(/"deprecated_interest_id":"(\d+)"/g);
            for (const match of deprecatedMatches) {
              deprecatedIds.add(match[1]);
              console.log(`  🚫 Marking deprecated: ${match[1]}`);
            }

            if (deprecatedIds.size > 0) {
              // Filter out deprecated interests from flexible_spec
              adSetPayload.targeting.flexible_spec = adSetPayload.targeting.flexible_spec
                .map((spec: any) => {
                  const cleaned: any = {};
                  for (const key of Object.keys(spec)) {
                    if (key === "interests" && Array.isArray(spec[key])) {
                      const filteredInterests = spec[key].filter((interest: any) => {
                        const interestId = String(interest.id);
                        if (deprecatedIds.has(interestId)) {
                          console.log(`  ⛔ Removing deprecated interest: ${interest.name} (${interestId})`);
                          return false;
                        }
                        return true;
                      });
                      if (filteredInterests.length > 0) {
                        cleaned[key] = filteredInterests;
                      }
                    } else {
                      cleaned[key] = spec[key];
                    }
                  }
                  return Object.keys(cleaned).length > 0 ? cleaned : null;
                })
                .filter(Boolean);

              // Remove flexible_spec entirely if empty after filtering
              if (adSetPayload.targeting.flexible_spec.length === 0) {
                delete adSetPayload.targeting.flexible_spec;
                console.log(`  ℹ️ All interests were deprecated - proceeding with broad targeting`);
              } else {
                console.log(
                  `  ✅ Retrying with ${adSetPayload.targeting.flexible_spec.reduce((acc: number, s: any) => acc + (s.interests?.length || 0), 0)} remaining interests`,
                );
              }

              // Retry the request
              const retryResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/adsets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...adSetPayload, access_token: platform.access_token }),
              });
              adSetData = await retryResponse.json();
            }
          }

          if (adSetData.error) {
            // Log the FULL payload (minus access_token) for debugging "invalid parameter" errors
            const debugPayload = { ...adSetPayload };
            delete debugPayload.access_token;
            console.error("❌ Meta Ad Set Creation Error:", JSON.stringify(adSetData.error, null, 2));
            console.error("📤 FULL Ad Set Payload that caused the error:", JSON.stringify(debugPayload, null, 2));
            console.error("📋 Ad Set Error Context:", {
              adAccountPath,
              market: market.name,
              phase: phase.name,
              objective,
              optimizationGoal,
              bid_strategy: adSetPayload.bid_strategy,
              bid_amount: adSetPayload.bid_amount,
              billing_event: adSetPayload.billing_event,
              has_targeting: !!adSetPayload.targeting,
              targeting_keys: Object.keys(adSetPayload.targeting || {}),
              has_flexible_spec: !!(adSetPayload.targeting?.flexible_spec),
              flexible_spec_count: adSetPayload.targeting?.flexible_spec?.length || 0,
              has_custom_audiences: !!(adSetPayload.targeting?.custom_audiences),
              has_promoted_object: !!adSetPayload.promoted_object,
              destination_type: adSetPayload.destination_type,
              dsa_beneficiary: adSetPayload.dsa_beneficiary,
              dsa_payor: adSetPayload.dsa_payor,
              start_time: adSetPayload.start_time,
              end_time: adSetPayload.end_time,
              lifetime_budget: adSetPayload.lifetime_budget,
              daily_budget: adSetPayload.daily_budget,
            });
            
            const errorMsg = adSetData.error.error_user_msg || adSetData.error.message || JSON.stringify(adSetData.error);
            errors.push({
              market: market.name,
              phase: phase.name,
              error: errorMsg,
              type: "adset_creation",
              campaignId: campaignData.id,
              apiResponse: adSetData.error,
              fieldPath: "step3",
            });
            continue; // Continue to next ad set
          }

          console.log(`✅ Meta ad set created: ${adSetData.id} (${adSetPayload.name})`);

          // ============= CREATE ADS FROM ASSIGNED CREATIVES =============
          // Query creative_assignments for this campaign/platform/market/phase
          console.log(`🎨 Checking for assigned creatives for ${market.name}/${phase.name}...`);

          const { data: assignments, error: assignmentError } = await supabase
            .from("creative_assignments")
            .select(
              `
              id,
              creative_id,
              position,
              status,
              creative:creatives(
                id, name, media_type, creative_type,
                platform_video_id, platform_image_hash, platform_thumbnail_id,
                primary_text, headline, description, call_to_action,
                destination_url, url_parameters,
                external_page_id, tiktok_identity_id,
                dsp_upload_status,
                media_urls,
                thumbnail_url
              )
            `,
            )
            .eq("campaign_id", campaign.id)
            .eq("platform", "meta")
            .eq("market", market.name)
            .eq("phase_name", phase.name)
            .order("position");

          if (assignmentError) {
            console.error(`Error fetching creative assignments:`, assignmentError);
          } else if (assignments && assignments.length > 0) {
            console.log(`📦 Found ${assignments.length} assigned creatives for this ad set`);

            // ============= BATCHED CREATIVE PROCESSING =============
            // Process creatives in small batches to avoid memory exhaustion
            const CREATIVE_BATCH_SIZE = 3;
            const CREATIVE_BATCH_DELAY_MS = 1000; // Allow GC between batches

            // Filter to only pending assignments to skip already-processed ones
            const pendingAssignments = assignments.filter((a: any) => a.status !== "pushed" && a.status !== "error");

            console.log(
              `📦 Processing ${pendingAssignments.length} pending assignments in batches of ${CREATIVE_BATCH_SIZE}`,
            );

            for (let batchStart = 0; batchStart < pendingAssignments.length; batchStart += CREATIVE_BATCH_SIZE) {
              const batchEnd = Math.min(batchStart + CREATIVE_BATCH_SIZE, pendingAssignments.length);
              const batch = pendingAssignments.slice(batchStart, batchEnd);

              console.log(
                `📦 Processing creative batch ${Math.floor(batchStart / CREATIVE_BATCH_SIZE) + 1}/${Math.ceil(pendingAssignments.length / CREATIVE_BATCH_SIZE)} (${batch.length} items)`,
              );

              // Process each creative in the batch sequentially to manage memory
              for (const assignment of batch) {
                let creative = assignment.creative as any;
                if (!creative) {
                  console.warn(`⚠️ Creative not found for assignment ${assignment.id}`);
                  continue;
                }

                // ============= CHECK CREATIVE UPLOAD STATUS =============
                // IMPORTANT: We no longer do inline uploads to avoid memory exhaustion.
                // Creatives must be pre-uploaded via the 'upload-creative-to-meta' edge function.
                // If creative is missing Meta asset, mark it for deferred upload and skip.
                let hasMetaAsset = creative.platform_image_hash || creative.platform_video_id;

                if (!hasMetaAsset) {
                  console.log(
                    `⏭️ Creative ${creative.name} missing Meta asset - requires pre-upload via upload-creative-to-meta function`,
                  );

                  // Mark assignment as pending upload - user needs to upload creatives first
                  await supabase
                    .from("creative_assignments")
                    .update({
                      status: "pending_upload",
                      error_message:
                        "Creative needs to be uploaded to Meta first. Please use the Upload to Meta feature in Creative Library.",
                    })
                    .eq("id", assignment.id);
                  continue;
                }
                // ============= END UPLOAD CHECK =============

                // Final check after upload attempt
                if (!hasMetaAsset) {
                  const missingFields = [
                    !creative.platform_image_hash ? "platform_image_hash" : null,
                    !creative.platform_video_id ? "platform_video_id" : null,
                  ].filter(Boolean);

                  console.warn(`⚠️ Meta creative still missing uploaded asset identifiers after upload attempt`, {
                    assignmentId: assignment.id,
                    creativeId: creative.id,
                    creativeName: creative.name,
                  });

                  await supabase
                    .from("creative_assignments")
                    .update({
                      status: "error",
                      error_message: `Creative not uploaded to Meta (missing ${missingFields.join(" & ")})`,
                    })
                    .eq("id", assignment.id);
                  continue;
                }

                // Build ad creative payload
                const adName = `${creative.name}_${generateTimestampSuffix()}`;
                const pageId = creative.external_page_id || phase.metaPageId || (market as any).metaPageId || (market as any).pageId || (market as any).page || (market as any).defaultPageId;

                if (!pageId) {
                  console.warn(`⚠️ No Facebook Page ID configured for creative ${creative.name}`);
                  await supabase
                    .from("creative_assignments")
                    .update({ status: "error", error_message: "No Facebook Page ID configured" })
                    .eq("id", assignment.id);
                  continue;
                }

                // First create the ad creative
                const creativePayload: any = {
                  name: `Creative_${adName}`,
                  object_story_spec: {
                    page_id: pageId,
                  },
                };

                // Determine creative type and build appropriate payload
                const isVideo = creative.media_type === "video" || creative.creative_type === "video";

                if (isVideo && creative.platform_video_id) {
                  // Video creative
                  creativePayload.object_story_spec.video_data = {
                    video_id: creative.platform_video_id,
                    title: creative.headline || creative.name,
                    message: creative.primary_text || "",
                    call_to_action: creative.call_to_action
                      ? {
                          type: creative.call_to_action,
                          value: {
                            link: creative.destination_url || metaLandingPageUrl || "https://example.com",
                          },
                        }
                      : undefined,
                  };
                  if (creative.platform_thumbnail_id) {
                    creativePayload.object_story_spec.video_data.image_hash = creative.platform_thumbnail_id;
                  }
                } else if (creative.platform_image_hash) {
                  // Image creative
                  creativePayload.object_story_spec.link_data = {
                    image_hash: creative.platform_image_hash,
                    link: creative.destination_url || metaLandingPageUrl || "https://example.com",
                    message: creative.primary_text || "",
                    name: creative.headline || "",
                    description: creative.description || "",
                    call_to_action: creative.call_to_action
                      ? {
                          type: creative.call_to_action,
                        }
                      : undefined,
                  };
                }

                // Add URL parameters if present
                if (creative.url_parameters) {
                  if (creativePayload.object_story_spec.video_data?.call_to_action?.value?.link) {
                    const url = new URL(creativePayload.object_story_spec.video_data.call_to_action.value.link);
                    url.search = url.search
                      ? `${url.search}&${creative.url_parameters}`
                      : `?${creative.url_parameters}`;
                    creativePayload.object_story_spec.video_data.call_to_action.value.link = url.toString();
                  } else if (creativePayload.object_story_spec.link_data?.link) {
                    const url = new URL(creativePayload.object_story_spec.link_data.link);
                    url.search = url.search
                      ? `${url.search}&${creative.url_parameters}`
                      : `?${creative.url_parameters}`;
                    creativePayload.object_story_spec.link_data.link = url.toString();
                  }
                }

                console.log(`📤 Creating Meta ad creative for ${creative.name}...`, {
                  assignmentId: assignment.id,
                  creativeId: creative.id,
                  isVideo,
                  hasVideoId: !!creative.platform_video_id,
                  hasImageHash: !!creative.platform_image_hash,
                  pageId,
                });

                const creativeResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/adcreatives`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...creativePayload, access_token: platform.access_token }),
                });

                const creativeData = await creativeResponse.json();

                if (creativeData.error) {
                  console.error(`❌ Failed to create Meta ad creative`, {
                    assignmentId: assignment.id,
                    creativeId: creative.id,
                    creativeName: creative.name,
                    isVideo,
                    error: creativeData.error,
                  });
                  await supabase
                    .from("creative_assignments")
                    .update({
                      status: "error",
                      error_message: creativeData.error.message || "Failed to create ad creative",
                    })
                    .eq("id", assignment.id);
                  continue;
                }
                const adPayload = {
                  name: adName,
                  adset_id: adSetData.id,
                  creative: { creative_id: creativeData.id },
                  status: "PAUSED",
                };

                console.log(`📤 Creating Meta ad...`, {
                  assignmentId: assignment.id,
                  creativeId: creative.id,
                  adsetId: adSetData.id,
                  adCreativeId: creativeData.id,
                });

                const adResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/ads`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...adPayload, access_token: platform.access_token }),
                });

                const adData = await adResponse.json();

                if (adData.error) {
                  console.error(`❌ Failed to create Meta ad`, {
                    assignmentId: assignment.id,
                    creativeId: creative.id,
                    creativeName: creative.name,
                    adsetId: adSetData.id,
                    adCreativeId: creativeData.id,
                    error: adData.error,
                  });
                  await supabase
                    .from("creative_assignments")
                    .update({
                      status: "error",
                      error_message: adData.error.message || "Failed to create ad",
                    })
                    .eq("id", assignment.id);
                  continue;
                }

                console.log(`✅ Meta ad created: ${adData.id} for creative ${creative.name}`);

                // Update assignment with success
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "pushed",
                    dsp_creative_id: adData.id,
                    error_message: null,
                  })
                  .eq("id", assignment.id);
              } // End of assignment loop within batch

              // Delay between batches to allow garbage collection
              if (batchEnd < pendingAssignments.length) {
                console.log(`⏳ Waiting ${CREATIVE_BATCH_DELAY_MS}ms before next batch...`);
                await new Promise((resolve) => setTimeout(resolve, CREATIVE_BATCH_DELAY_MS));
              }
            } // End of batch loop
          } else {
            console.log(`ℹ️ No creatives assigned for ${market.name}/${phase.name}`);
          }
          // ============= END AD CREATION =============

          results.push({
            platform: "Meta",
            market: market.name,
            phase: phase.name,
            campaignId: campaignData.id,
            campaignEntityName: `${campaign.name} - ${market.name} - ${phase.name}`,
            adSetId: adSetData.id,
            adSetEntityName: `${campaign.name} - ${market.name} - ${phase.name} - ${adSetConfig.name || `Ad Set ${adSetConfig.id?.substring(0, 6) || "Unknown"}`}`,
            adSetName: adSetPayload.name,
            budget: adSetConfig.adSetBudget,
            budgetType: budgetType,
            splitDimension: adSetSplitDimension !== "none" ? adSetSplitDimension : undefined,
            adsCreated:
              assignments?.filter((a: any) => a.creative?.platform_image_hash || a.creative?.platform_video_id)
                .length || 0,
          });
        }
        // ============= END AD SET SPLIT SUPPORT =============
      } catch (error: any) {
        console.error(`Error processing market ${market.name}, phase ${phase.name}:`, error);
        errors.push({
          market: market.name,
          phase: phase.name,
          error: error.message || "Unexpected error during Meta campaign creation",
          type: "processing_error",
          apiResponse: error.stack || error.toString(),
          fieldPath: "step3",
        });
      }
    }
  }

  return { platform: "Meta", results, errors: errors.length > 0 ? errors : undefined };
}

async function pushToGoogleAds(campaign: any, platformConfig: any, platform: any, supabase: any) {
  console.log("Pushing to Google Ads...");

  const results: any[] = [];
  const errors: any[] = [];

  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  const managerAccountId = Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID");

  if (!developerToken) {
    console.error("GOOGLE_ADS_DEVELOPER_TOKEN not configured");
    return { platform: "Google Ads", results: [], errors: [{ market: "all", phase: "all", error: "Google Ads developer token not configured", type: "config_error" }] };
  }

  const marketsObj = platformConfig.markets || {};
  console.log("📦 Google Ads marketsObj keys:", Object.keys(marketsObj));

  // Import the adapter
  const { getPlatformAdapter } = await import("../_shared/platform-adapter.ts");
  const googleAdapter = getPlatformAdapter("google") as any;

  for (const [marketCode, market] of Object.entries(marketsObj) as [string, any][]) {
    const phases = market.phases || [{
      id: "default-phase",
      name: market.name,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      budgetPercentage: 100,
    }];

    // Resolve Google Ads customer ID from market or platform
    const googleCustomerId = market.googleCustomerId || market.adAccountId || market.ad_account_id || platform.ad_account_id;
    if (!googleCustomerId) {
      console.error(`Missing Google Ads Customer ID for market: ${market.name}`);
      errors.push({ market: market.name, phase: "all", error: "Missing Google Ads Customer ID", type: "validation_error" });
      continue;
    }

    const cleanCustomerId = String(googleCustomerId).replace(/-/g, "");
    console.log(`📤 Processing Google Ads market ${market.name} with customer ID: ${cleanCustomerId}`);

    let effectivePlatform = platform;
    try {
      const platformCandidates = await getGooglePlatformCandidatesForCustomer(
        supabase,
        campaign.user_id,
        cleanCustomerId,
      );

      if (platformCandidates.length > 0) {
        const resolvedPlatform = platformCandidates[0];
        const resolvedAccessToken = await getAccessTokenWithRefresh(
          supabase,
          resolvedPlatform.id,
          resolvedPlatform.access_token,
          "google",
        );

        if (resolvedAccessToken) {
          effectivePlatform = { ...resolvedPlatform, access_token: resolvedAccessToken };
          console.log(`🔐 Using Google connection ${resolvedPlatform.id} for customer ${cleanCustomerId}`);
        } else {
          console.warn(`⚠️ Resolved Google connection ${resolvedPlatform.id} has no usable token, falling back to default platform ${platform.id}`);
        }
      } else {
        console.warn(`⚠️ No account-specific Google connection found for customer ${cleanCustomerId}, using default platform ${platform.id}`);
      }
    } catch (resolverError: any) {
      console.warn(`⚠️ Failed to resolve account-specific Google connection for ${cleanCustomerId}: ${resolverError.message}`);
    }

    // Resolve per-account manager_customer_id from google_ad_accounts table
    // This is critical for client accounts accessed via a Manager (MCC) account
    let effectiveManagerId = managerAccountId;
    try {
      const { data: googleAccount } = await supabase
        .from("google_ad_accounts")
        .select("manager_customer_id")
        .or(`customer_id.eq.${cleanCustomerId},customer_id.eq.${googleCustomerId}`)
        .maybeSingle();
      if (googleAccount?.manager_customer_id) {
        effectiveManagerId = googleAccount.manager_customer_id;
        console.log(`📋 Using per-account manager_customer_id: ${effectiveManagerId}`);
      } else if (managerAccountId) {
        console.log(`📋 Using global GOOGLE_ADS_MANAGER_ACCOUNT_ID: ${managerAccountId}`);
      } else {
        console.log(`📋 No manager account ID found - using customer's own ID`);
        effectiveManagerId = cleanCustomerId;
      }
    } catch (mgrErr: any) {
      console.warn(`⚠️ Failed to resolve manager_customer_id: ${mgrErr.message}, using global fallback`);
    }

    // Resolve market countries for geo targeting
    // Try market.countries first, then marketCode (the key in marketsObj which is typically the ISO code),
    // then market.name, and finally market.countryCode
    const rawMarketCountries: string[] = Array.isArray(market.countries) && market.countries.length > 0
      ? market.countries
      : [];
    
    let marketCountries: string[] = rawMarketCountries;
    if (marketCountries.length === 0) {
      // Try to derive from marketCode (the key in the markets object) — often the ISO code
      const candidateSources = [marketCode, market.name, market.countryCode, market.code, market.id].filter(Boolean);
      for (const candidate of candidateSources) {
        const upper = String(candidate).toUpperCase().trim();
        // Only accept 2-letter ISO codes
        if (/^[A-Z]{2}$/.test(upper)) {
          marketCountries = [upper];
          console.log(`🌍 Derived country code "${upper}" from candidate "${candidate}"`);
          break;
        }
      }
      // If still empty, try to map full country names to ISO codes
      if (marketCountries.length === 0) {
        const countryNameToCode: Record<string, string> = {
          "UNITED STATES": "US", "UNITED KINGDOM": "GB", "GERMANY": "DE", "FRANCE": "FR",
          "SPAIN": "ES", "ITALY": "IT", "UNITED ARAB EMIRATES": "AE", "SAUDI ARABIA": "SA",
          "EGYPT": "EG", "INDIA": "IN", "BRAZIL": "BR", "AUSTRALIA": "AU", "CANADA": "CA",
          "JAPAN": "JP", "SOUTH KOREA": "KR", "MEXICO": "MX", "NETHERLANDS": "NL",
          "SWEDEN": "SE", "NORWAY": "NO", "DENMARK": "DK", "TURKEY": "TR", "POLAND": "PL",
          "SOUTH AFRICA": "ZA", "NIGERIA": "NG", "KENYA": "KE", "BELGIUM": "BE",
          "SWITZERLAND": "CH", "AUSTRIA": "AT", "IRELAND": "IE", "PORTUGAL": "PT",
          "GREECE": "GR", "CZECH REPUBLIC": "CZ", "ROMANIA": "RO", "HUNGARY": "HU",
          "FINLAND": "FI", "RUSSIA": "RU", "UKRAINE": "UA", "PHILIPPINES": "PH",
          "MALAYSIA": "MY", "SINGAPORE": "SG", "THAILAND": "TH", "VIETNAM": "VN",
          "INDONESIA": "ID", "NEW ZEALAND": "NZ", "ARGENTINA": "AR", "CHILE": "CL",
          "COLOMBIA": "CO", "PERU": "PE", "BAHRAIN": "BH", "QATAR": "QA",
          "KUWAIT": "KW", "OMAN": "OM", "LEBANON": "LB",
        };
        for (const candidate of candidateSources) {
          const mapped = countryNameToCode[String(candidate).toUpperCase().trim()];
          if (mapped) {
            marketCountries = [mapped];
            console.log(`🌍 Mapped country name "${candidate}" → "${mapped}"`);
            break;
          }
        }
      }
    }
    
    if (marketCountries.length === 0) {
      console.warn(`⚠️ Could not resolve any country codes for market: ${JSON.stringify({ marketCode, name: market.name, countries: market.countries })}`);
    } else {
      console.log(`🌍 Google Ads geo targeting: ${marketCountries.join(", ")} (from market ${market.name})`);
    }

    // Resolve languages
    const basicTargeting = campaign.generic_config?.basicTargeting || {};
    const marketLanguages: string[] = [];
    const rawLangs = market.languages || basicTargeting.languages || [];
    if (Array.isArray(rawLangs) && rawLangs.length > 0) {
      // Map Meta numeric IDs to language codes
      const metaIdToLangCode: Record<string, string> = {
        '6': 'en', '24': 'es', '8': 'fr', '9': 'de', '11': 'it', '19': 'pt',
        '25': 'nl', '28': 'ru', '29': 'ja', '30': 'ko', '31': 'zh', '32': 'ar',
        '1001': 'de', '1002': 'fr', '1003': 'es', '1004': 'it', '1005': 'ja',
      };
      for (const l of rawLangs) {
        const ls = String(l).toLowerCase();
        if (ls === 'all') continue;
        const mapped = metaIdToLangCode[ls] || ls;
        if (mapped && !marketLanguages.includes(mapped)) marketLanguages.push(mapped);
      }
    }

    // Resolve unified targeting audiences/interests for Google Ads
    const effectiveTargeting = Object.keys(basicTargeting).length > 0 ? basicTargeting : {};
    const googleAudiences: Array<{ id: string; name: string; type: string; source?: string }> = [];
    if (effectiveTargeting.selectedItems && Array.isArray(effectiveTargeting.selectedItems)) {
      for (const item of effectiveTargeting.selectedItems) {
        if (item.platforms && item.platforms.includes("google")) {
          const googleId = item.googleId || item.platform_ids?.google || item.id;
          if (googleId) {
            googleAudiences.push({
              id: String(googleId).replace(/^google-/, ""),
              name: item.name,
              type: item.category || "interest",
              source: "google",
            });
          }
        }
      }
      console.log(`🎯 Found ${googleAudiences.length} Google Ads audience/interest items from unified targeting`);
    }

    for (const phase of phases) {
      try {
        // Calculate budget
        const totalCampaignBudget = campaign.total_budget || 0;
        const platformBudgetPct = platformConfig.budgetPercentage || 100;
        const marketBudgetPct = market.budgetPercentage || 100;
        const phaseBudgetPct = phase.budgetPercentage || 100;
        const phaseBudget = ((totalCampaignBudget * platformBudgetPct) / 100) * (marketBudgetPct / 100) * (phaseBudgetPct / 100);

        const startDate = new Date(phase.startDate || campaign.start_date);
        const endDate = new Date(phase.endDate || campaign.end_date);
        const durationDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

        // Determine budget type - Google Ads typically uses daily budgets
        const budgetType = phase.budgetType || "daily";
        const dailyBudget = phaseBudget / durationDays;

        // Get campaign type from phase config (Search, Display, Performance Max, Video, etc.)
        // If googleCampaignType is not explicitly set, derive it from the phase objective
        const objectiveToTypeMap: Record<string, string> = {
          "CONVERSION_SEARCH": "Search",
          "AWARENESS_DISPLAY": "Display",
          "CONSIDERATION_PMAX": "Performance Max",
          "AWARENESS_VIDEO_EFFICIENT_REACH": "Video",
          "CONSIDERATION_DEMAND_GEN": "Demand Gen",
          "CONVERSION_SHOPPING": "Shopping",
          "CONSIDERATION_APP_INSTALLS": "App Promotion",
          // Additional objective mappings
          "AWARENESS_VIDEO": "Video",
          "CONSIDERATION_VIDEO": "Video",
          "CONVERSIONS": "Search",
          "LEADS": "Search",
          "SALES": (phase.googleProductFeed || phase.googleMerchantCenterId || market.googleMerchantCenterId) ? "Shopping" : "Search",
          "WEBSITE_TRAFFIC": "Search",
          "APP_INSTALLS": "App Promotion",
        };
        const derivedFromObjective = phase.objective ? objectiveToTypeMap[phase.objective] : undefined;
        const requestedCampaignType = phase.googleCampaignType || derivedFromObjective || "Search";
        const hasMerchantCenter = Boolean(phase.googleMerchantCenterId || market.googleMerchantCenterId);
        const campaignType = requestedCampaignType === "Shopping" && !hasMerchantCenter
          ? "Search"
          : requestedCampaignType;
        if (!phase.googleCampaignType && derivedFromObjective) {
          console.log(`🔄 Derived googleCampaignType "${campaignType}" from objective "${phase.objective}" for phase "${phase.name}"`);
        } else if (!phase.googleCampaignType && !derivedFromObjective) {
          console.warn(`⚠️ No googleCampaignType set and could not derive from objective "${phase.objective}" — defaulting to Search`);
        }
        if (requestedCampaignType === "Shopping" && !hasMerchantCenter) {
          console.warn(`⚠️ Shopping campaign requested for phase "${phase.name}" without Merchant Center ID — falling back to Search`);
        }
        const channelTypeMap: Record<string, string> = {
          "Search": "SEARCH",
          "Display": "DISPLAY",
          "Video": "VIDEO",
          "Performance Max": "PERFORMANCE_MAX",
          "App Promotion": "MULTI_CHANNEL",
          "Demand Gen": "DEMAND_GEN",
          "Shopping": "SHOPPING",
        };
        const advertisingChannelType = channelTypeMap[campaignType] || "SEARCH";

        // Get bid strategy
        const bidStrategy = phase.googleBidStrategy || market.googleBidStrategy || "MAXIMIZE_CONVERSIONS";
        const bidStrategyMap: Record<string, string> = {
          "Maximize Conversions": "MAXIMIZE_CONVERSIONS",
          "Maximize Conversion Value": "MAXIMIZE_CONVERSION_VALUE",
          "Target CPA": "TARGET_CPA",
          "Target ROAS": "TARGET_ROAS",
          "Maximize Clicks": "MAXIMIZE_CLICKS",
          "Target CPM": "TARGET_CPM",
          "Manual CPC": "MANUAL_CPC",
        };
        const mappedBidStrategy = bidStrategyMap[bidStrategy] || bidStrategy;
        const bidAmount = phase.googleTargetCpa || phase.googleTargetRoas || phase.googleMaxCpcBid || undefined;

        // Get location targeting type (Presence or Interest vs Presence only)
        const locationTargetingType = phase.googleLocationTargeting || market.googleLocationTargeting || "PRESENCE_OR_INTEREST";
        // Get network settings
        const searchPartnerNetwork = phase.googleSearchPartner ?? market.googleSearchPartner ?? false;
        const displayNetworkEnabled = phase.googleDisplayNetwork ?? market.googleDisplayNetwork ?? false;

        // Determine if this is a Search campaign with keyword strategies that need splitting
        const isSearchCampaign = advertisingChannelType === "SEARCH";
        // Pull keywords from phase first, then fall back to global basicTargeting.selectedKeywords filtered for google AND market
        let phaseKeywords = phase.keywords || phase.searchKeywords || [];
        if ((!Array.isArray(phaseKeywords) || phaseKeywords.length === 0) && isSearchCampaign) {
          const marketCode = (market.name || "").substring(0, 2).toUpperCase();
          const globalKeywords = (campaign.generic_config?.basicTargeting?.selectedKeywords || [])
            .filter((k: any) => k.platform === 'google' && !k.isNegative && (!k.market || k.market === marketCode));
          if (globalKeywords.length > 0) {
            phaseKeywords = globalKeywords;
            console.log(`📝 Using ${globalKeywords.length} global Google keywords for market ${marketCode} from basicTargeting.selectedKeywords`);
          }
        }
        
        // Check if keywords have strategy groupings (Brand, Generic, Competition)
        let keywordStrategies: Record<string, Array<{ text: string; matchType?: string }>> = {};
        if (isSearchCampaign && Array.isArray(phaseKeywords) && phaseKeywords.length > 0) {
          for (const kw of phaseKeywords) {
            const strategy = (typeof kw === "string" ? "Generic" : (kw.strategy || kw.category || "Generic"));
            if (!keywordStrategies[strategy]) keywordStrategies[strategy] = [];
            keywordStrategies[strategy].push({
              text: typeof kw === "string" ? kw : (kw.text || kw.keyword || kw.name || String(kw)),
              matchType: (typeof kw === "string" ? "BROAD" : (kw.matchType || kw.match_type || "BROAD")).toUpperCase(),
            });
          }
          console.log(`🔍 Search keyword strategies found: ${Object.keys(keywordStrategies).join(", ")} (${phaseKeywords.length} total keywords)`);
        }

        // If no keyword strategies, treat as a single campaign
        const strategiesToProcess = Object.keys(keywordStrategies).length > 0
          ? Object.entries(keywordStrategies)
          : [["", []] as [string, Array<{ text: string; matchType?: string }>]];

        // Determine if we need ad-group-level targeting (Demand Gen, Display, Video)
        const needsAdGroupLevelTargeting = ["DEMAND_GEN", "DISPLAY", "VIDEO"].includes(advertisingChannelType);

        for (const [strategyName, strategyKeywords] of strategiesToProcess) {
          // Generate campaign name - include market>strategy for search campaigns
          const strategySuffix = strategyName ? ` - ${strategyName}` : "";
          const defaultCampaignName = isSearchCampaign && strategyName
            ? `${campaign.name} - ${market.name} > ${strategyName}_${generateTimestampSuffix()}`
            : `${campaign.name} - ${market.name}${phases.length > 1 ? ` - ${phase.name}` : ""}${strategySuffix}_${generateTimestampSuffix()}`;

          // Try to use client taxonomy template for campaign naming
          const googleCampaignTaxonomyContext: TaxonomyContext = {
            platform: "google",
            activationName: campaign.name,
            boNumber: campaign.bo_number || "",
            market: market.name,
            country: market.name,
            objective: phase.googleObjective || campaign.objective || "",
            funnelStage: phase.name || "",
            bidStrategy: mappedBidStrategy || "",
            budgetType: "daily",
            totalBudget: campaign.total_budget,
            platformBudget: phaseBudget,
            phaseBudget: phaseBudget,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            // Search campaign params
            keywordStrategy: strategyName || undefined,
            matchType: strategyKeywords.length > 0 ? (strategyKeywords[0].matchType || "BROAD") : undefined,
            campaignType: campaignType || advertisingChannelType,
          };

          const googleCampaignTaxonomyName = cleanCustomerId
            ? await generateTaxonomyName(
                supabase,
                campaign.user_id,
                cleanCustomerId,
                "google",
                "campaign",
                googleCampaignTaxonomyContext,
                { ...(phase.campaignTaxonomyValues || {}), ...(strategyName ? { strategy: strategyName } : {}) },
              )
            : null;

          const finalCampaignName = googleCampaignTaxonomyName || defaultCampaignName;

          // Adjust budget for strategy split using search-volume-weighted allocation
          const strategyCount = Math.max(1, Object.keys(keywordStrategies).length);
          let strategyDailyBudget = dailyBudget / strategyCount; // fallback: equal split

          if (strategyCount > 1 && strategyName) {
            // Calculate total search volume across all strategies (filtered by market)
            const marketCode = (market.name || "").substring(0, 2).toUpperCase();
            const allKeywords = (campaign.generic_config?.basicTargeting?.selectedKeywords || [])
              .filter((k: any) => k.platform === 'google' && !k.isNegative && (!k.market || k.market === marketCode));
            const strategyVolumes: Record<string, number> = {};
            let totalVolume = 0;
            for (const [sName] of Object.entries(keywordStrategies)) {
              const vol = allKeywords
                .filter((k: any) => (k.strategy || k.category || "Generic") === sName)
                .reduce((sum: number, k: any) => sum + (k.avgMonthlySearches || 0), 0);
              strategyVolumes[sName] = vol;
              totalVolume += vol;
            }
            // If we have volume data, use volume-weighted ratio; otherwise equal split
            if (totalVolume > 0) {
              const volumeRatio = (strategyVolumes[strategyName] || 0) / totalVolume;
              strategyDailyBudget = dailyBudget * volumeRatio;
              console.log(`📊 Volume-weighted budget for "${strategyName}" in ${marketCode}: ${(volumeRatio * 100).toFixed(1)}% (vol: ${strategyVolumes[strategyName]}/${totalVolume})`);
            }
          }

          console.log(`📊 Google Ads campaign config:`, {
            campaignType, advertisingChannelType, bidStrategy: mappedBidStrategy,
            dailyBudget: strategyDailyBudget, phaseBudget: phaseBudget / strategyCount, durationDays,
            strategy: strategyName || "none", keywordCount: strategyKeywords.length,
            locationTargeting: locationTargetingType,
            searchPartner: searchPartnerNetwork,
            displayNetwork: displayNetworkEnabled,
          });

          // Step 1: Create campaign
          const existingCampaignId = typeof phase._existingDspCampaignId === "string" ? phase._existingDspCampaignId : undefined;

          let campaignResult: any;
          if (existingCampaignId && !strategyName) {
            console.log(`♻️ Reusing existing Google Ads campaign for ${market.name}/${phase.name}: ${existingCampaignId}`);
            campaignResult = {
              success: true,
              campaignId: existingCampaignId,
              platform: "google",
              metadata: { reused: true },
            };
          } else {
            campaignResult = await googleAdapter.createCampaign({
              accountId: cleanCustomerId,
              accessToken: effectivePlatform.access_token,
              campaignName: finalCampaignName,
              objective: phase.googleObjective || campaign.objective || "CONVERSIONS",
              budget: strategyDailyBudget,
              budgetMode: "daily",
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              status: "PAUSED",
              metadata: {
                developerToken,
                loginCustomerId: effectiveManagerId?.replace(/-/g, ""),
                advertisingChannelType,
                biddingStrategy: mappedBidStrategy,
                bidAmount,
                campaignSubtype: phase.googleCampaignSubtype,
                merchantCenterId: phase.googleMerchantCenterId || market.googleMerchantCenterId,
                feedLabel: phase.googleFeedLabel || market.googleFeedLabel,
                brandGuidelines: phase.googleBrandGuidelines ?? market.googleBrandGuidelines ?? false,
                businessName: phase.googleBusinessName || market.googleBusinessName || "",
              },
            });

            if (!campaignResult.success) {
              console.error(`❌ Google Ads campaign creation failed:`, campaignResult.error);
              errors.push({
                market: market.name,
                phase: phase.name,
                error: campaignResult.error || "Campaign creation failed",
                type: "campaign_creation",
                fieldPath: "step3",
              });
              continue;
            }

            console.log(`✅ Google Ads campaign created: ${campaignResult.campaignId}`);
          }

          // ============= CAMPAIGN-LEVEL TARGETING =============
          const campaignHeaders = {
            Authorization: `Bearer ${effectivePlatform.access_token}`,
            "developer-token": developerToken,
            "Content-Type": "application/json",
            ...(effectiveManagerId ? { "login-customer-id": effectiveManagerId.replace(/-/g, "") } : {}),
          };

          // Apply geo targeting at campaign level
          if (marketCountries.length > 0) {
            console.log(`🌍 Applying geo targeting to campaign ${campaignResult.campaignId}: ${marketCountries.join(", ")}, mode: ${locationTargetingType}`);
            try {
              await googleAdapter.addCampaignGeoCriteria(
                cleanCustomerId,
                campaignResult.campaignId,
                marketCountries,
                locationTargetingType,
                campaignHeaders,
                advertisingChannelType,
              );
            } catch (geoErr: any) {
              console.error(`⚠️ Geo targeting error (non-fatal): ${geoErr.message}`);
            }
          }

          // Apply language targeting at campaign level
          if (marketLanguages.length > 0) {
            console.log(`🗣️ Applying language targeting to campaign ${campaignResult.campaignId}: ${marketLanguages.join(", ")}`);
            try {
              await googleAdapter.addCampaignLanguageCriteria(
                cleanCustomerId,
                campaignResult.campaignId,
                marketLanguages,
                campaignHeaders,
              );
            } catch (langErr: any) {
              console.error(`⚠️ Language targeting error (non-fatal): ${langErr.message}`);
            }
          }

          // Apply network settings (Search Partners, Display Network) — not supported for Performance Max
          if (advertisingChannelType !== "PERFORMANCE_MAX") {
            try {
              await googleAdapter.setCampaignNetworkSettings(
                cleanCustomerId,
                campaignResult.campaignId,
                searchPartnerNetwork,
                displayNetworkEnabled,
                campaignHeaders,
              );
            } catch (netErr: any) {
              console.error(`⚠️ Network settings error (non-fatal): ${netErr.message}`);
            }
          } else {
            console.log(`ℹ️ Skipping network settings for Performance Max campaign`);
          }
          // ============= END CAMPAIGN-LEVEL TARGETING =============

          // Step 2: Create Ad Group(s)
          // For Performance Max, ad groups are handled differently (asset groups) — skip ad group for now
          if (advertisingChannelType === "PERFORMANCE_MAX") {
            console.log(`ℹ️ Performance Max campaigns don't use traditional ad groups - skipping ad group creation`);
            results.push({
              platform: "Google Ads",
              market: market.name,
              phase: phase.name,
              campaignId: campaignResult.campaignId,
              adGroupId: null,
              budget: strategyDailyBudget,
              budgetType: "daily",
              campaignType,
              strategy: strategyName || undefined,
            });
            continue;
          }

          // Set explicit ad group type only for Search campaigns
          const adGroupType = advertisingChannelType === "SEARCH" ? "SEARCH_STANDARD" : undefined;

          // Build phase targeting
          const phaseTargeting = phase.targeting || {};
          const effectivePhaseTargeting = Object.keys(phaseTargeting).length > 0 ? phaseTargeting : basicTargeting;

          // Determine if we have ad set splits
          const adSetsToCreate = phase.adSets && Array.isArray(phase.adSets) && phase.adSets.length > 0
            ? phase.adSets
            : [{ id: "default", name: phase.name, budgetPercentage: 100 }];

          for (const adSetConfig of adSetsToCreate) {
            const adGroupSuffix = adSetConfig.id !== "default" ? ` - ${adSetConfig.name}` : "";
            const strategySuffix2 = strategyName ? ` [${strategyName}]` : "";
            const defaultAdGroupName = `${phase.name}${adGroupSuffix}${strategySuffix2} - Ad Group_${generateTimestampSuffix()}`;

            // Try to use client taxonomy template for ad group naming
            const googleAdGroupTaxonomyContext: TaxonomyContext = {
              platform: "google",
              activationName: campaign.name,
              boNumber: campaign.bo_number || "",
              market: market.name,
              country: market.name,
              objective: phase.googleObjective || campaign.objective || "",
              funnelStage: phase.name || "",
              bidStrategy: mappedBidStrategy || "",
              budgetType: "daily",
              totalBudget: campaign.total_budget,
              platformBudget: phaseBudget,
              phaseBudget: strategyDailyBudget,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              targetingType: adSetConfig.name || "",
            };

            const googleAdGroupTaxonomyName = cleanCustomerId
              ? await generateTaxonomyName(
                  supabase,
                  campaign.user_id,
                  cleanCustomerId,
                  "google",
                  "adset", // taxonomy uses "adset" entity type for ad groups too
                  googleAdGroupTaxonomyContext,
                  { ...(phase.adsetTaxonomyValues || {}), ...(strategyName ? { strategy: strategyName } : {}), ...(adSetConfig.id !== "default" ? { adSetName: adSetConfig.name } : {}) },
                )
              : null;

            const finalAdGroupName = googleAdGroupTaxonomyName || defaultAdGroupName;

            // Calculate CPC bid for ad group (if manual bidding)
            const adGroupBidAmount = mappedBidStrategy === "MANUAL_CPC" ? (bidAmount || 1.0) : undefined;

            // Build targeting object for ad group
            // Extract demographic targeting from basicTargeting for Google Ads
            const googleGenders = effectivePhaseTargeting.genders || effectivePhaseTargeting.gender || basicTargeting.genders || basicTargeting.gender || [];
            const googleAgeMin = effectivePhaseTargeting.ageMin || effectivePhaseTargeting.age_min || effectivePhaseTargeting.minAge || basicTargeting.ageMin || basicTargeting.age_min || basicTargeting.minAge || undefined;
            const googleAgeMax = effectivePhaseTargeting.ageMax || effectivePhaseTargeting.age_max || effectivePhaseTargeting.maxAge || basicTargeting.ageMax || basicTargeting.age_max || basicTargeting.maxAge || undefined;

            console.log(`🎯 Google Ads demographics: genders=${JSON.stringify(googleGenders)}, ageMin=${googleAgeMin}, ageMax=${googleAgeMax}`);

            const adGroupTargetingPayload: any = {
              developerToken,
              loginCustomerId: effectiveManagerId?.replace(/-/g, ""),
              ...(adGroupType ? { adGroupType } : {}),
              keywords: strategyKeywords.length > 0 ? strategyKeywords : undefined,
              // Pass demographics for ad group criteria
              genders: googleGenders,
              ageMin: googleAgeMin,
              ageMax: googleAgeMax,
              ...effectivePhaseTargeting,
            };

            // For Demand Gen, Display, Video: add ad-group-level geo and language targeting
            if (needsAdGroupLevelTargeting) {
              adGroupTargetingPayload.adGroupGeoTargets = marketCountries;
              adGroupTargetingPayload.adGroupLanguages = marketLanguages;
              console.log(`📍 Adding ad-group-level geo/language for ${campaignType}: countries=${marketCountries.join(",")}, languages=${marketLanguages.join(",")}`);
            }

            // Add audience targeting for all campaign types
            if (googleAudiences.length > 0) {
              adGroupTargetingPayload.audiences = googleAudiences;
              console.log(`🎯 Adding ${googleAudiences.length} audiences to ad group targeting`);
            }

            // Also add phase-level audiences if present
            if (phase.audiences && Array.isArray(phase.audiences) && phase.audiences.length > 0) {
              const phaseAudiences = phase.audiences
                .filter((a: any) => a.source === "google" || a.type === "user_list")
                .map((a: any) => ({
                  id: String(a.id),
                  name: a.name,
                  type: a.type || "audience",
                  source: "google",
                }));
              if (phaseAudiences.length > 0) {
                adGroupTargetingPayload.audiences = [
                  ...(adGroupTargetingPayload.audiences || []),
                  ...phaseAudiences,
                ];
                console.log(`🎯 Added ${phaseAudiences.length} phase-level audiences`);
              }
            }

            const adGroupResult = await googleAdapter.createAdGroup({
              accountId: cleanCustomerId,
              accessToken: effectivePlatform.access_token,
              campaignId: campaignResult.campaignId,
              adGroupName: finalAdGroupName,
              targeting: adGroupTargetingPayload,
              placements: [],
              optimizationGoal: mappedBidStrategy,
              status: "PAUSED",
              bidAmount: adGroupBidAmount,
            });

            if (!adGroupResult.success) {
              console.error(`❌ Google Ads ad group creation failed:`, adGroupResult.error);
              errors.push({
                market: market.name,
                phase: phase.name,
                adSet: adSetConfig.name,
                error: adGroupResult.error || "Ad group creation failed",
                type: "adgroup_creation",
                fieldPath: "step3",
              });
              continue;
            }

            console.log(`✅ Google Ads ad group created: ${adGroupResult.adGroupId}${strategyName ? ` [${strategyName}]` : ""}`);

            // Step 3: Create Ads from assigned creatives
            console.log(`🎨 Checking for assigned creatives for Google Ads ${market.name}/${phase.name}...`);

            const { data: googleAssignments, error: assignmentError } = await supabase
              .from("creative_assignments")
              .select(`
                id, creative_id, position, status,
                headline, headline_2, headline_3, headline_4, headline_5,
                description, description_2, description_3, description_4, description_5,
                primary_text, destination_url, url_parameters, call_to_action,
                creative:creatives(
                  id, name, media_type, creative_type,
                  platform_image_hash, platform_video_id,
                  primary_text, headline, description, call_to_action,
                  destination_url, url_parameters,
                  dsp_upload_status, media_urls, thumbnail_url
                )
              `)
              .eq("campaign_id", campaign.id)
              .eq("platform", "google")
              .eq("market", market.name)
              .eq("phase_name", phase.name)
              .order("position");

            let adsCreated = 0;

            if (assignmentError) {
              console.error(`Error fetching Google Ads creative assignments:`, assignmentError);
            } else if (googleAssignments && googleAssignments.length > 0) {
              console.log(`📦 Found ${googleAssignments.length} assigned creatives for this Google Ads ad group`);

              for (const assignment of googleAssignments) {
                const creative = assignment.creative as any;
                if (!creative) continue;

                // Build headlines from assignment or creative
                const headlines: string[] = [
                  assignment.headline || creative.headline || creative.name || "Learn More",
                  assignment.headline_2 || "Visit Today",
                  assignment.headline_3 || "Get Started",
                ].filter(Boolean).map((h: string) => h.substring(0, 30));
                if (assignment.headline_4) headlines.push(assignment.headline_4.substring(0, 30));
                if (assignment.headline_5) headlines.push(assignment.headline_5.substring(0, 30));

                // Build descriptions
                const descriptions: string[] = [
                  assignment.description || creative.description || creative.primary_text || "",
                  assignment.description_2 || "",
                ].filter(Boolean).map((d: string) => d.substring(0, 90));

                const landingPageUrl = assignment.destination_url || creative.destination_url
                  || phase.googleLandingPageUrl || market.googleLandingPageUrl || "https://example.com";

                try {
                  const adResult = await googleAdapter.createCreative({
                    accountId: cleanCustomerId,
                    accessToken: effectivePlatform.access_token,
                    adGroupId: adGroupResult.adGroupId,
                    creativeName: creative.name,
                    creativeType: "responsive_search_ad",
                    assets: {},
                    adText: descriptions[0] || creative.name,
                    callToAction: headlines[1] || "Learn More",
                    landingPageUrl,
                    ...(({
                      developerToken,
                      loginCustomerId: effectiveManagerId?.replace(/-/g, ""),
                    }) as any),
                  });

                  if (!adResult.success) {
                    console.error(`❌ Google Ads ad creation failed for ${creative.name}:`, adResult.error);
                    await supabase.from("creative_assignments").update({
                      status: "error",
                      error_message: adResult.error || "Failed to create ad",
                    }).eq("id", assignment.id);
                    continue;
                  }

                  console.log(`✅ Google Ads ad created: ${adResult.creativeId} for ${creative.name}`);
                  adsCreated++;

                  await supabase.from("creative_assignments").update({
                    status: "pushed",
                    dsp_creative_id: adResult.creativeId,
                    error_message: null,
                  }).eq("id", assignment.id);
                } catch (adError: any) {
                  console.error(`Error creating Google Ads ad:`, adError);
                  await supabase.from("creative_assignments").update({
                    status: "error",
                    error_message: adError.message || "Unexpected error",
                  }).eq("id", assignment.id);
                }
              }
            } else {
              console.log(`ℹ️ No creatives assigned for Google Ads ${market.name}/${phase.name}`);
            }

            results.push({
              platform: "Google Ads",
              market: market.name,
              phase: phase.name,
              adSet: adSetConfig.name,
              campaignId: campaignResult.campaignId,
              adGroupId: adGroupResult.adGroupId,
              budget: strategyDailyBudget,
              budgetType: "daily",
              campaignType,
              strategy: strategyName || undefined,
              adsCreated,
            });
          } // end adSets loop
        } // end keyword strategies loop
      } catch (error: any) {
        console.error(`Error processing Google Ads market ${market.name}, phase ${phase.name}:`, error);
        errors.push({
          market: market.name,
          phase: phase.name,
          error: error.message || "Unexpected error during Google Ads campaign creation",
          type: "unexpected_error",
          fieldPath: "step3",
        });
      }
    }
  }

  return {
    platform: "Google Ads",
    results,
    errors,
    success: errors.length === 0,
  };
}

// TikTok campaign publishing
async function pushToTikTok(campaign: any, platformConfig: any, platform: any) {
  console.log("Pushing to TikTok...");

  // Check for conversion campaigns and log automatic fallback warning
  const marketsObj = platformConfig.markets || {};
  const hasConversionCampaigns = Object.values(marketsObj).some((market: any) =>
    market.phases?.some((phase: any) => {
      const objective = (phase.objective || "").toLowerCase();
      const optimizationGoal = (phase.optimizationGoal || "").toLowerCase();
      return objective.includes("conversion") || optimizationGoal.includes("convert");
    }),
  );

  if (hasConversionCampaigns) {
    console.log("📋 TikTok conversion campaigns detected - will use WEB_CONVERSIONS objective (correct TikTok API enum)");
  }

  const results = [];
  const errors = [];

  // Import adapters
  const { ObjectiveMapper } = await import("../_shared/objective-mapper.ts");
  const { getPlatformAdapter } = await import("../_shared/platform-adapter.ts");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const mapper = new ObjectiveMapper(supabaseUrl, supabaseKey);
  const tiktokAdapter = getPlatformAdapter("tiktok");

  for (const [marketCode, market] of Object.entries(marketsObj) as [string, any][]) {
    // Get TikTok advertiser ID from market config
    const advertiserId = market.adAccountId || platform.metadata?.advertiser_ids?.[0];

    if (!advertiserId) {
      errors.push({
        market: market.name,
        error: "Missing TikTok advertiser ID",
        type: "validation_error",
      });
      continue;
    }

    const phases = market.phases || [
      {
        id: "default-phase",
        name: market.name,
        startDate: campaign.start_date,
        endDate: campaign.end_date,
        budgetPercentage: 100,
        objective: market.objective || campaign.objective || "TRAFFIC",
      },
    ];

    for (const phase of phases) {
      try {
        // Map Meta objective to TikTok objective
        const objectiveMapping = await mapper.mapObjective(
          phase.objective || market.objective || campaign.objective,
          "meta",
          "tiktok",
        );

        // Determine if Search is enabled for this phase
        const isSearchPhase = phase.tiktokSearchEnabled ?? market.tiktokSearchEnabled ?? 
          (phase.name || "").toLowerCase().includes("search");

        // SEARCH ADS CONSTRAINT: TikTok Search only supports TRAFFIC and WEB_CONVERSIONS
        let tiktokObjective = objectiveMapping.targetObjective;
        if (isSearchPhase) {
          const validSearchObjectives = ["TRAFFIC", "WEB_CONVERSIONS"];
          if (!validSearchObjectives.includes(tiktokObjective)) {
            console.warn(`⚠️ Search phase detected but objective is ${tiktokObjective} — forcing to TRAFFIC (Search only supports TRAFFIC/WEB_CONVERSIONS)`);
            tiktokObjective = "TRAFFIC";
          } else {
            console.log(`✅ Search phase with valid objective: ${tiktokObjective}`);
          }
        }

        console.log(`Mapped objective: ${objectiveMapping.sourceObjective} -> ${tiktokObjective} (mapper output: ${objectiveMapping.targetObjective}, isSearch: ${isSearchPhase})`);

        // Calculate budget
        const totalCampaignBudget = campaign.total_budget || 0;
        const platformBudgetPercentage = platformConfig.budgetPercentage || 100;
        const marketBudgetPercentage = market.budgetPercentage || 100;
        const phaseBudgetPercentage = phase.budgetPercentage || 100;

        const phaseBudget =
          ((totalCampaignBudget * platformBudgetPercentage) / 100) *
          (marketBudgetPercentage / 100) *
          (phaseBudgetPercentage / 100);

        // Calculate duration
        const startDate = new Date(phase.startDate || campaign.start_date);
        const endDate = new Date(phase.endDate || campaign.end_date);
        const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        const budgetType = phase.budgetType || "lifetime";
        const campaignBudget = budgetType === "daily" ? phaseBudget / durationDays : phaseBudget;

        // Build context for TikTok campaign taxonomy
        const genericConfig = campaign.generic_config || {};
        const tiktokCampaignTaxonomyContext: TaxonomyContext = {
          platform: "tiktok",
          activationName: campaign.name,
          boNumber: campaign.bo_number,
          teamName: genericConfig.teamName,
          totalBudget: campaign.total_budget,
          platformBudget: phaseBudget,
          market: market.name,
          country: market.name?.substring(0, 2)?.toUpperCase(),
          objective: tiktokObjective,
          funnelStage: phase.funnelStage,
          placementType: phase.tiktokPlacementType || "automatic",
          startDate: phase.startDate || campaign.start_date,
          endDate: phase.endDate || campaign.end_date,
        };

        // ============= TIKTOK SEARCH STRATEGY SPLITTING =============
        // For Search phases, split keywords by strategy (Brand, Generic, Competition) into separate campaigns
        // Similar to how Google Ads handles search keyword strategies
        let tiktokKeywordStrategies: Record<string, Array<{ text: string; matchType?: string; strategy?: string }>> = {};
        
        if (isSearchPhase) {
          const marketCode = (market.name || "").substring(0, 2).toUpperCase();
          const allSelectedKeywords = campaign.generic_config?.basicTargeting?.selectedKeywords || [];
          
          // Gather all TikTok keywords for this market
          let rawKeywords = phase.keywords;
          if (!rawKeywords || (Array.isArray(rawKeywords) && rawKeywords.length === 0)) {
            rawKeywords = allSelectedKeywords
              .filter((k: any) => k.platform === 'tiktok' && !k.isNegative && (!k.market || k.market === marketCode));
            if (rawKeywords.length === 0) {
              rawKeywords = allSelectedKeywords.filter((k: any) => k.platform === 'tiktok' && !k.isNegative);
            }
            if (rawKeywords.length === 0) {
              rawKeywords = allSelectedKeywords.filter((k: any) => !k.isNegative);
            }
          }
          
          if (Array.isArray(rawKeywords) && rawKeywords.length > 0) {
            for (const kw of rawKeywords) {
              const strategy = typeof kw === "string" ? "Generic" : (kw.strategy || kw.category || "Generic");
              if (!tiktokKeywordStrategies[strategy]) tiktokKeywordStrategies[strategy] = [];
              tiktokKeywordStrategies[strategy].push({
                text: typeof kw === "string" ? kw : (kw.text || kw.keyword || kw.name || String(kw)),
                matchType: (typeof kw === "string" ? "BROAD" : (kw.matchType || kw.match_type || "BROAD")).toUpperCase(),
                strategy,
              });
            }
            console.log(`🔍 TikTok search keyword strategies: ${Object.keys(tiktokKeywordStrategies).join(", ")} (${rawKeywords.length} total keywords)`);
          }
        }

        // Determine strategies to process
        const tiktokStrategiesToProcess = Object.keys(tiktokKeywordStrategies).length > 0
          ? Object.entries(tiktokKeywordStrategies)
          : [["", []] as [string, Array<{ text: string; matchType?: string }>]];

        // Calculate volume-weighted budget splits for search strategies
        const tiktokStrategyCount = Math.max(1, Object.keys(tiktokKeywordStrategies).length);

        for (const [strategyName, strategyKeywords] of tiktokStrategiesToProcess) {
          // Adjust budget for strategy split
          let strategyCampaignBudget = campaignBudget;
          if (tiktokStrategyCount > 1 && strategyName) {
            // Volume-weighted or equal split
            const allKws = Object.values(tiktokKeywordStrategies).flat();
            const totalVolume = allKws.reduce((s: number, k: any) => s + (k.avgMonthlySearches || 0), 0);
            if (totalVolume > 0) {
              const strategyVol = strategyKeywords.reduce((s: number, k: any) => s + (k.avgMonthlySearches || 0), 0);
              strategyCampaignBudget = campaignBudget * (strategyVol / totalVolume);
            } else {
              strategyCampaignBudget = campaignBudget / tiktokStrategyCount;
            }
          }

          const strategySuffix = strategyName ? ` - ${strategyName}` : "";
          const campaignTaxonomyCtx = {
            ...tiktokCampaignTaxonomyContext,
            phaseBudget: strategyCampaignBudget,
            keywordStrategy: strategyName || undefined,
            matchType: strategyKeywords.length > 0 ? (strategyKeywords[0].matchType || "BROAD") : undefined,
            campaignType: isSearchPhase ? "Search" : undefined,
          };

        const tiktokCampaignTaxonomyName = advertiserId
          ? await generateTaxonomyName(
              supabase,
              campaign.user_id,
              advertiserId,
              "tiktok",
              "campaign",
              campaignTaxonomyCtx,
              { ...(phase.campaignTaxonomyValues || {}), ...(strategyName ? { keywordStrategy: strategyName } : {}) },
            )
          : null;

        const defaultTiktokCampaignName = isSearchPhase && strategyName
          ? `${campaign.name} - ${market.name} > ${strategyName}_${generateTimestampSuffix()}`
          : `${campaign.name} - ${market.name}${phases.length > 1 ? ` - ${phase.name}` : ""}${strategySuffix}_${generateTimestampSuffix()}`;

        // Determine if Smart+ campaign
        const isSmartPlusCampaign = phase.tiktokSmartPlusEnabled ?? market.tiktokSmartPlusEnabled ?? false;

        // Create TikTok campaign
        const campaignResult = await tiktokAdapter.createCampaign({
          accountId: advertiserId,
          accessToken: platform.access_token,
          campaignName: tiktokCampaignTaxonomyName || defaultTiktokCampaignName,
          objective: tiktokObjective,
          budget: strategyCampaignBudget,
          budgetMode: budgetType,
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
          status: "PAUSED",
          metadata: {
            smartPlusEnabled: isSmartPlusCampaign,
            isSearchCampaign: isSearchPhase,
          },
        });

        if (!campaignResult.success) {
          const errData = (campaignResult as any).error;
          const errorMsg = typeof errData === "string" ? errData : errData?.message || JSON.stringify(errData);
          errors.push({
            market: market.name,
            phase: phase.name,
            error: errorMsg,
            type: "campaign_creation",
            apiResponse: errData,
            fieldPath: "step3",
          });
          continue;
        }

        console.log("TikTok campaign created:", campaignResult.campaignId, strategyName ? `(Strategy: ${strategyName})` : "");

        // Store campaign in database
        await supabase.from("tiktok_campaigns").insert({
          user_id: campaign.user_id,
          actiplan_campaign_id: campaign.id,
          tiktok_campaign_id: campaignResult.campaignId,
          advertiser_id: advertiserId,
          campaign_name: campaignResult.metadata?.campaign_name || "",
          objective_type: tiktokObjective,
          budget_mode: budgetType,
          budget: strategyCampaignBudget,
          status: "PAUSED",
        });

        // Get placement settings from phase, market, or use defaults
        const placementType = phase.tiktokPlacementType || market.tiktokPlacementType || "PLACEMENT_TYPE_AUTOMATIC";
        let tiktokPlacements: string[];

        if (placementType === "PLACEMENT_TYPE_NORMAL") {
          const configuredPlacements = phase.tiktokPlacements || market.tiktokPlacements;
          tiktokPlacements =
            Array.isArray(configuredPlacements) && configuredPlacements.length > 0
              ? configuredPlacements
              : ["PLACEMENT_TIKTOK"];
          console.log(`📍 Using MANUAL placements: ${tiktokPlacements.join(", ")}`);
        } else {
          tiktokPlacements = ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"];
          console.log(`📍 Using AUTOMATIC placements (all positions enabled)`);
        }

        console.log(`📍 Placement type: ${placementType}, Placements: ${JSON.stringify(tiktokPlacements)}`);

        // Build targeting
        const basicTargeting = campaign.generic_config?.basicTargeting || {};
        const phaseBasicTargeting = phase.targeting || {};
        const effectiveTargeting = Object.keys(phaseBasicTargeting).length > 0 ? phaseBasicTargeting : basicTargeting;

        console.log("📊 RAW Effective targeting for TikTok ad group:", JSON.stringify(effectiveTargeting, null, 2));

        // Transform unified targeting format into platform-specific arrays
        let tiktokInterests: any[] = [];
        let tiktokBehaviors: any[] = [];
        let tiktokDemographics: any[] = [];

        // If using unified targeting (selectedItems array from UnifiedTargeting component)
        if (effectiveTargeting.selectedItems && Array.isArray(effectiveTargeting.selectedItems)) {
          console.log(`🎯 Transforming ${effectiveTargeting.selectedItems.length} unified targeting items for TikTok`);
          console.log(`📝 All items:`, JSON.stringify(effectiveTargeting.selectedItems, null, 2));

          effectiveTargeting.selectedItems.forEach((item: any, index: number) => {
            console.log(
              `📝 Item ${index}: platforms=${JSON.stringify(item.platforms)}, category='${item.category}', name='${item.name}'`,
            );

            // Only process items available on TikTok
            if (item.platforms && item.platforms.includes("tiktok")) {
              // Extract the correct TikTok ID - handle different ID formats
              let tiktokIdValue = item.tiktokId || item.id;
              // Remove prefix if present (e.g., "tiktok-123" -> "123")
              if (typeof tiktokIdValue === "string" && tiktokIdValue.startsWith("tiktok-")) {
                tiktokIdValue = tiktokIdValue.substring(7);
              }
              if (typeof tiktokIdValue === "string" && tiktokIdValue.startsWith("unified-")) {
                tiktokIdValue = item.tiktokId; // For unified items, use tiktokId directly
              }

              const tiktokItem = {
                id: tiktokIdValue,
                name: item.name,
                category: item.category,
              };

              // Categorize by type (case-insensitive) - be more inclusive
              const categoryLower = (item.category || "").toLowerCase();
              if (categoryLower === "interest" || categoryLower === "interests") {
                tiktokInterests.push(tiktokItem);
                console.log(`  ✓ Interest: ${item.name} (${tiktokItem.id})`);
              } else if (
                categoryLower === "behavior" ||
                categoryLower === "behaviors" ||
                categoryLower === "action" ||
                categoryLower === "actions" ||
                categoryLower === "purchase_intention" ||
                categoryLower === "video_interaction" ||
                categoryLower === "creator_interaction" ||
                categoryLower === "hashtag_interaction"
              ) {
                // All action-based categories map to behaviors
                tiktokBehaviors.push(tiktokItem);
                console.log(`  ✓ Behavior/Action: ${item.name} (${tiktokItem.id}) [category: ${item.category}]`);
              } else if (categoryLower === "demographic" || categoryLower === "demographics") {
                tiktokDemographics.push(tiktokItem);
                console.log(`  ✓ Demographic: ${item.name} (${tiktokItem.id})`);
              } else {
                // Default unknown categories to behaviors for TikTok (safer than skipping)
                tiktokBehaviors.push(tiktokItem);
                console.warn(`  ⚠️ Unknown category '${item.category}' for item: ${item.name} - treating as behavior`);
              }
            } else {
              console.log(`  ⏭️ Skipping item (not TikTok): ${item.name}`);
            }
          });

          console.log(
            `📊 Transformed targeting - Interests: ${tiktokInterests.length}, Behaviors: ${tiktokBehaviors.length}, Demographics: ${tiktokDemographics.length}`,
          );
        } else {
          // Fallback to legacy format (direct arrays)
          tiktokInterests = effectiveTargeting.tiktokInterests || [];
          tiktokBehaviors = effectiveTargeting.tiktokBehaviors || [];
          tiktokDemographics = effectiveTargeting.tiktokDemographics || [];
          console.log("📊 Using legacy targeting format (direct arrays)");
        }

        // Map field names properly - handle both camelCase and snake_case from different sources
        // CRITICAL: Use market.countries if available, otherwise derive from market.name
        // market.name is an ISO 2-letter country code (e.g., "FR", "GB", "DE")
        const marketCountries =
          Array.isArray(market.countries) && market.countries.length > 0 ? market.countries : [market.name]; // market.name is already the ISO code

        // Log the countries resolution for debugging
        console.log(
          `🌍 Market ${market.name}: countries=${JSON.stringify(marketCountries)} (source: ${Array.isArray(market.countries) && market.countries.length > 0 ? "market.countries" : "market.name"})`,
        );

        const targeting: any = {
          geo_locations: {
            countries: marketCountries,
          },
          age_min: effectiveTargeting.ageMin || effectiveTargeting.age_min || effectiveTargeting.minAge || 18,
          age_max: effectiveTargeting.ageMax || effectiveTargeting.age_max || effectiveTargeting.maxAge || 65,
          genders: effectiveTargeting.genders || effectiveTargeting.gender || [],
          devices: effectiveTargeting.devices || effectiveTargeting.device || [],
          os: effectiveTargeting.os || effectiveTargeting.operatingSystem || [],
          languages: effectiveTargeting.languages || effectiveTargeting.language || [],
          // TikTok detailed targeting (transformed from unified format)
          tiktokInterests: tiktokInterests,
          tiktokBehaviors: tiktokBehaviors,
          tiktokDemographics: tiktokDemographics,
        };

        console.log("📊 RAW effectiveTargeting keys:", Object.keys(effectiveTargeting));
        console.log("📊 Constructed targeting with all fields:", JSON.stringify(targeting, null, 2));

        // Map optimization goal based on TikTok objective
        // TikTok has strict optimization goal requirements per objective
        // Use the ACTUAL objective from campaign creation result
        let tiktokOptGoal: string;
        const originalMappedObjective = tiktokObjective;

        // Check if campaign creation applied an objective fallback
        const actualObjective = campaignResult.metadata?.actual_objective || originalMappedObjective;
        const objectiveFallbackApplied = campaignResult.metadata?.objective_fallback_applied || false;

        if (objectiveFallbackApplied) {
          console.warn(`⚠️ Objective fallback was applied: ${originalMappedObjective} → ${actualObjective}`);
        }

        // SEARCH ADS OPTIMIZATION CONSTRAINT:
        // - TRAFFIC Search → only CLICK
        // - WEB_CONVERSIONS Search → only CONVERT or CLICK
        if (isSearchPhase) {
          if (actualObjective === "TRAFFIC") {
            tiktokOptGoal = "CLICK";
            console.log(`🔍 Search + TRAFFIC → forcing CLICK optimization`);
          } else if (actualObjective === "WEB_CONVERSIONS") {
            const phaseOptGoal = (phase.optimizationGoal || "").toUpperCase();
            if (phaseOptGoal === "CLICK" || phaseOptGoal === "CLICKS") {
              tiktokOptGoal = "CLICK";
            } else {
              tiktokOptGoal = "CONVERT";
            }
            console.log(`🔍 Search + WEB_CONVERSIONS → ${tiktokOptGoal} optimization`);
          } else {
            tiktokOptGoal = "CLICK";
            console.warn(`🔍 Search with unexpected objective ${actualObjective} → defaulting to CLICK`);
          }
        } else if (actualObjective === "WEB_CONVERSIONS" || actualObjective === "CONVERSIONS") {
          // WEB_CONVERSIONS objective uses CONVERT optimization goal
          tiktokOptGoal = "CONVERT";
        } else if (actualObjective === "TRAFFIC") {
          // TRAFFIC objective uses CLICK or TRAFFIC_LANDING_PAGE_VIEW
          const phaseOptGoal = (phase.optimizationGoal || "").toUpperCase();
          if (
            phaseOptGoal === "TRAFFIC_LANDING_PAGE_VIEW" ||
            phaseOptGoal === "LANDING_PAGE_VIEWS" ||
            phaseOptGoal === "LANDING_PAGE_VIEW" ||
            phaseOptGoal === "LANDING_PAGE"
          ) {
            tiktokOptGoal = "TRAFFIC_LANDING_PAGE_VIEW";
          } else {
            tiktokOptGoal = "CLICK";
          }
        } else if (actualObjective === "LEAD_GENERATION") {
          tiktokOptGoal = "FORM_SUBMIT";
        } else if (actualObjective === "REACH") {
          tiktokOptGoal = "REACH";
        } else if (actualObjective === "VIDEO_VIEWS" || actualObjective === "VIDEO_VIEW") {
          tiktokOptGoal = "VIDEO_VIEW";
        } else if (actualObjective === "APP_PROMOTION" || actualObjective === "APP_INSTALL") {
          tiktokOptGoal = "INSTALL";
        } else {
          tiktokOptGoal = "CLICK";
        }

        console.log(
          `Mapped optimization goal for objective ${actualObjective}: ${tiktokOptGoal} (original mapped: ${originalMappedObjective}, phase optimization goal: ${phase.optimizationGoal})`,
        );

        // Map billing event based on objective + optimization goal combination
        // TikTok has strict billing event requirements per objective
        // NOTE: TRAFFIC objective with CLICK optimization requires CPC (confirmed via API error "Only CPC is supported")
        const billingEventMap: Record<string, Record<string, string>> = {
          TRAFFIC: {
            CLICK: "CPC",
            TRAFFIC_LANDING_PAGE_VIEW: "OCPM",
            LANDING_PAGE: "OCPM",
          },
          WEB_CONVERSIONS: {
            CONVERT: "OCPM",
            CLICK: "CPC",
          },
          CONVERSIONS: {
            CONVERT: "OCPM",
          },
          REACH: {
            REACH: "CPM",
          },
          VIDEO_VIEWS: {
            VIDEO_VIEW: "OCPM",
            FOCUSED_VIEW: "OCPM",
          },
          VIDEO_VIEW: {
            VIDEO_VIEW: "OCPM",
            FOCUSED_VIEW: "OCPM",
          },
          APP_PROMOTION: {
            INSTALL: "OCPM",
          },
          APP_INSTALL: {
            INSTALL: "OCPM",
          },
          LEAD_GENERATION: {
            FORM_SUBMIT: "OCPM",
          },
        };

        // Determine billing event based on objective and optimization goal
        console.log(
          `DEBUG: Looking up billing event for objective: ${actualObjective}, optimization goal: ${tiktokOptGoal}`,
        );
        console.log(`DEBUG: Available objectives in billingEventMap:`, Object.keys(billingEventMap));

        let billingEvent = billingEventMap[actualObjective]?.[tiktokOptGoal];
        console.log(`DEBUG: Billing event from map: ${billingEvent}`);

        // If no specific mapping, fetch from account defaults
        if (!billingEvent) {
          console.log(`DEBUG: No billing event mapping found, fetching from account defaults`);
          const { data: tiktokAccount } = await supabase
            .from("tiktok_ad_accounts")
            .select("default_billing_event")
            .eq("advertiser_id", advertiserId)
            .eq("user_id", campaign.user_id)
            .single();

          billingEvent = tiktokAccount?.default_billing_event || "OCPM";
          console.log(`DEBUG: Billing event from account defaults: ${billingEvent}`);
        }

        console.log(
          `Using billing event: ${billingEvent} for objective ${actualObjective}, optimization goal ${tiktokOptGoal}`,
        );

        // Get pixel ID for conversion campaigns
        // Note: Check both actual and original objective - user may want conversion tracking even with fallback
        let pixelId: string | undefined;
        if (
          tiktokOptGoal === "CONVERT" ||
          actualObjective === "WEB_CONVERSIONS" ||
          actualObjective === "CONVERSIONS" ||
          originalMappedObjective === "WEB_CONVERSIONS"
        ) {
          pixelId = market.tiktokPixel || market.pixelId || market.tiktokPixelId;
          console.log(`Conversion campaign detected - using pixel_id: ${pixelId}`);
        }

        // Get landing page URL from market defaults or use placeholder
        const landingPageUrl =
          market.tiktokLandingPageUrl || market.websiteUrl || campaign.website_url || "https://example.com";
        console.log(`Using landing page URL: ${landingPageUrl}`);

        // Get bid amount from market defaults or phase overrides
        const bidAmount = phase.tiktokBidAmount || market.tiktokBidAmount || undefined;
        if (bidAmount) {
          console.log(`Using bid amount: €${bidAmount}`);
        } else {
          console.warn(`⚠️ No bid amount configured - TikTok may require bid amount for CPC/CPM billing events`);
        }

        // Get optimization location
        // Default to Website unless LEAD_GENERATION (defaults to Instant Form)
        // SEARCH ADS: only Website or TikTok Instant Page allowed
        let optimizationLocation = phase.tiktokOptimizationLocation || market.tiktokOptimizationLocation;
        if (!optimizationLocation) {
          optimizationLocation = actualObjective === "LEAD_GENERATION" ? "Instant Form" : "Website";
        }
        if (isSearchPhase && optimizationLocation !== "Website" && optimizationLocation !== "TikTok Instant Page") {
          console.warn(`🔍 Search phase: forcing optimization location to "Website" (was "${optimizationLocation}")`);
          optimizationLocation = "Website";
        }
        // Get app details for app campaigns
        const appName = phase.tiktokAppName || market.tiktokAppName;
        const appId = phase.tiktokAppId || market.tiktokAppId;

        // Get attribution windows
        const clickWindow = phase.tiktokClickWindow || market.tiktokClickWindow;
        const viewWindow = phase.tiktokViewWindow || market.tiktokViewWindow;

        // Get frequency settings (required for REACH campaigns)
        const frequencySchedule = phase.tiktokFrequencySchedule || market.tiktokFrequencySchedule;
        console.log(`📊 Frequency schedule for ${phase.name}: ${frequencySchedule}`);

        // Get feature toggles
        const eventCountEnabled =
          phase.tiktokEventCountEnabled !== undefined ? phase.tiktokEventCountEnabled : market.tiktokEventCountEnabled;
        const smartPlusEnabled =
          phase.tiktokSmartPlusEnabled !== undefined ? phase.tiktokSmartPlusEnabled : market.tiktokSmartPlusEnabled;
        const searchEnabled =
          phase.tiktokSearchEnabled !== undefined ? phase.tiktokSearchEnabled : (market.tiktokSearchEnabled || isSearchPhase);

        // Create ad group
        // Retrieve TikTok-specific parameters from phase or market defaults
        const tiktokOptimizationLocation = phase.tiktokOptimizationLocation || market.tiktokOptimizationLocation;
        const tiktokAppName = phase.tiktokAppName || market.tiktokAppName;
        const tiktokAppId = phase.tiktokAppId || market.tiktokAppId;
        const tiktokBidStrategy = phase.tiktokBidStrategy || market.tiktokBidStrategy;
        const tiktokBidAmount = phase.tiktokBidAmount || market.tiktokBidAmount;
        const tiktokClickWindow = phase.tiktokClickWindow || market.tiktokClickWindow;
        const tiktokViewWindow = phase.tiktokViewWindow || market.tiktokViewWindow;
        const tiktokFrequencySchedule = phase.tiktokFrequencySchedule || market.tiktokFrequencySchedule;
        const tiktokEventCount = phase.tiktokEventCount || market.tiktokEventCount;
        const tiktokSmartPlusEnabled = phase.tiktokSmartPlusEnabled ?? market.tiktokSmartPlusEnabled;

        console.log(`📋 TikTok phase config for ${phase.name}:`, {
          raw_phase_frequencySchedule: phase.tiktokFrequencySchedule,
          raw_market_frequencySchedule: market.tiktokFrequencySchedule,
          resolved_frequencySchedule: tiktokFrequencySchedule,
          optimizationLocation: tiktokOptimizationLocation,
          appName: tiktokAppName,
          appId: tiktokAppId,
          bidStrategy: tiktokBidStrategy,
          bidAmount: tiktokBidAmount,
          clickWindow: tiktokClickWindow,
          viewWindow: tiktokViewWindow,
          eventCount: tiktokEventCount,
          smartPlusEnabled: tiktokSmartPlusEnabled,
          smartCreativeEnabled: phase.tiktokSmartCreativeEnabled ?? market.tiktokSmartCreativeEnabled,
          autoTargetingEnabled: phase.tiktokAutoTargetingEnabled ?? market.tiktokAutoTargetingEnabled,
        });

        console.log(`🚀 CALLING tiktokAdapter.createAdGroup for ${phase.name}...`);
        console.log(`📍 campaignId: ${campaignResult.campaignId}, advertiserId: ${advertiserId}`);

        // ============= AD SET SPLITS FOR TIKTOK =============
        // Determine if we have ad set splits defined
        const tiktokAdSets: AdSetConfig[] =
          phase.adSets && Array.isArray(phase.adSets) && phase.adSets.length > 0
            ? phase.adSets
            : [{ id: "default", name: phase.name, dimensionValue: "", budgetPercentage: 100 }];

        const tiktokSplitDimension = phase.adSetSplitDimension || null;
        const isTiktokCBO = budgetType === "BUDGET_MODE_DAY" || budgetType === "BUDGET_MODE_TOTAL";

        console.log(
          `📊 TikTok Ad Group Splits: ${tiktokAdSets.length} ad groups, dimension: ${tiktokSplitDimension || "none"}, CBO: ${isTiktokCBO}`,
        );

        for (const tiktokAdSet of tiktokAdSets) {
          // Calculate budget for this ad group
          let adGroupBudget = campaignBudget;
          if (!isTiktokCBO && tiktokAdSet.budgetPercentage && tiktokAdSet.budgetPercentage < 100) {
            adGroupBudget = Math.round(campaignBudget * (tiktokAdSet.budgetPercentage / 100) * 100) / 100;
          }
          console.log(
            `📊 TikTok Ad Group "${tiktokAdSet.name}" budget: €${adGroupBudget} (${tiktokAdSet.budgetPercentage}% of phase budget, CBO: ${isTiktokCBO})`,
          );

          // Build targeting with split overrides
          let adGroupTargeting = { ...targeting };

          // Apply dimension-specific overrides for TikTok
          if (tiktokSplitDimension && tiktokAdSet.id !== "default") {
            adGroupTargeting = applyTikTokAdSetOverrides(adGroupTargeting, tiktokAdSet, tiktokSplitDimension);
          }

          // Get placement overrides for this ad set
          let adGroupPlacements = tiktokPlacements;
          let adGroupPlacementType = placementType;
          if (tiktokSplitDimension === "placement" || tiktokSplitDimension === "publisherPlatforms") {
            const placementOverrides = getTikTokPlacementOverrides(tiktokAdSet);
            if (placementOverrides.placements) {
              adGroupPlacements = placementOverrides.placements;
              adGroupPlacementType = placementOverrides.placementType || "PLACEMENT_TYPE_NORMAL";
              console.log(
                `📍 TikTok Ad Group "${tiktokAdSet.name}" using custom placements: ${adGroupPlacements.join(", ")}`,
              );
            }
          }

          // Build context for TikTok ad group taxonomy
          const tiktokAdgroupTaxonomyContext: TaxonomyContext = {
            platform: "tiktok",
            objective: tiktokObjective,
            optimizationGoal: tiktokOptGoal,
            phaseBudget: adGroupBudget,
            budgetType: budgetType,
            ageMin: adGroupTargeting.age_min || 18,
            ageMax: adGroupTargeting.age_max || 65,
            gender: adGroupTargeting.genders?.[0],
            location: market.name,
            devices: adGroupTargeting.devices,
            placementType: adGroupPlacementType,
            targetingType: effectiveTargeting.targetingExpansion ? "expand" : "native",
            startDate: phase.startDate || campaign.start_date,
            endDate: phase.endDate || campaign.end_date,
          };

          const tiktokAdgroupTaxonomyName = advertiserId
            ? await generateTaxonomyName(
                supabase,
                campaign.user_id,
                advertiserId,
                "tiktok",
                "adset",
                tiktokAdgroupTaxonomyContext,
                phase.adsetTaxonomyValues,
              )
            : null;

          const adGroupSuffix = tiktokAdSet.id !== "default" ? ` - ${tiktokAdSet.name}` : "";
          const defaultTiktokAdGroupName = `${phase.name}${adGroupSuffix} - Ad Group_${generateTimestampSuffix()}`;

          // Build search keywords for TikTok Search Ads
          // If we have strategy splitting, use the current strategy's keywords
          // Otherwise fall back to the old behavior of pulling all keywords
          const tiktokSearchKeywords: Array<{ text: string; matchType?: string }> = [];
          if (searchEnabled || isSearchPhase) {
            if (strategyName && strategyKeywords.length > 0) {
              // Use keywords from the current strategy split
              for (const kw of strategyKeywords) {
                tiktokSearchKeywords.push({
                  text: kw.text,
                  matchType: kw.matchType || "BROAD",
                });
              }
              console.log(`📝 ${tiktokSearchKeywords.length} search keywords for strategy "${strategyName}" in TikTok ad group`);
            } else if (!strategyName) {
              // No strategy splitting — use all keywords (legacy behavior)
              const marketCode = (market.name || "").substring(0, 2).toUpperCase();
              const allSelectedKeywords = campaign.generic_config?.basicTargeting?.selectedKeywords || [];
              
              let rawKeywords = phase.keywords;
              if (!rawKeywords || (Array.isArray(rawKeywords) && rawKeywords.length === 0)) {
                rawKeywords = allSelectedKeywords
                  .filter((k: any) => k.platform === 'tiktok' && !k.isNegative && (!k.market || k.market === marketCode));
                if (rawKeywords.length === 0) {
                  rawKeywords = allSelectedKeywords.filter((k: any) => k.platform === 'tiktok' && !k.isNegative);
                }
                if (rawKeywords.length === 0) {
                  rawKeywords = allSelectedKeywords.filter((k: any) => !k.isNegative);
                }
              }
              
              if (Array.isArray(rawKeywords) && rawKeywords.length > 0) {
                for (const kw of rawKeywords) {
                  tiktokSearchKeywords.push({
                    text: typeof kw === "string" ? kw : (kw.text || kw.keyword || kw.name || String(kw)),
                    matchType: (typeof kw === "string" ? "BROAD" : (kw.matchType || kw.match_type || "BROAD")).toUpperCase(),
                  });
                }
              }
              console.log(`📝 ${tiktokSearchKeywords.length} search keywords for TikTok ad group (no strategy split)`);
            }
            
            if (tiktokSearchKeywords.length === 0) {
              console.warn(`⚠️ Search enabled but NO keywords found — disabling search_result_enabled to prevent API rejection`);
            }
          }

          const resolvedTiktokConversionEvent =
            phase.tiktokOptimizationEvent ||
            market.tiktokOptimizationEvent ||
            phase.tiktokConversionEvent ||
            market.tiktokConversionEvent ||
            market.conversionEvent ||
            undefined;

          const adGroupResult = await tiktokAdapter.createAdGroup({
            accountId: advertiserId,
            accessToken: platform.access_token,
            campaignId: campaignResult.campaignId,
            adGroupName: tiktokAdgroupTaxonomyName || defaultTiktokAdGroupName,
            targeting: adGroupTargeting,
            placements: adGroupPlacements,
            placementType: adGroupPlacementType,
            optimizationGoal: tiktokOptGoal,
            billingEvent: billingEvent,
            bidStrategy: phase.tiktokBidStrategy || market.tiktokBidStrategy || "LOWEST_COST",
            bidAmount: bidAmount,
            budget: adGroupBudget,
            budgetMode: budgetType,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            status: "PAUSED",
            pixelId: pixelId,
            conversionEvent: resolvedTiktokConversionEvent,
            landingPageUrl: landingPageUrl,
            optimizationLocation: optimizationLocation,
            appName: appName,
            appId: appId,
            clickWindow: clickWindow,
            viewWindow: viewWindow,
            frequencySchedule: tiktokFrequencySchedule,
            eventCount: tiktokEventCount,
            smartPlusEnabled: smartPlusEnabled,
            // TikTok Search Ads
            searchEnabled: searchEnabled || false,
            searchKeywords: tiktokSearchKeywords,
          });

          if (!adGroupResult.success) {
            const errData = (adGroupResult as any).error;
            const errorMsg = typeof errData === "string" ? errData : errData?.message || JSON.stringify(errData);
            errors.push({
              market: market.name,
              phase: phase.name,
              adSet: tiktokAdSet.name,
              error: errorMsg,
              type: "adgroup_creation",
              apiResponse: errData,
              fieldPath: "step3",
            });
            continue;
          }

          console.log(`✅ TikTok ad group created: ${adGroupResult.adGroupId} (${tiktokAdSet.name})`);

          // Store ad group in database
          await supabase.from("tiktok_ad_groups").insert({
            user_id: campaign.user_id,
            tiktok_campaign_id: campaignResult.campaignId,
            tiktok_ad_group_id: adGroupResult.adGroupId,
            advertiser_id: advertiserId,
            ad_group_name: adGroupResult.metadata?.adgroup_name || tiktokAdSet.name,
            placement_type: adGroupPlacementType,
            placements: adGroupPlacements,
            targeting: adGroupTargeting,
            budget: adGroupBudget,
            budget_mode: budgetType,
            optimization_goal: tiktokOptGoal,
            status: "PAUSED",
          });

          // ============= CREATE ADS FROM ASSIGNED CREATIVES (TikTok) =============
          console.log(`🎨 Checking for assigned creatives for TikTok ${market.name}/${phase.name}...`);

          const { data: tiktokAssignments, error: tiktokAssignmentError } = await supabase
            .from("creative_assignments")
            .select(
              `
              id,
              creative_id,
              position,
              status,
              creative:creatives(
                id, name, media_type, creative_type,
                platform_video_id, platform_image_hash, platform_thumbnail_id,
                primary_text, headline, description, call_to_action,
                destination_url, url_parameters,
                tiktok_identity_id, tiktok_display_name, tiktok_ad_format,
                dsp_upload_status, brand_name, app_link
              )
            `,
            )
            .eq("campaign_id", campaign.id)
            .eq("platform", "tiktok")
            .eq("market", market.name)
            .eq("phase_name", phase.name)
            .order("position");

          let adsCreated = 0;

          if (tiktokAssignmentError) {
            console.error(`Error fetching TikTok creative assignments:`, tiktokAssignmentError);
          } else if (tiktokAssignments && tiktokAssignments.length > 0) {
            console.log(`📦 Found ${tiktokAssignments.length} assigned creatives for this TikTok ad group`);

            for (const assignment of tiktokAssignments) {
              const creative = assignment.creative as any;
              if (!creative) {
                console.warn(`⚠️ Creative not found for assignment ${assignment.id}`);
                continue;
              }

              // Check if creative has been uploaded to TikTok
              const hasTikTokAsset = creative.platform_video_id || creative.platform_image_hash;
              if (!hasTikTokAsset) {
                console.log(
                  `⏭️ TikTok creative ${creative.name} missing platform asset - requires upload before ad creation`,
                );

                // Mark assignment as pending upload - creatives need to be uploaded first via Push Creatives to DSP
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "pending_upload",
                    error_message:
                      'Creative needs to be uploaded to TikTok first. Please use "Push Creatives to DSP" from the Launch Status page.',
                  })
                  .eq("id", assignment.id);
                continue;
              }

              // Get identity ID for TikTok (required for ads)
              const identityId = creative.tiktok_identity_id || market.tiktokIdentityId || market.defaultIdentityId;
              if (!identityId) {
                console.warn(`⚠️ No TikTok Identity ID configured for creative ${creative.name}`);
                await supabase
                  .from("creative_assignments")
                  .update({ status: "error", error_message: "No TikTok Identity ID configured" })
                  .eq("id", assignment.id);
                continue;
              }

              // Build TikTok ad payload
              const adName = `${creative.name}_${generateTimestampSuffix()}`;
              const isVideo = creative.media_type === "video" || creative.creative_type === "video";

              const tiktokAdPayload: any = {
                advertiser_id: advertiserId,
                adgroup_id: adGroupResult.adGroupId,
                creatives: [
                  {
                    ad_name: adName,
                    ad_format: creative.tiktok_ad_format || (isVideo ? "SINGLE_VIDEO" : "SINGLE_IMAGE"),
                    identity_id: identityId,
                    identity_type: "CUSTOMIZED_USER",
                    ad_text: creative.primary_text || creative.headline || "",
                    call_to_action: creative.call_to_action || "LEARN_MORE",
                    landing_page_url: creative.destination_url || landingPageUrl,
                  },
                ],
              };

              // Add video or image - TikTok REQUIRES thumbnail (image_ids) for non-Spark video ads
              if (isVideo && creative.platform_video_id) {
                tiktokAdPayload.creatives[0].video_id = creative.platform_video_id;

                // Non-Spark video ads REQUIRE a thumbnail - check if one exists
                if (creative.platform_thumbnail_id) {
                  tiktokAdPayload.creatives[0].image_ids = [creative.platform_thumbnail_id];
                } else {
                  // No thumbnail - this will fail, mark as error
                  console.warn(`⚠️ TikTok video ad ${creative.name} missing required thumbnail`);
                  await supabase
                    .from("creative_assignments")
                    .update({
                      status: "error",
                      error_message:
                        "TikTok video ads require a thumbnail image. Please upload a thumbnail for this creative.",
                    })
                    .eq("id", assignment.id);
                  continue;
                }
              } else if (creative.platform_image_hash) {
                tiktokAdPayload.creatives[0].image_ids = [creative.platform_image_hash];
              }

              // Add display name if present
              if (creative.tiktok_display_name || creative.brand_name) {
                tiktokAdPayload.creatives[0].display_name = creative.tiktok_display_name || creative.brand_name;
              }

              // Add app link if present (for app campaigns)
              if (creative.app_link) {
                tiktokAdPayload.creatives[0].app_name = appName;
                tiktokAdPayload.creatives[0].download_url = creative.app_link;
              }

              console.log(`📤 Creating TikTok ad for ${creative.name}...`);

              const tiktokAdResponse = await fetch("https://business-api.tiktok.com/open_api/v1.3/ad/create/", {
                method: "POST",
                headers: {
                  "Access-Token": platform.access_token,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(tiktokAdPayload),
              });

              const tiktokAdData = await tiktokAdResponse.json();

              if (tiktokAdData.code !== 0 || !tiktokAdData.data?.ad_ids?.[0]) {
                console.error(`❌ Failed to create TikTok ad:`, tiktokAdData);
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: tiktokAdData.message || "Failed to create TikTok ad",
                  })
                  .eq("id", assignment.id);
                continue;
              }

              console.log(`✅ TikTok ad created: ${tiktokAdData.data.ad_ids[0]} for creative ${creative.name}`);
              adsCreated++;

              // Update assignment with success
              await supabase
                .from("creative_assignments")
                .update({
                  status: "pushed",
                  dsp_creative_id: tiktokAdData.data.ad_ids[0],
                  error_message: null,
                })
                .eq("id", assignment.id);
            }
          } else {
            console.log(`ℹ️ No creatives assigned for TikTok ${market.name}/${phase.name}`);
          }
          // ============= END TIKTOK AD CREATION =============

          results.push({
            market: market.name,
            phase: phase.name,
            adSet: tiktokAdSet.name,
            campaignId: campaignResult.campaignId,
            adGroupId: adGroupResult.adGroupId,
            success: true,
            adsCreated: adsCreated,
          });
        } // End of ad set splits loop
        } // End of TikTok keyword strategies loop
      } catch (error: any) {
        console.error("Error creating TikTok campaign/ad group:", error);
        errors.push({
          market: market.name,
          phase: phase.name,
          error: error.message || "Unexpected error during TikTok campaign creation",
          type: "unexpected_error",
          apiResponse: error.stack || error.toString(),
          fieldPath: "step3",
        });
      }
    }
  }

  return {
    platform: "TikTok",
    results,
    errors,
    success: errors.length === 0,
  };
}

serve(handler);
