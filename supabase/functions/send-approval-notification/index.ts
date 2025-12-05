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

    const { campaignId, campaignName, action }: ApprovalNotificationRequest = await req.json();

    // Get campaign to verify access and find user_id
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
        // Check if admin
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

    // Get creator's email from profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", campaign.user_id)
      .single();

    if (profileError || !profile) {
      throw new Error("Creator profile not found");
    }

    const creatorEmail = profile.email;

    const subject = action === "approved" ? `ActiPlan Approved: ${campaignName}` : `ActiPlan Rejected: ${campaignName}`;

    const message =
      action === "approved"
        ? `Your ActiPlan "${campaignName}" has been approved and is ready to launch! You can now push it to the DSP.`
        : `Your ActiPlan "${campaignName}" has been rejected. Please review the feedback and create a new plan.`;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Email service not configured");
    }

    const emailData = {
      from: "ActiPlan <do-not-reply@actiplan.app>",
      to: [creatorEmail],
      subject,
      html: `
        <h1>${subject}</h1>
        <p>${message}</p>
        <p>Best regards,<br>The ActiPlan Team</p>
      `,
    };

    console.log("Sending approval notification to:", creatorEmail, "for campaign:", campaignId, "by user:", user.id);

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

    console.log(`Notification sent to ${creatorEmail} for campaign ${campaignId}`);

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
