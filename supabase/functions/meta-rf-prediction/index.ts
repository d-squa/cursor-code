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

    // Fetch platform credentials (prefer connected platform, fallback to global secrets)
    const { data: platform, error: platformError } = await supabase
      .from("connected_platforms")
      .select("access_token, ad_account_id")
      .eq("id", connectedPlatformId)
      .single();

    if (platformError || !platform) {
      console.warn("Connected platform not found or fetch error, will try global credentials:", platformError);
    }

    const envAccessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
    const envAdAccountIdRaw = Deno.env.get("META_AD_ACCOUNT_ID") || "";

    let accessToken = (platform?.access_token as string) || "";
    let adAccountIdRaw = ((platform?.ad_account_id as string) || "").toString();

    if (!accessToken && envAccessToken) {
      accessToken = envAccessToken;
      console.log("Falling back to global Meta access token from secrets");
    }

    // Helper to strip act_ prefix
    const toNumeric = (v: string) => v.replace(/^act_/i, "");

    if ((!adAccountIdRaw || adAccountIdRaw.length < 10) && envAdAccountIdRaw) {
      adAccountIdRaw = envAdAccountIdRaw;
      console.log("Falling back to global Meta ad account id from secrets (empty/short)");
    }

    let adAccountId = toNumeric(adAccountIdRaw);

    // If connected value is invalid (e.g., 8 digits), override with global secret when valid
    if (!/^[0-9]{10,}$/.test(adAccountId) && envAdAccountIdRaw) {
      const envNumeric = toNumeric(envAdAccountIdRaw);
      if (/^[0-9]{10,}$/.test(envNumeric)) {
        console.warn(
          `Overriding invalid connected ad account id (raw: ${adAccountIdRaw}, numeric: ${adAccountId}) with global META_AD_ACCOUNT_ID`,
        );
        adAccountId = envNumeric;
      }
    }

    if (!/^[0-9]{10,}$/.test(adAccountId)) {
      console.error("Invalid ad account id detected. Raw value:", adAccountIdRaw, "Processed:", adAccountId);
      console.error(
        "Expected format: numeric ID (e.g., 113074448849584) or with act_ prefix (e.g., act_113074448849584)",
      );
      throw new Error(
        `Invalid Meta ad account id: "${adAccountIdRaw}". Expected format: act_113074448849584 or 113074448849584`,
      );
    }

    if (!accessToken) {
      console.error("Missing Meta access token after fallbacks");
      throw new Error("Meta access token missing. Please verify the connected platform or global credentials.");
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

    // Build target_spec - R&F has strict placement restrictions
    const targetSpec: any = {
      geo_locations: {
        countries: normalizedMarkets,
      },
      age_min: body.ageMin || 18,
      age_max: body.ageMax || 65,
    };

    // Add gender if specified
    if (body.gender && body.gender !== "all") {
      targetSpec.genders = body.gender === "male" ? [1] : [2];
    }

    // Add languages if specified
    if (body.languages && Array.isArray(body.languages) && body.languages.length > 0) {
      targetSpec.locales = body.languages;
    }

    // Add detailed targeting if specified (interests, behaviors, demographics)
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

    // CRITICAL: Don't specify positions for R&F - Meta has strict restrictions
    // R&F campaigns only support specific placements, let Meta auto-select valid ones
    // Specifying custom positions causes error 1885696

    console.log("R&F targeting spec:", JSON.stringify(targetSpec, null, 2));

    console.log("Target spec for R&F:", JSON.stringify(targetSpec, null, 2));

    // Step 1: Create Reach & Frequency prediction
    // API: POST https://graph.facebook.com/v21.0/act_{ad_account_id}/reachfrequencypredictions

    // Use dates from request body
    const startDate = body.startDate ? new Date(body.startDate) : new Date();
    const endDate = body.endDate ? new Date(body.endDate) : new Date();

    // Set start to 9 AM UTC and end to 11:59 PM UTC
    startDate.setUTCHours(9, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);

    const startTimeUnix = Math.floor(startDate.getTime() / 1000);
    const endTimeUnix = Math.floor(endDate.getTime() / 1000);

    // Calculate campaign duration for frequency cap
    const durationDays = Math.ceil((endTimeUnix - startTimeUnix) / 86400);
    const frequencyCap = durationDays <= 3 ? 1 : 2;

    console.log("Campaign time window:", {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      startTimeUnix,
      endTimeUnix,
    });

    // Get page ID and optional Instagram ID from body
    const pageId = body.pageId || body.page || "1757934224274443"; // Fallback Page ID
    const instagramId = body.instagramId || body.igUserId || body.instagram_actor_id || null; // Prefer ig_user_id if provided

    // Budget in cents
    const budgetCents = body.budget * 100;

    // CRITICAL: R&F predictions ALWAYS use REACH objective regardless of UI selection
    // This is a hard requirement for Meta's Reach & Frequency API
    const destinationIds: string[] = [pageId];
    if (instagramId) destinationIds.push(instagramId);

    const predictionParams: Record<string, string> = {
      access_token: accessToken,
      target_spec: JSON.stringify(targetSpec),
      budget: String(budgetCents)
      objective: "REACH", // FORCED: R&F only supports REACH objective
      optimization_goal: "REACH", // Required for R&F
      billing_event: "IMPRESSIONS", // Required for R&F
      prediction_mode: "1", // 0 = reach, 1 = r&f
      frequency_cap: String(body.frequencyCap || frequencyCap),
      start_time: String(startTimeUnix), // REQUIRED
      end_time: String(endTimeUnix), // REQUIRED
      publisher_platforms: JSON.stringify(["facebook"]), // HARDCODED: Always use Facebook
      facebook_positions: JSON.stringify(["feed", "story"]), // HARDCODED: Feed and Story placements
    };

    console.log("R&F publisher platforms (hardcoded): facebook");
    console.log("R&F Facebook positions (hardcoded): feed, story");

    console.log(
      `R&F budget: $${(budgetCents / 100).toLocaleString()} (${budgetCents} cents), Markets: ${normalizedMarkets.join(", ")}`,
    );
    console.log(`R&F campaign duration: ${durationDays} days, frequency cap: ${frequencyCap}`);

    // Log full API URL for Graph API Explorer testing (non-clickable format)
    console.log("🔗 FULL API URL FOR GRAPH API EXPLORER (copy entire line below):");
    console.log(
      `https://graph.facebook.com/v21.0/act_${adAccountId}/reachfrequencypredictions?${new URLSearchParams(predictionParams).toString()}`,
    );

    const maskedParams = new URLSearchParams(predictionParams)
      .toString()
      .replace(/access_token=[^&]+/, "access_token=***");
    console.log("Creating R&F prediction with params:", maskedParams);

    let createResponse = await fetch(`https://graph.facebook.com/v21.0/act_${adAccountId}/reachfrequencypredictions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(predictionParams),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("R&F prediction creation error:", errorText);

      let errorData: any = null;
      try {
        errorData = JSON.parse(errorText);
      } catch (_) {
        // ignore JSON parse failure
      }

      // No retry logic - keep placement parameters as hardcoded
      // Handle specific error codes (after optional retry)
      if (!createResponse.ok) {
        const finalErrorText = errorData ? JSON.stringify(errorData) : errorText;

        try {
          const finalData = errorData || JSON.parse(errorText);

          if (finalData.error?.code === 190) {
            throw new Error("INVALID_TOKEN: Meta access token is invalid or expired.");
          }

          if (finalData.error?.code === 200) {
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

        throw new Error(`R&F prediction creation failed: ${finalErrorText}`);
      }
    }

    const predictionData = await createResponse.json();
    const predictionId = predictionData.id;
    console.log("✅ Created R&F prediction ID:", predictionId);
    console.log("📋 Initial prediction data:", JSON.stringify(predictionData, null, 2));

    // Log prediction IDs if curve_budget_reach is present
    if (predictionData.curve_budget_reach && Array.isArray(predictionData.curve_budget_reach)) {
      console.log(`📊 Received ${predictionData.curve_budget_reach.length} prediction curve points`);
      console.log(
        "🆔 Prediction IDs from curve:",
        predictionData.curve_budget_reach.map((p: any) => ({
          id: p.id || p.rf_prediction_id || p.prediction_id || predictionId,
          budget: p.budget / 100,
          reach: p.reach,
          impressions: p.impression,
        })),
      );
    }

    // Step 2: Poll for prediction status
    // Predictions can take a few seconds to compute
    let attempts = 0;
    let predictionResult = null;

    while (attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3s between checks

      const statusResponse = await fetch(
        `https://graph.facebook.com/v21.0/${predictionId}?access_token=${accessToken}&fields=id,name,frequency_cap,campaign_time_start,campaign_time_stop,external_reach,external_impression,external_budget,audience_size_upper_bound,audience_size_lower_bound,external_minimum_budget,external_maximum_budget,external_minimum_reach,external_maximum_reach,external_minimum_impression,external_maximum_impression,prediction_progress,status,curve_budget_reach`,
      );

      if (statusResponse.ok) {
        predictionResult = await statusResponse.json();
        console.log(`R&F prediction status (attempt ${attempts + 1}):`, {
          status: predictionResult.status,
          progress: predictionResult.prediction_progress,
          reach: predictionResult.external_reach,
          impressions: predictionResult.external_impression,
        });

        if (predictionResult.status === 1) {
          // 1 = ready
          console.log("R&F prediction ready! Full result:", JSON.stringify(predictionResult, null, 2));
          break;
        }

        // Status 12 = error, provide detailed diagnostics
        if (predictionResult.status === 12) {
          console.error("❌ R&F prediction failed with status 12");
          console.error("Full response:", JSON.stringify(predictionResult, null, 2));
          console.error("Target spec used:", JSON.stringify(targetSpec, null, 2));
          console.error("Prediction params:", {
            budget: budgetCents / 100,
            markets: normalizedMarkets,
            platforms: targetSpec.publisher_platforms,
            dateRange: `${new Date(predictionResult.campaign_time_start * 1000).toISOString()} to ${new Date(predictionResult.campaign_time_stop * 1000).toISOString()}`,
          });

          // Build detailed error message
          let errorDetails = [];
          if (predictionResult.external_minimum_budget > 0) {
            errorDetails.push(
              `Minimum budget required: $${(predictionResult.external_minimum_budget / 100).toLocaleString()}`,
            );
          }
          if (normalizedMarkets.length === 1 && normalizedMarkets[0] === "GE") {
            errorDetails.push("Small market (GE) may have limited R&F inventory. Try larger markets (US, GB, CA, AU)");
          }

          const errorMsg =
            errorDetails.length > 0
              ? `R&F prediction failed. Possible issues: ${errorDetails.join("; ")}`
              : "R&F prediction failed. The targeting/budget/market combination may not support R&F. Try: (1) Larger markets, (2) Higher budget, (3) Add Instagram placements, (4) Broader targeting";

          throw new Error(errorMsg);
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

    // Step 3: Calculate median values from min/max metrics
    // Meta R&F API returns min/max ranges - we calculate the median as (min + max) / 2

    // Calculate median reach
    const minReach = predictionResult.external_minimum_reach || 0;
    const maxReach = predictionResult.external_maximum_reach || 0;
    const medianReach = Math.round((minReach + maxReach) / 2);

    // Calculate median impressions
    const minImpressions = predictionResult.external_minimum_impression || 0;
    const maxImpressions = predictionResult.external_maximum_impression || 0;
    const medianImpressions = Math.round((minImpressions + maxImpressions) / 2);

    // Calculate median budget
    const minBudget = predictionResult.external_minimum_budget || 0;
    const maxBudget = predictionResult.external_maximum_budget || 0;
    const medianBudget = (minBudget + maxBudget) / 2 / 100; // Convert cents to dollars

    // Get audience size
    const audienceSizeLower = predictionResult.audience_size_lower_bound || 0;
    const audienceSizeUpper = predictionResult.audience_size_upper_bound || 0;
    const medianAudienceSize = Math.round((audienceSizeLower + audienceSizeUpper) / 2);

    const resultFrequencyCap = predictionResult.frequency_cap || 1;

    // Calculate CPM from median values: (budget / impressions) * 1000
    const cpm = medianImpressions > 0 ? (medianBudget / medianImpressions) * 1000 : 0;

    console.log("✅ MEDIAN CALCULATIONS FROM META R&F API:", {
      id: predictionResult.id,
      reach: {
        min: minReach.toLocaleString(),
        max: maxReach.toLocaleString(),
        median: medianReach.toLocaleString(),
      },
      impressions: {
        min: minImpressions.toLocaleString(),
        max: maxImpressions.toLocaleString(),
        median: medianImpressions.toLocaleString(),
      },
      budget: {
        min: `$${(minBudget / 100).toLocaleString()}`,
        max: `$${(maxBudget / 100).toLocaleString()}`,
        median: `$${medianBudget.toLocaleString()}`,
      },
      audienceSize: {
        lower: audienceSizeLower.toLocaleString(),
        upper: audienceSizeUpper.toLocaleString(),
        median: medianAudienceSize.toLocaleString(),
      },
      frequencyCap: resultFrequencyCap,
      cpm: cpm.toFixed(2),
    });

    // Step 4: Calculate derived metrics (clicks, conversions) using industry benchmarks
    const ctr = body.estimatedCTR || 0.009; // Use provided CTR or 0.9% default
    const conversionRate = body.estimatedConversionRate || 0.02; // Use provided or 2% default

    const clicks = Math.round(medianImpressions * ctr);
    const conversions = Math.round(clicks * conversionRate);
    const cpc = clicks > 0 ? medianBudget / clicks : 0;
    const costPerConversion = conversions > 0 ? medianBudget / conversions : 0;

    const forecast = {
      // ✅ MEDIAN VALUES CALCULATED FROM META R&F API MIN/MAX:
      audienceSize: medianAudienceSize,
      reach: medianReach,
      impressions: medianImpressions,
      cpm: parseFloat(cpm.toFixed(2)),
      budget: parseFloat(medianBudget.toFixed(2)),
      minimumBudget: parseFloat((minBudget / 100).toFixed(2)),
      maximumBudget: parseFloat((maxBudget / 100).toFixed(2)),
      frequencyCap: resultFrequencyCap,

      // Raw min/max values for reference
      rawMetrics: {
        reachRange: { min: minReach, max: maxReach },
        impressionsRange: { min: minImpressions, max: maxImpressions },
        budgetRange: { min: minBudget / 100, max: maxBudget / 100 },
        audienceSizeRange: { lower: audienceSizeLower, upper: audienceSizeUpper },
      },

      // Estimated metrics (since R&F API doesn't provide these):
      clicks,
      ctr: parseFloat((ctr * 100).toFixed(2)),
      cpc: parseFloat(cpc.toFixed(2)),
      results: conversions,
      resultType: body.strategyConfig?.metric || "conversions",
      conversionRate: parseFloat((conversionRate * 100).toFixed(2)),
      costPerResult: parseFloat(costPerConversion.toFixed(2)),
    };

    console.log("✅ Final R&F forecast (MEDIAN VALUES):", forecast);

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
