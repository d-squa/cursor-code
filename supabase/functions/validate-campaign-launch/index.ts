import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

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
    plannedImpressions?: number;
    plannedReach?: number;
  }[];
}

// Validate Meta campaign configuration
function validateMetaCampaign(campaign: any, market: any, phase: any, platform: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Check ad account
  const adAccountId = market.adAccountId || market.ad_account_id || platform?.ad_account_id;
  if (!adAccountId) {
    errors.push({
      platform: 'Meta',
      market: market.name,
      phase: phase?.name,
      entityType: 'campaign',
      field: 'adAccountId',
      message: 'Missing Meta ad account ID',
      severity: 'error'
    });
  }
  
  // Check access token
  if (!platform?.access_token) {
    errors.push({
      platform: 'Meta',
      market: market.name,
      phase: phase?.name,
      entityType: 'campaign',
      field: 'access_token',
      message: 'Meta platform not connected or access token expired',
      severity: 'error'
    });
  }
  
  // Check objective
  const validObjectives = ['OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 
    'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_APP_PROMOTION'];
  const objective = phase?.objective || market?.objective || campaign.objective;
  if (objective && !validObjectives.includes(objective) && !objective.startsWith('OUTCOME_')) {
    errors.push({
      platform: 'Meta',
      market: market.name,
      phase: phase?.name,
      entityType: 'campaign',
      field: 'objective',
      message: `Invalid objective: ${objective}`,
      severity: 'warning' // Warning because we can map it
    });
  }
  
  // Check conversion campaigns have pixel
  const isConversionCampaign = objective?.includes('SALES') || objective?.includes('LEADS') || 
    phase?.name?.toLowerCase().includes('conversion');
  if (isConversionCampaign) {
    const pixelId = market.pixelId || phase?.pixelId;
    if (!pixelId) {
      errors.push({
        platform: 'Meta',
        market: market.name,
        phase: phase?.name,
        entityType: 'adset',
        field: 'pixelId',
        message: 'Conversion campaign requires a Meta Pixel',
        severity: 'error'
      });
    }
  }
  
  // Check budget
  const budget = phase?.budget || market?.budget || 0;
  if (budget <= 0) {
    errors.push({
      platform: 'Meta',
      market: market.name,
      phase: phase?.name,
      entityType: 'adset',
      field: 'budget',
      message: 'Budget must be greater than 0',
      severity: 'error'
    });
  }
  
  // Check dates
  const startDate = phase?.startDate || campaign.start_date;
  const endDate = phase?.endDate || campaign.end_date;
  if (!startDate || !endDate) {
    errors.push({
      platform: 'Meta',
      market: market.name,
      phase: phase?.name,
      entityType: 'adset',
      field: 'dates',
      message: 'Start and end dates are required',
      severity: 'error'
    });
  } else if (new Date(startDate) >= new Date(endDate)) {
    errors.push({
      platform: 'Meta',
      market: market.name,
      phase: phase?.name,
      entityType: 'adset',
      field: 'dates',
      message: 'End date must be after start date',
      severity: 'error'
    });
  }
  
  return errors;
}

// Validate TikTok campaign configuration
function validateTikTokCampaign(campaign: any, market: any, phase: any, platform: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Check advertiser ID
  const advertiserId = market.tiktokAdvertiserId || market.advertiser_id;
  if (!advertiserId) {
    errors.push({
      platform: 'TikTok',
      market: market.name,
      phase: phase?.name,
      entityType: 'campaign',
      field: 'advertiserId',
      message: 'Missing TikTok advertiser ID',
      severity: 'error'
    });
  }
  
  // Check access token
  if (!platform?.access_token) {
    errors.push({
      platform: 'TikTok',
      market: market.name,
      phase: phase?.name,
      entityType: 'campaign',
      field: 'access_token',
      message: 'TikTok platform not connected or access token expired',
      severity: 'error'
    });
  }
  
  // Check objective mapping
  const objective = phase?.objective || market?.objective || campaign.objective;
  const validTikTokObjectives = ['REACH', 'TRAFFIC', 'VIDEO_VIEWS', 'LEAD_GENERATION', 
    'CONVERSIONS', 'APP_INSTALLS', 'CATALOG_SALES', 'WEB_CONVERSIONS', 'APP_PROMOTION', 'PRODUCT_SALES'];
  
  // TikTok requires specific objectives
  if (objective && objective.startsWith('OUTCOME_')) {
    // Will need mapping - this is a warning
    errors.push({
      platform: 'TikTok',
      market: market.name,
      phase: phase?.name,
      entityType: 'campaign',
      field: 'objective',
      message: `Objective ${objective} will be mapped to TikTok equivalent`,
      severity: 'warning'
    });
  }
  
  // Check conversion campaigns have pixel
  const isConversionCampaign = objective?.includes('CONVERSION') || objective?.includes('SALES') ||
    phase?.name?.toLowerCase().includes('conversion');
  if (isConversionCampaign) {
    const pixelId = market.tiktokPixelId || phase?.tiktokPixelId;
    if (!pixelId) {
      errors.push({
        platform: 'TikTok',
        market: market.name,
        phase: phase?.name,
        entityType: 'ad_group',
        field: 'pixelId',
        message: 'Conversion campaign requires a TikTok Pixel',
        severity: 'error'
      });
    }
  }
  
  // Check budget (TikTok has minimum budget requirements)
  const budget = phase?.budget || market?.budget || 0;
  if (budget <= 0) {
    errors.push({
      platform: 'TikTok',
      market: market.name,
      phase: phase?.name,
      entityType: 'ad_group',
      field: 'budget',
      message: 'Budget must be greater than 0',
      severity: 'error'
    });
  } else if (budget < 20) {
    errors.push({
      platform: 'TikTok',
      market: market.name,
      phase: phase?.name,
      entityType: 'ad_group',
      field: 'budget',
      message: 'TikTok requires minimum daily budget of $20',
      severity: 'warning'
    });
  }
  
  // Check dates
  const startDate = phase?.startDate || campaign.start_date;
  const endDate = phase?.endDate || campaign.end_date;
  if (!startDate || !endDate) {
    errors.push({
      platform: 'TikTok',
      market: market.name,
      phase: phase?.name,
      entityType: 'ad_group',
      field: 'dates',
      message: 'Start and end dates are required',
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

    if (campaign.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get connected platforms
    const { data: platforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      entities: []
    };

    const marketSplits = campaign.market_splits || {};
    
    for (const [platformId, markets] of Object.entries(marketSplits)) {
      const campaignPlatform = (campaign.platforms || []).find((p: any) => p.id === platformId);
      if (!campaignPlatform) continue;
      
      const platformName = campaignPlatform.name;
      const connectedPlatform = platforms?.find(p => 
        p.platform_type.toLowerCase() === platformName.toLowerCase() || 
        (platformName.includes('Meta') && p.platform_type === 'meta') ||
        (platformName.toLowerCase().includes('tiktok') && p.platform_type === 'tiktok')
      );

      for (const market of (markets as any[])) {
        const phases = market.phases || [{ name: 'Default', budget: market.budget }];
        
        for (const phase of phases) {
          let validationErrors: ValidationError[] = [];
          
          if (platformName.includes('Meta') || platformName.includes('Facebook')) {
            validationErrors = validateMetaCampaign(campaign, market, phase, connectedPlatform);
          } else if (platformName.toLowerCase().includes('tiktok')) {
            validationErrors = validateTikTokCampaign(campaign, market, phase, connectedPlatform);
          } else {
            // Unsupported platform warning
            validationErrors.push({
              platform: platformName,
              market: market.name,
              phase: phase.name,
              entityType: 'campaign',
              message: `Platform ${platformName} push is not yet supported`,
              severity: 'warning'
            });
          }
          
          // Separate errors and warnings
          result.errors.push(...validationErrors.filter(e => e.severity === 'error'));
          result.warnings.push(...validationErrors.filter(e => e.severity === 'warning'));
          
          // Calculate planned metrics from forecast if available
          const forecastData = campaign.forecast_data?.actiplanForecast || {};
          const platformForecast = forecastData[platformId] || {};
          
          // Add entity to list
          result.entities.push({
            platform: platformName,
            market: market.name,
            phase: phase.name || 'Default',
            entityType: 'campaign',
            entityName: `${campaign.name} - ${market.name} - ${phase.name || 'Default'}`,
            plannedBudget: phase.budget || market.budget || 0,
            plannedImpressions: platformForecast.impressions,
            plannedReach: platformForecast.reach,
          });
        }
      }
    }

    result.valid = result.errors.length === 0;

    // Clear any existing launch status and create new entries
    await supabase
      .from('campaign_launch_status')
      .delete()
      .eq('campaign_id', campaignId);

    // Insert new status entries for each entity
    const statusEntries = result.entities.map(entity => ({
      campaign_id: campaignId,
      platform: entity.platform,
      market: entity.market,
      phase_name: entity.phase,
      entity_type: entity.entityType,
      entity_name: entity.entityName,
      status: result.valid ? 'ready_for_push' : 'validation_error',
      error_message: result.errors.find(e => 
        e.platform === entity.platform && 
        e.market === entity.market && 
        e.phase === entity.phase
      )?.message || null,
      planned_budget: entity.plannedBudget,
      planned_impressions: entity.plannedImpressions,
      planned_reach: entity.plannedReach,
    }));

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
