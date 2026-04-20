import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApprovalNotificationRequest {
  campaignId: string;
  campaignName: string;
  action: "approved" | "rejected";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Server configuration error");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { campaignId, campaignName, action }: ApprovalNotificationRequest = await req.json();

    // Verify access and get campaign owner/team
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("user_id, team_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify the caller has permission (must be team member or admin)
    if (campaign.team_id) {
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("id, role")
        .eq("user_id", user.id)
        .eq("team_id", campaign.team_id)
        .single();

      if (!userRole) {
        const { data: adminRole } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .single();

        if (!adminRole) {
          return new Response(JSON.stringify({ error: "Permission denied" }), {
            status: 403,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }
    }

    // Get creator email
    const { data: creatorProfile, error: creatorError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", campaign.user_id)
      .single();

    if (creatorError || !creatorProfile?.email) {
      throw new Error("Creator profile not found");
    }

    // Get sender name (approver)
    const { data: approverProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const senderName =
      approverProfile?.full_name || approverProfile?.email?.split("@")[0] || "A team member";

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Email service not configured");
    }

    const origin = req.headers.get("origin");
    const appUrl = origin || Deno.env.get("APP_URL") || "https://actiplan.app";
    const planUrl = `${appUrl}/app/actiplans?campaignId=${campaignId}`;

    const isApproved = action === "approved";
    const statusLabel = isApproved ? "Approved" : "Rejected";

    const subject = `ActiPlan App: ActiPlan ${statusLabel} - ${campaignName}`;

    const headline = isApproved ? `ActiPlan Approved: ${campaignName}` : `ActiPlan Rejected: ${campaignName}`;
    const message = isApproved
      ? `Your ActiPlan <strong>"${campaignName}"</strong> has been approved and is ready to launch. You can now push it to the DSP.`
      : `Your ActiPlan <strong>"${campaignName}"</strong> has been rejected. Please review the feedback and update your plan.`;

    console.log("Sending approval status email", { campaignId, action, to: creatorProfile.email });

    const emailData = {
      from: "ActiPlan <do-not-reply@actiplan.app>",
      to: [creatorProfile.email],
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc;">
          <!-- Header -->
          <div style="background-color: #0f172a; padding: 20px; text-align: center;">
            <img src="https://actiplan.app/logo.png" alt="ActiPlan" style="height: 40px;" />
          </div>

          <!-- Main Content -->
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
            <h1 style="color: #0f172a; font-size: 28px; font-weight: 600; margin-bottom: 24px; text-align: center;">
              ${headline}
            </h1>

            <p style="color: #334155; font-size: 16px; margin-bottom: 16px;">Hey there,</p>

            <p style="color: #334155; font-size: 16px; margin-bottom: 16px;">
              ${message}
            </p>

            <p style="color: #334155; font-size: 16px; margin-bottom: 32px;">
              <em>Warm regards,</em><br/>
              <strong>${senderName}</strong>
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin-bottom: 32px;">
              <a href="${planUrl}" style="display: inline-block; background-color: #f97316; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                View ActiPlan
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #1e293b; padding: 30px 20px; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} ActiPlan. All rights reserved.</p>
            <p style="color: #64748b; font-size: 11px; margin-top: 8px;">This email was sent from ActiPlan. If you did not expect this email, please ignore it.</p>
          </div>
        </body>
        </html>
      `,
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      console.error("Resend API error", await response.text());
      throw new Error("Failed to send email");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-approval-notification:", error);
    return new Response(JSON.stringify({ error: "Failed to send notification" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
