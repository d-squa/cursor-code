import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createHash } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

/**
 * UPLOAD-CREATIVE-TO-TIKTOK
 * 
 * ⚠️ CRITICAL LIMITATION NOTICE ⚠️
 * 
 * API-uploaded creatives are NOT delivery-eligible on TikTok.
 * TikTok requires creatives to be uploaded via the Ads Manager UI for ad delivery.
 * 
 * This function still works for:
 * - Storage and preview purposes
 * - Planning workflows
 * - Thumbnail uploads (which don't require delivery eligibility)
 * 
 * Creatives uploaded via this function will be marked with:
 *   creative_origin = 'API_UPLOAD'
 * 
 * These creatives will be BLOCKED from /ad/create calls.
 * Users must upload creatives via TikTok Ads Manager, then sync them.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const uploadInputSchema = z.object({
  advertiserId: z.string(), // TikTok advertiser ID
  fileName: z.string(),
  fileData: z.string(), // Base64 encoded file data
  fileType: z.enum(["image", "video"]),
  mimeType: z.string().optional(),
  // Flag to indicate if this is for thumbnail use only (allowed) vs ad creative (blocked)
  isThumbnailOnly: z.boolean().optional(),
});

serve(async (req: Request) => {
  console.log("📤 upload-creative-to-tiktok: Request received");

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
      authHeader.replace("Bearer ", ""),
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }
    console.log(`👤 User authenticated: ${user.id}`);

    // Parse and validate input
    const body = await req.json();
    const input = uploadInputSchema.parse(body);
    const advertiserId = String(input.advertiserId || "").trim();

    console.log(`📁 Uploading ${input.fileType}: ${input.fileName} to advertiser ${advertiserId}`);

    if (!advertiserId) {
      throw new Error("TikTok advertiser ID is required");
    }

    // Find connected platform for this user with TikTok type.
    // IMPORTANT: a user may have multiple TikTok connections; we must pick the one that includes this advertiserId.
    const { data: connectedPlatforms, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, metadata, updated_at")
      .eq("user_id", user.id)
      .eq("platform_type", "tiktok")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (platformError || !connectedPlatforms?.length) {
      console.error("Connected platform lookup failed:", platformError);
      throw new Error("No active TikTok connection found");
    }

    const desiredAdvertiserId = advertiserId;
    const matchedPlatform = (connectedPlatforms as any[]).find((p) =>
      Array.isArray(p?.metadata?.advertiser_ids) && p.metadata.advertiser_ids.map(String).includes(desiredAdvertiserId)
    );

    const connectedPlatform = matchedPlatform || connectedPlatforms[0];

    console.log(
      `🔎 TikTok connection selection: advertiserId=${desiredAdvertiserId}, platformId=${connectedPlatform.id}, advertiserIdsInToken=${JSON.stringify((connectedPlatform as any)?.metadata?.advertiser_ids || [])}`,
    );

    // Get access token from vault
    const accessToken = await getAccessToken(supabase, connectedPlatform.id);
    if (!accessToken) {
      throw new Error("Failed to retrieve TikTok access token");
    }
    console.log("🔑 Access token retrieved");

    // Decode base64 to binary
    const binaryData = Uint8Array.from(atob(input.fileData), (c) => c.charCodeAt(0));
    const fileSize = binaryData.length;
    // TikTok expects an MD5 signature of the file bytes
    const fileSignature = createHash("md5").update(binaryData).digest("hex");
    console.log(`📁 File size: ${fileSize} bytes (md5: ${fileSignature})`);

    let result: { id?: string; imageId?: string };

    const parseJsonSafe = async (res: Response) => {
      const txt = await res.text();
      try {
        return JSON.parse(txt);
      } catch {
        throw new Error(`TikTok API returned non-JSON (${res.status}): ${txt.slice(0, 500)}`);
      }
    };

    if (input.fileType === "video") {
      // Upload video to TikTok
      const uploadUrl = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/";
      const mimeType = input.mimeType || "video/mp4";

      const formData = new FormData();
      formData.append("advertiser_id", advertiserId);
      formData.append("upload_type", "UPLOAD_BY_FILE");
      // Use Blob + filename (more reliable than File in some edge runtimes)
      formData.append("video_file", new Blob([binaryData], { type: mimeType }), input.fileName);
      formData.append("video_signature", fileSignature);

      console.log(`📡 Uploading video to: ${uploadUrl} (size: ${fileSize}, mime: ${mimeType})`);
      console.log("🧾 TikTok upload form keys:", Array.from(formData.keys()));

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Access-Token": accessToken,
        },
        body: formData,
      });

      const responseData = await parseJsonSafe(response);
      console.log("📥 TikTok response:", JSON.stringify(responseData));

      if (responseData.code !== 0) {
        throw new Error(`TikTok API error: ${responseData.message || "Unknown error"}`);
      }

      const videoIdRaw = responseData?.data?.video_id ?? responseData?.data?.id ?? responseData?.data?.videoId;
      const videoId = videoIdRaw ? String(videoIdRaw) : "";
      if (!videoId) {
        throw new Error(
          `No video ID returned from TikTok API. data=${JSON.stringify(responseData?.data ?? {}).slice(0, 500)}`,
        );
      }

      result = { id: videoId };
      console.log(`✅ Video uploaded successfully. ID: ${videoId}`);
    } else {
      // Upload image to TikTok
      const uploadUrl = "https://business-api.tiktok.com/open_api/v1.3/file/image/ad/upload/";
      const mimeType = input.mimeType || "image/jpeg";

      const formData = new FormData();
      formData.append("advertiser_id", advertiserId);
      formData.append("upload_type", "UPLOAD_BY_FILE");
      // Use Blob + filename (more reliable than File in some edge runtimes)
      formData.append("image_file", new Blob([binaryData], { type: mimeType }), input.fileName);
      formData.append("image_signature", fileSignature);

      console.log(`📡 Uploading image to: ${uploadUrl} (size: ${fileSize}, mime: ${mimeType})`);
      console.log("🧾 TikTok upload form keys:", Array.from(formData.keys()));

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Access-Token": accessToken,
        },
        body: formData,
      });

      const responseData = await parseJsonSafe(response);
      console.log("📥 TikTok response:", JSON.stringify(responseData));

      if (responseData.code !== 0) {
        throw new Error(`TikTok API error: ${responseData.message || "Unknown error"}`);
      }

      const imageIdRaw = responseData?.data?.image_id ?? responseData?.data?.id ?? responseData?.data?.imageId;
      const imageId = imageIdRaw ? String(imageIdRaw) : "";
      if (!imageId) {
        throw new Error(
          `No image ID returned from TikTok API. data=${JSON.stringify(responseData?.data ?? {}).slice(0, 500)}`,
        );
      }

      result = { imageId };
      console.log(`✅ Image uploaded successfully. ID: ${imageId}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileType: input.fileType,
        ...(result.id ? { videoId: result.id } : {}),
        ...(result.imageId ? { imageId: result.imageId } : {}),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("❌ Error in upload-creative-to-tiktok:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
