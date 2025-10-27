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
    console.log("Meta R&F prediction request:", JSON.stringify(body, null, 2));

    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    const adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");

    if (!accessToken || !adAccountId) {
      console.error("Missing credentials - accessToken:", !!accessToken, "adAccountId:", !!adAccountId);
      throw new Error("Meta credentials not configured. Need META_ACCESS_TOKEN and META_AD_ACCOUNT_ID");
    }

    console.log("Using ad account for R&F:", adAccountId);

    // Validate and normalize markets to ISO-2 country codes
    const validatedMarkets: string[] = [];
    for (const market of body.markets) {
      console.log("*RF*Selected Market Before Normilization:", market);

      const normalized = market.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(normalized)) {
        throw new Error(`Invalid country code: "${market}". Must be 2-letter ISO code (e.g., US, CA, GB).`);
      }
      validatedMarkets.push(normalized);
    }

    // Step 1: Create Reach & Frequency prediction
    // API: POST https://graph.facebook.com/v21.0/act_{ad_account_id}/reachfrequencypredictions
    const predictionParams: Record<string, string> = {
      access_token: accessToken,
      target_spec: JSON.stringify({
        geo_locations: {
          countries: validatedMarkets,
        },
        age_min: body.ageMin || 18,
        age_max: body.ageMax || 65,
      }),
      budget: String(body.budget),
      buying_type: "RESERVED", // Required for R&F
      objective: body.objective || "REACH",
      prediction_mode: "1", // 0 = reach, 1 = r&f
    };

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

    // Step 2: Poll for prediction status
    // Predictions can take a few seconds to compute
    let attempts = 0;
    let predictionResult = null;

    while (attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s between checks

      const statusResponse = await fetch(
        `https://graph.facebook.com/v21.0/${predictionId}?access_token=${accessToken}&fields=id,prediction_progress,status,curve_budget_reach,external_budget,external_reach,external_impression`,
      );

      if (statusResponse.ok) {
        predictionResult = await statusResponse.json();
        console.log(`R&F prediction status (attempt ${attempts + 1}):`, predictionResult.status);

        if (predictionResult.status === 1) {
          // 1 = ready
          break;
        }
      }

      attempts++;
    }

    if (!predictionResult || predictionResult.status !== 1) {
      throw new Error("R&F prediction timed out or failed to complete");
    }

    // Step 3: Extract CPM and other metrics from curve_budget_reach
    const curves = predictionResult.curve_budget_reach || [];
    if (curves.length === 0) {
      throw new Error("No reach/frequency curve data available");
    }

    // Find the curve point closest to our budget
    const targetBudget = body.budget;
    const closestPoint = curves.reduce((prev: any, curr: any) => {
      return Math.abs(curr.budget - targetBudget) < Math.abs(prev.budget - targetBudget) ? curr : prev;
    });

    // Calculate CPM: (budget / impressions) * 1000
    const cpm = closestPoint.impression > 0 ? (closestPoint.budget / closestPoint.impression) * 1000 : 0;

    console.log("R&F results:", {
      budget: closestPoint.budget,
      reach: closestPoint.reach,
      impressions: closestPoint.impression,
      cpm: cpm.toFixed(2),
    });

    // Step 4: Calculate other metrics using industry benchmarks
    const ctr = 0.009; // 0.9% average CTR
    const conversionRate = 0.02; // 2% conversion rate

    const clicks = Math.round(closestPoint.impression * ctr);
    const conversions = Math.round(clicks * conversionRate);
    const cpc = clicks > 0 ? closestPoint.budget / clicks : 0;
    const costPerConversion = conversions > 0 ? closestPoint.budget / conversions : 0;

    const forecast = {
      audienceSize: closestPoint.reach * 2.5, // Estimate total addressable
      reach: closestPoint.reach,
      impressions: closestPoint.impression,
      cpm: parseFloat(cpm.toFixed(2)),
      clicks,
      ctr: parseFloat((ctr * 100).toFixed(2)),
      cpc: parseFloat(cpc.toFixed(2)),
      results: conversions,
      resultType: body.strategyConfig?.metric || "conversions",
      conversionRate: parseFloat((conversionRate * 100).toFixed(2)),
      costPerResult: parseFloat(costPerConversion.toFixed(2)),
    };

    console.log("Final R&F forecast:", forecast);

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
