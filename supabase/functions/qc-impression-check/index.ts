import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[qc-impression-check] Starting scheduled impression check");

    // Find all QC tracking items that are not yet delivering and not auto-completed
    const { data: trackingItems, error } = await supabase
      .from("qc_tracking")
      .select("*, campaigns(user_id, team_id)")
      .eq("auto_completed", false)
      .in("current_state", ["pushed_live", "qc"])
      .not("dsp_entity_id", "is", null);

    if (error) throw error;

    if (!trackingItems || trackingItems.length === 0) {
      console.log("[qc-impression-check] No items to check");
      return new Response(JSON.stringify({ message: "No items to check", checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by campaign for efficient processing
    const byCampaign = trackingItems.reduce<Record<string, any[]>>((acc, item) => {
      if (!acc[item.campaign_id]) acc[item.campaign_id] = [];
      acc[item.campaign_id].push(item);
      return acc;
    }, {});

    let checked = 0;
    let autoCompleted = 0;

    for (const [campaignId, items] of Object.entries(byCampaign)) {
      // Trigger QC sync in cron mode for this campaign
      const userId = (items[0] as any).campaigns?.user_id;
      if (!userId) continue;

      // Get a valid auth token for this user - use service role to invoke
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("qc-sync", {
          body: { campaignId, mode: "cron" },
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
        });

        if (invokeError) {
          console.error(`[qc-impression-check] Error syncing campaign ${campaignId}:`, invokeError);
          continue;
        }

        checked += items.length;
        autoCompleted += data?.updated || 0;
        console.log(`[qc-impression-check] Campaign ${campaignId}: checked=${items.length}, updated=${data?.updated || 0}`);
      } catch (e) {
        console.error(`[qc-impression-check] Failed for campaign ${campaignId}:`, e);
      }
    }

    console.log(`[qc-impression-check] Complete: checked=${checked}, autoCompleted=${autoCompleted}`);

    return new Response(JSON.stringify({ checked, autoCompleted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[qc-impression-check] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
