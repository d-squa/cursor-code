import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";
import { getGooglePlatformCandidatesForCustomer } from "../_shared/platform-connection-resolver.ts";

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

    const platformCandidates = await getGooglePlatformCandidatesForCustomer(supabase, user.id, cleanCustomerId);

    if (platformCandidates.length === 0) {
      throw new Error('Google Ads platform not connected');
    }

    const platformData = platformCandidates[0];
    console.log(`Using platform connection ${platformData.id} for customer ${cleanCustomerId}`);

    const accessToken = await getAccessToken(supabase, platformData.id);
    if (!accessToken) {
      throw new Error('Platform access token not found');
    }

    const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');

    if (!developerToken) {
      throw new Error('Google Ads developer token not configured');
    }

    // Look up the manager_customer_id from the google_ad_accounts table
    const { data: googleAccount } = await supabase
      .from("google_ad_accounts")
      .select("manager_customer_id")
      .eq("customer_id", cleanCustomerId)
      .limit(1)
      .single();

    const managerAccountId = googleAccount?.manager_customer_id
      || Deno.env.get('GOOGLE_ADS_MANAGER_ACCOUNT_ID');

    const apiHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
      'login-customer-id': (managerAccountId || cleanCustomerId).replace(/-/g, ''),
    };

    const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;
    const allAudiences: AudienceResult[] = [];

    // Run only Audience Manager data-segment queries in parallel
    const [yourDataRows, combinedRows] = await Promise.all([
      // 1. Data segments (user_list) — website visitors, customer segments, YouTube users, app users, callers
      searchStream(searchUrl, apiHeaders, `
        SELECT user_list.id, user_list.name, user_list.type,
               user_list.size_for_display, user_list.size_for_search,
               user_list.membership_status
        FROM user_list
        WHERE user_list.membership_status = 'OPEN'
        LIMIT 500
      `).catch((e) => { console.error('Data segments error:', e); return []; }),

      // 2. Custom combinations (combined_audience)
      searchStream(searchUrl, apiHeaders, `
        SELECT combined_audience.id, combined_audience.name,
               combined_audience.status
        FROM combined_audience
        WHERE combined_audience.status = 'ENABLED'
        LIMIT 200
      `).catch((e) => { console.error('Custom combinations error:', e); return []; }),
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

      const mappedSegment = mapUserListToDataSegment(listType, name);
      if (!id || !name || !mappedSegment) continue;

      const size = Math.max(Number(sizeDisplay) || 0, Number(sizeSearch) || 0);
      allAudiences.push({
        id,
        name,
        subtype: mappedSegment,
        source: mappedSegment,
        approximate_count_lower_bound: size || null,
        approximate_count_upper_bound: size || null,
      });
    }
    console.log(`Data segments: ${yourDataRows.length}`);

    // --- Process Custom combinations ---
    for (const r of combinedRows) {
      const ca = r.combinedAudience || r.combined_audience || {};
      const id = String(ca.id ?? '');
      const name = ca.name ?? '';
      if (!id || !name) continue;

      allAudiences.push({
        id,
        name,
        subtype: 'Custom combination',
        source: 'Custom combination',
        approximate_count_lower_bound: null,
        approximate_count_upper_bound: null,
      });
    }
    console.log(`Custom combinations: ${combinedRows.length}`);

    const dedupedAudiences = Array.from(
      new Map(allAudiences.map((aud) => [`${aud.id}:${aud.subtype}`, aud])).values()
    );

    console.log(`Total Audience Manager data segments: ${dedupedAudiences.length}`);

    return new Response(
      JSON.stringify(dedupedAudiences),
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
