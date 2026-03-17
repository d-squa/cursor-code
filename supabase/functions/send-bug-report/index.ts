import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BugReportRequest {
  title: string;
  description: string;
  severity: string;
  screenshot?: string | null;
  userEmail?: string;
  currentUrl: string;
  userAgent: string;
}

const SUPPORT_EMAIL = "beydound@actiplan.app";

const severityColors: Record<string, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, description, severity, screenshot, userEmail, currentUrl, userAgent }: BugReportRequest =
      await req.json();

    console.log("[SEND-BUG-REPORT] Received bug report:", { title, severity, userEmail });

    const ticketId = `BUG-${Date.now().toString(36).toUpperCase()}`;
    const severityColor = severityColors[severity] || "#6b7280";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #6366f1, #a855f7); padding: 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">🐛 Bug Report</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Ticket ID: ${ticketId}</p>
    </div>
    
    <div style="padding: 24px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <span style="display: inline-block; background: ${severityColor}; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
          ${severity}
        </span>
      </div>
      
      <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">${title}</h2>
      
      <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 8px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Description</h3>
        <p style="margin: 0; color: #3f3f46; white-space: pre-wrap;">${description}</p>
      </div>
      
      ${
        screenshot
          ? `
      <div style="margin-bottom: 20px;">
        <h3 style="margin: 0 0 8px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Screenshot</h3>
        <img src="${screenshot}" alt="Bug Screenshot" style="max-width: 100%; border-radius: 8px; border: 1px solid #e4e4e7;">
      </div>
      `
          : ""
      }
      
      <div style="border-top: 1px solid #e4e4e7; padding-top: 20px;">
        <h3 style="margin: 0 0 12px; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Technical Details</h3>
        <table style="width: 100%; font-size: 14px;">
          <tr>
            <td style="padding: 4px 0; color: #71717a;">Reporter:</td>
            <td style="padding: 4px 0; color: #3f3f46;">${userEmail || "Unknown"}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #71717a;">URL:</td>
            <td style="padding: 4px 0; color: #3f3f46; word-break: break-all;">${currentUrl}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #71717a;">Browser:</td>
            <td style="padding: 4px 0; color: #3f3f46;">${userAgent}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #71717a;">Timestamp:</td>
            <td style="padding: 4px 0; color: #3f3f46;">${new Date().toISOString()}</td>
          </tr>
        </table>
      </div>
    </div>
    
    <div style="background: #f4f4f5; padding: 16px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #71717a;">
        This bug report was submitted via ActiPlan
      </p>
    </div>
  </div>
</body>
</html>
`;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    // Send to support team using fetch
    const supportEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ActiPlan Bug Reports <onboarding@resend.dev>",
        to: [SUPPORT_EMAIL],
        reply_to: userEmail || undefined,
        subject: `[${severity.toUpperCase()}] ${title} - ${ticketId}`,
        html: emailHtml,
      }),
    });

    if (!supportEmailResponse.ok) {
      const errorText = await supportEmailResponse.text();
      console.error("[SEND-BUG-REPORT] Support email failed:", errorText);
      throw new Error(`Failed to send support email: ${errorText}`);
    }

    console.log("[SEND-BUG-REPORT] Support email sent successfully");

    // Send copy to user if email provided
    if (userEmail) {
      const userEmailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ActiPlan <onboarding@resend.dev>",
          to: [userEmail],
          subject: `Bug Report Received - ${ticketId}`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #6366f1, #a855f7); padding: 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Thank You!</h1>
    </div>
    
    <div style="padding: 24px;">
      <p style="color: #3f3f46; line-height: 1.6;">
        We've received your bug report and our team will investigate it shortly.
      </p>
      
      <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px; color: #71717a; font-size: 14px;"><strong>Ticket ID:</strong> ${ticketId}</p>
        <p style="margin: 0 0 8px; color: #71717a; font-size: 14px;"><strong>Title:</strong> ${title}</p>
        <p style="margin: 0; color: #71717a; font-size: 14px;"><strong>Severity:</strong> ${severity}</p>
      </div>
      
      <p style="color: #3f3f46; line-height: 1.6;">
        We'll reach out if we need more information. Thank you for helping us improve ActiPlan!
      </p>
    </div>
    
    <div style="background: #f4f4f5; padding: 16px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #71717a;">
        This is an automated confirmation from ActiPlan
      </p>
    </div>
  </div>
</body>
</html>
`,
        }),
      });

      if (userEmailResponse.ok) {
        console.log("[SEND-BUG-REPORT] User confirmation email sent");
      } else {
        console.warn("[SEND-BUG-REPORT] User confirmation email failed");
      }
    }

    return new Response(JSON.stringify({ success: true, ticketId }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[SEND-BUG-REPORT] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
