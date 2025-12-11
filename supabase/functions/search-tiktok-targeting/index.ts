import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

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

    // Get user's TikTok connection and retrieve token from Vault
    const { data: platformData, error: platformError } = await supabaseClient
      .from('connected_platforms')
      .select('id, access_token')
      .eq('user_id', user.id)
      .eq('platform_type', 'tiktok')
      .eq('is_active', true)
      .single();

    if (platformError || !platformData) {
      throw new Error('TikTok platform not connected');
    }

    // Get token from Vault with fallback to database column
    const accessToken = await getAccessToken(supabaseClient, platformData.id, platformData.access_token);
    if (!accessToken) {
      throw new Error('TikTok access token not found');
    }

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
    
    // Helper function to calculate relevance score - VERY lenient for better results
    const calculateRelevance = (item: any, searchQuery: string): number => {
      // Try ALL possible field names that TikTok might use
      const possibleNames = [
        item.interest_category,
        item.interest_name,
        item.name,
        item.category_name,
        item.action_category_name,
        item.action_name,
        item.display_name,
        item.title
      ];
      
      // Log the item structure once to see what fields exist
      if (Math.random() < 0.01) { // Log 1% of items to avoid spam
        console.log('[Field Debug] Item structure:', JSON.stringify(Object.keys(item)));
      }
      
      const name = possibleNames.find(n => n && String(n).trim().length > 0);
      const nameStr = name ? String(name).toLowerCase() : '';
      const description = (item.description || '').toLowerCase();
      
      const cleanQuery = searchQuery.toLowerCase().trim();
      
      if (!cleanQuery || !nameStr) {
        return 0;
      }
      
      const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 1);
      if (queryWords.length === 0) return 0;
      
      let score = 0;
      
      // Exact match
      if (nameStr === cleanQuery) return 100;
      
      // Contains full query
      if (nameStr.includes(cleanQuery)) score += 50;
      if (description.includes(cleanQuery)) score += 20;
      
      // Word overlap scoring
      for (const word of queryWords) {
        if (nameStr.includes(word)) score += 15;
        if (description.includes(word)) score += 5;
      }
      
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
      
      // Score all items - NO FILTERING, just sort by score
      const scoredItems = dataList
        .map((item: any) => ({
          item,
          score: calculateRelevance(item, query),
          name: item.name || 'Unknown'
        }))
        .sort((a: any, b: any) => b.score - a.score);
      
      console.log(`Scored ${scoredItems.length} action categories. Top 5 scores:`, 
        scoredItems.slice(0, 5).map((s: any) => ({ name: s.name, score: s.score })));
      
      // Deduplicate and take top 20 with ANY score
      const itemsWithScore = scoredItems.filter((s: any) => s.score > 0);
      const deduplicated = deduplicateResults(itemsWithScore.map((s: any) => s.item));
      
      console.log(`After deduplication: ${deduplicated.length} unique action categories`);
      
      for (let i = 0; i < Math.min(deduplicated.length, 20); i++) {
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
      
      // Log first few items to debug structure
      if (categories.length > 0) {
        console.log('Sample interest category structure:', JSON.stringify(categories.slice(0, 3), null, 2));
      }
      
      // Score all items - NO FILTERING, just sort by score
      const scoredItems = categories
        .map((item: any) => ({
          item,
          score: calculateRelevance(item, query),
          name: item.interest_category || item.name || 'Unknown'
        }))
        .sort((a: any, b: any) => b.score - a.score);
      
      console.log(`Scored ${scoredItems.length} interest categories. Top 5 scores:`, 
        scoredItems.slice(0, 5).map((s: any) => ({ name: s.name, score: s.score })));
      
      // Deduplicate and take top 20 with ANY score
      const itemsWithScore = scoredItems.filter((s: any) => s.score > 0);
      const deduplicated = deduplicateResults(itemsWithScore.map((s: any) => s.item));
      
      console.log(`After deduplication: ${deduplicated.length} unique interest categories`);
      
      for (let i = 0; i < Math.min(deduplicated.length, 20); i++) {
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
