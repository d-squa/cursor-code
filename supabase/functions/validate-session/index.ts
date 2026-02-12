import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VALIDATE-SESSION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      logStep("User not found or token invalid, returning invalid session", { error: userError?.message });
      return new Response(JSON.stringify({ 
        valid: false, 
        reason: "user_not_found" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    const user = userData.user;

    // Get session token from request body
    const body = await req.json().catch(() => ({}));
    const clientSessionToken = body.sessionToken;

    if (!clientSessionToken) {
      logStep("No session token provided by client", { userId: user.id });
      return new Response(JSON.stringify({ 
        valid: false, 
        reason: "no_token" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check if the session token matches the current active session
    const { data: activeSession, error: sessionError } = await supabaseClient
      .from("user_sessions")
      .select("session_token, device_info, last_active_at")
      .eq("user_id", user.id)
      .single();

    if (sessionError || !activeSession) {
      logStep("No active session found for user", { userId: user.id });
      return new Response(JSON.stringify({ 
        valid: false, 
        reason: "no_session" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const isValid = activeSession.session_token === clientSessionToken;

    if (!isValid) {
      logStep("Session token mismatch - user logged in elsewhere", { 
        userId: user.id,
        currentDevice: activeSession.device_info
      });
    } else {
      // Update last_active_at
      await supabaseClient
        .from("user_sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }

    return new Response(JSON.stringify({ 
      valid: isValid,
      reason: isValid ? null : "logged_in_elsewhere",
      currentDevice: isValid ? null : activeSession.device_info
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
