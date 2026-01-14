import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

/**
 * RESOLVE-PLATFORM-IDENTITIES
 * 
 * Layer 2: Identity Resolution
 * 
 * Fetches and caches brand/creator identities from TikTok.
 * 
 * Key concepts:
 * - BC_AUTH_TT: TikTok account authorized via Business Center (brand-owned)
 * - TT_ACCOUNT: Direct TikTok account (brand-owned)
 * - CUSTOMIZED_USER: Custom identity created for ads
 * - AUTH_CODE: Creator authorization (requires creator flow)
 * 
 * Priority:
 * 1. Brand-owned identities (BC_AUTH_TT, TT_ACCOUNT) - NO creator auth needed
 * 2. Creator identities (AUTH_CODE) - fallback only
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResolveRequest {
  advertiserId: string;
  platform: "tiktok" | "meta" | "google";
}

interface TikTokIdentity {
  identity_id: string;
  identity_type: string;
  display_name?: string;
  profile_image?: string;
  can_use_spark_ad?: boolean;
  identity_authorized_bc_id?: string;
}

serve(async (req: Request) => {
  console.log("🔍 resolve-platform-identities: Request received");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      throw new Error("Unauthorized");
    }
    console.log(`👤 User authenticated: ${user.id}`);

    // Parse request
    const body: ResolveRequest = await req.json();
    const { advertiserId, platform } = body;

    if (!advertiserId || !platform) {
      throw new Error("Missing required fields: advertiserId, platform");
    }

    console.log(`🔎 Resolving ${platform} identities for advertiser ${advertiserId}`);

    if (platform !== "tiktok") {
      throw new Error(`Platform ${platform} not yet implemented`);
    }

    // Get TikTok connection and access token
    const { data: connections, error: connError } = await supabase
      .from("connected_platforms")
      .select("id, metadata")
      .eq("user_id", user.id)
      .eq("platform_type", "tiktok")
      .eq("is_active", true);

    if (connError || !connections?.length) {
      throw new Error("No active TikTok connection found");
    }

    // Find connection that has this advertiser
    const connection = connections.find((c: any) =>
      Array.isArray(c.metadata?.advertiser_ids) &&
      c.metadata.advertiser_ids.map(String).includes(String(advertiserId))
    ) || connections[0];

    const accessToken = await getAccessToken(supabase, connection.id);
    if (!accessToken) {
      throw new Error("Failed to retrieve TikTok access token");
    }

    const bcId = connection.metadata?.bc_id;
    console.log(`📋 Business Center ID: ${bcId || "none"}`);

    const results = {
      identities: [] as any[],
      synced: 0,
      brandOwned: 0,
      requiresAuth: 0,
    };

    // Fetch identities from TikTok
    const identities = await fetchTikTokIdentities(accessToken, advertiserId, bcId);
    console.log(`📦 Found ${identities.length} identities`);

    for (const identity of identities) {
      try {
        // Determine if brand-owned or requires creator auth
        const isBrandOwned = ["BC_AUTH_TT", "TT_ACCOUNT", "CUSTOMIZED_USER"].includes(identity.identity_type);
        const requiresAuth = identity.identity_type === "AUTH_CODE";

        const identityData = {
          user_id: user.id,
          platform: "tiktok",
          advertiser_id: advertiserId,
          identity_id: identity.identity_id,
          identity_type: identity.identity_type,
          display_name: identity.display_name || `Identity ${identity.identity_id}`,
          profile_image_url: identity.profile_image,
          is_brand_owned: isBrandOwned,
          is_active: true,
          requires_authorization: requiresAuth,
          platform_metadata: identity,
          synced_at: new Date().toISOString(),
        };

        const { error: upsertError } = await supabase
          .from("platform_identities")
          .upsert(identityData, {
            onConflict: "platform,advertiser_id,identity_id",
          });

        if (!upsertError) {
          results.synced++;
          if (isBrandOwned) results.brandOwned++;
          if (requiresAuth) results.requiresAuth++;
          results.identities.push({
            identity_id: identity.identity_id,
            identity_type: identity.identity_type,
            display_name: identity.display_name,
            is_brand_owned: isBrandOwned,
          });
        } else {
          console.error(`Failed to upsert identity ${identity.identity_id}:`, upsertError);
        }
      } catch (err) {
        console.error(`Error processing identity ${identity.identity_id}:`, err);
      }
    }

    console.log(`✅ Identities synced: ${results.synced} (${results.brandOwned} brand-owned, ${results.requiresAuth} require auth)`);

    return new Response(
      JSON.stringify({
        success: true,
        platform,
        advertiserId,
        results,
        recommendation: results.brandOwned > 0 
          ? "Brand-owned identities available. Recommended for Non-Spark Ads."
          : results.requiresAuth > 0
            ? "Only creator identities available. Creator authorization required for Spark Ads."
            : "No identities found. Please connect a TikTok account via Business Center.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("❌ Error in resolve-platform-identities:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

/**
 * Fetch identities from TikTok
 * 
 * Strategy:
 * 1. First try identity/list for the advertiser
 * 2. If BC available, also fetch BC-authorized identities
 */
async function fetchTikTokIdentities(
  accessToken: string, 
  advertiserId: string, 
  bcId?: string
): Promise<TikTokIdentity[]> {
  const allIdentities: TikTokIdentity[] = [];
  const seenIds = new Set<string>();

  // Method 1: Fetch from identity/list endpoint
  try {
    const url = `https://business-api.tiktok.com/open_api/v1.3/identity/list/?advertiser_id=${advertiserId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    console.log("📡 identity/list response code:", data.code);

    if (data.code === 0 && data.data?.identities) {
      for (const identity of data.data.identities) {
        if (!seenIds.has(identity.identity_id)) {
          seenIds.add(identity.identity_id);
          allIdentities.push(identity);
        }
      }
    }
  } catch (err) {
    console.error("Error fetching from identity/list:", err);
  }

  // Method 2: If BC available, fetch TT_ACCOUNT assets from BC
  if (bcId) {
    try {
      const url = `https://business-api.tiktok.com/open_api/v1.3/bc/asset/get/`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      // Parse as bc/asset/get request
      const bcAssetUrl = `https://business-api.tiktok.com/open_api/v1.3/bc/asset/get/?bc_id=${bcId}&asset_type=TT_ACCOUNT`;
      const bcResponse = await fetch(bcAssetUrl, {
        method: "GET",
        headers: {
          "Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      const bcData = await bcResponse.json();
      console.log("📡 bc/asset/get TT_ACCOUNT response code:", bcData.code);

      if (bcData.code === 0 && bcData.data?.list) {
        for (const asset of bcData.data.list) {
          const identityId = asset.asset_id || asset.tt_account_id;
          if (identityId && !seenIds.has(identityId)) {
            seenIds.add(identityId);
            allIdentities.push({
              identity_id: identityId,
              identity_type: "BC_AUTH_TT",
              display_name: asset.display_name || asset.name,
              profile_image: asset.profile_image,
              can_use_spark_ad: true,
            });
          }
        }
      }
    } catch (err) {
      console.error("Error fetching BC TT_ACCOUNT assets:", err);
    }
  }

  // Method 3: Fetch from identity/get for specific types if we have few results
  if (allIdentities.length < 3 && bcId) {
    for (const identityType of ["BC_AUTH_TT", "TT_ACCOUNT"]) {
      try {
        const url = `https://business-api.tiktok.com/open_api/v1.3/identity/get/?advertiser_id=${advertiserId}&identity_type=${identityType}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();
        if (data.code === 0 && data.data?.identity_id && !seenIds.has(data.data.identity_id)) {
          seenIds.add(data.data.identity_id);
          allIdentities.push({
            identity_id: data.data.identity_id,
            identity_type: identityType,
            display_name: data.data.display_name,
            profile_image: data.data.profile_image,
          });
        }
      } catch (err) {
        console.error(`Error fetching identity type ${identityType}:`, err);
      }
    }
  }

  return allIdentities;
}
