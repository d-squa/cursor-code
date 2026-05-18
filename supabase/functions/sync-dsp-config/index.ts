import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isMissingTableError(error: { code?: string; message?: string } | null, tableName: string): boolean {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    message.includes(`public.${tableName}`) ||
    message.includes(`'${tableName}'`)
  );
}

function missingTableResponse(tableName: string, migrationHint: string): Response {
  return new Response(
    JSON.stringify({
      error: `Database table public.${tableName} is missing. Apply migration ${migrationHint} in Supabase SQL Editor, then retry.`,
      code: "SCHEMA_MISSING",
      table: tableName,
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

interface ConfigChange {
  campaign_id: string;
  platform: string;
  entity_type: string;
  entity_name: string | null;
  dsp_entity_id: string;
  market: string | null;
  phase_name: string | null;
  change_category: string;
  field_name: string;
  field_label: string;
  actiplan_value: string | null;
  dsp_value: string | null;
}

interface ExistingChangeRow {
  id: string;
  platform: string;
  entity_type: string;
  dsp_entity_id: string;
  field_name: string;
  dsp_value: string | null;
  is_acknowledged: boolean;
  detected_at: string;
  acknowledged_at: string | null;
}

// Field mappings for human-readable labels
const META_CAMPAIGN_FIELDS: Record<string, { label: string; category: string }> = {
  name: { label: "Campaign Name", category: "naming" },
  daily_budget: { label: "Daily Budget", category: "budget" },
  lifetime_budget: { label: "Lifetime Budget", category: "budget" },
  start_time: { label: "Start Date", category: "schedule" },
  stop_time: { label: "End Date", category: "schedule" },
  status: { label: "Status", category: "status" },
  objective: { label: "Objective", category: "targeting" },
  bid_strategy: { label: "Bid Strategy", category: "budget" },
};

const META_ADSET_FIELDS: Record<string, { label: string; category: string }> = {
  name: { label: "Ad Set Name", category: "naming" },
  daily_budget: { label: "Daily Budget", category: "budget" },
  lifetime_budget: { label: "Lifetime Budget", category: "budget" },
  start_time: { label: "Start Date", category: "schedule" },
  end_time: { label: "End Date", category: "schedule" },
  optimization_goal: { label: "Optimization Goal", category: "targeting" },
  billing_event: { label: "Billing Event", category: "budget" },
  bid_amount: { label: "Bid Amount", category: "budget" },
  status: { label: "Status", category: "status" },
  targeting: { label: "Targeting", category: "targeting" },
};

const TIKTOK_CAMPAIGN_FIELDS: Record<string, { label: string; category: string }> = {
  campaign_name: { label: "Campaign Name", category: "naming" },
  budget: { label: "Budget", category: "budget" },
  budget_mode: { label: "Budget Type", category: "budget" },
  operation_status: { label: "Status", category: "status" },
  objective_type: { label: "Objective", category: "targeting" },
};

const TIKTOK_ADGROUP_FIELDS: Record<string, { label: string; category: string }> = {
  adgroup_name: { label: "Ad Group Name", category: "naming" },
  budget: { label: "Budget", category: "budget" },
  schedule_start_time: { label: "Start Date", category: "schedule" },
  schedule_end_time: { label: "End Date", category: "schedule" },
  optimization_goal: { label: "Optimization Goal", category: "targeting" },
  billing_event: { label: "Billing Event", category: "budget" },
  bid_price: { label: "Bid Amount", category: "budget" },
  operation_status: { label: "Status", category: "status" },
  location_ids: { label: "Targeted Locations", category: "targeting" },
  age_groups: { label: "Age Groups", category: "targeting" },
  gender: { label: "Gender", category: "targeting" },
  languages: { label: "Languages", category: "targeting" },
  placement_type: { label: "Placement Type", category: "targeting" },
  placements: { label: "Placements", category: "targeting" },
};

function normalizeValue(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function getChangeKey(change: Pick<ConfigChange, "platform" | "entity_type" | "dsp_entity_id" | "field_name" | "dsp_value">): string {
  return [change.platform, change.entity_type, change.dsp_entity_id, change.field_name, change.dsp_value ?? ""].join("::");
}

function getExistingChangeKey(change: Pick<ExistingChangeRow, "platform" | "entity_type" | "dsp_entity_id" | "field_name" | "dsp_value">): string {
  return [change.platform, change.entity_type, change.dsp_entity_id, change.field_name, change.dsp_value ?? ""].join("::");
}

function dedupeChanges(changes: ConfigChange[]): ConfigChange[] {
  const uniqueChanges = new Map<string, ConfigChange>();

  for (const change of changes) {
    uniqueChanges.set(getChangeKey(change), change);
  }

  return Array.from(uniqueChanges.values());
}

// Convert Meta budget from cents to dollars
function metaBudgetFromCents(cents: string | number | null): number | null {
  if (cents === null || cents === undefined) return null;
  return Number(cents) / 100;
}

// Format Meta date to ISO date
function metaDateToISO(metaDate: string | null): string | null {
  if (!metaDate) return null;
  try {
    return new Date(metaDate).toISOString().split("T")[0];
  } catch {
    return metaDate;
  }
}

async function fetchMetaCampaignConfig(
  accessToken: string,
  dspEntityId: string,
): Promise<any | null> {
  try {
    const fields = "name,objective,daily_budget,lifetime_budget,start_time,stop_time,status,effective_status,bid_strategy";
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${dspEntityId}?fields=${fields}&access_token=${accessToken}`,
    );
    const data = await response.json();
    if (data.error) {
      console.error(`Meta campaign fetch error for ${dspEntityId}:`, data.error);
      return null;
    }
    return data;
  } catch (e) {
    console.error(`Failed to fetch Meta campaign ${dspEntityId}:`, e);
    return null;
  }
}

async function fetchMetaAdSets(
  accessToken: string,
  campaignDspId: string,
): Promise<any[]> {
  try {
    const fields = "name,daily_budget,lifetime_budget,start_time,end_time,optimization_goal,billing_event,bid_amount,status,effective_status,targeting";
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${campaignDspId}/adsets?fields=${fields}&limit=100&access_token=${accessToken}`,
    );
    const data = await response.json();
    if (data.error) {
      console.error(`Meta ad sets fetch error:`, data.error);
      return [];
    }
    return data.data || [];
  } catch (e) {
    console.error(`Failed to fetch Meta ad sets:`, e);
    return [];
  }
}

async function fetchMetaAds(
  accessToken: string,
  campaignDspId: string,
): Promise<any[]> {
  try {
    const fields = "name,status,effective_status,adset_id,creative{id,name,thumbnail_url}";
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${campaignDspId}/ads?fields=${fields}&limit=200&access_token=${accessToken}`,
    );
    const data = await response.json();
    if (data.error) {
      console.error(`Meta ads fetch error:`, data.error);
      return [];
    }
    return data.data || [];
  } catch (e) {
    console.error(`Failed to fetch Meta ads:`, e);
    return [];
  }
}

async function fetchTikTokCampaignConfig(
  accessToken: string,
  advertiserId: string,
  campaignId: string,
): Promise<any | null> {
  try {
    const response = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${advertiserId}&campaign_ids=["${campaignId}"]`,
      {
        headers: {
          "Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      },
    );
    const data = await response.json();
    if (data.code === 0 && data.data?.list?.[0]) {
      return data.data.list[0];
    }
    console.error(`TikTok campaign fetch error for ${campaignId}:`, data);
    return null;
  } catch (e) {
    console.error(`Failed to fetch TikTok campaign ${campaignId}:`, e);
    return null;
  }
}

async function fetchTikTokAdGroups(
  accessToken: string,
  advertiserId: string,
  campaignId: string,
): Promise<any[]> {
  try {
    const response = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/adgroup/get/?advertiser_id=${advertiserId}&campaign_ids=["${campaignId}"]&page_size=100`,
      {
        headers: {
          "Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      },
    );
    const data = await response.json();
    if (data.code === 0 && data.data?.list) {
      return data.data.list;
    }
    return [];
  } catch (e) {
    console.error(`Failed to fetch TikTok ad groups:`, e);
    return [];
  }
}

async function fetchTikTokAds(
  accessToken: string,
  advertiserId: string,
  adgroupId: string,
): Promise<any[]> {
  try {
    const response = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/ad/get/?advertiser_id=${advertiserId}&adgroup_ids=["${adgroupId}"]&page_size=100`,
      {
        headers: {
          "Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      },
    );
    const data = await response.json();
    if (data.code === 0 && data.data?.list) {
      return data.data.list;
    }
    return [];
  } catch (e) {
    console.error(`Failed to fetch TikTok ads:`, e);
    return [];
  }
}

function diffMetaCampaign(
  campaignId: string,
  launchEntry: any,
  dspData: any,
): ConfigChange[] {
  const changes: ConfigChange[] = [];

  for (const [field, config] of Object.entries(META_CAMPAIGN_FIELDS)) {
    const dspVal = dspData[field];
    if (dspVal === undefined) continue;

    let processedDspVal = dspVal;
    if (field === "daily_budget" || field === "lifetime_budget") {
      processedDspVal = metaBudgetFromCents(dspVal);
    }
    if (field === "start_time" || field === "stop_time") {
      processedDspVal = metaDateToISO(dspVal);
    }

    changes.push({
      campaign_id: campaignId,
      platform: "Meta",
      entity_type: "campaign",
      entity_name: dspData.name || launchEntry.entity_name,
      dsp_entity_id: launchEntry.dsp_entity_id,
      market: launchEntry.market,
      phase_name: launchEntry.phase_name,
      change_category: config.category,
      field_name: field,
      field_label: config.label,
      actiplan_value: null,
      dsp_value: normalizeValue(processedDspVal),
    });
  }

  return changes;
}

function diffTikTokCampaign(
  campaignId: string,
  launchEntry: any,
  dspData: any,
): ConfigChange[] {
  const changes: ConfigChange[] = [];

  for (const [field, config] of Object.entries(TIKTOK_CAMPAIGN_FIELDS)) {
    const dspVal = dspData[field];
    if (dspVal === undefined) continue;

    changes.push({
      campaign_id: campaignId,
      platform: "TikTok",
      entity_type: "campaign",
      entity_name: dspData.campaign_name || launchEntry.entity_name,
      dsp_entity_id: launchEntry.dsp_entity_id,
      market: launchEntry.market,
      phase_name: launchEntry.phase_name,
      change_category: config.category,
      field_name: field,
      field_label: config.label,
      actiplan_value: null,
      dsp_value: normalizeValue(dspVal),
    });
  }

  return changes;
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
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Service configuration error");
    }

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

    const { campaignId } = await req.json();
    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaignId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get launch status entries with DSP IDs
    const { data: launchStatuses } = await supabase
      .from("campaign_launch_status")
      .select("*")
      .eq("campaign_id", campaignId)
      .not("dsp_entity_id", "is", null);

    if (!launchStatuses || launchStatuses.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pushed entities to sync", changes: [], newChanges: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Get connected platforms
    const { data: platforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const { data: existingChangesRaw, error: existingChangesError } = await supabase
      .from("dsp_config_changes")
      .select("id, platform, entity_type, dsp_entity_id, field_name, dsp_value, is_acknowledged, detected_at, acknowledged_at")
      .eq("campaign_id", campaignId);

    if (existingChangesError) {
      if (isMissingTableError(existingChangesError, "dsp_config_changes")) {
        return missingTableResponse("dsp_config_changes", "20260518160000_ensure_dsp_config_changes_table.sql");
      }
      throw existingChangesError;
    }

    const existingChanges = (existingChangesRaw || []) as ExistingChangeRow[];
    const isInitialSync = existingChanges.length === 0;

    const acknowledgedKeys = new Set(
      existingChanges.filter((change) => change.is_acknowledged).map(getExistingChangeKey),
    );

    const latestUnacknowledgedByKey = new Map(
      existingChanges
        .filter((change) => !change.is_acknowledged)
        .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())
        .map((change) => [getExistingChangeKey(change), change]),
    );

    const duplicateAcknowledgedIds = existingChanges
      .filter((change) => change.is_acknowledged)
      .sort((a, b) => {
        const timeA = new Date(a.acknowledged_at || a.detected_at).getTime();
        const timeB = new Date(b.acknowledged_at || b.detected_at).getTime();
        return timeB - timeA;
      })
      .reduce(
        (acc, change) => {
          const key = getExistingChangeKey(change);
          if (acc.seen.has(key)) {
            acc.ids.push(change.id);
          } else {
            acc.seen.add(key);
          }
          return acc;
        },
        { ids: [] as string[], seen: new Set<string>() },
      ).ids;

    const allChanges: ConfigChange[] = [];

    // Group by platform
    const metaEntities = launchStatuses.filter((s: any) => s.platform.toLowerCase().includes("meta"));
    const tiktokEntities = launchStatuses.filter((s: any) => s.platform.toLowerCase().includes("tiktok"));

    // === META SYNC ===
    const metaPlatform = platforms?.find((p: any) => p.platform_type === "meta");
    if (metaPlatform && metaEntities.length > 0) {
      const accessToken = await getAccessToken(supabase, metaPlatform.id, metaPlatform.access_token);

      if (accessToken) {
        const campaignEntities = metaEntities.filter((e: any) => e.entity_type === "campaign");
        for (const entry of campaignEntities) {
          const dspData = await fetchMetaCampaignConfig(accessToken, entry.dsp_entity_id);
          if (dspData) {
            const changes = diffMetaCampaign(campaignId, entry, dspData);
            allChanges.push(...changes);

            const adSets = await fetchMetaAdSets(accessToken, entry.dsp_entity_id);
            for (const adSet of adSets) {
              for (const [field, config] of Object.entries(META_ADSET_FIELDS)) {
                let dspVal = adSet[field];
                if (dspVal === undefined) continue;
                if (field === "daily_budget" || field === "lifetime_budget" || field === "bid_amount") {
                  dspVal = metaBudgetFromCents(dspVal);
                }
                if (field === "start_time" || field === "end_time") {
                  dspVal = metaDateToISO(dspVal);
                }
                if (field === "targeting") {
                  dspVal = JSON.stringify(dspVal);
                }

                allChanges.push({
                  campaign_id: campaignId,
                  platform: "Meta",
                  entity_type: "adset",
                  entity_name: adSet.name,
                  dsp_entity_id: adSet.id,
                  market: entry.market,
                  phase_name: entry.phase_name,
                  change_category: config.category,
                  field_name: field,
                  field_label: config.label,
                  actiplan_value: null,
                  dsp_value: normalizeValue(dspVal),
                });
              }
            }

            const ads = await fetchMetaAds(accessToken, entry.dsp_entity_id);
            for (const ad of ads) {
              allChanges.push({
                campaign_id: campaignId,
                platform: "Meta",
                entity_type: "ad",
                entity_name: ad.name,
                dsp_entity_id: ad.id,
                market: entry.market,
                phase_name: entry.phase_name,
                change_category: "creative",
                field_name: "ad_status",
                field_label: "Ad Status",
                actiplan_value: null,
                dsp_value: ad.effective_status || ad.status,
              });
            }
          }
        }
      }
    }

    // === TIKTOK SYNC ===
    const tiktokPlatform = platforms?.find((p: any) => p.platform_type === "tiktok");
    if (tiktokPlatform && tiktokEntities.length > 0) {
      const accessToken = await getAccessToken(supabase, tiktokPlatform.id, tiktokPlatform.access_token);

      if (accessToken) {
        const campaignEntities = tiktokEntities.filter((e: any) => e.entity_type === "campaign");
        for (const entry of campaignEntities) {
          const { data: tiktokCampaign } = await supabase
            .from("tiktok_campaigns")
            .select("advertiser_id")
            .eq("tiktok_campaign_id", entry.dsp_entity_id)
            .maybeSingle();

          const advertiserId = tiktokCampaign?.advertiser_id || tiktokPlatform.ad_account_id;
          if (!advertiserId) continue;

          const dspData = await fetchTikTokCampaignConfig(accessToken, advertiserId, entry.dsp_entity_id);
          if (dspData) {
            const changes = diffTikTokCampaign(campaignId, entry, dspData);
            allChanges.push(...changes);

            const adGroups = await fetchTikTokAdGroups(accessToken, advertiserId, entry.dsp_entity_id);
            for (const adGroup of adGroups) {
              for (const [field, config] of Object.entries(TIKTOK_ADGROUP_FIELDS)) {
                const dspVal = adGroup[field];
                if (dspVal === undefined) continue;

                allChanges.push({
                  campaign_id: campaignId,
                  platform: "TikTok",
                  entity_type: "adgroup",
                  entity_name: adGroup.adgroup_name,
                  dsp_entity_id: adGroup.adgroup_id,
                  market: entry.market,
                  phase_name: entry.phase_name,
                  change_category: config.category,
                  field_name: field,
                  field_label: config.label,
                  actiplan_value: null,
                  dsp_value: normalizeValue(dspVal),
                });
              }

              const ads = await fetchTikTokAds(accessToken, advertiserId, adGroup.adgroup_id);
              for (const ad of ads) {
                allChanges.push({
                  campaign_id: campaignId,
                  platform: "TikTok",
                  entity_type: "ad",
                  entity_name: ad.ad_name,
                  dsp_entity_id: ad.ad_id,
                  market: entry.market,
                  phase_name: entry.phase_name,
                  change_category: "creative",
                  field_name: "ad_status",
                  field_label: "Ad Status",
                  actiplan_value: null,
                  dsp_value: ad.operation_status || ad.status,
                });
              }
            }
          }
        }
      }
    }

    const uniqueChanges = dedupeChanges(allChanges);

    if (duplicateAcknowledgedIds.length > 0) {
      for (let i = 0; i < duplicateAcknowledgedIds.length; i += 100) {
        const chunk = duplicateAcknowledgedIds.slice(i, i + 100);
        const { error: deleteDuplicateError } = await supabase.from("dsp_config_changes").delete().in("id", chunk);
        if (deleteDuplicateError) {
          console.error("Error deleting duplicate acknowledged DSP changes:", deleteDuplicateError);
        }
      }
    }

    const { error: deleteUnacknowledgedError } = await supabase
      .from("dsp_config_changes")
      .delete()
      .eq("campaign_id", campaignId)
      .eq("is_acknowledged", false);

    if (deleteUnacknowledgedError) {
      throw deleteUnacknowledgedError;
    }

    // Insert only newly detected state that has not already been acknowledged
    if (uniqueChanges.length > 0) {
      const now = new Date().toISOString();
      const insertData = (isInitialSync
        ? uniqueChanges
        : uniqueChanges.filter((change) => !acknowledgedKeys.has(getChangeKey(change))))
        .map((c) => {
          const existingUnacknowledged = latestUnacknowledgedByKey.get(getChangeKey(c));

          return {
        ...c,
        detected_at: existingUnacknowledged?.detected_at || now,
        synced_at: now,
        // On initial sync (first time after push), auto-acknowledge everything
        // since these are the values we just pushed — not real changes
        is_acknowledged: isInitialSync ? true : false,
        acknowledged_at: isInitialSync ? now : existingUnacknowledged?.acknowledged_at || null,
        acknowledged_by: isInitialSync ? user.id : null,
          };
        });

      // Batch insert in chunks of 50
      for (let i = 0; i < insertData.length; i += 50) {
        const chunk = insertData.slice(i, i + 50);
        const { error: insertError } = await supabase.from("dsp_config_changes").insert(chunk);
        if (insertError) {
          console.error("Error inserting config changes:", insertError);
        }
      }
    }

    const resultMessage = isInitialSync
      ? `Initial baseline captured for campaign ${campaignId}: ${uniqueChanges.length} fields stored`
      : `DSP config sync complete for campaign ${campaignId}: ${uniqueChanges.length} total fields synced`;

    console.log(resultMessage);

    return new Response(
      JSON.stringify({
        success: true,
        isInitialSync,
        totalFields: uniqueChanges.length,
        changes: isInitialSync
          ? 0
          : uniqueChanges.filter((change) => !acknowledgedKeys.has(getChangeKey(change))).length,
        platforms: {
          meta: metaEntities.length,
          tiktok: tiktokEntities.length,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("DSP config sync error:", error);
    if (isMissingTableError(error, "dsp_config_changes")) {
      return missingTableResponse("dsp_config_changes", "20260518160000_ensure_dsp_config_changes_table.sql");
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
