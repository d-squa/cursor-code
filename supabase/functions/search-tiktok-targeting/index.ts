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
    
    // TikTok Interest and Action Category Search API
    // Documentation: https://business-api.tiktok.com/portal/docs?id=1739940570793985
    let searchUrl: string;
    let searchBody: any;
    
    if (type === 'interests') {
      searchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tools/interest_keyword/recommend/`;
      searchBody = {
        advertiser_id: advertiserId,
        keyword: query,
        language: "en"
      };
    } else if (type === 'actions') {
      // TikTok uses "action categories" instead of "behaviors"
      searchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tools/action_category/get/`;
      searchBody = {
        advertiser_id: advertiserId,
        special_industries: [] // Can be customized based on ad account
      };
    } else {
      // For "behaviors" fall back to interests (TikTok doesn't have separate behavior targeting)
      searchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tools/interest_keyword/recommend/`;
      searchBody = {
        advertiser_id: advertiserId,
        keyword: query,
        language: "en"
      };
    }
    
    console.log(`Searching TikTok ${type} with URL: ${searchUrl}`);
    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchBody)
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('TikTok search error:', searchResponse.status, errorText);
      throw new Error(`TikTok API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    
    if (searchData.code !== 0) {
      console.error('TikTok API error code:', searchData);
      throw new Error(`TikTok API error: ${searchData.message}`);
    }
    
    const results = [];
    const dataList = type === 'actions' 
      ? (searchData.data?.action_categories || [])
      : (searchData.data?.interest_keywords || []);

    console.log(`Processing ${dataList.length} TikTok ${type} results for "${query}"`);

    // Limit to first 10 results
    const itemsToProcess = dataList.slice(0, 10);
    
    for (const item of itemsToProcess) {
      // For interests, estimate audience size using interest_keyword endpoint
      let audienceSize;
      
      if (type === 'interests' && item.interest_id) {
        try {
          // TikTok doesn't provide direct reach estimates for interests
          // We can infer relative size from the interest's popularity if available
          audienceSize = item.audience_size || undefined;
        } catch (e) {
          // Silently skip if audience size unavailable
        }
      }

      results.push({
        id: item.interest_id || item.action_category_id || item.id,
        name: item.interest_name || item.action_category_name || item.name || query,
        audienceSize,
        type: type
      });
    }

    console.log(`Returning ${results.length} TikTok ${type} results`);

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
