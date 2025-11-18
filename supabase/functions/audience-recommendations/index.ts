import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { 
      description, 
      strategyFocus = "conversions", 
      platform = "Meta" 
    } = await req.json();

    console.log("Generating audience recommendations:", { description, strategyFocus, platform, userId: user.id });

    // Fetch available audiences from Meta
    const availableAudiences = await fetchAvailableAudiences(supabaseClient, user.id, platform);

    // Generate recommendations using rule-based algorithm
    const recommendations = generateRecommendations({
      description,
      strategyFocus,
      platform
    }, availableAudiences);

    return new Response(
      JSON.stringify({ recommendations }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating recommendations:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function fetchAvailableAudiences(supabaseClient: any, userId: string, platform: string) {
  const audiences = {
    customAudiences: [],
    lookalikeAudiences: [],
    savedAudiences: []
  };

  if (platform !== "Meta") {
    return audiences; // Platform not yet supported
  }

  try {
    // Get the active Meta connection
    const { data: connection } = await supabaseClient
      .from("connected_platforms")
      .select("*")
      .eq("user_id", userId)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .single();

    if (!connection) {
      console.log("No active Meta connection found");
      return audiences;
    }

    // Note: In a real implementation, you would call Meta's Graph API here
    // to fetch actual audiences. For now, we'll return a structure that can be populated.
    // Example: GET https://graph.facebook.com/v21.0/act_{ad_account_id}/customaudiences
    
    console.log("Meta connection found, would fetch audiences from Graph API");
    
    // TODO: Implement actual Meta API call
    // const accessToken = await supabaseClient.rpc('get_platform_token', { 
    //   platform_id: connection.id 
    // });
    // const metaResponse = await fetch(
    //   `https://graph.facebook.com/v21.0/act_${connection.ad_account_id}/customaudiences`,
    //   { headers: { Authorization: `Bearer ${accessToken}` } }
    // );

  } catch (error) {
    console.error("Error fetching available audiences:", error);
  }

  return audiences;
}

function generateRecommendations(userIntent: any, availableAudiences: any) {
  const { strategyFocus, description = "", platform } = userIntent;
  const recommendations: any[] = [];

  // Parse user intent
  const parsedIntent = description ? parseUserIntent(description) : null;

  // Determine target phases based on strategy focus
  const phasesMap: Record<string, string[]> = {
    "purchase": ["Conversion", "Consideration", "Awareness"],
    "leads": ["Conversion", "Consideration", "Awareness"],
    "app-installs": ["Conversion", "Consideration", "Awareness"],
    "conversions": ["Conversion", "Consideration", "Awareness"],
    "brand-awareness": ["Awareness", "Consideration"],
  };

  const targetPhases = phasesMap[strategyFocus] || ["Awareness", "Consideration", "Conversion"];
  const targetStrategies = parsedIntent?.detectedStrategies || ["Retarget", "Expand"];

  // 1. RETARGETING RECOMMENDATIONS
  if (targetStrategies.includes("Retarget")) {
    const retargetingItems = [
      {
        source: "Website",
        type: "Custom Audience",
        description: "Target website visitors who showed purchase intent",
        available: false,
        setupInstructions: "To create a Website Custom Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → Website. Install the Meta Pixel on your website first."
      },
      {
        source: "Customer List",
        type: "Custom Audience",
        description: "Target your existing customers",
        available: false,
        setupInstructions: "To create a Customer List Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → Customer List. Upload a CSV file with customer emails or phone numbers."
      },
      {
        source: "Facebook Page",
        type: "Custom Audience",
        description: "Target users who engaged with your Facebook Page",
        available: false,
        setupInstructions: "To create a Page Engagement Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → Facebook Page → People who engaged with your Page."
      },
      {
        source: "Instagram Account",
        type: "Custom Audience",
        description: "Target users who engaged with your Instagram Account",
        available: false,
        setupInstructions: "To create an Instagram Engagement Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → Instagram Business Account → People who engaged with your profile."
      },
      {
        source: "Video",
        type: "Custom Audience",
        description: "Target users who watched your videos",
        available: false,
        setupInstructions: "To create a Video Engagement Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → Video → People who watched your videos."
      }
    ];

    recommendations.push({
      category: "Retargeting",
      items: retargetingItems,
      justification: description 
        ? `Based on "${description}", retargeting past visitors and engagers is recommended.`
        : `Retargeting is recommended for ${strategyFocus} campaigns to convert warm audiences.`
    });
  }

  // 2. LOOKALIKE RECOMMENDATIONS
  if (targetStrategies.includes("Expand") && targetPhases.includes("Consideration")) {
    recommendations.push({
      category: "Lookalikes",
      items: [{
        source: "Lookalikes",
        type: "Lookalike Audience",
        description: "Create lookalike audiences from your custom audiences",
        available: false,
        setupInstructions: "To create a Lookalike Audience: Go to Meta Ads Manager → Audiences → Create Audience → Lookalike Audience. Select a source audience (minimum 100 people) and choose your target country."
      }],
      justification: "Lookalike audiences help you expand reach to users similar to your best customers."
    });
  }

  // 3. NEW ACQUISITION RECOMMENDATIONS
  if (targetStrategies.includes("Expand") && targetPhases.includes("Awareness")) {
    recommendations.push({
      category: "New Acquisition",
      items: [
        {
          source: "Interests",
          type: "New Audience",
          description: "Target users based on their interests",
          available: true
        },
        {
          source: "Behaviors",
          type: "New Audience",
          description: "Target users based on purchase behaviors and intent",
          available: true
        },
        {
          source: "Demographics",
          type: "New Audience",
          description: "Target users by demographic characteristics",
          available: true
        },
        {
          source: "Audience Expansion",
          type: "New Audience",
          description: "Let Meta find additional qualified users automatically",
          available: true
        }
      ],
      justification: description
        ? `Based on "${description}", expanding to new cold audiences is recommended.`
        : "Target new users through interests, demographics, and behaviors to grow awareness."
    });
  }

  return recommendations;
}

function parseUserIntent(description: string) {
  const text = description.toLowerCase();
  const detectedPhases: string[] = [];
  const detectedStrategies: string[] = [];

  // Detect retargeting intent
  const retargetKeywords = [
    "retarget", "re-target", "return", "comeback", "previous", "visited",
    "engaged", "interacted", "viewed", "abandoned", "existing"
  ];
  if (retargetKeywords.some(kw => text.includes(kw))) {
    detectedStrategies.push("Retarget");
  }

  // Detect expansion intent
  const expandKeywords = [
    "new", "expand", "grow", "reach", "acquisition", "acquire", "find",
    "similar", "lookalike", "cold", "prospecting"
  ];
  if (expandKeywords.some(kw => text.includes(kw))) {
    detectedStrategies.push("Expand");
  }

  // Detect phases
  if (["purchase", "buy", "convert", "sale"].some(kw => text.includes(kw))) {
    detectedPhases.push("Conversion");
  }
  if (["consider", "engage", "interact", "lead"].some(kw => text.includes(kw))) {
    detectedPhases.push("Consideration");
  }
  if (["aware", "discover", "brand", "reach"].some(kw => text.includes(kw))) {
    detectedPhases.push("Awareness");
  }

  // Default to all strategies if none detected
  if (detectedStrategies.length === 0) {
    detectedStrategies.push("Retarget", "Expand");
  }

  return { detectedPhases, detectedStrategies };
}
