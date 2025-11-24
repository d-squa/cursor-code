import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * TikTok Metrics Sync Function
 * Fetches daily performance metrics from TikTok Ads API and stores in database
 * Normalizes TikTok metrics to ActiPlan's standard reporting structure
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active TikTok campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from("tiktok_campaigns")
      .select("*")
      .eq("status", "ENABLE");

    if (campaignsError) throw campaignsError;

    console.log(`Syncing metrics for ${campaigns?.length || 0} TikTok campaigns`);

    // Get connected platforms with TikTok access tokens
    const { data: platforms, error: platformsError } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("platform_type", "tiktok")
      .eq("is_active", true);

    if (platformsError) throw platformsError;

    if (!platforms || platforms.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active TikTok platforms found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    const results = [];

    // Import adapter
    const { getPlatformAdapter } = await import("../_shared/platform-adapter.ts");
    const tiktokAdapter = getPlatformAdapter("tiktok");

    for (const platform of platforms) {
      const advertiserIds = platform.metadata?.advertiser_ids || [];

      for (const advertiserId of advertiserIds) {
        try {
          // Fetch campaign metrics
          const campaignMetrics = await tiktokAdapter.fetchMetrics({
            accountId: advertiserId,
            accessToken: platform.access_token,
            entityIds: [],
            entityType: "campaign",
            startDate: startDateStr,
            endDate: endDateStr,
          });

          if (campaignMetrics.success) {
            // Store metrics in database
            const metricsToInsert = campaignMetrics.metrics.map((metric) => ({
              user_id: platform.user_id,
              advertiser_id: advertiserId,
              tiktok_campaign_id: metric.entityId,
              date: metric.date,
              impressions: metric.impressions,
              clicks: metric.clicks,
              spend: metric.spend,
              conversions: metric.conversions,
              ctr: metric.ctr,
              cpc: metric.cpc,
              cpm: metric.cpm,
              raw_metrics: metric,
            }));

            if (metricsToInsert.length > 0) {
              const { error: insertError } = await supabase
                .from("tiktok_metrics")
                .upsert(metricsToInsert, {
                  onConflict: "advertiser_id,tiktok_campaign_id,date",
                });

              if (insertError) {
                console.error("Error inserting campaign metrics:", insertError);
              } else {
                results.push({
                  advertiserId,
                  metricsCount: metricsToInsert.length,
                  success: true,
                });
              }
            }
          }

          // Fetch ad group metrics
          const adGroupMetrics = await tiktokAdapter.fetchMetrics({
            accountId: advertiserId,
            accessToken: platform.access_token,
            entityIds: [],
            entityType: "adgroup",
            startDate: startDateStr,
            endDate: endDateStr,
          });

          if (adGroupMetrics.success) {
            const metricsToInsert = adGroupMetrics.metrics.map((metric) => ({
              user_id: platform.user_id,
              advertiser_id: advertiserId,
              tiktok_ad_group_id: metric.entityId,
              date: metric.date,
              impressions: metric.impressions,
              clicks: metric.clicks,
              spend: metric.spend,
              conversions: metric.conversions,
              ctr: metric.ctr,
              cpc: metric.cpc,
              cpm: metric.cpm,
              raw_metrics: metric,
            }));

            if (metricsToInsert.length > 0) {
              const { error: insertError } = await supabase
                .from("tiktok_metrics")
                .upsert(metricsToInsert, {
                  onConflict: "advertiser_id,tiktok_ad_group_id,date",
                });

              if (insertError) {
                console.error("Error inserting ad group metrics:", insertError);
              }
            }
          }
        } catch (error: any) {
          console.error(`Error syncing metrics for advertiser ${advertiserId}:`, error);
          results.push({
            advertiserId,
            error: error.message,
            success: false,
          });
        }
      }
    }

    console.log("TikTok metrics sync completed");

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced metrics for ${results.length} advertiser(s)`,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("TikTok metrics sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
