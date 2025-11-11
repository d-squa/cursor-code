import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { campaignId } = await req.json();

    // Get campaign data
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError) throw campaignError;

    console.log("Pushing campaign to DSP:", campaign.name);

    // Get user's connected platforms
    const { data: platforms, error: platformsError } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", campaign.user_id)
      .eq("is_active", true);

    if (platformsError) throw platformsError;

    const results = [];

    // Process each platform in the campaign
    // Extract platform configurations from market_splits
    const marketSplits = campaign.market_splits || {};
    
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

      // Create platform config structure
      const platformConfig = {
        id: platformId,
        name: platformName,
        budgetPercentage: platformBudgetPercentage,
        markets: markets
      };

      if (platformName.includes('Meta') || platformName.includes('Facebook')) {
        const result = await pushToMeta(campaign, platformConfig, platform);
        results.push(result);
      } else if (platformName.includes('Google')) {
        const result = await pushToGoogleAds(campaign, platformConfig, platform);
        results.push(result);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
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
function getMetaObjectiveFromPhase(phaseName: string, strategyFocus?: string): { objective: string; optimizationGoal: string } {
  const lowerPhaseName = phaseName.toLowerCase();
  
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
  
  if (lowerPhaseName.includes('conversion') || lowerPhaseName.includes('purchase') || lowerPhaseName.includes('sales')) {
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

async function pushToMeta(campaign: any, platformConfig: any, platform: any) {
  console.log("Pushing to Meta...");
  
  const results = [];
  const errors = [];
  
  // Extract markets from the correct structure
  const markets = platformConfig.markets || [];
  
  for (const market of markets) {
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
        // Map phase objective to valid Meta objective
        let objective = phase.objective || market.objective || campaign.objective || "OUTCOME_TRAFFIC";
        let optimizationGoal = phase.optimizationGoal || market.optimizationGoal || "LINK_CLICKS";
        
        // If objective is "auto" or invalid, map from phase name
        const validObjectives = ['APP_INSTALLS', 'BRAND_AWARENESS', 'EVENT_RESPONSES', 'LEAD_GENERATION', 
          'LINK_CLICKS', 'LOCAL_AWARENESS', 'MESSAGES', 'OFFER_CLAIMS', 'PAGE_LIKES', 'POST_ENGAGEMENT', 
          'PRODUCT_CATALOG_SALES', 'REACH', 'STORE_VISITS', 'VIDEO_VIEWS', 'OUTCOME_AWARENESS', 
          'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_APP_PROMOTION', 'CONVERSIONS'];
        
        if (!validObjectives.includes(objective)) {
          const mapped = getMetaObjectiveFromPhase(phase.name, market.strategyFocus || campaign.strategy_focus);
          objective = mapped.objective;
          optimizationGoal = mapped.optimizationGoal;
          console.log(`Mapped phase "${phase.name}" to objective: ${objective}, optimization goal: ${optimizationGoal}`);
        }
        
        // Create campaign
        const campaignPayload = {
          name: `${campaign.name} - ${market.name}${phases.length > 1 ? ` - ${phase.name}` : ''}`,
          objective: objective,
          status: "PAUSED",
          special_ad_categories: [],
        };

        console.log("Creating Meta campaign:", campaignPayload);

        const campaignResponse = await fetch(
          `https://graph.facebook.com/v22.0/${platform.ad_account_id}/campaigns`,
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
          errors.push({
            market: market.name,
            phase: phase.name,
            error: campaignData.error.message,
            type: 'campaign_creation'
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
        
        // Calculate duration in days
        const startDate = new Date(phase.startDate || campaign.start_date);
        const endDate = new Date(phase.endDate || campaign.end_date);
        const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Determine if lifetime or daily budget
        const isLifetimeBudget = market.isLifetimeBudget || false;
        
        // Build targeting
        const targeting: any = {
          geo_locations: {
            countries: Array.isArray(market.countries) && market.countries.length > 0 
              ? market.countries 
              : [market.name.substring(0, 2).toUpperCase()]
          },
          age_min: market.ageMin || 18,
          age_max: market.ageMax || 65,
        };
        
        // Add gender targeting if specified
        if (market.gender) {
          if (market.gender === "male") {
            targeting.genders = [1];
          } else if (market.gender === "female") {
            targeting.genders = [2];
          }
        }
        
        // Add publisher platforms
        if (market.publisherPlatforms && market.publisherPlatforms.length > 0) {
          targeting.publisher_platforms = market.publisherPlatforms;
        }
        
        // Add placements/positions
        if (market.positions) {
          if (market.positions.facebook && market.positions.facebook.length > 0) {
            targeting.facebook_positions = market.positions.facebook;
          }
          if (market.positions.instagram && market.positions.instagram.length > 0) {
            targeting.instagram_positions = market.positions.instagram;
          }
          if (market.positions.audience_network && market.positions.audience_network.length > 0) {
            targeting.audience_network_positions = market.positions.audience_network;
          }
        }
        
        // Add detailed targeting (interests, behaviors)
        if (market.detailedTargeting && market.detailedTargeting.length > 0) {
          targeting.flexible_spec = market.detailedTargeting.map((t: any) => ({
            [t.type]: [{ id: t.id, name: t.name }]
          }));
        }

        // Create ad set
        const adSetPayload: any = {
          name: `${phase.name} - Ad Set`,
          campaign_id: campaignData.id,
          billing_event: "IMPRESSIONS",
          optimization_goal: optimizationGoal,
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          status: "PAUSED",
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          targeting: targeting,
        };
        
        // Set budget (convert to cents)
        if (isLifetimeBudget) {
          adSetPayload.lifetime_budget = Math.round(phaseBudget * 100);
        } else {
          adSetPayload.daily_budget = Math.round((phaseBudget / durationDays) * 100);
        }

        console.log("Creating Meta ad set:", adSetPayload);

        const adSetResponse = await fetch(
          `https://graph.facebook.com/v22.0/${platform.ad_account_id}/adsets`,
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

        const adSetData = await adSetResponse.json();
        
        if (adSetData.error) {
          console.error("Meta Ad Set Creation Error:", adSetData.error);
          errors.push({
            market: market.name,
            phase: phase.name,
            error: adSetData.error.message,
            type: 'adset_creation',
            campaignId: campaignData.id
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
          budgetType: isLifetimeBudget ? 'lifetime' : 'daily',
        });
      } catch (error: any) {
        console.error(`Error processing market ${market.name}, phase ${phase.name}:`, error);
        errors.push({
          market: market.name,
          phase: phase.name,
          error: error.message,
          type: 'processing_error'
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

serve(handler);
