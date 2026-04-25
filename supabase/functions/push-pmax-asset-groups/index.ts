// push-pmax-asset-groups
//
// Phase 2 of the PMax push split. The PMax campaign shell is created by
// `push-campaign-to-dsp`, which marks each planned asset-group row in
// `campaign_launch_status` as `awaiting_assets`. This function:
//
//   1) Loads the campaign + (optionally filtered) `awaiting_assets` rows
//   2) Resolves the parent PMax campaign's DSP id (`pushed_to_dsp` campaign row)
//   3) Pulls `creative_assignments` for the row's (market, phase, ad_set_name)
//   4) Builds text + image buckets (1.91:1, 1:1, 4:5, logo) using dimensions first
//   5) Calls `googleAdapter.createPmaxAssetGroup` and updates the row status
//
// It can be invoked:
//   - automatically from the client when PMax validation passes
//     (`TextAssetsStep.handleSaveAndProceed`), or
//   - manually from the `/status` page via the per-PMax-campaign
//     "Push Asset Groups" button.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getAccessTokenWithRefresh } from "../_shared/vault-helper.ts";
import { getGooglePlatformCandidatesForCustomer } from "../_shared/platform-connection-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const InputSchema = z.object({
  campaignId: z.string().uuid(),
  // Optional scoping — when omitted, push every awaiting_assets row.
  market: z.string().optional(),
  phaseName: z.string().optional(),
  // When true, also retry rows previously marked `push_failed`.
  retryFailed: z.boolean().optional().default(false),
});

interface AssetGroupResult {
  rowId: string;
  market: string;
  phase: string;
  groupName: string;
  status: "pushed_to_dsp" | "push_failed";
  dspEntityId?: string;
  error?: string;
}

const MAX_ROWS_PER_INVOCATION = 1;
const STALE_PUSHING_MS = 2 * 60 * 1000;

const uniqueLimited = (items: string[], max: number) =>
  Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, max);

function aspect(width?: number | null, height?: number | null): number | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  return width / height;
}

function isNear(value: number, target: number, tolerance = 0.05): boolean {
  return Math.abs(value - target) <= tolerance * target;
}

// Dimension-first image bucketing. Filename hints are fallback only; relying on
// names caused `_SQ_` assets to be uploaded as horizontal images and Google
// rejected the final AssetGroup for aspect-ratio mismatch.
function bucketImageAsset(creative: any, url: string): "logo" | "square" | "marketing" | "portrait" | "invalid" {
  const w = Number(creative?.width || 0);
  const h = Number(creative?.height || 0);
  const ratio = aspect(w, h);
  const hay = `${creative?.original_filename || ""} ${creative?.name || ""} ${creative?.folder_path || ""} ${url}`.toLowerCase();
  const logoHint = /\blogo\b/.test(hay);
  const squareHint = /(?:^|[_\-\s])(sq|square|1x1|1_1|1-1)(?:[_\-\s.]|$)/.test(hay);

  if (ratio != null) {
    if (isNear(ratio, 1)) {
      if (logoHint || Math.max(w, h) <= 512) return "logo";
      return "square";
    }
    if (isNear(ratio, 1.91, 0.06) || isNear(ratio, 16 / 9, 0.03)) return "marketing";
    if (isNear(ratio, 0.8, 0.03)) return "portrait";
    return "invalid";
  }

  if (logoHint) return "logo";
  if (squareHint) return "square";
  return "marketing";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const parsed = InputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { campaignId, market: marketFilter, phaseName: phaseFilter, retryFailed } = parsed.data;

    // ----- Load campaign -----
    const { data: campaign, error: campaignErr } = await supabase
      .from("campaigns")
      .select("id, user_id, name, platforms, market_splits")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignErr || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campaign not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Clear rows left in `pushing` by a previous runtime timeout so the UI never
    // shows an infinite in-progress state. Retried requests include push_failed.
    let stalePushingQuery = supabase
      .from("campaign_launch_status")
      .update({
        status: "push_failed",
        error_message: "Previous PMax asset group push timed out before completing. Please retry.",
        updated_at: new Date().toISOString(),
      })
      .eq("campaign_id", campaignId)
      .eq("platform", "Google Ads")
      .eq("entity_type", "adset")
      .eq("status", "pushing")
      .lt("updated_at", new Date(Date.now() - STALE_PUSHING_MS).toISOString());

    if (marketFilter) stalePushingQuery = stalePushingQuery.eq("market", marketFilter);
    if (phaseFilter) stalePushingQuery = stalePushingQuery.eq("phase_name", phaseFilter);
    await stalePushingQuery;

    // ----- Load awaiting_assets (and optionally push_failed) PMax rows -----
    const eligibleStatuses = retryFailed
      ? ["awaiting_assets", "push_failed", "assets_incomplete"]
      : ["awaiting_assets"];

    let rowsQuery = supabase
      .from("campaign_launch_status")
      .select("id, market, phase_name, entity_name, status, dsp_entity_id")
      .eq("campaign_id", campaignId)
      .eq("platform", "Google Ads")
      .eq("entity_type", "adset")
      .in("status", eligibleStatuses);

    if (marketFilter) rowsQuery = rowsQuery.eq("market", marketFilter);
    if (phaseFilter) rowsQuery = rowsQuery.eq("phase_name", phaseFilter);

    const { data: pendingRows, error: pendingErr } = await rowsQuery;
    if (pendingErr) {
      return new Response(
        JSON.stringify({ error: pendingErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!pendingRows || pendingRows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No PMax asset groups awaiting push", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Keep each invocation bounded. Large PMax pushes can otherwise exceed the
    // edge runtime CPU limit and leave every row stuck in `pushing`.
    const rowsToProcess = pendingRows.slice(0, MAX_ROWS_PER_INVOCATION);
    const deferredCount = Math.max(0, pendingRows.length - rowsToProcess.length);

    // ----- Resolve parent PMax campaign DSP IDs (per market+phase) -----
    const { data: campaignShellRows } = await supabase
      .from("campaign_launch_status")
      .select("market, phase_name, dsp_entity_id, entity_name")
      .eq("campaign_id", campaignId)
      .eq("platform", "Google Ads")
      .eq("entity_type", "campaign")
      .ilike("entity_name", "PMAX%")
      .in("status", ["pushed", "pushed_to_dsp", "live"]);

    const shellByKey = new Map<string, string>();
    for (const c of campaignShellRows || []) {
      if (c.dsp_entity_id) {
        shellByKey.set(`${c.market}|${c.phase_name}`, c.dsp_entity_id);
      }
    }

    // ----- Resolve Google credentials -----
    // Find the Google connection from the campaign's `platforms` config.
    const platformsArr = Array.isArray(campaign.platforms) ? campaign.platforms : [];
    const googlePlatformConfig = platformsArr.find(
      (p: any) => String(p?.id || p?.platform_type || "").toLowerCase().includes("google"),
    );

    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const managerAccountId = Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID");
    if (!developerToken) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_ADS_DEVELOPER_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { getPlatformAdapter } = await import("../_shared/platform-adapter.ts");
    const googleAdapter = getPlatformAdapter("google") as any;

    // Heavy work — Google Ads API calls per asset group — is processed in a
    // small bounded batch so every row either succeeds or receives an error.
    const processAll = async () => {
      const results: AssetGroupResult[] = [];

    // Group pending rows by market so we resolve customer/credentials once per market.
	    const rowsByMarket = new Map<string, typeof rowsToProcess>();
	    for (const row of rowsToProcess) {
      const arr = rowsByMarket.get(row.market) || [];
      arr.push(row);
      rowsByMarket.set(row.market, arr);
    }

    for (const [marketName, marketRows] of rowsByMarket) {
      // Find the per-market customer ID using the same source as the shell push.
      // Campaign `platforms` may only contain `{ id, name }`, while the real
      // Google market/account config is stored under `market_splits.google`.
      const platformMarketsObj = googlePlatformConfig?.markets || {};
      const splitMarkets = Array.isArray((campaign as any).market_splits?.google)
        ? (campaign as any).market_splits.google
        : [];
      const marketEntry = Object.entries(platformMarketsObj).find(
        ([code, m]: [string, any]) =>
          code === marketName ||
          m?.code === marketName ||
          m?.name === marketName,
      ) as [string, any] | undefined;
      const splitMarketCfg = splitMarkets.find(
        (m: any) => m?.name === marketName || m?.code === marketName || m?.market === marketName,
      );
      const marketCfg = marketEntry?.[1] || splitMarketCfg;
      const googleCustomerId =
        marketCfg?.googleCustomerId || marketCfg?.adAccountId || marketCfg?.ad_account_id ||
        googlePlatformConfig?.ad_account_id;

      if (!googleCustomerId) {
        for (const row of marketRows) {
          await supabase
            .from("campaign_launch_status")
            .update({
              status: "push_failed",
              error_message: "Missing Google Ads customer ID for market",
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          results.push({
            rowId: row.id,
            market: row.market,
            phase: row.phase_name || "",
            groupName: row.entity_name || "",
            status: "push_failed",
            error: "Missing customer ID",
          });
        }
        continue;
      }

      const cleanCustomerId = String(googleCustomerId).replace(/-/g, "");

      // Resolve a Google connection that can access this customer.
      let accessToken: string | null = null;
      try {
        const candidates = await getGooglePlatformCandidatesForCustomer(
          supabase,
          campaign.user_id,
          cleanCustomerId,
        );
        if (candidates.length > 0) {
          accessToken = await getAccessTokenWithRefresh(
            supabase,
            candidates[0].id,
            candidates[0].access_token,
            "google",
          );
        }
      } catch (resolveErr) {
        console.warn("Token resolve error", resolveErr);
      }

      if (!accessToken) {
        for (const row of marketRows) {
          await supabase
            .from("campaign_launch_status")
            .update({
              status: "push_failed",
              error_message: "Could not obtain Google Ads access token",
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          results.push({
            rowId: row.id,
            market: row.market,
            phase: row.phase_name || "",
            groupName: row.entity_name || "",
            status: "push_failed",
            error: "No access token",
          });
        }
        continue;
      }

      // Resolve manager id for this customer.
      let effectiveManagerId = managerAccountId || "";
      try {
        const { data: googleAccount } = await supabase
          .from("google_ad_accounts")
          .select("manager_customer_id")
          .or(`customer_id.eq.${cleanCustomerId},customer_id.eq.${googleCustomerId}`)
          .maybeSingle();
        if (googleAccount?.manager_customer_id) {
          effectiveManagerId = googleAccount.manager_customer_id;
        }
      } catch (_) { /* ignore */ }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
        ...(effectiveManagerId
          ? { "login-customer-id": String(effectiveManagerId).replace(/-/g, "") }
          : {}),
      };

      // ----- Per-row asset group creation -----
      for (const row of marketRows) {
        const shellKey = `${row.market}|${row.phase_name}`;
        const parentCampaignId = shellByKey.get(shellKey);

        if (!parentCampaignId) {
          await supabase
            .from("campaign_launch_status")
            .update({
              status: "push_failed",
              error_message: `Parent PMax campaign not pushed yet for ${row.market}/${row.phase_name}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          results.push({
            rowId: row.id,
            market: row.market,
            phase: row.phase_name || "",
            groupName: row.entity_name || "",
            status: "push_failed",
            error: "Parent campaign shell not pushed",
          });
          continue;
        }

        // Do not persist a long-running "pushing" state here. If the edge
        // runtime kills the invocation for CPU time, a persisted in-progress
        // state becomes an infinite spinner. The UI already shows local button
        // progress while this single asset group is being processed.
        // Pull creative_assignments for this asset group.
        const { data: assignments } = await supabase
          .from("creative_assignments")
          .select(`
            id, creative_id, ad_set_name, position, ad_group_name,
            headline, headline_2, headline_3, headline_4, headline_5,
            long_headline_1, long_headline_2, long_headline_3, long_headline_4, long_headline_5,
            description, description_2, description_3, description_4, description_5,
            primary_text, business_name, brand_name, destination_url, call_to_action,
            creative:creatives(id, name, media_type, media_urls, thumbnail_url, original_filename, folder_path, width, height, aspect_ratio, platform_video_id, destination_url)
          `)
          .eq("campaign_id", campaignId)
          .eq("platform", "google")
          .eq("market", row.market)
          .eq("phase_name", row.phase_name);

        const all = assignments || [];
        // Match by ad_set_name (or ad_group_name) → fallback to all phase rows.
        const matched = all.filter(
          (a: any) =>
            (a.ad_set_name && row.entity_name && a.ad_set_name === row.entity_name) ||
            (a.ad_group_name && row.entity_name && a.ad_group_name === row.entity_name),
        );
        const groupAssignments = matched.length > 0 ? matched : all;

        // Aggregate text assets.
        const headlines: string[] = [];
        const longHeadlines: string[] = [];
        const descriptions: string[] = [];
        const marketingImgs: string[] = [];
        const squareImgs: string[] = [];
        const logoImgs: string[] = [];
        const ytVideoIds: string[] = [];

        for (const a of groupAssignments) {
          for (const k of ["headline", "headline_2", "headline_3", "headline_4", "headline_5"] as const) {
            if (a[k]) headlines.push(a[k]);
          }
          for (const k of ["long_headline_1", "long_headline_2", "long_headline_3", "long_headline_4", "long_headline_5"] as const) {
            if (a[k]) longHeadlines.push(a[k]);
          }
          for (const k of ["description", "description_2", "description_3", "description_4", "description_5"] as const) {
            if (a[k]) descriptions.push(a[k]);
          }
          if (a.primary_text) descriptions.push(a.primary_text);

          const c: any = a.creative;
          if (c?.media_type === "image" && Array.isArray(c.media_urls)) {
            for (const u of c.media_urls) {
              const url = String(u || "");
              if (!url) continue;
              const bucket = bucketImageAsset(c, url);
              if (bucket === "logo") logoImgs.push(url);
              else if (bucket === "square") squareImgs.push(url);
              else if (bucket === "marketing") marketingImgs.push(url);
              else console.warn(`[pmax] skipping image with unsupported aspect ratio: ${c?.name || c?.original_filename || url} (${c?.width || "?"}x${c?.height || "?"})`);
            }
          }
          if (c?.platform_video_id) {
            ytVideoIds.push(c.platform_video_id);
          }
        }

        const finalUrl =
          (groupAssignments[0] as any)?.destination_url ||
          (groupAssignments[0] as any)?.creative?.destination_url ||
          marketCfg?.googleLandingPageUrl ||
          "https://example.com";

        const businessName =
          (groupAssignments[0] as any)?.business_name ||
          (groupAssignments[0] as any)?.brand_name ||
          marketCfg?.googleBusinessName ||
          campaign.name ||
          "Brand";

        const groupName = row.entity_name || `${campaign.name} - ${row.market} - ${row.phase_name}`;
        const ctaEnum = String((groupAssignments[0] as any)?.call_to_action || "LEARN_MORE").toUpperCase();
        const hasMerchantCenter = Boolean(marketCfg?.googleMerchantCenterId);

        try {
          const assetGroupResource = await googleAdapter.createPmaxAssetGroup(
            cleanCustomerId,
            headers,
            {
              campaignId: parentCampaignId,
              name: groupName,
              finalUrl,
              status: "PAUSED",
              headlines: uniqueLimited(headlines, 5),
              longHeadlines: uniqueLimited(longHeadlines, 5),
              descriptions: uniqueLimited(descriptions, 5),
              businessName: String(businessName).substring(0, 25),
              callToAction: ctaEnum,
              // Google PMax true maximums per asset group.
              marketingImages: uniqueLimited(marketingImgs, 20),
              squareMarketingImages: uniqueLimited(squareImgs, 20),
              logoImages: uniqueLimited(logoImgs, 5),
              youtubeVideoIds: uniqueLimited(ytVideoIds, 5),
              hasMerchantCenter,
            },
          );

          if (assetGroupResource) {
            await supabase
              .from("campaign_launch_status")
              .update({
                status: "pushed_to_dsp",
                dsp_entity_id: assetGroupResource,
                error_message: null,
                error_details: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            results.push({
              rowId: row.id,
              market: row.market,
              phase: row.phase_name || "",
              groupName,
              status: "pushed_to_dsp",
              dspEntityId: assetGroupResource,
            });
          } else {
            throw new Error("createPmaxAssetGroup returned null");
          }
        } catch (err: any) {
          const msg = err?.message || String(err);
          console.error(`❌ PMax asset group "${groupName}" failed:`, msg);
          await supabase
            .from("campaign_launch_status")
            .update({
              status: "push_failed",
              error_message: `Asset group creation failed: ${msg}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          results.push({
            rowId: row.id,
            market: row.market,
            phase: row.phase_name || "",
            groupName,
            status: "push_failed",
            error: msg,
          });
        }
      }
    }
      return results;
    };

    const results = await processAll();
    const pushed = results.filter((r) => r.status === "pushed_to_dsp").length;
    const failed = results.filter((r) => r.status === "push_failed").length;

    return new Response(
      JSON.stringify({
        ok: failed === 0,
        pushed,
        failed,
        deferred: deferredCount,
        results,
        message: deferredCount > 0
          ? `Processed ${rowsToProcess.length} asset group; ${deferredCount} more remaining. Click Push Asset Groups again to continue.`
          : `Processed ${rowsToProcess.length} asset group.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("push-pmax-asset-groups fatal:", err);
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
