import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

/**
 * SYNC-GOOGLE-ADS-ASSETS
 * 
 * Fetches and caches assets (images, videos, YouTube videos) from Google Ads
 * asset library. Supports PMax asset groups, Demand Gen, and standard campaigns.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_ADS_API_VERSION = "v18";

interface SyncRequest {
  customerId: string;
  assetTypes?: ("IMAGE" | "YOUTUBE_VIDEO" | "MEDIA_BUNDLE")[];
}

serve(async (req: Request) => {
  console.log("🔄 sync-google-ads-assets: Request received");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) throw new Error("Unauthorized");

    const body: SyncRequest = await req.json();
    const { customerId, assetTypes = ["IMAGE", "YOUTUBE_VIDEO"] } = body;

    if (!customerId) throw new Error("customerId is required");

    console.log(`Syncing Google Ads assets for customer ${customerId}`);

    // Get Google platform connection
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

    // Build GAQL query for assets
    const assetTypeFilter = assetTypes.map(t => `'${t}'`).join(", ");
    const query = `
      SELECT
        asset.id,
        asset.name,
        asset.type,
        asset.resource_name,
        asset.image_asset.file_size,
        asset.image_asset.full_size.width_pixels,
        asset.image_asset.full_size.height_pixels,
        asset.image_asset.full_size.url,
        asset.youtube_video_asset.youtube_video_id,
        asset.youtube_video_asset.youtube_video_title
      FROM asset
      WHERE asset.type IN (${assetTypeFilter})
      ORDER BY asset.id DESC
      LIMIT 500
    `;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    if (managerAccountId) {
      headers["login-customer-id"] = managerAccountId.replace(/-/g, "");
    }

    const searchUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:searchStream`;
    const response = await fetch(searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Ads asset fetch failed:", errorText);
      throw new Error(`Google Ads API error: ${response.status}`);
    }

    const responseData = await response.json();
    const results = responseData?.[0]?.results || [];
    console.log(`Fetched ${results.length} assets from Google Ads`);

    // Upsert into creative_library_assets
    let synced = 0;
    let errors = 0;

    // Get team_id for this user
    const { data: teamData } = await supabase
      .from("user_roles")
      .select("team_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    for (const row of results) {
      const asset = row.asset;
      try {
        const assetType = asset.type === "IMAGE" ? "image" : "video";
        const width = asset.imageAsset?.fullSize?.widthPixels || null;
        const height = asset.imageAsset?.fullSize?.heightPixels || null;
        const previewUrl = asset.imageAsset?.fullSize?.url || null;
        const fileSize = asset.imageAsset?.fileSize || null;
        const youtubeId = asset.youtubeVideoAsset?.youtubeVideoId || null;
        const youtubeThumbnail = youtubeId
          ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
          : null;

        const assetRecord = {
          platform: "google",
          platform_asset_id: String(asset.id),
          advertiser_id: cleanCustomerId,
          asset_type: assetType,
          asset_name: asset.name || youtubeId || `Asset ${asset.id}`,
          preview_url: previewUrl || youtubeThumbnail,
          thumbnail_url: previewUrl || youtubeThumbnail,
          width,
          height,
          file_size_bytes: fileSize,
          is_usable: true,
          user_id: user.id,
          team_id: teamData?.team_id || null,
          synced_at: new Date().toISOString(),
          platform_metadata: {
            resource_name: asset.resourceName,
            youtube_video_id: youtubeId,
            youtube_title: asset.youtubeVideoAsset?.youtubeVideoTitle,
          },
        };

        const { error: upsertError } = await supabase
          .from("creative_library_assets")
          .upsert(assetRecord, {
            onConflict: "platform,platform_asset_id,advertiser_id",
          });

        if (upsertError) {
          console.error(`Failed to upsert asset ${asset.id}:`, upsertError.message);
          errors++;
        } else {
          synced++;
        }
      } catch (e) {
        console.error(`Error processing asset:`, e);
        errors++;
      }
    }

    console.log(`✅ Sync complete: ${synced} synced, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        errors,
        total: results.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("sync-google-ads-assets error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
