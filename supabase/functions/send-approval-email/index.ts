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
  excelBase64?: string;
  senderName?: string;
  campaignId?: string;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toFixed(2);
}

function generateForecastHtml(planDetails: any): string {
  const actiplanForecasts = planDetails.actiplanForecasts;
  
  if (!actiplanForecasts) {
    return `
      <h2>Plan Summary</h2>
      <ul>
        <li><strong>Total Budget:</strong> $${planDetails.totalBudget?.toLocaleString() || "N/A"}</li>
        <li><strong>Duration:</strong> ${planDetails.startDate} to ${planDetails.endDate}</li>
        <li><strong>Strategy:</strong> ${planDetails.strategyFocus || "Custom"}</li>
        <li><strong>Platforms:</strong> ${planDetails.platforms?.map((p: any) => p.name).join(", ") || "N/A"}</li>
      </ul>
    `;
  }

  // Build comprehensive forecast summary
  let html = `
    <h2>📊 Actiplan Deliverables Overview</h2>
    <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
      <tr style="background-color: #f0f4f8;">
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Total Budget</strong></td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">$${actiplanForecasts.totalBudget?.toLocaleString() || "N/A"}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Audience Size</strong></td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">${formatNumber(actiplanForecasts.totalAudienceSize || 0)}</td>
      </tr>
      <tr style="background-color: #f0f4f8;">
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Total Impressions</strong></td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">${formatNumber(actiplanForecasts.totalImpressions || 0)}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Total Reach</strong></td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">${formatNumber(actiplanForecasts.totalReach || 0)}</td>
      </tr>
      <tr style="background-color: #f0f4f8;">
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Average CPM</strong></td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">$${actiplanForecasts.avgCPM?.toFixed(2) || "N/A"}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Frequency</strong></td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">${actiplanForecasts.frequency?.toFixed(2) || "N/A"}</td>
      </tr>
      <tr style="background-color: #f0f4f8;">
        <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Share of Voice</strong></td>
        <td style="padding: 10px; border: 1px solid #e2e8f0;">${actiplanForecasts.sov?.toFixed(1) || "N/A"}%</td>
      </tr>
    </table>
  `;

  // Platform deliverables
  if (actiplanForecasts.platformDeliverables && Object.keys(actiplanForecasts.platformDeliverables).length > 0) {
    html += `<h3>🎯 Platform Deliverables</h3>`;
    
    Object.entries(actiplanForecasts.platformDeliverables).forEach(([platformName, kpis]: [string, any]) => {
      html += `<p style="margin-top: 15px;"><strong>${platformName}</strong></p>`;
      html += `<table style="border-collapse: collapse; width: 100%; margin-bottom: 15px;">`;
      
      kpis.forEach((kpi: any, index: number) => {
        const bgColor = index % 2 === 0 ? '#f0f4f8' : '#ffffff';
        html += `
          <tr style="background-color: ${bgColor};">
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${kpi.kpi}</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${typeof kpi.result === 'number' ? formatNumber(kpi.result) : kpi.result}</td>
          </tr>
        `;
      });
      
      html += `</table>`;
    });
  }

  // Platform breakdown
  if (actiplanForecasts.platforms && actiplanForecasts.platforms.length > 0) {
    html += `<h3>📈 Platform Breakdown</h3>`;
    
    actiplanForecasts.platforms.forEach((platform: any) => {
      html += `
        <div style="margin-bottom: 20px; padding: 15px; background-color: #f8fafc; border-radius: 8px;">
          <h4 style="margin-top: 0; color: #1e40af;">${platform.platformName}</h4>
          <table style="border-collapse: collapse; width: 100%;">
            <tr>
              <td style="padding: 6px 0;"><strong>Budget:</strong></td>
              <td>$${platform.totalBudget?.toLocaleString() || "N/A"}</td>
              <td style="padding: 6px 0;"><strong>Impressions:</strong></td>
              <td>${formatNumber(platform.totalImpressions || 0)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0;"><strong>Reach:</strong></td>
              <td>${formatNumber(platform.totalReach || 0)}</td>
              <td style="padding: 6px 0;"><strong>CPM:</strong></td>
              <td>$${platform.avgCPM?.toFixed(2) || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0;"><strong>Frequency:</strong></td>
              <td>${platform.frequency?.toFixed(2) || "N/A"}</td>
              <td style="padding: 6px 0;"><strong>SOV:</strong></td>
              <td>${platform.sov?.toFixed(1) || "N/A"}%</td>
            </tr>
          </table>
      `;
      
      // Market breakdown for this platform
      if (platform.markets && platform.markets.length > 0) {
        html += `<p style="margin-top: 10px; margin-bottom: 5px;"><strong>Markets:</strong></p>`;
        html += `<table style="border-collapse: collapse; width: 100%; font-size: 14px;">
          <tr style="background-color: #e2e8f0;">
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Market</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Budget</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Reach</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Impressions</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">CPM</th>
          </tr>`;
        
        platform.markets.forEach((market: any, idx: number) => {
          const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          html += `
            <tr style="background-color: ${bgColor};">
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${market.marketName}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right;">$${market.budget?.toLocaleString() || "N/A"}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right;">${formatNumber(market.reach || 0)}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right;">${formatNumber(market.impressions || 0)}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right;">$${market.cpm?.toFixed(2) || "N/A"}</td>
            </tr>
          `;
          
          // KPI results for this market
          if (market.resultsByGoal && market.resultsByGoal.length > 0) {
            html += `
              <tr>
                <td colspan="5" style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f0f4f8;">
                  <strong>KPIs:</strong> ${market.resultsByGoal.map((r: any) => 
                    `${r.kpi}: ${formatNumber(r.result)} (CPA: $${r.costPerResult?.toFixed(2) || "N/A"})`
                  ).join(" • ")}
                </td>
              </tr>
            `;
          }
        });
        
        html += `</table>`;
      }
      
      html += `</div>`;
    });
  }

  // Campaign info
  html += `
    <h3>📋 Campaign Details</h3>
    <ul>
      <li><strong>Duration:</strong> ${planDetails.startDate} to ${planDetails.endDate}</li>
      <li><strong>Strategy:</strong> ${planDetails.strategyFocus || "Custom"}</li>
      <li><strong>Platforms:</strong> ${planDetails.platforms?.map((p: any) => p.name).join(", ") || "N/A"}</li>
    </ul>
  `;

  return html;
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
      excelBase64,
      senderName = "The ActiPlan Team",
      campaignId,
    }: ApprovalEmailRequest = await req.json();
    
    // Build the plan URL
    const origin = req.headers.get("origin");
    const appUrl = origin || Deno.env.get("APP_URL") || "https://actiplan.app";
    const planUrl = campaignId ? `${appUrl}/app/actiplans?campaignId=${campaignId}` : appUrl;

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
    console.log("Has actiplanForecasts:", !!planDetails.actiplanForecasts);
    console.log("Has Excel attachment:", !!excelBase64);

    // Generate comprehensive forecast HTML
    const forecastHtml = generateForecastHtml(planDetails);

    // Send email via Resend API
    const emailPromises = recipientEmails.map(async (email) => {
      // Build attachments array
      const attachments: any[] = [];
      
      if (pdfBase64) {
        attachments.push({
          filename: `${planName.replace(/\s+/g, "-").toLowerCase()}-media-plan.pdf`,
          content: pdfBase64.split(",")[1] || pdfBase64,
          type: "application/pdf",
        });
      }
      
      if (excelBase64) {
        attachments.push({
          filename: `${planName.replace(/\s+/g, "-").toLowerCase()}-media-plan.xlsx`,
          content: excelBase64.split(",")[1] || excelBase64,
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      }

      const emailData = {
        from: `ActiPlan <do-not-reply@actiplan.app>`,
        to: [email],
        subject: `ActiPlan App: Approval Request - ${planName}`,
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
                Media Plan Approval Request
              </h1>
              
              <p style="color: #334155; font-size: 16px; margin-bottom: 16px;">
                Hey there,
              </p>
              
              <p style="color: #334155; font-size: 16px; margin-bottom: 16px;">
                A new media plan <strong>"${planName}"</strong> has been submitted for your review and approval.
              </p>
              
              <p style="color: #334155; font-size: 16px; margin-bottom: 8px;">
                Here's a quick summary:
              </p>
              
              <ul style="color: #334155; font-size: 16px; margin-bottom: 24px; padding-left: 24px;">
                <li style="margin-bottom: 8px;">✅ Total Budget: <strong>$${planDetails.actiplanForecasts?.totalBudget?.toLocaleString() || planDetails.totalBudget?.toLocaleString() || "N/A"}</strong></li>
                <li style="margin-bottom: 8px;">✅ Total Reach: <strong>${formatNumber(planDetails.actiplanForecasts?.totalReach || 0)}</strong></li>
                <li style="margin-bottom: 8px;">✅ Total Impressions: <strong>${formatNumber(planDetails.actiplanForecasts?.totalImpressions || 0)}</strong></li>
                <li style="margin-bottom: 8px;">✅ Platforms: <strong>${planDetails.platforms?.map((p: any) => p.name).join(", ") || "N/A"}</strong></li>
              </ul>
              
              <p style="color: #334155; font-size: 16px; margin-bottom: 8px;">
                <strong>Please review the attached documents for complete details:</strong>
              </p>
              <ul style="color: #334155; font-size: 16px; margin-bottom: 24px; padding-left: 24px;">
                ${pdfBase64 ? '<li style="margin-bottom: 8px;">📄 Full Media Plan (PDF)</li>' : ''}
                ${excelBase64 ? '<li style="margin-bottom: 8px;">📊 Media Plan Data (Excel)</li>' : ''}
              </ul>
              
              <p style="color: #64748b; font-size: 14px; font-style: italic; margin-bottom: 24px;">
                If you have any questions or need help getting started, simply reply to this email — we're here for you.
              </p>
              
              <p style="color: #334155; font-size: 16px; margin-bottom: 8px;">
                Welcome to ActiPlan.<br/>
                We can't wait for you to see what we've built.
              </p>
              
              <p style="color: #334155; font-size: 16px; margin-bottom: 32px;">
                <em>Warm regards,</em><br/>
                <strong>${senderName}</strong>
              </p>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${planUrl}" style="display: inline-block; background-color: #f97316; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                  View ActiPlan
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
                <a href="https://tiktok.com/@actiplan" style="display: inline-block; margin: 0 8px;">
                  <img src="https://cdn-icons-png.flaticon.com/32/3046/3046121.png" alt="TikTok" style="width: 24px; height: 24px;" />
                </a>
                <a href="https://instagram.com/actiplan" style="display: inline-block; margin: 0 8px;">
                  <img src="https://cdn-icons-png.flaticon.com/32/174/174855.png" alt="Instagram" style="width: 24px; height: 24px;" />
                </a>
              </div>
              
              <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px 0;">
                © ActiPlan
              </p>
              <p style="color: #64748b; font-size: 11px; margin: 0 0 16px 0;">
                This email was sent because you're part of a team using ActiPlan.
              </p>
            </div>
          </body>
          </html>
        `,
        attachments: attachments.length > 0 ? attachments : undefined,
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
        console.error(`Failed to send email to ${email}:`, errorText);
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