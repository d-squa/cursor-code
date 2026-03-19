import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken, getAccessTokenWithRefresh } from "../_shared/vault-helper.ts";
import { getGooglePlatformCandidatesForCustomer, getTikTokPlatformCandidatesForAdvertiser } from "../_shared/platform-connection-resolver.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UnifiedTargetingItem {
  id: string;
  name: string;
  description?: string;
  category: 'interest' | 'behavior' | 'demographic' | 'keyword' | 'location' | 'topic';
  platforms: ('meta' | 'tiktok' | 'google')[];
  metaId?: string;
  tiktokId?: string;
  googleId?: string;
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

    const { query, metaAdAccountId, tiktokAdvertiserId, googleCustomerId } = await req.json();

    if (!query) {
      throw new Error('Search query is required');
    }

    console.log('Unified search for:', query, { metaAdAccountId, tiktokAdvertiserId, googleCustomerId });

    const results: UnifiedTargetingItem[] = [];
    const metaResults = new Map<string, any>();
    const tiktokResults = new Map<string, any>();

    // Search Meta if account is provided
    if (metaAdAccountId) {
      console.log('Searching Meta...');
      
      // Get user's team IDs for team-aware lookup
      const { data: teamRoles } = await supabaseClient
        .from('user_roles')
        .select('team_id')
        .eq('user_id', user.id)
        .not('team_id', 'is', null);
      const teamIds = (teamRoles || []).map((r: any) => r.team_id).filter(Boolean);

      // Team-aware Meta platform lookup
      let metaPlatformQuery = supabaseClient
        .from('connected_platforms')
        .select('*')
        .eq('platform_type', 'meta')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (teamIds.length > 0) {
        metaPlatformQuery = metaPlatformQuery.or(
          [`user_id.eq.${user.id}`, ...teamIds.map((id: string) => `team_id.eq.${id}`)].join(',')
        );
      } else {
        metaPlatformQuery = metaPlatformQuery.eq('user_id', user.id);
      }

      const { data: metaPlatforms } = await metaPlatformQuery;
      const metaPlatform = metaPlatforms?.[0] || null;

      if (metaPlatform) {
        // Get access token from Vault with fallback to database column
        const accessToken = await getAccessToken(supabaseClient, metaPlatform.id, metaPlatform.access_token);
        
        if (accessToken) {
          // Search all Meta categories in parallel
          const [interests, behaviors, demographics] = await Promise.all([
            searchMetaCategory(accessToken, metaAdAccountId, 'interests', query),
            searchMetaCategory(accessToken, metaAdAccountId, 'behaviors', query),
            searchMetaCategory(accessToken, metaAdAccountId, 'demographics', query)
          ]);

          console.log(`Meta found ${interests.length} interests, ${behaviors.length} behaviors, ${demographics.length} demographics`);

          interests.forEach((item: any) => metaResults.set(item.name.toLowerCase(), { ...item, category: 'interest' }));
          behaviors.forEach((item: any) => metaResults.set(item.name.toLowerCase(), { ...item, category: 'behavior' }));
          demographics.forEach((item: any) => metaResults.set(item.name.toLowerCase(), { ...item, category: 'demographic' }));
        } else {
          console.error('No Meta access token available');
        }
      } else {
        console.error('No Meta platform connection found for user:', user.id);
      }
    }

    // Search TikTok if account is provided
    if (tiktokAdvertiserId) {
      console.log('Searching TikTok...');
      
      // Use shared team-aware resolver
      const tiktokCandidates = await getTikTokPlatformCandidatesForAdvertiser(supabaseClient, user.id, tiktokAdvertiserId);
      const tiktokPlatform = tiktokCandidates[0] || null;

      if (tiktokPlatform) {
        // Get access token from Vault with fallback to database column
        const accessToken = await getAccessToken(supabaseClient, tiktokPlatform.id, tiktokPlatform.access_token);
        
        if (accessToken) {
          // Search both interests and actions/behaviors in parallel
          const [interests, actions] = await Promise.all([
            searchTikTokInterests(accessToken, tiktokAdvertiserId, query),
            searchTikTokActions(accessToken, tiktokAdvertiserId, query)
          ]);

          console.log(`TikTok found ${interests.length} interests and ${actions.length} actions`);

          interests.forEach((item: any) => tiktokResults.set(item.name.toLowerCase(), { ...item, category: 'interest' }));
          actions.forEach((item: any) => tiktokResults.set(item.name.toLowerCase(), { ...item, category: 'behavior' }));
        } else {
          console.error('No TikTok access token available');
        }
      } else {
        console.error('No TikTok platform connection found for user:', user.id);
      }
    }

    // Search Google Ads if customer ID is provided
    const googleResults = new Map<string, any>();
    if (googleCustomerId) {
      console.log('Searching Google Ads...');
      
      // Use shared team-aware resolver
      const googleCandidates = await getGooglePlatformCandidatesForCustomer(supabaseClient, user.id, googleCustomerId);
      const googlePlatform = googleCandidates[0] || null;

      if (googlePlatform) {
        const accessToken = await getAccessTokenWithRefresh(supabaseClient, googlePlatform.id, googlePlatform.access_token, 'google');
        
        if (accessToken) {
          const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');
          const managerAccountId = Deno.env.get('GOOGLE_ADS_MANAGER_ACCOUNT_ID');
          
          if (developerToken) {
            const cleanCustomerId = googleCustomerId.replace(/-/g, '');
            const headers: Record<string, string> = {
              Authorization: `Bearer ${accessToken}`,
              'developer-token': developerToken,
              'Content-Type': 'application/json',
            };
            if (managerAccountId) {
              headers['login-customer-id'] = managerAccountId.replace(/-/g, '');
            }

            // Search audience segments only (locations excluded - handled separately)
            const audienceResults = await searchGoogleAudiences(headers, cleanCustomerId, query);

            console.log(`Google Ads found ${audienceResults.length} audiences`);

            audienceResults.forEach((item: any) => googleResults.set(item.name.toLowerCase(), { ...item, category: 'interest' }));
          } else {
            console.error('GOOGLE_ADS_DEVELOPER_TOKEN not configured');
          }
        } else {
          console.error('No Google Ads access token available');
        }
      } else {
        console.error('No Google platform connection found for user:', user.id);
      }
    }

    // Merge results - find matches and unique items
    const processedNames = new Set<string>();

    // Process Meta results
    metaResults.forEach((metaItem, key) => {
      const tiktokItem = tiktokResults.get(key);
      
      if (tiktokItem) {
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

    // Add Google Ads results
    googleResults.forEach((googleItem, key) => {
      results.push({
        id: `google-${googleItem.id}`,
        name: googleItem.name,
        description: googleItem.description || '',
        category: googleItem.category,
        platforms: ['google'],
        googleId: googleItem.id
      });
    });

    // Sort: multi-platform matches first, then interleave platforms fairly
    // First, separate by platform count
    const multiPlatform = results.filter(r => r.platforms.length > 1);
    const metaOnly = results.filter(r => r.platforms.length === 1 && r.platforms[0] === 'meta');
    const tiktokOnly = results.filter(r => r.platforms.length === 1 && r.platforms[0] === 'tiktok');
    const googleOnly = results.filter(r => r.platforms.length === 1 && r.platforms[0] === 'google');

    // Interleave single-platform results so no platform dominates
    const interleaved: typeof results = [...multiPlatform];
    const singles = [metaOnly, tiktokOnly, googleOnly].filter(arr => arr.length > 0);
    let idx = 0;
    let hasMore = true;
    while (hasMore) {
      hasMore = false;
      for (const arr of singles) {
        if (idx < arr.length) {
          interleaved.push(arr[idx]);
          hasMore = true;
        }
      }
      idx++;
    }

    console.log(`Found ${interleaved.length} unified results (${metaOnly.length} Meta, ${tiktokOnly.length} TikTok, ${googleOnly.length} Google, ${multiPlatform.length} multi)`);

    return new Response(
      JSON.stringify({ results: interleaved }),
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

// Google Ads helper functions
const GOOGLE_ADS_API_VERSION = 'v23';

async function searchGoogleAudiences(headers: Record<string, string>, customerId: string, query: string) {
  try {
    const escapedQuery = query.replace(/'/g, "''");
    const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;

    const runGaqlSearch = async (gaql: string): Promise<any[]> => {
      const resp = await fetch(searchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: gaql }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('Google data-segment search failed:', errText);
        return [];
      }

      const data = await resp.json();
      const batches = Array.isArray(data) ? data : [];
      return batches.flatMap((batch: any) => batch?.results || []);
    };

    const [userListRows, combinedRows, inMarketRows, affinityRows, lifeEventRows, detailedDemoRows] = await Promise.all([
      runGaqlSearch(`
        SELECT user_list.id, user_list.name, user_list.type, user_list.membership_status
        FROM user_list
        WHERE user_list.membership_status = 'OPEN'
          AND user_list.name LIKE '%${escapedQuery}%'
        LIMIT 50
      `),
      runGaqlSearch(`
        SELECT combined_audience.id, combined_audience.name, combined_audience.status
        FROM combined_audience
        WHERE combined_audience.status = 'ENABLED'
          AND combined_audience.name LIKE '%${escapedQuery}%'
        LIMIT 50
      `),
      // In-market audiences via user_interest resource
      runGaqlSearch(`
        SELECT user_interest.user_interest_id, user_interest.name, user_interest.taxonomy_type
        FROM user_interest
        WHERE user_interest.taxonomy_type = 'IN_MARKET'
          AND user_interest.name LIKE '%${escapedQuery}%'
        LIMIT 50
      `),
      // Affinity audiences via user_interest resource
      runGaqlSearch(`
        SELECT user_interest.user_interest_id, user_interest.name, user_interest.taxonomy_type
        FROM user_interest
        WHERE user_interest.taxonomy_type = 'AFFINITY'
          AND user_interest.name LIKE '%${escapedQuery}%'
        LIMIT 50
      `),
      runGaqlSearch(`
        SELECT life_event.id, life_event.name
        FROM life_event
        WHERE life_event.name LIKE '%${escapedQuery}%'
        LIMIT 50
      `),
      runGaqlSearch(`
        SELECT detailed_demographic.id, detailed_demographic.name, detailed_demographic.parent
        FROM detailed_demographic
        WHERE detailed_demographic.name LIKE '%${escapedQuery}%'
          AND detailed_demographic.parent IS NOT NULL
        LIMIT 50
      `),
    ]);

    console.log(`Google: ${userListRows.length} user_lists, ${combinedRows.length} combined, ${inMarketRows.length} in-market, ${affinityRows.length} affinity, ${lifeEventRows.length} life-events, ${detailedDemoRows.length} detailed-demo`);

    const mappedUserLists = userListRows
      .map((r: any) => {
        const ul = r.userList || r.user_list || {};
        const id = String(ul.id ?? '');
        const name = ul.name ?? '';
        const listType = ul.type ?? '';
        const segment = mapGoogleUserListToDataSegment(listType, name);

        if (!id || !name || !segment) return null;

        return {
          id,
          name,
          description: `Data segment: ${segment}`,
        };
      })
      .filter(Boolean);

    const mappedCombined = combinedRows
      .map((r: any) => {
        const ca = r.combinedAudience || r.combined_audience || {};
        const id = String(ca.id ?? '');
        const name = ca.name ?? '';
        if (!id || !name) return null;
        return { id, name, description: 'Data segment: Custom combination' };
      })
      .filter(Boolean);

    const mappedInMarket = inMarketRows
      .map((r: any) => {
        const seg = r.userInterest || r.user_interest || {};
        const id = String(seg.userInterestId ?? seg.user_interest_id ?? '');
        const name = seg.name ?? '';
        if (!id || !name) return null;
        return { id, name, description: 'In-market' };
      })
      .filter(Boolean);

    const mappedAffinity = affinityRows
      .map((r: any) => {
        const seg = r.userInterest || r.user_interest || {};
        const id = String(seg.userInterestId ?? seg.user_interest_id ?? '');
        const name = seg.name ?? '';
        if (!id || !name) return null;
        return { id, name, description: 'Affinity' };
      })
      .filter(Boolean);

    const mappedLifeEvents = lifeEventRows
      .map((r: any) => {
        const seg = r.lifeEvent || r.life_event || {};
        const id = String(seg.id ?? '');
        const name = seg.name ?? '';
        if (!id || !name) return null;
        return { id, name, description: 'Life event' };
      })
      .filter(Boolean);

    const mappedDetailedDemo = detailedDemoRows
      .map((r: any) => {
        const seg = r.detailedDemographic || r.detailed_demographic || {};
        const id = String(seg.id ?? '');
        const name = seg.name ?? '';
        if (!id || !name) return null;
        return { id, name, description: 'Detailed demographic' };
      })
      .filter(Boolean);

    return [...mappedUserLists, ...mappedCombined, ...mappedInMarket, ...mappedAffinity, ...mappedLifeEvents, ...mappedDetailedDemo];
  } catch (err) {
    console.error('Google audience segment search error:', err);
    return [];
  }
}

function mapGoogleUserListToDataSegment(listTypeRaw: string, listNameRaw: string): string | null {
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

async function searchGoogleLocations(headers: Record<string, string>, query: string) {
  try {
    const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/geoTargetConstants:suggest`;
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        locale: 'en',
        countryCode: 'US',
        locationNames: { names: [query] },
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      return (data.geoTargetConstantSuggestions || []).map((s: any) => ({
        id: String(s.geoTargetConstant.id),
        name: s.geoTargetConstant.canonicalName || s.geoTargetConstant.name,
        description: `Type: ${s.geoTargetConstant.targetType || 'Location'}`,
      }));
    } else {
      const errText = await resp.text();
      console.error('Google location search failed:', errText);
      return [];
    }
  } catch (err) {
    console.error('Google location search error:', err);
    return [];
  }
}
