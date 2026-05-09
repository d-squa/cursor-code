import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  teamName: string;
  role: string;
  invitationToken: string;
  origin?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Server configuration error");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the user's JWT token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { email, teamName, role, invitationToken, origin }: InvitationRequest = await req.json();

    console.log("Processing invitation for:", email, "by user:", user.id);

    // Verify the invitation exists and was created by this user or a team admin
    const { data: invitation, error: invitationError } = await supabase
      .from("invitations")
      .select("id, created_by, team_id")
      .eq("token", invitationToken)
      .eq("status", "pending")
      .single();

    if (invitationError || !invitation) {
      return new Response(JSON.stringify({ error: "Invalid invitation" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify the caller created this invitation or is an admin
    if (invitation.created_by !== user.id) {
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();
      
      if (!userRole) {
        return new Response(JSON.stringify({ error: "Permission denied" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("Email service not configured");
    }

    // Get the base URL for the invitation link - use origin from frontend if provided
    const baseUrl = origin || "https://cursor-code-1uryu5q86-d-squas-projects.vercel.app";
    const invitationUrl = `${baseUrl}/accept-invitation?token=${invitationToken}`;

    console.log("Invitation URL:", invitationUrl);

    const emailData = {
      from: "ActiPlan <do-not-reply@actiplan.app>",
      to: [email],
      subject: `You've been invited to join ${teamName} on ActiPlan`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">You're Invited!</h1>
          <p>You've been invited to join <strong>${teamName}</strong> on ActiPlan as a <strong>${role}</strong>.</p>
          
          <div style="margin: 30px 0;">
            <a href="${invitationUrl}" 
               style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
          </p>
          
          <p style="color: #999; font-size: 12px; margin-top: 40px;">
            Or copy and paste this link: ${invitationUrl}
          </p>
        </div>
      `,
    };

    console.log("Sending email with data:", { to: email, subject: emailData.subject });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(emailData),
    });

    console.log("Resend API response status:", response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error(`Resend API error (${response.status}):`, error);
      throw new Error("Failed to send email");
    }

    const result = await response.json();
    console.log("Invitation email sent successfully:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-invitation-email function:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send invitation email" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
};

serve(handler);
