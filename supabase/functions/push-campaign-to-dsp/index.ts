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
    const campaignPlatforms = campaign.platforms || [];
    
    for (const platformConfig of campaignPlatforms) {
      const platform = platforms.find(p => p.platform_type === platformConfig.name);
      
      if (!platform) {
        console.warn(`Platform ${platformConfig.name} not connected`);
        continue;
      }

      if (platformConfig.name === "Meta") {
        const result = await pushToMeta(campaign, platformConfig, platform);
        results.push(result);
      } else if (platformConfig.name === "Google Ads") {
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

async function pushToMeta(campaign: any, platformConfig: any, platform: any) {
  console.log("Pushing to Meta...");
  
  const results = [];
  
  for (const market of platformConfig.markets || []) {
    for (const phase of market.phases || []) {
      // Create campaign
      const campaignPayload = {
        name: `${campaign.name} - ${market.name} - ${phase.name}`,
        objective: phase.objective || "OUTCOME_AWARENESS",
        status: "PAUSED",
        special_ad_categories: [],
      };

      const campaignResponse = await fetch(
        `https://graph.facebook.com/v21.0/${platform.ad_account_id}/campaigns`,
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
        throw new Error(`Meta API Error: ${campaignData.error.message}`);
      }

      console.log("Meta campaign created:", campaignData.id);

      // Create ad set
      const adSetPayload = {
        name: `${phase.name} - Ad Set`,
        campaign_id: campaignData.id,
        daily_budget: Math.round((campaign.total_budget * (platformConfig.budgetPercentage / 100) * (market.budgetPercentage / 100) * (phase.budgetPercentage / 100)) / 30),
        billing_event: "IMPRESSIONS",
        optimization_goal: phase.optimizationGoal || "REACH",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        status: "PAUSED",
        start_time: new Date(campaign.start_date).toISOString(),
        end_time: new Date(campaign.end_date).toISOString(),
        targeting: {
          geo_locations: {
            countries: market.countries || ["US"],
          },
          age_min: market.ageMin || 18,
          age_max: market.ageMax || 65,
          genders: market.gender === "male" ? [1] : market.gender === "female" ? [2] : [0],
          publisher_platforms: market.publisherPlatforms || ["facebook", "instagram"],
          facebook_positions: market.positions?.facebook || ["feed"],
          instagram_positions: market.positions?.instagram || ["stream"],
        },
      };

      const adSetResponse = await fetch(
        `https://graph.facebook.com/v21.0/${platform.ad_account_id}/adsets`,
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
        throw new Error(`Meta API Error: ${adSetData.error.message}`);
      }

      console.log("Meta ad set created:", adSetData.id);

      results.push({
        platform: "Meta",
        market: market.name,
        phase: phase.name,
        campaignId: campaignData.id,
        adSetId: adSetData.id,
      });
    }
  }

  return { platform: "Meta", results };
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
