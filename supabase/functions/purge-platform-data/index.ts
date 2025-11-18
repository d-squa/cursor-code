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
    await supabase
      .from("platform_accounts")
      .delete()
      .eq("connected_platform_id", connectedPlatformId);

    // Delete all Meta-related data for this user
    await supabase
      .from("meta_ad_accounts")
      .delete()
      .eq("user_id", user.id);

    await supabase
      .from("meta_pages")
      .delete()
      .eq("user_id", user.id);

    await supabase
      .from("meta_pixels")
      .delete()
      .eq("user_id", user.id);

    await supabase
      .from("meta_catalogs")
      .delete()
      .eq("user_id", user.id);

    await supabase
      .from("meta_product_sets")
      .delete()
      .eq("user_id", user.id);

    await supabase
      .from("meta_conversion_events")
      .delete()
      .eq("user_id", user.id);

    await supabase
      .from("meta_instagram_accounts")
      .delete()
      .eq("user_id", user.id);

    // Finally delete the connected platform
    await supabase
      .from("connected_platforms")
      .delete()
      .eq("id", connectedPlatformId)
      .eq("user_id", user.id);

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
