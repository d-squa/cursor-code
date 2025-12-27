import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const campaignInputSchema = z.object({
  campaignId: z.string().uuid()
});

// ============= MINIMUM BUDGET REQUIREMENTS =============
// Platform minimum budget requirements (in account currency - e.g., EUR/USD)
// These are lifetime minimums - daily minimums are calculated based on duration
const PLATFORM_MINIMUM_BUDGETS = {
  meta: {
    // Meta requires minimum $1/day for daily budget, or $1 * days for lifetime
    dailyMinimum: 1,
    lifetimeMinimumPerDay: 1,
    currency: 'USD',
    name: 'Meta'
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
    currency: 'EUR',
    name: 'TikTok'
  }
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
  markets: Record<string, any>
): BudgetValidationError[] {
  const errors: BudgetValidationError[] = [];
  const platformKey = platformName.toLowerCase().includes('meta') ? 'meta' : 
                      platformName.toLowerCase().includes('tiktok') ? 'tiktok' : null;
  
  if (!platformKey || !PLATFORM_MINIMUM_BUDGETS[platformKey]) {
    return errors; // Skip validation for unsupported platforms
  }
  
  const platformMinimums = PLATFORM_MINIMUM_BUDGETS[platformKey];
  const totalCampaignBudget = campaign.total_budget || 0;
  const platformBudgetPercentage = platformConfig.budgetPercentage || 100;
  
  for (const [marketCode, market] of Object.entries(markets) as [string, any][]) {
    const marketBudgetPercentage = market.budgetPercentage || 100;
    const phases = market.phases || [{
      id: 'default-phase',
      name: market.name,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      budgetPercentage: 100,
    }];
    
    for (const phase of phases) {
      const phaseBudgetPercentage = phase.budgetPercentage || 100;
      const phaseBudget = (totalCampaignBudget * platformBudgetPercentage / 100) * 
                          (marketBudgetPercentage / 100) * (phaseBudgetPercentage / 100);
      
      const startDate = new Date(phase.startDate || campaign.start_date);
      const endDate = new Date(phase.endDate || campaign.end_date);
      const durationDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      
      const budgetType = phase.budgetType || 'lifetime';
      
      let minimumRequired: number;
      let calculatedBudgetValue: number;
      
      if (budgetType === 'daily') {
        // For daily budget, check daily minimum
        calculatedBudgetValue = phaseBudget / durationDays;
        minimumRequired = platformMinimums.dailyMinimum;
      } else {
        // For lifetime budget
        calculatedBudgetValue = phaseBudget;
        
        if (platformKey === 'tiktok') {
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
          phase: phase.name || 'Default',
          calculatedBudget: Math.round(calculatedBudgetValue * 100) / 100,
          minimumRequired: minimumRequired,
          budgetType: budgetType,
          durationDays: durationDays,
          message: `${platformMinimums.name} requires a minimum ${budgetType} budget of ${platformMinimums.currency}${minimumRequired.toFixed(2)} for ${durationDays} day(s). Current budget: ${platformMinimums.currency}${calculatedBudgetValue.toFixed(2)}`,
          fieldPath: 'step2' // Budget allocation step
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
  platform: { 'meta': 'META', 'tiktok': 'TT', 'google': 'GADS' },
  objective: {
    'OUTCOME_AWARENESS': 'AWR', 'OUTCOME_ENGAGEMENT': 'ENG', 'OUTCOME_TRAFFIC': 'TRF',
    'OUTCOME_LEADS': 'LED', 'OUTCOME_APP_PROMOTION': 'APP', 'OUTCOME_SALES': 'SAL',
    'REACH': 'RCH', 'VIDEO_VIEWS': 'VV', 'TRAFFIC': 'TRF', 'CONVERSIONS': 'CVN',
    'APP_INSTALLS': 'API', 'LEAD_GENERATION': 'LDG',
  },
  optimizationGoal: {
    'REACH': 'RCH', 'IMPRESSIONS': 'IMP', 'LINK_CLICKS': 'CLK', 'LANDING_PAGE_VIEWS': 'LPV',
    'CONVERSIONS': 'CVN', 'VALUE': 'VAL', 'OFFSITE_CONVERSIONS': 'OCV', 'CLICK': 'CLK',
    'CONVERT': 'CVT', 'VIDEO_VIEW': 'VV',
  },
  country: {
    'US': 'US', 'GB': 'UK', 'DE': 'DE', 'FR': 'FR', 'ES': 'ES', 'IT': 'IT',
    'NL': 'NL', 'BE': 'BE', 'MX': 'MX', 'BR': 'BR', 'JP': 'JP', 'AU': 'AU',
  },
  bidStrategy: {
    'LOWEST_COST_WITHOUT_CAP': 'LC', 'LOWEST_COST_WITH_BID_CAP': 'BC', 'COST_CAP': 'CC',
    'LOWEST_COST': 'LC', 'BID_TYPE_NO_BID': 'NB',
  },
  budgetType: { 'daily': 'DLY', 'lifetime': 'LTB' },
  placementType: { 'PLACEMENT_TYPE_AUTOMATIC': 'AUTO', 'PLACEMENT_TYPE_NORMAL': 'MAN', 'automatic': 'AUTO', 'manual': 'MAN' },
  gender: { 'all': 'ALL', 'male': 'M', 'female': 'F', '1': 'M', '2': 'F' },
  device: { 'mobile': 'MOB', 'desktop': 'DSK', 'all': 'ALL' },
  targetingType: { 'native': 'NTV', 'expand': 'EXP', 'retargeting': 'RTG', 'broad': 'BRD' },
};

function shortenValue(category: string, value: string): string {
  if (!value) return '';
  const mappings = VALUE_MAPPINGS[category];
  if (mappings && mappings[value]) return mappings[value];
  // Create short code from value
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '');
  if (cleaned.length <= 3) return cleaned.toUpperCase();
  return cleaned.substring(0, 3).toUpperCase();
}

function formatDateForTaxonomy(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}${month}`;
  } catch { return ''; }
}

function formatBudgetForTaxonomy(budget: number): string {
  if (!budget || budget === 0) return '';
  if (budget >= 1000000) return `${Math.round(budget / 1000000)}M`;
  if (budget >= 1000) return `${Math.round(budget / 1000)}K`;
  return Math.round(budget).toString();
}

function extractTaxonomyValues(template: TaxonomyParam[], context: TaxonomyContext): Record<string, string> {
  const values: Record<string, string> = {};
  
  for (const param of template) {
    let rawValue: string | undefined;
    
    switch (param.id) {
      case 'platform':
        values[param.id] = context.platform ? shortenValue('platform', context.platform) : '';
        break;
      case 'objective':
        values[param.id] = context.objective ? shortenValue('objective', context.objective) : '';
        break;
      case 'optimizationGoal':
        values[param.id] = context.optimizationGoal ? shortenValue('optimizationGoal', context.optimizationGoal) : '';
        break;
      case 'country':
      case 'market':
        rawValue = context.country || context.market;
        values[param.id] = rawValue ? shortenValue('country', rawValue.toUpperCase()) : '';
        break;
      case 'location':
        rawValue = context.location || context.country || context.market;
        values[param.id] = rawValue ? shortenValue('country', rawValue.toUpperCase()) : '';
        break;
      case 'bidStrategy':
        values[param.id] = context.bidStrategy ? shortenValue('bidStrategy', context.bidStrategy) : '';
        break;
      case 'budgetType':
        values[param.id] = context.budgetType ? shortenValue('budgetType', context.budgetType) : '';
        break;
      case 'placementType':
      case 'placement':
        if (context.advantagePlusPlacements === true) {
          values[param.id] = 'AUTO';
        } else if (context.placementType) {
          values[param.id] = shortenValue('placementType', context.placementType);
        } else {
          values[param.id] = 'AUTO';
        }
        break;
      case 'gender':
        values[param.id] = context.gender ? shortenValue('gender', context.gender) : 'ALL';
        break;
      case 'ageRange':
        const ageMin = context.ageMin || 18;
        const ageMax = context.ageMax || 65;
        values[param.id] = `${ageMin}${ageMax}`;
        break;
      case 'devices':
        if (context.devices && context.devices.length > 0 && context.devices.length < 3) {
          values[param.id] = shortenValue('device', context.devices[0]);
        } else {
          values[param.id] = 'ALL';
        }
        break;
      case 'targetingType':
        values[param.id] = context.targetingType ? shortenValue('targetingType', context.targetingType) : '';
        break;
      case 'activationName':
        // Don't shorten activation name - preserve as is with special chars removed
        values[param.id] = context.activationName?.replace(/[^a-zA-Z0-9]/g, '') || '';
        break;
      case 'boNumber':
        values[param.id] = context.boNumber?.replace(/[^a-zA-Z0-9]/g, '') || '';
        break;
      case 'teamName':
        values[param.id] = context.teamName?.replace(/[^a-zA-Z0-9]/g, '') || '';
        break;
      case 'platformBudget':
      case 'phaseBudget':
      case 'totalBudget':
        const budget = context.platformBudget || context.phaseBudget || context.totalBudget;
        values[param.id] = budget ? formatBudgetForTaxonomy(budget) : '';
        break;
      case 'startDate':
        values[param.id] = context.startDate ? formatDateForTaxonomy(context.startDate) : '';
        break;
      case 'endDate':
        values[param.id] = context.endDate ? formatDateForTaxonomy(context.endDate) : '';
        break;
      default:
        if (param.type === 'fixed' && param.value) {
          values[param.id] = param.value;
        }
        break;
    }
  }
  
  return values;
}

function generateTaxonomyString(template: TaxonomyParam[], values: Record<string, string>): string {
  const parts: string[] = [];
  
  for (const param of template) {
    if (param.required === false && !param.system) continue;
    const value = values[param.id] || param.value || '';
    if (value) {
      parts.push(value.toUpperCase());
    }
  }
  
  return parts.join('_');
}

// Helper to generate taxonomy name for campaign or adset
async function generateTaxonomyName(
  supabase: any,
  userId: string,
  platformAccountId: string, // This is the platform's native ID (e.g., TikTok advertiser_id or Meta account_id)
  platform: 'meta' | 'tiktok',
  entityType: 'campaign' | 'adset',
  context: TaxonomyContext,
  customValues?: Record<string, string>
): Promise<string | null> {
  try {
    // First, convert platform's native account ID to our internal UUID
    // taxonomy_templates.ad_account_id stores our internal UUIDs, not platform IDs
    let internalAdAccountId: string | null = null;
    
    if (platform === 'tiktok') {
      const { data: tiktokAccount } = await supabase
        .from('tiktok_ad_accounts')
        .select('id')
        .eq('advertiser_id', platformAccountId)
        .maybeSingle();
      internalAdAccountId = tiktokAccount?.id;
    } else if (platform === 'meta') {
      const { data: metaAccount } = await supabase
        .from('meta_ad_accounts')
        .select('id')
        .eq('account_id', platformAccountId)
        .maybeSingle();
      internalAdAccountId = metaAccount?.id;
    }
    
    if (!internalAdAccountId) {
      console.log(`No internal account found for ${platform} account ${platformAccountId}`);
      return null;
    }
    
    // Fetch taxonomy template from database using internal UUID
    const { data: templateData, error } = await supabase
      .from('taxonomy_templates')
      .select('template')
      .eq('user_id', userId)
      .eq('ad_account_id', internalAdAccountId)
      .eq('platform', platform)
      .eq('entity_type', entityType)
      .maybeSingle();
    
    if (error || !templateData?.template) {
      console.log(`No taxonomy template found for ${platform} ${entityType} on account ${internalAdAccountId} (platform ID: ${platformAccountId})`);
      return null;
    }
    
    const template = templateData.template as TaxonomyParam[];
    const extractedValues = extractTaxonomyValues(template, context);
    // Merge with custom values (custom values override extracted)
    const mergedValues = { ...extractedValues, ...customValues };
    const taxonomyString = generateTaxonomyString(template, mergedValues);
    
    // Append unique timestamp suffix (YYMMDDHHMMSS) to ensure uniqueness
    const now = new Date();
    const uniqueSuffix = now.getFullYear().toString().slice(-2) +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
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
  return now.getFullYear().toString().slice(-2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
}

// ============= END TAXONOMY HELPERS =============

// ============= UPDATE LAUNCH STATUS HELPER =============
async function updateLaunchStatuses(
  supabase: any,
  campaignId: string,
  platformInput: string,
  result: any,
  markets: any[]
): Promise<void> {
  // Normalize platform name - try both TikTok and Tiktok casing for compatibility
  const platformVariants = platformInput.toLowerCase() === 'tiktok' 
    ? ['TikTok', 'Tiktok', 'tiktok'] 
    : platformInput.toLowerCase() === 'meta' 
      ? ['Meta', 'meta'] 
      : [platformInput];
  
  try {
    const successResults = result.results || [];
    const errorResults = result.errors || [];
    
    console.log(`📝 updateLaunchStatuses called for ${platformInput}: ${successResults.length} successes, ${errorResults.length} errors`);
    
    // Update successful entities
    for (const successItem of successResults) {
      const { market, phase, campaignId: dspCampaignId, adSetId, adGroupId } = successItem;
      
      console.log(`📝 Processing success: market=${market}, phase=${phase}, dspCampaignId=${dspCampaignId}, adGroupId=${adGroupId}`);
      
      // Update campaign entry - try each platform variant until one works
      if (dspCampaignId) {
        for (const platformName of platformVariants) {
          const { data: campaignUpdateResult, error: campaignUpdateError } = await supabase
            .from('campaign_launch_status')
            .update({
              status: 'pushed_to_dsp',
              dsp_entity_id: dspCampaignId,
              dsp_status: 'PAUSED',
              error_message: null,
              error_details: null,
              updated_at: new Date().toISOString()
            })
            .eq('campaign_id', campaignId)
            .eq('platform', platformName)
            .eq('market', market)
            .eq('entity_type', 'campaign')
            .select();
          
          if (campaignUpdateResult && campaignUpdateResult.length > 0) {
            console.log(`✅ Updated campaign status for ${market}/${phase} with platform=${platformName}: ${campaignUpdateResult.length} rows`);
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
          const { data: adsetUpdateResult, error: adsetUpdateError } = await supabase
            .from('campaign_launch_status')
            .update({
              status: 'pushed_to_dsp',
              dsp_entity_id: adEntityId,
              dsp_status: 'PAUSED',
              error_message: null,
              error_details: null,
              updated_at: new Date().toISOString()
            })
            .eq('campaign_id', campaignId)
            .eq('platform', platformName)
            .eq('market', market)
            .eq('entity_type', 'adset')
            .select();
          
          if (adsetUpdateResult && adsetUpdateResult.length > 0) {
            console.log(`✅ Updated adset status for ${market}/${phase} with platform=${platformName}: ${adsetUpdateResult.length} rows`);
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
      const errorMessage = typeof error === 'string' ? error : (error?.message || 'Push failed');
      const errorDetails = [
        { 
          message: errorMessage, 
          type: type || 'api_error',
          apiResponse: apiResponse || error,
          field: errorItem.field,
          fieldPath: errorItem.fieldPath || 'step1'
        }
      ];
      
      // Determine entity type from error type
      const typeStr = (type || '').toLowerCase();
      let entityType = 'adset'; // Default to adset for ad group/adset errors
      if (typeStr.includes('campaign') && !typeStr.includes('adgroup') && !typeStr.includes('adset')) {
        entityType = 'campaign';
      }
      
      // Use the first platform variant as the canonical name
      const platformName = platformVariants[0];
      
      // First try to update existing row
      let updated = false;
      for (const pVariant of platformVariants) {
        let q = supabase
          .from('campaign_launch_status')
          .update({
            status: 'push_failed',
            error_message: errorMessage,
            error_details: errorDetails,
            updated_at: new Date().toISOString()
          })
          .eq('campaign_id', campaignId)
          .eq('platform', pVariant)
          .eq('market', market);

        if (phase) q = q.eq('phase_name', phase);
        q = q.eq('entity_type', entityType);

        const { data: failUpdateResult } = await q.select();

        if (failUpdateResult && failUpdateResult.length > 0) {
          console.log(`⚠️ Marked as failed for ${market}/${phase}: ${failUpdateResult.length} rows`);
          updated = true;
          break;
        }
      }
      
      // If no row was updated, INSERT a new failure row
      if (!updated) {
        console.log(`📝 No existing ${entityType} row found for ${platformName}/${market}/${phase}, inserting new failure row`);
        const { error: insertError } = await supabase
          .from('campaign_launch_status')
          .insert({
            campaign_id: campaignId,
            platform: platformName,
            market: market,
            phase_name: phase || null,
            entity_type: entityType,
            entity_name: `${phase || 'Default'} - ${entityType === 'adset' ? 'Ad Set' : 'Campaign'}`,
            status: 'push_failed',
            error_message: errorMessage,
            error_details: errorDetails,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        if (insertError) {
          console.error(`❌ Failed to insert failure row: ${insertError.message}`);
        } else {
          console.log(`✅ Inserted new failure row for ${platformName}/${market}/${phase}`);
        }
      }
    }
    
    console.log(`Updated launch statuses for ${platformInput}: ${successResults.length} success, ${errorResults.length} errors`);
  } catch (err) {
    console.error('Error updating launch statuses:', err);
  }
}
// ============= END UPDATE LAUNCH STATUS HELPER =============

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Service configuration error");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const parseResult = campaignInputSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
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

    // Verify user owns the campaign
    if (campaign.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized: You do not own this campaign' }), { 
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log("Pushing campaign to DSP:", campaign.name, "for user:", user.id);

    // ============= SERVER-SIDE DAILY LIMIT CHECK =============
    // Check subscription tier and enforce daily DSP push limits
    const PRICE_IDS = {
      basic: {
        monthly: "price_1ScnObKrTGU4P754AAJ9Q5NU",
        yearly: "price_1ScnL9KrTGU4P754QirsF0Sd",
      },
      freelancer: {
        monthly: "price_1ScnOcKrTGU4P754y5pmh5jf",
        yearly: "price_1ScnNYKrTGU4P754hbyoSjdc",
      },
      enterprise: {
        monthly: "price_1ScnOdKrTGU4P7542mtt9uyC",
        yearly: "price_1ScnOOKrTGU4P754r7bdJ94j",
      },
      agency: {
        monthly: "price_1ScnOeKrTGU4P75446dvndr3",
        yearly: "price_1ScnOPKrTGU4P754sNgouHiL",
      }
    };

    const DAILY_LIMITS: Record<string, number> = {
      trial: 1,
      basic: 1,
      freelancer: 2,
      enterprise: 5,
      agency: Infinity
    };

    const getTierFromPriceId = (priceId: string | null): string => {
      if (!priceId) return 'trial';
      for (const [tier, config] of Object.entries(PRICE_IDS)) {
        if (config.monthly === priceId || config.yearly === priceId) {
          return tier;
        }
      }
      return 'trial';
    };

    // Get subscription tier - if campaign belongs to a team, use team owner's subscription
    // This matches the frontend useFeatureAccess logic
    let userTier = 'trial';
    const teamId = campaign.team_id;
    
    try {
      let billingUserId = user.id; // Default to current user
      
      // If campaign has a team_id, get the team owner's subscription instead
      if (teamId) {
        const { data: team } = await supabase
          .from('teams')
          .select('owner_id')
          .eq('id', teamId)
          .single();
        
        if (team?.owner_id) {
          billingUserId = team.owner_id;
          console.log(`📊 Using team owner's subscription: ${billingUserId} (team: ${teamId})`);
        }
      }
      
      const { data: billingCustomer } = await supabase
        .from('billing_customers')
        .select('stripe_customer_id')
        .eq('user_id', billingUserId)
        .single();

      if (billingCustomer?.stripe_customer_id) {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey) {
          const { default: Stripe } = await import("https://esm.sh/stripe@18.5.0");
          const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
          
          const subscriptions = await stripe.subscriptions.list({
            customer: billingCustomer.stripe_customer_id,
            status: "all",
            limit: 10,
          });

          const activeSub = subscriptions.data.find(
            (s: { status: string }) => s.status === "active" || s.status === "trialing"
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

    // Count campaigns pushed to DSP today by team_id (workspace) - same logic as frontend useActiplanLimits
    // This ensures the limit is shared across all team members
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();

    const pushCountStatuses = ['pushed_to_dsp', 'live'];

    // teamId already declared above when checking subscription

    let countQuery = supabase
      .from('campaigns')
      .select('id')
      .in('status', pushCountStatuses)
      .gte('published_at', todayStart)
      .lte('published_at', todayEnd);

    // If campaign has a team_id, count by team (shared limit pool)
    // Otherwise fall back to user_id (personal workspace)
    if (teamId) {
      countQuery = countQuery.eq('team_id', teamId);
      console.log(`📊 Counting by team_id: ${teamId}`);
    } else {
      countQuery = countQuery.eq('user_id', user.id);
      console.log(`📊 Counting by user_id: ${user.id} (no team context)`);
    }

    const { data: pushedWithPublishedAt, error: publishedCountError } = await countQuery;

    if (publishedCountError) {
      console.error('Error counting pushed campaigns (published_at):', publishedCountError);
    }

    // Also check for legacy campaigns without published_at
    let legacyQuery = supabase
      .from('campaigns')
      .select('id')
      .in('status', pushCountStatuses)
      .is('published_at', null);

    if (teamId) {
      legacyQuery = legacyQuery.eq('team_id', teamId);
    } else {
      legacyQuery = legacyQuery.eq('user_id', user.id);
    }

    const { data: pushedWithNullPublishedAt, error: nullPublishedError } = await legacyQuery;

    if (nullPublishedError) {
      console.error('Error fetching pushed campaigns with null published_at:', nullPublishedError);
    }

    const allPushedToday = new Set<string>((pushedWithPublishedAt || []).map((r: { id: string }) => r.id));

    const legacyNullIds = (pushedWithNullPublishedAt || []).map((r: { id: string }) => r.id);
    if (legacyNullIds.length > 0) {
      const { data: launchRows, error: launchError } = await supabase
        .from('campaign_launch_status')
        .select('campaign_id')
        .in('campaign_id', legacyNullIds)
        .eq('entity_type', 'campaign')
        .in('status', ['pushed_to_dsp', 'live'])
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd);

      if (launchError) {
        console.error('Error counting pushed campaigns (launch_status fallback):', launchError);
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
    const isRetry = campaign.status === 'partially_pushed' || campaign.status === 'pushed_to_dsp';
    
    if (!isRetry && dailyLimit !== Infinity && usedToday >= dailyLimit) {
      console.log(`🚫 Daily DSP push limit reached for tier ${userTier}`);
      return new Response(JSON.stringify({ 
        error: `Daily DSP push limit reached (${dailyLimit} per day for ${userTier} plan). Please upgrade your subscription for more pushes.`,
        limitReached: true,
        tier: userTier,
        limit: dailyLimit,
        used: usedToday
      }), { 
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // ============= END DAILY LIMIT CHECK =============

    // Get user's connected platforms
    const { data: platforms, error: platformsError } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", campaign.user_id)
      .eq("is_active", true);

    if (platformsError) throw platformsError;

    // Fetch existing launch statuses to skip already-pushed entities
    const { data: existingStatuses } = await supabase
      .from('campaign_launch_status')
      .select('platform, market, phase_name, entity_type, status, dsp_entity_id')
      .eq('campaign_id', campaignId);
    
    // Create a set of already-pushed entities (market+phase combinations)
    // Include statuses that indicate an entity already exists in DSP to prevent accidental re-push on retries
    // NOTE: 'push_failed' can still have a dsp_entity_id if the DSP entity was created but a later step failed.
    const alreadyPushedSet = new Set<string>();
    for (const status of (existingStatuses || [])) {
      if ((status.status === 'pushed_to_dsp' || status.status === 'live' || status.status === 'push_failed') && status.dsp_entity_id) {
        // Key format: platform|market|phase_name
        const key = `${status.platform?.toLowerCase()}|${status.market}|${status.phase_name || ''}`;
        alreadyPushedSet.add(key);
      }
    }
    console.log(`📋 Found ${alreadyPushedSet.size} already-pushed entities to skip`);

    const results = [];

    // ============= PRE-PUSH BUDGET VALIDATION =============
    // Validate minimum budget requirements for all platforms BEFORE pushing anything
    console.log('🔍 Running pre-push budget validation...');
    const allBudgetErrors: BudgetValidationError[] = [];
    const marketSplits = campaign.market_splits || {};
    const budgetAllocation = campaign.budget_allocation || {};
    
    for (const [platformId, markets] of Object.entries(marketSplits)) {
      const campaignPlatform = (campaign.platforms || []).find((p: any) => p.id === platformId);
      if (!campaignPlatform) continue;
      
      const platformName = campaignPlatform.name;
      const platformBudgetPercentage = budgetAllocation[platformId] || 0;
      
      // Skip already-pushed markets in validation too
      const platformKey = platformName.toLowerCase().includes('meta') ? 'meta' : 
                          platformName.toLowerCase().includes('tiktok') ? 'tiktok' : platformName.toLowerCase();
      
      const marketsToValidate: Record<string, any> = {};
      for (const [marketCode, marketData] of Object.entries(markets as Record<string, any>)) {
        const phases = (marketData as any).phases || [];
        const phasesToValidate: any[] = [];
        
        for (const phase of phases) {
          const checkKey = `${platformKey}|${marketCode}|${phase.name || ''}`;
          if (!alreadyPushedSet.has(checkKey)) {
            phasesToValidate.push(phase);
          }
        }
        
        if (phasesToValidate.length > 0) {
          marketsToValidate[marketCode] = { ...marketData, phases: phasesToValidate };
        }
      }
      
      if (Object.keys(marketsToValidate).length > 0) {
        const platformConfig = { budgetPercentage: platformBudgetPercentage };
        const budgetErrors = validatePlatformBudgets(campaign, platformConfig, platformName, marketsToValidate);
        allBudgetErrors.push(...budgetErrors);
      }
    }
    
    if (allBudgetErrors.length > 0) {
      console.log(`❌ Pre-push validation failed with ${allBudgetErrors.length} budget error(s)`);
      for (const err of allBudgetErrors) {
        console.log(`  - ${err.platform}/${err.market}/${err.phase}: ${err.message}`);
        
        // Insert validation error status for each failed entity
        await supabase.from('campaign_launch_status').upsert({
          campaign_id: campaignId,
          platform: err.platform.toLowerCase(),
          market: err.market,
          phase_name: err.phase,
          entity_type: 'adset',
          status: 'validation_error',
          error_message: err.message,
          error_details: {
            type: 'minimum_budget',
            calculatedBudget: err.calculatedBudget,
            minimumRequired: err.minimumRequired,
            budgetType: err.budgetType,
            durationDays: err.durationDays,
            fieldPath: err.fieldPath
          },
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'campaign_id,platform,market,phase_name,entity_type'
        });
      }
      
      // Update campaign status to validation_failed
      await supabase.from('campaigns').update({
        status: 'validation_failed',
        updated_at: new Date().toISOString()
      }).eq('id', campaignId);
      
      return new Response(JSON.stringify({
        success: false,
        validationFailed: true,
        errors: allBudgetErrors.map(e => ({
          platform: e.platform,
          market: e.market,
          phase: e.phase,
          error: e.message,
          type: 'minimum_budget',
          fieldPath: e.fieldPath,
          details: {
            calculatedBudget: e.calculatedBudget,
            minimumRequired: e.minimumRequired,
            budgetType: e.budgetType,
            durationDays: e.durationDays
          }
        }))
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('✅ Pre-push budget validation passed');
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
      const platform = platforms.find(p => 
        p.platform_type.toLowerCase() === platformName.toLowerCase() || 
        (platformName.includes('Meta') && p.platform_type === 'meta')
      );
      
      if (!platform) {
        console.warn(`Platform ${platformName} not connected for user`);
        results.push({
          platform: platformName,
          error: "Platform not connected",
          markets: markets
        });
        continue;
      }

      // Get access token from Vault
      const accessToken = await getAccessToken(supabase, platform.id, platform.access_token);
      if (!accessToken) {
        console.error(`No access token found for platform ${platformName}`);
        results.push({
          platform: platformName,
          error: "Platform access token not found",
          markets: markets
        });
        continue;
      }
      
      // Add access token to platform object for adapter use
      const platformWithToken = { ...platform, access_token: accessToken };

      // Create platform config structure - filter out already-pushed markets
      const filteredMarkets: Record<string, any> = {};
      const platformKey = platformName.toLowerCase().includes('meta') ? 'meta' : 
                          platformName.toLowerCase().includes('tiktok') ? 'tiktok' : platformName.toLowerCase();
      
      let skippedCount = 0;
      for (const [marketCode, marketData] of Object.entries(markets as Record<string, any>)) {
        // Check each phase in the market
        const phases = marketData.phases || [];
        const filteredPhases: any[] = [];
        
        for (const phase of phases) {
          const checkKey = `${platformKey}|${marketCode}|${phase.name || ''}`;
          if (alreadyPushedSet.has(checkKey)) {
            console.log(`⏭️ Skipping already-pushed: ${platformName}/${marketCode}/${phase.name}`);
            skippedCount++;
          } else {
            filteredPhases.push(phase);
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
          message: 'All entities already pushed',
          results: []
        });
        continue;
      }
      
      console.log(`📤 Pushing ${Object.keys(filteredMarkets).length} markets for ${platformName} (skipped ${skippedCount} already-pushed)`);

      const platformConfig = {
        id: platformId,
        name: platformName,
        budgetPercentage: platformBudgetPercentage,
        markets: filteredMarkets
      };

      if (platformName.includes('Meta') || platformName.includes('Facebook')) {
        const result = await pushToMeta(campaign, platformConfig, platformWithToken, supabase);
        results.push(result);
        
        // Update campaign_launch_status for each pushed entity
        await updateLaunchStatuses(supabase, campaignId, platformName, result, Object.values(filteredMarkets) as any[]);
        
      } else if (platformName.includes('Google')) {
        const result = await pushToGoogleAds(campaign, platformConfig, platformWithToken);
        results.push(result);
      } else if (platformName.toLowerCase().includes('tiktok')) {
        const result = await pushToTikTok(campaign, platformConfig, platformWithToken);
        results.push(result);
        
        // Update campaign_launch_status for each pushed entity
        await updateLaunchStatuses(supabase, campaignId, 'TikTok', result, Object.values(filteredMarkets) as any[]);
      }
    }

    // Fetch final launch statuses to determine campaign status
    const { data: finalStatuses } = await supabase
      .from('campaign_launch_status')
      .select('status')
      .eq('campaign_id', campaignId);
    
    const statusCounts = {
      pushed: 0,
      failed: 0,
      pending: 0
    };
    
    for (const s of (finalStatuses || [])) {
      if (s.status === 'pushed_to_dsp' || s.status === 'live') statusCounts.pushed++;
      else if (s.status === 'push_failed' || s.status === 'validation_error') statusCounts.failed++;
      else if (s.status === 'pushing') statusCounts.pending++; // Still processing
      else statusCounts.pending++;
    }
    
    // Determine final campaign status
    // - pushed_to_dsp: ALL entities are pushed (no failures, no pending)
    // - partially_pushed: SOME pushed, but some failed or still pending
    // - push_failed: ALL failed (none pushed)
    // - ready_for_push: none pushed yet, still pending
    let finalStatus = 'ready_for_push';
    const totalEntities = (finalStatuses || []).length;
    
    if (statusCounts.pushed === totalEntities && totalEntities > 0) {
      finalStatus = 'pushed_to_dsp'; // All entities pushed successfully
    } else if (statusCounts.pushed > 0 && (statusCounts.failed > 0 || statusCounts.pending > 0)) {
      finalStatus = 'partially_pushed'; // Some pushed, some not
    } else if (statusCounts.failed > 0 && statusCounts.pushed === 0) {
      finalStatus = 'push_failed'; // All failed
    }
    
    console.log(`📊 Launch status summary: pushed=${statusCounts.pushed}, failed=${statusCounts.failed}, pending=${statusCounts.pending} → ${finalStatus}`);
    
    const nowIso = new Date().toISOString();
    const shouldSetPublishedAt =
      (finalStatus === 'pushed_to_dsp' || finalStatus === 'live') && !campaign.published_at;

    await supabase
      .from('campaigns')
      .update({
        status: finalStatus,
        updated_at: nowIso,
        ...(shouldSetPublishedAt ? { published_at: nowIso } : {}),
      })
      .eq('id', campaignId);
    
    console.log(`Campaign push completed. Final status: ${finalStatus}`);

    return new Response(
      JSON.stringify({ success: statusCounts.failed === 0, results, hasErrors: statusCounts.failed > 0, finalStatus }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error pushing campaign to DSP:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

// Helper function to map phase names to valid Meta objectives
function getMetaObjectiveFromPhase(phaseName: string, strategyFocus?: string, optimizationGoal?: string): { objective: string; optimizationGoal: string } {
  const lowerPhaseName = phaseName.toLowerCase();
  const lowerOptGoal = optimizationGoal?.toLowerCase() || '';
  
  // Handle Value optimization goal specifically for Conversions
  if (lowerOptGoal === 'value') {
    return { objective: 'OUTCOME_SALES', optimizationGoal: 'VALUE' };
  }
  
  // Map phase names to Meta objectives
  if (lowerPhaseName.includes('awareness') || lowerPhaseName.includes('reach')) {
    return { objective: 'OUTCOME_AWARENESS', optimizationGoal: 'REACH' };
  }
  
  if (lowerPhaseName.includes('engagement') || lowerPhaseName.includes('interest')) {
    return { objective: 'OUTCOME_ENGAGEMENT', optimizationGoal: 'POST_ENGAGEMENT' };
  }
  
  if (lowerPhaseName.includes('consideration') || lowerPhaseName.includes('intent')) {
    return { objective: 'OUTCOME_TRAFFIC', optimizationGoal: 'LINK_CLICKS' };
  }
  
  if (lowerPhaseName.includes('lead')) {
    return { objective: 'OUTCOME_LEADS', optimizationGoal: 'LEAD_GENERATION' };
  }
  
  if (lowerPhaseName.includes('conversion') || lowerPhaseName.includes('purchase') || lowerPhaseName.includes('sales') || lowerPhaseName.includes('loyalty')) {
    // Check strategy focus for more specific mapping
    if (strategyFocus === 'purchase' || strategyFocus === 'conversions') {
      return { objective: 'OUTCOME_SALES', optimizationGoal: 'OFFSITE_CONVERSIONS' };
    }
    return { objective: 'OUTCOME_SALES', optimizationGoal: 'OFFSITE_CONVERSIONS' };
  }
  
  if (lowerPhaseName.includes('app')) {
    return { objective: 'OUTCOME_APP_PROMOTION', optimizationGoal: 'APP_INSTALLS' };
  }
  
  // Default fallback
  return { objective: 'OUTCOME_TRAFFIC', optimizationGoal: 'LINK_CLICKS' };
}

async function pushToMeta(campaign: any, platformConfig: any, platform: any, supabase: any) {
  console.log("Pushing to Meta...");
  
  const results = [];
  const errors = [];
  
  // Extract markets from the correct structure (it's an object, not array)
  const marketsObj = platformConfig.markets || {};
  
  for (const [marketCode, market] of Object.entries(marketsObj) as [string, any][]) {
    // Validate required fields for conversion campaigns
    const requiresConversionEvent = market.phases && market.phases.some((phase: any) => {
      const phaseName = phase.name?.toLowerCase() || "";
      const objective = phase.objective?.toLowerCase() || "";
      return (
        phaseName.includes("conversion") ||
        phaseName.includes("purchase") ||
        phaseName.includes("sales") ||
        phaseName.includes("lead") ||
        objective.includes("conversion") ||
        objective.includes("sales") ||
        objective.includes("lead")
      );
    });

    if (requiresConversionEvent && (!market.pixel || !market.conversionEvent)) {
      errors.push({
        market: market.name,
        error: "Pixel and Conversion Event are required for conversion campaigns. Please configure them in the campaign customization.",
        type: 'validation_error'
      });
      continue;
    }

    // Get phases, or create a default phase if none exist
    const phases = market.phases || [{
      id: 'default-phase',
      name: market.name,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      budgetPercentage: 100,
      objective: market.objective || campaign.objective || "OUTCOME_TRAFFIC",
      optimizationGoal: market.optimizationGoal || "LINK_CLICKS"
    }];
    
    for (const phase of phases) {
      try {
        // Map phase objective to valid Meta objective - check forecast fields first
        let objective = phase.objective || (market as any).phaseObjective || market.objective || campaign.objective || "OUTCOME_TRAFFIC";
        let optimizationGoal = phase.optimizationGoal || (market as any).phaseOptimizationGoal || market.optimizationGoal || "LINK_CLICKS";
        
        // If objective is "auto" or invalid, map from phase name
        const validObjectives = ['APP_INSTALLS', 'BRAND_AWARENESS', 'EVENT_RESPONSES', 'LEAD_GENERATION', 
          'LINK_CLICKS', 'LOCAL_AWARENESS', 'MESSAGES', 'OFFER_CLAIMS', 'PAGE_LIKES', 'POST_ENGAGEMENT', 
          'PRODUCT_CATALOG_SALES', 'REACH', 'STORE_VISITS', 'VIDEO_VIEWS', 'OUTCOME_AWARENESS', 
          'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_APP_PROMOTION', 'CONVERSIONS'];
        
        if (!validObjectives.includes(objective)) {
          const mapped = getMetaObjectiveFromPhase(phase.name, market.strategyFocus || campaign.strategy_focus, optimizationGoal);
          objective = mapped.objective;
          optimizationGoal = mapped.optimizationGoal;
          console.log(`Mapped phase "${phase.name}" to objective: ${objective}, optimization goal: ${optimizationGoal}`);
        } else {
          // Still check if we need to map optimization goal for Value
          if (optimizationGoal?.toLowerCase() === 'value') {
            optimizationGoal = 'VALUE';
            objective = 'OUTCOME_SALES';
            console.log(`Mapped Value optimization to objective: ${objective}, optimization goal: ${optimizationGoal}`);
          }
        }
        
        // Create campaign - try to use taxonomy name first
        const genericConfig = campaign.generic_config || {};
        const adAccountId = (market as any).adAccountId || (market as any).ad_account_id;
        
        // Build context for campaign taxonomy
        const campaignTaxonomyContext: TaxonomyContext = {
          platform: 'meta',
          activationName: campaign.name,
          boNumber: campaign.bo_number,
          teamName: genericConfig.teamName,
          totalBudget: campaign.total_budget,
          platformBudget: (campaign.total_budget * (platformConfig.budgetPercentage || 100) / 100) * ((market.budgetPercentage || 100) / 100),
          market: market.name,
          country: market.name?.substring(0, 2)?.toUpperCase(),
          objective: objective,
          optimizationGoal: optimizationGoal,
          funnelStage: phase.funnelStage,
          placementType: phase.advantagePlusPlacements ? 'automatic' : (phase.tiktokPlacementType || 'manual'),
          advantagePlusPlacements: phase.advantagePlusPlacements,
          publisherPlatforms: phase.publisherPlatforms,
          startDate: phase.startDate || campaign.start_date,
          endDate: phase.endDate || campaign.end_date,
        };
        
        // Generate taxonomy name or fall back to default
        const campaignTaxonomyName = adAccountId ? await generateTaxonomyName(
          supabase, 
          campaign.user_id, 
          adAccountId, 
          'meta', 
          'campaign',
          campaignTaxonomyContext,
          phase.campaignTaxonomyValues
        ) : null;
        
        const defaultCampaignName = `${campaign.name} - ${market.name}${phases.length > 1 ? ` - ${phase.name}` : ''}_${generateTimestampSuffix()}`;
        
        const campaignPayload = {
          name: campaignTaxonomyName || defaultCampaignName,
          objective: objective,
          status: "PAUSED",
          special_ad_categories: [],
        };

        // Resolve Meta ad account id with fallbacks and ensure proper act_ prefix
        const resolvedAdAccount = (market as any).adAccountId || (market as any).ad_account_id || platform.ad_account_id || Deno.env.get("META_AD_ACCOUNT_ID");
        const adAccountPath = resolvedAdAccount
          ? (String(resolvedAdAccount).startsWith("act_") ? String(resolvedAdAccount) : `act_${String(resolvedAdAccount).replace(/^act_/, "")}`)
          : null;

        if (!adAccountPath) {
          console.error("Missing Meta ad account id for market:", market.name);
          errors.push({
            market: market.name,
            phase: phase.name,
            error: "Missing Meta ad account id",
            type: 'validation_error'
          });
          continue;
        }

        console.log("Creating Meta campaign on:", adAccountPath, campaignPayload);

        const campaignResponse = await fetch(
          `https://graph.facebook.com/v22.0/${adAccountPath}/campaigns`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...campaignPayload,
              access_token: platform.access_token,
            }),
          }
        );

        const campaignData = await campaignResponse.json();
        
        if (campaignData.error) {
          console.error("Meta Campaign Creation Error:", campaignData.error);
          const errorMsg = campaignData.error.message || JSON.stringify(campaignData.error);
          errors.push({
            market: market.name,
            phase: phase.name,
            error: errorMsg,
            type: 'campaign_creation',
            apiResponse: campaignData.error,
            fieldPath: 'step3'
          });
          continue;
        }

        console.log("Meta campaign created:", campaignData.id);

        // Calculate budget
        const totalCampaignBudget = campaign.total_budget || 0;
        const platformBudgetPercentage = platformConfig.budgetPercentage || 100;
        const marketBudgetPercentage = market.budgetPercentage || 100;
        const phaseBudgetPercentage = phase.budgetPercentage || 100;
        
        const phaseBudget = (totalCampaignBudget * platformBudgetPercentage / 100) * (marketBudgetPercentage / 100) * (phaseBudgetPercentage / 100);
        
        // Calculate duration in days (including start and end day)
        const startDate = new Date(phase.startDate || campaign.start_date);
        const endDate = new Date(phase.endDate || campaign.end_date);
        const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        // Use the phase's budget type (default to lifetime if not set)
        const budgetType = phase.budgetType || 'lifetime';
        const dailyBudget = budgetType === 'daily' ? Math.round(phaseBudget / durationDays * 100) : null;
        const lifetimeBudget = budgetType === 'lifetime' ? Math.round(phaseBudget * 100) : null;
        
        // Build targeting - get from phase.targeting or campaign.generic_config.basicTargeting
        const basicTargeting = campaign.generic_config?.basicTargeting || {};
        const phaseBasicTargeting = phase.targeting || {};
        
        // Use phase targeting if available, otherwise use basic targeting
        const effectiveBasicTargeting = Object.keys(phaseBasicTargeting).length > 0 ? phaseBasicTargeting : basicTargeting;
        
        console.log("Effective basic targeting for phase:", phase.name, effectiveBasicTargeting);
        
        const targeting: any = {
          geo_locations: {
            countries: Array.isArray(market.countries) && market.countries.length > 0 
              ? market.countries 
              : [market.name.substring(0, 2).toUpperCase()]
          },
          age_min: effectiveBasicTargeting.ageMin || 18,
          age_max: effectiveBasicTargeting.ageMax || 65,
        };
        
        // Add gender targeting if specified (handle array of IDs like ["1", "2"])
        const genders = effectiveBasicTargeting.genders;
        if (genders && Array.isArray(genders) && genders.length > 0 && !genders.includes('all')) {
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
        if (languages && Array.isArray(languages) && languages.length > 0 && !languages.includes('all')) {
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
        if (devices && Array.isArray(devices) && devices.length > 0 && !devices.includes('all')) {
          targeting.device_platforms = devices;
          console.log("Adding device targeting:", devices);
        }
        
        // Add OS targeting if specified (iOS, Android, etc.)
        const os = effectiveBasicTargeting.os;
        if (os && Array.isArray(os) && os.length > 0 && !os.includes('all')) {
          targeting.user_os = os;
          console.log("Adding OS targeting:", os);
        }
        
        // Check for Advantage+ placements flag (Meta automatic placement optimization)
        // When enabled, don't set any publisher_platforms or positions - Meta optimizes automatically
        const advantagePlusPlacements = phase.advantagePlusPlacements ?? (market as any).metaAdvantagePlusPlacements ?? true;
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
          console.log("📍 Raw metaPublisherPlatforms from market:", JSON.stringify((market as any).metaPublisherPlatforms));
          console.log("📍 Resolved publisherPlatforms:", JSON.stringify(publisherPlatforms));
          if (publisherPlatforms && Array.isArray(publisherPlatforms) && publisherPlatforms.length > 0) {
            const filteredPlatforms = publisherPlatforms.filter((p: string) => p !== 'messenger');
            if (filteredPlatforms.length > 0) {
              targeting.publisher_platforms = filteredPlatforms;
              console.log("Adding publisher platforms (messenger filtered out):", filteredPlatforms);
            }
          } else {
            // If no publisher platforms specified, default to all except messenger
            targeting.publisher_platforms = ['facebook', 'instagram', 'audience_network'];
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
          const validFacebookPositions = ['feed', 'instant_article', 'instream_video', 'marketplace', 'search', 'video_feeds', 'story'];
          const validInstagramPositions = ['stream', 'story', 'explore', 'explore_home', 'reels'];
          const validAudienceNetworkPositions = ['classic', 'instream_video', 'rewarded_video'];
          const validMessengerPositions: string[] = []; // Empty - all messenger placements deprecated
          
          // If no positions specified or positions is empty, default to all valid positions for each publisher platform
          if (!positions || Object.keys(positions).length === 0) {
            console.log("📍 No positions specified, using all valid positions for each publisher platform");
            if (targeting.publisher_platforms?.includes('facebook')) {
              targeting.facebook_positions = validFacebookPositions;
              console.log("Adding Facebook positions (default all):", validFacebookPositions);
            }
            if (targeting.publisher_platforms?.includes('instagram')) {
              targeting.instagram_positions = validInstagramPositions;
              console.log("Adding Instagram positions (default all):", validInstagramPositions);
            }
            if (targeting.publisher_platforms?.includes('audience_network')) {
              targeting.audience_network_positions = validAudienceNetworkPositions;
              console.log("Adding Audience Network positions (default all):", validAudienceNetworkPositions);
            }
          } else if (positions) {
            // Handle Facebook positions
            if (positions.facebook && Array.isArray(positions.facebook) && positions.facebook.length > 0) {
              if (positions.facebook.includes('automatic')) {
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
              if (positions.instagram.includes('automatic')) {
                targeting.instagram_positions = validInstagramPositions;
                console.log("Adding Instagram positions (automatic):", validInstagramPositions);
              } else {
                const filteredPositions = positions.instagram.filter((p: string) => validInstagramPositions.includes(p));
                if (filteredPositions.length > 0) {
                  targeting.instagram_positions = filteredPositions;
                  console.log("Adding Instagram positions:", filteredPositions);
                }
              }
            }
            
            // Handle Audience Network positions
            if (positions.audience_network && Array.isArray(positions.audience_network) && positions.audience_network.length > 0) {
              if (positions.audience_network.includes('automatic')) {
                targeting.audience_network_positions = validAudienceNetworkPositions;
                console.log("Adding Audience Network positions (automatic):", validAudienceNetworkPositions);
              } else {
                const filteredPositions = positions.audience_network.filter((p: string) => validAudienceNetworkPositions.includes(p));
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
            [t.type]: [{ id: t.id, name: t.name }]
          }));
        }

        // Get targeting config - use phase targeting or campaign basic targeting for ALL markets
        // This ensures targeting is applied consistently across all markets in a platform
        const campaignBasicTargeting = campaign.generic_config?.basicTargeting || {};
        const phaseTargetingConfig = phase.targeting || {};
        const effectiveTargeting = Object.keys(phaseTargetingConfig).length > 0 ? phaseTargetingConfig : campaignBasicTargeting;
        
        const targetingConfig = (phase.overrideTargeting && phase.targeting) 
          ? phase.targeting 
          : (campaign.generic_config?.targeting || {});
        
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
            if (item.platforms && item.platforms.includes('meta')) {
              // Extract the correct Meta ID - handle different ID formats
              let metaIdValue = item.metaId || item.id;
              // Remove prefix if present (e.g., "meta-123" -> "123")
              if (typeof metaIdValue === 'string' && metaIdValue.startsWith('meta-')) {
                metaIdValue = metaIdValue.substring(5);
              }
              if (typeof metaIdValue === 'string' && metaIdValue.startsWith('unified-')) {
                metaIdValue = item.metaId; // For unified items, use metaId directly
              }
              
              const metaItem = {
                id: metaIdValue,
                name: item.name,
                category: item.category
              };
              
              // Categorize by type (case-insensitive)
              const categoryLower = (item.category || '').toLowerCase();
              if (categoryLower === 'interest' || categoryLower === 'interests') {
                metaInterests.push(metaItem);
                console.log(`  ✓ Interest: ${item.name} (${metaItem.id})`);
              } else if (categoryLower === 'behavior' || categoryLower === 'behaviors') {
                metaBehaviors.push(metaItem);
                console.log(`  ✓ Behavior: ${item.name} (${metaItem.id})`);
              } else if (categoryLower === 'demographic' || categoryLower === 'demographics') {
                metaDemographics.push(metaItem);
                console.log(`  ✓ Demographic: ${item.name} (${metaItem.id})`);
              } else {
                console.warn(`  ⚠️ Unknown category '${item.category}' for item: ${item.name}`);
              }
            }
          });
          
          console.log(`📊 Transformed targeting - Interests: ${metaInterests.length}, Behaviors: ${metaBehaviors.length}, Demographics: ${metaDemographics.length}`);
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
            demographics: metaDemographics.length
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
            const name = (item.name || '').toLowerCase();
            const id = String(item.id || '');
            
            // Filter out "Friends of X" categories - Meta deprecated most of these for privacy
            if (name.includes('friends of')) {
              console.log(`  ⚠️ Filtering deprecated "Friends of" category: ${item.name}`);
              return false;
            }
            
            // Filter out IDs that don't look like standard Meta targeting category IDs
            // Standard Meta targeting IDs are 13-14 digits starting with 6
            // Entity/Page IDs are often longer or start with other numbers
            if (id.length > 14 || (id.length > 10 && !id.startsWith('6'))) {
              console.log(`  ⚠️ Filtering suspicious ID (looks like entity ID, not targeting): ${item.name} (${id})`);
              return false;
            }
            
            return true;
          };

          // Add interests from transformed targeting
          if (metaInterests.length > 0) {
            const interests = metaInterests.map((i: any) => ({
              id: i.id || i,
              name: i.name || i
            })).filter((i: any) => i.id && isValidMetaTargeting(i));
            if (interests.length > 0) {
              targeting.flexible_spec = targeting.flexible_spec || [];
              targeting.flexible_spec.push({ interests });
              console.log(`Adding ${interests.length} interests:`, interests.map((i: any) => i.name).join(', '));
            }
          }

          // Add behaviors from transformed targeting
          if (metaBehaviors.length > 0) {
            const behaviors = metaBehaviors.map((b: any) => ({
              id: b.id || b,
              name: b.name || b
            })).filter((b: any) => b.id && isValidMetaTargeting(b));
            if (behaviors.length > 0) {
              targeting.flexible_spec = targeting.flexible_spec || [];
              targeting.flexible_spec.push({ behaviors });
              console.log(`Adding ${behaviors.length} behaviors:`, behaviors.map((b: any) => b.name).join(', '));
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
              name: a.name
            }));
            console.log(`Adding ${effectiveTargeting.customAudiences.length} custom audiences`);
          }

          // Add lookalike audiences
          if (effectiveTargeting.lookalikes && effectiveTargeting.lookalikes.length > 0) {
            targeting.custom_audiences = targeting.custom_audiences || [];
            effectiveTargeting.lookalikes.forEach((la: any) => {
              targeting.custom_audiences.push({
                id: la.id,
                name: la.name
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
                name: cl.name
              });
            });
            console.log(`Adding ${effectiveTargeting.customerLists.length} customer lists`);
          }
        }

        // Process old targeting config format (legacy fallback)
        if (targetingConfig.websiteAudience) {
          const audienceNames = targetingConfig.websiteAudience.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (audienceNames.length > 0) {
            console.warn("Skipping websiteAudience fallback (names only). Audience IDs are required to target custom audiences.");
          }
        }

        // Fallback to old targeting config if no AI-parsed targeting (continued)
        if (targetingConfig.lookalikeAudience) {
          const lookalikeNames = targetingConfig.lookalikeAudience.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (lookalikeNames.length > 0) {
            console.warn("Skipping lookalikeAudience fallback (names only). Audience IDs are required.");
          }
        }

        // Add interests from targeting config
        if (targetingConfig.interests) {
          const interests = targetingConfig.interests.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (interests.length > 0) {
            console.warn("Skipping interests fallback (names only). Use AI-parsed targeting to include valid interest IDs.");
          }
        }

        // Add customer list (custom audiences from file)
        if (targetingConfig.customerList) {
          const customerLists = targetingConfig.customerList.split(',').map((s: string) => s.trim()).filter(Boolean);
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
                const items = Array.isArray(spec[key]) ? spec[key].filter((i: any) => i && typeof i.id === 'string' && i.id.trim() !== '') : [];
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
              if (typeof a === 'string' && /^\d+$/.test(a)) return { id: a };
              if (typeof a === 'object' && a.id) return { id: String(a.id) };
              return null;
            })
            .filter(Boolean);
          if (normalized.length > 0) {
            targeting.custom_audiences = normalized;
          } else {
            delete targeting.custom_audiences;
          }
        }

        // Validate bid strategy compatibility with optimization goal
        // COST_CAP and LOWEST_COST_WITH_BID_CAP only work with specific optimization goals
        const bidStrategyCompatibleGoals = ['OFFSITE_CONVERSIONS', 'VALUE', 'LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'LEAD_GENERATION', 'APP_INSTALLS'];
        // Phase-level Meta fields take priority over market-level
        const requestedBidStrategy = phase.metaBidStrategy || market.metaBidStrategy || "LOWEST_COST_WITHOUT_CAP";
        const metaBidAmount = phase.metaBidAmount || market.metaBidAmount;
        const userBillingEvent = phase.metaBillingEvent || (market as any).metaBillingEvent;
        const metaLandingPageUrl = phase.metaLandingPageUrl || (market as any).metaLandingPageUrl;
        
        // Meta billing_event + optimization_goal compatibility mapping
        // The billing_event MUST be compatible with the optimization_goal or the API will reject
        const getBillingEventForOptimizationGoal = (optGoal: string, userEvent?: string): string => {
          // Map optimization goals to their ONLY valid billing events
          const billingEventMap: Record<string, string> = {
            // Awareness & Reach - IMPRESSIONS only
            'REACH': 'IMPRESSIONS',
            'IMPRESSIONS': 'IMPRESSIONS',
            'BRAND_AWARENESS': 'IMPRESSIONS',
            'AD_RECALL_LIFT': 'IMPRESSIONS',
            // Traffic - LINK_CLICKS or IMPRESSIONS
            'LINK_CLICKS': 'LINK_CLICKS',
            'LANDING_PAGE_VIEWS': 'LINK_CLICKS',
            // Engagement - IMPRESSIONS or specific event
            'POST_ENGAGEMENT': 'IMPRESSIONS',
            'PAGE_LIKES': 'IMPRESSIONS',
            'EVENT_RESPONSES': 'IMPRESSIONS',
            // Video - THRUPLAY or IMPRESSIONS
            'THRUPLAY': 'THRUPLAY',
            'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS': 'IMPRESSIONS',
            // Conversions - IMPRESSIONS only (despite the name)
            'OFFSITE_CONVERSIONS': 'IMPRESSIONS',
            'VALUE': 'IMPRESSIONS',
            // App - IMPRESSIONS
            'APP_INSTALLS': 'IMPRESSIONS',
            'APP_EVENTS': 'IMPRESSIONS',
            // Lead Gen - IMPRESSIONS
            'LEAD_GENERATION': 'IMPRESSIONS',
            'QUALITY_LEAD': 'IMPRESSIONS',
            // Messaging - IMPRESSIONS or REPLIES
            'CONVERSATIONS': 'IMPRESSIONS',
            'REPLIES': 'IMPRESSIONS',
          };
          
          const requiredEvent = billingEventMap[optGoal];
          if (requiredEvent) {
            if (userEvent && userEvent !== requiredEvent) {
              console.warn(`⚠️ Billing event ${userEvent} not compatible with ${optGoal}. Using ${requiredEvent}`);
            }
            return requiredEvent;
          }
          // Default fallback
          return userEvent || 'IMPRESSIONS';
        };
        
        const metaBillingEvent = getBillingEventForOptimizationGoal(optimizationGoal, userBillingEvent);
        const rawMetaOptimizationLocation = phase.metaOptimizationLocation || (market as any).metaOptimizationLocation || "WEBSITE";
        
        // Map internal destination values to Meta's exact API enum values
        const metaDestinationTypeMap: Record<string, string> = {
          'WEBSITE': 'WEBSITE',
          'website': 'WEBSITE',
          'Website': 'WEBSITE',
          'APP': 'APP',
          'app': 'APP',
          'App': 'APP',
          'MESSAGING_APPS': 'MESSENGER',
          'Messaging Apps': 'MESSENGER',
          'MESSENGER': 'MESSENGER',
          'CALLS': 'ON_AD',
          'Calls': 'ON_AD',
          'SHOP': 'SHOP_AUTOMATIC',
          'Shop': 'SHOP_AUTOMATIC',
        };
        const metaOptimizationLocation = metaDestinationTypeMap[rawMetaOptimizationLocation] || rawMetaOptimizationLocation.toUpperCase();
        
        // Attribution window validation - Meta enforces STRICT attribution window rules
        // Valid combinations are ONLY: (1,0), (1,1), (7,0), (7,1) for (click_through, view_through)
        // Click-through: only 1 or 7 days allowed
        // View-through: only 0 or 1 days allowed
        // Extended windows (28 days click, 7 days view) are NOT supported in 2024+ API
        const trueConversionObjectives = ['OUTCOME_SALES', 'CONVERSIONS'];
        const trueConversionGoals = ['OFFSITE_CONVERSIONS', 'VALUE'];
        const hasFullAttribution = trueConversionObjectives.includes(objective) && trueConversionGoals.includes(optimizationGoal);
        
        // Get raw configured values
        const rawClickWindow = phase.metaClickWindow || (market as any).metaClickWindow;
        const rawViewWindow = phase.metaViewWindow || (market as any).metaViewWindow;
        
        let metaClickWindow: number;
        let metaViewWindow: number;
        
        if (hasFullAttribution) {
          // Conversion objectives can use 7-day click window
          // But MUST clamp click to 1 or 7, view to 0 or 1
          metaClickWindow = (rawClickWindow === 1) ? 1 : 7; // Default to 7 for conversions
          metaViewWindow = (rawViewWindow === 0) ? 0 : 1;   // Default to 1 for conversions
          console.log(`✅ ${objective}/${optimizationGoal} supports full attribution. Using click=${metaClickWindow}d, view=${metaViewWindow}d (raw: ${rawClickWindow}, ${rawViewWindow})`);
        } else {
          // Force (1, 0) for all other objectives - Meta only supports this combination
          metaClickWindow = 1;
          metaViewWindow = 0;
          console.log(`⚠️ ${objective}/${optimizationGoal} only supports limited attribution (1,0). Forcing click=${metaClickWindow}d, view=${metaViewWindow}d (configured was: ${rawClickWindow}, ${rawViewWindow})`);
        }
        
        const requiresBidCap = requestedBidStrategy === 'COST_CAP' || requestedBidStrategy === 'LOWEST_COST_WITH_BID_CAP';
        const isCompatible = bidStrategyCompatibleGoals.includes(optimizationGoal);
        
        let finalBidStrategy = requestedBidStrategy;
        if (requiresBidCap && !isCompatible) {
          console.warn(`⚠️ Bid strategy ${requestedBidStrategy} is not compatible with optimization goal ${optimizationGoal}`);
          console.warn(`Falling back to LOWEST_COST_WITHOUT_CAP for ${optimizationGoal}`);
          finalBidStrategy = "LOWEST_COST_WITHOUT_CAP";
        }

        // Create ad set - try to use taxonomy name first
        const adsetTaxonomyContext: TaxonomyContext = {
          platform: 'meta',
          objective: objective,
          optimizationGoal: optimizationGoal,
          phaseBudget: phaseBudget,
          budgetType: budgetType,
          ageMin: effectiveBasicTargeting.ageMin || 18,
          ageMax: effectiveBasicTargeting.ageMax || 65,
          gender: effectiveBasicTargeting.genders?.[0],
          location: market.name,
          devices: effectiveBasicTargeting.devices,
          languages: effectiveBasicTargeting.languages,
          placementType: advantagePlusPlacements ? 'automatic' : 'manual',
          advantagePlusPlacements: advantagePlusPlacements,
          targetingType: effectiveBasicTargeting.targetingExpansion ? 'expand' : 'native',
          startDate: phase.startDate || campaign.start_date,
          endDate: phase.endDate || campaign.end_date,
        };
        
        const adsetTaxonomyName = adAccountId ? await generateTaxonomyName(
          supabase,
          campaign.user_id,
          adAccountId,
          'meta',
          'adset',
          adsetTaxonomyContext,
          phase.adsetTaxonomyValues
        ) : null;
        
        const defaultAdSetName = `${phase.name} - Ad Set_${generateTimestampSuffix()}`;
        
        const adSetPayload: any = {
          name: adsetTaxonomyName || defaultAdSetName,
          campaign_id: campaignData.id,
          billing_event: metaBillingEvent,
          optimization_goal: optimizationGoal,
          bid_strategy: finalBidStrategy,
          status: "PAUSED",
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          targeting: targeting,
        };

        // Add attribution settings - always include for consistency
        adSetPayload.attribution_spec = [
          {
            event_type: "CLICK_THROUGH",
            window_days: metaClickWindow
          },
          {
            event_type: "VIEW_THROUGH", 
            window_days: metaViewWindow
          }
        ];
        console.log(`✅ Attribution windows set: click=${metaClickWindow}d, view=${metaViewWindow}d`);

        // Add destination URL for traffic campaigns
        if (metaLandingPageUrl && (optimizationGoal === 'LINK_CLICKS' || optimizationGoal === 'LANDING_PAGE_VIEWS')) {
          adSetPayload.destination_type = metaOptimizationLocation;
          console.log(`✅ Destination type: ${metaOptimizationLocation}, Landing page: ${metaLandingPageUrl}`);
        }

        // DSA (Digital Services Act) compliance fields - required for EU ads
        // Use ad account name or campaign name as beneficiary/payor
        const dsaBeneficiary = campaign.name || "Advertiser";
        const dsaPayor = campaign.name || "Advertiser";
        adSetPayload.dsa_beneficiary = dsaBeneficiary;
        adSetPayload.dsa_payor = dsaPayor;
        console.log(`✅ DSA compliance: beneficiary="${dsaBeneficiary}", payor="${dsaPayor}"`);

        console.log(`✅ Bid strategy validated: ${finalBidStrategy} (requested: ${requestedBidStrategy}, compatible: ${isCompatible})`);
        console.log(`✅ Billing event: ${metaBillingEvent}`);
        
        // Add bid amount if bid strategy requires it AND it's compatible
        if ((finalBidStrategy === 'LOWEST_COST_WITH_BID_CAP' || finalBidStrategy === 'COST_CAP') && 
            metaBidAmount && metaBidAmount > 0) {
          adSetPayload.bid_amount = Math.round(metaBidAmount * 100); // Convert to cents
          console.log(`✅ Adding Meta bid amount: €${metaBidAmount} (${adSetPayload.bid_amount} cents) for strategy ${finalBidStrategy}`);
        }
        
        // Add conversion tracking for conversion-optimized ad sets (including VALUE)
        if (market.pixel && market.conversionEvent && (adSetPayload.optimization_goal === 'OFFSITE_CONVERSIONS' || adSetPayload.optimization_goal === 'VALUE')) {
          // Meta's valid custom_event_type values
          const validEventTypes = [
            'AD_IMPRESSION', 'RATE', 'TUTORIAL_COMPLETION', 'CONTACT', 'CUSTOMIZE_PRODUCT', 
            'DONATE', 'FIND_LOCATION', 'SCHEDULE', 'START_TRIAL', 'SUBMIT_APPLICATION', 
            'SUBSCRIBE', 'ADD_TO_CART', 'ADD_TO_WISHLIST', 'INITIATED_CHECKOUT', 
            'ADD_PAYMENT_INFO', 'PURCHASE', 'LEAD', 'COMPLETE_REGISTRATION', 'CONTENT_VIEW', 
            'SEARCH', 'SERVICE_BOOKING_REQUEST', 'MESSAGING_CONVERSATION_STARTED_7D', 
            'LEVEL_ACHIEVED', 'ACHIEVEMENT_UNLOCKED', 'SPENT_CREDITS', 'LISTING_INTERACTION', 
            'D2_RETENTION', 'D7_RETENTION', 'OTHER'
          ];
          // Normalize and validate conversion event
          const normalizedEvent = market.conversionEvent.toUpperCase().trim();
          const eventType = validEventTypes.includes(normalizedEvent) ? normalizedEvent : 'OTHER';
          if (!validEventTypes.includes(normalizedEvent)) {
            console.warn(`Invalid conversion event "${market.conversionEvent}" for market ${market.name}, using "OTHER" as fallback`);
          }
          adSetPayload.promoted_object = {
            pixel_id: market.pixel,
            custom_event_type: eventType,
          };
          console.info(`Including promoted_object for optimization_goal=${adSetPayload.optimization_goal}`);
        } else if (adSetPayload.optimization_goal !== 'OFFSITE_CONVERSIONS' && (market.pixel || market.conversionEvent)) {
          console.info(`Skipping promoted_object for optimization_goal=${adSetPayload.optimization_goal}`);
        }
        
        // Set budget (convert to cents)
        if (lifetimeBudget) {
          adSetPayload.lifetime_budget = lifetimeBudget;
        } else if (dailyBudget) {
          adSetPayload.daily_budget = dailyBudget;
        }

        console.log("Creating Meta ad set:", adSetPayload);

        const adSetResponse = await fetch(
          `https://graph.facebook.com/v22.0/${adAccountPath}/adsets`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...adSetPayload,
              access_token: platform.access_token,
            }),
          }
        );

        let adSetData = await adSetResponse.json();
        
        // Check for VALUE optimization errors and fallback to OFFSITE_CONVERSIONS
        // Error subcodes:
        // - 2446368: Pixel not eligible for VALUE optimization
        // - 2446146: VALUE optimization not available (unverified business account)
        // - 1815117: Billing event invalid for optimization goal
        const valueOptErrorCodes = [2446368, 2446146, 1815117];
        const isValueOptError = adSetData.error && 
          valueOptErrorCodes.includes(adSetData.error.error_subcode) && 
          (adSetPayload.optimization_goal === 'VALUE' || 
           (adSetData.error.error_data && adSetData.error.error_data.includes('billing_event')));
        
        if (isValueOptError) {
          const errorSubcode = adSetData.error.error_subcode;
          let fallbackReason = '';
          
          if (errorSubcode === 2446368) {
            fallbackReason = `Pixel ${market.pixel} not eligible for VALUE optimization`;
          } else if (errorSubcode === 2446146) {
            fallbackReason = `VALUE optimization not available for this ad account (unverified business)`;
          } else if (errorSubcode === 1815117) {
            fallbackReason = `Billing event ${adSetPayload.billing_event} incompatible with optimization goal ${adSetPayload.optimization_goal}`;
          }
          
          console.warn(`${fallbackReason}. Retrying with OFFSITE_CONVERSIONS...`);
          
          // Fallback: Use OFFSITE_CONVERSIONS which is available to all accounts
          adSetPayload.optimization_goal = 'OFFSITE_CONVERSIONS';
          // Ensure billing_event is compatible with OFFSITE_CONVERSIONS
          adSetPayload.billing_event = 'IMPRESSIONS';
          
          console.log("Retrying Meta ad set creation with fallback:", {
            optimization_goal: adSetPayload.optimization_goal,
            billing_event: adSetPayload.billing_event
          });
          
          const retryResponse = await fetch(
            `https://graph.facebook.com/v22.0/${adAccountPath}/adsets`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...adSetPayload,
                access_token: platform.access_token,
              }),
            }
          );
          
          adSetData = await retryResponse.json();
          
          if (!adSetData.error) {
            console.log(`✓ Ad set created successfully with OFFSITE_CONVERSIONS fallback for ${phase.name}`);
          }
        }
        
        if (adSetData.error) {
          console.error("Meta Ad Set Creation Error:", adSetData.error);
          const errorMsg = adSetData.error.message || JSON.stringify(adSetData.error);
          errors.push({
            market: market.name,
            phase: phase.name,
            error: errorMsg,
            type: 'adset_creation',
            campaignId: campaignData.id,
            apiResponse: adSetData.error,
            fieldPath: 'step3'
          });
          continue;
        }

        console.log("Meta ad set created:", adSetData.id);

        results.push({
          platform: "Meta",
          market: market.name,
          phase: phase.name,
          campaignId: campaignData.id,
          adSetId: adSetData.id,
          budget: phaseBudget,
          budgetType: budgetType,
        });
      } catch (error: any) {
        console.error(`Error processing market ${market.name}, phase ${phase.name}:`, error);
        errors.push({
          market: market.name,
          phase: phase.name,
          error: error.message || 'Unexpected error during Meta campaign creation',
          type: 'processing_error',
          apiResponse: error.stack || error.toString(),
          fieldPath: 'step3'
        });
      }
    }
  }

  return { platform: "Meta", results, errors: errors.length > 0 ? errors : undefined };
}

async function pushToGoogleAds(campaign: any, platformConfig: any, platform: any) {
  console.log("Pushing to Google Ads...");
  
  // Google Ads API implementation would go here
  // This is a placeholder for the actual implementation
  
  return {
    platform: "Google Ads",
    status: "Not implemented yet",
  };
}

// TikTok campaign publishing
async function pushToTikTok(campaign: any, platformConfig: any, platform: any) {
  console.log("Pushing to TikTok...");
  
  // Check for conversion campaigns and log automatic fallback warning
  const marketsObj = platformConfig.markets || {};
  const hasConversionCampaigns = Object.values(marketsObj).some((market: any) =>
    market.phases?.some((phase: any) => {
      const objective = (phase.objective || '').toLowerCase();
      const optimizationGoal = (phase.optimizationGoal || '').toLowerCase();
      return objective.includes('conversion') || optimizationGoal.includes('convert');
    })
  );
  
  if (hasConversionCampaigns) {
    console.warn("⚠️⚠️⚠️ TIKTOK CONVERSION CAMPAIGN DETECTED ⚠️⚠️⚠️");
    console.warn("TikTok requires conversion events to have 90+ days of historical data");
    console.warn("System will AUTOMATICALLY fallback to TRAFFIC objective with CLICK optimization");
    console.warn("This ensures ad groups can be created successfully without pixel data requirements");
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
        type: 'validation_error'
      });
      continue;
    }
    
    const phases = market.phases || [{
      id: 'default-phase',
      name: market.name,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      budgetPercentage: 100,
      objective: market.objective || campaign.objective || "TRAFFIC"
    }];
    
    for (const phase of phases) {
      try {
        // Map Meta objective to TikTok objective
        const objectiveMapping = await mapper.mapObjective(
          phase.objective || market.objective || campaign.objective,
          "meta",
          "tiktok"
        );
        
        console.log(`Mapped objective: ${objectiveMapping.sourceObjective} -> ${objectiveMapping.targetObjective}`);
        
        // Calculate budget
        const totalCampaignBudget = campaign.total_budget || 0;
        const platformBudgetPercentage = platformConfig.budgetPercentage || 100;
        const marketBudgetPercentage = market.budgetPercentage || 100;
        const phaseBudgetPercentage = phase.budgetPercentage || 100;
        
        const phaseBudget = (totalCampaignBudget * platformBudgetPercentage / 100) * 
                           (marketBudgetPercentage / 100) * (phaseBudgetPercentage / 100);
        
        // Calculate duration
        const startDate = new Date(phase.startDate || campaign.start_date);
        const endDate = new Date(phase.endDate || campaign.end_date);
        const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        const budgetType = phase.budgetType || 'lifetime';
        const campaignBudget = budgetType === 'daily' ? phaseBudget / durationDays : phaseBudget;
        
        // Build context for TikTok campaign taxonomy
        const genericConfig = campaign.generic_config || {};
        const tiktokCampaignTaxonomyContext: TaxonomyContext = {
          platform: 'tiktok',
          activationName: campaign.name,
          boNumber: campaign.bo_number,
          teamName: genericConfig.teamName,
          totalBudget: campaign.total_budget,
          platformBudget: phaseBudget,
          market: market.name,
          country: market.name?.substring(0, 2)?.toUpperCase(),
          objective: objectiveMapping.targetObjective,
          funnelStage: phase.funnelStage,
          placementType: phase.tiktokPlacementType || 'automatic',
          startDate: phase.startDate || campaign.start_date,
          endDate: phase.endDate || campaign.end_date,
        };
        
        const tiktokCampaignTaxonomyName = advertiserId ? await generateTaxonomyName(
          supabase,
          campaign.user_id,
          advertiserId,
          'tiktok',
          'campaign',
          tiktokCampaignTaxonomyContext,
          phase.campaignTaxonomyValues
        ) : null;
        
        const defaultTiktokCampaignName = `${campaign.name} - ${market.name}${phases.length > 1 ? ` - ${phase.name}` : ''}_${generateTimestampSuffix()}`;
        
        // Create TikTok campaign
        const campaignResult = await tiktokAdapter.createCampaign({
          accountId: advertiserId,
          accessToken: platform.access_token,
          campaignName: tiktokCampaignTaxonomyName || defaultTiktokCampaignName,
          objective: objectiveMapping.targetObjective,
          budget: campaignBudget,
          budgetMode: budgetType,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          status: "PAUSED",
        });
        
        if (!campaignResult.success) {
          const errData = (campaignResult as any).error;
          const errorMsg = typeof errData === 'string' 
            ? errData 
            : (errData?.message || JSON.stringify(errData));
          errors.push({
            market: market.name,
            phase: phase.name,
            error: errorMsg,
            type: 'campaign_creation',
            apiResponse: errData,
            fieldPath: 'step3'
          });
          continue;
        }
        
        console.log("TikTok campaign created:", campaignResult.campaignId);
        
        // Store campaign in database
        await supabase.from("tiktok_campaigns").insert({
          user_id: campaign.user_id,
          actiplan_campaign_id: campaign.id,
          tiktok_campaign_id: campaignResult.campaignId,
          advertiser_id: advertiserId,
          campaign_name: campaignResult.metadata?.campaign_name || "",
          objective_type: objectiveMapping.targetObjective,
          budget_mode: budgetType,
          budget: campaignBudget,
          status: "PAUSED",
        });
        
        // Get placement settings from phase, market, or use defaults
        const placementType = phase.tiktokPlacementType || market.tiktokPlacementType || "PLACEMENT_TYPE_AUTOMATIC";
        let tiktokPlacements: string[];
        
        if (placementType === "PLACEMENT_TYPE_NORMAL") {
          // Use manual placements from phase or market
          const configuredPlacements = phase.tiktokPlacements || market.tiktokPlacements;
          tiktokPlacements = Array.isArray(configuredPlacements) && configuredPlacements.length > 0 
            ? configuredPlacements 
            : ["PLACEMENT_TIKTOK"];
          console.log(`📍 Using MANUAL placements: ${tiktokPlacements.join(', ')}`);
        } else {
          // Automatic placement - TikTok will optimize
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
            console.log(`📝 Item ${index}: platforms=${JSON.stringify(item.platforms)}, category='${item.category}', name='${item.name}'`);
            
            // Only process items available on TikTok
            if (item.platforms && item.platforms.includes('tiktok')) {
              // Extract the correct TikTok ID - handle different ID formats
              let tiktokIdValue = item.tiktokId || item.id;
              // Remove prefix if present (e.g., "tiktok-123" -> "123")
              if (typeof tiktokIdValue === 'string' && tiktokIdValue.startsWith('tiktok-')) {
                tiktokIdValue = tiktokIdValue.substring(7);
              }
              if (typeof tiktokIdValue === 'string' && tiktokIdValue.startsWith('unified-')) {
                tiktokIdValue = item.tiktokId; // For unified items, use tiktokId directly
              }
              
              const tiktokItem = {
                id: tiktokIdValue,
                name: item.name,
                category: item.category
              };
              
              // Categorize by type (case-insensitive) - be more inclusive
              const categoryLower = (item.category || '').toLowerCase();
              if (categoryLower === 'interest' || categoryLower === 'interests') {
                tiktokInterests.push(tiktokItem);
                console.log(`  ✓ Interest: ${item.name} (${tiktokItem.id})`);
              } else if (categoryLower === 'behavior' || categoryLower === 'behaviors' || 
                         categoryLower === 'action' || categoryLower === 'actions' ||
                         categoryLower === 'purchase_intention' || categoryLower === 'video_interaction' ||
                         categoryLower === 'creator_interaction' || categoryLower === 'hashtag_interaction') {
                // All action-based categories map to behaviors
                tiktokBehaviors.push(tiktokItem);
                console.log(`  ✓ Behavior/Action: ${item.name} (${tiktokItem.id}) [category: ${item.category}]`);
              } else if (categoryLower === 'demographic' || categoryLower === 'demographics') {
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
          
          console.log(`📊 Transformed targeting - Interests: ${tiktokInterests.length}, Behaviors: ${tiktokBehaviors.length}, Demographics: ${tiktokDemographics.length}`);
        } else {
          // Fallback to legacy format (direct arrays)
          tiktokInterests = effectiveTargeting.tiktokInterests || [];
          tiktokBehaviors = effectiveTargeting.tiktokBehaviors || [];
          tiktokDemographics = effectiveTargeting.tiktokDemographics || [];
          console.log("📊 Using legacy targeting format (direct arrays)");
        }
        
        // Map field names properly - handle both camelCase and snake_case from different sources
        const targeting: any = {
          geo_locations: {
            countries: Array.isArray(market.countries) && market.countries.length > 0 
              ? market.countries 
              : [market.name.substring(0, 2).toUpperCase()]
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
        let tiktokOptGoal: string;
        const mappedObjective = objectiveMapping.targetObjective;
        
        if (mappedObjective === "CONVERSIONS") {
          // CONVERSIONS objective always uses CONVERT optimization goal
          tiktokOptGoal = "CONVERT";
        } else if (mappedObjective === "TRAFFIC") {
          // TRAFFIC objective uses CLICK or LANDING_PAGE
          const phaseOptGoal = phase.optimizationGoal;
          if (phaseOptGoal === "LANDING_PAGE_VIEWS") {
            tiktokOptGoal = "LANDING_PAGE";
          } else {
            tiktokOptGoal = "CLICK";
          }
        } else if (mappedObjective === "REACH") {
          tiktokOptGoal = "REACH";
        } else if (mappedObjective === "VIDEO_VIEW") {
          tiktokOptGoal = "VIDEO_VIEW";
        } else if (mappedObjective === "APP_INSTALL") {
          tiktokOptGoal = "INSTALL";
        } else {
          // Default fallback
          tiktokOptGoal = "CLICK";
        }
        
        console.log(`Mapped optimization goal for objective ${mappedObjective}: ${tiktokOptGoal} (phase optimization goal: ${phase.optimizationGoal})`);
        
        // Map billing event based on objective + optimization goal combination
        // TikTok has strict billing event requirements per objective
        const billingEventMap: Record<string, Record<string, string>> = {
          "TRAFFIC": {
            "CLICK": "CPC",  // TRAFFIC with CLICK only supports CPC
            "LANDING_PAGE": "CPC",
          },
          "CONVERSIONS": {
            "CONVERT": "OCPM",  // CONVERSIONS supports OCPM
          },
          "REACH": {
            "REACH": "CPM",  // REACH typically uses CPM
          },
          "VIDEO_VIEW": {
            "VIDEO_VIEW": "CPV",  // VIDEO_VIEW uses CPV
          },
          "APP_INSTALL": {
            "INSTALL": "OCPM",
          },
        };
        
        // Determine billing event based on objective and optimization goal
        console.log(`DEBUG: Looking up billing event for objective: ${mappedObjective}, optimization goal: ${tiktokOptGoal}`);
        console.log(`DEBUG: Available objectives in billingEventMap:`, Object.keys(billingEventMap));
        
        let billingEvent = billingEventMap[mappedObjective]?.[tiktokOptGoal];
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
        
        console.log(`Using billing event: ${billingEvent} for objective ${mappedObjective}, optimization goal ${tiktokOptGoal}`);
        
        // Get pixel ID for conversion campaigns
        let pixelId: string | undefined;
        if (tiktokOptGoal === 'CONVERT' || mappedObjective === 'CONVERSIONS') {
          pixelId = market.tiktokPixel || market.pixelId || market.tiktokPixelId;
          console.log(`Conversion campaign detected - using pixel_id: ${pixelId}`);
        }
        
        // Get landing page URL from market defaults or use placeholder
        const landingPageUrl = market.tiktokLandingPageUrl || market.websiteUrl || campaign.website_url || "https://example.com";
        console.log(`Using landing page URL: ${landingPageUrl}`);
        
        // Get bid amount from market defaults or phase overrides
        const bidAmount = phase.tiktokBidAmount || market.tiktokBidAmount || undefined;
        if (bidAmount) {
          console.log(`Using bid amount: €${bidAmount}`);
        } else {
          console.warn(`⚠️ No bid amount configured - TikTok may require bid amount for CPC/CPM billing events`);
        }
        
        // Get optimization location (defaults fetched from tiktok_ad_accounts if not specified)
        const optimizationLocation = phase.tiktokOptimizationLocation || market.tiktokOptimizationLocation || "Website";
        
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
        const eventCountEnabled = phase.tiktokEventCountEnabled !== undefined ? phase.tiktokEventCountEnabled : market.tiktokEventCountEnabled;
        const smartPlusEnabled = phase.tiktokSmartPlusEnabled !== undefined ? phase.tiktokSmartPlusEnabled : market.tiktokSmartPlusEnabled;
        const searchEnabled = phase.tiktokSearchEnabled !== undefined ? phase.tiktokSearchEnabled : market.tiktokSearchEnabled;
        
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
          });

        console.log(`🚀 CALLING tiktokAdapter.createAdGroup for ${phase.name}...`);
        console.log(`📍 campaignId: ${campaignResult.campaignId}, advertiserId: ${advertiserId}`);
        
        // Build context for TikTok ad group taxonomy
        const tiktokAdgroupTaxonomyContext: TaxonomyContext = {
          platform: 'tiktok',
          objective: objectiveMapping.targetObjective,
          optimizationGoal: tiktokOptGoal,
          phaseBudget: campaignBudget,
          budgetType: budgetType,
          ageMin: effectiveTargeting.ageMin || effectiveTargeting.age_min || 18,
          ageMax: effectiveTargeting.ageMax || effectiveTargeting.age_max || 65,
          gender: effectiveTargeting.genders?.[0],
          location: market.name,
          devices: effectiveTargeting.devices,
          placementType: placementType,
          targetingType: effectiveTargeting.targetingExpansion ? 'expand' : 'native',
          startDate: phase.startDate || campaign.start_date,
          endDate: phase.endDate || campaign.end_date,
        };
        
        const tiktokAdgroupTaxonomyName = advertiserId ? await generateTaxonomyName(
          supabase,
          campaign.user_id,
          advertiserId,
          'tiktok',
          'adset',
          tiktokAdgroupTaxonomyContext,
          phase.adsetTaxonomyValues
        ) : null;
        
        const defaultTiktokAdGroupName = `${phase.name} - Ad Group_${generateTimestampSuffix()}`;
        
        const adGroupResult = await tiktokAdapter.createAdGroup({
          accountId: advertiserId,
          accessToken: platform.access_token,
          campaignId: campaignResult.campaignId,
          adGroupName: tiktokAdgroupTaxonomyName || defaultTiktokAdGroupName,
          targeting: targeting,
          placements: tiktokPlacements,
          placementType: placementType,
          optimizationGoal: tiktokOptGoal,
          billingEvent: billingEvent,
          bidStrategy: phase.tiktokBidStrategy || market.tiktokBidStrategy || "LOWEST_COST",
          bidAmount: bidAmount,
          budget: campaignBudget,
          budgetMode: budgetType,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          status: "PAUSED",
          pixelId: pixelId,
          landingPageUrl: landingPageUrl,
          optimizationLocation: optimizationLocation,
          appName: appName,
          appId: appId,
          clickWindow: clickWindow,
          viewWindow: viewWindow,
          frequencySchedule: tiktokFrequencySchedule,
          eventCount: tiktokEventCount,
          smartPlusEnabled: smartPlusEnabled,
        });

        if (!adGroupResult.success) {
          const errData = (adGroupResult as any).error;
          const errorMsg = typeof errData === 'string' 
            ? errData 
            : (errData?.message || JSON.stringify(errData));
          errors.push({
            market: market.name,
            phase: phase.name,
            error: errorMsg,
            type: 'adgroup_creation',
            apiResponse: errData,
            fieldPath: 'step3'
          });
          continue;
        }
        
        console.log("TikTok ad group created:", adGroupResult.adGroupId);
        
        // Store ad group in database
        await supabase.from("tiktok_ad_groups").insert({
          user_id: campaign.user_id,
          tiktok_campaign_id: campaignResult.campaignId,
          tiktok_ad_group_id: adGroupResult.adGroupId,
          advertiser_id: advertiserId,
          ad_group_name: adGroupResult.metadata?.adgroup_name || "",
          placement_type: placementType,
          placements: tiktokPlacements,
          targeting: targeting,
          budget: campaignBudget,
          budget_mode: budgetType,
          optimization_goal: tiktokOptGoal,
          status: "PAUSED",
        });
        
        results.push({
          market: market.name,
          phase: phase.name,
          campaignId: campaignResult.campaignId,
          adGroupId: adGroupResult.adGroupId,
          success: true,
        });
        
      } catch (error: any) {
        console.error("Error creating TikTok campaign/ad group:", error);
        errors.push({
          market: market.name,
          phase: phase.name,
          error: error.message || 'Unexpected error during TikTok campaign creation',
          type: 'unexpected_error',
          apiResponse: error.stack || error.toString(),
          fieldPath: 'step3'
        });
      }
    }
  }
  
  return {
    platform: 'TikTok',
    results,
    errors,
    success: errors.length === 0,
  };
}

serve(handler);
