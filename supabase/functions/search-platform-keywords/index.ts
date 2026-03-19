import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken, getAccessTokenWithRefresh } from "../_shared/vault-helper.ts";
import { getGooglePlatformCandidatesForCustomer } from "../_shared/platform-connection-resolver.ts";
import { getTikTokPlatformCandidatesForAdvertiser } from "../_shared/platform-connection-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_ADS_API_VERSION = "v23";

interface KeywordResult {
  id: string;
  name: string;
  platform: "google" | "tiktok";
  market: string; // Country code (e.g. "AE", "US")
  avgMonthlySearches?: number;
  competition?: string;
  cpcLow?: number;
  cpcHigh?: number;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query, googleCustomerId, tiktokAdvertiserId, markets } = await req.json();

    if (!query) {
      throw new Error("query is required");
    }

    // Markets is an array of country codes, e.g. ["AE", "US"]
    // If not provided, fall back to ["US"]
    const targetMarkets: string[] = (markets && markets.length > 0) ? markets : ["US"];

    console.log(`Searching keywords: "${query}" google=${googleCustomerId} tiktok=${tiktokAdvertiserId} markets=${targetMarkets.join(",")}`);

    const allResults: KeywordResult[] = [];

    // Search Google Ads Keywords - parallel per market
    if (googleCustomerId) {
      const platformCandidates = await getGooglePlatformCandidatesForCustomer(supabase, user.id, googleCustomerId);
      const platform = platformCandidates.length > 0 ? platformCandidates[0] : null;

      if (platform) {
        const accessToken = await getAccessTokenWithRefresh(supabase, platform.id, platform.access_token, 'google');
        const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");

        // Resolve login-customer-id from google_ad_accounts table first, then env var fallback
        const cleanCustomerId = googleCustomerId.replace(/-/g, "");
        let loginCustomerId: string | null = null;

        const { data: googleAdAccount } = await supabase
          .from('google_ad_accounts')
          .select('manager_customer_id')
          .eq('customer_id', cleanCustomerId)
          .limit(1)
          .maybeSingle();

        if (googleAdAccount?.manager_customer_id) {
          loginCustomerId = googleAdAccount.manager_customer_id.replace(/-/g, "");
          console.log(`Using manager_customer_id from google_ad_accounts: ${loginCustomerId}`);
        } else {
          const managerAccountId = Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID");
          if (managerAccountId) {
            loginCustomerId = managerAccountId.replace(/-/g, "");
            console.log(`Using GOOGLE_ADS_MANAGER_ACCOUNT_ID env var: ${loginCustomerId}`);
          }
        }

        if (accessToken && developerToken) {
          const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": developerToken,
            "Content-Type": "application/json",
          };
          if (loginCustomerId) {
            headers["login-customer-id"] = loginCustomerId;
          }

          // Make parallel requests per market
          const marketPromises = targetMarkets.map(async (marketCode) => {
            const geoId = getGeoTargetId(marketCode);
            const keywordUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}:generateKeywordIdeas`;
            const keywordBody = {
              language: "languageConstants/1000",
              geoTargetConstants: [`geoTargetConstants/${geoId}`],
              keywordSeed: { keywords: [query] },
              pageSize: 100,
              keywordPlanNetwork: "GOOGLE_SEARCH_AND_PARTNERS",
            };

            try {
              const resp = await fetch(keywordUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(keywordBody),
              });

              if (resp.ok) {
                const data = await resp.json();
                const marketResults: KeywordResult[] = [];
                (data.results || []).forEach((r: any) => {
                  marketResults.push({
                    id: `google_kw_${r.text}_${marketCode}`,
                    name: r.text,
                    platform: "google",
                    market: marketCode,
                    avgMonthlySearches: Number(r.keywordIdeaMetrics?.avgMonthlySearches) || 0,
                    competition: r.keywordIdeaMetrics?.competition || "UNSPECIFIED",
                    cpcLow: Number(r.keywordIdeaMetrics?.lowTopOfPageBidMicros) / 1_000_000 || 0,
                    cpcHigh: Number(r.keywordIdeaMetrics?.highTopOfPageBidMicros) / 1_000_000 || 0,
                  });
                });
                console.log(`Google Ads returned ${marketResults.length} keyword ideas for market ${marketCode}`);
                return marketResults;
              } else {
                const errText = await resp.text();
                console.error(`Google keyword ideas failed for market ${marketCode}:`, errText);
                return [];
              }
            } catch (err) {
              console.error(`Google keyword search error for market ${marketCode}:`, err);
              return [];
            }
          });

          const marketResultArrays = await Promise.all(marketPromises);
          for (const results of marketResultArrays) {
            allResults.push(...results);
          }
        }
      }
    }

    // Search TikTok Keywords - parallel per market
    if (tiktokAdvertiserId) {
      const platformCandidates = await getTikTokPlatformCandidatesForAdvertiser(supabase, user.id, tiktokAdvertiserId);
      const platform = platformCandidates.length > 0 ? platformCandidates[0] : null;

      if (platform) {
        const accessToken = await getAccessToken(supabase, platform.id, platform.access_token);

        if (accessToken) {
          // TikTok keyword recommend API doesn't have strong geo filtering,
          // but we'll tag results with each market code for consistency
          const apiVersion = "v1.3";

          const marketPromises = targetMarkets.map(async (marketCode) => {
            try {
              const fetchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/interest_keyword/recommend/?advertiser_id=${tiktokAdvertiserId}&keywords=["${encodeURIComponent(query)}"]&language=en&limit=50`;

              const resp = await fetch(fetchUrl, {
                method: "GET",
                headers: {
                  "Access-Token": accessToken,
                  "Content-Type": "application/json",
                },
              });

              if (resp.ok) {
                const data = await resp.json();
                const marketResults: KeywordResult[] = [];
                if (data.code === 0 && data.data?.recommended_keywords) {
                  data.data.recommended_keywords.forEach((kw: any) => {
                    marketResults.push({
                      id: `tiktok_kw_${kw.keyword_id || kw.keyword}_${marketCode}`,
                      name: kw.keyword,
                      platform: "tiktok",
                      market: marketCode,
                      avgMonthlySearches: kw.search_volume || 0,
                      competition: kw.competition_index ? String(kw.competition_index) : undefined,
                    });
                  });
                  console.log(`TikTok returned ${marketResults.length} keyword recommendations for market ${marketCode}`);
                }
                return marketResults;
              } else {
                console.error(`TikTok keyword recommend failed for ${marketCode}:`, resp.status);
                return [];
              }
            } catch (err) {
              console.error(`TikTok keyword search error for ${marketCode}:`, err);
              return [];
            }
          });

          const marketResultArrays = await Promise.all(marketPromises);
          for (const results of marketResultArrays) {
            allResults.push(...results);
          }
        }
      }
    }

    console.log(`Total keyword results: ${allResults.length} across ${targetMarkets.length} markets`);

    return new Response(
      JSON.stringify({ results: allResults, markets: targetMarkets }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("search-platform-keywords error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getGeoTargetId(countryCode: string): string {
  const map: Record<string, string> = {
    US: "2840", GB: "2826", DE: "2276", FR: "2250", AE: "2784",
    SA: "2682", EG: "2818", IN: "2356", BR: "2076", AU: "2036",
    CA: "2124", JP: "2392", KR: "2410", MX: "2484", IT: "2380",
    ES: "2724", NL: "2528", SE: "2752", NO: "2578", DK: "2208",
    TR: "2792", PL: "2616", ZA: "2710", NG: "2566", KE: "2404",
    KW: "2414", BH: "2048", QA: "2634", OM: "2512", JO: "2400",
    LB: "2422", IQ: "2368", MA: "2504", TN: "2788", LY: "2434",
    SG: "2702", MY: "2458", ID: "2360", TH: "2764", PH: "2608",
    VN: "2704", CN: "2156", HK: "2344", TW: "2158", RU: "2643",
    UA: "2804", CZ: "2203", HU: "2348", RO: "2642", BG: "2100",
    HR: "2191", RS: "2688", PT: "2620", GR: "2300", IE: "2372",
    NZ: "2554", CL: "2152", CO: "2170", PE: "2604", AR: "2032",
    BE: "2056", CH: "2756", AT: "2040", FI: "2246", LU: "2442",
  };
  return map[countryCode.toUpperCase()] || "2840";
}
