// Lovable Cloud Function: accept-invitation
// Accepts a pending invitation for the authenticated user and assigns them to the invited team/role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Missing backend environment variables");
      return json(500, { error: "Server misconfiguration" });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { error: "Unauthorized" });
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : null;

    if (!token) {
      return json(400, { error: "Missing invitation token" });
    }

    // Authed client (to read the current user)
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await authedClient.auth.getUser();
    if (userError || !userData?.user) {
      console.error("auth.getUser error", userError);
      return json(401, { error: "Unauthorized" });
    }

    const user = userData.user;
    const userEmail = (user.email || "").toLowerCase();
    if (!userEmail) {
      return json(400, { error: "User email unavailable" });
    }

    // Service client (to bypass RLS safely for invitation acceptance)
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: invitation, error: invError } = await admin
      .from("invitations")
      .select("id, email, team_id, role, status, expires_at, workspace_id, subscription_access_only")
      .eq("token", token)
      .maybeSingle();

    if (invError) {
      console.error("Fetch invitation error", invError);
      return json(500, { error: "Failed to load invitation" });
    }

    if (!invitation) {
      return json(404, { error: "Invitation not found" });
    }

    if (invitation.status !== "pending") {
      return json(400, { error: "Invitation is no longer pending" });
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return json(400, { error: "Invitation has expired" });
    }

    const invitedEmail = (invitation.email || "").toLowerCase();
    if (invitedEmail !== userEmail) {
      return json(403, { error: "Please sign in with the email you were invited with" });
    }

    const wsId = invitation.workspace_id as string | null;
    const subscriptionOnly = Boolean(
      (invitation as { subscription_access_only?: boolean | null }).subscription_access_only,
    );

    let alreadyMember = false;

    if (subscriptionOnly) {
      if (!wsId) {
        return json(400, { error: "Invalid subscription invitation (missing workspace)" });
      }

      const { data: existingSm, error: existingSmError } = await admin
        .from("workspace_subscription_members")
        .select("user_id")
        .eq("workspace_id", wsId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingSmError) {
        console.error("Check subscription membership error", existingSmError);
        return json(500, { error: "Failed to check subscription membership" });
      }

      alreadyMember = Boolean(existingSm);

      const { error: upsertSmError } = await admin.from("workspace_subscription_members").upsert(
        {
          workspace_id: wsId,
          user_id: user.id,
          role: invitation.role,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,user_id" },
      );

      if (upsertSmError) {
        console.error("Upsert subscription membership error", upsertSmError);
        return json(500, { error: "Failed to add subscription access" });
      }
    } else {
      // Workspace invites: membership is always created on the workspace default team (billing/onboarding).
      let targetTeamId = invitation.team_id as string;
      if (wsId) {
        const { data: ws, error: wsErr } = await admin
          .from("workspaces")
          .select("default_team_id")
          .eq("id", wsId)
          .maybeSingle();
        if (wsErr) {
          console.error("Load workspace for invitation", wsErr);
          return json(500, { error: "Failed to load workspace" });
        }
        if (ws?.default_team_id) {
          targetTeamId = ws.default_team_id as string;
        }
      }

      const { data: existingRole, error: existingRoleError } = await admin
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("team_id", targetTeamId)
        .maybeSingle();

      if (existingRoleError) {
        console.error("Check existing role error", existingRoleError);
        return json(500, { error: "Failed to check membership" });
      }

      alreadyMember = Boolean(existingRole);

      if (!existingRole) {
        const { error: insertRoleError } = await admin.from("user_roles").insert({
          user_id: user.id,
          team_id: targetTeamId,
          role: invitation.role,
        });

        if (insertRoleError) {
          console.error("Insert role error", insertRoleError);
          return json(500, { error: "Failed to join team" });
        }

        // First team join: seed subscription roster row if missing (does not overwrite subscription role later).
        if (wsId) {
          const { error: smIns } = await admin.from("workspace_subscription_members").insert({
            workspace_id: wsId,
            user_id: user.id,
            role: invitation.role,
          });
          if (smIns && smIns.code !== "23505") {
            console.error("Insert subscription roster row", smIns);
            return json(500, { error: "Failed to sync subscription roster" });
          }
        }
      }
    }

    const { error: updateInviteError } = await admin
      .from("invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    if (updateInviteError) {
      console.error("Update invitation error", updateInviteError);
      return json(500, { error: "Failed to finalize invitation" });
    }

    return json(200, {
      ok: true,
      already_member: alreadyMember,
      subscription_only: subscriptionOnly,
    });
  } catch (e) {
    console.error("accept-invitation unexpected error", e);
    return json(500, { error: "Unexpected server error" });
  }
});
