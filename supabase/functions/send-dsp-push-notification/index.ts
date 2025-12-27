import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PlatformResult {
  platform: string;
  success?: boolean;
  skipped?: boolean;
  results?: Array<{
    market: string;
    phase: string;
    campaignId?: string;
    adSetId?: string;
    adGroupId?: string;
    success?: boolean;
  }>;
  errors?: Array<{
    market: string;
    phase: string;
    error: string;
    type?: string;
    fieldPath?: string;
  }>;
  error?: string;
}

interface DspPushNotificationRequest {
  campaignId: string;
  campaignName: string;
  finalStatus: "pushed_to_dsp" | "partially_pushed" | "push_failed";
  results: PlatformResult[];
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
      finalStatus,
      results,
    }: DspPushNotificationRequest = await req.json();

    console.log(`📧 Sending DSP push notification for campaign: ${campaignId}, status: ${finalStatus}`);

    // Get campaign to find team stakeholders
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("user_id, team_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error("Campaign not found:", campaignError);
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get the pusher's profile
    const { data: pusherProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const pusherName = pusherProfile?.full_name || pusherProfile?.email?.split("@")[0] || "A team member";

    // Collect all stakeholders (campaign owner + all team members)
    const stakeholderIds = new Set<string>();
    
    // Add campaign owner (but not the pusher to avoid self-notification)
    if (campaign.user_id && campaign.user_id !== user.id) {
      stakeholderIds.add(campaign.user_id);
    }

    // Add all team members
    if (campaign.team_id) {
      const { data: teamMembers } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("team_id", campaign.team_id);

      if (teamMembers) {
        teamMembers.forEach((m) => {
          if (m.user_id !== user.id) {
            stakeholderIds.add(m.user_id);
          }
        });
      }
    }

    if (stakeholderIds.size === 0) {
      console.log("No stakeholders to notify (pusher is the only stakeholder)");
      return new Response(JSON.stringify({ success: true, message: "No stakeholders to notify" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get stakeholder emails
    const { data: profiles } = await supabase
      .from("profiles")
      .select("email")
      .in("id", Array.from(stakeholderIds));

    const recipientEmails = profiles?.map((p) => p.email).filter(Boolean) || [];

    if (recipientEmails.length === 0) {
      console.log("No recipient emails found");
      return new Response(JSON.stringify({ success: true, message: "No recipients to notify" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Email service not configured");
    }

    // Build the deep link URL
    const origin = req.headers.get("origin");
    const appUrl = origin || Deno.env.get("APP_URL") || "https://actiplan.app";
    const planUrl = `${appUrl}/launch-status?campaignId=${campaignId}`;

    // Determine status display info
    const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
      pushed_to_dsp: { label: "Successfully Pushed", color: "#22c55e", icon: "✅" },
      partially_pushed: { label: "Partially Pushed", color: "#eab308", icon: "⚠️" },
      push_failed: { label: "Push Failed", color: "#ef4444", icon: "❌" },
    };

    const statusInfo = statusConfig[finalStatus] || statusConfig.push_failed;

    // Calculate summary stats
    let totalSuccess = 0;
    let totalErrors = 0;
    const platformSummaries: string[] = [];
    const errorDetails: string[] = [];

    for (const platformResult of results) {
      const platformName = platformResult.platform;
      const successCount = platformResult.results?.length || 0;
      const errorCount = platformResult.errors?.length || 0;

      if (platformResult.skipped) {
        platformSummaries.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${platformName}</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Skipped (already pushed)</td></tr>`);
      } else if (platformResult.error) {
        totalErrors++;
        platformSummaries.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${platformName}</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #ef4444;">Error: ${platformResult.error}</td></tr>`);
      } else {
        totalSuccess += successCount;
        totalErrors += errorCount;
        
        let statusText = "";
        if (successCount > 0 && errorCount === 0) {
          statusText = `<span style="color: #22c55e;">${successCount} entities pushed successfully</span>`;
        } else if (successCount > 0 && errorCount > 0) {
          statusText = `<span style="color: #22c55e;">${successCount} pushed</span>, <span style="color: #ef4444;">${errorCount} failed</span>`;
        } else if (errorCount > 0) {
          statusText = `<span style="color: #ef4444;">${errorCount} failed</span>`;
        }
        
        platformSummaries.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${platformName}</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${statusText}</td></tr>`);
      }

      // Collect error details for partial/failed pushes
      if (platformResult.errors && platformResult.errors.length > 0) {
        for (const err of platformResult.errors) {
          errorDetails.push(`
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${platformName}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${err.market}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${err.phase}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #ef4444;">${err.error}</td>
            </tr>
          `);
        }
      }
    }

    // Build email subject
    const emailSubject = finalStatus === "pushed_to_dsp"
      ? `ActiPlan App: DSP Push Successful - ${campaignName}`
      : finalStatus === "partially_pushed"
      ? `ActiPlan App: DSP Push Partially Successful - ${campaignName}`
      : `ActiPlan App: DSP Push Failed - ${campaignName}`;

    // Build error details section (only for partial/failed pushes)
    let errorDetailsSection = "";
    if (errorDetails.length > 0) {
      errorDetailsSection = `
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <h3 style="color: #991b1b; font-size: 16px; font-weight: 600; margin-top: 0; margin-bottom: 12px;">
            Error Details
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background-color: #fee2e2;">
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #fecaca;">Platform</th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #fecaca;">Market</th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #fecaca;">Phase</th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #fecaca;">Error</th>
              </tr>
            </thead>
            <tbody>
              ${errorDetails.join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    const emailHtml = `
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
            ${statusInfo.icon} Campaign DSP Push Update
          </h1>
          
          <p style="color: #334155; font-size: 16px; margin-bottom: 16px;">
            Hey there,
          </p>
          
          <p style="color: #334155; font-size: 16px; margin-bottom: 16px;">
            <strong>${pusherName}</strong> has pushed the media plan <strong>"${campaignName}"</strong> to the DSP platforms.
          </p>
          
          <!-- Status Badge -->
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="display: inline-block; background-color: ${statusInfo.color}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 8px 20px; border-radius: 9999px;">
              ${statusInfo.label}
            </span>
          </div>
          
          <!-- Platform Summary -->
          <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #0f172a; font-size: 16px; font-weight: 600; margin-top: 0; margin-bottom: 12px;">
              Platform Summary
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background-color: #e2e8f0;">
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #cbd5e1;">Platform</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #cbd5e1;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${platformSummaries.join("")}
              </tbody>
            </table>
          </div>
          
          ${errorDetailsSection}
          
          <p style="color: #334155; font-size: 16px; margin-bottom: 32px;">
            <em>Warm regards,</em><br/>
            <strong>The ActiPlan Team</strong>
          </p>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${planUrl}" style="display: inline-block; background-color: #f97316; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
              View Launch Status
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
    `;

    const emailData = {
      from: "ActiPlan <do-not-reply@actiplan.app>",
      to: recipientEmails,
      subject: emailSubject,
      html: emailHtml,
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
      const errorText = await response.text();
      console.error("Resend API error:", errorText);
      throw new Error("Failed to send email");
    }

    console.log(`✅ DSP push notification sent to ${recipientEmails.length} stakeholders for campaign ${campaignId}`);

    return new Response(JSON.stringify({ success: true, recipientCount: recipientEmails.length }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-dsp-push-notification:", error);
    return new Response(JSON.stringify({ error: "Failed to send notification" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
