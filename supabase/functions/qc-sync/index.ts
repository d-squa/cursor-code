import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// QC state code to enum mapping
const QC_CODE_MAP: Record<string, string> = {
  WF: "waiting_for_final_qc",
  QC: "qc",
  PL: "pushed_live",
  DLV: "delivering",
};

const QC_STATE_ORDER = ["waiting_for_final_qc", "qc", "pushed_live", "delivering"];

interface QCParseResult {
  state: string | null;
  raw: string | null;
  isValid: boolean;
  error?: string;
  nameWithoutQC: string;
}

function parseQCFromName(name: string): QCParseResult {
  if (!name) return { state: null, raw: null, isValid: false, error: "Empty name", nameWithoutQC: "" };

  const parts = name.split("_");
  const lastPart = parts[parts.length - 1];
  const match = lastPart.match(/^QC-(WF|QC|PL|DLV)$/i);

  if (!match) {
    // Check if QC exists but not at the end
    const elsewhere = parts.findIndex((p, i) => i < parts.length - 1 && /^QC-(WF|QC|PL|DLV)$/i.test(p));
    if (elsewhere >= 0) {
      return { state: null, raw: parts[elsewhere], isValid: false, error: "QC parameter must be at the end", nameWithoutQC: parts.filter((_, i) => i !== elsewhere).join("_") };
    }
    const malformed = parts.find((p) => /^QC-/i.test(p));
    if (malformed) {
      return { state: null, raw: malformed, isValid: false, error: `Invalid QC value: ${malformed}`, nameWithoutQC: parts.filter((p) => p !== malformed).join("_") };
    }
    return { state: null, raw: null, isValid: false, error: "QC parameter missing", nameWithoutQC: name };
  }

  const code = match[1].toUpperCase();
  return { state: QC_CODE_MAP[code], raw: lastPart, isValid: true, nameWithoutQC: parts.slice(0, -1).join("_") };
}

async function fetchEntityName(platform: string, entityType: string, dspEntityId: string, accessToken: string): Promise<string | null> {
  try {
    if (platform === "meta") {
      const url = `https://graph.facebook.com/v21.0/${dspEntityId}?fields=name&access_token=${accessToken}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return data.name || null;
    }
    if (platform === "tiktok") {
      // TikTok entity name fetching handled separately
      return null;
    }
    if (platform === "google") {
      // Google Ads entity name fetching handled separately
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchEntityImpressions(platform: string, dspEntityId: string, accessToken: string): Promise<number> {
  try {
    if (platform === "meta") {
      const url = `https://graph.facebook.com/v21.0/${dspEntityId}/insights?fields=impressions&date_preset=lifetime&access_token=${accessToken}`;
      const res = await fetch(url);
      if (!res.ok) return 0;
      const data = await res.json();
      return parseInt(data.data?.[0]?.impressions || "0", 10);
    }
    return 0;
  } catch {
    return 0;
  }
}

async function renameEntity(platform: string, dspEntityId: string, newName: string, accessToken: string): Promise<boolean> {
  try {
    if (platform === "meta") {
      const url = `https://graph.facebook.com/v21.0/${dspEntityId}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, access_token: accessToken }),
      });
      return res.ok;
    }
    return false;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { campaignId, mode } = await req.json();
    if (!campaignId) throw new Error("Missing campaignId");

    console.log(`[qc-sync] Starting QC sync for campaign ${campaignId}, mode: ${mode || "sync"}`);

    // Get campaign launch statuses (DSP entities)
    const { data: launchStatuses, error: lsError } = await supabase
      .from("campaign_launch_status")
      .select("*")
      .eq("campaign_id", campaignId)
      .not("dsp_entity_id", "is", null);

    if (lsError) throw lsError;

    if (!launchStatuses || launchStatuses.length === 0) {
      return new Response(JSON.stringify({ message: "No DSP entities found", processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get existing QC tracking for this campaign
    const { data: existingTracking } = await supabase
      .from("qc_tracking")
      .select("*")
      .eq("campaign_id", campaignId);

    const existingMap = new Map((existingTracking || []).map((t: any) => [`${t.platform}-${t.dsp_entity_id}-${t.entity_type}`, t]));

    let processed = 0;
    let updated = 0;
    let errors = 0;
    const notifications: any[] = [];

    for (const entity of launchStatuses) {
      if (!entity.dsp_entity_id) continue;

      // Get platform connection for access token
      const { data: connections } = await supabase
        .from("connected_platforms")
        .select("id, platform_type")
        .eq("user_id", user.id)
        .eq("platform_type", entity.platform)
        .eq("is_active", true)
        .limit(1);

      // Also check team-level connections
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("team_id")
        .eq("id", campaignId)
        .single();

      let connectionId: string | null = null;
      if (connections && connections.length > 0) {
        connectionId = connections[0].id;
      } else if (campaign?.team_id) {
        const { data: teamConnections } = await supabase
          .from("connected_platforms")
          .select("id")
          .eq("team_id", campaign.team_id)
          .eq("platform_type", entity.platform)
          .eq("is_active", true)
          .limit(1);
        if (teamConnections && teamConnections.length > 0) {
          connectionId = teamConnections[0].id;
        }
      }

      if (!connectionId) {
        console.log(`[qc-sync] No connection found for platform ${entity.platform}`);
        continue;
      }

      const accessToken = await getAccessToken(supabase, connectionId);
      if (!accessToken) continue;

      // Fetch current entity name from DSP
      const currentName = await fetchEntityName(entity.platform, entity.entity_type, entity.dsp_entity_id, accessToken);
      if (!currentName) {
        processed++;
        continue;
      }

      // Parse QC state from name
      const qcResult = parseQCFromName(currentName);
      const key = `${entity.platform}-${entity.dsp_entity_id}-${entity.entity_type}`;
      const existing = existingMap.get(key) as any;

      // Check impressions if in pushed_live state or for auto-completion
      let impressions = 0;
      if (mode === "cron" || qcResult.state === "pushed_live") {
        impressions = await fetchEntityImpressions(entity.platform, entity.dsp_entity_id, accessToken);
      }

      // Auto-completion: if impressions > 1000, mark as delivering and remove QC param
      const isAutoComplete = impressions >= 1000 && qcResult.state !== "delivering";

      if (isAutoComplete) {
        // Remove QC parameter from DSP name
        const cleanName = qcResult.nameWithoutQC;
        const renamed = await renameEntity(entity.platform, entity.dsp_entity_id, cleanName, accessToken);
        console.log(`[qc-sync] Auto-complete: ${entity.dsp_entity_id} impressions=${impressions}, renamed=${renamed}`);

        // Upsert tracking as delivering
        const trackingData = {
          campaign_id: campaignId,
          platform: entity.platform,
          market: entity.market,
          phase_name: entity.phase_name,
          entity_type: entity.entity_type,
          entity_name: currentName,
          dsp_entity_id: entity.dsp_entity_id,
          current_state: "delivering",
          previous_state: existing?.current_state || qcResult.state,
          qc_parameter_raw: qcResult.raw,
          impressions_count: impressions,
          auto_completed: true,
          auto_completed_at: new Date().toISOString(),
          qc_removed_from_dsp: renamed,
          qc_removed_at: renamed ? new Date().toISOString() : null,
          is_valid: true,
          validation_error: null,
          team_id: campaign?.team_id,
          user_id: user.id,
        };

        if (existing) {
          await supabase.from("qc_tracking").update(trackingData).eq("id", existing.id);
        } else {
          await supabase.from("qc_tracking").insert(trackingData);
        }

        // Log transition
        const { data: trackingRecord } = await supabase
          .from("qc_tracking")
          .select("id")
          .eq("campaign_id", campaignId)
          .eq("dsp_entity_id", entity.dsp_entity_id)
          .eq("entity_type", entity.entity_type)
          .single();

        if (trackingRecord) {
          await supabase.from("qc_state_transitions").insert({
            qc_tracking_id: trackingRecord.id,
            campaign_id: campaignId,
            from_state: existing?.current_state || qcResult.state,
            to_state: "delivering",
            detected_via: mode === "cron" ? "cron" : "sync",
            impressions_at_transition: impressions,
            metadata: { auto_completed: true, renamed },
          });
        }

        notifications.push({
          type: "qc_auto_complete",
          entity_name: currentName,
          entity_type: entity.entity_type,
          platform: entity.platform,
          impressions,
        });

        updated++;
      } else if (qcResult.isValid && qcResult.state) {
        // Normal QC state update
        const hasChanged = !existing || existing.current_state !== qcResult.state;

        const trackingData = {
          campaign_id: campaignId,
          platform: entity.platform,
          market: entity.market,
          phase_name: entity.phase_name,
          entity_type: entity.entity_type,
          entity_name: currentName,
          dsp_entity_id: entity.dsp_entity_id,
          current_state: qcResult.state,
          previous_state: existing?.current_state || null,
          qc_parameter_raw: qcResult.raw,
          impressions_count: impressions,
          is_valid: true,
          validation_error: null,
          team_id: campaign?.team_id,
          user_id: user.id,
        };

        if (existing) {
          await supabase.from("qc_tracking").update(trackingData).eq("id", existing.id);
        } else {
          await supabase.from("qc_tracking").insert(trackingData);
        }

        if (hasChanged) {
          const { data: trackingRecord } = await supabase
            .from("qc_tracking")
            .select("id")
            .eq("campaign_id", campaignId)
            .eq("dsp_entity_id", entity.dsp_entity_id)
            .eq("entity_type", entity.entity_type)
            .single();

          if (trackingRecord) {
            // Check for skipped stages
            const fromIdx = existing?.current_state ? QC_STATE_ORDER.indexOf(existing.current_state) : -1;
            const toIdx = QC_STATE_ORDER.indexOf(qcResult.state);
            const skippedStages = fromIdx >= 0 && toIdx - fromIdx > 1 ? QC_STATE_ORDER.slice(fromIdx + 1, toIdx) : [];

            await supabase.from("qc_state_transitions").insert({
              qc_tracking_id: trackingRecord.id,
              campaign_id: campaignId,
              from_state: existing?.current_state || null,
              to_state: qcResult.state,
              detected_via: mode === "cron" ? "cron" : "sync",
              impressions_at_transition: impressions,
              metadata: skippedStages.length > 0 ? { skipped_stages: skippedStages } : null,
            });
          }

          notifications.push({
            type: "qc_state_change",
            entity_name: currentName,
            entity_type: entity.entity_type,
            platform: entity.platform,
            from_state: existing?.current_state || null,
            to_state: qcResult.state,
          });

          updated++;
        }
      } else if (!qcResult.isValid) {
        // QC validation error
        const trackingData = {
          campaign_id: campaignId,
          platform: entity.platform,
          market: entity.market,
          phase_name: entity.phase_name,
          entity_type: entity.entity_type,
          entity_name: currentName,
          dsp_entity_id: entity.dsp_entity_id,
          current_state: existing?.current_state || "waiting_for_final_qc",
          qc_parameter_raw: qcResult.raw,
          is_valid: false,
          validation_error: qcResult.error,
          team_id: campaign?.team_id,
          user_id: user.id,
        };

        if (existing) {
          await supabase.from("qc_tracking").update(trackingData).eq("id", existing.id);
        } else {
          await supabase.from("qc_tracking").insert(trackingData);
        }

        notifications.push({
          type: "qc_error",
          entity_name: currentName,
          entity_type: entity.entity_type,
          platform: entity.platform,
          error: qcResult.error,
        });

        errors++;
      }

      processed++;
    }

    // Log to campaign change history for notifications
    if (notifications.length > 0) {
      const notifSummary = notifications.map((n: any) => {
        if (n.type === "qc_auto_complete") {
          return `${n.platform} ${n.entity_type} "${n.entity_name}" auto-completed (${n.impressions} impressions)`;
        }
        if (n.type === "qc_state_change") {
          return `${n.platform} ${n.entity_type} "${n.entity_name}": ${n.from_state || "new"} → ${n.to_state}`;
        }
        if (n.type === "qc_error") {
          return `${n.platform} ${n.entity_type} "${n.entity_name}": QC Error - ${n.error}`;
        }
        return "";
      }).filter(Boolean);

      await supabase.from("campaign_change_history").insert({
        campaign_id: campaignId,
        user_id: user.id,
        action: `QC Sync: ${updated} updated, ${errors} errors out of ${processed} entities`,
        change_type: "qc_sync",
        description: notifSummary.join("\n"),
      });
    }

    console.log(`[qc-sync] Complete: processed=${processed}, updated=${updated}, errors=${errors}`);

    return new Response(JSON.stringify({ processed, updated, errors, notifications }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[qc-sync] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
