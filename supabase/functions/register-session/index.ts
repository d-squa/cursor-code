import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[REGISTER-SESSION] ${step}${detailsStr}`);
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
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.id) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get device info from request body
    const body = await req.json().catch(() => ({}));
    const deviceInfo = body.deviceInfo || req.headers.get("user-agent") || "unknown";
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

    // Generate a unique session token for this login
    const sessionToken = crypto.randomUUID();

    // Check if there's an existing session for this user
    const { data: existingSession } = await supabaseClient
      .from("user_sessions")
      .select("id, session_token, device_info")
      .eq("user_id", user.id)
      .single();

    if (existingSession) {
      logStep("Existing session found, will be replaced", { 
        oldSessionId: existingSession.id,
        oldDevice: existingSession.device_info 
      });
    }

    // Upsert the session - this replaces any existing session for this user
    const { error: upsertError } = await supabaseClient
      .from("user_sessions")
      .upsert({
        user_id: user.id,
        session_token: sessionToken,
        device_info: deviceInfo,
        ip_address: ipAddress,
        last_active_at: new Date().toISOString(),
      }, {
        onConflict: "user_id"
      });

    if (upsertError) {
      logStep("Error upserting session", { error: upsertError.message });
      throw new Error(`Failed to register session: ${upsertError.message}`);
    }

    logStep("Session registered successfully", { 
      userId: user.id, 
      sessionToken: sessionToken.substring(0, 8) + "..." 
    });

    return new Response(JSON.stringify({ 
      success: true,
      sessionToken,
      replacedExisting: !!existingSession
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
