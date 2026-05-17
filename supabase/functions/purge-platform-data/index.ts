import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { assertUserCanManagePlatform } from "../_shared/team-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      throw new Error("Unauthorized");
    }

    const { connectedPlatformId } = await req.json();

    if (!connectedPlatformId) {
      throw new Error("Connected platform ID is required");
    }

    console.log("Purging data for platform:", connectedPlatformId);

    // First, get the platform details to know which platform we're dealing with
    const { data: platform, error: platformError } = await supabase
      .from("connected_platforms")
      .select("platform_type, user_id, team_id")
      .eq("id", connectedPlatformId)
      .single();

    if (platformError || !platform) {
      throw new Error("Platform not found or unauthorized");
    }

    await assertUserCanManagePlatform(supabase, user.id, platform);

    console.log("Platform type to purge:", platform.platform_type);

    // Delete platform_accounts
    const { error: platformAccountsError } = await supabase
      .from("platform_accounts")
      .delete()
      .eq("connected_platform_id", connectedPlatformId);
    
    if (platformAccountsError) {
      console.error("Error deleting platform_accounts:", platformAccountsError);
    }

    // Delete platform-specific data based on platform type
    if (platform.platform_type === "meta") {
      // Delete Meta ad accounts linked to this specific connection
      const { data: metaAccounts } = await supabase
        .from("meta_ad_accounts")
        .select("id, account_id")
        .eq("platform_id", connectedPlatformId);

      if (metaAccounts && metaAccounts.length > 0) {
        const accountIds = metaAccounts.map(a => a.account_id);

        // Delete Meta ad accounts for this connection
        const { error: adAccountsError } = await supabase
          .from("meta_ad_accounts")
          .delete()
          .eq("platform_id", connectedPlatformId);
        
        if (adAccountsError) {
          console.error("Error deleting meta_ad_accounts:", adAccountsError);
        }

        // Delete Meta resources tied to these accounts
        const { error: pixelsError } = await supabase
          .from("meta_pixels")
          .delete()
          .eq("user_id", user.id)
          .in("ad_account_id", accountIds);
        
        if (pixelsError) {
          console.error("Error deleting meta_pixels:", pixelsError);
        }
      }

      // Delete other Meta resources
      const { error: pagesError } = await supabase
        .from("meta_pages")
        .delete()
        .eq("user_id", user.id);
      
      if (pagesError) {
        console.error("Error deleting meta_pages:", pagesError);
      }

      const { error: catalogsError } = await supabase
        .from("meta_catalogs")
        .delete()
        .eq("user_id", user.id);
      
      if (catalogsError) {
        console.error("Error deleting meta_catalogs:", catalogsError);
      }

      const { error: productSetsError } = await supabase
        .from("meta_product_sets")
        .delete()
        .eq("user_id", user.id);
      
      if (productSetsError) {
        console.error("Error deleting meta_product_sets:", productSetsError);
      }

      const { error: conversionEventsError } = await supabase
        .from("meta_conversion_events")
        .delete()
        .eq("user_id", user.id);
      
      if (conversionEventsError) {
        console.error("Error deleting meta_conversion_events:", conversionEventsError);
      }

      const { error: instagramError } = await supabase
        .from("meta_instagram_accounts")
        .delete()
        .eq("user_id", user.id);
      
      if (instagramError) {
        console.error("Error deleting meta_instagram_accounts:", instagramError);
      }

      console.log("Meta-specific data purged");
    } else if (platform.platform_type === "tiktok") {
      // Get advertiser IDs from the platform metadata
      const { data: platformData } = await supabase
        .from("connected_platforms")
        .select("metadata")
        .eq("id", connectedPlatformId)
        .single();

      const advertiserIds = platformData?.metadata?.advertiser_ids || [];

      if (advertiserIds.length > 0) {
        // Delete TikTok ad accounts for this connection
        const { error: adAccountsError } = await supabase
          .from("tiktok_ad_accounts")
          .delete()
          .eq("platform_id", connectedPlatformId);
        
        if (adAccountsError) {
          console.error("Error deleting tiktok_ad_accounts:", adAccountsError);
        }

        // Delete TikTok campaigns
        const { error: campaignsError } = await supabase
          .from("tiktok_campaigns")
          .delete()
          .eq("user_id", user.id)
          .in("advertiser_id", advertiserIds);
        
        if (campaignsError) {
          console.error("Error deleting tiktok_campaigns:", campaignsError);
        }

        // Delete TikTok ad groups
        const { error: adGroupsError } = await supabase
          .from("tiktok_ad_groups")
          .delete()
          .eq("user_id", user.id)
          .in("advertiser_id", advertiserIds);
        
        if (adGroupsError) {
          console.error("Error deleting tiktok_ad_groups:", adGroupsError);
        }

        // Delete TikTok creatives
        const { error: creativesError } = await supabase
          .from("tiktok_creatives")
          .delete()
          .eq("user_id", user.id)
          .in("advertiser_id", advertiserIds);
        
        if (creativesError) {
          console.error("Error deleting tiktok_creatives:", creativesError);
        }

        // Delete TikTok metrics
        const { error: metricsError } = await supabase
          .from("tiktok_metrics")
          .delete()
          .eq("user_id", user.id)
          .in("advertiser_id", advertiserIds);
        
        if (metricsError) {
          console.error("Error deleting tiktok_metrics:", metricsError);
        }
      }

      console.log("TikTok-specific data purged");
    }

    // Finally delete the connected platform using service role to bypass RLS
    const { error: deleteError } = await supabase
      .from("connected_platforms")
      .delete()
      .eq("id", connectedPlatformId)
      .eq("user_id", user.id);
    
    if (deleteError) {
      console.error("Error deleting connected_platform:", deleteError);
      throw deleteError;
    }

    console.log("Purge completed successfully");

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Purge platform data error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
