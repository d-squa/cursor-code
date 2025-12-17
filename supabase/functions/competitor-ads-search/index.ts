import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompetitorSearchRequest {
  clientName: string;
  industry: string;
  platforms: string[];
  markets: string[]; // Array of market codes (e.g., ['IT', 'ES', 'US'])
  searchTerms?: string[];
  userId?: string; // Optional userId passed from parent function
}

// Industry keywords for broader competitor search
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  'ecommerce': ['shop', 'store', 'buy', 'sale', 'discount', 'free shipping'],
  'saas': ['software', 'platform', 'solution', 'app', 'tool', 'service'],
  'finance': ['bank', 'loan', 'invest', 'credit', 'insurance', 'mortgage'],
  'healthcare': ['health', 'medical', 'doctor', 'clinic', 'wellness', 'care'],
  'education': ['learn', 'course', 'training', 'school', 'university', 'online class'],
  'travel': ['flight', 'hotel', 'vacation', 'travel', 'booking', 'trip'],
  'food': ['restaurant', 'food', 'delivery', 'order', 'menu', 'cuisine'],
  'fitness': ['gym', 'workout', 'fitness', 'exercise', 'health', 'training'],
  'beauty': ['beauty', 'skincare', 'makeup', 'cosmetic', 'hair', 'spa'],
  'technology': ['tech', 'gadget', 'device', 'electronic', 'smart', 'innovation'],
  'real_estate': ['property', 'home', 'apartment', 'real estate', 'house', 'rent'],
  'automotive': ['car', 'auto', 'vehicle', 'drive', 'dealer', 'motor'],
  'gaming': ['game', 'play', 'gaming', 'esports', 'console', 'mobile game'],
  'entertainment': ['movie', 'music', 'stream', 'show', 'entertainment', 'media'],
};

// Search Meta Ad Library API for a specific market
async function searchMetaAdsLibraryForMarket(
  searchTerms: string[],
  accessToken: string,
  market: string
): Promise<any[]> {
  const results: any[] = [];
  
  console.log(`[META] Searching Ad Library for market: ${market}`);
  console.log(`[META] Search terms: ${searchTerms.join(', ')}`);
  
  for (const term of searchTerms.slice(0, 5)) { // Limit to 5 searches
    try {
      // Meta Ads Library API endpoint
      const url = new URL('https://graph.facebook.com/v19.0/ads_archive');
      url.searchParams.set('access_token', accessToken);
      url.searchParams.set('search_terms', term);
      url.searchParams.set('ad_reached_countries', JSON.stringify([market]));
      url.searchParams.set('ad_active_status', 'ACTIVE');
      url.searchParams.set('ad_type', 'ALL'); // Always use ALL ads category
      url.searchParams.set('fields', 'id,ad_creation_time,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,page_id,page_name,publisher_platforms,estimated_audience_size');
      url.searchParams.set('limit', '25');
      
      console.log(`[META] API call for term "${term}" in market ${market}`);
      
      const response = await fetch(url.toString());
      
      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          console.log(`[META] Found ${data.data.length} ads for term "${term}" in ${market}`);
          results.push(...data.data.map((ad: any) => ({
            ...ad,
            search_term: term,
            market: market,
            platform: 'meta'
          })));
        }
      } else {
        const errorText = await response.text();
        console.error(`[META] API error for term "${term}" in ${market}:`, errorText);
      }
    } catch (error) {
      console.error(`[META] Error searching for "${term}" in ${market}:`, error);
    }
  }
  
  // Deduplicate by ad ID
  const uniqueAds = new Map();
  results.forEach(ad => {
    if (!uniqueAds.has(ad.id)) {
      uniqueAds.set(ad.id, ad);
    }
  });
  
  console.log(`[META] Total unique ads found for ${market}: ${uniqueAds.size}`);
  return Array.from(uniqueAds.values());
}

// Search TikTok Commercial Content Library for a specific market
async function searchTikTokAdsLibraryForMarket(
  searchTerms: string[],
  accessToken: string,
  market: string
): Promise<any[]> {
  const results: any[] = [];
  
  console.log(`[TIKTOK] Searching Ad Library for market: ${market}`);
  console.log(`[TIKTOK] Search terms: ${searchTerms.join(', ')}`);
  
  for (const term of searchTerms.slice(0, 3)) {
    try {
      // TikTok Business API for commercial content
      const url = 'https://business-api.tiktok.com/open_api/v1.3/creative/ads_library/search/';
      
      console.log(`[TIKTOK] API call for term "${term}" in market ${market}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          advertiser_name: term,
          region: market,
          page_size: 20
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.data?.ads) {
          console.log(`[TIKTOK] Found ${data.data.ads.length} ads for term "${term}" in ${market}`);
          results.push(...data.data.ads.map((ad: any) => ({
            ...ad,
            search_term: term,
            market: market,
            platform: 'tiktok'
          })));
        }
      } else {
        const errorText = await response.text();
        console.log(`[TIKTOK] API note for "${term}" in ${market}:`, errorText);
      }
    } catch (error) {
      console.error(`[TIKTOK] Error searching for "${term}" in ${market}:`, error);
    }
  }
  
  console.log(`[TIKTOK] Total ads found for ${market}: ${results.length}`);
  return results;
}

// Generate simulated competitor data for demo/fallback - per market
function generateSampleCompetitorDataForMarket(
  clientName: string,
  industry: string,
  platforms: string[],
  market: string
): { meta: any[], tiktok: any[] } {
  const competitorNames = [
    `${industry.charAt(0).toUpperCase() + industry.slice(1)} Pro`,
    `Better${clientName.split(' ')[0]}`,
    `${industry}Hub`,
    `Smart${industry.charAt(0).toUpperCase() + industry.slice(1)}`,
    `${industry}Expert`,
  ];
  
  const result: { meta: any[], tiktok: any[] } = { meta: [], tiktok: [] };
  
  if (platforms.includes('meta')) {
    result.meta = competitorNames.slice(0, 4).map((name, idx) => ({
      id: `meta_${market}_${idx}_${Date.now()}`,
      page_name: name,
      advertiser_name: name,
      ad_creative_body: `Sample ad creative for ${name} targeting ${market}`,
      ad_delivery_start_time: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: Math.random() > 0.3,
      publisher_platforms: ['facebook', 'instagram'],
      estimated_audience_size: { lower_bound: 10000, upper_bound: 500000 },
      market: market,
      platform: 'meta'
    }));
  }
  
  if (platforms.includes('tiktok')) {
    result.tiktok = competitorNames.slice(0, 3).map((name, idx) => ({
      id: `tiktok_${market}_${idx}_${Date.now()}`,
      advertiser_name: name,
      ad_format: ['In-Feed', 'TopView', 'Branded Effect'][idx % 3],
      impressions: Math.floor(Math.random() * 1000000) + 50000,
      is_active: Math.random() > 0.4,
      region: market,
      market: market,
      platform: 'tiktok'
    }));
  }
  
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header for user context (direct call) or use userId from body (internal call)
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    // First check if userId is passed in body (from insights-recommendations)
    const body: CompetitorSearchRequest = await req.json();
    const { 
      clientName, 
      industry, 
      platforms,
      markets = ['US'], // Default to US if no markets provided
      searchTerms: customSearchTerms,
      userId: bodyUserId
    } = body;
    
    // Use userId from body if provided, otherwise try to get from auth header
    if (bodyUserId) {
      userId = bodyUserId;
      console.log("Using userId from request body:", userId);
    } else if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
      console.log("Using userId from auth header:", userId || "None");
    }

    console.log("=== COMPETITOR ANALYSIS START ===");
    console.log("Input parameters:", { clientName, industry, platforms, markets });
    console.log("User ID:", userId || "Anonymous (service role)");
    console.log("Ad type/category: ALL (always)");

    // Build search terms from client name and industry
    const industryKeywords = INDUSTRY_KEYWORDS[industry.toLowerCase()] || [];
    const searchTerms = customSearchTerms || [
      clientName,
      ...industryKeywords.slice(0, 3)
    ];

    console.log("Industry keywords found:", industryKeywords);
    console.log("Search terms to use:", searchTerms);
    console.log("Custom search terms provided:", customSearchTerms ? "Yes" : "No");
    console.log("Markets to search:", markets);

    // Try to get platform access tokens for live API calls (using Vault)
    let metaAccessToken: string | null = null;
    let tiktokAccessToken: string | null = null;
    
    if (userId) {
      // Get Meta access token from Vault
      if (platforms.includes('meta')) {
        const { data: metaPlatform } = await supabase
          .from('connected_platforms')
          .select('id, access_token')
          .eq('user_id', userId)
          .eq('platform_type', 'meta')
          .eq('is_active', true)
          .single();
        
        if (metaPlatform) {
          // Try Vault first, then fallback to database column
          metaAccessToken = await getAccessToken(supabase, metaPlatform.id, metaPlatform.access_token);
          console.log(`[META] Platform ID: ${metaPlatform.id}, Token retrieved from: ${metaAccessToken ? (metaPlatform.access_token ? 'Vault or DB fallback' : 'Vault') : 'None'}`);
        } else {
          console.log("[META] No active Meta platform connection found for user");
        }
      }
      
      // Get TikTok access token from Vault
      if (platforms.includes('tiktok')) {
        const { data: tiktokPlatform } = await supabase
          .from('connected_platforms')
          .select('id, access_token')
          .eq('user_id', userId)
          .eq('platform_type', 'tiktok')
          .eq('is_active', true)
          .single();
        
        if (tiktokPlatform) {
          // Try Vault first, then fallback to database column
          tiktokAccessToken = await getAccessToken(supabase, tiktokPlatform.id, tiktokPlatform.access_token);
          console.log(`[TIKTOK] Platform ID: ${tiktokPlatform.id}, Token retrieved from: ${tiktokAccessToken ? (tiktokPlatform.access_token ? 'Vault or DB fallback' : 'Vault') : 'None'}`);
        } else {
          console.log("[TIKTOK] No active TikTok platform connection found for user");
        }
      }
    } else {
      console.log("No userId available - cannot retrieve platform tokens");
    }

    // Initialize results per market
    const resultsByMarket: Record<string, { meta: any[], tiktok: any[] }> = {};
    let usedLiveData = false;

    console.log("=== ATTEMPTING LIVE API CALLS PER MARKET ===");
    console.log("Meta access token available:", !!metaAccessToken);
    console.log("TikTok access token available:", !!tiktokAccessToken);

    // Process each market separately
    for (const market of markets) {
      console.log(`\n--- Processing market: ${market} ---`);
      resultsByMarket[market] = { meta: [], tiktok: [] };
      
      // Meta API for this market
      if (metaAccessToken && platforms.includes('meta')) {
        try {
          resultsByMarket[market].meta = await searchMetaAdsLibraryForMarket(searchTerms, metaAccessToken, market);
          if (resultsByMarket[market].meta.length > 0) {
            usedLiveData = true;
            const competitorNames = [...new Set(resultsByMarket[market].meta.map((ad: any) => ad.page_name || ad.advertiser_name).filter(Boolean))];
            console.log(`[META] Competitors found in ${market}:`, competitorNames);
          }
        } catch (error) {
          console.error(`[META] Error for market ${market}:`, error);
        }
      }
      
      // TikTok API for this market
      if (tiktokAccessToken && platforms.includes('tiktok')) {
        try {
          resultsByMarket[market].tiktok = await searchTikTokAdsLibraryForMarket(searchTerms, tiktokAccessToken, market);
          if (resultsByMarket[market].tiktok.length > 0) {
            usedLiveData = true;
            const competitorNames = [...new Set(resultsByMarket[market].tiktok.map((ad: any) => ad.advertiser_name).filter(Boolean))];
            console.log(`[TIKTOK] Competitors found in ${market}:`, competitorNames);
          }
        } catch (error) {
          console.error(`[TIKTOK] Error for market ${market}:`, error);
        }
      }
      
      // Fall back to sample data for this market if no live data
      const hasLiveDataForMarket = resultsByMarket[market].meta.length > 0 || resultsByMarket[market].tiktok.length > 0;
      if (!hasLiveDataForMarket) {
        console.log(`[SAMPLE] Generating sample data for market ${market}`);
        const sampleData = generateSampleCompetitorDataForMarket(clientName, industry, platforms, market);
        resultsByMarket[market] = sampleData;
        console.log(`[SAMPLE] Generated ${sampleData.meta.length} Meta ads and ${sampleData.tiktok.length} TikTok ads for ${market}`);
      }
    }

    // Combine all results
    const combinedMeta = Object.values(resultsByMarket).flatMap(r => r.meta);
    const combinedTiktok = Object.values(resultsByMarket).flatMap(r => r.tiktok);

    // Analyze competitor activity summary
    const topCompetitors = [...new Set([
      ...combinedMeta.map((a: any) => a.page_name || a.advertiser_name),
      ...combinedTiktok.map((a: any) => a.advertiser_name)
    ])].filter(Boolean).slice(0, 10);
    
    const summary = {
      totalCompetitorAds: combinedMeta.length + combinedTiktok.length,
      metaAdsCount: combinedMeta.length,
      tiktokAdsCount: combinedTiktok.length,
      activeAdsCount: [
        ...combinedMeta.filter((a: any) => a.is_active || !a.ad_delivery_stop_time),
        ...combinedTiktok.filter((a: any) => a.is_active)
      ].length,
      topCompetitors,
      searchTermsUsed: searchTerms,
      marketsSearched: markets,
      usedLiveData,
      adTypeCategory: 'ALL',
      perMarketSummary: Object.entries(resultsByMarket).map(([market, data]) => ({
        market,
        metaAdsCount: data.meta.length,
        tiktokAdsCount: data.tiktok.length,
        competitors: [...new Set([
          ...data.meta.map((a: any) => a.page_name || a.advertiser_name),
          ...data.tiktok.map((a: any) => a.advertiser_name)
        ])].filter(Boolean)
      }))
    };

    console.log("\n=== COMPETITOR ANALYSIS COMPLETE ===");
    console.log("Summary:", JSON.stringify(summary, null, 2));
    console.log("Top competitors identified:", topCompetitors);

    return new Response(
      JSON.stringify({
        success: true,
        meta: combinedMeta,
        tiktok: combinedTiktok,
        byMarket: resultsByMarket,
        summary,
        clientContext: {
          clientName,
          industry,
          markets
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Competitor search error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
