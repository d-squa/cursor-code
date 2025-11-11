import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
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
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      campaignId, 
      campaignName, 
      changeType, 
      description, 
      notifyAllTeam = false,
      assignedTo = []
    }: ModificationNotificationRequest = await req.json();

    let recipientEmails: string[] = [];

    if (notifyAllTeam) {
      // Get campaign creator's team
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("user_id")
        .eq("id", campaignId)
        .single();

      if (campaign) {
        // Get all teams the creator belongs to
        const { data: userTeams } = await supabase
          .from("user_roles")
          .select("team_id")
          .eq("user_id", campaign.user_id);

        if (userTeams && userTeams.length > 0) {
          const teamIds = userTeams.map((t) => t.team_id);

          // Get all team members
          const { data: members } = await supabase
            .from("user_roles")
            .select("profiles!inner(email)")
            .in("team_id", teamIds);

          if (members) {
            recipientEmails = Array.from(
              new Set(members.map((m: any) => m.profiles.email))
            );
          }
        }
      }
    } else if (assignedTo.length > 0) {
      // Get specific team members
      const { data: profiles } = await supabase
        .from("profiles")
        .select("email")
        .in("id", assignedTo);

      if (profiles) {
        recipientEmails = profiles.map((p) => p.email);
      }
    }

    if (recipientEmails.length === 0) {
      console.log("No recipients found for notification");
      return new Response(
        JSON.stringify({ success: true, message: "No recipients to notify" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const { error: emailError } = await resend.emails.send({
      from: "ActiPlan <onboarding@resend.dev>",
      to: recipientEmails,
      subject: `Modification Requested: ${campaignName}`,
      html: `
        <h1>Modification Requested for "${campaignName}"</h1>
        <p><strong>Change Type:</strong> ${changeType.charAt(0).toUpperCase() + changeType.slice(1)}</p>
        <p><strong>Description:</strong> ${description}</p>
        <p>Please log in to your ActiPlan and go to the "Check Modification Requests" section to review and mark as completed when done.</p>
        <p>Best regards,<br>The ActiPlan Team</p>
      `,
    });

    if (emailError) throw emailError;

    console.log(`Modification notification sent to ${recipientEmails.join(", ")} for campaign ${campaignId}`);

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
