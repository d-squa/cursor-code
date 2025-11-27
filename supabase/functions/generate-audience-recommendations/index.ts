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
            content: "You are an expert at analyzing product descriptions and extracting highly specific, contextually relevant Meta advertising targeting keywords. You MUST understand the PRIMARY PRODUCT CATEGORY first, then generate keywords exclusively relevant to that category. You MUST respond with ONLY valid JSON, no explanations, no markdown, no extra text."
          },
          {
            role: "user",
            content: `Analyze this product/audience brief and extract highly relevant targeting keywords:\n\n${brief}\n\nCRITICAL RULES:
1. FIRST: Identify the PRIMARY PRODUCT CATEGORY (e.g., "Pet Products", "Digital Services", "Human Food", "Fitness", etc.)
2. Extract interests that are DIRECTLY related to THIS SPECIFIC product category - NOT adjacent or unrelated categories
3. SEMANTIC FILTERING: If the product is for pets, DO NOT suggest human-focused categories (e.g., "Food & Drink" for pet food). If the product is digital services, DO NOT suggest physical retail categories.
4. NEVER suggest generic options like "Frequent travelers", "Travel", "Small business owners" unless EXPLICITLY mentioned in the brief
5. For behaviors, focus on purchase patterns and activities SPECIFIC to THIS product category only
6. For demographics, only include if CLEARLY implied by the brief (e.g., job titles, education levels directly relevant)
7. Be specific and narrow - prefer exact product-related interests over broad categories

Return ONLY valid JSON with this EXACT structure. Do NOT include any text outside the JSON object:\n\n{\n  "productCategory": "identify the main product category here",\n  "interests": ["highly specific interest 1 related to product category", "highly specific interest 2"],\n  "behaviors": ["specific purchase behavior 1 for this category", "specific activity behavior 2"],\n  "demographics": ["specific demographic 1 (only if clearly relevant)"],\n  "demographicMetadata": {\n    "ageRange": "18-65",\n    "genders": ["all"],\n    "notes": "demographic insights"\n  }\n}\n\nExamples:
- For "wet & dry food for dogs & cats, supplements and toys": 
  productCategory: "Pet Products"
  interests: ["Pets", "Pet", "Dogs", "Cats", "Pet Care", "Pet Supplies", "Dog Food", "Cat Food"]
  behaviors: ["Pet owners", "Online pet supply shoppers"]
  demographics: [] (not specific enough)
  ❌ DO NOT include: "Food & Drink", "Food Display", "Human food categories"
  
- For "digital marketing ebook": 
  productCategory: "Digital Education/Services"
  interests: ["Online Marketing", "SEO", "Social Media Marketing", "Content Marketing", "Email Marketing", "Digital Marketing"]
  behaviors: ["Online shoppers", "Digital content consumers"]
  demographics: [] (unless specific role mentioned)
  ❌ DO NOT include: "Outdoor Activities", "Travel", generic business categories`
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
    console.log('AI response:', content);

    // Extract JSON from response - handle various formats
    content = content.trim();
    
    // Remove markdown code fences
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Try to extract JSON object if there's extra text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }
    
    content = content.trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
      console.log('✅ AI PARSED BRIEF SUCCESSFULLY:', JSON.stringify(parsed, null, 2));
      console.log('📊 AI Extracted Interests:', parsed.interests || []);
      console.log('📊 AI Extracted Behaviors:', parsed.behaviors || []);
      console.log('📊 AI Extracted Demographics:', parsed.demographics || []);
      console.log('📊 AI Extracted Demographic Metadata:', parsed.demographicMetadata || {});
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      console.error('Parse error:', e instanceof Error ? e.message : String(e));
      throw new Error('Invalid AI response format');
    }

    console.log('🔍 Starting Meta API search for interests...');
    // Search Meta for interests with audience sizes
    const interests = await searchMetaTargeting(
      parsed.interests || [],
      'interests',
      accessToken,
      adAccountId
    );
    console.log('✅ Meta returned interests:', interests);

    console.log('🔍 Starting Meta API search for behaviors...');
    // Search Meta for behaviors with audience sizes
    const behaviors = await searchMetaTargeting(
      parsed.behaviors || [],
      'behaviors',
      accessToken,
      adAccountId
    );
    console.log('✅ Meta returned behaviors:', behaviors);

    console.log('🔍 Starting Meta API search for demographics...');
    // Search Meta for demographics with audience sizes
    const demographics = await searchMetaTargeting(
      parsed.demographics || [],
      'demographics',
      accessToken,
      adAccountId
    );
    console.log('✅ Meta returned demographics:', demographics);

    return new Response(
      JSON.stringify({
        interests,
        behaviors,
        demographics,
        demographicMetadata: parsed.demographicMetadata || {},
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
  type: 'interests' | 'behaviors' | 'demographics',
  accessToken: string,
  adAccountId: string
): Promise<Array<{ name: string; id: string; audienceSize?: number }>> {
  const apiVersion = 'v21.0';
  const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const results: Array<{ name: string; id: string; audienceSize?: number }> = [];
  const seenIds = new Set<string>();

  for (const keyword of keywords) {
    try {
      console.log(`🔎 Searching Meta for ${type}: "${keyword}"`);
      
      // Use correct endpoint for each type
      // For interests: use type=adinterest
      // For behaviors: use type=adTargetingCategory with class=behaviors
      // For demographics: use type=adTargetingCategory with class=demographics
      let searchUrl: string;
      if (type === 'interests') {
        searchUrl = `https://graph.facebook.com/${apiVersion}/search?type=adinterest&q=${encodeURIComponent(keyword)}&limit=10&access_token=${accessToken}`;
      } else {
        searchUrl = `https://graph.facebook.com/${apiVersion}/search?type=adTargetingCategory&class=${type}&q=${encodeURIComponent(keyword)}&limit=10&access_token=${accessToken}`;
      }
      
      console.log(`   🌐 Meta API URL: ${searchUrl.replace(accessToken, 'REDACTED')}`);
      const searchResponse = await fetch(searchUrl);

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        
        if (searchData.data && searchData.data.length > 0) {
          const match = searchData.data[0];
          console.log(`   ➡️ Meta matched "${keyword}" to: "${match.name}" (ID: ${match.id})`);
          
          // Skip if we've already added this ID (deduplication)
          if (seenIds.has(match.id)) {
            console.log(`   ⚠️ Skipping duplicate: ${match.name} (${match.id})`);
            continue;
          }
          seenIds.add(match.id);
          
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

  console.log(`Found ${results.length} unique ${type} after deduplication`);
  return results;
}
