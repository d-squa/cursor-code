import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_ADS_API_VERSION = 'v23';

interface AudienceResult {
  id: string;
  name: string;
  subtype: string;
  source: string;
  approximate_count_lower_bound: number | null;
  approximate_count_upper_bound: number | null;
}

type GoogleDataSegment =
  | 'Website visitors'
  | 'Customer segments'
  | 'YouTube users'
  | 'App users'
  | 'Custom combination'
  | 'Callers';

function mapUserListToDataSegment(listTypeRaw: string, listNameRaw: string): GoogleDataSegment | null {
  const listType = (listTypeRaw || '').toUpperCase();
  const listName = (listNameRaw || '').toLowerCase();

  if (listType === 'CRM_BASED' || listType === 'CUSTOMER_MATCH_USER_LIST' || listName.includes('customer')) {
    return 'Customer segments';
  }

  if (listType === 'YOUTUBE_USERS' || listName.includes('youtube')) {
    return 'YouTube users';
  }

  if (listType === 'BASIC' || listType === 'APP_USERS' || listName.includes('app')) {
    return 'App users';
  }

  if (listType === 'CALLERS' || listName.includes('call')) {
    return 'Callers';
  }

  if (listType === 'LOGICAL' || listName.includes('combination')) {
    return 'Custom combination';
  }

  if (
    listType === 'RULE_BASED' ||
    listType === 'REMARKETING' ||
    listType === 'EXTERNAL_REMARKETING' ||
    listName.includes('website') ||
    listName.includes('visitor')
  ) {
    return 'Website visitors';
  }

  return null;
}

async function searchStream(
  url: string,
  headers: Record<string, string>,
  query: string,
): Promise<any[]> {
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error('GAQL query failed:', errText);
    return [];
  }
  const data = await resp.json();
  const batches = Array.isArray(data) ? data : [];
  return batches.flatMap((batch: any) => batch?.results || []);
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
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
    console.log('Fetching Google Ads Audience Manager segments for customer:', cleanCustomerId);

    const { data: platformData, error: platformError } = await supabase
      .from('connected_platforms')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform_type', 'google')
      .eq('is_active', true)
      .maybeSingle();

    if (platformError || !platformData) {
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

    const apiHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };
    if (managerAccountId) {
      apiHeaders['login-customer-id'] = managerAccountId.replace(/-/g, '');
    }

    const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;
    const allAudiences: AudienceResult[] = [];

    // Run all audience queries in parallel for speed
    const [
      yourDataRows,
      customSegmentRows,
      combinedRows,
      affinityRows,
      inMarketRows,
      lifeEventRows,
      detailedDemoRows,
    ] = await Promise.all([
      // 1. Your Data Segments (user_list) — Website visitors, App users, Customer lists
      searchStream(searchUrl, apiHeaders, `
        SELECT user_list.id, user_list.name, user_list.type,
               user_list.size_for_display, user_list.size_for_search,
               user_list.membership_status
        FROM user_list
        WHERE user_list.membership_status = 'OPEN'
        LIMIT 500
      `).catch(e => { console.error('Your data segments error:', e); return []; }),

      // 2. Custom Segments (custom_audience) — Keywords, URLs, Apps based
      searchStream(searchUrl, apiHeaders, `
        SELECT custom_audience.id, custom_audience.name,
               custom_audience.type, custom_audience.status
        FROM custom_audience
        WHERE custom_audience.status = 'ENABLED'
        LIMIT 500
      `).catch(e => { console.error('Custom segments error:', e); return []; }),

      // 3. Combined Segments (combined_audience)
      searchStream(searchUrl, apiHeaders, `
        SELECT combined_audience.id, combined_audience.name,
               combined_audience.status
        FROM combined_audience
        WHERE combined_audience.status = 'ENABLED'
        LIMIT 200
      `).catch(e => { console.error('Combined segments error:', e); return []; }),

      // 4. Affinity Segments (user_interest AFFINITY)
      searchStream(searchUrl, apiHeaders, `
        SELECT user_interest.user_interest_id, user_interest.name,
               user_interest.taxonomy_type
        FROM user_interest
        WHERE user_interest.taxonomy_type = 'AFFINITY'
        LIMIT 500
      `).catch(e => { console.error('Affinity segments error:', e); return []; }),

      // 5. In-Market Segments (user_interest IN_MARKET)
      searchStream(searchUrl, apiHeaders, `
        SELECT user_interest.user_interest_id, user_interest.name,
               user_interest.taxonomy_type
        FROM user_interest
        WHERE user_interest.taxonomy_type = 'IN_MARKET'
        LIMIT 500
      `).catch(e => { console.error('In-Market segments error:', e); return []; }),

      // 6. Life Events
      searchStream(searchUrl, apiHeaders, `
        SELECT life_event.id, life_event.name
        FROM life_event
        LIMIT 200
      `).catch(e => { console.error('Life events error:', e); return []; }),

      // 7. Detailed Demographics
      searchStream(searchUrl, apiHeaders, `
        SELECT detailed_demographic.id, detailed_demographic.name
        FROM detailed_demographic
        LIMIT 200
      `).catch(e => { console.error('Detailed demographics error:', e); return []; }),
    ]);

    // --- Process Your Data Segments ---
    for (const r of yourDataRows) {
      const ul = r.userList || r.user_list || {};
      const id = String(ul.id ?? '');
      const name = ul.name ?? '';
      const listType = ul.type ?? '';
      const sizeDisplay = ul.sizeForDisplay ?? ul.size_for_display ?? 0;
      const sizeSearch = ul.sizeForSearch ?? ul.size_for_search ?? 0;
      if (!id || !name) continue;

      let subtype = 'YOUR_DATA';
      if (listType === 'CRM_BASED') subtype = 'CUSTOMER_LIST';
      else if (listType === 'RULE_BASED' || listType === 'LOGICAL') subtype = 'WEBSITE_VISITORS';
      else if (listType === 'BASIC') subtype = 'APP_USERS';

      const size = Math.max(Number(sizeDisplay) || 0, Number(sizeSearch) || 0);
      allAudiences.push({
        id, name, subtype,
        source: 'Your data segments',
        approximate_count_lower_bound: size || null,
        approximate_count_upper_bound: size || null,
      });
    }
    console.log(`Your data segments: ${yourDataRows.length}`);

    // --- Process Custom Segments ---
    for (const r of customSegmentRows) {
      const ca = r.customAudience || r.custom_audience || {};
      const id = String(ca.id ?? '');
      const name = ca.name ?? '';
      if (!id || !name) continue;

      const caType = ca.type ?? '';
      let subtype = 'CUSTOM_SEGMENT';
      if (caType === 'SEARCH') subtype = 'CUSTOM_SEARCH_TERMS';
      else if (caType === 'INTEREST') subtype = 'CUSTOM_INTEREST';

      allAudiences.push({
        id, name, subtype,
        source: 'Custom segments',
        approximate_count_lower_bound: null,
        approximate_count_upper_bound: null,
      });
    }
    console.log(`Custom segments: ${customSegmentRows.length}`);

    // --- Process Combined Segments ---
    for (const r of combinedRows) {
      const ca = r.combinedAudience || r.combined_audience || {};
      const id = String(ca.id ?? '');
      const name = ca.name ?? '';
      if (!id || !name) continue;

      allAudiences.push({
        id, name,
        subtype: 'COMBINED',
        source: 'Combined segments',
        approximate_count_lower_bound: null,
        approximate_count_upper_bound: null,
      });
    }
    console.log(`Combined segments: ${combinedRows.length}`);

    // --- Process Affinity Segments ---
    for (const r of affinityRows) {
      const ui = r.userInterest || r.user_interest || {};
      const id = String(ui.userInterestId ?? ui.user_interest_id ?? '');
      const name = ui.name ?? '';
      if (!id || !name) continue;

      allAudiences.push({
        id, name,
        subtype: 'AFFINITY',
        source: 'Affinity',
        approximate_count_lower_bound: null,
        approximate_count_upper_bound: null,
      });
    }
    console.log(`Affinity segments: ${affinityRows.length}`);

    // --- Process In-Market Segments ---
    for (const r of inMarketRows) {
      const ui = r.userInterest || r.user_interest || {};
      const id = String(ui.userInterestId ?? ui.user_interest_id ?? '');
      const name = ui.name ?? '';
      if (!id || !name) continue;

      allAudiences.push({
        id, name,
        subtype: 'IN_MARKET',
        source: 'In-market',
        approximate_count_lower_bound: null,
        approximate_count_upper_bound: null,
      });
    }
    console.log(`In-market segments: ${inMarketRows.length}`);

    // --- Process Life Events ---
    for (const r of lifeEventRows) {
      const le = r.lifeEvent || r.life_event || {};
      const id = String(le.id ?? '');
      const name = le.name ?? '';
      if (!id || !name) continue;

      allAudiences.push({
        id, name,
        subtype: 'LIFE_EVENT',
        source: 'Life events',
        approximate_count_lower_bound: null,
        approximate_count_upper_bound: null,
      });
    }
    console.log(`Life event segments: ${lifeEventRows.length}`);

    // --- Process Detailed Demographics ---
    for (const r of detailedDemoRows) {
      const dd = r.detailedDemographic || r.detailed_demographic || {};
      const id = String(dd.id ?? '');
      const name = dd.name ?? '';
      if (!id || !name) continue;

      allAudiences.push({
        id, name,
        subtype: 'DETAILED_DEMOGRAPHICS',
        source: 'Detailed demographics',
        approximate_count_lower_bound: null,
        approximate_count_upper_bound: null,
      });
    }
    console.log(`Detailed demographic segments: ${detailedDemoRows.length}`);

    console.log(`Total Audience Manager segments: ${allAudiences.length}`);

    return new Response(
      JSON.stringify(allAudiences),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching Google Ads audiences:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
