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

    // Get user's Meta platform connection
    const { data: platformData, error: platformError } = await supabaseClient
      .from('connected_platforms')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform_type', 'meta')
      .eq('is_active', true)
      .single();

    if (platformError || !platformData) {
      console.error('Platform error:', platformError);
      throw new Error('Meta platform not connected');
    }

    // Get access token from Vault
    const accessToken = await getAccessToken(supabaseClient, platformData.id);
    if (!accessToken) {
      throw new Error('Platform access token not found');
    }
    const apiVersion = 'v21.0';
    
    // Remove 'act_' prefix if already present
    const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    
    let allAudiences: any[] = [];

    // Helper function to map Meta subtypes to source names
    const getSourceFromSubtype = (subtype: string): string => {
      const subtypeToSource: Record<string, string> = {
        "WEBSITE": "Website",
        "APP": "App Activity",
        "OFFLINE_CONVERSION": "Offline Activity",
        "CUSTOMER_LIST": "Customer List",
        "USER_PROVIDED_ONLY": "Customer List",
        "LEAD_GEN": "Lead Form",
        "LOOKALIKE": "Lookalikes",
        "CATALOG_BASED": "Catalog",
        "ENGAGEMENT": "Events", // Default for engagement type
      };
      return subtypeToSource[subtype] || "Unknown";
    };

    // Check if we need to fetch saved audiences
    const fetchSavedAudiences = !sources || sources.length === 0 || sources.includes("Saved Audience");
    
    // Check if we need to fetch custom audiences (everything except Native Audience and Saved Audience)
    const fetchCustomAudiences = !sources || sources.length === 0 || 
      sources.some((s: string) => s !== "Native Audience" && s !== "Saved Audience");

    // Fetch custom audiences if needed
    if (fetchCustomAudiences) {
      const url = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/customaudiences?fields=id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound&access_token=${accessToken}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Meta API error:', response.status, errorText);
        throw new Error(`Meta API error: ${response.status}`);
      }
      
      const result = await response.json();
      const customAudiences = (result.data || []).map((aud: any) => ({
        ...aud,
        source: getSourceFromSubtype(aud.subtype)
      }));

      // Filter by sources if provided
      if (sources && sources.length > 0) {
        const filteredCustom = customAudiences.filter((aud: any) => sources.includes(aud.source));
        allAudiences.push(...filteredCustom);
      } else {
        allAudiences.push(...customAudiences);
      }
    }

    // Fetch saved audiences if needed
    if (fetchSavedAudiences) {
      const savedUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/saved_audiences?fields=id,name,approximate_count&access_token=${accessToken}`;
      const savedResponse = await fetch(savedUrl);
      
      if (savedResponse.ok) {
        const savedResult = await savedResponse.json();
        const savedAudiences = (savedResult.data || []).map((aud: any) => ({
          ...aud,
          source: "Saved Audience",
          subtype: "SAVED"
        }));
        allAudiences.push(...savedAudiences);
      }
    }

    console.log(`Found ${allAudiences.length} audiences for sources: ${sources?.join(', ') || 'all'}`);

    return new Response(
      JSON.stringify(allAudiences),
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
