import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QC_STATE_ORDER = ["waiting_for_final_qc", "qc", "pushed_live", "delivering"];

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

async function fetchEntityStatus(platform: string, dspEntityId: string, accessToken: string): Promise<string | null> {
  try {
    if (platform === "meta") {
      const url = `https://graph.facebook.com/v21.0/${dspEntityId}?fields=effective_status&access_token=${accessToken}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return data.effective_status || null;
    }
    return null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    // Support both user auth and service role (cron)
    if (authHeader?.includes(supabaseServiceKey)) {
      // Service role call (from cron)
      userId = null;
    } else if (authHeader) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authError || !user) throw new Error("Unauthorized");
      userId = user.id;
    } else {
      throw new Error("Missing auth");
    }

    const { campaignId, mode } = await req.json();
    if (!campaignId) throw new Error("Missing campaignId");

    console.log(`[qc-sync] Starting QC sync for campaign ${campaignId}, mode: ${mode || "sync"}`);

    // Get QC tracking items that could be auto-advanced
    const { data: trackingItems, error: trackError } = await supabase
      .from("qc_tracking")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("auto_completed", false)
      .in("current_state", ["pushed_live", "qc", "waiting_for_final_qc"]);

    if (trackError) throw trackError;

    if (!trackingItems || trackingItems.length === 0) {
      return new Response(JSON.stringify({ message: "No items to check", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get campaign team_id
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("team_id, user_id")
      .eq("id", campaignId)
      .single();

    const effectiveUserId = userId || campaign?.user_id;
    if (!effectiveUserId) throw new Error("Cannot determine user");

    let processed = 0;
    let updated = 0;
    const notifications: any[] = [];

    for (const item of trackingItems) {
      if (!item.dsp_entity_id) { processed++; continue; }

      // Get platform connection
      const { data: connections } = await supabase
        .from("connected_platforms")
        .select("id")
        .eq("platform_type", item.platform)
        .eq("is_active", true)
        .or(`user_id.eq.${effectiveUserId}${campaign?.team_id ? `,team_id.eq.${campaign.team_id}` : ''}`)
        .limit(1);

      if (!connections || connections.length === 0) { processed++; continue; }

      const accessToken = await getAccessToken(supabase, connections[0].id);
      if (!accessToken) { processed++; continue; }

      // Check DSP status for auto Pushed Live detection
      if (item.current_state === "qc") {
        const dspStatus = await fetchEntityStatus(item.platform, item.dsp_entity_id, accessToken);
        if (dspStatus === "ACTIVE") {
          await supabase.from("qc_tracking").update({
            current_state: "pushed_live",
            previous_state: item.current_state,
          }).eq("id", item.id);

          await supabase.from("qc_state_transitions").insert({
            qc_tracking_id: item.id,
            campaign_id: campaignId,
            from_state: item.current_state,
            to_state: "pushed_live",
            detected_via: "auto_dsp_status",
            impressions_at_transition: 0,
            metadata: { dsp_status: dspStatus },
          });

          notifications.push({ type: "auto_pushed_live", entity_name: item.entity_name, platform: item.platform });
          updated++;
        }
      }

      // Check impressions for auto Delivering detection
      if (item.current_state === "pushed_live" || (item.current_state === "qc" && mode === "cron")) {
        const impressions = await fetchEntityImpressions(item.platform, item.dsp_entity_id, accessToken);
        if (impressions >= 1000) {
          await supabase.from("qc_tracking").update({
            current_state: "delivering",
            previous_state: item.current_state,
            impressions_count: impressions,
            auto_completed: true,
            auto_completed_at: new Date().toISOString(),
          }).eq("id", item.id);

          await supabase.from("qc_state_transitions").insert({
            qc_tracking_id: item.id,
            campaign_id: campaignId,
            from_state: item.current_state,
            to_state: "delivering",
            detected_via: "auto_impressions",
            impressions_at_transition: impressions,
            metadata: { auto_completed: true },
          });

          notifications.push({ type: "auto_delivering", entity_name: item.entity_name, platform: item.platform, impressions });
          updated++;
        }
      }

      processed++;
    }

    if (notifications.length > 0) {
      const summary = notifications.map((n: any) => {
        if (n.type === "auto_delivering") return `${n.platform} "${n.entity_name}" auto-delivering (${n.impressions} impressions)`;
        if (n.type === "auto_pushed_live") return `${n.platform} "${n.entity_name}" auto-detected as pushed live`;
        return "";
      }).filter(Boolean);

      await supabase.from("campaign_change_history").insert({
        campaign_id: campaignId,
        user_id: effectiveUserId,
        action: `QC Sync: ${updated} auto-updated out of ${processed} entities`,
        change_type: "qc_sync",
        description: summary.join("\n"),
      });
    }

    console.log(`[qc-sync] Complete: processed=${processed}, updated=${updated}`);

    return new Response(JSON.stringify({ processed, updated, notifications }), {
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
