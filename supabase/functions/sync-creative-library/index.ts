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

    // Get platform connection and access token
    const { data: connections, error: connError } = await supabase
      .from("connected_platforms")
      .select("id, metadata")
      .eq("user_id", user.id)
      .eq("platform_type", platform)
      .eq("is_active", true);

    if (connError || !connections?.length) {
      throw new Error(`No active ${platform} connection found`);
    }

    // Find connection that has this advertiser
    const connection = platform === "tiktok"
      ? connections.find((c: any) =>
          Array.isArray(c.metadata?.advertiser_ids) &&
          c.metadata.advertiser_ids.map(String).includes(String(advertiserId))
        ) || connections[0]
      : connections[0];

    const accessToken = await getAccessToken(supabase, connection.id);
    if (!accessToken) {
      throw new Error(`Failed to retrieve ${platform} access token`);
    }

    // Handle platform-specific syncing
    if (platform === "meta") {
      return await syncMetaAssets(supabase, user.id, advertiserId, accessToken, assetTypes);
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
            // CRITICAL: Assets synced from TikTok Creative Library (uploaded via UI) are delivery-eligible
            creative_origin: "UI_SYNC",
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
            // CRITICAL: Assets synced from TikTok Creative Library (uploaded via UI) are delivery-eligible
            creative_origin: "UI_SYNC",
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

// ============================================
// META PLATFORM SUPPORT
// ============================================

interface MetaAdImage {
  id: string;
  hash: string;
  name?: string;
  permalink_url?: string;
  url?: string;
  url_128?: string;
  width?: number;
  height?: number;
  created_time?: string;
  status?: string;
}

interface MetaAdVideo {
  id: string;
  title?: string;
  source?: string;
  picture?: string;
  length?: number;
  created_time?: string;
  updated_time?: string;
  status?: string;
  thumbnails?: { uri: string }[];
}

/**
 * Sync Meta ad account assets (images and videos from the Ad Account's Media Library)
 */
async function syncMetaAssets(
  supabase: any,
  userId: string,
  adAccountId: string,
  accessToken: string,
  assetTypes: ("video" | "image")[]
): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const results = {
    videos: { synced: 0, total: 0 },
    images: { synced: 0, total: 0 },
  };

  // Ensure ad account ID has act_ prefix
  const formattedAccountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  // Sync images
  if (assetTypes.includes("image")) {
    console.log("🖼️ Fetching Meta ad images...");
    const images = await fetchMetaAdImages(accessToken, formattedAccountId);
    results.images.total = images.length;

    for (const image of images) {
      try {
        const assetData = {
          user_id: userId,
          platform: "meta",
          advertiser_id: adAccountId.replace("act_", ""),
          asset_type: "image",
          platform_asset_id: image.hash, // Meta uses hash as the unique identifier for images
          asset_name: image.name || `Image ${image.hash}`,
          thumbnail_url: image.url_128 || image.url,
          preview_url: image.url || image.permalink_url,
          width: image.width,
          height: image.height,
          aspect_ratio: calculateAspectRatio(image.width || 0, image.height || 0),
          approval_status: image.status?.toUpperCase() === "ACTIVE" ? "approved" : "pending",
          spark_eligible: false,
          platform_metadata: image,
          synced_at: new Date().toISOString(),
          creative_origin: "UI_SYNC",
        };

        const { error: upsertError } = await supabase
          .from("creative_library_assets")
          .upsert(assetData, {
            onConflict: "platform,advertiser_id,platform_asset_id",
          });

        if (!upsertError) {
          results.images.synced++;
        } else {
          console.error(`Failed to upsert Meta image ${image.hash}:`, upsertError);
        }
      } catch (err) {
        console.error(`Error processing Meta image ${image.hash}:`, err);
      }
    }
    console.log(`✅ Meta images synced: ${results.images.synced}/${results.images.total}`);
  }

  // Sync videos
  if (assetTypes.includes("video")) {
    console.log("📹 Fetching Meta ad videos...");
    const videos = await fetchMetaAdVideos(accessToken, formattedAccountId);
    results.videos.total = videos.length;

    for (const video of videos) {
      try {
        const assetData = {
          user_id: userId,
          platform: "meta",
          advertiser_id: adAccountId.replace("act_", ""),
          asset_type: "video",
          platform_asset_id: video.id,
          asset_name: video.title || `Video ${video.id}`,
          thumbnail_url: video.picture || video.thumbnails?.[0]?.uri,
          preview_url: video.source,
          duration_seconds: video.length,
          approval_status: video.status?.toUpperCase() === "READY" ? "approved" : "pending",
          spark_eligible: false,
          platform_metadata: video,
          synced_at: new Date().toISOString(),
          creative_origin: "UI_SYNC",
        };

        const { error: upsertError } = await supabase
          .from("creative_library_assets")
          .upsert(assetData, {
            onConflict: "platform,advertiser_id,platform_asset_id",
          });

        if (!upsertError) {
          results.videos.synced++;
        } else {
          console.error(`Failed to upsert Meta video ${video.id}:`, upsertError);
        }
      } catch (err) {
        console.error(`Error processing Meta video ${video.id}:`, err);
      }
    }
    console.log(`✅ Meta videos synced: ${results.videos.synced}/${results.videos.total}`);
  }

  return new Response(
    JSON.stringify({
      success: true,
      platform: "meta",
      advertiserId: adAccountId,
      results,
      syncedCount: results.images.synced + results.videos.synced,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    }
  );
}

/**
 * Fetch all ad images from Meta Ad Account
 */
async function fetchMetaAdImages(accessToken: string, adAccountId: string): Promise<MetaAdImage[]> {
  const allImages: MetaAdImage[] = [];
  let url = `https://graph.facebook.com/v22.0/${adAccountId}/adimages?fields=id,hash,name,permalink_url,url,url_128,width,height,created_time,status&limit=100&access_token=${accessToken}`;

  while (url) {
    try {
      const response = await fetch(url, { method: "GET" });
      const data = await response.json();

      if (data.error) {
        console.error("Meta ad images fetch error:", data.error);
        break;
      }

      const images = data.data || [];
      allImages.push(...images);

      // Handle pagination
      url = data.paging?.next || "";

      // Safety limit
      if (allImages.length > 5000) break;
    } catch (err) {
      console.error("Error fetching Meta ad images:", err);
      break;
    }
  }

  return allImages;
}

/**
 * Fetch all ad videos from Meta Ad Account
 */
async function fetchMetaAdVideos(accessToken: string, adAccountId: string): Promise<MetaAdVideo[]> {
  const allVideos: MetaAdVideo[] = [];
  let url = `https://graph.facebook.com/v22.0/${adAccountId}/advideos?fields=id,title,source,picture,length,created_time,updated_time,status,thumbnails&limit=100&access_token=${accessToken}`;

  while (url) {
    try {
      const response = await fetch(url, { method: "GET" });
      const data = await response.json();

      if (data.error) {
        console.error("Meta ad videos fetch error:", data.error);
        break;
      }

      const videos = data.data || [];
      allVideos.push(...videos);

      // Handle pagination
      url = data.paging?.next || "";

      // Safety limit
      if (allVideos.length > 5000) break;
    } catch (err) {
      console.error("Error fetching Meta ad videos:", err);
      break;
    }
  }

  return allVideos;
}
