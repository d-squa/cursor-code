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
  adAccountId: z.string(), // Meta ad account ID (e.g., "act_123456")
  fileName: z.string(),
  fileData: z.string().optional(), // Base64 encoded file data (for images)
  fileUrl: z.string().optional(), // Public URL for video files (to avoid memory issues)
  fileType: z.enum(["image", "video"]),
  mimeType: z.string().optional(),
});

serve(async (req: Request) => {
  console.log("📤 upload-creative-to-meta: Request received");
  
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
    console.log(`📁 Uploading ${input.fileType}: ${input.fileName} to ${input.adAccountId}`);

    // Find connected platform for this user with Meta type
    const { data: connectedPlatform, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .maybeSingle();

    if (platformError || !connectedPlatform) {
      console.error("Connected platform lookup failed:", platformError);
      throw new Error("No active Meta connection found");
    }
    console.log("🔗 Connected platform found:", connectedPlatform.id);

    // Get access token from vault
    const accessToken = await getAccessToken(supabase, connectedPlatform.id);
    if (!accessToken) {
      throw new Error("Failed to retrieve Meta access token");
    }
    console.log("🔑 Access token retrieved");

    // Format ad account ID for API
    const formattedAdAccountId = input.adAccountId.startsWith("act_") 
      ? input.adAccountId 
      : `act_${input.adAccountId}`;

    let result: { id?: string; hash?: string };

    if (input.fileType === "image") {
      // Upload image to Meta
      if (!input.fileData) {
        throw new Error("Image uploads require fileData parameter");
      }
      // POST to graph.facebook.com/v21.0/act_<AD_ACCOUNT_ID>/adimages
      const formData = new FormData();
      formData.append("bytes", input.fileData); // Base64 encoded image
      formData.append("access_token", accessToken);

      const uploadUrl = `https://graph.facebook.com/v21.0/${formattedAdAccountId}/adimages`;
      console.log(`📡 Uploading image to: ${uploadUrl}`);

      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      const responseData = await response.json();
      console.log("📥 Meta response:", JSON.stringify(responseData));

      if (responseData.error) {
        throw new Error(`Meta API error: ${responseData.error.message}`);
      }

      // Response format: { images: { "<filename>": { hash: "...", ... } } }
      const images = responseData.images;
      if (!images) {
        throw new Error("No images returned from Meta API");
      }

      const imageKey = Object.keys(images)[0];
      const imageHash = images[imageKey]?.hash;
      
      if (!imageHash) {
        throw new Error("No image hash returned from Meta API");
      }

      result = { hash: imageHash };
      console.log(`✅ Image uploaded successfully. Hash: ${imageHash}`);

    } else {
      // Upload video to Meta using file_url to avoid memory issues
      // Meta will fetch the video directly from the URL
      if (!input.fileUrl) {
        throw new Error("Video uploads require fileUrl parameter");
      }

      const videoUrl = `https://graph.facebook.com/v21.0/${formattedAdAccountId}/advideos`;
      console.log(`📹 Starting video upload via file_url: ${input.fileUrl}`);

      // Use file_url parameter - Meta fetches the video directly
      const formData = new FormData();
      formData.append("file_url", input.fileUrl);
      formData.append("access_token", accessToken);
      formData.append("title", input.fileName);

      const response = await fetch(videoUrl, {
        method: "POST",
        body: formData,
      });

      const responseData = await response.json();
      console.log("📥 Meta video response:", JSON.stringify(responseData));

      if (responseData.error) {
        throw new Error(`Meta API error: ${responseData.error.message}`);
      }

      if (!responseData.id) {
        throw new Error("No video ID returned from Meta API");
      }

      result = { id: responseData.id };
      console.log(`✅ Video uploaded successfully. ID: ${responseData.id}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileType: input.fileType,
        ...(result.hash ? { imageHash: result.hash } : {}),
        ...(result.id ? { videoId: result.id } : {}),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("❌ Error in upload-creative-to-meta:", error);
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
