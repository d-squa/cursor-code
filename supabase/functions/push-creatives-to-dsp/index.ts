import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const inputSchema = z.object({
  campaignId: z.string().uuid(),
  jobId: z.string().uuid().optional(), // For continuation from existing job
  isAutoRetry: z.boolean().optional(), // Flag for auto-retry invocations
});

// Batch size for processing creatives to avoid resource exhaustion
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200; // Reduced delay between batches for faster processing
const MAX_EXECUTION_TIME_MS = 25000; // Max execution time before auto-continuing (25s safety margin)
const AUTO_RETRY_DELAY_MS = 2000; // Delay before auto-retry to prevent rate limiting

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

// Function to trigger auto-retry in background
async function triggerAutoRetry(
  supabaseUrl: string,
  serviceKey: string,
  campaignId: string,
  jobId: string,
) {
  console.log(`[push-creatives] Scheduling auto-retry for job ${jobId} in ${AUTO_RETRY_DELAY_MS}ms`);
  
  await delay(AUTO_RETRY_DELAY_MS);
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/push-creatives-to-dsp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        campaignId,
        jobId,
        isAutoRetry: true,
      }),
    });
    
    const result = await response.json();
    console.log(`[push-creatives] Auto-retry triggered, response:`, JSON.stringify(result));
  } catch (error) {
    console.error(`[push-creatives] Auto-retry failed:`, error);
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now(); // Track execution time for timeout protection
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) throw new Error("Service configuration error");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { campaignId, jobId: existingJobId, isAutoRetry } = parsed.data;
    
    // For auto-retry, we use service role auth
    // For user-initiated, we validate the auth header
    let userId: string;
    
    if (isAutoRetry && existingJobId) {
      // Auto-retry: get user_id from the job record
      const { data: job, error: jobError } = await supabase
        .from("creative_push_jobs")
        .select("user_id, status, retry_count, max_retries")
        .eq("id", existingJobId)
        .single();
      
      if (jobError || !job) {
        console.error(`[push-creatives] Auto-retry: job not found`, jobError);
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Check if job should continue
      if (job.status === "completed" || job.status === "failed" || job.status === "paused") {
        console.log(`[push-creatives] Job ${existingJobId} is ${job.status}, skipping auto-retry`);
        return new Response(JSON.stringify({ 
          success: true, 
          message: `Job already ${job.status}`,
          jobId: existingJobId 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Check retry limit
      if (job.retry_count >= job.max_retries) {
        await supabase
          .from("creative_push_jobs")
          .update({ status: "failed", error_message: "Max retries exceeded" })
          .eq("id", existingJobId);
        
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Max retries exceeded",
          jobId: existingJobId 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      userId = job.user_id;
      
      // Increment retry count
      await supabase
        .from("creative_push_jobs")
        .update({ 
          retry_count: job.retry_count + 1,
          status: "processing",
          last_processed_at: new Date().toISOString()
        })
        .eq("id", existingJobId);
        
      console.log(`[push-creatives] Auto-retry #${job.retry_count + 1} for job ${existingJobId}`);
    } else {
      // User-initiated: validate auth header
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
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
      
      userId = user.id;
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (campaignError) throw campaignError;

    // Access control: owner OR member of the campaign workspace
    let canAccess = campaign.user_id === userId;
    if (!canAccess && campaign.team_id) {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("team_id", campaign.team_id)
        .eq("user_id", userId)
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

    // Get or create job record
    let jobId = existingJobId;
    if (!jobId) {
      // Count total pending assignments for this campaign
      const { count: totalAssignments } = await supabase
        .from("creative_assignments")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .neq("status", "pushed");
      
      // Create new job
      const { data: newJob, error: jobCreateError } = await supabase
        .from("creative_push_jobs")
        .insert({
          campaign_id: campaignId,
          user_id: userId,
          status: "processing",
          total_assignments: totalAssignments || 0,
          last_processed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      
      if (jobCreateError) {
        console.error(`[push-creatives] Failed to create job:`, jobCreateError);
        throw jobCreateError;
      }
      
      jobId = newJob.id;
      console.log(`[push-creatives] Created new job ${jobId} with ${totalAssignments} pending assignments`);
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
    let timedOut = false;
    let hasMoreWork = false;

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

      // Filter to only pending assignments (not pushed and not currently pushing)
      const pendingAssignments = (assignments || []).filter(
        (a: any) => a.status !== "pushed" && a.status !== "pushing" && (a as any).creative
      );

      console.log(`[push-creatives] Processing ${pendingAssignments.length} pending assignments in batches of ${BATCH_SIZE}`);

      // Process assignments in batches
      const batches = chunkArray(pendingAssignments, BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        // Check for timeout before processing each batch
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          console.log(`[push-creatives] Approaching timeout limit, will auto-continue`);
          timedOut = true;
          hasMoreWork = true;
          break;
        }
        
        const batch = batches[batchIndex];
        console.log(`[push-creatives] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);

        // Process each assignment in the batch sequentially to avoid rate limits
        for (const assignment of batch) {
          const creative = (assignment as any).creative;
          if (!creative) continue;

          // Update individual status to 'pushing' for real-time progress tracking
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
            // Note: account_id in DB may have "act_" prefix or not, try both formats
            const adAccountIdRaw = resolvedAdAccount?.replace(/^act_/, "") || "";
            const adAccountIdWithPrefix = `act_${adAccountIdRaw}`;
            
            // Query with both possible formats (with and without act_ prefix)
            // IMPORTANT: meta_ad_accounts can contain multiple rows per account_id, so we always order+limit.
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
                default_pixel_id,
                default_landing_page_url,
                default_page_id,
                synced_at
              `)
              .or(`account_id.eq.${adAccountIdRaw},account_id.eq.${adAccountIdWithPrefix}`)
              .order("synced_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            
            console.log(`[push-creatives] Looking up ad account defaults for ${adAccountIdRaw} or ${adAccountIdWithPrefix}, found: ${!!metaAdAccountDefaults}, default_landing_page_url: ${metaAdAccountDefaults?.default_landing_page_url}, default_page_id: ${metaAdAccountDefaults?.default_page_id}`);

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
            
            // Get landing page URL from ad account defaults
            const metaLandingPageUrl = metaAdAccountDefaults?.default_landing_page_url;
            
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
                                  mediaUrl.toLowerCase().match(/\.(mp4|mov|avi|wmv|flv|webm|m4v)$/);
              
              try {
                // Download the media file
                console.log(`[push-creatives] Downloading media from: ${mediaUrl}`);
                const mediaResponse = await fetch(mediaUrl);
                if (!mediaResponse.ok) {
                  throw new Error(`Failed to download media: ${mediaResponse.status}`);
                }
                
                const mediaBlob = await mediaResponse.blob();
                const fileName = mediaUrl.split('/').pop() || (isVideoFile ? 'video.mp4' : 'image.jpg');
                
                if (isVideoFile) {
                  // Upload video to Meta
                  console.log(`[push-creatives] Uploading video to Meta...`);
                  const formData = new FormData();
                  formData.append('access_token', platform.access_token);
                  formData.append('source', mediaBlob, fileName);
                  
                  const uploadResponse = await fetch(
                    `https://graph.facebook.com/v22.0/${adAccountPath}/advideos`,
                    {
                      method: 'POST',
                      body: formData,
                    }
                  );
                  
                  const uploadResult = await uploadResponse.json();
                  console.log(`[push-creatives] Video upload result:`, JSON.stringify(uploadResult));
                  
                  if (uploadResult.id) {
                    // Update creative with video ID
                    await supabase
                      .from("creatives")
                      .update({ 
                        platform_video_id: uploadResult.id,
                        dsp_upload_status: "uploaded",
                        dsp_uploaded_at: new Date().toISOString()
                      })
                      .eq("id", creative.id);
                    
                    creative.platform_video_id = uploadResult.id;
                    hasMetaAsset = true;
                  } else {
                    throw new Error(uploadResult.error?.message || "Video upload failed");
                  }
                } else {
                  // Upload image to Meta
                  console.log(`[push-creatives] Uploading image to Meta...`);
                  const formData = new FormData();
                  formData.append('access_token', platform.access_token);
                  formData.append('filename', fileName);
                  formData.append('bytes', await blobToBase64(mediaBlob));
                  
                  const uploadResponse = await fetch(
                    `https://graph.facebook.com/v22.0/${adAccountPath}/adimages`,
                    {
                      method: 'POST',
                      body: formData,
                    }
                  );
                  
                  const uploadResult = await uploadResponse.json();
                  console.log(`[push-creatives] Image upload result:`, JSON.stringify(uploadResult));
                  
                  // Extract hash from response
                  const imageData = uploadResult.images?.[fileName] || Object.values(uploadResult.images || {})[0];
                  if (imageData?.hash) {
                    await supabase
                      .from("creatives")
                      .update({ 
                        platform_image_hash: imageData.hash,
                        dsp_upload_status: "uploaded",
                        dsp_uploaded_at: new Date().toISOString()
                      })
                      .eq("id", creative.id);
                    
                    creative.platform_image_hash = imageData.hash;
                    hasMetaAsset = true;
                  } else {
                    throw new Error(uploadResult.error?.message || "Image upload failed");
                  }
                }
              } catch (uploadError) {
                console.error(`[push-creatives] Auto-upload failed:`, uploadError);
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: `Auto-upload to Meta failed: ${(uploadError as any).message}`,
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }
            }

            const isVideo = !!creative.platform_video_id;

            // Resolve Meta page ID with fallbacks
            let pageId =
              creative.external_page_id ||
              (phase as any)?.metaPageId ||
              (market as any)?.metaPageId ||
              metaAdAccountDefaults?.default_page_id;

            // Final fallback: use the latest synced page for the campaign owner
            if (!pageId) {
              const { data: latestPage } = await supabase
                .from("meta_pages")
                .select("page_id")
                .eq("user_id", campaign.user_id)
                .order("synced_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              pageId = latestPage?.page_id || null;
            }

            if (!pageId) {
              console.error(`[push-creatives] No Meta page ID for creative ${creative.name}`);
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: "Missing Meta page ID" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            // Step 1: Create ad creative
            const creativePayload: any = {
              name: creative.name,
              object_story_spec: {
                page_id: pageId,
              },
              degrees_of_freedom_spec: {
                creative_features_spec: {
                  standard_enhancements: {
                    enroll_status: advantagePlusFeatures.textImprovements ? "OPT_IN" : "OPT_OUT",
                  },
                },
              },
            };

            // Build destination URL with optional URL parameters
            let finalDestinationUrl = resolvedText.destinationUrl || metaLandingPageUrl;
            if (finalDestinationUrl && finalUrlParameters) {
              const separator = finalDestinationUrl.includes("?") ? "&" : "?";
              finalDestinationUrl = `${finalDestinationUrl}${separator}${finalUrlParameters}`;
            }

            if (isVideo) {
              // For video ads, we need to ensure a thumbnail is provided
              // Meta requires either image_hash or image_url in video_data
              let thumbnailImageHash = creative.platform_thumbnail_id;
              let thumbnailImageUrl = creative.thumbnail_url;
              
              // If no existing thumbnail, try to fetch from Meta's video thumbnails endpoint
              if (!thumbnailImageHash && !thumbnailImageUrl && creative.platform_video_id) {
                console.log(`[push-creatives] Fetching thumbnail for video ${creative.platform_video_id}`);
                try {
                  // First try to get thumbnails from Meta API
                  const thumbResponse = await fetch(
                    `https://graph.facebook.com/v22.0/${creative.platform_video_id}?fields=thumbnails,picture&access_token=${platform.access_token}`
                  );
                  const thumbData = await thumbResponse.json();
                  console.log(`[push-creatives] Video thumbnail data:`, JSON.stringify(thumbData));
                  
                  // Try to get a thumbnail from the thumbnails array
                  if (thumbData.thumbnails?.data?.length > 0) {
                    // Find the preferred thumbnail or use the first/largest one
                    const preferredThumb = thumbData.thumbnails.data.find((t: any) => t.is_preferred) 
                      || thumbData.thumbnails.data.sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
                    if (preferredThumb?.uri) {
                      thumbnailImageUrl = preferredThumb.uri;
                      console.log(`[push-creatives] Using thumbnail from thumbnails API: ${thumbnailImageUrl}`);
                    }
                  }
                  
                  // Fallback to picture field if no thumbnails array
                  if (!thumbnailImageUrl && thumbData.picture) {
                    thumbnailImageUrl = thumbData.picture;
                    console.log(`[push-creatives] Using picture field as thumbnail: ${thumbnailImageUrl}`);
                  }
                } catch (thumbError) {
                  console.error(`[push-creatives] Error fetching video thumbnail:`, thumbError);
                }
              }
              
              // If we still don't have a thumbnail, fail the ad creation
              if (!thumbnailImageHash && !thumbnailImageUrl) {
                console.error(`[push-creatives] No thumbnail available for video ${creative.platform_video_id}`);
                await supabase
                  .from("creative_assignments")
                  .update({ 
                    status: "error", 
                    error_message: "Video ads require a thumbnail. Please upload a video with a valid thumbnail." 
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }
              
              // Build video_data - Meta requires either image_hash or image_url
              // Meta ALSO requires a call_to_action with link for video ads
              // Use multiple fallbacks for destination URL
              let destinationLink = resolvedText.destinationUrl 
                || creative.destination_url 
                || metaLandingPageUrl 
                || metaAdAccountDefaults?.default_landing_page_url;
              
              // Ensure URL has protocol
              if (destinationLink && !destinationLink.startsWith('http://') && !destinationLink.startsWith('https://')) {
                destinationLink = `https://${destinationLink}`;
              }
              
              console.log(`[push-creatives] Video destination URL resolution: assignment=${resolvedText.destinationUrl}, creative=${creative.destination_url}, phase=${metaLandingPageUrl}, adAccountDefaults=${metaAdAccountDefaults?.default_landing_page_url}, final=${destinationLink}`);
              
              if (!destinationLink) {
                console.error(`[push-creatives] No destination URL for video ad ${creative.name} (checked assignment, creative, and ad account defaults)`);
                await supabase
                  .from("creative_assignments")
                  .update({ status: "error", error_message: "Video ads require a destination URL. Set it on the assignment, creative, or in ad account defaults." })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }
              
              console.log(`[push-creatives] Using destination URL: ${destinationLink} for video ${creative.name}`);
              
              creativePayload.object_story_spec.video_data = {
                video_id: creative.platform_video_id,
                title: resolvedText.headline || creative.name,
                message: resolvedText.primaryText,
                // Meta requires call_to_action with link for video ads - default to LEARN_MORE if no CTA specified
                call_to_action: {
                  type: resolvedText.callToAction || "LEARN_MORE",
                  value: {
                    link: destinationLink,
                  },
                },
              };
              
              // Add thumbnail - prefer image_hash if available, otherwise use image_url
              if (thumbnailImageHash) {
                creativePayload.object_story_spec.video_data.image_hash = thumbnailImageHash;
              } else if (thumbnailImageUrl) {
                creativePayload.object_story_spec.video_data.image_url = thumbnailImageUrl;
              }
              
              // Add URL parameters to the CTA link if specified
              if (finalUrlParameters && creativePayload.object_story_spec.video_data.call_to_action?.value?.link) {
                const ctaLink = creativePayload.object_story_spec.video_data.call_to_action.value.link;
                const separator = ctaLink.includes("?") ? "&" : "?";
                creativePayload.object_story_spec.video_data.call_to_action.value.link = `${ctaLink}${separator}${finalUrlParameters}`;
              }
            } else {
              creativePayload.object_story_spec.link_data = {
                image_hash: creative.platform_image_hash,
                link: finalDestinationUrl,
                message: resolvedText.primaryText,
                name: resolvedText.headline,
                description: resolvedText.description,
                call_to_action: resolvedText.callToAction
                  ? {
                      type: resolvedText.callToAction,
                      value: { link: finalDestinationUrl },
                    }
                  : undefined,
              };
            }

            console.log(`[push-creatives] Creating ad creative with payload:`, JSON.stringify(creativePayload, null, 2));

            const creativeResponse = await fetch(
              `https://graph.facebook.com/v22.0/${adAccountPath}/adcreatives?access_token=${platform.access_token}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(creativePayload),
              },
            );

            const creativeData = await creativeResponse.json();
            console.log(`[push-creatives] Creative creation response:`, JSON.stringify(creativeData));
            
            if (!creativeData.id) {
              console.error(`[push-creatives] Ad creative creation failed:`, JSON.stringify(creativeData));
              await supabase
                .from("creative_assignments")
                .update({
                  status: "error",
                  error_message: creativeData?.error?.error_user_msg || creativeData?.error?.message || "Failed to create Meta ad creative",
                })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            // Step 2: Create ad using the creative
            const adPayload = {
              name: `${creative.name} - Ad`,
              adset_id: entry.dsp_entity_id,
              creative: { creative_id: creativeData.id },
              status: "PAUSED",
              tracking_specs: pixelId
                ? [{ "action.type": ["offsite_conversion"], fb_pixel: [pixelId] }]
                : undefined,
            };

            console.log(`[push-creatives] Creating ad with payload:`, JSON.stringify(adPayload, null, 2));

            const adResponse = await fetch(
              `https://graph.facebook.com/v22.0/${adAccountPath}/ads?access_token=${platform.access_token}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(adPayload),
              },
            );

            const adData = await adResponse.json();
            console.log(`[push-creatives] Ad creation response:`, JSON.stringify(adData));
            
            if (!adData.id) {
              console.error(`[push-creatives] Ad creation failed:`, JSON.stringify(adData));
              await supabase
                .from("creative_assignments")
                .update({
                  status: "error",
                  error_message: adData?.error?.error_user_msg || adData?.error?.message || "Failed to create Meta ad",
                })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            await supabase
              .from("creative_assignments")
              .update({ status: "pushed", dsp_creative_id: adData.id, error_message: null })
              .eq("id", assignment.id);

            localPushed++;
          } else if (platformKey === "tiktok") {
            // TikTok ad creation logic
            const tiktokAdAccountId =
              (market as any)?.adAccountId ||
              (market as any)?.ad_account_id ||
              (platform as any).metadata?.advertiser_id;

            if (!tiktokAdAccountId) {
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: "Missing TikTok advertiser ID" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            const isVideo = creative.media_type === "video" || creative.creative_type === "video";
            const identityId = creative.tiktok_identity_id || (phase as any)?.tiktokIdentityId || (market as any)?.tiktokIdentityId;

            if (!identityId) {
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: "Missing TikTok identity ID" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            // Build TikTok destination URL with optional URL parameters
            let tiktokDestinationUrl = resolvedText.destinationUrl || creative.destination_url;
            if (tiktokDestinationUrl && resolvedText.urlParameters) {
              const separator = tiktokDestinationUrl.includes("?") ? "&" : "?";
              tiktokDestinationUrl = `${tiktokDestinationUrl}${separator}${resolvedText.urlParameters}`;
            }

            const tiktokAdPayload: any = {
              advertiser_id: tiktokAdAccountId,
              adgroup_id: entry.dsp_entity_id,
              creatives: [
                {
                  ad_name: creative.name,
                  identity_id: identityId,
                  identity_type: "CUSTOMIZED_USER",
                  ad_text: resolvedText.primaryText || creative.name,
                  call_to_action: resolvedText.callToAction || "LEARN_MORE",
                  landing_page_url: tiktokDestinationUrl,
                  ad_format: creative.tiktok_ad_format || "SINGLE_VIDEO",
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
      
      // Break out of outer loop if timed out
      if (timedOut) break;
    }
    
    // Check if there are more pending assignments
    const { count: remainingCount } = await supabase
      .from("creative_assignments")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .not("status", "in", '("pushed","error")');
    
    hasMoreWork = (remainingCount || 0) > 0;
    
    // Update job record
    const jobStatus = hasMoreWork ? "processing" : (failedCount > 0 && pushedCount === 0) ? "failed" : "completed";
    await supabase
      .from("creative_push_jobs")
      .update({
        status: jobStatus,
        pushed_count: pushedCount,
        failed_count: failedCount,
        last_processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", jobId);
    
    // If timed out and there's more work, schedule auto-retry using background task
    if (timedOut && hasMoreWork && jobId) {
      console.log(`[push-creatives] Scheduling auto-retry for remaining ${remainingCount} assignments`);
      
      // Use EdgeRuntime.waitUntil for background continuation
      // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(triggerAutoRetry(supabaseUrl, supabaseKey, campaignId, jobId));
      } else {
        // Fallback: trigger immediately but don't await
        triggerAutoRetry(supabaseUrl, supabaseKey, campaignId, jobId);
      }
    }

    return new Response(
      JSON.stringify({
        success: !timedOut || !hasMoreWork,
        partial: timedOut && hasMoreWork,
        autoRetrying: timedOut && hasMoreWork,
        message: timedOut && hasMoreWork 
          ? `Processed ${pushedCount} ads. Auto-continuing in background for remaining ${remainingCount} assignments...` 
          : undefined,
        pushedCount,
        failedCount,
        remainingCount: remainingCount || 0,
        jobId,
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

// Helper function to convert blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(handler);
