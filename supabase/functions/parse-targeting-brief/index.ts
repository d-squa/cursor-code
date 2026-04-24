import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedTargeting {
  market: string;
  location?: string[];
  ageMin?: number;
  ageMax?: number;
  gender?: string[];
  devices?: string[];
  languages?: string[];
  os?: string[];
  interests?: Array<{ name: string; id: string; audienceSize?: number }>;
  behaviors?: Array<{ name: string; id: string; audienceSize?: number }>;
  customAudiences?: Array<{ name: string; id: string; type: string }>;
  lookalikes?: Array<{ name: string; id: string; sourceAudienceId: string }>;
  customerLists?: Array<{ name: string; id: string }>;
}

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

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { brief, adAccountId } = await req.json();

    console.log("Parsing targeting brief:", { brief, adAccountId, userId: user.id });

    // Get Meta access token - use service role to access the token field
    const supabaseServiceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: connection, error: connectionError } = await supabaseServiceClient
      .from("connected_platforms")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .maybeSingle();

    if (connectionError) {
      console.error("Connection lookup error:", connectionError);
      throw new Error("Failed to retrieve Meta connection");
    }

    if (!connection || !connection.access_token) {
      throw new Error("No active Meta connection found with access token");
    }

    const accessToken = connection.access_token;

    // Normalize ad account ID (remove 'act_' prefix if present, we'll add it back in API calls)
    const normalizedAccountId = adAccountId.replace(/^act_/, '');

    // Fetch available custom audiences from Meta
    const customAudiences = await fetchMetaCustomAudiences(accessToken, normalizedAccountId);

    // Use AI to parse the brief
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a targeting expert. Parse user briefs to extract targeting parameters.
Extract:
- Markets/Locations mentioned
- Age ranges (format: {min: X, max: Y} or {min: X+})
- Gender (male, female, all)
- Devices (if not mentioned: all devices)
- Languages (if not mentioned: all languages)  
- OS (if not mentioned: all os)
- Interests (extract keywords)
- Behaviors (extract keywords like "job", "online purchasers")
- Custom Audiences mentioned (retargeting, website visitors, etc.)
- Lookalikes mentioned
- Customer Lists mentioned

Return JSON only with this structure:
{
  "markets": [
    {
      "name": "Market Name",
      "targeting": {
        "location": ["country codes"],
        "ageMin": number or null,
        "ageMax": number or null,
        "gender": ["male"/"female"] or null,
        "devices": null (means all),
        "languages": null (means all),
        "os": null (means all),
        "interestKeywords": ["keyword1", "keyword2"],
        "behaviorKeywords": ["keyword1", "keyword2"],
        "hasCustomAudiences": boolean,
        "hasLookalikes": boolean,
        "hasCustomerLists": boolean
      }
    }
  ]
}`
          },
          {
            role: "user",
            content: brief
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      throw new Error(`AI parsing failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    
    // Clean AI response - remove markdown code blocks if present
    let aiContent = aiData.choices[0].message.content;
    aiContent = aiContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const parsedData = JSON.parse(aiContent);

    console.log("AI parsed data:", parsedData);

    // Enrich with Meta API data
    const enrichedMarkets = await Promise.all(
      parsedData.markets.map(async (market: any) => {
        const targeting = market.targeting;

        // Search interests
        const interests = await searchMetaTargeting(
          accessToken,
          normalizedAccountId,
          targeting.interestKeywords || [],
          "interests"
        );

        // Search behaviors
        const behaviors = await searchMetaTargeting(
          accessToken,
          normalizedAccountId,
          targeting.behaviorKeywords || [],
          "behaviors"
        );

        // Match custom audiences
        const matchedCustomAudiences = targeting.hasCustomAudiences
          ? matchCustomAudiences(customAudiences, brief, "custom")
          : [];

        const matchedLookalikes = targeting.hasLookalikes
          ? matchCustomAudiences(customAudiences, brief, "lookalike")
          : [];

        const matchedCustomerLists = targeting.hasCustomerLists
          ? matchCustomAudiences(customAudiences, brief, "customer_list")
          : [];

        return {
          market: market.name,
          location: targeting.location,
          ageMin: targeting.ageMin,
          ageMax: targeting.ageMax,
          gender: targeting.gender,
          devices: targeting.devices,
          languages: targeting.languages,
          os: targeting.os,
          interests,
          behaviors,
          customAudiences: matchedCustomAudiences,
          lookalikes: matchedLookalikes,
          customerLists: matchedCustomerLists,
        };
      })
    );

    return new Response(
      JSON.stringify({ targeting: enrichedMarkets }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error parsing targeting brief:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function fetchMetaCustomAudiences(accessToken: string, adAccountId: string) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/act_${adAccountId}/customaudiences?fields=id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.error("Failed to fetch custom audiences:", await response.text());
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching custom audiences:", error);
    return [];
  }
}

async function searchMetaTargeting(
  accessToken: string,
  adAccountId: string,
  keywords: string[],
  type: "interests" | "behaviors"
): Promise<Array<{ name: string; id: string; audienceSize?: number }>> {
  const results: Array<{ name: string; id: string; audienceSize?: number }> = [];

  for (const keyword of keywords) {
    try {
      const searchType = type === "interests" ? "adinterest" : "adTargetingCategory";
      const response = await fetch(
        `https://graph.facebook.com/v21.0/search?type=${searchType}&q=${encodeURIComponent(keyword)}&limit=5`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        console.error(`Failed to search ${type} for "${keyword}":`, await response.text());
        continue;
      }

      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        // Get audience size for each result
        for (const item of data.data) {
          try {
            const sizeResponse = await fetch(
              `https://graph.facebook.com/v21.0/act_${adAccountId}/reachestimate?targeting_spec=${encodeURIComponent(JSON.stringify({ 
                geo_locations: { countries: ["US"] },
                [type]: [{ id: item.id, name: item.name }]
              }))}`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );

            if (sizeResponse.ok) {
              const sizeData = await sizeResponse.json();
              results.push({
                name: item.name,
                id: item.id,
                audienceSize: sizeData.data?.users || undefined,
              });
            } else {
              results.push({
                name: item.name,
                id: item.id,
              });
            }
          } catch (error) {
            console.error(`Error fetching audience size for ${item.name}:`, error);
            results.push({
              name: item.name,
              id: item.id,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error searching ${type} for "${keyword}":`, error);
    }
  }

  return results;
}

function matchCustomAudiences(
  availableAudiences: any[],
  brief: string,
  subtypeFilter: string
): Array<{ name: string; id: string; type: string }> {
  const briefLower = brief.toLowerCase();
  const matched: Array<{ name: string; id: string; type: string }> = [];

  const relevanceKeywords: Record<string, string[]> = {
    custom: ["retarget", "website", "visitor", "engaged", "interacted"],
    lookalike: ["lookalike", "look-alike", "similar", "like these"],
    customer_list: ["customer", "list", "email", "crm"],
  };

  const keywords = relevanceKeywords[subtypeFilter] || [];

  for (const audience of availableAudiences) {
    // Filter by subtype
    if (subtypeFilter === "lookalike" && !audience.subtype?.toLowerCase().includes("lookalike")) {
      continue;
    }
    if (subtypeFilter === "customer_list" && audience.subtype !== "CUSTOMER_LIST") {
      continue;
    }
    if (subtypeFilter === "custom" && (audience.subtype?.toLowerCase().includes("lookalike") || audience.subtype === "CUSTOMER_LIST")) {
      continue;
    }

    // Check if audience name or brief mentions relevant keywords
    const audienceName = audience.name?.toLowerCase() || "";
    const isRelevant = keywords.some(kw => briefLower.includes(kw) || audienceName.includes(kw));

    if (isRelevant) {
      matched.push({
        name: audience.name,
        id: audience.id,
        type: audience.subtype || "CUSTOM",
      });
    }
  }

  return matched.slice(0, 5); // Limit to top 5 matches
}
