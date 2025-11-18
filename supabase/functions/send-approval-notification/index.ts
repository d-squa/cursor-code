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
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { campaignId, campaignName, action }: ApprovalNotificationRequest = await req.json();

    // Get campaign to find user_id
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("user_id")
      .eq("id", campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Get creator's email from profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", campaign.user_id)
      .single();

    if (profileError) throw profileError;

    const creatorEmail = profile.email;

    const subject = action === "approved" ? `ActiPlan Approved: ${campaignName}` : `ActiPlan Rejected: ${campaignName}`;

    const message =
      action === "approved"
        ? `Your ActiPlan "${campaignName}" has been approved and is ready to launch! You can now push it to the DSP.`
        : `Your ActiPlan "${campaignName}" has been rejected. Please review the feedback and create a new plan.`;

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

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error: ${errorText}`);
    }

    console.log(`Notification sent to ${creatorEmail} for campaign ${campaignId}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-approval-notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
