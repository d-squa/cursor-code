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

    const { brief, metaAdAccountId, tiktokAdvertiserId } = await req.json();

    if (!brief) {
      throw new Error('Brief is required');
    }

    console.log('Generating cross-platform AI recommendations:', { brief, metaAdAccountId, tiktokAdvertiserId });

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
            content: "You are an expert at analyzing product descriptions and extracting relevant advertising targeting keywords for both Meta and TikTok platforms. You MUST respond with ONLY valid JSON, no explanations, no markdown, no extra text."
          },
          {
            role: "user",
            content: `Analyze this product/audience brief and extract targeting keywords:\n\n${brief}\n\nIMPORTANT: Return ONLY valid JSON with this EXACT structure. Do NOT include any text outside the JSON object. Do NOT use markdown code fences. Do NOT add comments inside arrays.\n\n{\n  "interests": ["interest1", "interest2"],\n  "behaviors": ["behavior1", "behavior2"],\n  "demographics": ["demographic1", "demographic2"],\n  "demographicMetadata": {\n    "ageRange": "18-65",\n    "genders": ["all"],\n    "notes": "demographic insights"\n  }\n}\n\nFor demographics, include targeting options like: education level, job titles, income level, relationship status, life events, etc.`
          }
        ]
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI API error:', await aiResponse.text());
      throw new Error('Failed to generate recommendations');
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices[0].message.content;
    
    // Extract and parse JSON
    content = content.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) content = jsonMatch[0];
    
    const parsed = JSON.parse(content.trim());
    console.log('AI parsed brief:', parsed);

    const results: {
      meta: {
        interests: any[];
        behaviors: any[];
        demographics: any[];
      };
      tiktok: {
        interests: any[];
        behaviors: any[];
        demographics: any[];
      };
      matches: any[];
    } = {
      meta: { interests: [], behaviors: [], demographics: [] },
      tiktok: { interests: [], behaviors: [], demographics: [] },
      matches: []
    };

    // Search Meta if ad account provided
    if (metaAdAccountId) {
      const metaRecommendations = await supabaseClient.functions.invoke('generate-audience-recommendations', {
        body: { brief, adAccountId: metaAdAccountId }
      });
      
      if (metaRecommendations.data) {
        results.meta = {
          interests: (metaRecommendations.data.interests || []).map((r: any) => ({ ...r, platform: 'meta' })),
          behaviors: (metaRecommendations.data.behaviors || []).map((r: any) => ({ ...r, platform: 'meta' })),
          demographics: (metaRecommendations.data.demographics || []).map((r: any) => ({ ...r, platform: 'meta' }))
        };
      }
    }

    // Search TikTok if advertiser ID provided
    if (tiktokAdvertiserId) {
      // Search interests
      const tiktokInterests = await searchTikTokTargeting(
        parsed.interests || [],
        'interests',
        tiktokAdvertiserId,
        supabaseClient,
        user.id
      );
      
      // TikTok uses "actions" instead of "behaviors"
      const tiktokActions = await searchTikTokTargeting(
        parsed.behaviors || [],
        'actions',
        tiktokAdvertiserId,
        supabaseClient,
        user.id
      );
      
      results.tiktok = {
        interests: tiktokInterests.map(r => ({ ...r, platform: 'tiktok' })),
        behaviors: tiktokActions.map(r => ({ ...r, platform: 'tiktok' })),
        demographics: [] // TikTok has limited demographic targeting via API
      };
    }

    // Find cross-platform matches
    results.matches = findCrossPlatformMatches(
      [...results.meta.interests, ...results.meta.behaviors, ...results.meta.demographics],
      [...results.tiktok.interests, ...results.tiktok.behaviors]
    );

    console.log('Cross-platform recommendations generated:', {
      metaCount: results.meta.interests.length + results.meta.behaviors.length + results.meta.demographics.length,
      tiktokCount: results.tiktok.interests.length + results.tiktok.behaviors.length,
      matchesCount: results.matches.length
    });

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating cross-platform recommendations:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function searchTikTokTargeting(
  keywords: string[],
  type: string,
  advertiserId: string,
  supabaseClient: any,
  userId: string
): Promise<Array<{ name: string; id: string; audienceSize?: number }>> {
  const { data: platformData } = await supabaseClient
    .from('connected_platforms')
    .select('*')
    .eq('user_id', userId)
    .eq('platform_type', 'tiktok')
    .eq('is_active', true)
    .single();

  if (!platformData?.access_token) return [];

  const results = [];
  const seenIds = new Set();

  for (const keyword of keywords) {
    try {
      const response = await supabaseClient.functions.invoke('search-tiktok-targeting', {
        body: { query: keyword, type, advertiserId }
      });
      
      if (response.data?.results) {
        for (const result of response.data.results) {
          if (!seenIds.has(result.id)) {
            seenIds.add(result.id);
            results.push(result);
          }
        }
      }
    } catch (error) {
      console.error(`Error searching TikTok for ${keyword}:`, error);
    }
  }

  return results;
}

function findCrossPlatformMatches(metaResults: any[], tiktokResults: any[]): any[] {
  const matches = [];
  
  for (const metaItem of metaResults) {
    const metaName = metaItem.name.toLowerCase();
    
    for (const tiktokItem of tiktokResults) {
      const tiktokName = tiktokItem.name.toLowerCase();
      let score = 0;
      
      if (metaName === tiktokName) score = 100;
      else if (metaName.includes(tiktokName) || tiktokName.includes(metaName)) score = 80;
      else {
        const metaWords = metaName.split(/\s+/);
        const tiktokWords = tiktokName.split(/\s+/);
        const commonWords = metaWords.filter((w: string) => tiktokWords.includes(w));
        score = (commonWords.length / Math.max(metaWords.length, tiktokWords.length)) * 60;
      }
      
      if (score > 50) {
        matches.push({ meta: metaItem, tiktok: tiktokItem, score });
      }
    }
  }
  
  matches.sort((a, b) => b.score - a.score);
  return matches;
}
