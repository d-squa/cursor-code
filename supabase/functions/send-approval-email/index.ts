import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApprovalEmailRequest {
  recipientEmails: string[];
  planName: string;
  planDetails: any;
  pdfBase64: string;
  senderName?: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
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

    // Get request body
    const {
      recipientEmails,
      planName,
      planDetails,
      pdfBase64,
      senderName = "Media Planning Team",
    }: ApprovalEmailRequest = await req.json();

    if (!recipientEmails || recipientEmails.length === 0) {
      return new Response(JSON.stringify({ error: "No recipient emails provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify the user has access to the campaign if campaignId is provided
    if (planDetails?.campaignId) {
      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .select("id, user_id, team_id")
        .eq("id", planDetails.campaignId)
        .single();

      if (campaignError || !campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Check if user owns the campaign or is part of the team
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
    }

    // Get RESEND_API_KEY from environment
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Email service not configured");
    }

    console.log("Sending approval emails for plan:", planName, "by user:", user.id);

    // Send email via Resend API
    const emailPromises = recipientEmails.map(async (email) => {
      const emailData = {
        from: `${senderName} <do-not-reply@actiplan.app>`,
        to: [email],
        subject: `Media Plan Approval Request: ${planName}`,
        html: `
          <h1>Media Plan Approval Request</h1>
          <p>Dear Team Member,</p>
          <p>A new media plan <strong>"${planName}"</strong> has been submitted for your review and approval.</p>
          
          <h2>Plan Summary</h2>
          <ul>
            <li><strong>Total Budget:</strong> $${planDetails.totalBudget?.toLocaleString() || "N/A"}</li>
            <li><strong>Duration:</strong> ${planDetails.startDate} to ${planDetails.endDate}</li>
            <li><strong>Strategy:</strong> ${planDetails.strategyFocus || "Custom"}</li>
            <li><strong>Platforms:</strong> ${planDetails.platforms?.map((p: any) => p.name).join(", ") || "N/A"}</li>
          </ul>
          
          <p>Please review the attached PDF for complete details.</p>
          
          <p>Best regards,<br>${senderName}</p>
        `,
        attachments: pdfBase64
          ? [
              {
                filename: `${planName.replace(/\s+/g, "-").toLowerCase()}-media-plan.pdf`,
                content: pdfBase64.split(",")[1] || pdfBase64,
                type: "application/pdf",
              },
            ]
          : [],
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
        console.error(`Failed to send email to ${email}`);
        throw new Error("Failed to send email");
      }

      return response.json();
    });

    const results = await Promise.all(emailPromises);

    console.log("Emails sent successfully:", results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Approval emails sent to ${recipientEmails.length} recipient(s)`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (error: any) {
    console.error("Error in send-approval-email function:", error);
    return new Response(JSON.stringify({ error: "Failed to send approval email" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
