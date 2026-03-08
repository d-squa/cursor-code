import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken, getAccessTokenWithRefresh } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_ADS_API_VERSION = "v23";

interface KeywordResult {
  id: string;
  name: string;
  platform: "google" | "tiktok";
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

    const { query, googleCustomerId, tiktokAdvertiserId, countryCode = "US" } = await req.json();

    if (!query) {
      throw new Error("query is required");
    }

    console.log(`Searching keywords: "${query}" google=${googleCustomerId} tiktok=${tiktokAdvertiserId}`);

    const results: KeywordResult[] = [];

    // Search Google Ads Keywords
    if (googleCustomerId) {
      const { data: platform } = await supabase
        .from("connected_platforms")
        .select("id, access_token")
        .eq("user_id", user.id)
        .eq("platform_type", "google")
        .eq("is_active", true)
        .single();

      if (platform) {
        const accessToken = await getAccessTokenWithRefresh(supabase, platform.id, platform.access_token, 'google');
        const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
        const managerAccountId = Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID");

        if (accessToken && developerToken) {
          const cleanCustomerId = googleCustomerId.replace(/-/g, "");
          const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": developerToken,
            "Content-Type": "application/json",
          };
          if (managerAccountId) {
            headers["login-customer-id"] = managerAccountId.replace(/-/g, "");
          }

          const geoId = getGeoTargetId(countryCode);
          const keywordUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}:generateKeywordIdeas`;
          const keywordBody = {
            language: "languageConstants/1000",
            geoTargetConstants: [`geoTargetConstants/${geoId}`],
            keywordSeed: { keywords: [query] },
            pageSize: 25,
          };

          const resp = await fetch(keywordUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(keywordBody),
          });

          if (resp.ok) {
            const data = await resp.json();
            (data.results || []).forEach((r: any) => {
              results.push({
                id: `google_kw_${r.text}`,
                name: r.text,
                platform: "google",
                avgMonthlySearches: Number(r.keywordIdeaMetrics?.avgMonthlySearches) || 0,
                competition: r.keywordIdeaMetrics?.competition || "UNSPECIFIED",
                cpcLow: Number(r.keywordIdeaMetrics?.lowTopOfPageBidMicros) / 1_000_000 || 0,
                cpcHigh: Number(r.keywordIdeaMetrics?.highTopOfPageBidMicros) / 1_000_000 || 0,
              });
            });
            console.log(`Google Ads returned ${results.length} keyword ideas`);
          } else {
            const errText = await resp.text();
            console.error("Google keyword ideas failed:", errText);
          }
        }
      }
    }

    // Search TikTok Keywords
    if (tiktokAdvertiserId) {
      const { data: platform } = await supabase
        .from("connected_platforms")
        .select("id, access_token")
        .eq("user_id", user.id)
        .eq("platform_type", "tiktok")
        .eq("is_active", true)
        .single();

      if (platform) {
        const accessToken = await getAccessToken(supabase, platform.id, platform.access_token);

        if (accessToken) {
          const apiVersion = "v1.3";
          const fetchUrl = `https://business-api.tiktok.com/open_api/${apiVersion}/tool/keyword_recommend/?advertiser_id=${tiktokAdvertiserId}&keywords=["${encodeURIComponent(query)}"]&language=en&limit=25`;

          const resp = await fetch(fetchUrl, {
            method: "GET",
            headers: {
              "Access-Token": accessToken,
              "Content-Type": "application/json",
            },
          });

          if (resp.ok) {
            const data = await resp.json();
            if (data.code === 0 && data.data?.recommended_keywords) {
              data.data.recommended_keywords.forEach((kw: any) => {
                results.push({
                  id: `tiktok_kw_${kw.keyword_id || kw.keyword}`,
                  name: kw.keyword,
                  platform: "tiktok",
                  avgMonthlySearches: kw.search_volume || 0,
                  competition: kw.competition_index ? String(kw.competition_index) : undefined,
                });
              });
              console.log(`TikTok returned ${data.data.recommended_keywords.length} keyword recommendations`);
            } else {
              console.error("TikTok keyword recommend error:", data);
            }
          } else {
            console.error("TikTok keyword recommend failed:", resp.status);
          }
        }
      }
    }

    console.log(`Total keyword results: ${results.length}`);

    return new Response(
      JSON.stringify({ results }),
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
  };
  return map[countryCode.toUpperCase()] || "2840";
}
