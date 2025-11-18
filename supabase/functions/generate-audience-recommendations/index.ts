import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { brief, adAccountId } = await req.json();

    if (!brief || !adAccountId) {
      throw new Error('Brief and Ad Account ID are required');
    }

    console.log('Generating recommendations for:', { brief, adAccountId });

    // Get user's Meta access token
    const { data: platformData, error: platformError } = await supabaseClient
      .from('connected_platforms')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform_type', 'meta')
      .eq('is_active', true)
      .single();

    if (platformError || !platformData?.access_token) {
      throw new Error('Meta platform not connected');
    }

    const accessToken = platformData.access_token;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    // Use AI to extract targeting keywords
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are an expert at analyzing product descriptions and extracting relevant Meta advertising targeting keywords. Extract 5-8 interests, 3-5 behaviors, and key demographics that would be relevant for targeting."
          },
          {
            role: "user",
            content: `Analyze this product/audience brief and extract targeting keywords:\n\n${brief}\n\nReturn ONLY a JSON object with this exact structure:\n{\n  "interests": ["interest1", "interest2", ...],\n  "behaviors": ["behavior1", "behavior2", ...],\n  "demographics": {\n    "ageRange": "18-65",\n    "genders": ["all"],\n    "notes": "any specific demographic insights"\n  }\n}`
          }
        ]
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI API error:', await aiResponse.text());
      throw new Error('Failed to generate recommendations');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0].message.content;
    console.log('AI response:', content);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Invalid AI response format');
    }

    // Search Meta for interests with audience sizes
    const interests = await searchMetaTargeting(
      parsed.interests || [],
      'interests',
      accessToken,
      adAccountId
    );

    // Search Meta for behaviors with audience sizes
    const behaviors = await searchMetaTargeting(
      parsed.behaviors || [],
      'behaviors',
      accessToken,
      adAccountId
    );

    return new Response(
      JSON.stringify({
        interests,
        behaviors,
        demographics: parsed.demographics || {},
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating recommendations:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function searchMetaTargeting(
  keywords: string[],
  type: 'interests' | 'behaviors',
  accessToken: string,
  adAccountId: string
): Promise<Array<{ name: string; id: string; audienceSize?: number }>> {
  const apiVersion = 'v21.0';
  const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const results: Array<{ name: string; id: string; audienceSize?: number }> = [];

  for (const keyword of keywords) {
    try {
      const searchUrl = `https://graph.facebook.com/${apiVersion}/search?type=adTargetingCategory&class=${type}&q=${encodeURIComponent(keyword)}&access_token=${accessToken}`;
      const searchResponse = await fetch(searchUrl);

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        
        if (searchData.data && searchData.data.length > 0) {
          const match = searchData.data[0];
          
          // Try to get audience size estimate
          let audienceSize;
          try {
            const reachUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/reachestimate?targeting_spec=${encodeURIComponent(JSON.stringify({
              geo_locations: { countries: ['US'] },
              [type]: [{ id: match.id }]
            }))}&access_token=${accessToken}`;
            
            const reachResponse = await fetch(reachUrl);
            if (reachResponse.ok) {
              const reachData = await reachResponse.json();
              if (reachData.data && reachData.data[0]) {
                audienceSize = Math.round((reachData.data[0].estimate_mau_lower_bound + reachData.data[0].estimate_mau_upper_bound) / 2);
              }
            }
          } catch (e) {
            console.log('Could not fetch reach estimate for', match.name);
          }

          results.push({
            name: match.name,
            id: match.id,
            audienceSize
          });
        }
      }
    } catch (error) {
      console.error(`Error searching for ${keyword}:`, error);
    }
  }

  return results;
}
