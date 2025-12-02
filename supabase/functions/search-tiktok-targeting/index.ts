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
    
    // TikTok doesn't have keyword search - fetch all categories and filter locally
    let fetchUrl: string;
    let fetchMethod: string = 'GET';
    let fetchBody: any = null;
    
    if (type === 'actions') {
      // Fetch all action categories
      fetchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/action_category/?advertiser_id=${advertiserId}`;
      fetchMethod = 'GET';
    } else {
      // Fetch interest categories (includes both interests and behaviors)
      fetchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/interest_category/?advertiser_id=${advertiserId}&language=en`;
      fetchMethod = 'GET';
    }
    
    console.log(`Fetching TikTok ${type} from: ${fetchUrl}`);
    
    const fetchOptions: RequestInit = {
      method: fetchMethod,
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    };
    
    if (fetchBody) {
      fetchOptions.body = JSON.stringify(fetchBody);
    }
    
    const fetchResponse = await fetch(fetchUrl, fetchOptions);

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      console.error('TikTok fetch error:', fetchResponse.status, errorText);
      throw new Error(`TikTok API error: ${fetchResponse.status}`);
    }

    const fetchData = await fetchResponse.json();
    
    console.log('TikTok API response code:', fetchData.code);
    
    if (fetchData.code !== 0) {
      console.error('TikTok API error code:', fetchData);
      throw new Error(`TikTok API error: ${fetchData.message || 'Unknown error'}`);
    }
    
    // Helper function to calculate relevance score
    const calculateRelevance = (item: any, searchQuery: string): number => {
      const name = (item.name || item.interest_category || '').toLowerCase();
      const description = (item.description || '').toLowerCase();
      
      // Clean query - be less aggressive with cleaning
      const cleanQuery = searchQuery
        .toLowerCase()
        .trim();
      
      if (!cleanQuery) return 0;
      
      const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
      if (queryWords.length === 0) return 0;
      
      let score = 0;
      
      // Exact name match gets highest score
      if (name === cleanQuery) score += 100;
      
      // Name contains full query
      if (name.includes(cleanQuery)) score += 50;
      
      // Name starts with query
      if (name.startsWith(cleanQuery)) score += 30;
      
      // Query starts with name (for broader categories)
      if (cleanQuery.startsWith(name) && name.length > 3) score += 25;
      
      // Partial word matches in name
      queryWords.forEach(word => {
        if (name === word) score += 20; // Exact word match
        if (name.includes(word)) score += 12; // Word contained in name
        if (word.length > 4 && name.includes(word.substring(0, 4))) score += 5; // Partial match
      });
      
      // Description matches (lower weight)
      queryWords.forEach(word => {
        if (description.includes(word)) score += 6;
      });
      
      return score;
    };
    
    // Deduplication helper
    const deduplicateResults = (items: any[]): any[] => {
      const seen = new Set<string>();
      return items.filter(item => {
        const key = `${item.id}-${(item.name || '').toLowerCase().trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    
    const results = [];
    
    // Handle different response structures
    if (type === 'actions') {
      const dataList = fetchData.data?.action_categories || fetchData.data?.list || [];
      console.log(`Processing ${dataList.length} TikTok action categories for "${query}"`);
      
      // Score and filter items - be more lenient with threshold
      const scoredItems = dataList
        .map((item: any) => ({
          item,
          score: calculateRelevance(item, query)
        }))
        .filter(({ score }: { score: number }) => score > 0)
        .sort((a: any, b: any) => b.score - a.score);
      
      console.log(`Found ${scoredItems.length} relevant action categories after filtering (scores > 0)`);
      
      // Deduplicate and take top 15
      const deduplicated = deduplicateResults(scoredItems.map((s: any) => s.item));
      
      for (let i = 0; i < Math.min(deduplicated.length, 15); i++) {
        const item = deduplicated[i];
        const itemId = item.action_category_id || item.id || `action-${i}`;
        results.push({
          id: String(itemId),
          name: item.name || query,
          description: item.description,
          audienceSize: undefined,
          type: 'behaviors'
        });
      }
    } else {
      // For interests using interest_category endpoint
      const categories = fetchData.data?.interest_categories || fetchData.data?.list || [];
      console.log(`Processing ${categories.length} TikTok interest categories for "${query}"`);
      
      // Score and filter items - be more lenient with threshold
      const scoredItems = categories
        .map((item: any) => ({
          item,
          score: calculateRelevance(item, query)
        }))
        .filter(({ score }: { score: number }) => score > 0)
        .sort((a: any, b: any) => b.score - a.score);
      
      console.log(`Found ${scoredItems.length} relevant interests after filtering (scores > 0)`);
      
      // Deduplicate and take top 15
      const deduplicated = deduplicateResults(scoredItems.map((s: any) => s.item));
      
      for (let i = 0; i < Math.min(deduplicated.length, 15); i++) {
        const item = deduplicated[i];
        const itemId = item.interest_category_id || item.id || `interest-${i}`;
        results.push({
          id: String(itemId),
          name: item.interest_category || item.name || query,
          description: item.description,
          audienceSize: item.coverage || undefined,
          type: 'interests'
        });
      }
    }

    console.log(`Returning ${results.length} TikTok ${type} results:`, results.slice(0, 5).map(r => ({ id: r.id, name: r.name })));

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
