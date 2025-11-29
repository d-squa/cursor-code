import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
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

    // Initialize Supabase for auth verification
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    const body = await req.json();
    console.log("TikTok R&F forecast request (authenticated user):", user.id);

    // Get credentials from connected platform
    const connectedPlatformId = body.connectedPlatformId;
    if (!connectedPlatformId) {
      throw new Error("connectedPlatformId is required");
    }

    // Initialize Supabase service client for accessing connected_platforms
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch platform credentials
    const { data: platform, error: platformError } = await supabaseService
      .from("connected_platforms")
      .select("access_token, ad_account_id")
      .eq("id", connectedPlatformId)
      .eq("platform_type", "tiktok")
      .single();

    if (platformError || !platform) {
      console.error("Connected TikTok platform not found:", platformError);
      throw new Error("TikTok platform connection not found. Please connect your TikTok account.");
    }

    const accessToken = platform.access_token as string;
    const advertiserId = platform.ad_account_id as string;

    if (!accessToken || !advertiserId) {
      throw new Error("TikTok credentials not configured. Please reconnect your TikTok account.");
    }

    console.log("Using TikTok advertiser account:", advertiserId);

    // Extract and validate countries/markets
    let validatedMarkets: string[] = [];
    if (body.countries && Array.isArray(body.countries)) {
      validatedMarkets = body.countries;
    } else if (body.markets && Array.isArray(body.markets)) {
      validatedMarkets = body.markets;
    } else {
      throw new Error("No markets/countries provided. Please specify countries array.");
    }

    // Normalize to ISO-2 country codes
    const normalizedMarkets: string[] = [];
    for (const market of validatedMarkets) {
      const normalized = market.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(normalized)) {
        throw new Error(`Invalid country code: "${market}". Must be 2-letter ISO code (e.g., US, CA, GB).`);
      }
      normalizedMarkets.push(normalized);
    }

    console.log("Normalized markets for TikTok R&F:", normalizedMarkets);

    // Map country codes to TikTok location IDs (numeric codes)
    const countryCodeToLocationId: Record<string, number> = {
      "US": 6252001, "GB": 2635167, "CA": 6251999, "AU": 2077456, "DE": 2921044,
      "FR": 3017382, "IT": 3175395, "ES": 2510769, "MX": 3996063, "BR": 3469034,
      "AR": 3865483, "CL": 3895114, "CO": 3686110, "PE": 3932488, "VE": 3625428,
      "NL": 2750405, "BE": 2802361, "SE": 2661886, "NO": 3144096, "DK": 2623032,
      "FI": 660013, "PL": 798544, "CZ": 3077311, "AT": 2782113, "CH": 2658434,
      "PT": 2264397, "GR": 390903, "IE": 2963597, "RO": 798549, "HU": 719819,
      "JP": 1861060, "KR": 1835841, "CN": 1814991, "IN": 1269750, "ID": 1643084,
      "TH": 1605651, "VN": 1562822, "PH": 1694008, "MY": 1733045, "SG": 1880251,
      "NZ": 2186224, "ZA": 953987, "NG": 2328926, "EG": 357994, "SA": 102358,
      "AE": 290557, "IL": 294640, "TR": 298795, "RU": 2017370, "UA": 690791,
    };

    const locationIds = normalizedMarkets
      .map(code => countryCodeToLocationId[code.toUpperCase()])
      .filter(id => id !== undefined)
      .map(id => String(id));

    if (locationIds.length === 0) {
      throw new Error(`No valid location IDs found for markets: ${normalizedMarkets.join(", ")}`);
    }

    // Build TikTok R&F API request body
    const budget = body.budget || 0;
    const budgetRounded = Math.round(budget * 100) / 100; // 2 decimal precision

    // Age groups mapping
    const mapAgeGroups = (ageMin?: number, ageMax?: number): string[] => {
      const min = ageMin || 18;
      const max = ageMax || 65;
      const ageGroups = [];
      
      if (min <= 17) ageGroups.push("AGE_13_17");
      if (min <= 24 && max >= 18) ageGroups.push("AGE_18_24");
      if (min <= 34 && max >= 25) ageGroups.push("AGE_25_34");
      if (min <= 44 && max >= 35) ageGroups.push("AGE_35_44");
      if (min <= 54 && max >= 45) ageGroups.push("AGE_45_54");
      if (max >= 55) ageGroups.push("AGE_55_100");

      return ageGroups.length > 0 ? ageGroups : ["AGE_18_100"];
    };

    // Gender mapping
    const mapGender = (genders?: number[]): string => {
      if (!genders || genders.length === 0 || genders.includes(0)) return "GENDER_UNLIMITED";
      if (genders.includes(1) && genders.includes(2)) return "GENDER_UNLIMITED";
      if (genders.includes(1)) return "GENDER_MALE";
      if (genders.includes(2)) return "GENDER_FEMALE";
      return "GENDER_UNLIMITED";
    };

    const requestBody = {
      advertiser_id: advertiserId,
      location_ids: locationIds,
      age_groups: mapAgeGroups(body.ageMin, body.ageMax),
      gender: mapGender(body.genders),
      budget: budgetRounded,
      placements: body.placements || ["PLACEMENT_TIKTOK"],
      objective_type: body.objectiveType || "REACH",
      optimization_goal: body.optimizationGoal || "REACH",
    };

    const endpoint = "https://business-api.tiktok.com/open_api/v1.3/rf/inventory/estimate/";
    console.log("TikTok API Full Request:", {
      endpoint,
      method: "POST",
      headers: { "Access-Token": "[REDACTED]", "Content-Type": "application/json" },
      body: requestBody
    });
    console.log("TikTok R&F forecast request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("TikTok API Response Status:", response.status, response.statusText);
    console.log("TikTok API Response Headers:", Object.fromEntries(response.headers.entries()));

    // Check if response is JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const responseText = await response.text();
      console.error("TikTok API returned non-JSON response:", responseText);
      return new Response(
        JSON.stringify({
          success: false,
          error: "TikTok API returned invalid response format (not JSON)",
          details: responseText.substring(0, 500),
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();

    if (data.code !== 0) {
      console.error("TikTok R&F forecast error:", JSON.stringify(data, null, 2));
      return new Response(
        JSON.stringify({
          success: false,
          error: `${data.message || "Failed to fetch R&F forecast"} (Code: ${data.code})`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("TikTok R&F forecast response:", JSON.stringify(data, null, 2));

    // Parse and normalize response data
    const forecastData = data.data || {};
    const reach = forecastData.reach || 0;
    const impressions = forecastData.impressions || forecastData.impression || 0;
    const frequency = impressions > 0 && reach > 0 ? (impressions / reach).toFixed(2) : "0";
    const cpm = impressions > 0 ? ((budget / impressions) * 1000).toFixed(2) : "0";

    // Estimate clicks and conversions based on industry benchmarks
    const avgCTR = 0.8; // 0.8% CTR average for TikTok
    const clicks = Math.round(impressions * (avgCTR / 100));
    const conversionRate = 2; // 2% conversion rate average
    const conversions = Math.round(clicks * (conversionRate / 100));
    const cpc = clicks > 0 ? (budget / clicks).toFixed(2) : "0";
    const costPerConversion = conversions > 0 ? (budget / conversions).toFixed(2) : "0";

    const forecast = {
      reach,
      impressions,
      frequency,
      clicks,
      conversions,
      cpm,
      cpc,
      ctr: avgCTR.toFixed(2),
      conversionRate: conversionRate.toFixed(2),
      costPerConversion,
      dataSource: "live_api", // Indicates this is from live TikTok API
      platform: "tiktok",
    };

    console.log("Final TikTok R&F forecast:", forecast);

    return new Response(JSON.stringify(forecast), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("TikTok R&F forecast error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: "Check edge function logs for more information",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
