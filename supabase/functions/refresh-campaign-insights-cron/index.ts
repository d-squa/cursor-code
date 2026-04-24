import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting scheduled campaign insights refresh...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all live campaigns
    const { data: liveCampaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id, name, status")
      .eq("status", "live");

    if (campaignsError) {
      throw campaignsError;
    }

    if (!liveCampaigns || liveCampaigns.length === 0) {
      console.log("No live campaigns to refresh");
      return new Response(
        JSON.stringify({ message: "No live campaigns found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${liveCampaigns.length} live campaigns to refresh`);

    const results = [];

    // Fetch insights for each campaign
    for (const campaign of liveCampaigns) {
      try {
        console.log(`Refreshing insights for campaign: ${campaign.name} (${campaign.id})`);

        const { data, error } = await supabase.functions.invoke("fetch-campaign-insights", {
          body: {
            campaignId: campaign.id,
            forceRefresh: true, // Always fetch fresh data in cron job
          },
        });

        if (error) {
          console.error(`Failed to refresh campaign ${campaign.id}:`, error);
          results.push({
            campaignId: campaign.id,
            status: "error",
            error: error.message,
          });
        } else {
          console.log(`Successfully refreshed campaign ${campaign.id}`);
          results.push({
            campaignId: campaign.id,
            status: "success",
            insights: data?.insights?.length || 0,
          });
        }

        // Add small delay between API calls to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error(`Error processing campaign ${campaign.id}:`, error);
        results.push({
          campaignId: campaign.id,
          status: "error",
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    console.log(`Refresh complete: ${successCount} successful, ${errorCount} failed`);

    return new Response(
      JSON.stringify({
        message: "Campaign insights refresh completed",
        totalCampaigns: liveCampaigns.length,
        successCount,
        errorCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in cron job:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
