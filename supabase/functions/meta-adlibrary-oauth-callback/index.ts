import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const oauthInputSchema = z.object({
  code: z.string().min(1).max(2000),
  redirectUri: z.string().url(),
});

/**
 * Meta Ad Library OAuth Callback
 * 
 * This handles a SEPARATE Facebook Login flow (not Facebook Login for Business)
 * that produces a pure user token with only `public_profile` scope.
 * 
 * WHY: The Meta Ad Library API (ads_archive) requires a pure user token.
 * Business-scoped tokens (from Business Manager, Pages, Ad Accounts) cause
 * OAuthException errors because Ad Library is intentionally decoupled from
 * business assets.
 * 
 * This token is stored separately from the business platform token.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const body = await req.json();
    const parseResult = oauthInputSchema.safeParse(body);
    if (!parseResult.success) {
      console.error("[AD-LIBRARY-OAUTH] Validation error:", parseResult.error);
      return new Response(
        JSON.stringify({ error: "Invalid request parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const { code, redirectUri: providedRedirectUri } = parseResult.data;

    // IMPORTANT: Must exactly match the redirect URI configured in the Meta Consumer App
    // and the value used in the initial OAuth dialog request.
    // We intentionally force the production URL to avoid preview/staging domain mismatches.
    const redirectUri = "https://actiplan.app/settings/platforms";

    if (providedRedirectUri !== redirectUri) {
      console.warn(
        "[AD-LIBRARY-OAUTH] Client provided redirectUri differs from expected; forcing expected value",
        { providedRedirectUri, expected: redirectUri },
      );
    }

    // Exchange code for access token
    // IMPORTANT: Use the Ad Library consumer app credentials, NOT the main business app
    const clientId = Deno.env.get("META_ADLIBRARY_APP_ID");
    const clientSecret = Deno.env.get("META_ADLIBRARY_APP_SECRET");

    if (!clientId || !clientSecret) {
      throw new Error("Meta Ad Library credentials not configured (META_ADLIBRARY_APP_ID / META_ADLIBRARY_APP_SECRET)");
    }

    console.log("[AD-LIBRARY-OAUTH] Using Ad Library consumer app ID:", clientId);

    console.log("[AD-LIBRARY-OAUTH] Exchanging code for access token...");
    console.log("[AD-LIBRARY-OAUTH] This is a pure Facebook Login token (public_profile only)");
    
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("[AD-LIBRARY-OAUTH] Token exchange failed:", errorData);
      throw new Error(`Failed to exchange code for token: ${errorData.error?.message || 'Unknown error'}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;
    
    console.log("[AD-LIBRARY-OAUTH] Successfully obtained pure user access token");

    // Verify it's a valid user token by making a simple /me call
    const meResponse = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${access_token}`
    );
    
    if (!meResponse.ok) {
      const meError = await meResponse.json();
      console.error("[AD-LIBRARY-OAUTH] Token verification failed:", meError);
      throw new Error("Failed to verify user token");
    }
    
    const meData = await meResponse.json();
    console.log("[AD-LIBRARY-OAUTH] Token verified for user:", meData.name);

    // Store the Ad Library token in Vault using the dedicated RPC function
    const { error: vaultError } = await supabase.rpc('store_adlibrary_token', {
      user_id_param: user.id,
      token_value: access_token
    });
    
    if (vaultError) {
      console.error("[AD-LIBRARY-OAUTH] Vault storage error:", vaultError);
      throw new Error(`Failed to store Ad Library token: ${vaultError.message}`);
    }
    
    console.log("[AD-LIBRARY-OAUTH] Token stored in vault successfully");

    // Update profile to mark Ad Library as authorized
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        adlibrary_authorized: true,
        adlibrary_authorized_at: new Date().toISOString()
      })
      .eq('id', user.id);
    
    if (profileError) {
      console.log("[AD-LIBRARY-OAUTH] Profile update warning:", profileError.message);
      // Non-fatal - the token is stored, that's what matters
    }

    return new Response(
      JSON.stringify({
        success: true,
        userName: meData.name,
        message: "Ad Library access authorized successfully"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[AD-LIBRARY-OAUTH] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to authorize Ad Library access" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
