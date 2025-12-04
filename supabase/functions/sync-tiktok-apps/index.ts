import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Invalid user token");
    }

    const { advertiserId } = await req.json();

    if (!advertiserId) {
      throw new Error("Advertiser ID is required");
    }

    // Get user's TikTok access token
    const { data: connection, error: connError } = await supabase
      .from("connected_platforms")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "tiktok")
      .eq("is_active", true)
      .single();

    if (connError || !connection?.access_token) {
      throw new Error("No active TikTok connection found");
    }

    // Fetch apps from TikTok Marketing API
    const tiktokResponse = await fetch(
      `https://business-api.tiktok.com/open_api/v1.3/app/list/`,
      {
        method: "GET",
        headers: {
          "Access-Token": connection.access_token,
          "Content-Type": "application/json",
        },
      }
    );

    if (!tiktokResponse.ok) {
      const errorData = await tiktokResponse.json();
      console.error("TikTok API error:", errorData);
      // Return empty if no apps or endpoint not available
      return new Response(
        JSON.stringify({ apps: [], message: "No apps found or endpoint not available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const responseData = await tiktokResponse.json();
    console.log("TikTok apps response:", JSON.stringify(responseData));

    const apps = responseData.data?.list || [];

    // Upsert apps to database
    if (apps.length > 0) {
      const appsToUpsert = apps.map((app: any) => ({
        user_id: user.id,
        advertiser_id: advertiserId,
        app_id: app.app_id || app.id,
        app_name: app.app_name || app.name,
        app_type: app.app_type || app.platform || null,
        download_url: app.download_url || null,
        synced_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from("tiktok_apps")
        .upsert(appsToUpsert, {
          onConflict: "user_id,advertiser_id,app_id",
        });

      if (upsertError) {
        console.error("Error upserting TikTok apps:", upsertError);
      }
    }

    // Fetch all apps for this advertiser from database
    const { data: storedApps, error: fetchError } = await supabase
      .from("tiktok_apps")
      .select("*")
      .eq("user_id", user.id)
      .eq("advertiser_id", advertiserId);

    if (fetchError) {
      throw fetchError;
    }

    return new Response(
      JSON.stringify({ apps: storedApps || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error syncing TikTok apps:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage, apps: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});