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

    const { query, type, advertiserId } = await req.json();

    if (!query || !type || !advertiserId) {
      throw new Error('Query, type, and Advertiser ID are required');
    }

    if (!['interests', 'behaviors', 'actions'].includes(type)) {
      throw new Error('Type must be interests, behaviors, or actions');
    }

    console.log('Searching TikTok targeting:', { query, type, advertiserId });

    // Get user's TikTok access token
    const { data: platformData, error: platformError } = await supabaseClient
      .from('connected_platforms')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform_type', 'tiktok')
      .eq('is_active', true)
      .single();

    if (platformError || !platformData?.access_token) {
      throw new Error('TikTok platform not connected');
    }

    const accessToken = platformData.access_token;
    const apiVersion = 'v1.3';
    
    // TikTok Interest and Action Category API
    // Documentation: https://business-api.tiktok.com/portal/docs?id=1736275204260866
    let searchUrl: string;
    let searchBody: any;
    
    if (type === 'interests' || type === 'behaviors') {
      // TikTok uses /tool/targeting_category/recommend/ (singular 'tool')
      // This endpoint returns both interests and action categories
      searchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/targeting_category/recommend/`;
      searchBody = {
        advertiser_id: advertiserId,
        objective_type: "CONVERSIONS", // Can be adjusted based on campaign objective
        placements: ["PLACEMENT_TIKTOK"], // TikTok placement
        budget: 100, // Minimum budget for recommendation
        region_codes: ["US", "GB", "CA", "AU", "DE", "FR", "IT", "ES"], // Required field - major markets
        ...(query && { targeting_word_ids: [query] }) // Optional keyword filtering
      };
    } else if (type === 'actions') {
      // TikTok uses /tool/action_category/ (singular 'tool')
      searchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/action_category/`;
      searchBody = {
        advertiser_id: advertiserId,
        special_industries: [] // Can be customized based on ad account
      };
    } else {
      // Fallback to targeting category recommend
      searchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/targeting_category/recommend/`;
      searchBody = {
        advertiser_id: advertiserId,
        objective_type: "CONVERSIONS",
        placements: ["PLACEMENT_TIKTOK"],
        budget: 100
      };
    }
    
    console.log(`Searching TikTok ${type} with URL: ${searchUrl}`);
    
    let searchResponse;
    if (type === 'actions') {
      // action_category uses GET with query parameters
      const url = new URL(searchUrl);
      url.searchParams.append('advertiser_id', advertiserId);
      
      searchResponse = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Access-Token': accessToken
        }
      });
    } else {
      // targeting_category/recommend uses POST with body
      searchResponse = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchBody)
      });
    }

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('TikTok search error:', searchResponse.status, errorText);
      throw new Error(`TikTok API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    
    console.log('TikTok API full response:', JSON.stringify(searchData, null, 2));
    
    if (searchData.code !== 0) {
      console.error('TikTok API error code:', searchData);
      throw new Error(`TikTok API error: ${searchData.message}`);
    }
    
    // Helper function to calculate relevance score
    const calculateRelevance = (item: any, searchQuery: string): number => {
      const name = (item.name || '').toLowerCase();
      const description = (item.description || '').toLowerCase();
      
      // Remove platform-specific terms and clean query
      const cleanQuery = searchQuery
        .toLowerCase()
        .replace(/\b(instagram|facebook|meta|retargeting|website|custom|saved|audience)\b/gi, '')
        .replace(/\(.*?\)/g, '')
        .replace(/[^\w\s]/g, '')
        .trim();
      
      if (!cleanQuery) return 0;
      
      const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
      if (queryWords.length === 0) return 0;
      
      let score = 0;
      
      // Exact name match gets highest score
      if (name === cleanQuery) score += 100;
      
      // Name contains full query
      if (name.includes(cleanQuery)) score += 50;
      
      // Count matching words
      queryWords.forEach(word => {
        if (name.includes(word)) score += 10;
        if (description.includes(word)) score += 5;
      });
      
      return score;
    };
    
    // Deduplication helper
    const deduplicateResults = (items: any[]): any[] => {
      const seen = new Set<string>();
      return items.filter(item => {
        const normalizedName = (item.name || '').toLowerCase().trim();
        if (seen.has(normalizedName)) return false;
        seen.add(normalizedName);
        return true;
      });
    };
    
    const results = [];
    
    // Handle different response structures
    if (type === 'actions') {
      const dataList = searchData.data?.action_categories || [];
      console.log(`Processing ${dataList.length} TikTok action categories for "${query}"`);
      
      // Score and filter items
      const scoredItems = dataList
        .map((item: any) => ({
          item,
          score: calculateRelevance(item, query)
        }))
        .filter(({ score }: { score: number }) => score > 10)
        .sort((a: any, b: any) => b.score - a.score);
      
      console.log(`Found ${scoredItems.length} relevant action categories after filtering (scores > 10)`);
      
      // Deduplicate and take top 10
      const deduplicated = deduplicateResults(scoredItems.map((s: any) => s.item));
      
      for (let i = 0; i < Math.min(deduplicated.length, 10); i++) {
        const item = deduplicated[i];
        const itemId = item.action_category_id || item.id || `action-${query}-${i}`;
        results.push({
          id: String(itemId),
          name: item.name || query,
          description: item.description,
          audienceSize: undefined,
          type: type
        });
      }
    } else {
      // For interests and behaviors using targeting_category/recommend
      const categories = searchData.data?.interest_categories || searchData.data?.categories || [];
      console.log(`Processing ${categories.length} TikTok ${type} results for "${query}"`);
      
      // Score and filter items
      const scoredItems = categories
        .map((item: any) => ({
          item,
          score: calculateRelevance(item, query)
        }))
        .filter(({ score }: { score: number }) => score > 10)
        .sort((a: any, b: any) => b.score - a.score);
      
      console.log(`Found ${scoredItems.length} relevant ${type} after filtering (scores > 10)`);
      
      // Deduplicate and take top 10
      const deduplicated = deduplicateResults(scoredItems.map((s: any) => s.item));
      
      for (let i = 0; i < Math.min(deduplicated.length, 10); i++) {
        const item = deduplicated[i];
        const itemId = item.interest_category_id || item.category_id || item.id || `interest-${query}-${i}`;
        results.push({
          id: String(itemId),
          name: item.interest_category || item.category || item.name || query,
          description: item.description,
          audienceSize: item.coverage || undefined,
          type: type
        });
      }
    }

    console.log(`Returning ${results.length} TikTok ${type} results:`, results.map(r => ({ id: r.id, name: r.name })));

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error searching TikTok targeting:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
