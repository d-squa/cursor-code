import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { buildStripeCustomerParams, PROFILE_SELECT } from "../_shared/stripe-customer-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ACTIVATE-FREE-TRIAL] ${step}${detailsStr}`);
};

// Basic Monthly price ID (30-day trial)
const BASIC_MONTHLY_PRICE_ID = "price_1SydZ7KrTGU4P754jqI2guPI";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email || !user?.id) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Skip trial activation for invited users (they use team owner's subscription)
    const { data: invitedRoles } = await supabaseClient
      .from("user_roles")
      .select("id, role, team_id")
      .eq("user_id", user.id)
      .neq("role", "owner");

    if (invitedRoles && invitedRoles.length > 0) {
      logStep("User is an invited team member, skipping trial activation", {
        roles: invitedRoles.map(r => ({ role: r.role, team_id: r.team_id })),
      });
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "invited_user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check billing_customers mapping first — use upsert-style logic to prevent race conditions
    let customerId: string | undefined;

    const { data: billingCustomer } = await supabaseClient
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (billingCustomer) {
      customerId = billingCustomer.stripe_customer_id;
      logStep("Found existing billing_customers mapping", { customerId });
    } else {
      // Try to insert a placeholder first to "claim" the slot (prevents race condition)
      // Search Stripe by email first to avoid creating duplicates
      const existingCustomers = await stripe.customers.list({ email: user.email, limit: 5 });
      
      // Filter to find one that matches this user ID in metadata, or take the first one
      const matchingCustomer = existingCustomers.data.find(
        (c: any) => c.metadata?.supabase_user_id === user.id
      ) || existingCustomers.data[0];

      if (matchingCustomer) {
        customerId = matchingCustomer.id;
        logStep("Found existing Stripe customer by email, reusing", { customerId });
      } else {
        // Fetch profile data to enrich Stripe customer
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select(PROFILE_SELECT)
          .eq("id", user.id)
          .single();

        const customerParams = buildStripeCustomerParams(user.email!, user.id, profile);
        const newCustomer = await stripe.customers.create(customerParams);
        customerId = newCustomer.id;
        logStep("Created new Stripe customer with profile data", { customerId });
      }

      // Store the mapping — use upsert to handle race conditions
      const { error: upsertError } = await supabaseClient
        .from("billing_customers")
        .upsert({
          user_id: user.id,
          email: user.email,
          stripe_customer_id: customerId,
        }, { onConflict: "user_id" });

      if (upsertError) {
        logStep("Warning: Failed to store billing_customers mapping", { error: upsertError.message });
      } else {
        logStep("Stored billing_customers mapping");
      }
    }

    // Check if user already has an active/trialing subscription
    const existingSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });

    const activeSub = existingSubs.data.find(
      (s: Stripe.Subscription) => s.status === "active" || s.status === "trialing"
    );

    if (activeSub) {
      logStep("User already has active subscription, skipping trial creation", {
        subscriptionId: activeSub.id,
        status: activeSub.status,
      });
      return new Response(
        JSON.stringify({ success: true, alreadySubscribed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Create subscription with 30-day trial, no payment method required
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: BASIC_MONTHLY_PRICE_ID }],
      trial_period_days: 30,
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
      metadata: {
        source: "landing_page_auto_trial",
        supabase_user_id: user.id,
      },
    });

    logStep("Created trial subscription", {
      subscriptionId: subscription.id,
      status: subscription.status,
      trialEnd: subscription.trial_end,
    });

    return new Response(
      JSON.stringify({
        success: true,
        subscriptionId: subscription.id,
        status: subscription.status,
        trialEnd: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
