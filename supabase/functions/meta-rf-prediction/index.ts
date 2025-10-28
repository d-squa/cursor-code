import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Meta R&F prediction request (keys):", Object.keys(body));

    // Get credentials from connected platform
    const connectedPlatformId = body.connectedPlatformId;
    if (!connectedPlatformId) {
      throw new Error("connectedPlatformId is required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch platform credentials
    const { data: platform, error: platformError } = await supabase
      .from('connected_platforms')
      .select('access_token, ad_account_id')
      .eq('id', connectedPlatformId)
      .single();

    if (platformError || !platform) {
      console.error("Failed to fetch platform:", platformError);
      throw new Error("Connected platform not found");
    }

    const accessToken = platform.access_token;
    const adAccountId = platform.ad_account_id.replace('act_', ''); // Remove act_ prefix if present

    if (!accessToken || !adAccountId) {
      console.error("Missing credentials - accessToken:", !!accessToken, "adAccountId:", !!adAccountId);
      throw new Error("Meta credentials not configured for this platform");
    }

    console.log("Using ad account for R&F:", adAccountId);

    // Extract countries from body - support both formats
    let validatedMarkets: string[] = [];
    
    if (body.countries && Array.isArray(body.countries)) {
      // New format: countries array directly
      validatedMarkets = body.countries;
    } else if (body.markets && Array.isArray(body.markets)) {
      // Legacy format: markets array
      validatedMarkets = body.markets;
    } else {
      throw new Error("No markets/countries provided. Please specify countries array.");
    }

    // Validate and normalize to ISO-2 country codes
    const normalizedMarkets: string[] = [];
    for (const market of validatedMarkets) {
      const normalized = market.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(normalized)) {
        throw new Error(`Invalid country code: "${market}". Must be 2-letter ISO code (e.g., US, CA, GB).`);
      }
      normalizedMarkets.push(normalized);
    }

    console.log("Normalized markets for R&F:", normalizedMarkets);

    // Build target_spec from body parameters
    const targetSpec: any = {
      geo_locations: {
        countries: normalizedMarkets,
      },
      age_min: body.ageMin || 18,
      age_max: body.ageMax || 65,
    };

    // Add gender if specified
    if (body.gender && body.gender !== "all") {
      targetSpec.genders = [body.gender === "male" ? 1 : 2];
    }

    // Add languages/locales if specified
    if (body.languages && Array.isArray(body.languages) && body.languages.length > 0) {
      targetSpec.locales = body.languages;
    }

    // Add publisher platforms - FORCE Facebook only for R&F (exclude Instagram/Messenger/Audience Network)
    if (body.publisherPlatforms && Array.isArray(body.publisherPlatforms) && body.publisherPlatforms.length > 0) {
      const filteredPlatforms = body.publisherPlatforms.filter(
        (platform: string) => platform === "facebook"
      );
      targetSpec.publisher_platforms = filteredPlatforms.length > 0 ? filteredPlatforms : ["facebook"];
    } else {
      // Default strictly to Facebook to avoid IG account requirement
      targetSpec.publisher_platforms = ["facebook"];
    }


    // Add placements for each platform with proper mapping (Audience Network excluded for RESERVED/REACH)
    if (body.publisherPlatforms && Array.isArray(body.publisherPlatforms) && body.publisherPlatforms.length > 0) {
      // Facebook positions
      if (body.positions?.facebook && body.positions.facebook.length > 0) {
        targetSpec.facebook_positions = body.positions.facebook.map((pos: string) =>
          pos === "fb_story"
            ? "story"
            : pos === "profile_feed_fb"
              ? "profile_feed"
              : pos
        );
      }

      // Instagram positions
      if (body.positions?.instagram && body.positions.instagram.length > 0) {
        targetSpec.instagram_positions = body.positions.instagram.map((pos: string) =>
          pos === "ig_story"
            ? "story"
            : pos === "profile_feed_ig"
              ? "profile_feed"
              : pos
        );
      }

      // Audience Network positions intentionally ignored for R&F RESERVED REACH
    }

    // Force exclude Instagram from R&F per latest requirement and strip IG placements
    const includesIG = Array.isArray(targetSpec.publisher_platforms) && targetSpec.publisher_platforms.includes("instagram");
    if (includesIG) {
      targetSpec.publisher_platforms = targetSpec.publisher_platforms.filter((p: string) => p !== "instagram");
    }
    if (targetSpec.instagram_positions) delete targetSpec.instagram_positions;
    
    // Fallback: ensure at least Facebook remains
    if (!targetSpec.publisher_platforms || targetSpec.publisher_platforms.length === 0) {
      targetSpec.publisher_platforms = ["facebook"];
    }

    // Add detailed targeting (interests, behaviors, demographics)
    if (body.detailedTargeting && Array.isArray(body.detailedTargeting) && body.detailedTargeting.length > 0) {
      targetSpec.flexible_spec = [
        body.detailedTargeting.reduce((acc: any, target: any) => {
          if (!acc[target.type]) {
            acc[target.type] = [];
          }
          acc[target.type].push({ id: target.id });
          return acc;
        }, {}),
      ];
    }

    console.log("Target spec for R&F:", JSON.stringify(targetSpec, null, 2));

    // Step 1: Create Reach & Frequency prediction
    // API: POST https://graph.facebook.com/v21.0/act_{ad_account_id}/reachfrequencypredictions
    
    // Prepare start and end times (REQUIRED for R&F)
    // Set time to 9:00 AM UTC to ensure it's after 6:00 AM requirement
    if (!body.startDate || !body.endDate) {
      throw new Error("startDate and endDate are required for R&F predictions");
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    
    // Set to 9:00 AM UTC to be safe (Meta requires time after ~6:00 AM)
    startDate.setUTCHours(9, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999); // End of day
    
    const startTimeUnix = Math.floor(startDate.getTime() / 1000);
    const endTimeUnix = Math.floor(endDate.getTime() / 1000);
    
    console.log("Campaign time window:", {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      startTimeUnix,
      endTimeUnix,
    });

    const predictionParams: Record<string, string> = {
      access_token: accessToken,
      target_spec: JSON.stringify(targetSpec),
      budget: String(body.budget),
      buying_type: "RESERVED", // Required for R&F
      objective: "REACH",
      prediction_mode: "1", // 0 = reach, 1 = r&f
      frequency_cap: String(body.frequencyCap || 2),
      start_time: String(startTimeUnix), // REQUIRED
      end_time: String(endTimeUnix), // REQUIRED
    };

    // Add Instagram actor ID if Instagram placements are included (REQUIRED for R&F with Instagram)
    if (body.instagramActorId && targetSpec.publisher_platforms?.includes("instagram")) {
      predictionParams.instagram_actor_id = String(body.instagramActorId);
      console.log("Adding Instagram actor ID:", body.instagramActorId);
    }

    const maskedParams = new URLSearchParams(predictionParams)
      .toString()
      .replace(/access_token=[^&]+/, "access_token=***");
    console.log("Creating R&F prediction with params:", maskedParams);

    const createResponse = await fetch(
      `https://graph.facebook.com/v21.0/act_${adAccountId}/reachfrequencypredictions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(predictionParams),
      },
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("R&F prediction creation error:", errorText);

      try {
        const errorData = JSON.parse(errorText);

        // Handle specific error codes
        if (errorData.error?.code === 190) {
          throw new Error("INVALID_TOKEN: Meta access token is invalid or expired.");
        }

        if (errorData.error?.code === 100 && errorData.error?.message?.includes("buying_type")) {
          throw new Error(
            "R&F_NOT_AVAILABLE: This ad account is not eligible for Reach & Frequency campaigns. The account must have RESERVED buying_type access.",
          );
        }

        if (errorData.error?.code === 200) {
          throw new Error(
            "PERMISSION_ERROR: Meta access token does not have required permissions. Need ads_management and business_management scopes for R&F predictions.",
          );
        }
      } catch (e) {
        if (
          e instanceof Error &&
          (e.message.startsWith("R&F_") || e.message.startsWith("INVALID_") || e.message.startsWith("PERMISSION_"))
        ) {
          throw e;
        }
      }

      throw new Error(`R&F prediction creation failed: ${errorText}`);
    }

    const predictionData = await createResponse.json();
    const predictionId = predictionData.id;
    console.log("Created R&F prediction:", predictionId);
    console.log("Initial prediction data:", JSON.stringify(predictionData, null, 2));

    // Step 2: Poll for prediction status
    // Predictions can take a few seconds to compute
    let attempts = 0;
    let predictionResult = null;

    while (attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s between checks

      const statusResponse = await fetch(
        `https://graph.facebook.com/v21.0/${predictionId}?access_token=${accessToken}&fields=id,name,frequency_cap,campaign_time_start,campaign_time_stop,external_reach,external_impression,external_budget,audience_size_upper_bound,external_minimum_budget,prediction_progress,status,curve_budget_reach,reservation_status,errors`,
      );

      if (statusResponse.ok) {
        predictionResult = await statusResponse.json();
        console.log(`R&F prediction status (attempt ${attempts + 1}):`, {
          status: predictionResult.status,
          progress: predictionResult.prediction_progress,
          reach: predictionResult.external_reach,
          impressions: predictionResult.external_impression,
          reservation_status: predictionResult.reservation_status,
          errors: predictionResult.errors,
        });

        if (predictionResult.status === 1) {
          // 1 = ready
          console.log("R&F prediction ready! Full result:", JSON.stringify(predictionResult, null, 2));
          break;
        }
        
        // Status 12 = error, log full details
        if (predictionResult.status === 12) {
          console.error("R&F prediction failed with status 12. Full response:", JSON.stringify(predictionResult, null, 2));
          throw new Error(`R&F prediction failed: ${predictionResult.errors ? JSON.stringify(predictionResult.errors) : 'Unknown error - check if ad account has RESERVED buying type access and sufficient permissions'}`);
        }
      } else {
        const errorText = await statusResponse.text();
        console.error(`Status check failed (attempt ${attempts + 1}):`, errorText);
      }

      attempts++;
    }

    if (!predictionResult || predictionResult.status !== 1) {
      throw new Error("R&F prediction timed out or failed to complete");
    }

    // Step 3: Extract metrics from R&F prediction response (LIVE DATA FROM META API)
    const externalReach = predictionResult.external_reach || 0;
    const externalImpression = predictionResult.external_impression || 0;
    const externalBudget = predictionResult.external_budget || body.budget;
    const audienceSize = predictionResult.audience_size_upper_bound || 0;
    const frequencyCap = predictionResult.frequency_cap || 1;
    const externalMinimumBudget = predictionResult.external_minimum_budget || 0;

    // Calculate CPM from actual Meta API data: (budget / impressions) * 1000
    const cpm = externalImpression > 0 ? (externalBudget / externalImpression) * 1000 : 0;

    console.log("✅ LIVE R&F METRICS FROM META API:", {
      id: predictionResult.id,
      frequencyCap,
      campaignTimeStart: predictionResult.campaign_time_start,
      campaignTimeStop: predictionResult.campaign_time_stop,
      externalReach: `${externalReach.toLocaleString()} (LIVE)`,
      externalImpression: `${externalImpression.toLocaleString()} (LIVE)`,
      externalBudget: `${externalBudget.toLocaleString()} (LIVE)`,
      externalMinimumBudget: `${externalMinimumBudget.toLocaleString()} (LIVE)`,
      audienceSize: `${audienceSize.toLocaleString()} (LIVE)`,
      cpm: `${cpm.toFixed(2)} (CALCULATED FROM LIVE DATA)`,
    });

    // Step 4: Calculate derived metrics (clicks, conversions) using industry benchmarks
    // Note: Meta R&F API provides reach, impressions, CPM - we estimate clicks/conversions
    const ctr = body.estimatedCTR || 0.009; // Use provided CTR or 0.9% default
    const conversionRate = body.estimatedConversionRate || 0.02; // Use provided or 2% default

    const clicks = Math.round(externalImpression * ctr);
    const conversions = Math.round(clicks * conversionRate);
    const cpc = clicks > 0 ? externalBudget / clicks : 0;
    const costPerConversion = conversions > 0 ? externalBudget / conversions : 0;

    const forecast = {
      // ✅ LIVE DATA FROM META R&F API:
      audienceSize, // From audience_size_upper_bound
      reach: externalReach, // From external_reach
      impressions: externalImpression, // From external_impression
      cpm: parseFloat(cpm.toFixed(2)), // Calculated from API data
      budget: externalBudget, // From external_budget
      minimumBudget: externalMinimumBudget, // From external_minimum_budget
      frequencyCap, // From frequency_cap
      
      // Estimated metrics (since R&F API doesn't provide these):
      clicks,
      ctr: parseFloat((ctr * 100).toFixed(2)),
      cpc: parseFloat(cpc.toFixed(2)),
      results: conversions,
      resultType: body.strategyConfig?.metric || "conversions",
      conversionRate: parseFloat((conversionRate * 100).toFixed(2)),
      costPerResult: parseFloat(costPerConversion.toFixed(2)),
    };

    console.log("✅ Final R&F forecast (LIVE DATA):", forecast);

    return new Response(JSON.stringify({ forecast }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Meta R&F prediction error:", error);

    return new Response(
      JSON.stringify({
        error: error.message,
        details:
          "Reach & Frequency predictions require: (1) Ad account with RESERVED buying_type access, (2) Access token with ads_management + business_management scopes, (3) App in Live mode",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
