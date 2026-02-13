import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    console.log("AI forecast request for user:", user.id);

    const {
      platform,
      market,
      budget,
      strategyFocus,
      objective,
      optimizationGoal,
      destination,
      ageMin,
      ageMax,
      gender,
      startDate,
      endDate,
      industry,
      phaseName,
    } = body;

    if (!budget || budget <= 0) {
      throw new Error("Budget must be greater than 0");
    }
    if (!market) {
      throw new Error("Market is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Look up any benchmark data we have for this market/goal
    let benchmarkContext = "";
    try {
      const { data: benchmarks } = await supabase
        .from("campaign_performance_benchmarks")
        .select("*")
        .eq("user_id", user.id)
        .ilike("market", market)
        .limit(10);

      if (benchmarks && benchmarks.length > 0) {
        benchmarkContext = `\n\nHistorical benchmark data for this advertiser in ${market}:\n`;
        for (const b of benchmarks) {
          benchmarkContext += `- ${b.optimization_goal}: CPR=$${b.avg_cost_per_result?.toFixed(2) || "N/A"}, Spend=$${b.total_spend}, Results=${b.total_results}, Impressions=${b.impressions}, Campaigns=${b.campaign_count}, Platform=${b.platform}\n`;
        }
      }
    } catch (e) {
      console.warn("Could not fetch benchmarks for AI context:", e);
    }

    // Calculate campaign duration
    let durationDays = 30;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    }

    const prompt = `You are a digital advertising performance forecasting expert. Based on the following campaign configuration, predict the campaign performance metrics. Return ONLY a valid JSON object with no additional text.

Campaign Configuration:
- Platform: ${platform || "Meta"}
- Market/Country: ${market}
- Total Budget: $${budget}
- Campaign Duration: ${durationDays} days (${startDate || "N/A"} to ${endDate || "N/A"})
- Strategy Focus: ${strategyFocus || "conversions"}
- Objective: ${objective || "N/A"}
- Optimization Goal: ${optimizationGoal || "N/A"}
- Destination: ${destination || "Website"}
- Target Age: ${ageMin || 18}-${ageMax || 65}
- Target Gender: ${gender || "all"}
- Industry: ${industry || "General"}
- Phase: ${phaseName || "N/A"}
${benchmarkContext}

Based on current ${platform || "Meta"} advertising benchmarks for ${market} market in the ${industry || "general"} industry, predict:

Return this exact JSON structure:
{
  "reach": <number - estimated unique users reached>,
  "impressions": <number - estimated total impressions>,
  "cpm": <number - cost per 1000 impressions in dollars>,
  "frequency": <number - average times each user sees the ad>,
  "clicks": <number - estimated clicks>,
  "ctr": <number - click-through rate as percentage>,
  "results": <number - estimated results based on optimization goal>,
  "costPerResult": <number - cost per result in dollars>,
  "resultRate": <number - result rate as percentage>,
  "audienceSize": <number - estimated total addressable audience>,
  "confidence": <string - "high", "medium", or "low" based on data availability>
}

Important guidelines:
- Use realistic ${platform || "Meta"} benchmarks for ${market}
- CPM should reflect actual market rates for ${market} (varies significantly by country)
- Consider the optimization goal "${optimizationGoal || "OFFSITE_CONVERSIONS"}" when calculating results
- If benchmark data is provided above, use it to ground your predictions
- Scale metrics proportionally to the $${budget} budget over ${durationDays} days
- Be conservative rather than optimistic in estimates`;

    console.log("Calling Lovable AI for forecast prediction...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a digital advertising performance prediction engine. You ONLY respond with valid JSON objects. No markdown, no explanation, just pure JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", status, errorText);
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    console.log("AI raw response:", content);

    // Parse JSON from AI response (strip markdown code blocks if present)
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "").trim();
    }

    let prediction: any;
    try {
      prediction = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("Failed to parse AI response as JSON:", jsonStr);
      throw new Error("AI returned invalid forecast data");
    }

    // Validate and normalize the prediction
    const forecast = {
      reach: Math.round(Number(prediction.reach) || 0),
      impressions: Math.round(Number(prediction.impressions) || 0),
      cpm: Number(prediction.cpm) || 10,
      frequency: Number(prediction.frequency) || 2,
      clicks: Math.round(Number(prediction.clicks) || 0),
      ctr: Number(prediction.ctr) || 0.9,
      results: Math.round(Number(prediction.results) || 0),
      costPerResult: Number(prediction.costPerResult) || 0,
      resultRate: Number(prediction.resultRate) || 0,
      audienceSize: Math.round(Number(prediction.audienceSize) || 0),
      confidence: prediction.confidence || "medium",
      dataSource: "ai_predicted",
      platform: platform || "meta",
    };

    // Sanity checks - ensure ALL metrics are meaningful (no zeros)
    if (forecast.impressions <= 0 && budget > 0) {
      forecast.impressions = Math.round((budget / forecast.cpm) * 1000);
    }
    if (forecast.reach <= 0) {
      forecast.reach = Math.round(forecast.impressions * 0.6);
    }
    if (forecast.audienceSize <= 0) {
      forecast.audienceSize = forecast.reach * 10;
    }
    if (forecast.clicks <= 0 && forecast.impressions > 0) {
      forecast.clicks = Math.round(forecast.impressions * (forecast.ctr / 100));
    }
    if (forecast.results <= 0 && forecast.clicks > 0) {
      forecast.results = Math.max(1, Math.round(forecast.clicks * 0.02));
    }
    if (forecast.costPerResult <= 0 && forecast.results > 0) {
      forecast.costPerResult = parseFloat((budget / forecast.results).toFixed(2));
    }
    if (forecast.resultRate <= 0 && forecast.impressions > 0 && forecast.results > 0) {
      forecast.resultRate = parseFloat(((forecast.results / forecast.impressions) * 100).toFixed(2));
    }
    if (forecast.frequency <= 0 && forecast.reach > 0) {
      forecast.frequency = parseFloat((forecast.impressions / forecast.reach).toFixed(1));
    }

    console.log("AI forecast result:", forecast);

    return new Response(JSON.stringify(forecast), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("AI forecast error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: "AI-powered forecast failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
