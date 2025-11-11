import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  teamName: string;
  role: string;
  invitationToken: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, teamName, role, invitationToken }: InvitationRequest = await req.json();
    
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Email service not configured. Please add RESEND_API_KEY secret.");
    }
    
    const invitationUrl = `${Deno.env.get("VITE_SUPABASE_URL")?.replace('/api', '') || 'http://localhost:5173'}/accept-invitation?token=${invitationToken}`;

    const emailData = {
      from: "ActiPlan <onboarding@resend.dev>",
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
      console.error(`Failed to send invitation email:`, error);
      throw new Error(`Failed to send invitation email`);
    }

    const result = await response.json();
    console.log("Invitation email sent successfully:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending invitation email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
