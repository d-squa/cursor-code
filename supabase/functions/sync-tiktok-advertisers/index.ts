import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";
import { syncTikTokAdvertiserDetails } from "../_shared/tiktok-advertiser-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const platformId = body.platformId as string | undefined;
    if (!platformId) {
      throw new Error("platformId is required");
    }

    const { data: platform, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, user_id, team_id, access_token, metadata, platform_type, is_active")
      .eq("id", platformId)
      .eq("platform_type", "tiktok")
      .maybeSingle();

    if (platformError || !platform) {
      throw new Error("TikTok platform connection not found");
    }

    const { data: teamRoles } = await supabase
      .from("user_roles")
      .select("team_id")
      .eq("user_id", user.id)
      .not("team_id", "is", null);
    const teamIds = (teamRoles ?? []).map((r: { team_id: string }) => r.team_id).filter(Boolean);

    const canAccess =
      platform.user_id === user.id ||
      (platform.team_id && teamIds.includes(platform.team_id));
    if (!canAccess) {
      throw new Error("Not authorized to sync this connection");
    }

    const metadata = (platform.metadata ?? {}) as Record<string, unknown>;
    const advertiserIds = (metadata.advertiser_ids as string[] | undefined) ?? [];
    if (advertiserIds.length === 0) {
      throw new Error("No advertiser IDs on this connection. Reconnect TikTok.");
    }

    const accessToken = await getAccessToken(supabase, platformId, platform.access_token);
    if (!accessToken) {
      throw new Error("TikTok access token not found. Reconnect TikTok.");
    }

    const tokenContext = (metadata.token_context as "USER" | "ADVERTISER") ?? "ADVERTISER";
    const tiktokUserInfo = metadata.tiktok_user_info ?? null;

    const runSync = () =>
      syncTikTokAdvertiserDetails(
        supabase,
        platformId,
        accessToken,
        advertiserIds,
        tokenContext,
        tiktokUserInfo,
        "sync-tiktok-advertisers",
      );

    // @ts-ignore EdgeRuntime.waitUntil
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runSync());
      return new Response(
        JSON.stringify({
          success: true,
          syncInProgress: true,
          totalAdvertisers: advertiserIds.length,
          message: "TikTok advertiser sync restarted in the background",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await runSync();
    return new Response(
      JSON.stringify({ success: true, syncInProgress: false, message: "TikTok advertiser sync completed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sync failed";
    console.error("sync-tiktok-advertisers error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
