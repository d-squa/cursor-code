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
});

type PlatformKey = "meta" | "tiktok";

function toPlatformKey(platformLabel: string): PlatformKey | null {
  const p = platformLabel.toLowerCase();
  if (p.includes("meta") || p.includes("facebook")) return "meta";
  if (p.includes("tiktok")) return "tiktok";
  return null;
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
          brand_name,
          display_name,
          creative:creatives(
            id, name, media_type, creative_type,
            platform_video_id, platform_image_hash, platform_thumbnail_id,
            primary_text, headline, description, call_to_action,
            destination_url, url_parameters,
            external_page_id, tiktok_identity_id, tiktok_display_name, tiktok_ad_format,
            dsp_upload_status, brand_name, app_link
          )
        `,
        )
        .eq("campaign_id", campaign.id)
        .eq("platform", platformKey)
        .eq("market", entry.market)
        .eq("phase_name", entry.phase_name)
        .order("position");

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

      for (const assignment of assignments || []) {
        if (assignment.status === "pushed") continue;
        const creative = (assignment as any).creative;
        if (!creative) continue;

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

          const hasMetaAsset = creative.platform_image_hash || creative.platform_video_id;
          if (!hasMetaAsset) {
            const missingFields = [
              !creative.platform_image_hash ? "platform_image_hash" : null,
              !creative.platform_video_id ? "platform_video_id" : null,
            ].filter(Boolean);

            await supabase
              .from("creative_assignments")
              .update({
                status: "error",
                error_message: `Creative not uploaded to Meta (missing ${missingFields.join(" & ")})`,
              })
              .eq("id", assignment.id);
            localFailed++;
            continue;
          }

          const metaLandingPageUrl = (phase as any)?.metaLandingPageUrl || (market as any)?.metaLandingPageUrl;
          const pageId =
            creative.external_page_id || (market as any)?.metaPageId || (market as any)?.defaultPageId;

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
            };
            if (creative.platform_thumbnail_id) {
              creativePayload.object_story_spec.video_data.image_hash = creative.platform_thumbnail_id;
            }
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

          // URL parameters
          if (resolvedText.urlParameters) {
            if (creativePayload.object_story_spec.video_data?.call_to_action?.value?.link) {
              const url = new URL(creativePayload.object_story_spec.video_data.call_to_action.value.link);
              url.search = url.search ? `${url.search}&${resolvedText.urlParameters}` : `?${resolvedText.urlParameters}`;
              creativePayload.object_story_spec.video_data.call_to_action.value.link = url.toString();
            } else if (creativePayload.object_story_spec.link_data?.link) {
              const url = new URL(creativePayload.object_story_spec.link_data.link);
              url.search = url.search ? `${url.search}&${resolvedText.urlParameters}` : `?${resolvedText.urlParameters}`;
              creativePayload.object_story_spec.link_data.link = url.toString();
            }
          }

          const creativeResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/adcreatives`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...creativePayload, access_token: platform.access_token }),
          });
          const creativeData = await creativeResponse.json();

          if (creativeData?.error) {
            await supabase
              .from("creative_assignments")
              .update({ status: "error", error_message: creativeData.error.message || "Failed to create ad creative" })
              .eq("id", assignment.id);
            localFailed++;
            continue;
          }

          const adPayload = {
            name: creative.name,
            adset_id: entry.dsp_entity_id,
            creative: { creative_id: creativeData.id },
            status: "PAUSED",
          };

          const adResponse = await fetch(`https://graph.facebook.com/v22.0/${adAccountPath}/ads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...adPayload, access_token: platform.access_token }),
          });
          const adData = await adResponse.json();

          if (adData?.error || !adData?.id) {
            await supabase
              .from("creative_assignments")
              .update({ status: "error", error_message: adData?.error?.message || "Failed to create ad" })
              .eq("id", assignment.id);
            localFailed++;
            continue;
          }

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

          const hasTikTokAsset = creative.platform_video_id || creative.platform_image_hash;
          if (!hasTikTokAsset) {
            await supabase
              .from("creative_assignments")
              .update({
                status: "error",
                error_message: "Creative not uploaded to TikTok (missing platform_video_id/platform_image_hash)",
              })
              .eq("id", assignment.id);
            localFailed++;
            continue;
          }

          const identityId =
            creative.tiktok_identity_id || (market as any)?.tiktokIdentityId || (market as any)?.defaultIdentityId;
          if (!identityId) {
            await supabase
              .from("creative_assignments")
              .update({ status: "error", error_message: "No TikTok Identity ID configured" })
              .eq("id", assignment.id);
            localFailed++;
            continue;
          }

          const isVideo = creative.media_type === "video" || creative.creative_type === "video";
          const landingPageUrl = resolvedText.destinationUrl || (phase as any)?.landingPageUrl || (market as any)?.landingPageUrl;

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
