import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

/**
 * SEARCH-GOOGLE-ADS-TARGETING
 * 
 * Searches Google Ads targeting options:
 * - Keywords (via KeywordPlanIdeaService)
 * - Audience Manager data segments (website visitors, customer segments, YouTube users, app users, custom combination, callers)
 * - Demographics (age, gender, parental status, household income)
 * - Geo targets (locations)
 * - Topics
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_ADS_API_VERSION = "v23";

type TargetingType = "keywords" | "audiences" | "locations" | "topics" | "demographics";

interface SearchRequest {
  query: string;
  type: TargetingType;
  customerId: string;
  languageCode?: string;
  countryCode?: string;
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

    const body: SearchRequest = await req.json();
    const { query, type, customerId, languageCode = "en", countryCode = "US" } = body;

    if (!query || !type || !customerId) {
      throw new Error("query, type, and customerId are required");
    }

    console.log(`Searching Google Ads targeting: ${type} for "${query}"`);

    // Get platform connection
    const { data: platform } = await supabase
      .from("connected_platforms")
      .select("id, access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "google")
      .eq("is_active", true)
      .single();

    if (!platform) throw new Error("Google Ads platform not connected");

    const accessToken = await getAccessToken(supabase, platform.id, platform.access_token);
    if (!accessToken) throw new Error("Google Ads access token not found");

    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN not set");

    const managerAccountId = Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID");
    const cleanCustomerId = customerId.replace(/-/g, "");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    if (managerAccountId) {
      headers["login-customer-id"] = managerAccountId.replace(/-/g, "");
    }

    let results: any[] = [];

    switch (type) {
      case "keywords": {
        // Use KeywordPlanIdeaService
        const keywordUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}:generateKeywordIdeas`;
        const keywordBody = {
          language: `languageConstants/${languageCode === "en" ? "1000" : "1000"}`,
          geoTargetConstants: [`geoTargetConstants/${getGeoTargetId(countryCode)}`],
          keywordSeed: { keywords: [query] },
          pageSize: 20,
        };

        const resp = await fetch(keywordUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(keywordBody),
        });

        if (resp.ok) {
          const data = await resp.json();
          results = (data.results || []).map((r: any) => ({
            id: r.text,
            name: r.text,
            type: "keyword",
            avgMonthlySearches: r.keywordIdeaMetrics?.avgMonthlySearches || 0,
            competition: r.keywordIdeaMetrics?.competition || "UNSPECIFIED",
            lowTopOfPageBidMicros: r.keywordIdeaMetrics?.lowTopOfPageBidMicros || 0,
            highTopOfPageBidMicros: r.keywordIdeaMetrics?.highTopOfPageBidMicros || 0,
          }));
        } else {
          const errText = await resp.text();
          console.error("Keyword ideas failed:", errText);
        }
        break;
      }

      case "audiences": {
        const escapedQuery = query.replace(/'/g, "''");
        const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;

        const runGaqlSearch = async (gaql: string): Promise<any[]> => {
          const resp = await fetch(searchUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ query: gaql }),
          });

          if (!resp.ok) {
            const errText = await resp.text();
            console.error("Google data segment search failed:", errText);
            return [];
          }

          const data = await resp.json();
          const batches = Array.isArray(data) ? data : [];
          return batches.flatMap((batch: any) => batch?.results || []);
        };

        const [userListRows, combinedRows] = await Promise.all([
          runGaqlSearch(`
            SELECT
              user_list.id,
              user_list.name,
              user_list.type,
              user_list.membership_status
            FROM user_list
            WHERE user_list.membership_status = 'OPEN'
              AND user_list.name LIKE '%${escapedQuery}%'
            LIMIT 50
          `),
          runGaqlSearch(`
            SELECT
              combined_audience.id,
              combined_audience.name,
              combined_audience.status
            FROM combined_audience
            WHERE combined_audience.status = 'ENABLED'
              AND combined_audience.name LIKE '%${escapedQuery}%'
            LIMIT 50
          `),
        ]);

        const mappedUserLists = userListRows
          .map((r: any) => {
            const ul = r.userList || r.user_list || {};
            const id = String(ul.id ?? "");
            const name = ul.name ?? "";
            const segment = mapGoogleUserListToDataSegment(ul.type ?? "", name);

            if (!id || !name || !segment) return null;

            return {
              id,
              name,
              description: `Data segment: ${segment}`,
              type: "audience",
              status: "OPEN",
            };
          })
          .filter(Boolean);

        const mappedCombined = combinedRows
          .map((r: any) => {
            const ca = r.combinedAudience || r.combined_audience || {};
            const id = String(ca.id ?? "");
            const name = ca.name ?? "";
            if (!id || !name) return null;

            return {
              id,
              name,
              description: "Data segment: Custom combination",
              type: "audience",
              status: ca.status || "ENABLED",
            };
          })
          .filter(Boolean);

        results = [...mappedUserLists, ...mappedCombined];
        break;
      }

      case "locations": {
        // Use GeoTargetConstantService
        const geoUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/geoTargetConstants:suggest`;
        const resp = await fetch(geoUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            locale: languageCode,
            countryCode,
            locationNames: { names: [query] },
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          results = (data.geoTargetConstantSuggestions || []).map((s: any) => ({
            id: String(s.geoTargetConstant.id),
            name: s.geoTargetConstant.name,
            canonicalName: s.geoTargetConstant.canonicalName,
            type: "location",
            targetType: s.geoTargetConstant.targetType,
            countryCode: s.geoTargetConstant.countryCode,
            reach: s.reach,
          }));
        } else {
          const errText = await resp.text();
          console.error("Geo target search failed:", errText);
        }
        break;
      }

      case "topics": {
        // Search topic constants
        const gaql = `
          SELECT
            topic_constant.id,
            topic_constant.topic_constant_parent,
            topic_constant.path,
            topic_constant.resource_name
          FROM topic_constant
          WHERE topic_constant.path LIKE '%${query.replace(/'/g, "''")}%'
          LIMIT 30
        `;

        const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;
        const resp = await fetch(searchUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: gaql }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const rows = data?.[0]?.results || [];
          results = rows.map((r: any) => ({
            id: String(r.topicConstant.id),
            name: (r.topicConstant.path || []).join(" > "),
            type: "topic",
            resourceName: r.topicConstant.resourceName,
          }));
        } else {
          const errText = await resp.text();
          console.error("Topic search failed:", errText);
        }
        break;
      }

      case "demographics": {
        // Return static demographic targeting options
        results = getDemographicOptions(query);
        break;
      }
    }

    console.log(`Found ${results.length} targeting results for "${query}" (${type})`);

    return new Response(
      JSON.stringify({ results, type, query }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("search-google-ads-targeting error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Geo target ID mapping for common countries
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

// Static demographic options filtered by query
function getDemographicOptions(query: string): any[] {
  const allOptions = [
    // Age ranges
    { id: "AGE_RANGE_18_24", name: "18-24", type: "age_range", group: "Age" },
    { id: "AGE_RANGE_25_34", name: "25-34", type: "age_range", group: "Age" },
    { id: "AGE_RANGE_35_44", name: "35-44", type: "age_range", group: "Age" },
    { id: "AGE_RANGE_45_54", name: "45-54", type: "age_range", group: "Age" },
    { id: "AGE_RANGE_55_64", name: "55-64", type: "age_range", group: "Age" },
    { id: "AGE_RANGE_65_UP", name: "65+", type: "age_range", group: "Age" },
    // Gender
    { id: "GENDER_MALE", name: "Male", type: "gender", group: "Gender" },
    { id: "GENDER_FEMALE", name: "Female", type: "gender", group: "Gender" },
    // Household income (US only)
    { id: "INCOME_RANGE_TOP_10", name: "Top 10%", type: "income", group: "Household Income" },
    { id: "INCOME_RANGE_11_20", name: "11-20%", type: "income", group: "Household Income" },
    { id: "INCOME_RANGE_21_30", name: "21-30%", type: "income", group: "Household Income" },
    { id: "INCOME_RANGE_31_40", name: "31-40%", type: "income", group: "Household Income" },
    { id: "INCOME_RANGE_41_50", name: "41-50%", type: "income", group: "Household Income" },
    { id: "INCOME_RANGE_LOWER_50", name: "Lower 50%", type: "income", group: "Household Income" },
    // Parental status
    { id: "PARENT", name: "Parent", type: "parental", group: "Parental Status" },
    { id: "NOT_A_PARENT", name: "Not a parent", type: "parental", group: "Parental Status" },
  ];

  const q = query.toLowerCase();
  return allOptions.filter(
    o => o.name.toLowerCase().includes(q) || o.group.toLowerCase().includes(q) || o.type.includes(q)
  );
}
