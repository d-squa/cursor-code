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

    // Create Supabase client with service role for querying
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get user from JWT (already verified by verify_jwt = true in config)
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { adAccountId, sources, type } = await req.json();

    if (!adAccountId) {
      throw new Error('Ad Account ID is required');
    }

    console.log('Fetching audiences:', { adAccountId, sources, type });

    // Get user's Meta access token
    const { data: platformData, error: platformError } = await supabaseClient
      .from('connected_platforms')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform_type', 'meta')
      .eq('is_active', true)
      .single();

    if (platformError || !platformData?.access_token) {
      console.error('Platform error:', platformError);
      throw new Error('Meta platform not connected');
    }

    const accessToken = platformData.access_token;
    const apiVersion = 'v21.0';
    
    // Remove 'act_' prefix if already present
    const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    
    // Fetch custom audiences from ad account
    const url = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/customaudiences?fields=id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound&access_token=${accessToken}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Meta API error:', response.status, errorText);
      throw new Error(`Meta API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Filter audiences based on sources and type
    let filteredAudiences = result.data || [];
    
    if (type === "Custom Audience" && sources && sources.length > 0) {
      // Map sources to Meta subtype values
      const subtypeMapping: Record<string, string[]> = {
        "Website": ["WEBSITE"],
        "App Activity": ["APP"],
        "Offline Activity": ["OFFLINE_CONVERSION"],
        "Customer List": ["CUSTOMER_LIST", "USER_PROVIDED_ONLY"],
        "Video": ["ENGAGEMENT"],
        "Lead Form": ["LEAD_GEN"],
        "Shopping": ["OFFLINE_CONVERSION", "ENGAGEMENT"],
        "Events": ["ENGAGEMENT"],
        "Facebook Page": ["ENGAGEMENT"],
        "Instagram Account": ["ENGAGEMENT"],
        "Instant Experience": ["ENGAGEMENT"],
        "On-Facebook Listings": ["ENGAGEMENT"],
        "Catalog": ["CATALOG_BASED"]
      };
      
      const allowedSubtypes = new Set<string>();
      sources.forEach((source: string) => {
        const subtypes = subtypeMapping[source] || [];
        subtypes.forEach(st => allowedSubtypes.add(st));
      });
      
      if (allowedSubtypes.size > 0) {
        filteredAudiences = filteredAudiences.filter((aud: any) => 
          allowedSubtypes.has(aud.subtype)
        );
      }
    } else if (type === "Lookalike Audience") {
      filteredAudiences = filteredAudiences.filter((aud: any) => 
        aud.subtype === "LOOKALIKE"
      );
    } else if (type === "Saved Audience") {
      // Fetch saved audiences separately
      const savedUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/saved_audiences?fields=id,name,approximate_count&access_token=${accessToken}`;
      const savedResponse = await fetch(savedUrl);
      
      if (savedResponse.ok) {
        const savedResult = await savedResponse.json();
        filteredAudiences = savedResult.data || [];
      }
    }

    console.log(`Found ${filteredAudiences.length} audiences for type: ${type}`);

    return new Response(
      JSON.stringify({ 
        data: filteredAudiences,
        count: filteredAudiences.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching audiences:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
