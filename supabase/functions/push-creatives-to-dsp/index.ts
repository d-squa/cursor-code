import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getAccessToken } from "../_shared/vault-helper.ts";
import { createApiLogger } from "../_shared/api-logger.ts";

const FUNCTION_NAME = "push-creatives-to-dsp";
const logger = createApiLogger(FUNCTION_NAME);

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

// Normalize/validate URLs coming from campaign JSON / user inputs.
// - Treat empty strings as null
// - Accept protocol in any casing (e.g. "Https://") and normalize to lowercase
// - Add https:// if missing
function normalizeHttpUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  const normalizedProtocol = raw.replace(/^https?:\/\//i, (m) => m.toLowerCase());
  if (/^https?:\/\//i.test(normalizedProtocol)) return normalizedProtocol;
  return `https://${raw}`;
}

/**
 * Build Meta creative_features_spec from Advantage+ feature flags.
 * This explicitly tells Meta which enhancements to enable/disable,
 * preventing account-level defaults from being silently auto-applied.
 */
function buildMetaCreativeFeaturesSpec(features: {
  videoTouchups: boolean;
  textImprovements: boolean;
  productTags: boolean;
  videoEffects: boolean;
  relevantComments: boolean;
  enhanceCta: boolean;
  revealDetails: boolean;
  showSpotlights: boolean;
  optimizeTextPerPerson: boolean;
  sitelinks: boolean;
  products: boolean;
}): Record<string, any> {
  const opt = (flag: boolean) => flag ? "OPT_IN" : "OPT_OUT";

  return {
    creative_features_spec: {
      standard_enhancements: {
        enroll_status: (features.videoTouchups || features.videoEffects || features.textImprovements || features.enhanceCta) ? "OPT_IN" : "OPT_OUT",
      },
    },
    degrees_of_freedom_spec: {
      creative_features_spec: {
        standard_enhancements: {
          enroll_status: (features.videoTouchups || features.videoEffects || features.textImprovements || features.enhanceCta) ? "OPT_IN" : "OPT_OUT",
        },
      },
    },
  };
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
    const platformName = campaignPlatforms.find((p) => p.id === platformId)?.name || String(platformId);
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

function resolveConfiguredMetaPageId(
  creative: { external_page_id?: string | null } | null | undefined,
  phase: any,
  market: any,
): string | null {
  const candidates = [
    creative?.external_page_id,
    phase?.metaPageId,
    market?.metaPageId,
    market?.pageId,
    market?.page,
    market?.defaultPageId,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const normalized = String(candidate).trim();
    if (normalized.length > 0) return normalized;
  }

  return null;
}

function normalizeComparableLabel(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getEffectiveAdSetConfigs(
  campaign: any,
  platformKey: PlatformKey,
  market: any,
  phase: any,
): any[] {
  const genericConfig = campaign?.generic_config || {};
  const targetingPreset = genericConfig.targetingPreset || genericConfig.basicTargeting || {};
  const defaultAdSetsPerPlatform = targetingPreset.defaultAdSetsPerPlatform || genericConfig.defaultAdSetsPerPlatform || {};

  const phaseAdSets = Array.isArray(phase?.adSets) ? phase.adSets : [];
  const marketAdSets = Array.isArray(market?.adSets) ? market.adSets : [];
  const defaultPlatformAdSets = Array.isArray(defaultAdSetsPerPlatform?.[platformKey])
    ? defaultAdSetsPerPlatform[platformKey]
    : [];

  if (phaseAdSets.length > 0) return phaseAdSets;
  if (marketAdSets.length > 0) return marketAdSets;
  return defaultPlatformAdSets;
}

function resolveLaunchAdSetConfig(entryEntityName: string | null | undefined, adSetConfigs: any[]): any | null {
  const normalizedEntryName = normalizeComparableLabel(entryEntityName);
  if (!normalizedEntryName || adSetConfigs.length === 0) return null;

  for (const adSetConfig of adSetConfigs) {
    const configName = normalizeComparableLabel(adSetConfig?.name);
    const configId = normalizeComparableLabel(adSetConfig?.id);

    if (configName && (normalizedEntryName === configName || normalizedEntryName.endsWith(` - ${configName}`) || normalizedEntryName.includes(configName))) {
      return adSetConfig;
    }

    if (configId && normalizedEntryName.includes(configId)) {
      return adSetConfig;
    }
  }

  return null;
}

function assignmentMatchesAdSetConfig(assignment: any, adSetConfig: any): boolean {
  if (!adSetConfig) return true;

  const assignmentAdSetId = normalizeComparableLabel(assignment?.ad_set_id);
  const assignmentAdSetName = normalizeComparableLabel(assignment?.ad_set_name);
  const configId = normalizeComparableLabel(adSetConfig?.id);
  const configName = normalizeComparableLabel(adSetConfig?.name);

  if (configId && assignmentAdSetId === configId) return true;
  if (configName && (assignmentAdSetName === configName || assignmentAdSetName.endsWith(configName))) return true;

  return false;
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
    const requestAuthHeader = req.headers.get("authorization");
    
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
      if (!requestAuthHeader) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const token = requestAuthHeader.replace("Bearer ", "");
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
      .select("id, platform, market, phase_name, entity_name, dsp_entity_id, status")
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
      const resolvedAdSetConfigs = platformKey === "meta"
        ? getEffectiveAdSetConfigs(campaign, platformKey, market, phase)
        : [];
      const resolvedLaunchAdSetConfig = platformKey === "meta"
        ? resolveLaunchAdSetConfig(entry.entity_name, resolvedAdSetConfigs)
        : null;

      if (platformKey === "meta" && entry.entity_name && !resolvedLaunchAdSetConfig && resolvedAdSetConfigs.length > 1) {
        console.warn(`[push-creatives] Could not map launch row "${entry.entity_name}" to a split ad set config`);
      }

      // Query with case-insensitive platform matching using ilike
      // Include dsp_creative_id to detect already-pushed ads and avoid duplicates
      const { data: assignments, error: assignmentError } = await supabase
        .from("creative_assignments")
        .select(
          `
          id,
          creative_id,
          ad_set_id,
          position,
          status,
          dsp_creative_id,
          ad_set_name,
          carousel_group_id,
          carousel_card_headline,
          carousel_card_description,
          carousel_card_website_url,
          carousel_card_cta,
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
             external_post_id, external_page_id, tiktok_identity_id, tiktok_display_name, tiktok_ad_format,
            dsp_upload_status, brand_name, app_link, platform_metadata
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

      const scopedAssignments = platformKey === "meta" && resolvedLaunchAdSetConfig
        ? (assignments || []).filter((assignment: any) => assignmentMatchesAdSetConfig(assignment, resolvedLaunchAdSetConfig))
        : (assignments || []);

      let localPushed = 0;
      let localFailed = 0;
      let targetEntityId = entry.dsp_entity_id;

      // Filter to only pending assignments:
      // - Not already pushed (status !== "pushed")
      // - Not already has a DSP creative ID (prevents duplicates on retry)
      // - Include "pushing" status for retry (these were interrupted mid-push)
      // - Has an associated creative
      const pendingAssignments = scopedAssignments.filter(
        (a: any) => a.status !== "pushed" && !a.dsp_creative_id && (a as any).creative
      );

      console.log(`[push-creatives] Processing ${pendingAssignments.length} pending assignments in batches of ${BATCH_SIZE} (filtered from ${scopedAssignments.length} scoped assignments, excluding ${scopedAssignments.filter((a: any) => a.dsp_creative_id).length} already pushed to DSP)`);

      if (platformKey === "meta" && pendingAssignments.length > 0) {
        const targetAdSetNames = Array.from(
          new Set(
            pendingAssignments
              .map((assignment: any) => String(assignment.ad_set_name || "").trim())
              .filter(Boolean),
          ),
        );

        if (targetAdSetNames.length === 1) {
          const desiredAdSetName = targetAdSetNames[0];
          const { data: phaseCampaignStatus } = await supabase
            .from("campaign_launch_status")
            .select("dsp_entity_id")
            .eq("campaign_id", campaign.id)
            .in("platform", ["Meta", "meta"])
            .eq("market", entry.market)
            .eq("phase_name", entry.phase_name)
            .eq("entity_type", "campaign")
            .not("dsp_entity_id", "is", null)
            .limit(1)
            .maybeSingle();

          if (phaseCampaignStatus?.dsp_entity_id) {
            try {
              const lookupResponse = await fetch(
                `https://graph.facebook.com/v22.0/${phaseCampaignStatus.dsp_entity_id}/adsets?fields=id,name,promoted_object&limit=500&access_token=${platform.access_token}`,
              );
              const lookupData = await lookupResponse.json();

              if (!lookupData.error && Array.isArray(lookupData.data)) {
                const matchedAdSet = lookupData.data.find(
                  (adSet: any) => normalizeComparableLabel(adSet?.name) === normalizeComparableLabel(desiredAdSetName),
                );

                if (matchedAdSet?.id && matchedAdSet.id !== targetEntityId) {
                  console.log(
                    `[push-creatives] Resolved split ad set ${desiredAdSetName} to ${matchedAdSet.id} (replacing ${targetEntityId || "none"})`,
                  );
                  targetEntityId = matchedAdSet.id;

                  await supabase
                    .from("campaign_launch_status")
                    .update({
                      dsp_entity_id: matchedAdSet.id,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", entry.id);
                }
              } else if (lookupData.error) {
                console.warn(`[push-creatives] Failed to resolve Meta ad set by name:`, JSON.stringify(lookupData.error));
              }
            } catch (lookupError) {
              console.warn(`[push-creatives] Meta ad set lookup failed for ${desiredAdSetName}:`, lookupError);
            }
          }
        }
      }

      // ========== PRE-FLIGHT: ENSURE AD SET HAS PROMOTED_OBJECT ==========
      // Meta requires promoted_object on the ad set for most objectives.
      // Ad sets pushed before this fix may lack it. We patch them before creating ads.
      if (platformKey === "meta" && targetEntityId && pendingAssignments.length > 0) {
        try {
          const pfAccessToken = platform.access_token;
          // Read the ad set to check if promoted_object exists
          const adSetCheckUrl = `https://graph.facebook.com/v22.0/${targetEntityId}?fields=promoted_object&access_token=${pfAccessToken}`;
          const adSetCheckResp = await fetch(adSetCheckUrl);
          const adSetCheckData = await adSetCheckResp.json();

          if (!adSetCheckData.promoted_object || Object.keys(adSetCheckData.promoted_object).length === 0) {
            // Resolve page ID for this market/phase
            let patchPageId = resolveConfiguredMetaPageId(null, phase, market);

            if (!patchPageId) {
              // Try ad account defaults
              const patchAdAccountId = (market as any)?.adAccountId || (market as any)?.ad_account_id || platform.ad_account_id;
              if (patchAdAccountId) {
                const rawId = String(patchAdAccountId).replace(/^act_/, "");
                const { data: adAccRows } = await supabase
                  .from("meta_ad_accounts")
                  .select("default_page_id")
                  .or(`account_id.eq.${rawId},account_id.eq.act_${rawId}`)
                  .order("synced_at", { ascending: false })
                  .limit(1);
                patchPageId = adAccRows?.[0]?.default_page_id;
              }
            }

            if (!patchPageId) {
              // Final fallback: latest synced page
              const { data: latestPage } = await supabase
                .from("meta_pages")
                .select("page_id")
                .eq("user_id", campaign.user_id)
                .order("synced_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              patchPageId = latestPage?.page_id;
            }

            let shouldInvalidateAdSet = !patchPageId;

            if (patchPageId) {
              console.log(`[push-creatives] Patching ad set ${targetEntityId} with promoted_object.page_id=${patchPageId}`);
              const patchResp = await fetch(`https://graph.facebook.com/v22.0/${targetEntityId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  promoted_object: { page_id: String(patchPageId) },
                  access_token: pfAccessToken,
                }),
              });
              const patchData = await patchResp.json();
              if (patchData.error) {
                console.warn(`[push-creatives] Failed to patch ad set promoted_object:`, JSON.stringify(patchData.error));
                const patchErrorBlob = JSON.stringify(patchData.error);
                shouldInvalidateAdSet =
                  patchData.error?.error_subcode === 1885090 ||
                  patchData.error?.error_subcode === 1885154 ||
                  /immutable|promoted object is required|required/i.test(patchErrorBlob);
              } else {
                console.log(`[push-creatives] Successfully patched ad set ${targetEntityId} with promoted_object`);
              }
            }

            if (shouldInvalidateAdSet) {
              const rebuildMessage = patchPageId
                ? "This Meta ad set was created without the required promoted object and cannot be updated in place. It has been invalidated; re-push the campaign/phase to recreate it with the selected Facebook page."
                : "This Meta ad set was created without the required promoted object and no Facebook page ID could be resolved. It has been invalidated; set the Facebook page and re-push the campaign/phase.";

              const pendingAssignmentIds = pendingAssignments.map((assignment: any) => assignment.id);
              const rebuildErrorDetails = [{
                message: rebuildMessage,
                type: "stale_meta_adset",
                adset_id: targetEntityId,
                page_id: patchPageId,
                requires_campaign_repush: true,
              }];

              console.warn(`[push-creatives] Invalidating stale ad set ${targetEntityId}: ${rebuildMessage}`);

              await supabase
                .from("campaign_launch_status")
                .update({
                  status: "push_failed",
                  dsp_entity_id: null,
                  error_message: rebuildMessage,
                  error_details: rebuildErrorDetails,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", entry.id);

              if (pendingAssignmentIds.length > 0) {
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: rebuildMessage,
                  })
                  .in("id", pendingAssignmentIds);
              }

              failedCount += pendingAssignmentIds.length;
              results.push({
                platform: entry.platform,
                market: entry.market,
                phase: entry.phase_name,
                pushed: 0,
                failed: pendingAssignmentIds.length,
                success: false,
                error: rebuildMessage,
                requiresCampaignRepush: true,
                hasUserAuth: !!requestAuthHeader,
              });
              continue;
            }
          } else {
            console.log(`[push-creatives] Ad set ${targetEntityId} already has promoted_object`);
          }
        } catch (patchErr) {
          console.warn(`[push-creatives] promoted_object pre-flight check failed:`, patchErr);
        }
      }

      // ========== CAROUSEL GROUPING ==========
      // Separate carousel assignments from standalone assignments.
      // Carousel assignments share the same carousel_group_id and must be pushed as a single ad.
      const carouselGroups = new Map<string, any[]>();
      const standaloneAssignments: any[] = [];

      for (const a of pendingAssignments) {
        const cgId = (a as any).carousel_group_id;
        if (cgId) {
          if (!carouselGroups.has(cgId)) carouselGroups.set(cgId, []);
          carouselGroups.get(cgId)!.push(a);
        } else {
          standaloneAssignments.push(a);
        }
      }

      console.log(`[push-creatives] Found ${carouselGroups.size} carousel group(s) and ${standaloneAssignments.length} standalone assignment(s)`);

      // ========== PUSH CAROUSEL GROUPS ==========
      for (const [carouselGroupId, carouselCards] of carouselGroups) {
        // Check for timeout
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          timedOut = true;
          hasMoreWork = true;
          break;
        }

        // A carousel group can only be pushed if ALL cards are pending
        const allPending = carouselCards.every((a: any) => a.status !== "pushed" && !a.dsp_creative_id);
        if (!allPending) {
          console.log(`[push-creatives] Skipping carousel ${carouselGroupId}: some cards already pushed`);
          continue;
        }

        // Sort by position
        carouselCards.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

        // Mark all cards as "pushing"
        for (const card of carouselCards) {
          await supabase
            .from("creative_assignments")
            .update({ status: "pushing" })
            .eq("id", card.id);
        }

        const firstCard = carouselCards[0];
        const firstCreative = (firstCard as any).creative;
        const firstResolvedText = {
          primaryText: firstCard.primary_text || firstCreative.primary_text || "",
          headline: firstCard.headline || firstCreative.headline || "",
          description: firstCard.description || firstCreative.description || "",
          callToAction: firstCard.call_to_action || firstCreative.call_to_action,
          destinationUrl: firstCard.destination_url || firstCreative.destination_url,
          urlParameters: firstCard.url_parameters || firstCreative.url_parameters,
          brandName: firstCard.brand_name || firstCreative.brand_name,
        };

        try {
          if (platformKey === "meta") {
            // ========== META CAROUSEL AD ==========
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
              for (const card of carouselCards) {
                await supabase.from("creative_assignments").update({ status: "error", error_message: "Missing Meta ad account id" }).eq("id", card.id);
              }
              localFailed += carouselCards.length;
              continue;
            }

            // Resolve page ID
            let pageId = resolveConfiguredMetaPageId(firstCreative, phase, market);

            const adAccountIdRaw = resolvedAdAccount ? String(resolvedAdAccount).replace(/^act_/, "") : "";
            const adAccountIdWithPrefix = `act_${adAccountIdRaw}`;
            const { data: allMetaAdAccountRows } = await supabase
              .from("meta_ad_accounts")
              .select("default_page_id, default_landing_page_url, default_url_parameters, default_utm_mode, default_pixel_id")
              .or(`account_id.eq.${adAccountIdRaw},account_id.eq.${adAccountIdWithPrefix}`)
              .order("synced_at", { ascending: false });
            const metaAdAccountDefaults = allMetaAdAccountRows?.find(
              (row: any) => row.default_landing_page_url || row.default_page_id
            ) || allMetaAdAccountRows?.[0] || null;

            if (!pageId) pageId = metaAdAccountDefaults?.default_page_id;
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
              for (const card of carouselCards) {
                await supabase.from("creative_assignments").update({ status: "error", error_message: "Missing Meta page ID for carousel" }).eq("id", card.id);
              }
              localFailed += carouselCards.length;
              continue;
            }

            const utmMode = firstCard.utm_mode || metaAdAccountDefaults?.default_utm_mode || "auto";
            let globalUrlParams = firstResolvedText.urlParameters;
            if (utmMode === "auto") {
              globalUrlParams = "utm_source={{site_source_name}}&utm_medium={{placement}}&utm_campaign={{campaign.name}}&utm_content={{adset.name}}";
            } else if (!globalUrlParams && metaAdAccountDefaults?.default_url_parameters) {
              globalUrlParams = metaAdAccountDefaults.default_url_parameters;
            }

            const phaseLandingPageUrl =
              (phase as any)?.metaLandingPageUrl || (phase as any)?.landingPageUrl;
            const marketLandingPageUrl =
              (market as any)?.metaLandingPageUrl || (market as any)?.landingPageUrl;
            const defaultLandingPage = normalizeHttpUrl(
              phaseLandingPageUrl || marketLandingPageUrl || metaAdAccountDefaults?.default_landing_page_url,
            );

            const pixelId = (phase as any)?.metaPixelId || (market as any)?.metaPixelId || metaAdAccountDefaults?.default_pixel_id;

            // Build child_attachments for each carousel card
            const childAttachments: any[] = [];
            let carouselCardsFailed = 0;

            for (const card of carouselCards) {
              const creative = (card as any).creative;
              if (!creative) { carouselCardsFailed++; continue; }

              let hasAsset = !!creative.platform_image_hash || !!creative.platform_video_id;
              if (!hasAsset) {
                const { data: fullCreative } = await supabase
                  .from("creatives").select("media_urls, media_type").eq("id", creative.id).single();

                if (fullCreative?.media_urls?.[0]) {
                  const mediaUrl = fullCreative.media_urls[0];
                  const isVideoFile = /\.(mp4|mov|avi|wmv|flv|webm|m4v)(\?|$)/i.test(mediaUrl);
                  try {
                    const mediaResponse = await fetch(mediaUrl);
                    const mediaBlob = await mediaResponse.blob();
                    const fileName = mediaUrl.split('/').pop() || (isVideoFile ? 'video.mp4' : 'image.jpg');
                    if (isVideoFile) {
                      const formData = new FormData();
                      formData.append('access_token', platform.access_token);
                      formData.append('source', mediaBlob, fileName);
                      const uploadResult = await (await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/advideos`, { method: 'POST', body: formData })).json();
                      if (uploadResult.id) {
                        await supabase.from("creatives").update({ platform_video_id: uploadResult.id, dsp_upload_status: "uploaded" }).eq("id", creative.id);
                        creative.platform_video_id = uploadResult.id;
                        hasAsset = true;
                      }
                    } else {
                      const formData = new FormData();
                      formData.append('access_token', platform.access_token);
                      formData.append('filename', fileName);
                      formData.append('bytes', await blobToBase64(mediaBlob));
                      const uploadResult = await (await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/adimages`, { method: 'POST', body: formData })).json();
                      const imageData = uploadResult.images?.[fileName] || (Object.values(uploadResult.images || {})[0] as any);
                      if (imageData?.hash) {
                        await supabase.from("creatives").update({ platform_image_hash: imageData.hash, dsp_upload_status: "uploaded" }).eq("id", creative.id);
                        creative.platform_image_hash = imageData.hash;
                        hasAsset = true;
                      }
                    }
                  } catch (uploadErr) {
                    console.error(`[push-creatives] Carousel card auto-upload failed:`, uploadErr);
                  }
                }
              }

              if (!hasAsset) {
                await supabase.from("creative_assignments").update({ status: "error", error_message: "Carousel card missing media asset" }).eq("id", card.id);
                carouselCardsFailed++;
                localFailed++;
                continue;
              }

              const cardUrl = normalizeHttpUrl(
                (card as any).carousel_card_website_url || card.destination_url || creative.destination_url || defaultLandingPage
              );
              let cardLink = cardUrl;
              if (cardLink && globalUrlParams) {
                const sep = cardLink.includes("?") ? "&" : "?";
                cardLink = `${cardLink}${sep}${globalUrlParams}`;
              }

              const isVideo = !!creative.platform_video_id;
              const childAttachment: any = {
                ...(isVideo
                  ? { video_id: creative.platform_video_id }
                  : { image_hash: creative.platform_image_hash }),
                name: (card as any).carousel_card_headline || card.headline || creative.headline || creative.name,
                description: (card as any).carousel_card_description || card.description || creative.description || "",
                link: cardLink,
              };
              const cta = (card as any).carousel_card_cta || card.call_to_action || creative.call_to_action;
              if (cta) {
                childAttachment.call_to_action = { type: cta, value: { link: cardLink } };
              }
              if (isVideo && creative.platform_thumbnail_id) {
                childAttachment.image_hash = creative.platform_thumbnail_id;
              } else if (isVideo && creative.thumbnail_url) {
                childAttachment.image_url = creative.thumbnail_url;
              }
              childAttachments.push(childAttachment);
            }

            if (childAttachments.length < 2) {
              console.error(`[push-creatives] Carousel ${carouselGroupId}: not enough valid cards (${childAttachments.length})`);
              for (const card of carouselCards) {
                if ((card as any).status !== "error") {
                  await supabase.from("creative_assignments").update({ status: "error", error_message: `Carousel needs at least 2 valid cards, got ${childAttachments.length}` }).eq("id", card.id);
                  localFailed++;
                }
              }
              continue;
            }

            const carouselCreativePayload: any = {
              name: `Carousel - ${firstCreative.name}`,
              object_story_spec: {
                page_id: pageId,
                link_data: {
                  message: firstResolvedText.primaryText,
                  link: normalizeHttpUrl(firstResolvedText.destinationUrl || defaultLandingPage) || childAttachments[0]?.link,
                  child_attachments: childAttachments,
                  multi_share_optimized: true,
                },
              },
            };

            console.log(`[push-creatives] Creating Meta carousel adcreative with ${childAttachments.length} cards:`, JSON.stringify(carouselCreativePayload, null, 2));

            const creativeResponse = await fetch(
              `https://graph.facebook.com/v22.0/${adAccountPath}/adcreatives?access_token=${platform.access_token}`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(carouselCreativePayload) },
            );
            const creativeData = await creativeResponse.json();
            console.log(`[push-creatives] Meta carousel creative response:`, JSON.stringify(creativeData));

            if (!creativeData.id) {
              const errMsg = creativeData?.error?.error_user_msg || creativeData?.error?.message || "Failed to create Meta carousel creative";
              for (const card of carouselCards) {
                await supabase.from("creative_assignments").update({ status: "error", error_message: errMsg }).eq("id", card.id);
              }
              localFailed += carouselCards.length - carouselCardsFailed;
              continue;
            }

            const adPayload = {
              name: `Carousel - ${firstCreative.name} - Ad`,
              adset_id: targetEntityId,
              creative: { creative_id: creativeData.id },
              status: "PAUSED",
              tracking_specs: pixelId ? [{ "action.type": ["offsite_conversion"], fb_pixel: [pixelId] }] : undefined,
            };

            const adResponse = await fetch(
              `https://graph.facebook.com/v22.0/${adAccountPath}/ads?access_token=${platform.access_token}`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adPayload) },
            );
            const adData = await adResponse.json();
            console.log(`[push-creatives] Meta carousel ad response:`, JSON.stringify(adData));

            if (!adData.id) {
              const errMsg = adData?.error?.error_user_msg || adData?.error?.message || "Failed to create Meta carousel ad";
              for (const card of carouselCards) {
                await supabase.from("creative_assignments").update({ status: "error", error_message: errMsg }).eq("id", card.id);
              }
              localFailed += carouselCards.length - carouselCardsFailed;
              continue;
            }

            for (const card of carouselCards) {
              if ((card as any).status !== "error") {
                await supabase.from("creative_assignments").update({ status: "pushed", dsp_creative_id: adData.id, error_message: null }).eq("id", card.id);
                localPushed++;
              }
            }
            console.log(`[push-creatives] ✅ Meta carousel pushed: ${childAttachments.length} cards, ad_id=${adData.id}`);

          } else if (platformKey === "tiktok") {
            // ========== TIKTOK CAROUSEL AD ==========
            const marketAny = market as any;
            const platformAny = platform as any;
            const advertiserIdCandidates = [
              marketAny?.advertiserId, marketAny?.advertiser_id,
              marketAny?.tiktokAdvertiserId, marketAny?.tiktok_advertiser_id,
              marketAny?.adAccountId, marketAny?.ad_account_id,
              platformAny?.metadata?.advertiser_id,
            ].filter((v) => v != null && String(v).trim().length > 0);
            const tiktokAdvertiserId = advertiserIdCandidates[0];

            if (!tiktokAdvertiserId) {
              for (const card of carouselCards) {
                await supabase.from("creative_assignments").update({ status: "error", error_message: "Missing TikTok advertiser ID" }).eq("id", card.id);
              }
              localFailed += carouselCards.length;
              continue;
            }

            const advertiserIdStr = String(tiktokAdvertiserId);
            const imageIds: string[] = [];
            let ttCardsFailed = 0;

            for (const card of carouselCards) {
              const creative = (card as any).creative;
              if (!creative?.platform_image_hash) {
                await supabase.from("creative_assignments").update({ status: "error", error_message: "TikTok carousel only supports images" }).eq("id", card.id);
                ttCardsFailed++;
                localFailed++;
              } else {
                imageIds.push(creative.platform_image_hash);
              }
            }

            if (imageIds.length < 2) {
              for (const card of carouselCards) {
                if ((card as any).status !== "error") {
                  await supabase.from("creative_assignments").update({ status: "error", error_message: "TikTok carousel needs at least 2 image cards" }).eq("id", card.id);
                  localFailed++;
                }
              }
              continue;
            }

            // Resolve identity
            let finalIdentityId: string | null = null;
            let identityType = "CUSTOMIZED_USER";
            try {
              const identityGetUrl = `https://business-api.tiktok.com/open_api/v1.3/identity/get/?advertiser_id=${advertiserIdStr}`;
              const identityGetResponse = await fetch(identityGetUrl, { method: "GET", headers: { "Access-Token": platform.access_token } });
              const identityGetData = await identityGetResponse.json();
              const fetchedIdentities = identityGetData?.data?.identity_list || identityGetData?.data?.list || [];
              const customizedUser = fetchedIdentities.find((id: any) => id.identity_type === "CUSTOMIZED_USER");
              finalIdentityId = customizedUser ? String(customizedUser.identity_id) : (fetchedIdentities[0] ? String(fetchedIdentities[0].identity_id) : null);
              if (fetchedIdentities[0] && !customizedUser) identityType = fetchedIdentities[0].identity_type || "CUSTOMIZED_USER";
            } catch (e) {
              console.error(`[push-creatives] TikTok identity fetch error:`, e);
            }

            if (!finalIdentityId) {
              for (const card of carouselCards) {
                await supabase.from("creative_assignments").update({ status: "error", error_message: "No valid TikTok identity found for carousel" }).eq("id", card.id);
              }
              localFailed += carouselCards.length - ttCardsFailed;
              continue;
            }

            let tiktokDestUrl = normalizeHttpUrl(
              firstResolvedText.destinationUrl || firstCreative.destination_url ||
              (phase as any)?.landingPageUrl || (market as any)?.landingPageUrl
            );
            if (!tiktokDestUrl) {
              const { data: ttDefaults } = await supabase.from("tiktok_ad_accounts")
                .select("default_landing_page_url").eq("user_id", campaign.user_id)
                .or(`advertiser_id.eq.${advertiserIdStr},account_id.eq.${advertiserIdStr}`)
                .order("synced_at", { ascending: false }).limit(1).maybeSingle();
              tiktokDestUrl = normalizeHttpUrl(ttDefaults?.default_landing_page_url);
            }
            if (!tiktokDestUrl) {
              for (const card of carouselCards) {
                await supabase.from("creative_assignments").update({ status: "error", error_message: "Carousel ads require a destination URL" }).eq("id", card.id);
              }
              localFailed += carouselCards.length - ttCardsFailed;
              continue;
            }

            const tiktokCarouselPayload: any = {
              advertiser_id: advertiserIdStr,
              adgroup_id: entry.dsp_entity_id,
              creatives: [{
                ad_name: `Carousel - ${firstCreative.name}`,
                identity_type: identityType,
                identity_id: finalIdentityId,
                ad_text: firstResolvedText.primaryText || firstCreative.name,
                call_to_action: firstResolvedText.callToAction || "LEARN_MORE",
                landing_page_url: tiktokDestUrl,
                ad_format: "CAROUSEL",
                image_ids: imageIds,
                carousel_image_index: imageIds.map((_: string, i: number) => i),
              }],
            };

            console.log(`[push-creatives] Creating TikTok carousel ad:`, JSON.stringify(tiktokCarouselPayload, null, 2));

            const tiktokResponse = await fetch("https://business-api.tiktok.com/open_api/v1.3/ad/create/", {
              method: "POST",
              headers: { "Access-Token": platform.access_token, "Content-Type": "application/json" },
              body: JSON.stringify(tiktokCarouselPayload),
            });
            const tiktokData = await tiktokResponse.json();
            console.log(`[push-creatives] TikTok carousel response:`, JSON.stringify(tiktokData));

            const adId = tiktokData?.data?.ad_ids?.[0] ? String(tiktokData.data.ad_ids[0]) : null;
            if (tiktokData?.code !== 0 || !adId) {
              const errMsg = tiktokData?.message || "Failed to create TikTok carousel ad";
              for (const card of carouselCards) {
                if ((card as any).status !== "error") {
                  await supabase.from("creative_assignments").update({ status: "error", error_message: errMsg }).eq("id", card.id);
                  localFailed++;
                }
              }
              continue;
            }

            for (const card of carouselCards) {
              if ((card as any).status !== "error") {
                await supabase.from("creative_assignments").update({ status: "pushed", dsp_creative_id: adId, error_message: null }).eq("id", card.id);
                localPushed++;
              }
            }
            console.log(`[push-creatives] ✅ TikTok carousel pushed: ${imageIds.length} cards, ad_id=${adId}`);
          }
        } catch (carouselError) {
          console.error(`[push-creatives] Carousel ${carouselGroupId} push error:`, carouselError);
          for (const card of carouselCards) {
            await supabase.from("creative_assignments").update({ status: "error", error_message: `Carousel push failed: ${(carouselError as any).message}` }).eq("id", card.id);
          }
          localFailed += carouselCards.length;
        }
      }

      // ========== PUSH STANDALONE ASSIGNMENTS ==========
      const batches = chunkArray(standaloneAssignments, BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          console.log(`[push-creatives] Approaching timeout limit, will auto-continue`);
          timedOut = true;
          hasMoreWork = true;
          break;
        }
        
        const batch = batches[batchIndex];
        console.log(`[push-creatives] Processing standalone batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);

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
            
            // Resolve landing page URL (phase/market override ad account defaults) and normalize it
            const phaseLandingPageUrl =
              (phase as any)?.metaLandingPageUrl ||
              (phase as any)?.meta_landing_page_url ||
              (phase as any)?.landingPageUrl ||
              (phase as any)?.landing_page_url;

            const marketLandingPageUrl =
              (market as any)?.metaLandingPageUrl ||
              (market as any)?.meta_landing_page_url ||
              (market as any)?.landingPageUrl ||
              (market as any)?.landing_page_url;

            const metaLandingPageUrl = normalizeHttpUrl(
              phaseLandingPageUrl || marketLandingPageUrl || metaAdAccountDefaults?.default_landing_page_url,
            );
            
            console.log(`[push-creatives] Advantage+ features:`, JSON.stringify(advantagePlusFeatures));
            console.log(`[push-creatives] UTM mode: ${utmMode}, URL params: ${finalUrlParameters || "none"}`);
            if (pixelId) console.log(`[push-creatives] Tracking pixel: ${pixelId}`);

            let hasMetaAsset = creative.platform_image_hash || creative.platform_video_id;
            
            // Skip auto-upload for organic posts - they use external_post_id directly
            const isOrganicPost = creative.creative_type === "existing_post" && creative.external_post_id;
            if (isOrganicPost) {
              console.log(`[push-creatives] Creative ${creative.id} is an organic post (${creative.external_post_id}), skipping auto-upload`);
              hasMetaAsset = true; // Mark as having asset to proceed with ad creation
            }
            
            // Auto-upload to Meta if creative is missing DSP asset IDs (and not an organic post)
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
              // Prioritize URL extension over media_type field (DB can have stale/incorrect data)
              const urlLower = mediaUrl.toLowerCase();
              const hasVideoExtension = /\.(mp4|mov|avi|wmv|flv|webm|m4v)(\?|$)/.test(urlLower);
              const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/.test(urlLower);
              // Use URL extension if detectable, otherwise fall back to media_type field
              const isVideoFile = hasVideoExtension || (!hasImageExtension && fullCreative.media_type === "video");
              
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
            let pageId = resolveConfiguredMetaPageId(creative, phase, market) || metaAdAccountDefaults?.default_page_id;

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
            const baseDestinationUrl = normalizeHttpUrl(
              resolvedText.destinationUrl || creative.destination_url || metaLandingPageUrl,
            );

            const creativePayload: any = {
              name: creative.name,
            };
            
            // For organic posts (existing_post), determine if it's Facebook or Instagram
            // Instagram posts use source_instagram_media_id, Facebook posts use object_story_id
            // EXCEPTION: Instagram VIDEOS must be uploaded to Facebook first (Meta API requirement)
            if (isOrganicPost && creative.external_post_id) {
              // Check platform_metadata for sourceNetwork, fallback to ID format detection
              // Instagram media IDs are purely numeric (e.g., "17978083595953638")
              // Facebook post IDs contain underscore (e.g., "pageId_postId")
              const sourceNetwork = (creative.platform_metadata as any)?.sourceNetwork;
              const isInstagramPost = sourceNetwork === 'instagram' || 
                (!sourceNetwork && !creative.external_post_id.includes('_'));
              
              // Check if this is a video (from platform_metadata or media_type)
              const mediaType = (creative.platform_metadata as any)?.mediaType || creative.media_type;
              const isInstagramVideo = isInstagramPost && (mediaType === 'video' || mediaType === 'VIDEO');
              
              if (isInstagramVideo) {
                // Instagram videos MUST be uploaded to Facebook before creating ads
                // Per Meta API: "When advertising an existing Instagram video, you need to upload it to Facebook"
                console.log(`[push-creatives] Instagram video detected, uploading to Facebook first...`);
                
                try {
                  // Step 1: Fetch the Instagram media details to get the video URL
                  const igMediaResponse = await fetch(
                    `https://graph.facebook.com/v22.0/${creative.external_post_id}?fields=media_url,media_type,thumbnail_url&access_token=${platform.access_token}`
                  );
                  const igMediaData = await igMediaResponse.json();
                  console.log(`[push-creatives] Instagram media data:`, JSON.stringify(igMediaData));
                  
                  if (igMediaData.error) {
                    throw new Error(`Instagram API error: ${igMediaData.error.message}`);
                  }
                  
                  const videoUrl = igMediaData.media_url;
                  const thumbnailUrl = igMediaData.thumbnail_url;
                  
                  if (!videoUrl) {
                    throw new Error('Could not retrieve Instagram video URL. The video may be too old or access is restricted.');
                  }
                  
                  // Step 2: Upload the video to Facebook ad account using file_url
                  console.log(`[push-creatives] Uploading Instagram video to Facebook: ${videoUrl.substring(0, 100)}...`);
                  
                  const uploadFormData = new FormData();
                  uploadFormData.append('access_token', platform.access_token);
                  uploadFormData.append('file_url', videoUrl);
                  uploadFormData.append('title', creative.name || 'Instagram Video');
                  
                  const uploadResponse = await fetch(
                    `https://graph.facebook.com/v22.0/${adAccountPath}/advideos`,
                    {
                      method: 'POST',
                      body: uploadFormData,
                    }
                  );
                  
                  const uploadResult = await uploadResponse.json();
                  console.log(`[push-creatives] Facebook video upload result:`, JSON.stringify(uploadResult));
                  
                  if (uploadResult.error) {
                    throw new Error(`Video upload failed: ${uploadResult.error.message}`);
                  }
                  
                  if (!uploadResult.id) {
                    throw new Error('Video upload did not return a video ID');
                  }
                  
                  // Step 3: Build the ad creative using video_data (like a dark post)
                  const uploadedVideoId = uploadResult.id;
                  console.log(`[push-creatives] Instagram video uploaded to Facebook, video_id: ${uploadedVideoId}`);
                  
                  // Update the creative record with the uploaded video ID for future use
                  await supabase
                    .from("creatives")
                    .update({ 
                      platform_video_id: uploadedVideoId,
                      dsp_upload_status: "uploaded",
                      dsp_uploaded_at: new Date().toISOString()
                    })
                    .eq("id", creative.id);
                  
                  // Use video_data structure for the ad creative
                  creativePayload.object_story_spec = {
                    page_id: pageId,
                    video_data: {
                      video_id: uploadedVideoId,
                      message: resolvedText.primaryText || creative.primary_text || "",
                      title: resolvedText.headline || creative.headline || "",
                      ...(thumbnailUrl ? { image_url: thumbnailUrl } : {}),
                    },
                  };
                  
                  // Mark that we've handled this as a video upload (skip the later video_data building)
                  creative._instagramVideoUploaded = true;
                  
                } catch (igVideoError) {
                  console.error(`[push-creatives] Instagram video upload failed:`, igVideoError);
                  await supabase
                    .from("creative_assignments")
                    .update({
                      status: "error",
                      error_message: `Instagram video upload to Facebook failed: ${(igVideoError as any).message}. Try uploading the video directly to the ad account.`,
                    })
                    .eq("id", assignment.id);
                  localFailed++;
                  continue;
                }
              } else if (isInstagramPost) {
                // Instagram IMAGE posts use source_instagram_media_id parameter
                creativePayload.source_instagram_media_id = creative.external_post_id;
                console.log(`[push-creatives] Using source_instagram_media_id for Instagram image post: ${creative.external_post_id}`);
              } else {
                // Facebook posts use object_story_id (format: pageId_postId)
                creativePayload.object_story_id = creative.external_post_id;
                console.log(`[push-creatives] Using object_story_id for Facebook post: ${creative.external_post_id}`);
              }

              // Meta Traffic / LPV / Link Clicks phases require a website destination even when using object_story_id.
              // If we have a destination configured, attach a CTA (inside video_data for uploaded IG videos, or at root level otherwise).
              const phaseOptimizationGoal = String((phase as any)?.optimizationGoal || "").toUpperCase();
              const marketOptimizationLocation = String((market as any)?.metaOptimizationLocation || "").toUpperCase();
              const needsWebsiteDestination =
                marketOptimizationLocation === "WEBSITE" ||
                phaseOptimizationGoal === "LANDING_PAGE_VIEWS" ||
                phaseOptimizationGoal === "LINK_CLICKS";

              const shouldAttachCta = needsWebsiteDestination || !!resolvedText.callToAction;

              if (shouldAttachCta) {
                if (!baseDestinationUrl) {
                  await supabase
                    .from("creative_assignments")
                    .update({
                      status: "error",
                      error_message:
                        "This phase is optimized for website traffic and requires a landing page URL. Set it on the phase (Meta Landing Page URL), the assignment destination URL, or ad account defaults.",
                    })
                    .eq("id", assignment.id);
                  localFailed++;
                  continue;
                }

                // Build destination URL with optional URL parameters
                let ctaLink = baseDestinationUrl;
                if (finalUrlParameters) {
                  const separator = ctaLink.includes("?") ? "&" : "?";
                  ctaLink = `${ctaLink}${separator}${finalUrlParameters}`;
                }

                // For uploaded Instagram videos, CTA goes inside video_data
                // For other organic posts (FB posts, IG images), CTA goes at root level
                if ((creative as any)._instagramVideoUploaded && creativePayload.object_story_spec?.video_data) {
                  creativePayload.object_story_spec.video_data.call_to_action = {
                    type: resolvedText.callToAction || "LEARN_MORE",
                    value: {
                      link: ctaLink,
                    },
                  };
                  console.log(`[push-creatives] Added CTA to video_data for uploaded Instagram video`);
                } else {
                  creativePayload.call_to_action = {
                    type: resolvedText.callToAction || "LEARN_MORE",
                    value: {
                      link: ctaLink,
                    },
                  };
                }
              }
            } else {
              // Build new object_story_spec for dark posts
              creativePayload.object_story_spec = {
                page_id: pageId,
              };
            }

            // Build destination URL with optional URL parameters
            let finalDestinationUrl = baseDestinationUrl;
            if (finalDestinationUrl && finalUrlParameters) {
              const separator = finalDestinationUrl.includes("?") ? "&" : "?";
              finalDestinationUrl = `${finalDestinationUrl}${separator}${finalUrlParameters}`;
            }

            // Only build video_data/link_data for dark posts (not organic posts)
            // Organic posts use object_story_id which already contains all the creative content
            if (!isOrganicPost) {
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
                const destinationLink = baseDestinationUrl;

                console.log(
                  `[push-creatives] Video destination URL resolution: assignment=${resolvedText.destinationUrl}, creative=${creative.destination_url}, phase=${phaseLandingPageUrl}, market=${marketLandingPageUrl}, adAccountDefaults=${metaAdAccountDefaults?.default_landing_page_url}, final=${destinationLink}`,
                );
                
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
              adset_id: targetEntityId,
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
            
            // ========== CRITICAL: TikTok Creative Origin Validation ==========
            // API-uploaded creatives are NOT delivery-eligible on TikTok.
            // Only UI_SYNC creatives (uploaded via TikTok Ads Manager) can be used for ads.
            // 
            // Check the creative's origin - if it came from a platform asset, check that asset's origin.
            // If no origin is set, we need to check if it's being uploaded via API (which should be blocked).
            const { data: fullCreativeOriginCheck } = await supabase
              .from("creatives")
              .select("creative_origin, platform_metadata")
              .eq("id", creative.id)
              .single();
            
            // Get origin from creative or from platform_metadata (for assets from creative_library_assets)
            let creativeOrigin = fullCreativeOriginCheck?.creative_origin;
            
            // If creative was created from a platform asset, check the platform asset's origin
            if (!creativeOrigin && fullCreativeOriginCheck?.platform_metadata) {
              const platformMeta = fullCreativeOriginCheck.platform_metadata as any;
              if (platformMeta?.creative_origin) {
                creativeOrigin = platformMeta.creative_origin;
              } else if (platformMeta?.platform_asset_id && platformMeta?.advertiser_id) {
                // Look up the original asset in creative_library_assets
                const { data: libraryAsset } = await supabase
                  .from("creative_library_assets")
                  .select("creative_origin")
                  .eq("platform", "tiktok")
                  .eq("platform_asset_id", platformMeta.platform_asset_id)
                  .maybeSingle();
                
                if (libraryAsset?.creative_origin) {
                  creativeOrigin = libraryAsset.creative_origin;
                }
              }
            }
            
            // Default to API_UPLOAD if no origin is set (safer to block than to allow)
            if (!creativeOrigin) {
              creativeOrigin = "API_UPLOAD";
            }
            
            // Block API-uploaded creatives from ad delivery
            if (creativeOrigin === "API_UPLOAD") {
              console.error(`[push-creatives] ❌ BLOCKED: Creative ${creative.id} has origin=${creativeOrigin}. TikTok requires creatives to be uploaded via Ads Manager.`);
              await supabase
                .from("creative_assignments")
                .update({
                  status: "error",
                  error_message: "TikTok requires creatives to be uploaded via Ads Manager. API-uploaded creatives cannot be used for ad delivery. Please upload this creative in TikTok Ads Manager, then sync your Creative Library.",
                })
                .eq("id", assignment.id);
              localFailed++;
              continue;
            }
            
            console.log(`[push-creatives] ✅ TikTok creative origin validated: ${creativeOrigin}`);
            
            // ========== TikTok Auto-Upload Logic ==========
            // NOTE: With the new origin validation, auto-upload is effectively disabled for ad delivery.
            // This section is kept for backwards compatibility but should rarely trigger.
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
              
              // Build descriptive filename: AdGroupName_CreativeName_uniqueSuffix
              // This helps identify assets in TikTok's creative library since we can't retrieve video/image info via API
              const adGroupName = assignment.ad_set_name || entry.phase_name || 'AdGroup';
              const creativeName = creative.name || 'Creative';
              // Sanitize names: remove special chars that might cause issues, replace spaces with underscores
              const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 50);
              const uniqueSuffix = `_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
              const fileExt = (fullCreative.original_filename?.includes('.') 
                ? '.' + fullCreative.original_filename.split('.').pop() 
                : (isVideoFile ? '.mp4' : '.jpg'));
              const fileName = `${sanitize(adGroupName)}_${sanitize(creativeName)}${uniqueSuffix}${fileExt}`;
              
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
            // TikTok v1.3 REQUIRES a valid identity_id for ALL ad types:
            // - DARK ADS: identity_type = CUSTOMIZED_USER, identity_id = MUST be a valid identity from /identity/get/
            // - SPARK ADS: identity_type = TIKTOK_ACCOUNT, identity_id = tiktok_account_id
            //
            // CRITICAL: In v1.3, using advertiser_id as identity_id does NOT work.
            // We must fetch identities from /identity/get/ endpoint.
            
            let identityType: string;
            let finalIdentityId: string | null = null;
            
            // ========== FETCH IDENTITIES FROM TIKTOK API ==========
            // This is required for v1.3 compliance - we MUST have a valid identity_id
            let fetchedIdentities: any[] = [];
            
            const identityGetUrl = `https://business-api.tiktok.com/open_api/v1.3/identity/get/?advertiser_id=${advertiserIdStr}`;
            
            logger.logTikTokRequest(identityGetUrl, "GET", null, {
              advertiserId: advertiserIdStr,
              tokenContext,
            }, "fetch identities for ad creation");
            
            try {
              const identityGetResponse = await fetch(identityGetUrl, {
                method: "GET",
                headers: {
                  "Access-Token": platform.access_token,
                  "Content-Type": "application/json",
                },
              });
              
              const identityGetData = await identityGetResponse.json();
              
              logger.logTikTokResponse(identityGetUrl, identityGetData, {
                advertiserId: advertiserIdStr,
                tokenContext,
              }, "fetch identities for ad creation");
              
              if (identityGetData.code === 0 && identityGetData.data?.identity_list) {
                fetchedIdentities = identityGetData.data.identity_list;
                console.log(`[push-creatives] ✅ Fetched ${fetchedIdentities.length} identities from TikTok API`);
              } else if (identityGetData.code === 0 && identityGetData.data?.list) {
                // Alternative response shape
                fetchedIdentities = identityGetData.data.list;
                console.log(`[push-creatives] ✅ Fetched ${fetchedIdentities.length} identities from TikTok API (alternate shape)`);
              } else {
                console.log(`[push-creatives] ⚠️ identity/get returned no identities: code=${identityGetData.code}, message=${identityGetData.message}`);
                
                // Fallback: Try /identity/list/ endpoint
                const identityListUrl = `https://business-api.tiktok.com/open_api/v1.3/identity/list/?advertiser_id=${advertiserIdStr}`;
                
                logger.logTikTokRequest(identityListUrl, "GET", null, {
                  advertiserId: advertiserIdStr,
                  tokenContext,
                }, "fallback fetch identities via /identity/list/");
                
                const identityListResponse = await fetch(identityListUrl, {
                  method: "GET",
                  headers: {
                    "Access-Token": platform.access_token,
                    "Content-Type": "application/json",
                  },
                });
                
                const identityListData = await identityListResponse.json();
                
                logger.logTikTokResponse(identityListUrl, identityListData, {
                  advertiserId: advertiserIdStr,
                  tokenContext,
                }, "fallback fetch identities via /identity/list/");
                
                if (identityListData.code === 0) {
                  fetchedIdentities = identityListData.data?.list || identityListData.data?.identity_list || [];
                  console.log(`[push-creatives] ✅ Fallback: Fetched ${fetchedIdentities.length} identities from /identity/list/`);
                }
              }
            } catch (identityFetchError) {
              console.error(`[push-creatives] ❌ Error fetching identities:`, identityFetchError);
            }
            
            // Log all fetched identities for debugging
            if (fetchedIdentities.length > 0) {
              console.log(`[push-creatives] Available identities for advertiser ${advertiserIdStr}:`);
              fetchedIdentities.forEach((id: any, idx: number) => {
                console.log(`  [${idx}] identity_id=${id.identity_id}, identity_type=${id.identity_type}, display_name=${id.display_name || 'N/A'}`);
              });
            }
            
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
              // ========== DARK ADS: CUSTOMIZED_USER with VALID identity_id ==========
              // TikTok v1.3 REQUIRES identity_id from /identity/get/ endpoint
              // CRITICAL: We can ONLY use identity_ids that are returned by /identity/get/
              // Advertiser_id, BC_id, and stored/stale identity_ids are NOT valid.
              identityType = "CUSTOMIZED_USER";
              
              // Build a set of valid identity IDs from API response for quick lookup
              const validIdentityIds = new Set(
                fetchedIdentities.map((id: any) => String(id.identity_id))
              );
              
              console.log(`[push-creatives] Valid identities from TikTok API: [${Array.from(validIdentityIds).join(', ')}]`);
              console.log(`[push-creatives] User-selected identity_id: ${identityId || 'none'} (source: ${identitySource || 'none'})`);
              
              // CRITICAL: Reject advertiser_id as identity_id - TikTok v1.3 does NOT accept this
              if (identityId && identityId === advertiserIdStr) {
                console.log(`[push-creatives] ⚠️ Rejecting identity_id=${identityId} because it equals advertiser_id. This is NOT valid in TikTok v1.3.`);
                identityId = null;
              }
              
              // Priority 1: Use user-selected identity ONLY if it exists in the API response
              if (identityId && validIdentityIds.has(String(identityId))) {
                finalIdentityId = String(identityId);
                const selectedIdentity = fetchedIdentities.find(
                  (id: any) => String(id.identity_id) === String(identityId)
                );
                console.log(`[push-creatives] Dark Ad - Using user-selected identity: ${finalIdentityId} (type: ${selectedIdentity?.identity_type || 'unknown'}, validated against API)`);
              } else if (identityId) {
                // User selected an identity that is NOT in the API response - this is invalid
                console.log(`[push-creatives] ⚠️ User-selected identity_id=${identityId} is NOT in the fetched identities list. Ignoring.`);
              }
              
              // Priority 2: Find a CUSTOMIZED_USER identity from fetched list
              if (!finalIdentityId) {
                const customizedUserIdentity = fetchedIdentities.find(
                  (id: any) => id.identity_type === "CUSTOMIZED_USER"
                );
                if (customizedUserIdentity) {
                  finalIdentityId = String(customizedUserIdentity.identity_id);
                  console.log(`[push-creatives] Dark Ad - Using CUSTOMIZED_USER identity from API: ${finalIdentityId}`);
                }
              }
              
              // Priority 3: Use any available identity from the API (with proper identity_type)
              if (!finalIdentityId && fetchedIdentities.length > 0) {
                const firstIdentity = fetchedIdentities[0];
                finalIdentityId = String(firstIdentity.identity_id);
                identityType = firstIdentity.identity_type || "CUSTOMIZED_USER";
                console.log(`[push-creatives] Dark Ad - Using first available identity from API: ${finalIdentityId} (type: ${identityType})`);
              }
              
              // NO FALLBACK to stored/database identities - only API-validated identities are accepted
              // This prevents using stale, revoked, or invalid identity IDs
              
              // If no identity found from API, we cannot create the ad in v1.3
              if (!finalIdentityId) {
                console.error(`[push-creatives] ❌ No valid identity found for Dark Ad. TikTok v1.3 requires a valid identity_id from /identity/get/ API.`);
                console.error(`[push-creatives] Fetched identities count: ${fetchedIdentities.length}`);
                console.error(`[push-creatives] User-selected identity_id: ${identityId} (NOT found in API response)`);
                console.error(`[push-creatives] Advertiser_id: ${advertiserIdStr} (NOT valid as identity_id in v1.3)`);
                
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: "No valid TikTok identity found. The identity/get API returned 0 usable identities for this advertiser. Please configure a custom identity in TikTok Business Center -> Ad Accounts -> Ad Delivery Assets -> Identities, then sync your account.",
                  })
                  .eq("id", assignment.id);
                localFailed++;
                continue;
              }
              
              console.log(`[push-creatives] ✅ Dark Ad - identity_type=${identityType}, identity_id=${finalIdentityId} (validated from API)`);
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
              // ========== VERIFY VIDEO IS ACCESSIBLE BEFORE USING IT ==========
              // TikTok assets are advertiser-scoped. If the video was uploaded to a different advertiser,
              // or the video ID is invalid, we need to clear it and trigger re-upload.
              console.log(`[push-creatives] Verifying TikTok video ${creative.platform_video_id} is accessible for advertiser ${advertiserIdStr}...`);
              
              let videoVerified = false;
              let videoInfoResult: any = null;
              
              try {
                const videoInfoUrl = `https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/?advertiser_id=${advertiserIdStr}&video_ids=["${creative.platform_video_id}"]`;
                const videoInfoResponse = await fetch(videoInfoUrl, {
                  method: "GET",
                  headers: { "Access-Token": platform.access_token },
                });
                videoInfoResult = await videoInfoResponse.json();
                
                if (videoInfoResult.code === 0 && videoInfoResult.data?.list?.length > 0) {
                  videoVerified = true;
                  console.log(`[push-creatives] ✅ TikTok video verified accessible`);
                } else {
                  console.error(`[push-creatives] ⚠️ Video ${creative.platform_video_id} not accessible: ${videoInfoResult.message || 'Not found in account'}`);
                }
              } catch (videoVerifyError) {
                console.error(`[push-creatives] Video verification error:`, videoVerifyError);
              }
              
              if (!videoVerified) {
                // Video is not accessible - likely uploaded to different advertiser
                // Clear the invalid video ID and mark for re-upload on next attempt
                console.log(`[push-creatives] Clearing invalid video_id and scheduling re-upload...`);
                
                await supabase
                  .from("creatives")
                  .update({ 
                    platform_video_id: null, 
                    platform_thumbnail_id: null,
                    tiktok_asset_advertiser_id: null,
                    dsp_upload_status: null 
                  })
                  .eq("id", creative.id);
                
                await supabase
                  .from("creative_assignments")
                  .update({
                    status: "error",
                    error_message: `TikTok video not accessible for this advertiser (may be uploaded to different account). Will retry with fresh upload. Original error: ${videoInfoResult?.message || 'Video not found'}`,
                  })
                  .eq("id", assignment.id);
                
                localFailed++;
                continue;
              }
              
              tiktokAdPayload.creatives[0].video_id = creative.platform_video_id;
              console.log(`[push-creatives] TikTok ad payload includes video_id=${creative.platform_video_id} (effectiveIsVideo=${effectiveIsVideo})`);
              
              // ========== THUMBNAIL HANDLING FOR SINGLE_VIDEO ==========
              // CRITICAL: TikTok /ad/create API REQUIRES image_ids for non-Spark SINGLE_VIDEO ads!
              // TikTok does NOT auto-generate thumbnails via API (only in UI).
              // 
              // Rules:
              //   - Spark Ads: No thumbnail needed (uses existing post cover)
              //   - Non-Spark video ads: MUST provide image_ids with a thumbnail
              //   - NEVER send image_mode - API rejects it with:
              //     "image_mode is not supported in this version"
              //
              // If no thumbnail exists, we auto-generate one from the video poster URL
              
              if (isSparkAd) {
                // Spark Ads don't need thumbnails - they use the original post's cover
                console.log(`[push-creatives] TikTok Spark Ad - no thumbnail needed (uses post cover)`);
              } else if (creative.platform_thumbnail_id) {
                // User provided explicit thumbnail - use it
                tiktokAdPayload.creatives[0].image_ids = [creative.platform_thumbnail_id];
                console.log(`[push-creatives] TikTok SINGLE_VIDEO using explicit thumbnail image_id=${creative.platform_thumbnail_id}`);
              } else {
                // Non-Spark video WITHOUT thumbnail - we MUST generate one
                // Use the poster_url from the video info we already fetched
                console.log(`[push-creatives] TikTok SINGLE_VIDEO: no thumbnail - attempting auto-generation...`);
                
                let thumbnailImageUrl: string | null = null;
                
                // Use poster_url from video info we already fetched
                if (videoInfoResult?.data?.list?.[0]?.poster_url) {
                  thumbnailImageUrl = videoInfoResult.data.list[0].poster_url;
                  console.log(`[push-creatives] Got TikTok video poster URL: ${thumbnailImageUrl}`);
                } else {
                  console.log(`[push-creatives] No poster_url from TikTok video info`);
                }
                
                // Fallback: Use creative's thumbnail_url or first media_url
                if (!thumbnailImageUrl) {
                  thumbnailImageUrl = creative.thumbnail_url || 
                    (Array.isArray(creative.media_urls) ? creative.media_urls[0] : null);
                  
                  if (thumbnailImageUrl) {
                    // Skip if it's a video file URL - can't use video as image
                    if (thumbnailImageUrl.match(/\.(mp4|mov|avi|webm)(\?|$)/i)) {
                      thumbnailImageUrl = null;
                      console.log(`[push-creatives] Source is video file - cannot use as thumbnail`);
                    }
                  }
                }
                
                if (thumbnailImageUrl) {
                  try {
                    // Upload the thumbnail image to TikTok
                    console.log(`[push-creatives] Uploading thumbnail to TikTok from: ${thumbnailImageUrl}`);
                    
                    const thumbnailUploadUrl = "https://business-api.tiktok.com/open_api/v1.3/file/image/ad/upload/";
                    // Use descriptive thumbnail filename: AdGroupName_CreativeName_thumbnail
                    const adGroupNameThumb = assignment.ad_set_name || entry.phase_name || 'AdGroup';
                    const creativeNameThumb = creative.name || 'Creative';
                    const sanitizeThumb = (str: string) => str.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 50);
                    const thumbnailFileName = `${sanitizeThumb(adGroupNameThumb)}_${sanitizeThumb(creativeNameThumb)}_thumbnail_${Date.now()}.jpg`;
                    
                    const thumbnailUploadResponse = await fetch(thumbnailUploadUrl, {
                      method: "POST",
                      headers: {
                        "Access-Token": platform.access_token,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        advertiser_id: advertiserIdStr,
                        upload_type: "UPLOAD_BY_URL",
                        image_url: thumbnailImageUrl,
                        file_name: thumbnailFileName,
                      }),
                    });
                    
                    const thumbnailUploadResult = await thumbnailUploadResponse.json();
                    console.log(`[push-creatives] Thumbnail upload response:`, JSON.stringify(thumbnailUploadResult));
                    
                    if (thumbnailUploadResult.code === 0) {
                      const uploadData = Array.isArray(thumbnailUploadResult.data) 
                        ? thumbnailUploadResult.data[0] 
                        : thumbnailUploadResult.data;
                      const thumbnailId = uploadData?.material_id || uploadData?.id || uploadData?.image_id;
                      
                      if (thumbnailId) {
                        // Save the thumbnail ID for future use
                        await supabase
                          .from("creatives")
                          .update({ platform_thumbnail_id: thumbnailId })
                          .eq("id", creative.id);
                        
                        creative.platform_thumbnail_id = thumbnailId;
                        tiktokAdPayload.creatives[0].image_ids = [thumbnailId];
                        console.log(`[push-creatives] ✅ Auto-generated thumbnail uploaded: ${thumbnailId}`);
                      } else {
                        throw new Error("Thumbnail upload succeeded but no image_id returned");
                      }
                    } else {
                      throw new Error(`Thumbnail upload failed: ${thumbnailUploadResult.message || "Unknown error"} (code: ${thumbnailUploadResult.code})`);
                    }
                  } catch (thumbnailError) {
                    console.error(`[push-creatives] ❌ Thumbnail auto-generation failed:`, thumbnailError);
                    
                    // Mark assignment as error - user needs to provide a thumbnail manually
                    await supabase
                      .from("creative_assignments")
                      .update({
                        status: "error",
                        error_message: `TikTok video ads require a thumbnail. Auto-generation failed: ${(thumbnailError as Error).message}. Please upload a thumbnail image for this creative.`,
                      })
                      .eq("id", assignment.id);
                    localFailed++;
                    continue;
                  }
                } else {
                  // No source for thumbnail - fail with clear error
                  console.error(`[push-creatives] ❌ No thumbnail source available for video ad`);
                  await supabase
                    .from("creative_assignments")
                    .update({
                      status: "error",
                      error_message: "TikTok video ads require a thumbnail image (image_ids). Please upload a thumbnail for this creative before pushing to TikTok.",
                    })
                    .eq("id", assignment.id);
                  localFailed++;
                  continue;
                }
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
                  
                  // Clear the invalid image hash and advertiser association to force re-upload on next attempt
                  await supabase
                    .from("creatives")
                    .update({ 
                      platform_image_hash: null, 
                      tiktok_asset_advertiser_id: null,
                      dsp_upload_status: null 
                    })
                    .eq("id", creative.id);
                  
                  await supabase
                    .from("creative_assignments")
                    .update({
                      status: "error",
                      error_message: `TikTok image not accessible for this advertiser (may be uploaded to different account). Will retry with fresh upload. Original error: ${imageInfoResult.message || 'Image not found in account'}`,
                    })
                    .eq("id", assignment.id);
                  
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
            // For Dark Ads: Use CUSTOMIZED_USER with valid identity_id from /identity/get/
            // For Spark Ads: Use TIKTOK_ACCOUNT with identity_id
            // TikTok v1.3 REQUIRES identity_id for both types

            const tiktokAdCreateUrlV13 = "https://business-api.tiktok.com/open_api/v1.3/ad/create/";
            const tiktokAdCreateUrlV12 = "https://business-api.tiktok.com/open_api/v1.2/ad/create/";

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

            // Ensure we NEVER send Business Center authorization fields to /ad/create.
            delete payload.creatives[0].bc_id;
            delete payload.creatives[0].identity_authorized_bc_id;
            
            // Set display_name (required for CUSTOMIZED_USER)
            if (displayNameForAd) {
              payload.creatives[0].display_name = displayNameForAd;
            }

            // Log the full TikTok API request with all context
            logger.logTikTokRequest(tiktokAdCreateUrlV13, "POST", payload, {
              advertiserId: advertiserIdStr,
              identityId: finalIdentityId,
              identityType: identityType,
              tokenContext,
              adGroupId: entry.dsp_entity_id,
            }, "ad/create v1.3");

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

            // Log the response
            logger.logTikTokResponse(tiktokAdCreateUrlV13, tiktokAdData, {
              advertiserId: advertiserIdStr,
              identityId: finalIdentityId,
              identityType: identityType,
              tokenContext,
            }, "ad/create v1.3");

            adId = tiktokAdData?.data?.ad_ids?.[0] ? String(tiktokAdData.data.ad_ids[0]) : null;
            if (tiktokAdData?.code === 0 && adId) {
              console.log(`[push-creatives] ✅ TikTok Ad created successfully with identity_type=${identityType}, identity_id=${finalIdentityId}, ad_id=${adId}`);
            } else {
              const msg = String(tiktokAdData?.message || "");
              console.log(
                `[push-creatives] TikTok ad/create (v1.3) failed identity_type=${identityType} identity_id=${finalIdentityId} code=${tiktokAdData?.code} message=${msg}`,
              );

              // ========== FALLBACK: Try v1.2 API if v1.3 failed ==========
              console.log(`[push-creatives] v1.3 failed, trying v1.2 API with identity_type=${identityType}, identity_id=${finalIdentityId}`);
              
              const payloadV12 = JSON.parse(JSON.stringify(basePayload));
              
              // Add display name
              if (displayNameForAd) {
                payloadV12.creatives[0].display_name = displayNameForAd;
              }

              // Ensure we NEVER send Business Center authorization fields to /ad/create.
              delete payloadV12.creatives[0].bc_id;
              delete payloadV12.creatives[0].identity_authorized_bc_id;

              // Log the v1.2 fallback request
              logger.logTikTokRequest(tiktokAdCreateUrlV12, "POST", payloadV12, {
                advertiserId: advertiserIdStr,
                identityId: finalIdentityId,
                identityType: identityType,
                tokenContext,
                adGroupId: entry.dsp_entity_id,
              }, "ad/create v1.2 FALLBACK");

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
              
              // Log the v1.2 response
              logger.logTikTokResponse(tiktokAdCreateUrlV12, tiktokAdDataV12, {
                advertiserId: advertiserIdStr,
                identityId: finalIdentityId,
                identityType: identityType,
                tokenContext,
              }, "ad/create v1.2 FALLBACK");
              
              adId = tiktokAdDataV12?.data?.ad_ids?.[0] ? String(tiktokAdDataV12.data.ad_ids[0]) : null;

              if (tiktokAdDataV12?.code === 0 && adId) {
                console.log(`[push-creatives] ✅ TikTok ad/create (v1.2) succeeded identity_type=${identityType}, identity_id=${finalIdentityId}, ad_id=${adId}`);
              } else {
                const msgV12 = String(tiktokAdDataV12?.message || "");
                console.log(
                  `[push-creatives] TikTok ad/create (v1.2) failed identity_type=${identityType}, identity_id=${finalIdentityId}, code=${tiktokAdDataV12?.code}, message=${msgV12}`,
                );
              }
            }

            if (!adId) {
              const msg = String(lastTikTokResponse?.message || "Failed to create TikTok ad");
              const errorCode = lastTikTokResponse?.code;
              
              // Provide actionable error messages based on error code
              let actionableError = msg;
              if (errorCode === 40002 && msg.toLowerCase().includes("image")) {
                // Specific handling for missing thumbnail error
                actionableError = `TikTok requires a thumbnail image for video ads (code ${errorCode}). The video may not have generated a cover image. Please upload a thumbnail image or wait for TikTok to finish processing the video.`;
              } else if (errorCode === 40700 || errorCode === 40002) {
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
