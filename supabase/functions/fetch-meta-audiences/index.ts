import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchAllPages(baseUrl: string, accessToken: string): Promise<any[]> {
  let allData: any[] = [];
  let url: string | null = `${baseUrl}&limit=200&access_token=${accessToken}`;
  let pageCount = 0;
  const maxPages = 10; // Safety limit

  while (url && pageCount < maxPages) {
    pageCount++;
    console.log(`Fetching page ${pageCount}...`);
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Meta API error:', response.status, errorText);
      throw new Error(`Meta API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const pageData = result.data || [];
    allData.push(...pageData);
    console.log(`Page ${pageCount}: got ${pageData.length} items (total: ${allData.length})`);

    // Check for next page
    url = result.paging?.next || null;
  }

  return allData;
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

    console.log('Fetching audiences:', { adAccountId, sources, type, userId: user.id });

    // Get user's team IDs for team-aware platform lookup
    const { data: userTeams } = await supabaseClient
      .from('user_roles')
      .select('team_id')
      .eq('user_id', user.id);
    const teamIds = (userTeams || []).map((t: any) => t.team_id).filter(Boolean);

    // Get all active Meta platform connections for this user or their teams
    let platformQuery = supabaseClient
      .from('connected_platforms')
      .select('id, metadata, access_token')
      .eq('platform_type', 'meta')
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (teamIds.length > 0) {
      platformQuery = platformQuery.or(`user_id.eq.${user.id},team_id.in.(${teamIds.join(',')})`);
    } else {
      platformQuery = platformQuery.eq('user_id', user.id);
    }

    const { data: platforms, error: platformError } = await platformQuery;

    if (platformError || !platforms || platforms.length === 0) {
      console.error('Platform error:', platformError);
      throw new Error('Meta platform not connected');
    }

    // Prefer the connection whose metadata contains this ad account
    const cleanId = adAccountId.replace('act_', '');
    let platformData = platforms[0];
    for (const p of platforms) {
      const accounts = Array.isArray(p.metadata?.ad_accounts) ? p.metadata.ad_accounts : [];
      const hasAccount = accounts.some((a: any) =>
        String(a?.account_id || a?.id || '').replace('act_', '') === cleanId
      );
      if (hasAccount) {
        platformData = p;
        console.log(`Matched platform ${p.id} via metadata for ad account ${adAccountId}`);
        break;
      }
    }
    console.log(`Using platform connection ${platformData.id} for audience fetch`);

    // Get access token from Vault
    const accessToken = await getAccessToken(supabaseClient, platformData.id);
    if (!accessToken) {
      throw new Error('Platform access token not found');
    }
    const apiVersion = 'v21.0';
    
    // Remove 'act_' prefix if already present, then always add it
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
        "ENGAGEMENT": "Events",
      };
      return subtypeToSource[subtype] || "Unknown";
    };

    // Check if we need to fetch saved audiences
    const fetchSavedAudiences = !sources || sources.length === 0 || sources.includes("Saved Audience");
    
    // Check if we need to fetch custom audiences
    const fetchCustomAudiences = !sources || sources.length === 0 || 
      sources.some((s: string) => s !== "Native Audience" && s !== "Saved Audience");

    // Fetch custom audiences with pagination
    if (fetchCustomAudiences) {
      const baseUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/customaudiences?fields=id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound`;
      
      try {
        const rawAudiences = await fetchAllPages(baseUrl, accessToken);
        const customAudiences = rawAudiences.map((aud: any) => ({
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
        console.log(`Custom audiences fetched: ${customAudiences.length}`);
      } catch (err) {
        console.error('Error fetching custom audiences:', err);
      }
    }

    // Fetch saved audiences with pagination
    if (fetchSavedAudiences) {
      const savedBaseUrl = `https://graph.facebook.com/${apiVersion}/${cleanAccountId}/saved_audiences?fields=id,name,approximate_count`;
      
      try {
        const rawSaved = await fetchAllPages(savedBaseUrl, accessToken);
        const savedAudiences = rawSaved.map((aud: any) => ({
          ...aud,
          source: "Saved Audience",
          subtype: "SAVED"
        }));
        allAudiences.push(...savedAudiences);
        console.log(`Saved audiences fetched: ${savedAudiences.length}`);
      } catch (err) {
        console.error('Error fetching saved audiences:', err);
      }
    }

    console.log(`Total audiences found: ${allAudiences.length} for sources: ${sources?.join(', ') || 'all'}`);

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
