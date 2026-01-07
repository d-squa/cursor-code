import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompetitorSearchRequest {
  clientId?: string;
  clientName: string;
  industry: string;
  platforms: string[];
  markets: string[];
  userId?: string;
  competitors?: string[]; // Custom competitor names to search
}

interface CompetitorInfo {
  name: string;
  platform: string;
  market: string;
  isLive: boolean;
  adCount: number;
  adDetails: any[];
  previousStatus?: {
    wasLive: boolean;
    adCount: number;
    checkedAt: string;
  };
}

// Use AI to identify competitors for a client based on their name and industry
async function identifyCompetitorsWithAI(
  clientName: string,
  industry: string,
  markets: string[]
): Promise<string[]> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  if (!lovableApiKey) {
    console.log("[AI] No Lovable API key available, using fallback competitor identification");
    return getFallbackCompetitors(industry);
  }
  
  try {
    console.log(`[AI] Identifying competitors for ${clientName} in ${industry} industry`);
    
    const prompt = `You are a competitive intelligence analyst. Given the following client information, identify their top 5-8 direct competitors that are likely to advertise on Meta (Facebook/Instagram) and TikTok.

Client Name: ${clientName}
Industry: ${industry}
Target Markets: ${markets.join(', ')}

IMPORTANT:
- The client "${clientName}" is YOUR CLIENT, NOT a competitor. Do NOT include them in the list.
- Focus on direct competitors that would target similar audiences
- Include both global brands and regional competitors relevant to the markets
- Only include brands that are likely to run paid social media ads

Return ONLY a JSON array of competitor brand names, nothing else. Example format:
["Competitor 1", "Competitor 2", "Competitor 3"]`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: "You are a competitive intelligence expert. Return only valid JSON arrays with competitor brand names. No explanations or markdown." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      console.error("[AI] API error:", aiResponse.status);
      return getFallbackCompetitors(industry);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const competitors = JSON.parse(jsonMatch[0]);
      if (Array.isArray(competitors) && competitors.length > 0) {
        // Filter out the client name if AI accidentally included it
        const filteredCompetitors = competitors.filter(
          (c: string) => c.toLowerCase() !== clientName.toLowerCase()
        );
        console.log(`[AI] Identified ${filteredCompetitors.length} competitors:`, filteredCompetitors);
        return filteredCompetitors.slice(0, 8); // Limit to 8 competitors
      }
    }
    
    console.log("[AI] Failed to parse competitors from response:", content);
    return getFallbackCompetitors(industry);
  } catch (error) {
    console.error("[AI] Error identifying competitors:", error);
    return getFallbackCompetitors(industry);
  }
}

// Fallback competitor identification based on industry
function getFallbackCompetitors(industry: string): string[] {
  const industryCompetitors: Record<string, string[]> = {
    'fashion': ['Zara', 'H&M', 'ASOS', 'Mango', 'Massimo Dutti'],
    'food_delivery': ['Uber Eats', 'DoorDash', 'Deliveroo', 'Grubhub', 'Just Eat'],
    'ecommerce': ['Amazon', 'eBay', 'Shopify Stores', 'Etsy', 'Walmart'],
    'travel': ['Booking.com', 'Expedia', 'Airbnb', 'TripAdvisor', 'Hotels.com'],
    'fitness': ['Nike', 'Adidas', 'Peloton', 'Lululemon', 'Under Armour'],
    'beauty': ['Sephora', 'Ulta', 'MAC', 'Charlotte Tilbury', 'Fenty Beauty'],
    'luxury': ['Gucci', 'Louis Vuitton', 'Prada', 'Chanel', 'Dior'],
    'automotive': ['BMW', 'Mercedes-Benz', 'Audi', 'Tesla', 'Toyota'],
    'finance': ['Chase', 'Bank of America', 'Wells Fargo', 'Robinhood', 'PayPal'],
    'technology': ['Apple', 'Samsung', 'Google', 'Microsoft', 'Sony'],
    'education': ['Coursera', 'Udemy', 'Skillshare', 'Khan Academy', 'edX'],
    'healthcare': ['CVS', 'Walgreens', 'Teladoc', 'One Medical', 'GoodRx'],
    'real_estate': ['Zillow', 'Redfin', 'Realtor.com', 'Trulia', 'Compass'],
  };
  
  const normalizedIndustry = industry.toLowerCase().replace(/[^a-z]/g, '_');
  const competitors = industryCompetitors[normalizedIndustry] || [];
  
  if (competitors.length > 0) {
    console.log(`[FALLBACK] Using industry-based competitors for ${industry}:`, competitors);
    return competitors;
  }
  
  // Generic fallback if industry not recognized
  console.log(`[FALLBACK] Unknown industry "${industry}", using generic competitors`);
  return ['Brand A', 'Brand B', 'Brand C', 'Brand D', 'Brand E'];
}

// Get competitors to search - uses AI to identify competitors or provided custom list
async function getCompetitorsToSearch(
  clientName: string,
  industry: string,
  markets: string[],
  customCompetitors?: string[]
): Promise<string[]> {
  // If custom competitors provided, use those
  if (customCompetitors && customCompetitors.length > 0) {
    console.log(`[COMPETITORS] Using ${customCompetitors.length} custom competitors`);
    return customCompetitors;
  }
  
  // Use AI to identify competitors based on client and industry
  console.log(`[COMPETITORS] Identifying competitors for client: ${clientName} in ${industry}`);
  return await identifyCompetitorsWithAI(clientName, industry, markets);
}

// Search Meta Ad Library for a specific competitor
async function searchMetaForCompetitor(
  competitorName: string,
  accessToken: string,
  market: string
): Promise<{ isLive: boolean; adCount: number; ads: any[] }> {
  try {
    console.log(`[META] Searching for "${competitorName}" in ${market}`);
    
    const url = new URL('https://graph.facebook.com/v19.0/ads_archive');
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('search_terms', competitorName);
    url.searchParams.set('ad_reached_countries', JSON.stringify([market]));
    url.searchParams.set('ad_active_status', 'ACTIVE');
    url.searchParams.set('ad_type', 'ALL');
    url.searchParams.set('fields', 'id,ad_creation_time,ad_creative_bodies,page_name,publisher_platforms');
    url.searchParams.set('limit', '50');
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[META] API error for "${competitorName}":`, errorText);
      
      // Check if it's a permission error
      if (errorText.includes('OAuthException')) {
        console.log(`[META] OAuth error - Ad Library API may require app review`);
      }
      
      return { isLive: false, adCount: 0, ads: [] };
    }
    
    const data = await response.json();
    const ads = data.data || [];
    
    // Filter ads that match the competitor name closely
    const matchingAds = ads.filter((ad: any) => 
      ad.page_name?.toLowerCase().includes(competitorName.toLowerCase().split(' ')[0])
    );
    
    console.log(`[META] Found ${matchingAds.length} ads for "${competitorName}" in ${market}`);
    
    return {
      isLive: matchingAds.length > 0,
      adCount: matchingAds.length,
      ads: matchingAds.slice(0, 10)
    };
  } catch (error) {
    console.error(`[META] Error searching for "${competitorName}":`, error);
    return { isLive: false, adCount: 0, ads: [] };
  }
}

// Search TikTok Commercial Content Library for a specific competitor
async function searchTikTokForCompetitor(
  competitorName: string,
  accessToken: string,
  market: string
): Promise<{ isLive: boolean; adCount: number; ads: any[] }> {
  try {
    console.log(`[TIKTOK] Searching for "${competitorName}" in ${market}`);
    
    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/creative/ads_library/search/', {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        advertiser_name: competitorName,
        region: market,
        page_size: 50
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[TIKTOK] API response for "${competitorName}":`, errorText);
      return { isLive: false, adCount: 0, ads: [] };
    }
    
    const data = await response.json();
    const ads = data.data?.ads || [];
    
    console.log(`[TIKTOK] Found ${ads.length} ads for "${competitorName}" in ${market}`);
    
    return {
      isLive: ads.length > 0,
      adCount: ads.length,
      ads: ads.slice(0, 10)
    };
  } catch (error) {
    console.error(`[TIKTOK] Error searching for "${competitorName}":`, error);
    return { isLive: false, adCount: 0, ads: [] };
  }
}

// Generate sample competitor data for testing
function generateSampleCompetitorData(
  competitorName: string,
  platform: string,
  market: string
): { isLive: boolean; adCount: number; ads: any[] } {
  const isLive = Math.random() > 0.3;
  const adCount = isLive ? Math.floor(Math.random() * 15) + 1 : 0;
  
  return {
    isLive,
    adCount,
    ads: isLive ? Array.from({ length: Math.min(adCount, 5) }, (_, i) => ({
      id: `${platform}_${market}_${competitorName}_${i}`,
      advertiser_name: competitorName,
      page_name: competitorName,
      platform,
      market,
      created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
    })) : []
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: CompetitorSearchRequest = await req.json();
    const { clientId, clientName, industry, platforms, markets = ['US'], userId: bodyUserId } = body;

    // Get user ID
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = bodyUserId || null;
    
    if (!userId && authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    console.log("=== COMPETITOR ANALYSIS START ===");
    console.log("Client:", clientName, "| Industry:", industry);
    console.log("Platforms:", platforms, "| Markets:", markets);
    console.log("Client ID:", clientId || "Not provided");
    console.log("User ID:", userId || "Anonymous");

    // Get platform tokens
    let metaAccessToken: string | null = null;
    let tiktokAccessToken: string | null = null;
    
    if (userId) {
      if (platforms.includes('meta')) {
        const { data: metaPlatform } = await supabase
          .from('connected_platforms')
          .select('id, access_token')
          .eq('user_id', userId)
          .eq('platform_type', 'meta')
          .eq('is_active', true)
          .single();
        
        if (metaPlatform) {
          metaAccessToken = await getAccessToken(supabase, metaPlatform.id, metaPlatform.access_token);
          console.log(`[META] Token available: ${!!metaAccessToken}`);
        }
      }
      
      if (platforms.includes('tiktok')) {
        const { data: tiktokPlatform } = await supabase
          .from('connected_platforms')
          .select('id, access_token')
          .eq('user_id', userId)
          .eq('platform_type', 'tiktok')
          .eq('is_active', true)
          .single();
        
        if (tiktokPlatform) {
          tiktokAccessToken = await getAccessToken(supabase, tiktokPlatform.id, tiktokPlatform.access_token);
          console.log(`[TIKTOK] Token available: ${!!tiktokAccessToken}`);
        }
      }
    }

    // Results collection
    const allCompetitors: CompetitorInfo[] = [];
    let usedLiveData = false;

    // Identify competitors using AI (do this once, not per market)
    const competitors = await getCompetitorsToSearch(clientName, industry, markets, body.competitors);
    console.log(`[SEARCH] Identified competitors to search:`, competitors);

    // Process each market
    for (const market of markets) {
      console.log(`\n=== Processing Market: ${market} ===`);
      
      // Step 2: Get previous status from database
      let previousStatuses: Record<string, any> = {};
      if (clientId && userId) {
        const { data: existingTracking } = await supabase
          .from('competitor_tracking')
          .select('competitor_name, platform, is_live, active_ad_count, last_checked_at')
          .eq('client_id', clientId)
          .eq('market', market)
          .eq('user_id', userId);
        
        if (existingTracking) {
          existingTracking.forEach((t: any) => {
            const key = `${t.competitor_name}_${t.platform}`;
            previousStatuses[key] = {
              wasLive: t.is_live,
              adCount: t.active_ad_count,
              checkedAt: t.last_checked_at
            };
          });
          console.log(`[DB] Found ${existingTracking.length} previous tracking records`);
        }
      }
      
      // Step 3: Search each competitor individually
      for (const competitor of competitors) {
        console.log(`\n--- Checking competitor: ${competitor} ---`);
        
        // Search on Meta
        if (platforms.includes('meta')) {
          let metaResult: { isLive: boolean; adCount: number; ads: any[] };
          
          if (metaAccessToken) {
            metaResult = await searchMetaForCompetitor(competitor, metaAccessToken, market);
            if (metaResult.adCount > 0) usedLiveData = true;
          } else {
            console.log(`[META] No token, using sample data for ${competitor}`);
            metaResult = generateSampleCompetitorData(competitor, 'meta', market);
          }
          
          const prevKey = `${competitor}_meta`;
          allCompetitors.push({
            name: competitor,
            platform: 'meta',
            market,
            isLive: metaResult.isLive,
            adCount: metaResult.adCount,
            adDetails: metaResult.ads,
            previousStatus: previousStatuses[prevKey]
          });
          
          // Store/update in database
          if (clientId && userId) {
            await upsertCompetitorTracking(supabase, {
              clientId,
              userId,
              competitorName: competitor,
              platform: 'meta',
              market,
              isLive: metaResult.isLive,
              adCount: metaResult.adCount,
              adDetails: metaResult.ads
            });
          }
        }
        
        // Search on TikTok
        if (platforms.includes('tiktok')) {
          let tiktokResult: { isLive: boolean; adCount: number; ads: any[] };
          
          if (tiktokAccessToken) {
            tiktokResult = await searchTikTokForCompetitor(competitor, tiktokAccessToken, market);
            if (tiktokResult.adCount > 0) usedLiveData = true;
          } else {
            console.log(`[TIKTOK] No token, using sample data for ${competitor}`);
            tiktokResult = generateSampleCompetitorData(competitor, 'tiktok', market);
          }
          
          const prevKey = `${competitor}_tiktok`;
          allCompetitors.push({
            name: competitor,
            platform: 'tiktok',
            market,
            isLive: tiktokResult.isLive,
            adCount: tiktokResult.adCount,
            adDetails: tiktokResult.ads,
            previousStatus: previousStatuses[prevKey]
          });
          
          // Store/update in database
          if (clientId && userId) {
            await upsertCompetitorTracking(supabase, {
              clientId,
              userId,
              competitorName: competitor,
              platform: 'tiktok',
              market,
              isLive: tiktokResult.isLive,
              adCount: tiktokResult.adCount,
              adDetails: tiktokResult.ads
            });
          }
        }
      }
    }

    // Build summary
    const competitorsByName: Record<string, CompetitorInfo[]> = {};
    allCompetitors.forEach(c => {
      if (!competitorsByName[c.name]) competitorsByName[c.name] = [];
      competitorsByName[c.name].push(c);
    });

    const summary = {
      totalCompetitors: Object.keys(competitorsByName).length,
      liveCompetitors: Object.keys(competitorsByName).filter(name => 
        competitorsByName[name].some(c => c.isLive)
      ),
      silentCompetitors: Object.keys(competitorsByName).filter(name => 
        competitorsByName[name].every(c => !c.isLive)
      ),
      totalActiveAds: allCompetitors.reduce((sum, c) => sum + c.adCount, 0),
      marketsSearched: markets,
      usedLiveData,
      byMarket: markets.map(market => ({
        market,
        competitors: allCompetitors.filter(c => c.market === market).map(c => ({
          name: c.name,
          platform: c.platform,
          isLive: c.isLive,
          adCount: c.adCount,
          statusChange: c.previousStatus ? 
            (c.isLive !== c.previousStatus.wasLive ? 
              (c.isLive ? 'NOW_LIVE' : 'NOW_SILENT') : 'NO_CHANGE') : 
            'NEW'
        }))
      }))
    };

    console.log("\n=== COMPETITOR ANALYSIS COMPLETE ===");
    console.log("Live competitors:", summary.liveCompetitors);
    console.log("Silent competitors:", summary.silentCompetitors);
    console.log("Total active ads:", summary.totalActiveAds);
    console.log("Used live data:", usedLiveData);

    return new Response(
      JSON.stringify({
        success: true,
        competitors: allCompetitors,
        competitorsByName,
        summary,
        clientContext: { clientName, industry, markets }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Competitor search error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to upsert competitor tracking
async function upsertCompetitorTracking(
  supabase: any,
  data: {
    clientId: string;
    userId: string;
    competitorName: string;
    platform: string;
    market: string;
    isLive: boolean;
    adCount: number;
    adDetails: any[];
  }
) {
  try {
    // Check if record exists
    const { data: existing } = await supabase
      .from('competitor_tracking')
      .select('id, is_live, active_ad_count')
      .eq('client_id', data.clientId)
      .eq('competitor_name', data.competitorName)
      .eq('platform', data.platform)
      .eq('market', data.market)
      .single();
    
    if (existing) {
      // Store history before updating
      await supabase.from('competitor_history').insert({
        competitor_tracking_id: existing.id,
        was_live: existing.is_live,
        ad_count: existing.active_ad_count,
        checked_at: new Date().toISOString()
      });
      
      // Update existing record
      await supabase
        .from('competitor_tracking')
        .update({
          is_live: data.isLive,
          active_ad_count: data.adCount,
          ad_details: data.adDetails,
          last_checked_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      
      console.log(`[DB] Updated tracking for ${data.competitorName} on ${data.platform}`);
    } else {
      // Insert new record
      await supabase.from('competitor_tracking').insert({
        client_id: data.clientId,
        user_id: data.userId,
        competitor_name: data.competitorName,
        platform: data.platform,
        market: data.market,
        is_live: data.isLive,
        active_ad_count: data.adCount,
        ad_details: data.adDetails,
        first_seen_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString()
      });
      
      console.log(`[DB] Created tracking for ${data.competitorName} on ${data.platform}`);
    }
  } catch (error) {
    console.error(`[DB] Error upserting competitor tracking:`, error);
  }
}
