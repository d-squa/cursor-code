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
            content: "You are an expert at analyzing product descriptions and extracting highly specific, contextually relevant advertising targeting keywords. You MUST understand the PRIMARY PRODUCT CATEGORY first, then generate keywords exclusively relevant to that category. You MUST respond with ONLY valid JSON, no explanations, no markdown, no extra text."
          },
          {
            role: "user",
            content: `Analyze this product/audience brief and extract highly relevant targeting keywords:\n\n${brief}\n\nCRITICAL RULES:
1. FIRST: Identify the PRIMARY PRODUCT CATEGORY (e.g., "Pet Products", "Digital Services", "Human Food", "Fitness", etc.)
2. Extract interests that are DIRECTLY related to THIS SPECIFIC product category - NOT adjacent or unrelated categories
3. SEMANTIC FILTERING: If the product is for pets, DO NOT suggest human-focused categories (e.g., "Food & Drink" for pet food). If the product is digital services, DO NOT suggest physical retail or unrelated categories (e.g., "Outdoor Activities" for ebooks).
4. NEVER suggest generic options like "Frequent travelers", "Travel", "Small business owners" unless EXPLICITLY mentioned in the brief
5. For behaviors, focus on purchase patterns and activities SPECIFIC to THIS product category only
6. For purchaseIntention, use category-specific purchase intents (e.g., "Pet Supplies" not "Food & Beverage" for pet products)
7. For videoInteractions, focus on content themes directly related to the product category

Return ONLY valid JSON with this EXACT structure. Do NOT include any text outside the JSON object:\n\n{\n  "productCategory": "identify the main product category here",\n  "interests": ["highly specific interest 1 related to product category", "highly specific interest 2"],\n  "behaviors": ["specific behavior 1 for this category", "specific behavior 2"],\n  "demographics": ["specific demographic 1 (only if clearly relevant)"],\n  "purchaseIntention": ["category-specific purchase intent 1", "purchase intent 2"],\n  "videoInteractions": ["product category video topic 1", "video topic 2"],\n  "demographicMetadata": {\n    "ageRange": "18-65",\n    "genders": ["all"],\n    "notes": "demographic insights"\n  }\n}\n\nExamples:
- For "wet & dry food for dogs & cats, supplements and toys": 
  productCategory: "Pet Products"
  interests: ["Pets", "Pet", "Dogs", "Cats", "Pet Care", "Pet Supplies", "Dog Food", "Cat Food"]
  behaviors: ["Pet owners", "Online pet supply shoppers"]
  purchaseIntention: ["Pet Supplies", "Pet Food", "Pet Toys"]
  videoInteractions: ["Pet Care Tips", "Dog Training", "Cat Care"]
  ❌ DO NOT include: "Food & Drink", "Food Display", "Human food categories", "Outdoor Activities"
  
- For "digital marketing ebook":
  productCategory: "Digital Education/Services"
  interests: ["Online Marketing", "SEO", "Social Media Marketing", "Content Marketing", "Digital Marketing"]
  behaviors: ["Online shoppers", "Digital content consumers"]
  purchaseIntention: ["Online Courses", "E-books", "Digital Products"]
  videoInteractions: ["Marketing Tutorials", "Business Tips", "SEO Guides"]
  ❌ DO NOT include: "Outdoor Activities", generic business, unrelated categories`
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
      try {
        const metaRecommendations = await supabaseClient.functions.invoke('generate-audience-recommendations', {
          body: { brief, adAccountId: metaAdAccountId },
          headers: { Authorization: authHeader }
        });
        
        if (metaRecommendations.error) {
          console.error('Meta recommendations error:', metaRecommendations.error);
        } else if (metaRecommendations.data) {
          console.log('Meta recommendations received:', {
            interests: metaRecommendations.data.interests?.length || 0,
            behaviors: metaRecommendations.data.behaviors?.length || 0,
            demographics: metaRecommendations.data.demographics?.length || 0
          });
          results.meta = {
            interests: (metaRecommendations.data.interests || []).map((r: any) => ({ ...r, platform: 'meta' })),
            behaviors: (metaRecommendations.data.behaviors || []).map((r: any) => ({ ...r, platform: 'meta' })),
            demographics: (metaRecommendations.data.demographics || []).map((r: any) => ({ ...r, platform: 'meta' }))
          };
        }
      } catch (error) {
        console.error('Error calling generate-audience-recommendations:', error);
      }
    }

    // Search TikTok across all targeting categories if advertiser ID provided
    if (tiktokAdvertiserId) {
      try {
        // 1. Search interests
        const tiktokInterests = await searchTikTokTargeting(
          parsed.interests || [],
          'interests',
          tiktokAdvertiserId,
          supabaseClient,
          user.id,
          authHeader
        );
        
        // 2. Search behaviors (TikTok calls these "actions")
        const tiktokBehaviors = await searchTikTokTargeting(
          parsed.behaviors || [],
          'behaviors',
          tiktokAdvertiserId,
          supabaseClient,
          user.id,
          authHeader
        );
        
        // 3. Search purchase intention
        const tiktokPurchaseIntent = await searchTikTokTargeting(
          parsed.purchaseIntention || [],
          'actions',
          tiktokAdvertiserId,
          supabaseClient,
          user.id,
          authHeader
        );
        
        // 4. Search video interactions
        const tiktokVideoInteractions = await searchTikTokTargeting(
          parsed.videoInteractions || [],
          'interests',
          tiktokAdvertiserId,
          supabaseClient,
          user.id,
          authHeader
        );
        
        console.log('TikTok recommendations received across all categories:', {
          interests: tiktokInterests.length,
          behaviors: tiktokBehaviors.length,
          purchaseIntent: tiktokPurchaseIntent.length,
          videoInteractions: tiktokVideoInteractions.length
        });
        
        // Combine and deduplicate all TikTok results
        const allTikTokInterests = [...tiktokInterests, ...tiktokVideoInteractions];
        const allTikTokBehaviors = [...tiktokBehaviors, ...tiktokPurchaseIntent];
        
        // Deduplicate by ID
        const uniqueInterests = Array.from(
          new Map(allTikTokInterests.map(item => [item.id, item])).values()
        );
        const uniqueBehaviors = Array.from(
          new Map(allTikTokBehaviors.map(item => [item.id, item])).values()
        );
        
        results.tiktok = {
          interests: uniqueInterests.map(r => ({ ...r, platform: 'tiktok' })),
          behaviors: uniqueBehaviors.map(r => ({ ...r, platform: 'tiktok' })),
          demographics: []
        };
      } catch (error) {
        console.error('Error searching TikTok targeting:', error);
      }
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
  userId: string,
  authHeader: string
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
        body: { query: keyword, type, advertiserId },
        headers: { Authorization: authHeader }
      });
      
      if (response.error) {
        console.error(`TikTok search error for ${keyword}:`, response.error);
      } else if (response.data?.results) {
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
