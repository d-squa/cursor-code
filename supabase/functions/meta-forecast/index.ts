import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('Meta forecast request:', JSON.stringify(body, null, 2));

    const appId = Deno.env.get('META_APP_ID');
    const appSecret = Deno.env.get('META_APP_SECRET');
    const adAccountId = Deno.env.get('META_AD_ACCOUNT_ID');

    if (!appId || !appSecret || !adAccountId) {
      throw new Error('Meta credentials not configured');
    }

    // Get access token
    const tokenResponse = await fetch(
      `https://graph.facebook.com/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`
    );
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token error:', errorText);
      throw new Error(`Failed to get access token: ${errorText}`);
    }

    const { access_token } = await tokenResponse.json();

    // Build targeting spec
    const targetingSpec: any = {
      geo_locations: {},
      age_min: 18,
      age_max: 65,
    };

    // Add geographic targeting
    if (body.markets && body.markets.length > 0) {
      targetingSpec.geo_locations.countries = body.markets;
    }

    // Add gender targeting
    if (body.gender && body.gender !== 'all') {
      targetingSpec.genders = body.gender === 'male' ? [1] : [2];
    }

    // Add age targeting
    if (body.ageMin) targetingSpec.age_min = body.ageMin;
    if (body.ageMax) targetingSpec.age_max = body.ageMax;

    // Build optimization goal mapping
    const optimizationGoalMap: Record<string, string> = {
      'Conversions': 'OFFSITE_CONVERSIONS',
      'Link Clicks': 'LINK_CLICKS',
      'Landing Page Views': 'LANDING_PAGE_VIEWS',
      'Lead Generation': 'LEAD_GENERATION',
      'Impressions': 'IMPRESSIONS',
      'Reach': 'REACH',
    };

    const optimization_goal = optimizationGoalMap[body.objective] || 'LINK_CLICKS';

    // Call Reach Estimate API
    const reachParams = new URLSearchParams({
      access_token,
      targeting_spec: JSON.stringify(targetingSpec),
      optimization_goal,
      currency: body.currency || 'USD',
    });

    console.log('Calling Reach Estimate API with params:', reachParams.toString());

    const reachResponse = await fetch(
      `https://graph.facebook.com/v21.0/act_${adAccountId}/reachestimate?${reachParams.toString()}`
    );

    if (!reachResponse.ok) {
      const errorText = await reachResponse.text();
      console.error('Reach estimate error:', errorText);
      throw new Error(`Reach estimate failed: ${errorText}`);
    }

    const reachData = await reachResponse.json();
    console.log('Reach estimate response:', JSON.stringify(reachData, null, 2));

    // Parse response and calculate metrics
    const estimateData = reachData.data?.[0] || reachData;
    const users = estimateData.users || estimateData.estimate_ready || 0;
    const budget = body.budget || 0;

    // Calculate estimates based on industry benchmarks
    const avgCPM = 10; // $10 CPM average
    const avgCTR = 0.9; // 0.9% CTR average
    const avgConversionRate = 2; // 2% conversion rate average

    const impressions = Math.round((budget / avgCPM) * 1000);
    const reach = Math.min(users, Math.round(impressions * 0.7)); // Reach is typically 70% of impressions
    const clicks = Math.round(impressions * (avgCTR / 100));
    const conversions = Math.round(clicks * (avgConversionRate / 100));

    const forecast = {
      reach,
      impressions,
      clicks,
      conversions,
      cpm: avgCPM,
      cpc: clicks > 0 ? (budget / clicks).toFixed(2) : '0',
      ctr: avgCTR.toFixed(2),
      conversionRate: avgConversionRate.toFixed(2),
      costPerConversion: conversions > 0 ? (budget / conversions).toFixed(2) : '0',
    };

    console.log('Final forecast:', forecast);

    return new Response(JSON.stringify(forecast), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Meta forecast error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check edge function logs for more information'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
