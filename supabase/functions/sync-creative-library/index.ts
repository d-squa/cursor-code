import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

/**
 * SYNC-CREATIVE-LIBRARY
 * 
 * Layer 1: Creative Asset Management
 * 
 * Fetches and caches Creative Library assets (videos & images) from TikTok.
 * Assets are stored independently of campaigns - they are platform resources.
 * 
 * This function NEVER uploads assets - it only syncs what already exists
 * in the platform's Creative Library.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncRequest {
  advertiserId: string;
  platform: "tiktok" | "meta" | "google";
  assetTypes?: ("video" | "image")[];
}

interface TikTokVideo {
  video_id: string;
  file_name?: string;
  display_name?: string;
  duration: number;
  width: number;
  height: number;
  format: string;
  bit_rate: number;
  size: number;
  preview_url?: string;
  preview_url_expire_time?: string;
  poster_url?: string;
  material_id?: string;
  create_time?: string;
  modify_time?: string;
  signature?: string;
  allowed_placements?: string[];
  video_cover_url?: string;
}

interface TikTokImage {
  image_id: string;
  material_id?: string;
  file_name?: string;
  create_time?: string;
  modify_time?: string;
  size: number;
  width: number;
  height: number;
  format: string;
  signature?: string;
  image_url?: string;
}

serve(async (req: Request) => {
  console.log("🔄 sync-creative-library: Request received");

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
    const body: SyncRequest = await req.json();
    const { advertiserId, platform, assetTypes = ["video", "image"] } = body;

    if (!advertiserId || !platform) {
      throw new Error("Missing required fields: advertiserId, platform");
    }

    console.log(`📦 Syncing ${platform} creative library for advertiser ${advertiserId}`);

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

    const results = {
      videos: { synced: 0, total: 0 },
      images: { synced: 0, total: 0 },
    };

    // Sync videos
    if (assetTypes.includes("video")) {
      console.log("📹 Fetching TikTok videos...");
      const videos = await fetchTikTokVideos(accessToken, advertiserId);
      results.videos.total = videos.length;
      
      for (const video of videos) {
        try {
          const assetData = {
            user_id: user.id,
            platform: "tiktok",
            advertiser_id: advertiserId,
            asset_type: "video",
            platform_asset_id: video.video_id,
            asset_name: video.display_name || video.file_name || `Video ${video.video_id}`,
            thumbnail_url: video.poster_url || video.video_cover_url,
            preview_url: video.preview_url,
            duration_seconds: video.duration,
            width: video.width,
            height: video.height,
            aspect_ratio: calculateAspectRatio(video.width, video.height),
            file_size_bytes: video.size,
            approval_status: "approved", // TikTok videos in library are approved
            spark_eligible: false, // Will be updated separately
            platform_metadata: video,
            synced_at: new Date().toISOString(),
          };

          const { error: upsertError } = await supabase
            .from("creative_library_assets")
            .upsert(assetData, {
              onConflict: "platform,advertiser_id,platform_asset_id",
            });

          if (!upsertError) {
            results.videos.synced++;
          } else {
            console.error(`Failed to upsert video ${video.video_id}:`, upsertError);
          }
        } catch (err) {
          console.error(`Error processing video ${video.video_id}:`, err);
        }
      }
      console.log(`✅ Videos synced: ${results.videos.synced}/${results.videos.total}`);
    }

    // Sync images
    if (assetTypes.includes("image")) {
      console.log("🖼️ Fetching TikTok images...");
      const images = await fetchTikTokImages(accessToken, advertiserId);
      results.images.total = images.length;

      for (const image of images) {
        try {
          const assetData = {
            user_id: user.id,
            platform: "tiktok",
            advertiser_id: advertiserId,
            asset_type: "image",
            platform_asset_id: image.image_id,
            asset_name: image.file_name || `Image ${image.image_id}`,
            thumbnail_url: image.image_url,
            preview_url: image.image_url,
            width: image.width,
            height: image.height,
            aspect_ratio: calculateAspectRatio(image.width, image.height),
            file_size_bytes: image.size,
            approval_status: "approved",
            spark_eligible: false,
            platform_metadata: image,
            synced_at: new Date().toISOString(),
          };

          const { error: upsertError } = await supabase
            .from("creative_library_assets")
            .upsert(assetData, {
              onConflict: "platform,advertiser_id,platform_asset_id",
            });

          if (!upsertError) {
            results.images.synced++;
          } else {
            console.error(`Failed to upsert image ${image.image_id}:`, upsertError);
          }
        } catch (err) {
          console.error(`Error processing image ${image.image_id}:`, err);
        }
      }
      console.log(`✅ Images synced: ${results.images.synced}/${results.images.total}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        platform,
        advertiserId,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("❌ Error in sync-creative-library:", error);
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
 * Fetch all videos from TikTok Creative Library
 */
async function fetchTikTokVideos(accessToken: string, advertiserId: string): Promise<TikTokVideo[]> {
  const allVideos: TikTokVideo[] = [];
  let page = 1;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const url = `https://business-api.tiktok.com/open_api/v1.3/file/video/ad/search/?advertiser_id=${advertiserId}&page=${page}&page_size=${pageSize}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    
    if (data.code !== 0) {
      console.error("TikTok video search error:", data);
      break;
    }

    const videos = data.data?.list || [];
    allVideos.push(...videos);

    const pageInfo = data.data?.page_info;
    hasMore = pageInfo && page * pageSize < pageInfo.total_number;
    page++;

    // Safety limit
    if (page > 50) break;
  }

  return allVideos;
}

/**
 * Fetch all images from TikTok Creative Library
 */
async function fetchTikTokImages(accessToken: string, advertiserId: string): Promise<TikTokImage[]> {
  const allImages: TikTokImage[] = [];
  let page = 1;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const url = `https://business-api.tiktok.com/open_api/v1.3/file/image/ad/search/?advertiser_id=${advertiserId}&page=${page}&page_size=${pageSize}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    
    if (data.code !== 0) {
      console.error("TikTok image search error:", data);
      break;
    }

    const images = data.data?.list || [];
    allImages.push(...images);

    const pageInfo = data.data?.page_info;
    hasMore = pageInfo && page * pageSize < pageInfo.total_number;
    page++;

    // Safety limit
    if (page > 50) break;
  }

  return allImages;
}

/**
 * Calculate aspect ratio string from dimensions
 */
function calculateAspectRatio(width: number, height: number): string {
  if (!width || !height) return "unknown";
  
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  const w = width / divisor;
  const h = height / divisor;
  
  // Normalize common ratios
  const ratio = width / height;
  if (Math.abs(ratio - 16/9) < 0.01) return "16:9";
  if (Math.abs(ratio - 9/16) < 0.01) return "9:16";
  if (Math.abs(ratio - 1) < 0.01) return "1:1";
  if (Math.abs(ratio - 4/5) < 0.01) return "4:5";
  if (Math.abs(ratio - 4/3) < 0.01) return "4:3";
  
  return `${w}:${h}`;
}
