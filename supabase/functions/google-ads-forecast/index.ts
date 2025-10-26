import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ForecastRequest {
  customerId: string;
  locationId: string;
  currencyCode: string;
  budget: number;
  campaignDuration: {
    startDate: string;
    endDate: string;
  };
  targeting: {
    ageRange: string;
    gender: string;
  };
  adProducts: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting Google Ads forecast request");

    // Get OAuth credentials from environment
    const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN');
    const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');

    if (!clientId || !clientSecret || !refreshToken || !developerToken) {
      throw new Error('Missing required Google Ads credentials');
    }

    console.log("Credentials loaded successfully");

    // Get request body or use defaults
    const body: ForecastRequest = await req.json().catch(() => ({
      customerId: "7262510539",
      locationId: "2840",
      currencyCode: "USD",
      budget: 50000,
      campaignDuration: {
        startDate: "2025-11-01",
        endDate: "2025-12-31"
      },
      targeting: {
        ageRange: "18-24",
        gender: "Female"
      },
      adProducts: ["BUMPER", "SKIPPABLE_IN_STREAM"]
    }));

    console.log("Request parameters:", JSON.stringify(body, null, 2));

    // Step 1: Get access token using refresh token
    console.log("Requesting OAuth access token...");
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token request failed:", tokenResponse.status, errorText);
      throw new Error(`Failed to get access token: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log("Access token obtained successfully");

    // Step 2: Call Google Ads API ReachPlanService
    // Format customer ID (remove hyphens if present)
    const formattedCustomerId = body.customerId.replace(/-/g, '');
    const managerCustomerId = "9616382086";
    
    console.log("Calling Google Ads ReachPlanService...");
    
    // Build the reach plan request
    const reachPlanRequest = {
      plannable_location_id: body.locationId,
      currency_code: body.currencyCode,
      budget_micros: body.budget * 1000000, // Convert to micros
      campaign_duration: {
        duration_in_days: Math.ceil(
          (new Date(body.campaignDuration.endDate).getTime() - 
           new Date(body.campaignDuration.startDate).getTime()) / 
          (1000 * 60 * 60 * 24)
        )
      },
      targeting: {
        plannable_location_ids: [body.locationId],
        age_ranges: [body.targeting.ageRange.toUpperCase().replace('-', '_')],
        genders: [body.targeting.gender.toUpperCase()]
      },
      planned_products: body.adProducts.map(product => ({
        plannable_product_code: product,
        budget_micros: (body.budget * 1000000) / body.adProducts.length
      }))
    };

    console.log("Reach plan request:", JSON.stringify(reachPlanRequest, null, 2));

    const apiUrl = `https://googleads.googleapis.com/v18/customers/${formattedCustomerId}:generateReachForecast`;
    
    const forecastResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': managerCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reachPlanRequest),
    });

    const responseText = await forecastResponse.text();
    console.log("API Response Status:", forecastResponse.status);
    console.log("API Response Body:", responseText);

    if (!forecastResponse.ok) {
      console.error("Forecast request failed:", forecastResponse.status, responseText);
      throw new Error(`Google Ads API error: ${responseText}`);
    }

    const forecastData = JSON.parse(responseText);

    // Extract metrics from response
    const onTargetMetrics = forecastData.reach_curve?.reach_forecasts?.[0]?.on_target_reach_metrics;
    const totalMetrics = forecastData.reach_curve?.reach_forecasts?.[0]?.total_reach_metrics;
    
    const metrics = {
      onTargetReach: onTargetMetrics?.on_target_reach || 0,
      onTargetImpressions: onTargetMetrics?.on_target_impressions || 0,
      totalReach: totalMetrics?.total_reach || 0,
      totalImpressions: totalMetrics?.total_impressions || 0,
      cpm: forecastData.cost_micros ? (forecastData.cost_micros / 1000000) / (totalMetrics?.total_impressions || 1) * 1000 : 0,
      frequency: totalMetrics?.total_reach ? (totalMetrics?.total_impressions || 0) / totalMetrics.total_reach : 0,
      rawResponse: forecastData
    };

    console.log("Processed metrics:", metrics);

    return new Response(
      JSON.stringify({ 
        success: true, 
        metrics,
        requestParams: body
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in google-ads-forecast function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        details: errorDetails
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
