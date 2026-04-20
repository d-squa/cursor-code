import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ModificationNotificationRequest {
  campaignId: string;
  campaignName: string;
  changeType: string;
  description: string;
  notifyAllTeam?: boolean;
  assignedTo?: string[];
  requestId?: string;
  notificationType?: "new_request" | "status_change";
  newStatus?: string;
  requesterId?: string;
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

    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Verify the user's JWT token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const {
      campaignId,
      campaignName,
      changeType,
      description,
      notifyAllTeam = false,
      assignedTo = [],
      requestId,
      notificationType = "new_request",
      newStatus,
      requesterId,
    }: ModificationNotificationRequest = await req.json();

    // Get requester profile
    const { data: requesterProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const senderName = requesterProfile?.full_name || requesterProfile?.email?.split("@")[0] || "A team member";

    // Get campaign to verify access
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

    // Verify the caller has permission (owner or team member)
    if (campaign.user_id !== user.id) {
      if (campaign.team_id) {
        const { data: userRole } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", user.id)
          .eq("team_id", campaign.team_id)
          .single();
        
        if (!userRole) {
          return new Response(JSON.stringify({ error: "Permission denied" }), {
            status: 403,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: "Permission denied" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    let recipientEmails: string[] = [];
    let recipientUserIds: string[] = [];

    if (notificationType === "status_change") {
      // For status changes, notify the requester and all assigned users
      const allStakeholders = new Set<string>();
      
      // Add requester
      if (requesterId && requesterId !== user.id) {
        allStakeholders.add(requesterId);
      }
      
      // Add assigned users (excluding the person who made the change)
      assignedTo.forEach(id => {
        if (id !== user.id) {
          allStakeholders.add(id);
        }
      });
      
      // Add team members if notify_all_team is true
      if (notifyAllTeam && campaign.team_id) {
        const { data: members } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("team_id", campaign.team_id);

        if (members) {
          members.forEach((m) => {
            if (m.user_id !== user.id) {
              allStakeholders.add(m.user_id);
            }
          });
        }
      }
      
      recipientUserIds = Array.from(allStakeholders);
      
      if (recipientUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("email")
          .in("id", recipientUserIds);

        if (profiles) {
          recipientEmails = profiles.map((p) => p.email);
        }
      }
    } else {
      // Original logic for new requests
      if (notifyAllTeam && campaign.team_id) {
        // Get all team members
        const { data: members } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("team_id", campaign.team_id);

        if (members && members.length > 0) {
          const userIds = members.map((m) => m.user_id).filter(id => id !== user.id);
          
          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("email")
              .in("id", userIds);

            if (profiles) {
              recipientEmails = profiles.map((p) => p.email);
            }
          }
        }
      } else if (assignedTo.length > 0) {
        // Get specific team members
        const { data: profiles } = await supabase.from("profiles").select("email").in("id", assignedTo);

        if (profiles) {
          recipientEmails = profiles.map((p) => p.email);
        }
      }
    }

    if (recipientEmails.length === 0) {
      console.log("No recipients found for notification");
      return new Response(JSON.stringify({ success: true, message: "No recipients to notify" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Email service not configured");
    }

    console.log(`Sending ${notificationType} notification for campaign:`, campaignId, "by user:", user.id);

    // Build the deep link URL
    const origin = req.headers.get("origin");
    const appUrl = origin || Deno.env.get("APP_URL") || "https://actiplan.app";
    const planUrl = `${appUrl}/app/actiplans?campaignId=${campaignId}&open=modifications${requestId ? `&requestId=${requestId}` : ""}`;

    // Format change type for display
    const formattedChangeType = changeType.charAt(0).toUpperCase() + changeType.slice(1);
    
    // Format status for display
    const formatStatus = (status: string) => {
      const statusMap: Record<string, string> = {
        completed: "Completed",
        in_progress: "In Progress",
        rejected: "Rejected",
        sent: "Sent",
      };
      return statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
    };

    // Generate email content based on notification type
    let emailSubject: string;
    let emailTitle: string;
    let emailIntro: string;
    let emailAction: string;
    let ctaText: string;
    let statusBadge = "";

    if (notificationType === "status_change" && newStatus) {
      const formattedStatus = formatStatus(newStatus);
      emailSubject = `ActiPlan App: Modification Request - ${campaignName}`;
      emailTitle = `Request ${formattedStatus}`;
      emailIntro = `<strong>${senderName}</strong> has updated a modification request for the media plan <strong>"${campaignName}"</strong>.`;
      ctaText = "View Request";

      // Add status badge
      const statusColors: Record<string, string> = {
        completed: "#22c55e",
        in_progress: "#eab308",
        rejected: "#ef4444",
        sent: "#3b82f6",
      };
      const badgeColor = statusColors[newStatus] || "#6b7280";
      statusBadge = `
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 120px;">Status:</td>
          <td style="padding: 8px 0;">
            <span style="display: inline-block; background-color: ${badgeColor}; color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 9999px;">
              ${formattedStatus}
            </span>
          </td>
        </tr>
      `;
      emailAction = newStatus === "completed"
        ? "This modification request has been completed."
        : `The status has been updated to ${formattedStatus}.`;
    } else {
      emailSubject = `ActiPlan App: Modification Request - ${campaignName}`;
      emailTitle = "Modification Request";
      emailIntro = `<strong>${senderName}</strong> has requested a modification for the media plan <strong>"${campaignName}"</strong>.`;
      ctaText = "View Modification Request";
      emailAction = "Please review this request and mark it as complete once the changes have been made.";
    }

    const emailData = {
      from: "ActiPlan <do-not-reply@actiplan.app>",
      to: recipientEmails,
      subject: emailSubject,
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
              ${emailTitle}
            </h1>
            
            <p style="color: #334155; font-size: 16px; margin-bottom: 16px;">
              Hey there,
            </p>
            
            <p style="color: #334155; font-size: 16px; margin-bottom: 16px;">
              ${emailIntro}
            </p>
            
            <!-- Request Details Box -->
            <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h3 style="color: #0f172a; font-size: 16px; font-weight: 600; margin-top: 0; margin-bottom: 12px;">
                Request Details
              </h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 120px;">Change Type:</td>
                  <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 500;">${formattedChangeType}</td>
                </tr>
                ${statusBadge}
              </table>
              
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                <p style="color: #64748b; font-size: 14px; margin: 0 0 8px 0; font-weight: 500;">Description:</p>
                <p style="color: #1e293b; font-size: 14px; margin: 0; white-space: pre-wrap;">${description}</p>
              </div>
            </div>
            
            <p style="color: #64748b; font-size: 14px; font-style: italic; margin-bottom: 24px;">
              ${emailAction}
            </p>
            
            <p style="color: #334155; font-size: 16px; margin-bottom: 32px;">
              <em>Warm regards,</em><br/>
              <strong>The ActiPlan Team</strong>
            </p>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin-bottom: 32px;">
              <a href="${planUrl}" style="display: inline-block; background-color: #f97316; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                ${ctaText}
              </a>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #1e293b; padding: 30px 20px; text-align: center;">
            <!-- Social Icons -->
            <div style="margin-bottom: 20px;">
              <a href="https://linkedin.com/company/actiplan" style="display: inline-block; margin: 0 8px;">
                <img src="https://cdn-icons-png.flaticon.com/32/174/174857.png" alt="LinkedIn" style="width: 24px; height: 24px;" />
              </a>
              <a href="https://youtube.com/@actiplan" style="display: inline-block; margin: 0 8px;">
                <img src="https://cdn-icons-png.flaticon.com/32/1384/1384060.png" alt="YouTube" style="width: 24px; height: 24px;" />
              </a>
              <a href="https://twitter.com/actiplan" style="display: inline-block; margin: 0 8px;">
                <img src="https://cdn-icons-png.flaticon.com/32/733/733579.png" alt="Twitter" style="width: 24px; height: 24px;" />
              </a>
              <a href="https://instagram.com/actiplan" style="display: inline-block; margin: 0 8px;">
                <img src="https://cdn-icons-png.flaticon.com/32/174/174855.png" alt="Instagram" style="width: 24px; height: 24px;" />
              </a>
            </div>
            
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} ActiPlan. All rights reserved.
            </p>
            <p style="color: #64748b; font-size: 11px; margin-top: 8px;">
              This email was sent from ActiPlan. If you did not expect this email, please ignore it.
            </p>
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
      console.error("Resend API error");
      throw new Error("Failed to send email");
    }

    console.log(`Modification notification sent to ${recipientEmails.length} recipients for campaign ${campaignId}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-modification-notification:", error);
    return new Response(JSON.stringify({ error: "Failed to send notification" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
