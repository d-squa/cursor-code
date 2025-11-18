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
    // Authentication check
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase for auth verification
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import("npm:@supabase/supabase-js@2.76.1");
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid authentication token' }), { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.log("Google Ads forecast request (authenticated user):", user.id);
    }

    console.log("Starting Google Ads forecast request");

    // Get OAuth credentials from environment
    const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN');
    const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');

    if (!clientId || !clientSecret || !refreshToken || !developerToken) {
      throw new Error('Google Ads credentials not configured. Please connect your Google Ads account in Settings.');
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
    
    // Build the reach plan request using proper camelCase fields per Google Ads v18 REST
    const durationInDays = Math.ceil(
      (new Date(body.campaignDuration.endDate).getTime() -
        new Date(body.campaignDuration.startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    // Map UI age range to plannableAgeRange enum
    const ageRangeMap: Record<string, string> = {
      '18-24': 'AGE_RANGE_18_24',
      '18-34': 'AGE_RANGE_18_34',
      '25-34': 'AGE_RANGE_25_34',
      '35-44': 'AGE_RANGE_35_44',
      '45-54': 'AGE_RANGE_45_54',
      '55-64': 'AGE_RANGE_55_64',
      '65+': 'AGE_RANGE_65_UP',
    };

    const reachPlanRequest = {
      customerId: formattedCustomerId, // not used by REST body but useful for logging
      currencyCode: body.currencyCode,
      campaignDuration: {
        durationInDays,
      },
      targeting: {
        plannableLocationId: body.locationId,
        ageRange: ageRangeMap[body.targeting.ageRange] ?? 'AGE_RANGE_18_24',
        genders: [
          {
            type: body.targeting.gender?.toUpperCase() === 'FEMALE' ? 'FEMALE' : 'MALE',
          },
        ],
      },
      plannedProducts: body.adProducts.map((product) => ({
        plannableProductCode: product === 'SKIPPABLE_IN_STREAM' ? 'TRUEVIEW_IN_STREAM' : product,
        budgetMicros: Math.round((body.budget * 1_000_000) / Math.max(body.adProducts.length, 1)),
      })),
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

    // Extract metrics from response (camelCase per REST/JSON mapping)
    const onTargetMetrics = forecastData.reachCurve?.reachForecasts?.[0]?.onTargetReachMetrics;
    const totalMetrics = forecastData.reachCurve?.reachForecasts?.[0]?.totalReachMetrics;

    const totalImpressions = totalMetrics?.impressions ?? totalMetrics?.totalImpressions ?? 0;
    const totalReach = totalMetrics?.reach ?? totalMetrics?.totalReach ?? 0;

    const metrics = {
      onTargetReach: onTargetMetrics?.reach ?? onTargetMetrics?.onTargetReach ?? 0,
      onTargetImpressions: onTargetMetrics?.impressions ?? onTargetMetrics?.onTargetImpressions ?? 0,
      totalReach,
      totalImpressions,
      cpm: forecastData.costMicros ? ((forecastData.costMicros / 1_000_000) / Math.max(totalImpressions, 1)) * 1000 : 0,
      frequency: totalReach ? totalImpressions / totalReach : 0,
      rawResponse: forecastData,
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
