import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { resolveHasActivePlatformToken } from "../_shared/platform-connection-resolver.ts";
import { buildSearchStrategyCampaigns, getEffectiveSearchKeywords, isSearchPhaseLike } from "../_shared/search-strategy-campaigns.ts";
import {
  calculateAdSetBudgetEur,
  formatMinimumBudgetMessage,
  isBelowActiPlanMinimumBudget,
} from "../_shared/actiplan-budget-minimums.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidationError {
  platform: string;
  market: string;
  phase?: string;
  entityType: 'campaign' | 'adset' | 'ad_group';
  field?: string;
  fieldPath?: string; // Path to navigate user to fix the issue
  message: string;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  entities: {
    platform: string;
    market: string;
    phase: string;
    entityType: 'campaign' | 'adset' | 'ad_group';
    entityName: string;
    plannedBudget: number;
    plannedImpressions?: number | null;
    plannedReach?: number | null;
    plannedClicks?: number | null;
    plannedConversions?: number | null;
  }[];
}

// Calculate actual budget from percentage
function calculateBudget(totalBudget: number, platformBudgetPct: number, marketBudgetPct: number): number {
  const platformBudget = (totalBudget * platformBudgetPct) / 100;
  return (platformBudget * marketBudgetPct) / 100;
}

// Validate Meta campaign configuration
function validateMetaCampaign(campaign: any, market: any, phase: any, hasAccessToken: boolean, calculatedBudget: number, entityPhaseName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const marketName = market.name || market.id;
  // Use the consistent entityPhaseName for error matching
  const phaseName = entityPhaseName;
  
  // Check ad account
  const adAccountId = market.adAccountId || market.ad_account_id;
  if (!adAccountId) {
    errors.push({
      platform: 'Meta',
      market: marketName,
      phase: phaseName,
      entityType: 'campaign',
      field: 'adAccountId',
      fieldPath: 'step1', // Navigate to step 1 to select ad account
      message: 'Missing Meta ad account ID. Select an ad account in Platform & Market Selection.',
      severity: 'error'
    });
  }
  
  // Check access token (now checking boolean from Vault lookup)
  if (!hasAccessToken) {
    errors.push({
      platform: 'Meta',
      market: marketName,
      phase: phaseName,
      entityType: 'campaign',
      field: 'access_token',
      fieldPath: 'connections', // Navigate to platform connections
      message: 'Meta platform not connected or access token expired. Reconnect your Meta account.',
      severity: 'error'
    });
  }
  
  // Check objective
  const objective = phase?.objective || market?.objective || campaign.objective;
  if (!objective) {
    errors.push({
      platform: 'Meta',
      market: marketName,
      phase: phaseName,
      entityType: 'campaign',
      field: 'objective',
      fieldPath: 'step3', // Navigate to strategy section
      message: 'No campaign objective set. Configure strategy in Step 3.',
      severity: 'error'
    });
  }
  
  // Check conversion campaigns have pixel
  const isConversionCampaign = objective?.includes('SALES') || objective?.includes('LEADS') || 
    objective?.includes('CONVERSION') || phase?.name?.toLowerCase().includes('conversion');
  if (isConversionCampaign) {
    // Check both possible field names for pixel
    const pixelId = market.pixel || market.pixelId || phase?.pixel || phase?.pixelId;
    if (!pixelId) {
      errors.push({
        platform: 'Meta',
        market: marketName,
        phase: phaseName,
        entityType: 'adset',
        field: 'pixel',
        fieldPath: 'step1', // Navigate to step 1 platform config
        message: 'Conversion campaign requires a Meta Pixel. Configure pixel in Platform & Market Selection.',
        severity: 'error'
      });
    }
  }
  
  if (calculatedBudget <= 0) {
    errors.push({
      platform: 'Meta',
      market: marketName,
      phase: phaseName,
      entityType: 'adset',
      field: 'budget',
      fieldPath: 'step1',
      message: `Budget is €${calculatedBudget.toFixed(2)}. Increase total budget or market budget percentage.`,
      severity: 'error'
    });
  }
  
  // Check dates
  const startDate = campaign.start_date;
  const endDate = campaign.end_date;
  if (!startDate || !endDate) {
    errors.push({
      platform: 'Meta',
      market: marketName,
      phase: phaseName,
      entityType: 'adset',
      field: 'dates',
      fieldPath: 'step1', // Navigate to step 1 for dates
      message: 'Start and end dates are required. Set campaign dates in Step 1.',
      severity: 'error'
    });
  } else if (new Date(startDate) >= new Date(endDate)) {
    errors.push({
      platform: 'Meta',
      market: marketName,
      phase: phaseName,
      entityType: 'adset',
      field: 'dates',
      fieldPath: 'step1',
      message: 'End date must be after start date.',
      severity: 'error'
    });
  }
  
  return errors;
}

// Validate TikTok campaign configuration
function validateTikTokCampaign(campaign: any, market: any, phase: any, hasAccessToken: boolean, calculatedBudget: number, entityPhaseName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const marketName = market.name || market.id;
  // Use the consistent entityPhaseName for error matching
  const phaseName = entityPhaseName;
  
  // Check advertiser ID
  const advertiserId = market.adAccountId || market.tiktokAdvertiserId || market.advertiser_id;
  if (!advertiserId) {
    errors.push({
      platform: 'TikTok',
      market: marketName,
      phase: phaseName,
      entityType: 'campaign',
      field: 'advertiserId',
      fieldPath: 'step1',
      message: 'Missing TikTok advertiser ID. Select an advertiser in Platform & Market Selection.',
      severity: 'error'
    });
  }
  
  // Check access token (now checking boolean from Vault lookup)
  if (!hasAccessToken) {
    errors.push({
      platform: 'TikTok',
      market: marketName,
      phase: phaseName,
      entityType: 'campaign',
      field: 'access_token',
      fieldPath: 'connections',
      message: 'TikTok platform not connected or access token expired. Reconnect your TikTok account.',
      severity: 'error'
    });
  }
  
  // Check objective
  const objective = phase?.objective || market?.objective || campaign.objective;
  if (!objective) {
    errors.push({
      platform: 'TikTok',
      market: marketName,
      phase: phaseName,
      entityType: 'campaign',
      field: 'objective',
      fieldPath: 'step3',
      message: 'No campaign objective set. Configure strategy in Step 3.',
      severity: 'error'
    });
  }
  
  // Check conversion campaigns have pixel
  const isConversionCampaign = objective?.includes('CONVERSION') || objective?.includes('SALES') ||
    objective?.includes('LEADS') || phase?.name?.toLowerCase().includes('conversion') ||
    phase?.name?.toLowerCase().includes('intent');
  if (isConversionCampaign) {
    // Check all possible field names for TikTok pixel
    const pixelId = market.tiktokPixel || market.pixel || market.tiktokPixelId || 
                    phase?.tiktokPixel || phase?.pixel || phase?.tiktokPixelId;
    console.log(`TikTok pixel check for ${marketName}/${phaseName}: tiktokPixel=${market.tiktokPixel}, pixel=${market.pixel}, found=${!!pixelId}`);
    if (!pixelId) {
      errors.push({
        platform: 'TikTok',
        market: marketName,
        phase: phaseName,
        entityType: 'ad_group',
        field: 'pixel',
        fieldPath: 'step1',
        message: 'Conversion campaign requires a TikTok Pixel. Configure pixel in Platform & Market Selection.',
        severity: 'error'
      });
    }
  }
  
  if (calculatedBudget <= 0) {
    errors.push({
      platform: 'TikTok',
      market: marketName,
      phase: phaseName,
      entityType: 'ad_group',
      field: 'budget',
      fieldPath: 'step1',
      message: `Budget is €${calculatedBudget.toFixed(2)}. Increase total budget or market budget percentage.`,
      severity: 'error'
    });
  }
  
  // Check dates
  const startDate = campaign.start_date;
  const endDate = campaign.end_date;
  if (!startDate || !endDate) {
    errors.push({
      platform: 'TikTok',
      market: marketName,
      phase: phaseName,
      entityType: 'ad_group',
      field: 'dates',
      fieldPath: 'step1',
      message: 'Start and end dates are required. Set campaign dates in Step 1.',
      severity: 'error'
    });
  }
  
  return errors;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { campaignId } = await req.json();

    // Get campaign data
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError) throw campaignError;

    const campaignOwnerId = campaign.user_id as string;

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

    if (!canAccess && campaign.team_id) {
      const { data: teamRow } = await supabase
        .from("teams")
        .select("owner_id, workspace_id")
        .eq("id", campaign.team_id)
        .maybeSingle();

      if (teamRow?.owner_id === user.id) {
        canAccess = true;
      } else if (teamRow?.workspace_id) {
        const { data: subMember } = await supabase
          .from("workspace_subscription_members")
          .select("user_id")
          .eq("workspace_id", teamRow.workspace_id)
          .eq("user_id", user.id)
          .maybeSingle();
        canAccess = !!subMember;
      }
    }

    if (!canAccess) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      entities: []
    };

    const marketSplits = campaign.market_splits || {};
    const campaignPlatforms = campaign.platforms || [];
    const totalBudget = campaign.total_budget || 0;
    
    console.log('Validating campaign:', campaign.name);
    console.log('Total budget:', totalBudget);
    console.log('Market splits keys:', Object.keys(marketSplits));

    if (isBelowActiPlanMinimumBudget(totalBudget)) {
      result.errors.push({
        platform: 'ActiPlan',
        market: '',
        phase: '',
        entityType: 'campaign',
        field: 'budget',
        fieldPath: 'step1',
        message: formatMinimumBudgetMessage('Activation total budget', totalBudget),
        severity: 'error',
      });
    }
    
    for (const [platformId, markets] of Object.entries(marketSplits)) {
      const campaignPlatform = campaignPlatforms.find((p: any) => p.id === platformId);
      if (!campaignPlatform) {
        console.log('Platform not found in campaign platforms:', platformId);
        continue;
      }
      
      const platformName = campaignPlatform.name;
      const platformBudgetPct = campaignPlatform.budgetPercentage || 100;
      const isMetaPlatform = platformName.includes("Meta") || platformName.includes("Facebook");
      const isTikTokPlatform = platformName.toLowerCase().includes("tiktok");

      for (const market of (markets as any[])) {
        const marketBudgetPct = market.budgetPercentage || 100;
        const calculatedBudget = calculateBudget(totalBudget, platformBudgetPct, marketBudgetPct);

        let hasAccessToken = false;
        if (isMetaPlatform) {
          const adAccountId = market.adAccountId || market.ad_account_id;
          hasAccessToken = await resolveHasActivePlatformToken(
            supabase,
            user.id,
            "meta",
            adAccountId ? String(adAccountId) : undefined,
            campaign.team_id,
          );
        } else if (isTikTokPlatform) {
          const advertiserId = market.adAccountId || market.tiktokAdvertiserId || market.advertiser_id;
          hasAccessToken = await resolveHasActivePlatformToken(
            supabase,
            user.id,
            "tiktok",
            advertiserId ? String(advertiserId) : undefined,
            campaign.team_id,
          );
        }

        console.log(
          `Market ${market.name} (${platformName}): hasAccessToken=${hasAccessToken}, team_id=${campaign.team_id ?? "none"}`,
        );
        
        console.log(`Market ${market.name}: budgetPct=${marketBudgetPct}, calculated budget=€${calculatedBudget.toFixed(2)}`);
        
        // Get phases from market, or create a default phase if none exist
        const phases = (market.phases && market.phases.length > 0) 
          ? market.phases 
          : [{ name: 'Default', budgetPercentage: 100 }];
        
        for (const phase of phases) {
          const phaseBudgetPct = phase.budgetPercentage || 100;
          const phaseBudget = (calculatedBudget * phaseBudgetPct) / 100;
          
          // Create consistent entity phase name for matching
          const entityPhaseName = phase.name || 'Default';
          const entityMarketName = market.name || market.id;

          if (isBelowActiPlanMinimumBudget(phaseBudget)) {
            result.errors.push({
              platform: platformName,
              market: entityMarketName,
              phase: entityPhaseName,
              entityType: 'campaign',
              field: 'budget',
              fieldPath: 'step3',
              message: formatMinimumBudgetMessage(`Phase "${entityPhaseName}"`, phaseBudget),
              severity: 'error',
            });
          }
          
          let validationErrors: ValidationError[] = [];
          
          if (isMetaPlatform) {
            validationErrors = validateMetaCampaign(campaign, market, phase, hasAccessToken, phaseBudget, entityPhaseName);
          } else if (isTikTokPlatform) {
            validationErrors = validateTikTokCampaign(campaign, market, phase, hasAccessToken, phaseBudget, entityPhaseName);
          } else {
            // Unsupported platform warning
            validationErrors.push({
              platform: platformName,
              market: entityMarketName,
              phase: entityPhaseName,
              entityType: 'campaign',
              message: `Platform ${platformName} push is not yet supported`,
              severity: 'warning'
            });
          }
          
          // Log actual errors generated
          if (validationErrors.length > 0) {
            console.log(`Phase ${entityPhaseName} in market ${entityMarketName} generated ${validationErrors.length} validation issues:`, 
              JSON.stringify(validationErrors.map(e => ({ message: e.message, field: e.field, severity: e.severity }))));
          }
          
          // Separate errors and warnings
          result.errors.push(...validationErrors.filter(e => e.severity === 'error'));
          result.warnings.push(...validationErrors.filter(e => e.severity === 'warning'));
          
          // Calculate planned metrics from forecast if available
          // Structure: forecast_data.actiplanForecast.platforms[].markets[].phases[]
          const actiplanForecast = campaign.forecast_data?.actiplanForecast || {};
          const platformForecasts = actiplanForecast.platforms || [];
          
          // Find the matching platform forecast
          const platformForecast = platformForecasts.find((pf: any) => 
            pf.platformName?.toLowerCase().includes(platformName.toLowerCase()) ||
            pf.platformId === platformId
          );
          
          // Find the matching market within the platform
          const marketForecast = platformForecast?.markets?.find((mf: any) => 
            mf.marketName === entityMarketName || mf.market === entityMarketName
          );
          
          // Find the matching phase within the market
          const phaseForecast = marketForecast?.phases?.find((pf: any) => 
            pf.phaseName === entityPhaseName || pf.name === entityPhaseName
          );
          
          const genericConfig = (campaign as any).generic_config || {};
          const targetingPreset = genericConfig.targetingPreset || genericConfig.basicTargeting || {};
          const selectedKeywords = Array.isArray(targetingPreset.selectedKeywords)
            ? targetingPreset.selectedKeywords
            : (Array.isArray(genericConfig.selectedKeywords) ? genericConfig.selectedKeywords : []);

          // Get metrics from phase forecast, or fall back to market level
          const plannedImpressions = phaseForecast?.impressions || 
            (marketForecast?.impressions ? Math.round(marketForecast.impressions * (phaseBudgetPct / 100)) : null);
          const plannedReach = phaseForecast?.reach || phaseForecast?.result || 
            (marketForecast?.reach ? Math.round(marketForecast.reach * (phaseBudgetPct / 100)) : null);
          const plannedClicks = phaseForecast?.clicks || 
            (marketForecast?.impressions && phaseForecast?.resultRate ? 
              Math.round(marketForecast.impressions * (phaseBudgetPct / 100) * (phaseForecast.resultRate / 100)) : null);
          const plannedConversions = phaseForecast?.conversions || phaseForecast?.result || null;
          
          const effectiveSearchKeywords = getEffectiveSearchKeywords({
            keywords: selectedKeywords,
            platformId,
            market,
            phase,
          });

          const strategyCampaigns = isSearchPhaseLike({ platformId, phase })
            ? buildSearchStrategyCampaigns({
                keywords: effectiveSearchKeywords,
                platformId,
                market,
                phaseName: entityPhaseName,
                phaseBudget,
                phaseImpressions: plannedImpressions,
                phaseReach: plannedReach,
                phaseResult: phaseForecast?.result ?? plannedConversions,
              })
            : [];

          const campaignUnits = strategyCampaigns.length > 0
            ? strategyCampaigns.map((strategyCampaign) => ({
                name: strategyCampaign.campaignName,
                budget: strategyCampaign.budget,
                impressions: strategyCampaign.impressions ?? plannedImpressions,
                reach: strategyCampaign.reach ?? plannedReach,
                clicks: strategyCampaign.result ?? plannedClicks,
                conversions: strategyCampaign.result ?? plannedConversions,
              }))
            : [{
                name: entityPhaseName,
                budget: phaseBudget,
                impressions: plannedImpressions,
                reach: plannedReach,
                clicks: plannedClicks,
                conversions: plannedConversions,
              }];

          for (const unit of campaignUnits) {
            if (isBelowActiPlanMinimumBudget(unit.budget)) {
              result.errors.push({
                platform: platformName,
                market: entityMarketName,
                phase: entityPhaseName,
                entityType: 'campaign',
                field: 'budget',
                fieldPath: 'step3',
                message: formatMinimumBudgetMessage(`Campaign "${unit.name}"`, unit.budget),
                severity: 'error',
              });
            }

            result.entities.push({
              platform: platformName,
              market: entityMarketName,
              phase: entityPhaseName,
              entityType: 'campaign',
              entityName: `${campaign.name} - ${entityMarketName} - ${unit.name}`,
              plannedBudget: unit.budget,
              plannedImpressions: unit.impressions,
              plannedReach: unit.reach,
              plannedClicks: unit.clicks,
              plannedConversions: unit.conversions,
            });
          }
          
          // Determine ad set splits for this phase.
          // Priority: phase.adSets -> market.adSets -> campaign generic defaults (per platform) -> none.
          const phaseAdSets = (phase as any).adSets as any[] | undefined;
          const marketAdSets = (market as any).adSets as any[] | undefined;
          const defaultAdSetsPerPlatform =
            targetingPreset.defaultAdSetsPerPlatform || genericConfig.defaultAdSetsPerPlatform || {};
          const defaultPlatformAdSets = defaultAdSetsPerPlatform?.[platformId] as any[] | undefined;

          const effectiveAdSets =
            (phaseAdSets && phaseAdSets.length > 0 ? phaseAdSets : undefined) ||
            (marketAdSets && marketAdSets.length > 0 ? marketAdSets : undefined) ||
            (defaultPlatformAdSets && defaultPlatformAdSets.length > 0 ? defaultPlatformAdSets : undefined);

          // Search strategy campaigns can still create multiple ad groups/ad sets
          // (for example per-language splits), so planning must mirror the real push
          // structure instead of collapsing them into a single generic "Ad Set" row.
          const hasAdSetSplits = !!effectiveAdSets;

          if (hasAdSetSplits) {
            // Create an entity for each ad set split
            console.log(`Phase ${entityPhaseName} has ${effectiveAdSets!.length} ad set splits`);
            for (const unit of campaignUnits) {
              for (const adSet of effectiveAdSets!) {
                const adSetBudgetPct = adSet.budgetPercentage || (100 / effectiveAdSets!.length);
                const adSetBudget = calculateAdSetBudgetEur(unit.budget, adSetBudgetPct);
                const adSetName = adSet.name || `Ad Set ${adSet.id?.substring(0, 6) || 'Unknown'}`;

                if (isBelowActiPlanMinimumBudget(adSetBudget)) {
                  result.errors.push({
                    platform: platformName,
                    market: entityMarketName,
                    phase: entityPhaseName,
                    entityType: 'adset',
                    field: 'budget',
                    fieldPath: 'step3',
                    message: formatMinimumBudgetMessage(`Ad set "${adSetName}"`, adSetBudget),
                    severity: 'error',
                  });
                }

                // Calculate proportional metrics for this ad set
                const adSetImpressions = unit.impressions ? Math.round(unit.impressions * (adSetBudgetPct / 100)) : null;
                const adSetReach = unit.reach ? Math.round(unit.reach * (adSetBudgetPct / 100)) : null;
                const adSetClicks = unit.clicks ? Math.round(unit.clicks * (adSetBudgetPct / 100)) : null;
                const adSetConversions = unit.conversions ? Math.round(unit.conversions * (adSetBudgetPct / 100)) : null;

                result.entities.push({
                  platform: platformName,
                  market: entityMarketName,
                  phase: entityPhaseName,
                  entityType: 'adset',
                  entityName: `${campaign.name} - ${entityMarketName} - ${unit.name} - ${adSetName}`,
                  plannedBudget: adSetBudget,
                  plannedImpressions: adSetImpressions,
                  plannedReach: adSetReach,
                  plannedClicks: adSetClicks,
                  plannedConversions: adSetConversions,
                });
              }
            }
          } else {
            // No ad set splits - create a single generic ad set entity
            for (const unit of campaignUnits) {
              if (isBelowActiPlanMinimumBudget(unit.budget)) {
                result.errors.push({
                  platform: platformName,
                  market: entityMarketName,
                  phase: entityPhaseName,
                  entityType: 'adset',
                  field: 'budget',
                  fieldPath: 'step3',
                  message: formatMinimumBudgetMessage(`Ad set for "${unit.name}"`, unit.budget),
                  severity: 'error',
                });
              }

              result.entities.push({
                platform: platformName,
                market: entityMarketName,
                phase: entityPhaseName,
                entityType: 'adset',
                entityName: `${campaign.name} - ${entityMarketName} - ${unit.name} - Ad Set`,
                plannedBudget: unit.budget,
                plannedImpressions: unit.impressions,
                plannedReach: unit.reach,
                plannedClicks: unit.clicks,
                plannedConversions: unit.conversions,
              });
            }
          }
        }
      }
    }

    result.valid = result.errors.length === 0;

    // Get existing launch statuses to preserve pushed_to_dsp entities
    const { data: existingStatuses } = await supabase
      .from('campaign_launch_status')
      .select('id, platform, market, phase_name, entity_type, entity_name, status, dsp_entity_id')
      .eq('campaign_id', campaignId);
    
    // Create a map of already-pushed entities (entities with dsp_entity_id should be preserved)
    // Include entity_type + entity_name in key to support multiple ad sets per phase.
    const pushedEntitiesMap = new Map<string, { id: string; status: string; dsp_entity_id: string }>();
    for (const status of (existingStatuses || [])) {
      // Only preserve entities that are successfully pushed (have DSP ID)
      if (status.dsp_entity_id && ['pushed_to_dsp', 'live'].includes(status.status)) {
        const key = `${status.platform}|${status.market}|${status.phase_name || 'Default'}|${status.entity_type}|${status.entity_name || ''}`;
        pushedEntitiesMap.set(key, {
          id: status.id,
          status: status.status,
          dsp_entity_id: status.dsp_entity_id,
        });
      }
    }

    console.log(`Preserving ${pushedEntitiesMap.size} already-pushed entities`);

    // Only delete non-pushed entities (validation_error, ready_for_push, push_failed, pushing)
    await supabase
      .from('campaign_launch_status')
      .delete()
      .eq('campaign_id', campaignId)
      .not('status', 'in', '("pushed_to_dsp","live")');

    // Insert new status entries only for entities NOT already pushed
    const statusEntries = result.entities
      .filter(entity => {
        const key = `${entity.platform}|${entity.market}|${entity.phase || 'Default'}|${entity.entityType}|${entity.entityName}`;
        return !pushedEntitiesMap.has(key);
      })
      .map(entity => {
      // Match errors by platform, market, and phase (handle undefined/null phase)
      const entityErrors = result.errors.filter(e => {
        const platformMatch = e.platform === entity.platform;
        const marketMatch = e.market === entity.market;
        // Phase matching: handle undefined/null phases
        const errorPhase = e.phase || 'Default';
        const entPhase = entity.phase || 'Default';
        const phaseMatch = errorPhase === entPhase;
        return platformMatch && marketMatch && phaseMatch;
      });
      
      console.log(`Entity ${entity.entityName}: Found ${entityErrors.length} matching errors`);
      if (entityErrors.length > 0) {
        console.log('Matching errors:', JSON.stringify(entityErrors));
      }
      
      // Determine status based on whether THIS entity has errors
      const hasErrors = entityErrors.length > 0;
      
      return {
        campaign_id: campaignId,
        platform: entity.platform,
        market: entity.market,
        phase_name: entity.phase,
        entity_type: entity.entityType,
        entity_name: entity.entityName,
        status: hasErrors ? 'validation_error' : 'ready_for_push',
        error_message: hasErrors ? entityErrors[0].message : null,
        error_details: hasErrors ? entityErrors.map(e => ({
          message: e.message,
          field: e.field,
          fieldPath: e.fieldPath,
          severity: e.severity
        })) : [],
        planned_budget: entity.plannedBudget,
        planned_impressions: entity.plannedImpressions,
        planned_reach: entity.plannedReach,
        planned_clicks: entity.plannedClicks,
        planned_conversions: entity.plannedConversions,
      };
    });

    console.log('Status entries to insert:', JSON.stringify(statusEntries.map(s => ({
      name: s.entity_name,
      status: s.status,
      errorCount: s.error_details?.length || 0
    }))));

    if (statusEntries.length > 0) {
      const { error: insertError } = await supabase
        .from('campaign_launch_status')
        .insert(statusEntries);
      
      if (insertError) {
        console.error('Error inserting launch status:', insertError);
      }
    }

    // Update campaign status based on validation result
    if (result.valid) {
      await supabase
        .from('campaigns')
        .update({ status: 'ready_for_push' })
        .eq('id', campaignId);
    }

    console.log(`Validation complete for campaign ${campaignId}: ${result.valid ? 'PASSED' : 'FAILED'}`);
    console.log(`Errors: ${result.errors.length}, Warnings: ${result.warnings.length}`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Validation error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
