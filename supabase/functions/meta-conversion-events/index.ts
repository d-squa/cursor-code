import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const {
      pixelId,
      platformId: requestedPlatformId,
      adAccountId: requestedAdAccountId,
    } = await req.json();

    if (!pixelId) {
      throw new Error("Pixel ID is required");
    }

    /** Meta Marketing API uses act_<numeric_id>; UI often stores digits only. */
    const normalizeActPath = (raw: string): string => {
      const t = raw.trim();
      return t.startsWith("act_") ? t : `act_${t}`;
    };

    // Meta connections for this user (optionally filtered to the ad account's connected_platforms row)
    let platformsQuery = supabase
      .from("connected_platforms")
      .select("id, access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true);

    if (requestedPlatformId && typeof requestedPlatformId === "string") {
      platformsQuery = platformsQuery.eq("id", requestedPlatformId.trim());
    }

    const { data: platforms, error: platformsError } = await platformsQuery;

    if (platformsError) throw platformsError;

    if (!platforms || platforms.length === 0) {
      throw new Error(
        requestedPlatformId
          ? "Meta platform connection not found for this workspace — reconnect Meta in Platform Connections."
          : "Meta platform not connected",
      );
    }

    // Try each Meta connection until Vault / DB yields a token (fixes wrong default when multiple Meta logins exist).
    let accessToken: string | null = null;
    for (const platform of platforms) {
      const t = await getAccessToken(supabase, platform.id, platform.access_token);
      if (t) {
        accessToken = t;
        break;
      }
    }

    if (!accessToken) {
      return new Response(
        JSON.stringify({
          error: "Meta access token not found",
          hint:
            "No usable token in Vault or connected_platforms for this Meta connection. Reconnect Meta under Settings → Platform Connections, or ensure store_platform_token / get_platform_token migrations are applied. Pass platformId (connected_platforms.id from your meta_ad_accounts row) if you use multiple Meta connections.",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Validate pixel & read name only. `custom_events` is not a field on AdsPixel (Graph #100).
    console.log("Fetching conversion events for pixel:", pixelId);

    const pixelResponse = await fetch(
      `https://graph.facebook.com/v22.0/${encodeURIComponent(pixelId)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const pixelData = await pixelResponse.json();

    if (pixelData.error) {
      console.error("Meta API Error (pixel):", pixelData.error);
      throw new Error(pixelData.error.message);
    }

    // Optional: custom conversions on the ad account (named rules — complements standard events).
    let customConversionEvents: Array<{ id: string; name: string }> = [];
    if (requestedAdAccountId && typeof requestedAdAccountId === "string") {
      const actPath = normalizeActPath(requestedAdAccountId);
      const ccUrl =
        `https://graph.facebook.com/v22.0/${encodeURIComponent(actPath)}/customconversions?fields=id,name&limit=500&access_token=${encodeURIComponent(accessToken)}`;
      try {
        const ccRes = await fetch(ccUrl, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        const ccData = await ccRes.json();
        if (ccData.error) {
          console.warn("Meta customconversions (non-fatal):", ccData.error);
        } else if (Array.isArray(ccData.data)) {
          customConversionEvents = ccData.data.map((c: { id?: string; name?: string }) => ({
            id: c.name || String(c.id ?? ""),
            name: c.name || String(c.id ?? ""),
          })).filter((e: { id: string }) => e.id.length > 0);
        }
      } catch (e) {
        console.warn("Failed to fetch custom conversions:", e);
      }
    }

    // Standard Meta conversion events
    const standardEvents = [
      { id: "Purchase", name: "Purchase" },
      { id: "Lead", name: "Lead" },
      { id: "CompleteRegistration", name: "Complete Registration" },
      { id: "AddToCart", name: "Add to Cart" },
      { id: "InitiateCheckout", name: "Initiate Checkout" },
      { id: "AddPaymentInfo", name: "Add Payment Info" },
      { id: "ViewContent", name: "View Content" },
      { id: "Search", name: "Search" },
      { id: "Contact", name: "Contact" },
      { id: "Schedule", name: "Schedule" },
      { id: "SubmitApplication", name: "Submit Application" },
      { id: "Subscribe", name: "Subscribe" },
    ];

    const seen = new Set<string>();
    const deduped: Array<{ id: string; name: string }> = [];
    for (const ev of [...standardEvents, ...customConversionEvents]) {
      const key = ev.id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(ev);
    }

    const allEvents = deduped;

    console.log(`Found ${allEvents.length} conversion events`);

    return new Response(
      JSON.stringify({ events: allEvents }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error fetching conversion events:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
