import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessTokenWithRefreshWithRefresh } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_ADS_API_VERSION = "v23";

interface MerchantCenterLink {
  id: string;
  merchantCenterId: string;
  merchantCenterName: string;
  status: string;
}

interface FeedLabel {
  label: string;
  country: string;
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

    const { customerId } = await req.json();
    if (!customerId) {
      throw new Error("customerId is required");
    }

    const { data: platform } = await supabase
      .from("connected_platforms")
      .select("id, access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "google")
      .eq("is_active", true)
      .single();

    if (!platform) {
      return new Response(JSON.stringify({ merchantCenters: [], feedLabels: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getWithRefresh(supabase, platform.id, platform.access_token, 'google'ccess_token);
    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const managerAccountId = Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID");

    if (!accessToken || !developerToken) {
      return new Response(JSON.stringify({ merchantCenters: [], feedLabels: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanCustomerId = customerId.replace(/-/g, "");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    if (managerAccountId) {
      headers["login-customer-id"] = managerAccountId.replace(/-/g, "");
    }

    const merchantCenters: MerchantCenterLink[] = [];
    const feedLabels: FeedLabel[] = [];

    // 1. Fetch Merchant Center links via GAQL
    const mcQuery = `
      SELECT 
        merchant_center_link.id,
        merchant_center_link.merchant_center_account_name,
        merchant_center_link.status
      FROM merchant_center_link
      WHERE merchant_center_link.status = 'ENABLED'
    `;

    const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;
    const mcResp = await fetch(searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: mcQuery }),
    });

    if (mcResp.ok) {
      const mcData = await mcResp.json();
      for (const batch of mcData) {
        for (const row of (batch.results || [])) {
          const link = row.merchantCenterLink;
          if (link) {
            merchantCenters.push({
              id: String(link.id),
              merchantCenterId: String(link.id),
              merchantCenterName: link.merchantCenterAccountName || `Merchant Center ${link.id}`,
              status: link.status || "ENABLED",
            });
          }
        }
      }
      console.log(`Found ${merchantCenters.length} Merchant Center links`);
    } else {
      const errText = await mcResp.text();
      console.error("Failed to fetch Merchant Center links:", errText);
    }

    // 2. For each Merchant Center, fetch feed labels via Shopping Performance View
    // Feed labels come from the campaign's shopping settings or from product data
    if (merchantCenters.length > 0) {
      const feedQuery = `
        SELECT 
          campaign.shopping_setting.merchant_id,
          campaign.shopping_setting.feed_label,
          campaign.name
        FROM campaign
        WHERE campaign.shopping_setting.merchant_id IS NOT NULL
          AND campaign.status != 'REMOVED'
      `;

      const feedResp = await fetch(searchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: feedQuery }),
      });

      if (feedResp.ok) {
        const feedData = await feedResp.json();
        const seenLabels = new Set<string>();
        for (const batch of feedData) {
          for (const row of (batch.results || [])) {
            const label = row.campaign?.shoppingSetting?.feedLabel;
            if (label && !seenLabels.has(label)) {
              seenLabels.add(label);
              feedLabels.push({ label, country: label });
            }
          }
        }
      } else {
        console.error("Failed to fetch feed labels:", await feedResp.text());
      }

      // Add common defaults if none found
      if (feedLabels.length === 0) {
        // Provide common country-based feed labels
        const commonLabels = ["US", "GB", "DE", "FR", "AE", "SA", "AU", "CA", "IN", "BR"];
        for (const l of commonLabels) {
          feedLabels.push({ label: l, country: l });
        }
      }
    }

    console.log(`Returning ${merchantCenters.length} merchant centers, ${feedLabels.length} feed labels`);

    return new Response(
      JSON.stringify({ merchantCenters, feedLabels }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("fetch-google-merchant-centers error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
