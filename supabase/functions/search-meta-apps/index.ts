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

    const { query, appStore, adAccountId } = await req.json();

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ apps: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's Meta access token
    const { data: connection, error: connError } = await supabase
      .from("connected_platforms")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .single();

    if (connError || !connection?.access_token) {
      throw new Error("No active Meta connection found");
    }

    // Search for apps using Meta's targeting search API
    const searchParams = new URLSearchParams({
      q: query,
      type: "adTargetingCategory",
      class: "user_adcluster",
      access_token: connection.access_token,
    });

    // Add app store filter if provided
    if (appStore) {
      searchParams.append("app_store", appStore.toLowerCase());
    }

    const metaResponse = await fetch(
      `https://graph.facebook.com/v19.0/act_${adAccountId}/targetingsearch?${searchParams}`
    );

    if (!metaResponse.ok) {
      const errorData = await metaResponse.json();
      console.error("Meta API error:", errorData);
      throw new Error(`Meta API error: ${errorData.error?.message || "Unknown error"}`);
    }

    const searchData = await metaResponse.json();
    
    // Format results
    const apps = (searchData.data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      description: item.description,
      audience_size: item.audience_size_lower_bound && item.audience_size_upper_bound 
        ? `${item.audience_size_lower_bound.toLocaleString()} - ${item.audience_size_upper_bound.toLocaleString()}`
        : null,
    }));

    return new Response(
      JSON.stringify({ apps }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error searching Meta apps:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});