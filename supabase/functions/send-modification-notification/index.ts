import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ModificationNotificationRequest {
  campaignId: string;
  campaignName: string;
  changeType: string;
  description: string;
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

    const { campaignId, campaignName, changeType, description }: ModificationNotificationRequest = await req.json();

    // Get campaign creator
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("user_id, profiles!inner(email)")
      .eq("id", campaignId)
      .single();

    if (campaignError) throw campaignError;

    const creatorEmail = (campaign as any).profiles.email;

    const { error: emailError } = await resend.emails.send({
      from: "ActiPlan <onboarding@resend.dev>",
      to: [creatorEmail],
      subject: `Modification Requested: ${campaignName}`,
      html: `
        <h1>Modification Requested for "${campaignName}"</h1>
        <p><strong>Change Type:</strong> ${changeType.charAt(0).toUpperCase() + changeType.slice(1)}</p>
        <p><strong>Description:</strong> ${description}</p>
        <p>Please review and make the necessary changes to your ActiPlan.</p>
        <p>Best regards,<br>The ActiPlan Team</p>
      `,
    });

    if (emailError) throw emailError;

    console.log(`Modification notification sent to ${creatorEmail} for campaign ${campaignId}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-modification-notification:", error);
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
