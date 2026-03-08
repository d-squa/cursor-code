import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_ADS_API_VERSION = 'v23';

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { customerId } = await req.json();
    if (!customerId) {
      throw new Error('Google Ads Customer ID is required');
    }

    const cleanCustomerId = customerId.replace(/-/g, '');
    console.log('Fetching Google Ads audiences for customer:', cleanCustomerId);

    // Get Google Ads platform connection
    const { data: platformData, error: platformError } = await supabase
      .from('connected_platforms')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform_type', 'google')
      .eq('is_active', true)
      .maybeSingle();

    if (platformError || !platformData) {
      console.error('Platform error:', platformError);
      throw new Error('Google Ads platform not connected');
    }

    const accessToken = await getAccessToken(supabase, platformData.id);
    if (!accessToken) {
      throw new Error('Platform access token not found');
    }

    const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');
    const managerAccountId = Deno.env.get('GOOGLE_ADS_MANAGER_ACCOUNT_ID');
    
    if (!developerToken) {
      throw new Error('Google Ads developer token not configured');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };
    if (managerAccountId) {
      headers['login-customer-id'] = managerAccountId.replace(/-/g, '');
    }

    const allAudiences: any[] = [];

    // 1. Fetch User Interest segments (Affinity + In-Market)
    try {
      const userInterestQuery = `
        SELECT
          user_interest.user_interest_id,
          user_interest.name,
          user_interest.taxonomy_type
        FROM user_interest
        WHERE user_interest.taxonomy_type IN ('AFFINITY', 'IN_MARKET')
        LIMIT 1000
      `;

      const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;
      const resp = await fetch(searchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: userInterestQuery }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const batches = Array.isArray(data) ? data : [];
        const rows = batches.flatMap((batch: any) => batch?.results || []);
        
        for (const r of rows) {
          const ui = r.userInterest || r.user_interest || {};
          const id = String(ui.userInterestId ?? ui.user_interest_id ?? '');
          const name = ui.name ?? '';
          const taxonomyType = ui.taxonomyType ?? ui.taxonomy_type ?? '';
          
          if (!id || !name) continue;

          const source = taxonomyType === 'AFFINITY' ? 'Affinity' : 
                         taxonomyType === 'IN_MARKET' ? 'In-Market' : 'Interest';

          allAudiences.push({
            id,
            name,
            subtype: taxonomyType,
            source,
            approximate_count_lower_bound: null,
            approximate_count_upper_bound: null,
          });
        }
        console.log(`Fetched ${rows.length} user interest segments`);
      } else {
        const errText = await resp.text();
        console.error('User interest fetch failed:', errText);
      }
    } catch (err) {
      console.error('Error fetching user interests:', err);
    }

    // 2. Fetch Remarketing Lists (Custom Audiences / Your Data Segments)
    try {
      const remarketingQuery = `
        SELECT
          user_list.id,
          user_list.name,
          user_list.type,
          user_list.size_for_display,
          user_list.size_for_search,
          user_list.membership_status
        FROM user_list
        WHERE user_list.membership_status = 'OPEN'
        LIMIT 500
      `;

      const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;
      const resp = await fetch(searchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: remarketingQuery }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const batches = Array.isArray(data) ? data : [];
        const rows = batches.flatMap((batch: any) => batch?.results || []);
        
        for (const r of rows) {
          const ul = r.userList || r.user_list || {};
          const id = String(ul.id ?? '');
          const name = ul.name ?? '';
          const listType = ul.type ?? ul.user_list_type ?? '';
          const sizeDisplay = ul.sizeForDisplay ?? ul.size_for_display ?? 0;
          const sizeSearch = ul.sizeForSearch ?? ul.size_for_search ?? 0;
          
          if (!id || !name) continue;

          // Map Google list types to our audience categories
          let source = 'Custom Audience';
          let subtype = 'CUSTOM';
          
          if (listType === 'SIMILAR' || listType === 'LOOKALIKE') {
            source = 'Lookalike Audience';
            subtype = 'LOOKALIKE';
          } else if (listType === 'CRM_BASED' || listType === 'EXTERNAL_REMARKETING') {
            source = 'Custom Audience';
            subtype = 'CUSTOMER_LIST';
          } else if (listType === 'RULE_BASED' || listType === 'LOGICAL') {
            source = 'Custom Audience';
            subtype = 'WEBSITE';
          }

          allAudiences.push({
            id,
            name,
            subtype,
            source,
            approximate_count_lower_bound: Math.max(sizeDisplay, sizeSearch),
            approximate_count_upper_bound: Math.max(sizeDisplay, sizeSearch),
          });
        }
        console.log(`Fetched ${rows.length} remarketing lists`);
      } else {
        const errText = await resp.text();
        console.error('Remarketing list fetch failed:', errText);
      }
    } catch (err) {
      console.error('Error fetching remarketing lists:', err);
    }

    // 3. Fetch Combined Audiences (Saved Audiences equivalent)
    try {
      const combinedQuery = `
        SELECT
          combined_audience.id,
          combined_audience.name,
          combined_audience.status
        FROM combined_audience
        WHERE combined_audience.status = 'ENABLED'
        LIMIT 200
      `;

      const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;
      const resp = await fetch(searchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: combinedQuery }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const batches = Array.isArray(data) ? data : [];
        const rows = batches.flatMap((batch: any) => batch?.results || []);
        
        for (const r of rows) {
          const ca = r.combinedAudience || r.combined_audience || {};
          const id = String(ca.id ?? '');
          const name = ca.name ?? '';
          
          if (!id || !name) continue;

          allAudiences.push({
            id,
            name,
            subtype: 'COMBINED',
            source: 'Saved Audience',
            approximate_count_lower_bound: null,
            approximate_count_upper_bound: null,
          });
        }
        console.log(`Fetched ${rows.length} combined audiences`);
      } else {
        const errText = await resp.text();
        console.error('Combined audience fetch failed:', errText);
      }
    } catch (err) {
      console.error('Error fetching combined audiences:', err);
    }

    console.log(`Total Google Ads audiences found: ${allAudiences.length}`);

    return new Response(
      JSON.stringify(allAudiences),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching Google Ads audiences:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
