import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

    // Delete platform_accounts
    const { error: platformAccountsError } = await supabase
      .from("platform_accounts")
      .delete()
      .eq("connected_platform_id", connectedPlatformId);
    
    if (platformAccountsError) {
      console.error("Error deleting platform_accounts:", platformAccountsError);
    }

    // Delete all Meta-related data for this user
    const { error: adAccountsError } = await supabase
      .from("meta_ad_accounts")
      .delete()
      .eq("user_id", user.id);
    
    if (adAccountsError) {
      console.error("Error deleting meta_ad_accounts:", adAccountsError);
    }

    const { error: pagesError } = await supabase
      .from("meta_pages")
      .delete()
      .eq("user_id", user.id);
    
    if (pagesError) {
      console.error("Error deleting meta_pages:", pagesError);
    }

    const { error: pixelsError } = await supabase
      .from("meta_pixels")
      .delete()
      .eq("user_id", user.id);
    
    if (pixelsError) {
      console.error("Error deleting meta_pixels:", pixelsError);
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
