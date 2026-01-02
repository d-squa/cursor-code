import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      throw new Error("Unauthorized");
    }
    console.log(`👤 User authenticated: ${user.id}`);

    // Parse and validate input
    const body = await req.json();
    const input = uploadInputSchema.parse(body);
    console.log(`📁 Uploading ${input.fileType}: ${input.fileName} to advertiser ${input.advertiserId}`);

    // Find connected platform for this user with TikTok type
    const { data: connectedPlatform, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform_type", "tiktok")
      .eq("is_active", true)
      .maybeSingle();

    if (platformError || !connectedPlatform) {
      console.error("Connected platform lookup failed:", platformError);
      throw new Error("No active TikTok connection found");
    }

    // Get access token from vault
    const accessToken = await getAccessToken(supabase, connectedPlatform.id);
    if (!accessToken) {
      throw new Error("Failed to retrieve TikTok access token");
    }
    console.log("🔑 Access token retrieved");

    // Decode base64 to binary
    const binaryData = Uint8Array.from(atob(input.fileData), c => c.charCodeAt(0));
    const fileSize = binaryData.length;
    console.log(`📁 File size: ${fileSize} bytes`);

    let result: { id?: string; imageId?: string };

    if (input.fileType === "video") {
      // Upload video to TikTok
      // POST to business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/
      const uploadUrl = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/";
      
      const formData = new FormData();
      const blob = new Blob([binaryData], { type: input.mimeType || "video/mp4" });
      formData.append("advertiser_id", input.advertiserId);
      formData.append("upload_type", "UPLOAD_BY_FILE");
      formData.append("video_file", blob, input.fileName);

      console.log(`📡 Uploading video to: ${uploadUrl}`);

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Access-Token": accessToken,
        },
        body: formData,
      });

      const responseData = await response.json();
      console.log("📥 TikTok response:", JSON.stringify(responseData));

      if (responseData.code !== 0) {
        throw new Error(`TikTok API error: ${responseData.message || "Unknown error"}`);
      }

      const videoId = responseData.data?.video_id;
      if (!videoId) {
        throw new Error("No video ID returned from TikTok API");
      }

      result = { id: videoId };
      console.log(`✅ Video uploaded successfully. ID: ${videoId}`);

    } else {
      // Upload image to TikTok
      // POST to business-api.tiktok.com/open_api/v1.3/file/image/ad/upload/
      const uploadUrl = "https://business-api.tiktok.com/open_api/v1.3/file/image/ad/upload/";
      
      const formData = new FormData();
      const blob = new Blob([binaryData], { type: input.mimeType || "image/jpeg" });
      formData.append("advertiser_id", input.advertiserId);
      formData.append("upload_type", "UPLOAD_BY_FILE");
      formData.append("image_file", blob, input.fileName);

      console.log(`📡 Uploading image to: ${uploadUrl}`);

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Access-Token": accessToken,
        },
        body: formData,
      });

      const responseData = await response.json();
      console.log("📥 TikTok response:", JSON.stringify(responseData));

      if (responseData.code !== 0) {
        throw new Error(`TikTok API error: ${responseData.message || "Unknown error"}`);
      }

      const imageId = responseData.data?.id;
      if (!imageId) {
        throw new Error("No image ID returned from TikTok API");
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
      }
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
      }
    );
  }
});
