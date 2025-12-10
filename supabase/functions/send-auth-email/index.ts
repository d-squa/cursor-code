import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!hookSecret || !resendApiKey) {
    console.error("Missing SEND_EMAIL_HOOK_SECRET or RESEND_API_KEY");
    return new Response(
      JSON.stringify({ error: { message: "Server configuration error" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);
    const wh = new Webhook(hookSecret);

    const {
      user,
      email_data: { token, token_hash, redirect_to, email_action_type },
    } = wh.verify(payload, headers) as {
      user: { email: string };
      email_data: {
        token: string;
        token_hash: string;
        redirect_to: string;
        email_action_type: string;
      };
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const confirmationUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`;

    // Determine email content based on action type
    let subject = "ActiPlan";
    let heading = "ActiPlan";
    let message = "Click the button below to continue.";
    let buttonText = "Continue";

    switch (email_action_type) {
      case "signup":
        subject = "Confirm your ActiPlan account";
        heading = "Welcome to ActiPlan!";
        message = "Click the button below to confirm your email address and activate your account.";
        buttonText = "Confirm Email";
        break;
      case "recovery":
        subject = "Reset your ActiPlan password";
        heading = "Reset Your Password";
        message = "Click the button below to reset your password. This link will expire in 24 hours.";
        buttonText = "Reset Password";
        break;
      case "invite":
        subject = "You have been invited to ActiPlan";
        heading = "You're Invited!";
        message = "You have been invited to join ActiPlan. Click the button below to accept your invitation.";
        buttonText = "Accept Invitation";
        break;
      case "magiclink":
        subject = "Your ActiPlan login link";
        heading = "Login to ActiPlan";
        message = "Click the button below to log in to your account. This link will expire in 1 hour.";
        buttonText = "Log In";
        break;
      case "email_change":
        subject = "Confirm your new email address";
        heading = "Confirm Email Change";
        message = "Click the button below to confirm your new email address.";
        buttonText = "Confirm Email";
        break;
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; background-color: #ffffff; padding: 40px 20px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <span style="font-size: 28px; font-weight: bold; color: #6366f1;">ActiPlan</span>
        </div>
        
        <h1 style="color: #1a1a1a; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 24px;">${heading}</h1>
        
        <p style="color: #4a4a4a; font-size: 16px; line-height: 26px; text-align: center; margin: 0 0 32px;">${message}</p>
        
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${confirmationUrl}" target="_blank" 
             style="background-color: #6366f1; border-radius: 6px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; text-align: center; display: inline-block; padding: 12px 32px;">
            ${buttonText}
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 24px 0 8px;">
          Or copy and paste this URL into your browser:
        </p>
        <p style="color: #6366f1; font-size: 12px; text-align: center; word-break: break-all; margin: 0 0 24px;">
          ${confirmationUrl}
        </p>
        
        ${token ? `
          <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 24px 0 8px;">
            Your verification code:
          </p>
          <div style="text-align: center; padding: 16px; background-color: #f4f4f5; border-radius: 6px; border: 1px solid #e4e4e7; margin: 0 auto 24px; max-width: 200px;">
            <code style="color: #1a1a1a; font-size: 24px; font-weight: 600; letter-spacing: 4px;">${token}</code>
          </div>
        ` : ""}
        
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 32px 0 0; border-top: 1px solid #e5e7eb; padding-top: 24px;">
          If you didn't request this email, you can safely ignore it.
        </p>
        
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 16px 0 0;">
          © ${new Date().getFullYear()} ActiPlan. All rights reserved.
        </p>
      </div>
    `;

    console.log("Sending auth email to:", user.email, "type:", email_action_type);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "ActiPlan <do-not-reply@actiplan.app>",
        to: [user.email],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Resend API error (${response.status}):`, error);
      throw new Error(`Failed to send email: ${error}`);
    }

    const result = await response.json();
    console.log("Auth email sent successfully:", result);

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error sending auth email:", error);
    return new Response(
      JSON.stringify({
        error: {
          http_code: error.code || 500,
          message: error.message,
        },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
});
