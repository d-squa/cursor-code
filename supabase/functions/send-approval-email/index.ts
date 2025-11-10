import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get request body
    const {
      recipientEmails,
      planName,
      planDetails,
      pdfBase64,
      senderName = "Media Planning Team",
    }: ApprovalEmailRequest = await req.json();

    if (!recipientEmails || recipientEmails.length === 0) {
      throw new Error("No recipient emails provided");
    }

    // Get RESEND_API_KEY from secrets
    const { data: secretData, error: secretError } = await supabase
      .from('vault.secrets')
      .select('secret')
      .eq('name', 'RESEND_API_KEY')
      .single();

    if (secretError) {
      console.error("Failed to fetch RESEND_API_KEY:", secretError);
      throw new Error("Email service not configured. Please add RESEND_API_KEY secret.");
    }

    const resendApiKey = secretData?.secret;
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is empty");
    }

    // Send email via Resend API
    const emailPromises = recipientEmails.map(async (email) => {
      const emailData = {
        from: `${senderName} <onboarding@resend.dev>`,
        to: [email],
        subject: `Media Plan Approval Request: ${planName}`,
        html: `
          <h1>Media Plan Approval Request</h1>
          <p>Dear Team Member,</p>
          <p>A new media plan <strong>"${planName}"</strong> has been submitted for your review and approval.</p>
          
          <h2>Plan Summary</h2>
          <ul>
            <li><strong>Total Budget:</strong> $${planDetails.totalBudget?.toLocaleString() || 'N/A'}</li>
            <li><strong>Duration:</strong> ${planDetails.startDate} to ${planDetails.endDate}</li>
            <li><strong>Strategy:</strong> ${planDetails.strategyFocus || 'Custom'}</li>
            <li><strong>Platforms:</strong> ${planDetails.platforms?.map((p: any) => p.name).join(', ') || 'N/A'}</li>
          </ul>
          
          <p>Please review the attached PDF for complete details.</p>
          
          <p>Best regards,<br>${senderName}</p>
        `,
        attachments: [
          {
            filename: `${planName.replace(/\s+/g, '-').toLowerCase()}-media-plan.pdf`,
            content: pdfBase64,
          },
        ],
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
        const error = await response.text();
        console.error(`Failed to send email to ${email}:`, error);
        throw new Error(`Failed to send email to ${email}`);
      }

      return response.json();
    });

    const results = await Promise.all(emailPromises);

    console.log("Emails sent successfully:", results);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Approval emails sent to ${recipientEmails.length} recipient(s)`,
        results 
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-approval-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
