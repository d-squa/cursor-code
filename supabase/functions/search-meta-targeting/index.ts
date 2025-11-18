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

    // Search Meta targeting API
    const searchUrl = `https://graph.facebook.com/${apiVersion}/search?type=adTargetingCategory&class=${type}&q=${encodeURIComponent(query)}&limit=20&access_token=${accessToken}`;
    const searchResponse = await fetch(searchUrl);

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Meta search error:', searchResponse.status, errorText);
      throw new Error(`Meta API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const results = [];

    // Get audience size estimates for each result
    for (const item of searchData.data || []) {
      let audienceSize;
      try {
        const reachUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/reachestimate?targeting_spec=${encodeURIComponent(JSON.stringify({
          geo_locations: { countries: ['US'] },
          [type]: [{ id: item.id }]
        }))}&access_token=${accessToken}`;
        
        const reachResponse = await fetch(reachUrl);
        if (reachResponse.ok) {
          const reachData = await reachResponse.json();
          if (reachData.data && reachData.data[0]) {
            audienceSize = Math.round((reachData.data[0].estimate_mau_lower_bound + reachData.data[0].estimate_mau_upper_bound) / 2);
          }
        }
      } catch (e) {
        console.log('Could not fetch reach estimate for', item.name);
      }

      results.push({
        id: item.id,
        name: item.name,
        audienceSize,
        type: item.type || type
      });
    }

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
