import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json().catch(() => ({ token: null }));
    if (!token || typeof token !== "string") return json(400, { error: "Missing token" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Server misconfigured" });

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: invitation, error: invitationError } = await supabase
      .from("invitations")
      .select("email, expires_at, status, team_id")
      .eq("token", token)
      .maybeSingle();

    if (invitationError || !invitation || invitation.status !== "pending") {
      return json(404, { error: "Invalid invitation" });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return json(410, { error: "Invitation expired" });
    }

    // Fetch team name (service role bypasses RLS)
    let teamName = "the team";
    if (invitation.team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("name")
        .eq("id", invitation.team_id)
        .maybeSingle();
      if (team?.name) teamName = team.name;
    }

    const email = String(invitation.email || "").trim().toLowerCase();
    if (!email) return json(400, { error: "Missing invited email" });

    const admin: any = (supabase as any).auth?.admin;
    let exists = false;

    if (admin?.getUserByEmail) {
      const { data } = await admin.getUserByEmail(email);
      exists = Boolean(data?.user);
    } else if (admin?.listUsers) {
      const { data } = await admin.listUsers({ page: 1, perPage: 1000 });
      exists = Boolean(
        (data?.users ?? []).some((u: any) => String(u?.email || "").toLowerCase() === email)
      );
    }

    return json(200, { exists, teamName });
  } catch (_e) {
    return json(500, { error: "Unable to check account status" });
  }
});
