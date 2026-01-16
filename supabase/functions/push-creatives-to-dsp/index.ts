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
      // Include dsp_creative_id to detect already-pushed ads and avoid duplicates
      const { data: assignments, error: assignmentError } = await supabase
        .from("creative_assignments")
        .select(
          `
          id,
          creative_id,
          position,
          status,
          dsp_creative_id,
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

      // Filter to only pending assignments:
      // - Not already pushed (status !== "pushed")
      // - Not already has a DSP creative ID (prevents duplicates on retry)
      // - Include "pushing" status for retry (these were interrupted mid-push)
      // - Has an associated creative
      const pendingAssignments = (assignments || []).filter(
        (a: any) => a.status !== "pushed" && !a.dsp_creative_id && (a as any).creative
      );

      console.log(`[push-creatives] Processing ${pendingAssignments.length} pending assignments in batches of ${BATCH_SIZE} (filtered from ${assignments?.length || 0} total, excluding ${(assignments || []).filter((a: any) => a.dsp_creative_id).length} already pushed to DSP)`);

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
            // IMPORTANT: resolvedAdAccount may be a number (e.g. 550...), so normalize via String() before replace.
            const adAccountIdRaw = resolvedAdAccount ? String(resolvedAdAccount).replace(/^act_/, "") : "";
            const adAccountIdWithPrefix = `act_${adAccountIdRaw}`;
            
            // Query with both possible formats (with and without act_ prefix)
            // Fetch ALL matching rows, then pick the one with defaults set (newer rows may have nulls after sync)
            const { data: allMetaAdAccountRows } = await supabase
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
              .order("synced_at", { ascending: false });
            
            // Prefer the row that has default_landing_page_url or default_page_id set, otherwise use first
            const metaAdAccountDefaults = allMetaAdAccountRows?.find(
              row => row.default_landing_page_url || row.default_page_id
            ) || allMetaAdAccountRows?.[0] || null;
            
            console.log(`[push-creatives] Looking up ad account defaults for ${adAccountIdRaw} or ${adAccountIdWithPrefix}, found ${allMetaAdAccountRows?.length || 0} rows, using row with default_landing_page_url: ${metaAdAccountDefaults?.default_landing_page_url}, default_page_id: ${metaAdAccountDefaults?.default_page_id}`);

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
            // Note: standard_enhancements is deprecated - Meta now requires individual feature settings
            const creativePayload: any = {
              name: creative.name,
              object_story_spec: {
                page_id: pageId,
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
              
              // IMPORTANT: If thumbnail_url is actually a video file (.mp4, .mov, etc.), ignore it
              // This can happen when thumbnail_url mistakenly stores the video URL itself
              const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v'];
              if (thumbnailImageUrl && videoExtensions.some(ext => thumbnailImageUrl.toLowerCase().endsWith(ext))) {
                console.log(`[push-creatives] Ignoring thumbnail_url because it's a video file: ${thumbnailImageUrl}`);
                thumbnailImageUrl = null;
              }
              
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
            // TikTok advertiser/account id resolution (this MUST match the advertiser that owns the ad group + creative)
            const marketAny = market as any;
            const platformAny = platform as any;

            const advertiserIdCandidates = [
              marketAny?.advertiserId,
              marketAny?.advertiser_id,
              marketAny?.tiktokAdvertiserId,
              marketAny?.tiktok_advertiser_id,
              marketAny?.adAccountId,
              marketAny?.ad_account_id,
              marketAny?.accountId,
              marketAny?.account_id,
              platformAny?.metadata?.advertiser_id,
            ].filter((v) => v !== undefined && v !== null && String(v).trim().length > 0);

            const tiktokAdvertiserId = advertiserIdCandidates[0];

            const knownAdvertiserIds = Array.isArray(platformAny?.metadata?.advertiser_ids)
              ? platformAny.metadata.advertiser_ids.map((x: any) => String(x))
              : [];

            console.log(
              `[push-creatives] TikTok advertiser_id resolution: candidates=${JSON.stringify(advertiserIdCandidates.map(String))} selected=${tiktokAdvertiserId ? String(tiktokAdvertiserId) : 'none'} knownAdvertiserIds=${JSON.stringify(knownAdvertiserIds)}`,
            );

            if (!tiktokAdvertiserId) {
              await supabase
                .from("creative_assignments")
                .update({ status: "error", error_message: "Missing TikTok advertiser ID" })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            const advertiserIdStr = String(tiktokAdvertiserId);

            // Fetch TikTok ad account defaults (landing page URL + default identity)
            // NOTE: advertiser_id and account_id can be the same value; query both defensively.
            const { data: allTiktokAdAccountRows } = await supabase
              .from("tiktok_ad_accounts")
              .select("default_landing_page_url, default_identity_id, synced_at, advertiser_id, account_id")
              .eq("user_id", campaign.user_id)
              .or(`advertiser_id.eq.${advertiserIdStr},account_id.eq.${advertiserIdStr}`)
              .order("synced_at", { ascending: false });

            const tiktokAdAccountDefaults =
              allTiktokAdAccountRows?.find(
                (row: any) => row.default_landing_page_url || row.default_identity_id,
              ) ||
              allTiktokAdAccountRows?.[0] ||
              null;

            const isVideo = creative.media_type === "video" || creative.creative_type === "video";
            
            // ========== TikTok Auto-Upload Logic ==========
            // Check if creative needs to be uploaded to TikTok first
            // IMPORTANT: TikTok assets are advertiser-scoped - we must verify the asset belongs to this advertiser
            let hasTikTokAsset = isVideo ? !!creative.platform_video_id : !!creative.platform_image_hash;
            
            // Check if the asset was uploaded to a DIFFERENT advertiser - if so, we need to re-upload
            if (hasTikTokAsset) {
              // Get the full creative to check tiktok_asset_advertiser_id
              const { data: fullCreativeCheck } = await supabase
                .from("creatives")
                .select("tiktok_asset_advertiser_id")
                .eq("id", creative.id)
                .single();
              
              const assetAdvertiserId = fullCreativeCheck?.tiktok_asset_advertiser_id;
              
              if (assetAdvertiserId && String(assetAdvertiserId) !== advertiserIdStr) {
                console.log(`[push-creatives] ⚠️ TikTok asset was uploaded to advertiser ${assetAdvertiserId} but we need it on ${advertiserIdStr}. Clearing asset to trigger re-upload.`);
                
                // Clear the asset so it gets re-uploaded to the correct advertiser
                await supabase
                  .from("creatives")
                  .update({ 
                    platform_video_id: null, 
                    platform_image_hash: null, 
                    tiktok_asset_advertiser_id: null,
                    dsp_upload_status: null 
                  })
                  .eq("id", creative.id);
                
                creative.platform_video_id = null;
                creative.platform_image_hash = null;
                hasTikTokAsset = false;
              }
            }
            
            // If the creative was created from a synced platform asset, we may already have a TikTok material id stored
            if (!hasTikTokAsset) {
              const { data: metaCreative, error: metaCreativeError } = await supabase
                .from("creatives")
                .select("platform_metadata")
                .eq("id", creative.id)
                .maybeSingle();

              if (!metaCreativeError) {
                const meta: any = (metaCreative as any)?.platform_metadata || null;
                const platformAssetId = meta?.platform_asset_id;
                const platformAssetAdvertiserId = meta?.advertiser_id;

                if (
                  platformAssetId &&
                  (!platformAssetAdvertiserId || String(platformAssetAdvertiserId) === advertiserIdStr)
                ) {
                  // Detect if the platform asset is a video based on TikTok ID format
                  // TikTok video IDs typically start with 'v' followed by digits
                  // Image IDs are numeric or have different patterns
                  const assetIdStr = String(platformAssetId);
                  const looksLikeVideoId = /^v\d+/.test(assetIdStr);
                  const effectiveIsVideo = isVideo || looksLikeVideoId;
                  
                  console.log(
                    `[push-creatives] ✅ Using existing TikTok platform_asset_id from creative.platform_metadata (asset_id=${assetIdStr}, isVideo=${isVideo}, looksLikeVideoId=${looksLikeVideoId}, effectiveIsVideo=${effectiveIsVideo})`,
                  );

                  const updatePatch = effectiveIsVideo
                    ? { platform_video_id: assetIdStr }
                    : { platform_image_hash: assetIdStr };

                  await supabase
                    .from("creatives")
                    .update({
                      ...updatePatch,
                      tiktok_asset_advertiser_id: advertiserIdStr,
                      dsp_upload_status: "uploaded",
                      dsp_uploaded_at: new Date().toISOString(),
                    })
                    .eq("id", creative.id);

                  if (effectiveIsVideo) {
                    creative.platform_video_id = assetIdStr;
                  } else {
                    creative.platform_image_hash = assetIdStr;
                  }
                  hasTikTokAsset = true;
                }
              }
            }
            
            if (!hasTikTokAsset) {
              console.log(`[push-creatives] TikTok creative ${creative.id} missing platform asset (isVideo=${isVideo}), attempting auto-upload via URL`);
              
              // Get media URL from creative
              const { data: fullCreative, error: creativeError } = await supabase
                .from("creatives")
                .select("media_urls, media_type, creative_type, original_filename")
                .eq("id", creative.id)
                .single();
              
              if (creativeError || !fullCreative?.media_urls?.[0]) {
                console.error(`[push-creatives] Cannot auto-upload TikTok creative: no media URL for creative ${creative.id}`);
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
              
              const mediaUrl = fullCreative.media_urls[0];
              
              // Enhanced video detection: check media_type, creative_type, URL patterns
              // TikTok CDN URLs may contain /video/ in path without file extension
              const urlLower = mediaUrl.toLowerCase();
              const hasVideoExtension = urlLower.match(/\.(mp4|mov|avi|wmv|flv|webm|m4v)(\?|$)/);
              const hasVideoInPath = urlLower.includes('/video/') || urlLower.includes('mime_type=video');
              const isVideoFile = fullCreative.media_type === "video" || 
                                  fullCreative.creative_type === "video" ||
                                  hasVideoExtension ||
                                  hasVideoInPath;
              
              // Add unique suffix to filename to avoid TikTok "Duplicated material name" error
              const baseFileName = fullCreative.original_filename || mediaUrl.split('/').pop()?.split('?')[0] || (isVideoFile ? 'video.mp4' : 'image.jpg');
              const uniqueSuffix = `_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
              const fileExt = baseFileName.includes('.') ? '.' + baseFileName.split('.').pop() : (isVideoFile ? '.mp4' : '.jpg');
              const fileNameWithoutExt = baseFileName.includes('.') ? baseFileName.substring(0, baseFileName.lastIndexOf('.')) : baseFileName;
              const fileName = `${fileNameWithoutExt}${uniqueSuffix}${fileExt}`;
              
              console.log(`[push-creatives] TikTok auto-upload via URL: mediaUrl=${mediaUrl}, isVideoFile=${isVideoFile}, mediaType=${fullCreative.media_type}, creativeType=${fullCreative.creative_type}, hasVideoInPath=${hasVideoInPath}, fileName=${fileName}`);
              
              try {
                if (isVideoFile) {
                  // Upload video to TikTok using URL method (no memory overhead)
                  console.log(`[push-creatives] Uploading video to TikTok via URL for advertiser ${advertiserIdStr}...`);
                  
                  const tiktokUploadUrl = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/";
                  
                  const uploadResponse = await fetch(tiktokUploadUrl, {
                    method: "POST",
                    headers: {
                      "Access-Token": platform.access_token,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      advertiser_id: advertiserIdStr,
                      upload_type: "UPLOAD_BY_URL",
                      video_url: mediaUrl,
                      file_name: fileName,
                    }),
                  });
                  
                  const uploadResult = await uploadResponse.json();
                  console.log(`[push-creatives] TikTok video URL upload response:`, JSON.stringify(uploadResult));
                  
                  if (uploadResult.code !== 0) {
                    throw new Error(`TikTok video upload failed: ${uploadResult.message || "Unknown error"} (code: ${uploadResult.code})`);
                  }
                  
                  // TikTok URL upload returns data as array with material_id
                  const uploadData = Array.isArray(uploadResult.data) ? uploadResult.data[0] : uploadResult.data;
                  const videoId = uploadData?.material_id || uploadData?.video_id;
                  if (!videoId) {
                    console.error(`[push-creatives] TikTok response structure:`, JSON.stringify(uploadResult.data));
                    throw new Error("TikTok video upload succeeded but no video_id/material_id returned");
                  }
                  
                  console.log(`[push-creatives] TikTok video upload initiated. video_id=${videoId}. Polling for processing status...`);
                  
                  // Poll TikTok video info API to wait for video to be ready
                  // URL-based uploads are asynchronous - the video needs time to process
                  const videoInfoUrl = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/";
                  const maxPollingAttempts = 30; // Max 30 attempts (1 minute total with 2s intervals)
                  const pollingIntervalMs = 2000; // 2 seconds between polls
                  
                  let videoReady = false;
                  let pollAttempt = 0;
                  
                  while (!videoReady && pollAttempt < maxPollingAttempts) {
                    pollAttempt++;
                    
                    // Wait before polling (except first attempt)
                    if (pollAttempt > 1) {
                      await new Promise(resolve => setTimeout(resolve, pollingIntervalMs));
                    }
                    
                    try {
                      const infoResponse = await fetch(`${videoInfoUrl}?advertiser_id=${advertiserIdStr}&video_ids=["${videoId}"]`, {
                        method: "GET",
                        headers: {
                          "Access-Token": platform.access_token,
                        },
                      });
                      
                      const infoResult = await infoResponse.json();
                      console.log(`[push-creatives] TikTok video info poll #${pollAttempt}:`, JSON.stringify(infoResult));
                      
                      if (infoResult.code === 0 && infoResult.data?.list?.length > 0) {
                        const videoInfo = infoResult.data.list[0];
                        // Video is ready when we get valid video info back
                        // TikTok returns video details when processing is complete
                        if (videoInfo.video_id || videoInfo.material_id) {
                          videoReady = true;
                          console.log(`[push-creatives] ✅ TikTok video is ready for use. video_id=${videoId}`);
                        }
                      } else if (infoResult.code === 40053) {
                        // Video still processing, continue polling
                        console.log(`[push-creatives] TikTok video still processing (attempt ${pollAttempt}/${maxPollingAttempts})...`);
                      } else {
                        console.log(`[push-creatives] TikTok video info unexpected response (attempt ${pollAttempt}/${maxPollingAttempts}): code=${infoResult.code}`);
                      }
                    } catch (pollError) {
                      console.error(`[push-creatives] TikTok video info poll error:`, pollError);
                    }
                  }
                  
                  if (!videoReady) {
                    console.log(`[push-creatives] TikTok video processing timeout after ${pollAttempt} attempts. Proceeding anyway - video may still become available.`);
                  }
                  
                  // Update creative with TikTok video ID and track which advertiser it belongs to
                  await supabase
                    .from("creatives")
                    .update({ 
                      platform_video_id: videoId,
                      tiktok_asset_advertiser_id: advertiserIdStr,
                      dsp_upload_status: "uploaded",
                      dsp_uploaded_at: new Date().toISOString()
                    })
                    .eq("id", creative.id);
                  
                  creative.platform_video_id = videoId;
                  hasTikTokAsset = true;
                  console.log(`[push-creatives] ✅ TikTok video uploaded via URL. video_id=${videoId}`);
                  
                } else {
                  // Upload image to TikTok using URL method (no memory overhead)
                  console.log(`[push-creatives] Uploading image to TikTok via URL for advertiser ${advertiserIdStr}...`);
                  
                  const tiktokUploadUrl = "https://business-api.tiktok.com/open_api/v1.3/file/image/ad/upload/";
                  
                  const uploadResponse = await fetch(tiktokUploadUrl, {
                    method: "POST",
                    headers: {
                      "Access-Token": platform.access_token,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      advertiser_id: advertiserIdStr,
                      upload_type: "UPLOAD_BY_URL",
                      image_url: mediaUrl,
                      file_name: fileName,
                    }),
                  });
                  
                  const uploadResult = await uploadResponse.json();
                  console.log(`[push-creatives] TikTok image URL upload response:`, JSON.stringify(uploadResult));
                  
                  if (uploadResult.code !== 0) {
                    throw new Error(`TikTok image upload failed: ${uploadResult.message || "Unknown error"} (code: ${uploadResult.code})`);
                  }
                  
                  // TikTok URL upload returns data as array with material_id
                  const uploadData = Array.isArray(uploadResult.data) ? uploadResult.data[0] : uploadResult.data;
                  const imageId = uploadData?.material_id || uploadData?.id || uploadData?.image_id;
                  if (!imageId) {
                    console.error(`[push-creatives] TikTok image response structure:`, JSON.stringify(uploadResult.data));
                    throw new Error("TikTok image upload succeeded but no image id returned");
                  }
                  
                  // Update creative with TikTok image ID and track which advertiser it belongs to
                  await supabase
                    .from("creatives")
                    .update({ 
                      platform_image_hash: imageId,
                      tiktok_asset_advertiser_id: advertiserIdStr,
                      dsp_upload_status: "uploaded",
                      dsp_uploaded_at: new Date().toISOString()
                    })
                    .eq("id", creative.id);
                  
                  creative.platform_image_hash = imageId;
                  hasTikTokAsset = true;
                  console.log(`[push-creatives] ✅ TikTok image uploaded via URL. image_id=${imageId}`);
                }
                
              } catch (uploadError) {
                console.error(`[push-creatives] TikTok auto-upload failed:`, uploadError);
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: `Auto-upload to TikTok failed: ${(uploadError as any).message}`,
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }
            }
            
            // Verify we have an asset after potential auto-upload
            if (!hasTikTokAsset) {
              console.error(`[push-creatives] TikTok creative ${creative.id} still missing platform asset after upload attempt`);
              await supabase
                .from("creative_assignments")
                .update({
                  status: "error",
                  error_message: isVideo 
                    ? "Video not uploaded to TikTok - platform_video_id is missing" 
                    : "Image not uploaded to TikTok - platform_image_hash is missing",
                })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }
            // ========== End TikTok Auto-Upload Logic ==========

            // Resolve identity ID (creative override > phase/market config > ad account defaults > latest synced identity)
            // Track the source so we know whether to trust it without validation
            let identityId: string | null = null;
            let identitySource: 'creative' | 'phase' | 'market' | 'ad_account_defaults' | 'auto_lookup' | null = null;
            
            if (creative.tiktok_identity_id) {
              identityId = creative.tiktok_identity_id;
              identitySource = 'creative';
            } else if ((phase as any)?.tiktokIdentityId) {
              identityId = (phase as any).tiktokIdentityId;
              identitySource = 'phase';
            } else if ((market as any)?.tiktokIdentityId) {
              identityId = (market as any).tiktokIdentityId;
              identitySource = 'market';
            } else if (tiktokAdAccountDefaults?.default_identity_id) {
              identityId = tiktokAdAccountDefaults.default_identity_id;
              identitySource = 'ad_account_defaults';
            }

            if (!identityId) {
              const { data: latestIdentity } = await supabase
                .from("tiktok_identities")
                .select("identity_id")
                .eq("user_id", campaign.user_id)
                .eq("advertiser_id", advertiserIdStr)
                .order("synced_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              identityId = latestIdentity?.identity_id || null;
              if (identityId) identitySource = 'auto_lookup';
            }
            
            console.log(`[push-creatives] TikTok identity resolution: identityId=${identityId}, source=${identitySource}`);

            // ========== IDENTITY VALIDATION STRATEGY ==========
            // If identity comes from user selection (creative, phase, market, ad_account_defaults),
            // we TRUST it without API validation. The /identity/list endpoint often returns empty
            // for BC-linked identities even when they're valid for ad creation.
            // 
            // TikTok Business Center hierarchy:
            // - Identities belong to the BC
            // - Identities are linked to specific Ad Accounts under "Ad delivery assets"
            // - The /identity/list endpoint may not show BC-managed identities
            // 
            // Only do API validation for auto_lookup identities (where we're guessing).
            
            let identityValidForApi = false;
            const userSelectedIdentity = ['creative', 'phase', 'market', 'ad_account_defaults'].includes(identitySource || '');
            
            if (identityId && userSelectedIdentity) {
              // User explicitly selected this identity - trust it
              identityValidForApi = true;
              console.log(`[push-creatives] ✅ Identity ${identityId} from user selection (${identitySource}) - trusting without API validation`);
            } else if (identityId) {
              // Auto-lookup identity - validate via API
              try {
                const identityListUrl = `https://business-api.tiktok.com/open_api/v1.3/identity/list/?advertiser_id=${advertiserIdStr}`;
                console.log(`[push-creatives] TikTok identity preflight check (auto-lookup): GET ${identityListUrl}`);
                
                const identityListResponse = await fetch(identityListUrl, {
                  method: "GET",
                  headers: {
                    "Access-Token": platform.access_token,
                  },
                });
                
                const identityListResult = await identityListResponse.json();
                console.log(`[push-creatives] TikTok identity/list response:`, JSON.stringify(identityListResult));
                
                if (identityListResult.code === 0 && identityListResult.data?.list) {
                  const validIdentitiesFromApi = identityListResult.data.list;
                  identityValidForApi = validIdentitiesFromApi.some(
                    (id: any) => String(id.identity_id) === String(identityId)
                  );
                  console.log(`[push-creatives] Identity ${identityId} valid for API: ${identityValidForApi} (found ${validIdentitiesFromApi.length} valid identities)`);
                } else {
                  console.log(`[push-creatives] TikTok identity/list failed or empty: code=${identityListResult.code}, message=${identityListResult.message}`);
                  // For auto-lookup, if API returns empty, still try the identity (it might work)
                  identityValidForApi = true;
                  console.log(`[push-creatives] Proceeding with auto-lookup identity despite empty API response`);
                }
              } catch (identityCheckError) {
                console.error(`[push-creatives] TikTok identity preflight check error:`, identityCheckError);
                // Continue anyway - we'll let the ad/create call fail if identity is invalid
                identityValidForApi = true;
              }
            }

            // ========== IDENTITY HANDLING FOR TIKTOK ==========
            // DARK ADS (Non-Spark): identity_type = CUSTOMIZED_USER, identity_id = advertiser_id
            // SPARK ADS: identity_type = TIKTOK_ACCOUNT, identity_id = tiktok_account_id
            //
            // For dark ads, we simply use the advertiser_id as identity_id.
            // For spark ads, we need a real TikTok account identity.
            
            // Keep track of the TikTok account identity (for Spark Ads)
            let tiktokAccountIdentityId = identityId;
            
            if (tiktokAccountIdentityId) {
              // Validate identity is NOT the advertiser_id for Spark Ads
              if (tiktokAccountIdentityId === advertiserIdStr) {
                console.log(`[push-creatives] ℹ️ identity_id equals advertiser_id - valid for CUSTOMIZED_USER, not for TIKTOK_ACCOUNT`);
                tiktokAccountIdentityId = null; // Not usable for Spark Ads
              } else {
                console.log(`[push-creatives] ✅ TikTok account identity found: ${tiktokAccountIdentityId} (source: ${identitySource})`);
              }
            }

            // ========== TikTok Identity Type Strategy ==========
            // CRITICAL INSIGHT: TikTok has TWO modes for ad creation:
            //
            // 1. NON-SPARK ADS (Dark Ads) - RECOMMENDED FOR SAAS AUTOMATION
            //    - Use identity_type: "CUSTOMIZED_USER" 
            //    - Works with BOTH images AND videos
            //    - No BC identity dependency
            //    - No Spark complexity
            //    - This is how Smartly, Revealbot, etc. do it
            //
            // 2. SPARK ADS (Creator Ads)
            //    - Use identity_type: "TIKTOK_ACCOUNT" + spark_ad: true + post_id
            //    - ONLY works with videos (images NOT supported)
            //    - Requires actual TikTok post (not just uploaded video)
            //    - Used for boosting organic content
            //
            // The error 40700 happens when you use TIKTOK_ACCOUNT for non-Spark ads
            // because TikTok interprets it as a Spark Ad request.

            const { data: identityRow } = await supabase
              .from("tiktok_identities")
              .select("identity_type, bc_id, display_name, profile_image")
              .eq("user_id", campaign.user_id)
              .eq("advertiser_id", advertiserIdStr)
              .eq("identity_id", String(identityId))
              .maybeSingle();

            // Enhanced identity logging
            console.log(
              `[push-creatives] TikTok identity lookup result for identity_id=${identityId}:`,
              JSON.stringify(identityRow),
            );

            // bc_id can still be useful for debugging, but MUST NOT be sent to /ad/create.
            const bcIdFromPlatform = (platform as any)?.metadata?.accounts?.find(
              (acc: any) => String(acc.advertiser_id) === advertiserIdStr,
            )?.bc_id;

            const identityBcId =
              identityRow?.bc_id ? String(identityRow.bc_id)
              : bcIdFromPlatform ? String(bcIdFromPlatform)
              : null;

            // Determine if this is a Spark Ad or Dark Ad
            // Spark Ads require: is_spark_ad flag OR external_post_id set
            const isSparkAd = !!(creative.tiktok_ad_format === "SPARK_ADS" || 
                                creative.external_post_id || 
                                (creative as any).spark_ad);
            
            // ========== TOKEN CONTEXT VALIDATION ==========
            // CRITICAL: TikTok has two execution modes:
            // 1. ADVERTISER-context tokens: Work for Dark Ads (CUSTOMIZED_USER)
            // 2. USER-context tokens: Only work for Spark Ads (TIKTOK_ACCOUNT)
            //
            // If token is USER-context and we're trying Dark Ads, it will fail
            // with misleading errors like "You no longer have access to the TikTok account"
            const tokenContext = (platform as any)?.metadata?.token_context;
            
            if (!isSparkAd && tokenContext === "USER") {
              console.error(`[push-creatives] ❌ TOKEN CONTEXT MISMATCH: Dark Ads require ADVERTISER-context token, but current token is USER-context`);
              console.error(`[push-creatives] This token was authenticated via a TikTok user account, not Business Center admin.`);
              console.error(`[push-creatives] To fix: Re-authenticate from Business Center as BC admin, not via TikTok app.`);
              
              await supabase
                .from("creative_assignments")
                .update({
                  status: "error",
                  error_message: "Dark Ads require ADVERTISER-context token. Your current TikTok connection was authenticated via a TikTok user account. Please re-connect from TikTok Business Center (not TikTok app) as a Business Center admin to enable Dark Ads.",
                })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }
            
            if (isSparkAd && tokenContext === "ADVERTISER") {
              console.log(`[push-creatives] ⚠️ Token is ADVERTISER-context for Spark Ad - this may fail if TikTok account is not accessible`);
              // Don't block - Spark Ads might still work with advertiser tokens in some cases
            }
            
            // ========== IDENTITY TYPE + IDENTITY ID RESOLUTION ==========
            // DARK ADS: identity_type = CUSTOMIZED_USER, identity_id = advertiser_id
            // SPARK ADS: identity_type = TIKTOK_ACCOUNT, identity_id = tiktok_account_id
            let identityType: string;
            let finalIdentityId: string;
            
            if (isSparkAd) {
              // Spark Ads: TIKTOK_ACCOUNT identity required with real TikTok account
              identityType = "TIKTOK_ACCOUNT";
              
              // Spark Ads require a real TikTok account identity (not advertiser_id)
              if (!tiktokAccountIdentityId) {
                console.error(`[push-creatives] ❌ Spark Ads require a TikTok account identity`);
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: "Spark Ads require a TikTok account identity. Please configure an identity in the ad account settings.",
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }
              
              finalIdentityId = tiktokAccountIdentityId;
              
              // Spark Ads require video only, no images
              if (!creative.platform_video_id) {
                console.error(`[push-creatives] ❌ Spark Ads require video content, not images`);
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: "Spark Ads only support video content. Images cannot be used for Spark Ads.",
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }
              
              // Spark Ads require post_id
              if (!creative.external_post_id) {
                console.error(`[push-creatives] ❌ Spark Ads require a post_id`);
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: "Spark Ads require a TikTok post ID (post_id). Please set external_post_id on the creative.",
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }
              
              console.log(`[push-creatives] Spark Ad - identity_type=TIKTOK_ACCOUNT, identity_id=${finalIdentityId}`);
            } else {
              // Dark Ads: CUSTOMIZED_USER with advertiser_id as identity_id
              identityType = "CUSTOMIZED_USER";
              finalIdentityId = advertiserIdStr;
              console.log(`[push-creatives] Dark Ad - identity_type=CUSTOMIZED_USER, identity_id=${finalIdentityId} (advertiser_id)`);
            }

            console.log(
              `[push-creatives] TikTok identity resolution: finalIdentityId=${finalIdentityId}, identityType=${identityType}, isSparkAd=${isSparkAd}, bcId=${identityBcId || "none"}`,
            );

            // Resolve destination URL (assignment > creative > phase/market config > ad account defaults)
            let tiktokDestinationUrl: string | null =
              resolvedText.destinationUrl ||
              creative.destination_url ||
              (phase as any)?.landingPageUrl ||
              (market as any)?.landingPageUrl ||
              tiktokAdAccountDefaults?.default_landing_page_url ||
              null;

            console.log(
              `[push-creatives] TikTok destination URL resolution: assignment=${resolvedText.destinationUrl}, creative=${creative.destination_url}, phase=${(phase as any)?.landingPageUrl}, market=${(market as any)?.landingPageUrl}, adAccountDefaults=${tiktokAdAccountDefaults?.default_landing_page_url}, final=${tiktokDestinationUrl}`,
            );

            if (tiktokDestinationUrl && !tiktokDestinationUrl.startsWith("http://") && !tiktokDestinationUrl.startsWith("https://")) {
              tiktokDestinationUrl = `https://${tiktokDestinationUrl}`;
            }

            if (!tiktokDestinationUrl) {
              await supabase
                .from("creative_assignments")
                .update({
                  status: "error",
                  error_message:
                    "Video ads require a destination URL. Set it on the assignment, creative, or in ad account defaults",
                })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }

            // Build TikTok destination URL with optional URL parameters
            if (resolvedText.urlParameters) {
              const separator = tiktokDestinationUrl.includes("?") ? "&" : "?";
              tiktokDestinationUrl = `${tiktokDestinationUrl}${separator}${resolvedText.urlParameters}`;
            }

            // Determine effective video status: trust platform_video_id if present, then fall back to isVideo flag
            // This handles cases where media_type wasn't set but the asset ID clearly indicates video
            const hasVideoAsset = !!creative.platform_video_id;
            const effectiveIsVideo = hasVideoAsset || isVideo;
            
            const tiktokAdPayload: any = {
                advertiser_id: advertiserIdStr,
              adgroup_id: entry.dsp_entity_id,
              creatives: [
                {
                  ad_name: creative.name,
                  // DARK ADS: identity_type=CUSTOMIZED_USER, identity_id=advertiser_id
                  // SPARK ADS: identity_type=TIKTOK_ACCOUNT, identity_id=tiktok_account_id
                  identity_type: identityType,
                  identity_id: finalIdentityId,
                  ad_text: resolvedText.primaryText || creative.name,
                  call_to_action: resolvedText.callToAction || "LEARN_MORE",
                  landing_page_url: tiktokDestinationUrl,
                  ad_format: creative.tiktok_ad_format || (effectiveIsVideo ? "SINGLE_VIDEO" : "SINGLE_IMAGE"),
                },
              ],
            };
            
            // For Spark Ads, add spark-specific fields
            if (isSparkAd) {
              tiktokAdPayload.creatives[0].spark_ad = true;
              if (creative.external_post_id) {
                tiktokAdPayload.creatives[0].post_id = creative.external_post_id;
              }
            }

            // For BC-linked identity types, TikTok requires additional BC fields on the creative.
            // We set those fields per-attempt inside the identity_type fallback loop below (so each attempt has a clean payload).

            // Add video_id or image_ids based on creative type
            // Check platform_video_id first - if it exists, this IS a video regardless of isVideo flag
            if (creative.platform_video_id) {
              tiktokAdPayload.creatives[0].video_id = creative.platform_video_id;
              console.log(`[push-creatives] TikTok ad payload includes video_id=${creative.platform_video_id} (effectiveIsVideo=${effectiveIsVideo})`);
              if (creative.platform_thumbnail_id) {
                tiktokAdPayload.creatives[0].image_ids = [creative.platform_thumbnail_id];
                console.log(`[push-creatives] TikTok ad payload includes thumbnail image_id=${creative.platform_thumbnail_id}`);
              }
            } else if (creative.platform_image_hash) {
              // Verify image is accessible before ad creation
              const imageInfoUrl = `https://business-api.tiktok.com/open_api/v1.3/file/image/ad/info/?advertiser_id=${advertiserIdStr}&image_ids=["${creative.platform_image_hash}"]`;
              console.log(`[push-creatives] Verifying TikTok image access: ${imageInfoUrl}`);
              
              try {
                const imageInfoResponse = await fetch(imageInfoUrl, {
                  method: "GET",
                  headers: { "Access-Token": platform.access_token },
                });
                const imageInfoResult = await imageInfoResponse.json();
                console.log(`[push-creatives] TikTok image info response:`, JSON.stringify(imageInfoResult));
                
                if (imageInfoResult.code !== 0 || !imageInfoResult.data?.list?.length) {
                  console.error(`[push-creatives] ⚠️ Image ${creative.platform_image_hash} not accessible via API. Error: ${imageInfoResult.message || 'Not found'}`);
                  // Image may have been uploaded via UI or different account - clear it and trigger re-upload
                  await supabase
                    .from("creative_assignments")
                    .update({
                      status: "error",
                      error_message: `TikTok image not accessible (may need re-upload): ${imageInfoResult.message || 'Image not found in account'}`,
                    })
                    .eq("id", assignment.id);
                  
                  // Clear the invalid image hash to force re-upload on next attempt
                  await supabase
                    .from("creatives")
                    .update({ platform_image_hash: null, dsp_upload_status: null })
                    .eq("id", creative.id);
                  
                  localFailed++;
                  continue;
                }
                
                console.log(`[push-creatives] ✅ TikTok image verified accessible`);
              } catch (imageVerifyError) {
                console.error(`[push-creatives] Image verification error (proceeding anyway):`, imageVerifyError);
              }
              
              tiktokAdPayload.creatives[0].image_ids = [creative.platform_image_hash];
              console.log(`[push-creatives] TikTok ad payload includes image_id=${creative.platform_image_hash}`);
            } else {
              // This shouldn't happen due to hasTikTokAsset check above, but log it anyway
              console.error(`[push-creatives] WARNING: TikTok ad payload missing media asset! isVideo=${isVideo}, platform_video_id=${creative.platform_video_id}, platform_image_hash=${creative.platform_image_hash}`);
            }

            if (resolvedText.displayName || resolvedText.brandName) {
              tiktokAdPayload.creatives[0].display_name = resolvedText.displayName || resolvedText.brandName;
            }

            if (creative.app_link) {
              tiktokAdPayload.creatives[0].download_url = creative.app_link;
            }

            // ========== AD CREATION STRATEGY ==========
            // For Dark Ads: Use CUSTOMIZED_USER (no identity_id required)
            // For Spark Ads: Use TIKTOK_ACCOUNT with identity_id
            // This is the standard approach used by major SaaS platforms.

            const tiktokAdCreateUrlV13 = "https://business-api.tiktok.com/open_api/v1.3/ad/create/";
            const tiktokAdCreateUrlV12 = "https://business-api.tiktok.com/open_api/v1.2/ad/create/";
            
            console.log(`[push-creatives] TikTok ad/create: identityType=${identityType}, isSparkAd=${isSparkAd}`);

            let adId: string | null = null;
            let lastTikTokResponse: any = null;

            // Base payload clone so our attempts don't leak state across retries
            const basePayload = JSON.parse(JSON.stringify(tiktokAdPayload));
            
            // Display name for the ad (required for CUSTOMIZED_USER)
            const displayNameForAd = 
              resolvedText.displayName ||
              resolvedText.brandName ||
              creative.brand_name ||
              creative.tiktok_display_name ||
              identityRow?.display_name ||
              campaign.name ||
              creative.name;

            // ========== SINGLE ATTEMPT with correct identity type ==========
            const payload = JSON.parse(JSON.stringify(basePayload));
            
            // Identity already correctly set in basePayload:
            // DARK ADS: identity_type=CUSTOMIZED_USER, identity_id=advertiser_id
            // SPARK ADS: identity_type=TIKTOK_ACCOUNT, identity_id=tiktok_account_id

            // Ensure we NEVER send Business Center authorization fields to /ad/create.
            delete payload.creatives[0].bc_id;
            delete payload.creatives[0].identity_authorized_bc_id;
            
            // Set display_name (required for CUSTOMIZED_USER)
            if (displayNameForAd) {
              payload.creatives[0].display_name = displayNameForAd;
            }

            console.log(`[push-creatives] TikTok ad/create (v1.3) identity_type=${payload.creatives[0].identity_type}`);
            console.log(`[push-creatives] TikTok ad/create FULL REQUEST URL: ${tiktokAdCreateUrlV13}`);
            console.log(`[push-creatives] TikTok ad/create FULL REQUEST PAYLOAD: ${JSON.stringify(payload, null, 2)}`);

            const tiktokAdResponse = await fetch(tiktokAdCreateUrlV13, {
              method: "POST",
              headers: {
                "Access-Token": platform.access_token,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
            });

            const tiktokAdData = await tiktokAdResponse.json();
            lastTikTokResponse = tiktokAdData;

            adId = tiktokAdData?.data?.ad_ids?.[0] ? String(tiktokAdData.data.ad_ids[0]) : null;
            if (tiktokAdData?.code === 0 && adId) {
              console.log(`[push-creatives] ✅ TikTok Ad created successfully with identity_type=${identityType} ad_id=${adId}`);
            } else {
              const msg = String(tiktokAdData?.message || "");
              console.log(
                `[push-creatives] TikTok ad/create (v1.3) failed identity_type=${identityType} code=${tiktokAdData?.code} message=${msg}`,
              );

              // ========== FALLBACK: Try v1.2 API if v1.3 failed ==========
              console.log(`[push-creatives] v1.3 failed, trying v1.2 API with identity_type=${identityType}`);
              
              const payloadV12 = JSON.parse(JSON.stringify(basePayload));
              
              // Identity already correctly set in basePayload - no changes needed
              
              // Add display name
              if (displayNameForAd) {
                payloadV12.creatives[0].display_name = displayNameForAd;
              }

              // Ensure we NEVER send Business Center authorization fields to /ad/create.
              delete payloadV12.creatives[0].bc_id;
              delete payloadV12.creatives[0].identity_authorized_bc_id;

              console.log(`[push-creatives] TikTok ad/create (v1.2) identity_type=${payloadV12.creatives[0].identity_type}`);

              const tiktokAdResponseV12 = await fetch(tiktokAdCreateUrlV12, {
                method: "POST",
                headers: {
                  "Access-Token": platform.access_token,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(payloadV12),
              });

              const tiktokAdDataV12 = await tiktokAdResponseV12.json();
              lastTikTokResponse = tiktokAdDataV12;
              adId = tiktokAdDataV12?.data?.ad_ids?.[0] ? String(tiktokAdDataV12.data.ad_ids[0]) : null;

              if (tiktokAdDataV12?.code === 0 && adId) {
                console.log(`[push-creatives] ✅ TikTok ad/create (v1.2) succeeded identity_type=${identityType} ad_id=${adId}`);
              } else {
                const msgV12 = String(tiktokAdDataV12?.message || "");
                console.log(
                  `[push-creatives] TikTok ad/create (v1.2) failed identity_type=${identityType} code=${tiktokAdDataV12?.code} message=${msgV12}`,
                );
              }
            }

            if (!adId) {
              const msg = String(lastTikTokResponse?.message || "Failed to create TikTok ad");
              const errorCode = lastTikTokResponse?.code;
              
              // Provide actionable error messages based on error code
              let actionableError = msg;
              if (errorCode === 40700 || errorCode === 40002) {
                actionableError = `Identity authorization failed (code ${errorCode}). The identity "${identityId}" may not be properly linked to this ad account. Please verify in TikTok Business Center that this identity is assigned under "Ad delivery assets" for this advertiser.`;
              }
              
              console.error(`[push-creatives] ❌ All ad creation attempts failed for identity ${finalIdentityId}: ${msg}`);
              
              await supabase
                .from("creative_assignments")
                .update({
                  status: "error",
                  error_message: actionableError,
                })
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
