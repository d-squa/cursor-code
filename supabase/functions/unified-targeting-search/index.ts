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

// Minimum relevance score required for inclusion
const MIN_RELEVANCE_SCORE = 15;

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
        // Search both interests and actions/behaviors in parallel
        const [interests, actions] = await Promise.all([
          searchTikTokInterests(tiktokPlatform.access_token, tiktokAdvertiserId, query),
          searchTikTokActions(tiktokPlatform.access_token, tiktokAdvertiserId, query)
        ]);

        console.log(`TikTok found ${interests.length} interests and ${actions.length} actions`);

        interests.forEach((item: any) => tiktokResults.set(item.name.toLowerCase(), { ...item, category: 'interest' }));
        actions.forEach((item: any) => tiktokResults.set(item.name.toLowerCase(), { ...item, category: 'behavior' }));
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

// Calculate relevance score for a name against query
function calculateRelevanceScore(nameStr: string, cleanQuery: string, queryWords: string[]): number {
  if (!nameStr) return 0;
  
  let score = 0;
  
  // Exact match - highest priority
  if (nameStr === cleanQuery) return 100;
  
  // Contains full query as substring
  if (nameStr.includes(cleanQuery)) {
    score += 50;
  }
  
  // Word-level matching
  const nameWords = nameStr.split(/[\s\-_&,]+/).filter(w => w.length > 1);
  
  for (const queryWord of queryWords) {
    // Exact word match
    if (nameWords.some(nw => nw === queryWord)) {
      score += 25;
    }
    // Word starts with query word
    else if (nameWords.some(nw => nw.startsWith(queryWord))) {
      score += 15;
    }
    // Word contains query word (partial match)
    else if (nameStr.includes(queryWord)) {
      score += 10;
    }
  }
  
  return score;
}

async function searchMetaCategory(accessToken: string, adAccountId: string, type: string, query: string) {
  const apiVersion = 'v22.0';
  const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  
  let searchUrl: string;
  
  if (type === 'interests') {
    searchUrl = `https://graph.facebook.com/${apiVersion}/search?type=adinterest&q=${encodeURIComponent(query)}&limit=25&access_token=${accessToken}`;
  } else if (type === 'behaviors') {
    searchUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/targetingsearch?q=${encodeURIComponent(query)}&limit_type=behaviors&limit=25&access_token=${accessToken}`;
  } else {
    searchUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/targetingsearch?q=${encodeURIComponent(query)}&limit=25&access_token=${accessToken}`;
  }
  
  const response = await fetch(searchUrl);
  
  if (!response.ok) {
    console.error('Meta search error:', response.status);
    return [];
  }
  
  const data = await response.json();
  
  return (data.data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    description: item.description
  }));
}

async function searchTikTokInterests(accessToken: string, advertiserId: string, query: string) {
  const apiVersion = 'v1.3';
  const fetchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/interest_category/?advertiser_id=${advertiserId}&language=en`;
  
  const fetchResponse = await fetch(fetchUrl, {
    method: 'GET',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  if (!fetchResponse.ok) {
    console.error('TikTok interests fetch error:', fetchResponse.status);
    return [];
  }

  const fetchData = await fetchResponse.json();
  
  if (fetchData.code !== 0) {
    console.error('TikTok interests API error:', fetchData);
    return [];
  }
  
  const interests = fetchData.data?.interest_categories || [];
  console.log(`TikTok returned ${interests.length} total interest categories`);
  
  const cleanQuery = query.toLowerCase().trim();
  const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
  
  // Score and filter interests
  const scoredInterests = interests.map((item: any) => {
    const name = item.interest_category_name || item.name || '';
    const nameStr = String(name).toLowerCase();
    const score = calculateRelevanceScore(nameStr, cleanQuery, queryWords);
    return { item, score, name: nameStr };
  });
  
  // Only include items with meaningful relevance score
  const filtered = scoredInterests
    .filter((s: { score: number }) => s.score >= MIN_RELEVANCE_SCORE)
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, 25);
  
  console.log(`TikTok interests: filtered to ${filtered.length} relevant matches for "${query}"`);
  
  return filtered.map(({ item }: { item: any }) => ({
    id: item.interest_category_id || item.id,
    name: item.interest_category_name || item.name || 'Unknown',
    description: item.description || ''
  }));
}

async function searchTikTokActions(accessToken: string, advertiserId: string, query: string) {
  const apiVersion = 'v1.3';
  const fetchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/action_category/?advertiser_id=${advertiserId}`;
  
  const fetchResponse = await fetch(fetchUrl, {
    method: 'GET',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  if (!fetchResponse.ok) {
    console.error('TikTok actions fetch error:', fetchResponse.status);
    return [];
  }

  const fetchData = await fetchResponse.json();
  
  if (fetchData.code !== 0) {
    console.error('TikTok actions API error:', fetchData);
    return [];
  }
  
  const actions = fetchData.data?.action_categories || [];
  console.log(`TikTok returned ${actions.length} total action categories`);
  
  const cleanQuery = query.toLowerCase().trim();
  const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
  
  // Score and filter actions
  const scoredActions = actions.map((item: any) => {
    const name = item.action_category_name || item.name || '';
    const nameStr = String(name).toLowerCase();
    const score = calculateRelevanceScore(nameStr, cleanQuery, queryWords);
    return { item, score, name: nameStr };
  });
  
  // Only include items with meaningful relevance score
  const filtered = scoredActions
    .filter((s: { score: number }) => s.score >= MIN_RELEVANCE_SCORE)
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, 25);
  
  console.log(`TikTok actions: filtered to ${filtered.length} relevant matches for "${query}"`);
  
  return filtered.map(({ item }: { item: any }) => ({
    id: item.action_category_id || item.id,
    name: item.action_category_name || item.name || 'Unknown',
    description: item.description || ''
  }));
}
