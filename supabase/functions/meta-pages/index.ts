import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Get user's connected Meta platform
    const { data: platforms, error: platformsError } = await supabase
      .from("connected_platforms")
      .select("id, access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true);

    if (platformsError) throw platformsError;

    if (!platforms || platforms.length === 0) {
      return new Response(
        JSON.stringify({ pages: [] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const platform = platforms[0];

    // Get token from Vault with fallback to database column
    const accessToken = await getAccessToken(supabase, platform.id, platform.access_token);
    if (!accessToken) {
      throw new Error("Meta access token not found");
    }

    // Fetch pages from Meta
    console.log("Fetching pages for user:", user.id);

    const response = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,category,tasks&access_token=${accessToken}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error("Meta API Error:", data.error);
      throw new Error(data.error.message);
    }

    const pages = (data.data || []).map((page: any) => ({
      id: page.id,
      name: page.name,
      category: page.category,
      accessToken: page.access_token,
    }));

    console.log(`Found ${pages.length} pages`);

    return new Response(
      JSON.stringify({ pages }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error fetching pages:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
