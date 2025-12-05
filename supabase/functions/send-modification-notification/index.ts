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
    }: ModificationNotificationRequest = await req.json();

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

    console.log("Sending modification notification for campaign:", campaignId, "by user:", user.id);

    const emailData = {
      from: "ActiPlan <do-not-reply@actiplan.app>",
      to: recipientEmails,
      subject: `Modification Requested: ${campaignName}`,
      html: `
        <h1>Modification Requested for "${campaignName}"</h1>
        <p><strong>Change Type:</strong> ${changeType.charAt(0).toUpperCase() + changeType.slice(1)}</p>
        <p><strong>Description:</strong> ${description}</p>
        <p>Please log in to your ActiPlan and go to the "Check Modification Requests" section to review and mark as completed when done.</p>
        <p>Best regards,<br>The ActiPlan Team</p>
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
