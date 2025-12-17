import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompetitorSearchRequest {
  clientName: string;
  industry: string;
  platforms: string[];
  searchTerms?: string[];
  country?: string;
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

// Search Meta Ad Library API
async function searchMetaAdsLibrary(
  searchTerms: string[],
  accessToken: string,
  country: string = 'US'
): Promise<any[]> {
  const results: any[] = [];
  
  for (const term of searchTerms.slice(0, 5)) { // Limit to 5 searches
    try {
      // Meta Ads Library API endpoint
      const url = new URL('https://graph.facebook.com/v19.0/ads_archive');
      url.searchParams.set('access_token', accessToken);
      url.searchParams.set('search_terms', term);
      url.searchParams.set('ad_reached_countries', JSON.stringify([country]));
      url.searchParams.set('ad_active_status', 'ACTIVE');
      url.searchParams.set('fields', 'id,ad_creation_time,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,page_id,page_name,publisher_platforms,estimated_audience_size');
      url.searchParams.set('limit', '25');
      
      const response = await fetch(url.toString());
      
      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          results.push(...data.data.map((ad: any) => ({
            ...ad,
            search_term: term,
            platform: 'meta'
          })));
        }
      } else {
        console.error(`Meta Ads Library search failed for term "${term}":`, await response.text());
      }
    } catch (error) {
      console.error(`Error searching Meta Ads Library for "${term}":`, error);
    }
  }
  
  // Deduplicate by ad ID
  const uniqueAds = new Map();
  results.forEach(ad => {
    if (!uniqueAds.has(ad.id)) {
      uniqueAds.set(ad.id, ad);
    }
  });
  
  return Array.from(uniqueAds.values());
}

// Search TikTok Commercial Content Library
// Note: TikTok's official API is limited; this uses their public ad library structure
async function searchTikTokAdsLibrary(
  searchTerms: string[],
  accessToken: string,
  country: string = 'US'
): Promise<any[]> {
  const results: any[] = [];
  
  // TikTok Commercial Content Library API
  // Note: TikTok's ad library access is more restricted than Meta's
  // This attempts to use available endpoints
  for (const term of searchTerms.slice(0, 3)) {
    try {
      // TikTok Business API for commercial content
      const url = 'https://business-api.tiktok.com/open_api/v1.3/creative/ads_library/search/';
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          advertiser_name: term,
          region: country,
          page_size: 20
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.data?.ads) {
          results.push(...data.data.ads.map((ad: any) => ({
            ...ad,
            search_term: term,
            platform: 'tiktok'
          })));
        }
      } else {
        const errorText = await response.text();
        console.log(`TikTok Ads Library search note for "${term}":`, errorText);
      }
    } catch (error) {
      console.error(`Error searching TikTok Ads Library for "${term}":`, error);
    }
  }
  
  return results;
}

// Generate simulated competitor data for demo/fallback
function generateSampleCompetitorData(
  clientName: string,
  industry: string,
  platforms: string[]
): any {
  const competitorNames = [
    `${industry.charAt(0).toUpperCase() + industry.slice(1)} Pro`,
    `Better${clientName.split(' ')[0]}`,
    `${industry}Hub`,
    `Smart${industry.charAt(0).toUpperCase() + industry.slice(1)}`,
    `${industry}Expert`,
  ];
  
  const result: any = { meta: [], tiktok: [] };
  
  if (platforms.includes('meta')) {
    result.meta = competitorNames.slice(0, 4).map((name, idx) => ({
      id: `meta_${idx}_${Date.now()}`,
      page_name: name,
      advertiser_name: name,
      ad_creative_body: `Sample ad creative for ${name}`,
      ad_delivery_start_time: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: Math.random() > 0.3,
      publisher_platforms: ['facebook', 'instagram'],
      estimated_audience_size: { lower_bound: 10000, upper_bound: 500000 },
      platform: 'meta'
    }));
  }
  
  if (platforms.includes('tiktok')) {
    result.tiktok = competitorNames.slice(0, 3).map((name, idx) => ({
      id: `tiktok_${idx}_${Date.now()}`,
      advertiser_name: name,
      ad_format: ['In-Feed', 'TopView', 'Branded Effect'][idx % 3],
      impressions: Math.floor(Math.random() * 1000000) + 50000,
      is_active: Math.random() > 0.4,
      region: 'US',
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

    // Get auth header for user context
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    const body: CompetitorSearchRequest = await req.json();
    const { 
      clientName, 
      industry, 
      platforms,
      searchTerms: customSearchTerms,
      country = 'US'
    } = body;

    console.log("Competitor search request:", { clientName, industry, platforms, country });

    // Build search terms from client name and industry
    const industryKeywords = INDUSTRY_KEYWORDS[industry.toLowerCase()] || [];
    const searchTerms = customSearchTerms || [
      clientName,
      ...industryKeywords.slice(0, 3),
      `${industry} ${country}`
    ];

    console.log("Search terms:", searchTerms);

    // Try to get platform access tokens for live API calls
    let metaAccessToken: string | null = null;
    let tiktokAccessToken: string | null = null;
    
    if (userId) {
      // Get Meta access token
      if (platforms.includes('meta')) {
        const { data: metaPlatform } = await supabase
          .from('connected_platforms')
          .select('access_token')
          .eq('user_id', userId)
          .eq('platform_type', 'meta')
          .eq('is_active', true)
          .single();
        
        metaAccessToken = metaPlatform?.access_token || null;
      }
      
      // Get TikTok access token
      if (platforms.includes('tiktok')) {
        const { data: tiktokPlatform } = await supabase
          .from('connected_platforms')
          .select('access_token')
          .eq('user_id', userId)
          .eq('platform_type', 'tiktok')
          .eq('is_active', true)
          .single();
        
        tiktokAccessToken = tiktokPlatform?.access_token || null;
      }
    }

    let result: any = { meta: [], tiktok: [] };
    let usedLiveData = false;

    // Try live API calls if we have access tokens
    if (metaAccessToken && platforms.includes('meta')) {
      try {
        result.meta = await searchMetaAdsLibrary(searchTerms, metaAccessToken, country);
        usedLiveData = result.meta.length > 0;
        console.log(`Fetched ${result.meta.length} Meta ads`);
      } catch (error) {
        console.error("Meta Ads Library error:", error);
      }
    }

    if (tiktokAccessToken && platforms.includes('tiktok')) {
      try {
        result.tiktok = await searchTikTokAdsLibrary(searchTerms, tiktokAccessToken, country);
        usedLiveData = usedLiveData || result.tiktok.length > 0;
        console.log(`Fetched ${result.tiktok.length} TikTok ads`);
      } catch (error) {
        console.error("TikTok Ads Library error:", error);
      }
    }

    // Fall back to sample data if no live data available
    if (!usedLiveData) {
      console.log("Using sample competitor data");
      result = generateSampleCompetitorData(clientName, industry, platforms);
    }

    // Analyze competitor activity summary
    const summary = {
      totalCompetitorAds: result.meta.length + result.tiktok.length,
      metaAdsCount: result.meta.length,
      tiktokAdsCount: result.tiktok.length,
      activeAdsCount: [
        ...result.meta.filter((a: any) => a.is_active || !a.ad_delivery_stop_time),
        ...result.tiktok.filter((a: any) => a.is_active)
      ].length,
      topCompetitors: [...new Set([
        ...result.meta.map((a: any) => a.page_name || a.advertiser_name),
        ...result.tiktok.map((a: any) => a.advertiser_name)
      ])].slice(0, 10),
      searchTermsUsed: searchTerms,
      usedLiveData
    };

    return new Response(
      JSON.stringify({
        success: true,
        meta: result.meta,
        tiktok: result.tiktok,
        summary,
        clientContext: {
          clientName,
          industry,
          country
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
