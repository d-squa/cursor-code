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

    const { query, type, adAccountId } = await req.json();

    if (!query || !type || !adAccountId) {
      throw new Error('Query, type, and Ad Account ID are required');
    }

    if (!['interests', 'behaviors', 'demographics'].includes(type)) {
      throw new Error('Type must be interests, behaviors, or demographics');
    }

    console.log('Searching Meta targeting:', { query, type, adAccountId });

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
    const apiVersion = 'v21.0';
    const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    // Use Meta's Detailed Targeting API for better results
    // This API endpoint provides more relevant results for behaviors and demographics
    // Documentation: https://developers.facebook.com/docs/marketing-api/audiences/reference/detailed-targeting/
    let searchUrl: string;
    
    if (type === 'interests') {
      // For interests, use adinterest search for most relevant results
      searchUrl = `https://graph.facebook.com/${apiVersion}/search?type=adinterest&q=${encodeURIComponent(query)}&limit=25&access_token=${accessToken}`;
    } else if (type === 'behaviors') {
      // For behaviors, use targetingsearch with behaviors filter for better relevance
      searchUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/targetingsearch?q=${encodeURIComponent(query)}&limit_type=behaviors&limit=25&access_token=${accessToken}`;
    } else if (type === 'demographics') {
      // For demographics, use targetingsearch to get specific demographic categories
      // Focus on education, income, job titles, life events - not generic travel behaviors
      searchUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/targetingsearch?q=${encodeURIComponent(query)}&limit=25&access_token=${accessToken}`;
    } else {
      // Fallback to old method for any other types
      searchUrl = `https://graph.facebook.com/${apiVersion}/search?type=adTargetingCategory&class=${type}&q=${encodeURIComponent(query)}&limit=25&access_token=${accessToken}`;
    }
    
    console.log(`Searching Meta ${type} with URL: ${searchUrl.replace(accessToken, 'REDACTED')}`);
    const searchResponse = await fetch(searchUrl);

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Meta search error:', searchResponse.status, errorText);
      throw new Error(`Meta API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const results = [];

    // Calculate relevance score for each item
    const calculateRelevance = (item: any, searchQuery: string): number => {
      const name = (item.name || '').toLowerCase();
      const cleanQuery = searchQuery.toLowerCase().trim();
      const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
      
      let score = 0;
      if (name === cleanQuery) score += 100;
      if (name.includes(cleanQuery)) score += 50;
      queryWords.forEach(word => {
        if (name.includes(word)) score += 10;
      });
      
      return score;
    };
    
    // Score and sort items by relevance
    const scoredItems = (searchData.data || [])
      .map((item: any) => ({ item, score: calculateRelevance(item, query) }))
      .filter(({ score }: { score: number }) => score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 10);
    
    console.log(`Processing ${scoredItems.length} relevant search results for "${query}"`);

    // Get audience size estimates for each result with aggressive timeout
    const fetchWithTimeout = async (url: string, timeoutMs: number = 2000) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        return response;
      } catch (e) {
        clearTimeout(timeout);
        throw e;
      }
    };

    for (const { item } of scoredItems) {
      // The Detailed Targeting API returns audience_size_lower_bound and audience_size_upper_bound
      let audienceSize = item.audience_size_lower_bound && item.audience_size_upper_bound
        ? Math.round((item.audience_size_lower_bound + item.audience_size_upper_bound) / 2)
        : undefined;

      // If we don't have audience size from the search result, try to fetch it
      if (!audienceSize) {
        try {
          const reachUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/reachestimate?targeting_spec=${encodeURIComponent(JSON.stringify({
            geo_locations: { countries: ['US'] },
            [type]: [{ id: item.id }]
          }))}&access_token=${accessToken}`;
          
          const reachResponse = await fetchWithTimeout(reachUrl, 2000);
          if (reachResponse.ok) {
            const reachData = await reachResponse.json();
            if (reachData.data && reachData.data[0]) {
              audienceSize = Math.round((reachData.data[0].estimate_mau_lower_bound + reachData.data[0].estimate_mau_upper_bound) / 2);
            }
          }
        } catch (e) {
          // Silently skip reach estimate if it times out
        }
      }

      results.push({
        id: item.id,
        name: item.name,
        audienceSize,
        type: item.type || type
      });
    }

    console.log(`Returning ${results.length} search results with audience sizes`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error searching targeting:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
