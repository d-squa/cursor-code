import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UnifiedTargetingItem {
  id: string;
  name: string;
  description?: string;
  category: 'interest' | 'behavior' | 'demographic';
  platforms: ('meta' | 'tiktok')[];
  metaId?: string;
  tiktokId?: string;
}

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

    const { query, metaAdAccountId, tiktokAdvertiserId } = await req.json();

    if (!query) {
      throw new Error('Search query is required');
    }

    console.log('Unified search for:', query);

    const results: UnifiedTargetingItem[] = [];
    const metaResults = new Map<string, any>();
    const tiktokResults = new Map<string, any>();

    // Search Meta if account is provided
    if (metaAdAccountId) {
      console.log('Searching Meta...');
      
      // Get Meta platform connection
      const { data: metaPlatform } = await supabaseClient
        .from('connected_platforms')
        .select('*')
        .eq('user_id', user.id)
        .eq('platform_type', 'meta')
        .eq('is_active', true)
        .single();

      if (metaPlatform?.access_token) {
        // Search all Meta categories in parallel
        const [interests, behaviors, demographics] = await Promise.all([
          searchMetaCategory(metaPlatform.access_token, metaAdAccountId, 'interests', query),
          searchMetaCategory(metaPlatform.access_token, metaAdAccountId, 'behaviors', query),
          searchMetaCategory(metaPlatform.access_token, metaAdAccountId, 'demographics', query)
        ]);

        interests.forEach((item: any) => metaResults.set(item.name.toLowerCase(), { ...item, category: 'interest' }));
        behaviors.forEach((item: any) => metaResults.set(item.name.toLowerCase(), { ...item, category: 'behavior' }));
        demographics.forEach((item: any) => metaResults.set(item.name.toLowerCase(), { ...item, category: 'demographic' }));
      }
    }

    // Search TikTok if account is provided
    if (tiktokAdvertiserId) {
      console.log('Searching TikTok...');
      
      // Get TikTok platform connection
      const { data: tiktokPlatform } = await supabaseClient
        .from('connected_platforms')
        .select('*')
        .eq('user_id', user.id)
        .eq('platform_type', 'tiktok')
        .eq('is_active', true)
        .single();

      if (tiktokPlatform?.access_token) {
        // Search TikTok categories
        const [interests, behaviors] = await Promise.all([
          searchTikTokCategory(tiktokPlatform.access_token, tiktokAdvertiserId, 'interests', query),
          searchTikTokCategory(tiktokPlatform.access_token, tiktokAdvertiserId, 'actions', query)
        ]);

        interests.forEach((item: any) => tiktokResults.set(item.name.toLowerCase(), { ...item, category: 'interest' }));
        behaviors.forEach((item: any) => tiktokResults.set(item.name.toLowerCase(), { ...item, category: 'behavior' }));
      }
    }

    // Merge results - find matches and unique items
    const processedNames = new Set<string>();

    // Process Meta results
    metaResults.forEach((metaItem, key) => {
      const tiktokItem = tiktokResults.get(key);
      
      if (tiktokItem) {
        // Found on both platforms
        results.push({
          id: `unified-${key}`,
          name: metaItem.name,
          description: metaItem.description || tiktokItem.description,
          category: metaItem.category,
          platforms: ['meta', 'tiktok'],
          metaId: metaItem.id,
          tiktokId: tiktokItem.id
        });
        processedNames.add(key);
      } else {
        // Meta only
        results.push({
          id: `meta-${metaItem.id}`,
          name: metaItem.name,
          description: metaItem.description,
          category: metaItem.category,
          platforms: ['meta'],
          metaId: metaItem.id
        });
        processedNames.add(key);
      }
    });

    // Add TikTok-only results
    tiktokResults.forEach((tiktokItem, key) => {
      if (!processedNames.has(key)) {
        results.push({
          id: `tiktok-${tiktokItem.id}`,
          name: tiktokItem.name,
          description: tiktokItem.description,
          category: tiktokItem.category,
          platforms: ['tiktok'],
          tiktokId: tiktokItem.id
        });
      }
    });

    // Sort: Both platforms first, then by name
    results.sort((a, b) => {
      if (a.platforms.length !== b.platforms.length) {
        return b.platforms.length - a.platforms.length;
      }
      return a.name.localeCompare(b.name);
    });

    console.log(`Found ${results.length} unified results`);

    return new Response(
      JSON.stringify({ results: results.slice(0, 50) }), // Limit to 50 results
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in unified search:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function searchMetaCategory(accessToken: string, adAccountId: string, type: string, query: string) {
  const endpoint = type === 'interests' 
    ? 'adinterest' 
    : type === 'behaviors' 
    ? 'adTargetingCategory' 
    : 'adTargetingCategory';
    
  const params = new URLSearchParams({
    access_token: accessToken,
    q: query,
    limit: '20'
  });
  
  if (type !== 'interests') {
    params.append('class', type === 'behaviors' ? 'behaviors' : 'demographics');
  }

  const url = `https://graph.facebook.com/v22.0/search?${params.toString()}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  return (data.data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    description: item.description
  }));
}

async function searchTikTokCategory(accessToken: string, advertiserId: string, type: string, query: string) {
  const apiVersion = 'v1.3';
  
  let fetchUrl: string;
  if (type === 'actions') {
    fetchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/action_category/?advertiser_id=${advertiserId}`;
  } else {
    fetchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/interest_category/?advertiser_id=${advertiserId}&language=en`;
  }
  
  const fetchResponse = await fetch(fetchUrl, {
    method: 'GET',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  if (!fetchResponse.ok) {
    console.error('TikTok fetch error:', fetchResponse.status);
    return [];
  }

  const fetchData = await fetchResponse.json();
  
  if (fetchData.code !== 0) {
    console.error('TikTok API error:', fetchData);
    return [];
  }
  
  const dataList = type === 'actions' 
    ? (fetchData.data?.action_categories || [])
    : (fetchData.data?.interest_categories || []);
  
  // Simple filtering by query
  const cleanQuery = query.toLowerCase().trim();
  
  return dataList
    .filter((item: any) => {
      const name = (item.interest_category || item.name || '').toLowerCase();
      return name.includes(cleanQuery);
    })
    .slice(0, 20)
    .map((item: any) => ({
      id: item.interest_category_id || item.action_category_id || item.id,
      name: item.interest_category || item.name,
      description: item.description
    }));
}
