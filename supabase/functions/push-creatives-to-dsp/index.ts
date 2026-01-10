import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { crypto as stdCrypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { encode as encodeHex } from "https://deno.land/std@0.190.0/encoding/hex.ts";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const inputSchema = z.object({
  campaignId: z.string().uuid(),
});

// Batch size for processing creatives to avoid resource exhaustion
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500; // Delay between batches to prevent rate limiting

type PlatformKey = "meta" | "tiktok";

function toPlatformKey(platformLabel: string): PlatformKey | null {
  const p = platformLabel.toLowerCase();
  if (p.includes("meta") || p.includes("facebook")) return "meta";
  if (p.includes("tiktok")) return "tiktok";
  return null;
}

// Helper to chunk array into batches
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Helper to add delay between batches
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function findMarketAndPhaseConfig(
  campaign: any,
  platformKey: PlatformKey,
  marketName: string,
  phaseName: string | null,
): { market: any | null; phase: any | null } {
  const splits = campaign.market_splits || {};
  const campaignPlatforms: Array<{ id: string; name: string }> = campaign.platforms || [];

  for (const [platformId, marketsObj] of Object.entries(splits) as [string, any][]) {
    const platformName = campaignPlatforms.find((p) => p.id === platformId)?.name || "";
    const thisKey = toPlatformKey(platformName);
    if (thisKey !== platformKey) continue;

    for (const [marketCode, market] of Object.entries(marketsObj as Record<string, any>)) {
      const mName = market?.name || marketCode;
      if (mName !== marketName && marketCode !== marketName) continue;

      const phases: any[] = Array.isArray(market?.phases) ? market.phases : [];
      if (!phaseName) {
        // If phase_name is null, use the first phase when possible
        return { market, phase: phases[0] || null };
      }
      const phase = phases.find((ph) => (ph?.name || "") === phaseName) || null;
      return { market, phase };
    }
  }

  return { market: null, phase: null };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) throw new Error("Service configuration error");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { campaignId } = parsed.data;

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (campaignError) throw campaignError;

    // Access control: owner OR member of the campaign workspace
    let canAccess = campaign.user_id === user.id;
    if (!canAccess && campaign.team_id) {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("team_id", campaign.team_id)
        .eq("user_id", user.id)
        .limit(1);
      if (roleError) throw roleError;
      canAccess = (roleRows?.length || 0) > 0;
    }
    if (!canAccess) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Connected platforms are stored on the campaign owner
    const { data: platforms, error: platformsError } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", campaign.user_id);
    if (platformsError) throw platformsError;

    const { data: adsetStatuses, error: statusError } = await supabase
      .from("campaign_launch_status")
      .select("platform, market, phase_name, dsp_entity_id, status")
      .eq("campaign_id", campaignId)
      .eq("entity_type", "adset")
      .not("dsp_entity_id", "is", null);
    if (statusError) throw statusError;
    
    console.log(`[push-creatives] Found ${adsetStatuses?.length || 0} ad sets with DSP IDs`);

    let pushedCount = 0;
    let failedCount = 0;
    const results: any[] = [];

    for (const entry of adsetStatuses || []) {
      const platformKey = toPlatformKey(entry.platform);
      if (!platformKey) continue;

      const platformRow = (platforms || []).find((p: any) => String(p.platform_type).toLowerCase() === platformKey);
      if (!platformRow) {
        results.push({
          platform: entry.platform,
          market: entry.market,
          phase: entry.phase_name,
          success: false,
          error: "Platform not connected",
        });
        continue;
      }

      const accessToken = await getAccessToken(supabase, platformRow.id, platformRow.access_token);
      if (!accessToken) {
        results.push({
          platform: entry.platform,
          market: entry.market,
          phase: entry.phase_name,
          success: false,
          error: "Platform access token not found",
        });
        continue;
      }

      const platform = { ...platformRow, access_token: accessToken };
      const { market, phase } = findMarketAndPhaseConfig(campaign, platformKey, entry.market, entry.phase_name);

      // Query with case-insensitive platform matching using ilike
      const { data: assignments, error: assignmentError } = await supabase
        .from("creative_assignments")
        .select(
          `
          id,
          creative_id,
          position,
          status,
          primary_text,
          primary_text_2,
          primary_text_3,
          primary_text_4,
          primary_text_5,
          headline,
          headline_2,
          headline_3,
          headline_4,
          headline_5,
          description,
          description_2,
          description_3,
          description_4,
          description_5,
          call_to_action,
          destination_url,
          url_parameters,
          utm_mode,
          brand_name,
          display_name,
          advantage_plus_video_touchups,
          advantage_plus_text_improvements,
          advantage_plus_product_tags,
          advantage_plus_video_effects,
          advantage_plus_relevant_comments,
          advantage_plus_enhance_cta,
          advantage_plus_reveal_details,
          advantage_plus_show_spotlights,
          advantage_plus_optimize_text_per_person,
          advantage_plus_sitelinks,
          advantage_plus_products,
          sitelink_url,
          sitelink_source_url,
          sitelink_display_label,
          sitelink_thumbnail,
          creative:creatives(
            id, name, media_type, creative_type,
            platform_video_id, platform_image_hash, platform_thumbnail_id, thumbnail_url,
            primary_text, headline, description, call_to_action,
            destination_url, url_parameters,
            external_page_id, tiktok_identity_id, tiktok_display_name, tiktok_ad_format,
            dsp_upload_status, brand_name, app_link
          )
        `,
        )
        .eq("campaign_id", campaign.id)
        .ilike("platform", platformKey)
        .eq("market", entry.market)
        .eq("phase_name", entry.phase_name)
        .order("position");
      
      console.log(`[push-creatives] Found ${assignments?.length || 0} assignments for ${platformKey}/${entry.market}/${entry.phase_name}, using adset_id: ${entry.dsp_entity_id}`);

      if (assignmentError) {
        results.push({
          platform: entry.platform,
          market: entry.market,
          phase: entry.phase_name,
          success: false,
          error: `Failed to load creative assignments: ${assignmentError.message}`,
        });
        continue;
      }

      let localPushed = 0;
      let localFailed = 0;

      // Filter to only pending assignments
      const pendingAssignments = (assignments || []).filter(
        (a: any) => a.status !== "pushed" && (a as any).creative
      );

      console.log(`[push-creatives] Processing ${pendingAssignments.length} pending assignments in batches of ${BATCH_SIZE}`);

      // Process assignments in batches
      const batches = chunkArray(pendingAssignments, BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[push-creatives] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);

        // Process each assignment in the batch sequentially to avoid rate limits
        for (const assignment of batch) {
          const creative = (assignment as any).creative;
          if (!creative) continue;

          // Update status to 'pushing' for real-time progress tracking
          await supabase
            .from("creative_assignments")
            .update({ status: "pushing" })
            .eq("id", assignment.id);

          // Use assignment text fields with creative fallback
          const resolvedText = {
            primaryText: assignment.primary_text || creative.primary_text || "",
            headline: assignment.headline || creative.headline || "",
            description: assignment.description || creative.description || "",
            callToAction: assignment.call_to_action || creative.call_to_action,
            destinationUrl: assignment.destination_url || creative.destination_url,
            urlParameters: assignment.url_parameters || creative.url_parameters,
            brandName: assignment.brand_name || creative.brand_name,
            displayName: assignment.display_name || creative.tiktok_display_name,
          };

          if (platformKey === "meta") {
            const resolvedAdAccount =
              (market as any)?.adAccountId ||
              (market as any)?.ad_account_id ||
              platform.ad_account_id ||
              Deno.env.get("META_AD_ACCOUNT_ID");
            const adAccountPath = resolvedAdAccount
              ? String(resolvedAdAccount).startsWith("act_")
                ? String(resolvedAdAccount)
                : `act_${String(resolvedAdAccount).replace(/^act_/, "")}`
              : null;

            if (!adAccountPath) {
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: "Missing Meta ad account id" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            // Fetch meta_ad_accounts defaults for Advantage+ features
            const adAccountIdRaw = resolvedAdAccount?.replace(/^act_/, "") || "";
            const { data: metaAdAccountDefaults } = await supabase
              .from("meta_ad_accounts")
              .select(`
                advantage_plus_video_touchups,
                advantage_plus_text_improvements,
                advantage_plus_product_tags,
                advantage_plus_video_effects,
                advantage_plus_relevant_comments,
                advantage_plus_enhance_cta,
                advantage_plus_reveal_details,
                advantage_plus_show_spotlights,
                advantage_plus_optimize_text_per_person,
                advantage_plus_sitelinks,
                advantage_plus_products,
                default_utm_mode,
                default_url_parameters,
                default_pixel_id
              `)
              .eq("account_id", adAccountIdRaw)
              .maybeSingle();

            // Resolve Advantage+ features: assignment overrides > ad account defaults
            const advantagePlusFeatures = {
              videoTouchups: assignment.advantage_plus_video_touchups ?? metaAdAccountDefaults?.advantage_plus_video_touchups ?? false,
              textImprovements: assignment.advantage_plus_text_improvements ?? metaAdAccountDefaults?.advantage_plus_text_improvements ?? false,
              productTags: assignment.advantage_plus_product_tags ?? metaAdAccountDefaults?.advantage_plus_product_tags ?? false,
              videoEffects: assignment.advantage_plus_video_effects ?? metaAdAccountDefaults?.advantage_plus_video_effects ?? false,
              relevantComments: assignment.advantage_plus_relevant_comments ?? metaAdAccountDefaults?.advantage_plus_relevant_comments ?? false,
              enhanceCta: assignment.advantage_plus_enhance_cta ?? metaAdAccountDefaults?.advantage_plus_enhance_cta ?? false,
              revealDetails: assignment.advantage_plus_reveal_details ?? metaAdAccountDefaults?.advantage_plus_reveal_details ?? false,
              showSpotlights: assignment.advantage_plus_show_spotlights ?? metaAdAccountDefaults?.advantage_plus_show_spotlights ?? false,
              optimizeTextPerPerson: assignment.advantage_plus_optimize_text_per_person ?? metaAdAccountDefaults?.advantage_plus_optimize_text_per_person ?? false,
              sitelinks: assignment.advantage_plus_sitelinks ?? metaAdAccountDefaults?.advantage_plus_sitelinks ?? false,
              products: assignment.advantage_plus_products ?? metaAdAccountDefaults?.advantage_plus_products ?? false,
            };

            // Resolve UTM mode: assignment > ad account defaults
            const utmMode = assignment.utm_mode || metaAdAccountDefaults?.default_utm_mode || "auto";
            
            // Resolve URL parameters based on UTM mode
            let finalUrlParameters = resolvedText.urlParameters;
            if (utmMode === "auto") {
              // Use Meta dynamic URL parameters
              finalUrlParameters = "utm_source={{site_source_name}}&utm_medium={{placement}}&utm_campaign={{campaign.name}}&utm_content={{adset.name}}";
            } else if (!finalUrlParameters && metaAdAccountDefaults?.default_url_parameters) {
              finalUrlParameters = metaAdAccountDefaults.default_url_parameters;
            }

            // Get tracking pixel from phase/market config
            const pixelId = (phase as any)?.metaPixelId || (market as any)?.metaPixelId || metaAdAccountDefaults?.default_pixel_id;
            
            console.log(`[push-creatives] Advantage+ features:`, JSON.stringify(advantagePlusFeatures));
            console.log(`[push-creatives] UTM mode: ${utmMode}, URL params: ${finalUrlParameters || "none"}`);
            if (pixelId) console.log(`[push-creatives] Tracking pixel: ${pixelId}`);

            let hasMetaAsset = creative.platform_image_hash || creative.platform_video_id;
            
            // Auto-upload to Meta if creative is missing DSP asset IDs
            if (!hasMetaAsset) {
              console.log(`[push-creatives] Creative ${creative.id} missing Meta asset, attempting auto-upload`);
              
              // Get media URL from creative (needs to be fetched from creatives table)
              const { data: fullCreative, error: creativeError } = await supabase
                .from("creatives")
                .select("media_urls, media_type")
                .eq("id", creative.id)
                .single();
              
              if (creativeError || !fullCreative?.media_urls?.[0]) {
                console.error(`[push-creatives] Cannot auto-upload: no media URL for creative ${creative.id}`);
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: "Creative missing media file - cannot auto-upload to Meta",
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }
              
              const mediaUrl = fullCreative.media_urls[0];
              const isVideoFile = fullCreative.media_type === "video" || 
                mediaUrl.includes('.mp4') || mediaUrl.includes('.mov') || mediaUrl.includes('.webm');
              
              try {
                if (isVideoFile) {
                  // Upload video using file_url method
                  console.log(`[push-creatives] Auto-uploading video to Meta: ${mediaUrl}`);
                  const videoFormData = new FormData();
                  videoFormData.append("file_url", mediaUrl);
                  videoFormData.append("access_token", platform.access_token);
                  videoFormData.append("title", creative.name || "creative");
                  
                  const videoResponse = await fetch(
                    `https://graph.facebook.com/v22.0/${adAccountPath}/advideos`,
                    { method: "POST", body: videoFormData }
                  );
                  const videoData = await videoResponse.json();
                  
                  if (videoData.error) {
                    throw new Error(`Meta API error: ${videoData.error.message}`);
                  }
                  
                  if (videoData.id) {
                    console.log(`[push-creatives] Video uploaded successfully, ID: ${videoData.id}`);
                    await supabase
                      .from("creatives")
                      .update({ 
                        platform_video_id: videoData.id, 
                        dsp_upload_status: "uploaded",
                        dsp_uploaded_at: new Date().toISOString()
                      })
                      .eq("id", creative.id);
                    creative.platform_video_id = videoData.id;
                    hasMetaAsset = true;
                  }
                } else {
                  // Upload image using base64
                  console.log(`[push-creatives] Auto-uploading image to Meta: ${mediaUrl}`);
                  
                  // Fetch the image and convert to base64
                  const imageResponse = await fetch(mediaUrl);
                  if (!imageResponse.ok) {
                    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
                  }
                  
                  const imageBuffer = await imageResponse.arrayBuffer();
                  const base64Image = btoa(
                    new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                  );
                  
                  const imageFormData = new FormData();
                  imageFormData.append("bytes", base64Image);
                  imageFormData.append("access_token", platform.access_token);
                  
                  const imageUploadResponse: Response = await fetch(
                    `https://graph.facebook.com/v22.0/${adAccountPath}/adimages`,
                    { method: "POST", body: imageFormData }
                  );
                  const imageUploadData: any = await imageUploadResponse.json();
                  
                  if (imageUploadData.error) {
                    throw new Error(`Meta API error: ${imageUploadData.error.message}`);
                  }
                  
                  const images: any = imageUploadData.images;
                  if (images) {
                    const imageKey = Object.keys(images)[0];
                    const imageHash = images[imageKey]?.hash;
                    if (imageHash) {
                      console.log(`[push-creatives] Image uploaded successfully, hash: ${imageHash}`);
                      await supabase
                        .from("creatives")
                        .update({ 
                          platform_image_hash: imageHash,
                          dsp_upload_status: "uploaded",
                          dsp_uploaded_at: new Date().toISOString()
                        })
                        .eq("id", creative.id);
                      creative.platform_image_hash = imageHash;
                      hasMetaAsset = true;
                    }
                  }
                }
              } catch (uploadError) {
                console.error(`[push-creatives] Auto-upload failed for creative ${creative.id}:`, uploadError);
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: `Auto-upload to Meta failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }
            }
            
            // Final check after auto-upload attempt
            if (!hasMetaAsset) {
              await supabase
                .from("creative_assignments")
                .update({
                  status: "error",
                  error_message: "Creative not uploaded to Meta (upload failed)",
                })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            const metaLandingPageUrl = (phase as any)?.metaLandingPageUrl || (market as any)?.metaLandingPageUrl;
            const pageId =
              creative.external_page_id || 
              (market as any)?.metaPageId || 
              (market as any)?.pageId || 
              (market as any)?.defaultPageId;

            if (!pageId) {
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: "No Facebook Page ID configured" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            const isVideo = creative.media_type === "video" || creative.creative_type === "video";

            const creativePayload: any = {
              name: `Creative_${creative.name}`,
              object_story_spec: { page_id: pageId },
            };

            if (isVideo && creative.platform_video_id) {
              // Meta requires a video thumbnail when creating the ad creative.
              // We MUST send either image_hash (preferred when user uploaded a custom thumbnail)
              // or image_url (when we can fetch a generated thumbnail from Meta).
              let thumbnailImageHash: string | null = creative.platform_thumbnail_id || null;
              let thumbnailImageUrl: string | null = null;

              if (!thumbnailImageHash) {
                // If we already have a stored thumbnail_url and it looks like an image, use it.
                if (
                  creative.thumbnail_url &&
                  !creative.thumbnail_url.endsWith(".mp4") &&
                  !creative.thumbnail_url.endsWith(".mov") &&
                  !creative.thumbnail_url.endsWith(".webm")
                ) {
                  thumbnailImageUrl = creative.thumbnail_url;
                } else {
                  // Otherwise, try fetching a thumbnail from Meta.
                  console.log(
                    `[push-creatives] Fetching video thumbnail from Meta for video_id: ${creative.platform_video_id}`,
                  );
                  try {
                    const thumbsResponse = await fetch(
                      `https://graph.facebook.com/v22.0/${creative.platform_video_id}/thumbnails?fields=uri,is_preferred,width,height&access_token=${platform.access_token}`,
                    );
                    const thumbsJson = await thumbsResponse.json();

                    const thumbs = Array.isArray(thumbsJson?.data) ? thumbsJson.data : [];
                    if (thumbsJson?.error) {
                      console.log(`[push-creatives] Meta thumbnails error:`, JSON.stringify(thumbsJson.error));
                    } else if (thumbs.length > 0) {
                      // Prefer the thumbnail marked preferred; otherwise use the first.
                      const preferred = thumbs.find((t: any) => t?.is_preferred) || thumbs[0];
                      thumbnailImageUrl = preferred?.uri || null;

                      if (thumbnailImageUrl) {
                        console.log(`[push-creatives] Using Meta thumbnail URL: ${thumbnailImageUrl}`);
                        await supabase
                          .from("creatives")
                          .update({ thumbnail_url: thumbnailImageUrl })
                          .eq("id", creative.id);
                      }
                    } else {
                      console.log(`[push-creatives] No thumbnails available yet for video ${creative.platform_video_id}`);
                    }
                  } catch (thumbError) {
                    console.error(`[push-creatives] Failed to fetch Meta thumbnails:`, thumbError);
                  }
                }
              }

              if (!thumbnailImageHash && !thumbnailImageUrl) {
                // Don’t attempt ad creative creation—Meta will reject with "Invalid parameter".
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message:
                      "Meta video thumbnail not available yet. Wait 1–2 minutes and retry, or upload a custom thumbnail.",
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }

              creativePayload.object_story_spec.video_data = {
                video_id: creative.platform_video_id,
                title: resolvedText.headline || creative.name,
                message: resolvedText.primaryText,
                call_to_action: resolvedText.callToAction
                  ? {
                      type: resolvedText.callToAction,
                      value: {
                        link: resolvedText.destinationUrl || metaLandingPageUrl || "https://example.com",
                      },
                    }
                  : undefined,
                ...(thumbnailImageHash ? { image_hash: thumbnailImageHash } : {}),
                ...(thumbnailImageUrl ? { image_url: thumbnailImageUrl } : {}),
              };
            } else if (creative.platform_image_hash) {
              creativePayload.object_story_spec.link_data = {
                image_hash: creative.platform_image_hash,
                link: resolvedText.destinationUrl || metaLandingPageUrl || "https://example.com",
                message: resolvedText.primaryText,
                name: resolvedText.headline,
                description: resolvedText.description,
                call_to_action: resolvedText.callToAction ? { type: resolvedText.callToAction } : undefined,
              };
            }

            // URL parameters - use resolved finalUrlParameters
            if (finalUrlParameters) {
              if (creativePayload.object_story_spec.video_data?.call_to_action?.value?.link) {
                const baseLink = creativePayload.object_story_spec.video_data.call_to_action.value.link;
                // For Meta dynamic params, append as-is (they contain {{ }} templates)
                if (finalUrlParameters.includes("{{")) {
                  creativePayload.object_story_spec.video_data.call_to_action.value.link = 
                    baseLink + (baseLink.includes("?") ? "&" : "?") + finalUrlParameters;
                } else {
                  try {
                    const url = new URL(baseLink);
                    url.search = url.search ? `${url.search}&${finalUrlParameters}` : `?${finalUrlParameters}`;
                    creativePayload.object_story_spec.video_data.call_to_action.value.link = url.toString();
                  } catch {
                    creativePayload.object_story_spec.video_data.call_to_action.value.link = 
                      baseLink + (baseLink.includes("?") ? "&" : "?") + finalUrlParameters;
                  }
                }
              } else if (creativePayload.object_story_spec.link_data?.link) {
                const baseLink = creativePayload.object_story_spec.link_data.link;
                if (finalUrlParameters.includes("{{")) {
                  creativePayload.object_story_spec.link_data.link = 
                    baseLink + (baseLink.includes("?") ? "&" : "?") + finalUrlParameters;
                } else {
                  try {
                    const url = new URL(baseLink);
                    url.search = url.search ? `${url.search}&${finalUrlParameters}` : `?${finalUrlParameters}`;
                    creativePayload.object_story_spec.link_data.link = url.toString();
                  } catch {
                    creativePayload.object_story_spec.link_data.link = 
                      baseLink + (baseLink.includes("?") ? "&" : "?") + finalUrlParameters;
                  }
                }
              }
            }

            // Build degrees_of_freedom_spec for Advantage+ creative enhancements
            const creativeFeaturesSpec: any = {};
            if (advantagePlusFeatures.videoTouchups) creativeFeaturesSpec.video_touchups = { value: "on" };
            if (advantagePlusFeatures.textImprovements) creativeFeaturesSpec.text_improvements = { value: "on" };
            if (advantagePlusFeatures.productTags) creativeFeaturesSpec.product_tags = { value: "on" };
            if (advantagePlusFeatures.videoEffects) creativeFeaturesSpec.video_effects = { value: "on" };
            if (advantagePlusFeatures.relevantComments) creativeFeaturesSpec.relevant_comments = { value: "on" };
            if (advantagePlusFeatures.enhanceCta) creativeFeaturesSpec.enhance_cta = { value: "on" };
            if (advantagePlusFeatures.revealDetails) creativeFeaturesSpec.reveal_details = { value: "on" };
            if (advantagePlusFeatures.showSpotlights) creativeFeaturesSpec.show_spotlights = { value: "on" };
            if (advantagePlusFeatures.optimizeTextPerPerson) creativeFeaturesSpec.standard_enhancements = { value: "on" };
            
            // Add degrees_of_freedom_spec if any features are enabled
            if (Object.keys(creativeFeaturesSpec).length > 0) {
              creativePayload.degrees_of_freedom_spec = {
                creative_features_spec: creativeFeaturesSpec
              };
            }

            console.log(`[push-creatives] Creating ad creative for ${creative.name}, payload:`, JSON.stringify({
              ...creativePayload,
              access_token: "***"
            }));
            
            const creativeResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/adcreatives`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...creativePayload, access_token: platform.access_token }),
            });
            const creativeData = await creativeResponse.json();

            if (creativeData?.error) {
              console.error(`[push-creatives] Ad creative creation failed:`, JSON.stringify(creativeData.error));
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: creativeData.error.message || "Failed to create ad creative" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }
            
            console.log(`[push-creatives] Ad creative created with id: ${creativeData.id}`);

            // Build ad payload with tracking
            const adPayload: any = {
              name: creative.name,
              adset_id: entry.dsp_entity_id,
              creative: { creative_id: creativeData.id },
              status: "PAUSED",
            };

            // Add tracking specs if pixel is configured
            if (pixelId) {
              adPayload.tracking_specs = [
                { "action.type": ["offsite_conversion"], "fb_pixel": [pixelId] }
              ];
            }
            
            console.log(`[push-creatives] Creating ad with adset_id: ${entry.dsp_entity_id}, payload:`, JSON.stringify({
              ...adPayload,
              access_token: "***"
            }));

            const adResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/ads`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...adPayload, access_token: platform.access_token }),
            });
            const adData = await adResponse.json();

            if (adData?.error || !adData?.id) {
              console.error(`[push-creatives] Ad creation failed:`, JSON.stringify(adData?.error || adData));
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: adData?.error?.message || "Failed to create ad" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }
            
            console.log(`[push-creatives] Ad created with id: ${adData.id}`);

            await supabase
              .from("creative_assignments")
              .update({ status: "pushed", dsp_creative_id: adData.id, error_message: null })
              .eq("id", assignment.id);

            localPushed++;
            continue;
          }

          if (platformKey === "tiktok") {
            const advertiserId = (market as any)?.adAccountId || platform.metadata?.advertiser_ids?.[0];
            if (!advertiserId) {
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: "Missing TikTok advertiser ID" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            // Fetch TikTok ad account defaults (identity, pixel, etc.)
            const { data: tiktokAdAccountDefaults } = await supabase
              .from("tiktok_ad_accounts")
              .select(`
                default_identity_id,
                default_pixel_id,
                default_landing_page_url
              `)
              .eq("advertiser_id", advertiserId)
              .maybeSingle();

            let hasTikTokAsset = !!(creative.platform_video_id || creative.platform_image_hash);

            // Auto-upload to TikTok if creative is missing DSP asset IDs
            if (!hasTikTokAsset) {
              console.log(`[push-creatives] Creative ${creative.id} missing TikTok asset, attempting auto-upload`);

              const { data: fullCreative, error: creativeError } = await supabase
                .from("creatives")
                .select("media_urls, media_type, name, thumbnail_url")
                .eq("id", creative.id)
                .single();

              if (creativeError || !fullCreative?.media_urls?.[0]) {
                console.error(`[push-creatives] Cannot auto-upload: no media URL for creative ${creative.id}`);
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: "Creative missing media file - cannot auto-upload to TikTok",
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }

              const mediaUrl: string = fullCreative.media_urls[0];
              const isVideoFile =
                fullCreative.media_type === "video" || /(\.mp4|\.mov|\.webm)(\?|$)/i.test(mediaUrl);

              try {
                const mediaResp = await fetch(mediaUrl);
                if (!mediaResp.ok) {
                  throw new Error(`Failed to fetch media (${mediaResp.status})`);
                }

                const mediaBuf = await mediaResp.arrayBuffer();
                const bytes = new Uint8Array(mediaBuf);

                // Best-effort filename: use creative name, fallback to URL tail
                const urlTail = mediaUrl.split("/").pop() || "asset";
                const baseNameRaw = `${fullCreative.name || creative.name || urlTail}`.trim() || "asset";
                const baseNameSanitized = baseNameRaw
                  .replace(/[^\w.\- ]+/g, "")
                  .replace(/\s+/g, "-")
                  .slice(0, 140);
                const uniqueToken = crypto.randomUUID().split("-")[0];
                const materialName = `${baseNameSanitized}-${uniqueToken}`.slice(0, 180);
                const videoFileName = materialName.toLowerCase().endsWith(".mp4") ? materialName : `${materialName}.mp4`;
                const imageFileName = /\.(jpg|jpeg|png)$/i.test(materialName) ? materialName : `${materialName}.jpg`;

              if (isVideoFile) {
                  const uploadUrl = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/";
                  const formData = new FormData();
                  const blob = new Blob([bytes], { type: "video/mp4" });

                  // Compute MD5 hash for video_signature (required by TikTok)
                  const hashBuffer = await stdCrypto.subtle.digest("MD5", bytes);
                  const videoSignature = new TextDecoder().decode(encodeHex(new Uint8Array(hashBuffer)));

                  formData.append("advertiser_id", advertiserId);
                  formData.append("upload_type", "UPLOAD_BY_FILE");
                  formData.append("video_signature", videoSignature);
                  formData.append("video_file", blob, videoFileName);

                  console.log(`[push-creatives] Auto-uploading video to TikTok: ${uploadUrl}`);
                  const uploadResp = await fetch(uploadUrl, {
                    method: "POST",
                    headers: { "Access-Token": platform.access_token },
                    body: formData,
                  });

                  const uploadText = await uploadResp.text();
                  let uploadData: any = null;
                  try {
                    uploadData = uploadText ? JSON.parse(uploadText) : null;
                  } catch {
                    // keep uploadData as null; we'll include raw response in errors below
                  }

                  if (!uploadResp.ok) {
                    console.error("[push-creatives] TikTok video upload HTTP error", {
                      status: uploadResp.status,
                      statusText: uploadResp.statusText,
                      bodyPreview: uploadText?.slice(0, 800),
                    });
                    throw new Error(`TikTok video upload HTTP ${uploadResp.status}`);
                  }

                  if (uploadData?.code !== 0) {
                    console.error("[push-creatives] TikTok video upload API error", {
                      code: uploadData?.code,
                      message: uploadData?.message,
                      data: uploadData?.data,
                    });
                    throw new Error(uploadData?.message || "TikTok video upload failed");
                  }

                  const data0 = Array.isArray(uploadData?.data) ? uploadData.data[0] : uploadData?.data;
                  const videoId =
                    data0?.video_id ??
                    data0?.video_info?.video_id ??
                    data0?.video?.video_id ??
                    data0?.video_id_str ??
                    data0?.videoId ??
                    data0?.video?.id ??
                    data0?.id ??
                    uploadData?.video_id;

                  if (!videoId) {
                    console.error("[push-creatives] TikTok upload response missing video_id", {
                      bodyPreview: uploadText?.slice(0, 800),
                      uploadData,
                    });
                    throw new Error("TikTok video upload returned no video_id");
                  }

                  await supabase
                    .from("creatives")
                    .update({
                      platform_video_id: videoId,
                      dsp_upload_status: "uploaded",
                      dsp_uploaded_at: new Date().toISOString(),
                      dsp_upload_error: null,
                    })
                    .eq("id", creative.id);

                  creative.platform_video_id = videoId;
                  hasTikTokAsset = true;
                  console.log(`[push-creatives] TikTok video uploaded, video_id: ${videoId}`);
                } else {
                  const uploadUrl = "https://business-api.tiktok.com/open_api/v1.3/file/image/ad/upload/";
                  const formData = new FormData();
                  const blob = new Blob([bytes], { type: "image/jpeg" });

                  formData.append("advertiser_id", advertiserId);
                  formData.append("upload_type", "UPLOAD_BY_FILE");
                  formData.append("image_file", blob, imageFileName);

                  console.log(`[push-creatives] Auto-uploading image to TikTok: ${uploadUrl}`);
                  const uploadResp = await fetch(uploadUrl, {
                    method: "POST",
                    headers: { "Access-Token": platform.access_token },
                    body: formData,
                  });

                  const uploadText = await uploadResp.text();
                  let uploadData: any = null;
                  try {
                    uploadData = uploadText ? JSON.parse(uploadText) : null;
                  } catch {
                    // keep uploadData as null
                  }

                  if (!uploadResp.ok) {
                    console.error("[push-creatives] TikTok image upload HTTP error", {
                      status: uploadResp.status,
                      statusText: uploadResp.statusText,
                      bodyPreview: uploadText?.slice(0, 800),
                    });
                    throw new Error(`TikTok image upload HTTP ${uploadResp.status}`);
                  }

                  if (uploadData?.code !== 0) {
                    console.error("[push-creatives] TikTok image upload API error", {
                      code: uploadData?.code,
                      message: uploadData?.message,
                      data: uploadData?.data,
                    });
                    throw new Error(uploadData?.message || "TikTok image upload failed");
                  }

                  const data0 = Array.isArray(uploadData?.data) ? uploadData.data[0] : uploadData?.data;
                  const imageId =
                    data0?.id ??
                    data0?.image_id ??
                    uploadData?.data?.id ??
                    uploadData?.id;

                  if (!imageId) {
                    console.error("[push-creatives] TikTok upload response missing image id", {
                      bodyPreview: uploadText?.slice(0, 800),
                      uploadData,
                    });
                    throw new Error("TikTok image upload returned no id");
                  }

                  await supabase
                    .from("creatives")
                    .update({
                      platform_image_hash: imageId,
                      dsp_upload_status: "uploaded",
                      dsp_uploaded_at: new Date().toISOString(),
                      dsp_upload_error: null,
                    })
                    .eq("id", creative.id);

                  creative.platform_image_hash = imageId;
                  hasTikTokAsset = true;
                  console.log(`[push-creatives] TikTok image uploaded, image_id: ${imageId}`);
                }
              } catch (uploadError) {
                const msg = uploadError instanceof Error ? uploadError.message : "Unknown error";
                console.error(`[push-creatives] Auto-upload failed for TikTok creative ${creative.id}:`, uploadError);

                await supabase
                  .from("creatives")
                  .update({ dsp_upload_status: "error", dsp_upload_error: msg })
                  .eq("id", creative.id);

                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: `Auto-upload to TikTok failed: ${msg}`,
                  })
                  .eq("id", assignment.id);

                localFailed++;
                continue;
              }
            }

            // Final check after auto-upload attempt
            if (!hasTikTokAsset) {
              await supabase
                .from("creative_assignments")
                .update({
                  status: "error",
                  error_message: "Creative not uploaded to TikTok (upload failed)",
                })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            const identityId =
              creative.tiktok_identity_id ||
              (market as any)?.tiktokIdentityId ||
              (market as any)?.defaultIdentityId ||
              tiktokAdAccountDefaults?.default_identity_id;

            if (!identityId) {
              console.error(`[push-creatives] No TikTok Identity ID found for creative ${creative.id}. Checked: creative.tiktok_identity_id, market.tiktokIdentityId, market.defaultIdentityId, tiktokAdAccountDefaults.default_identity_id`);
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: "No TikTok Identity ID configured - set it on the creative, market, or ad account defaults" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            const isVideo = creative.media_type === "video" || creative.creative_type === "video";
            const landingPageUrl = resolvedText.destinationUrl || (phase as any)?.landingPageUrl || (market as any)?.landingPageUrl || tiktokAdAccountDefaults?.default_landing_page_url;

            const tiktokAdPayload: any = {
              advertiser_id: advertiserId,
              adgroup_id: entry.dsp_entity_id,
              creatives: [
                {
                  ad_name: creative.name,
                  ad_format: creative.tiktok_ad_format || (isVideo ? "SINGLE_VIDEO" : "SINGLE_IMAGE"),
                  identity_id: identityId,
                  identity_type: "CUSTOMIZED_USER",
                  ad_text: resolvedText.primaryText || resolvedText.headline,
                  call_to_action: resolvedText.callToAction || "LEARN_MORE",
                  landing_page_url: landingPageUrl,
                },
              ],
            };

            if (isVideo && creative.platform_video_id) {
              tiktokAdPayload.creatives[0].video_id = creative.platform_video_id;
              if (creative.platform_thumbnail_id) tiktokAdPayload.creatives[0].image_ids = [creative.platform_thumbnail_id];
            } else if (creative.platform_image_hash) {
              tiktokAdPayload.creatives[0].image_ids = [creative.platform_image_hash];
            }

            if (resolvedText.displayName || resolvedText.brandName) {
              tiktokAdPayload.creatives[0].display_name = resolvedText.displayName || resolvedText.brandName;
            }

            if (creative.app_link) {
              tiktokAdPayload.creatives[0].download_url = creative.app_link;
            }

            const tiktokAdResponse = await fetch("https://business-api.tiktok.com/open_api/v1.3/ad/create/", {
              method: "POST",
              headers: {
                "Access-Token": platform.access_token,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(tiktokAdPayload),
            });

            const tiktokAdData = await tiktokAdResponse.json();
            const adId = tiktokAdData?.data?.ad_ids?.[0];

            if (tiktokAdData?.code !== 0 || !adId) {
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: tiktokAdData?.message || "Failed to create TikTok ad" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            await supabase
              .from("creative_assignments")
              .update({ status: "pushed", dsp_creative_id: adId, error_message: null })
              .eq("id", assignment.id);

            localPushed++;
          }
        }

        // Add delay between batches to prevent resource exhaustion
        if (batchIndex < batches.length - 1) {
          console.log(`[push-creatives] Waiting ${BATCH_DELAY_MS}ms before next batch...`);
          await delay(BATCH_DELAY_MS);
        }
      }

      console.log(`[push-creatives] Completed: ${localPushed} pushed, ${localFailed} failed`);

      pushedCount += localPushed;
      failedCount += localFailed;
      results.push({
        platform: entry.platform,
        market: entry.market,
        phase: entry.phase_name,
        pushed: localPushed,
        failed: localFailed,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        pushedCount,
        failedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("push-creatives-to-dsp error:", error);
    return new Response(JSON.stringify({ success: false, error: (error as any)?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
