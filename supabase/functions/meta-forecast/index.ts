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

    const accessToken = Deno.env.get('META_ACCESS_TOKEN');
    const adAccountId = Deno.env.get('META_AD_ACCOUNT_ID');

    if (!accessToken || !adAccountId) {
      throw new Error('Meta credentials not configured. Need META_ACCESS_TOKEN and META_AD_ACCOUNT_ID');
    }

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

    // Map strategy focus to Meta optimization goals
    const strategyFocusMap: Record<string, { goal: string; metric: string; metricName: string }> = {
      'purchase': { goal: 'OFFSITE_CONVERSIONS', metric: 'conversions', metricName: 'Conversions' },
      'leads': { goal: 'LEAD_GENERATION', metric: 'leads', metricName: 'Leads' },
      'app-installs': { goal: 'APP_INSTALLS', metric: 'app_installs', metricName: 'App Installs' },
      'conversions': { goal: 'OFFSITE_CONVERSIONS', metric: 'conversions', metricName: 'Conversions' },
      'brand-awareness': { goal: 'REACH', metric: 'reach', metricName: 'Reach' },
      'traffic': { goal: 'LINK_CLICKS', metric: 'clicks', metricName: 'Link Clicks' },
    };

    const strategyConfig = strategyFocusMap[body.strategyFocus] || strategyFocusMap['conversions'];
    const optimization_goal = strategyConfig.goal;

    // Call Reach Estimate API
    const reachParams = new URLSearchParams({
      access_token: accessToken,
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
      
      // Parse error to provide better messages
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.code === 200 && errorData.error?.message?.includes('NOT grant ads_management or ads_read permission')) {
          throw new Error('PERMISSION_ERROR: Meta access token does not have ads_read permission. Please generate a user access token with ads_read permission from the Meta Business Suite.');
        }
      } catch (parseErr) {
        // If we can't parse, continue with generic error
      }
      
      throw new Error(`Reach estimate failed: ${errorText}`);
    }

    const reachData = await reachResponse.json();
    console.log('Reach estimate response:', JSON.stringify(reachData, null, 2));

    // Parse response and calculate metrics
    const estimateData = reachData.data?.[0] || reachData;
    const users = estimateData.users || estimateData.estimate_ready || 0;
    const budget = body.budget || 0;

    // Calculate estimates based on industry benchmarks and optimization goal
    const avgCPM = 10; // $10 CPM average
    const avgCTR = 0.9; // 0.9% CTR average
    
    const impressions = Math.round((budget / avgCPM) * 1000);
    const reach = Math.min(users, Math.round(impressions * 0.7)); // Reach is typically 70% of impressions
    const clicks = Math.round(impressions * (avgCTR / 100));
    
    // Calculate results based on optimization goal
    let results = 0;
    let resultRate = 0;
    
    if (strategyConfig.metric === 'reach') {
      results = reach;
      resultRate = (reach / impressions) * 100;
    } else if (strategyConfig.metric === 'clicks') {
      results = clicks;
      resultRate = avgCTR;
    } else if (strategyConfig.metric === 'leads') {
      const leadRate = 3; // 3% lead rate for lead gen campaigns
      results = Math.round(clicks * (leadRate / 100));
      resultRate = leadRate;
    } else if (strategyConfig.metric === 'app_installs') {
      const installRate = 4; // 4% install rate for app campaigns
      results = Math.round(clicks * (installRate / 100));
      resultRate = installRate;
    } else { // conversions
      const conversionRate = 2; // 2% conversion rate average
      results = Math.round(clicks * (conversionRate / 100));
      resultRate = conversionRate;
    }

    const forecast = {
      reach,
      impressions,
      clicks,
      conversions: results,
      resultMetric: strategyConfig.metricName,
      cpm: avgCPM,
      cpc: clicks > 0 ? (budget / clicks).toFixed(2) : '0',
      ctr: avgCTR.toFixed(2),
      conversionRate: resultRate.toFixed(2),
      costPerConversion: results > 0 ? (budget / results).toFixed(2) : '0',
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
