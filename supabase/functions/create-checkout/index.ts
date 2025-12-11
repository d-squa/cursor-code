import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

// Basic plan price IDs - these get 30-day trial for NEW subscriptions only
const BASIC_PRICE_IDS = [
  "price_1ScnObKrTGU4P754AAJ9Q5NU", // monthly
  "price_1ScnL9KrTGU4P754QirsF0Sd"  // yearly
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const { priceId } = await req.json();
    if (!priceId) throw new Error("Price ID is required");
    logStep("Price ID received", { priceId });

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { email: user.email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if a Stripe customer already exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing customer found", { customerId });
    }

    const origin = req.headers.get("origin") || "https://lovable.dev";
    const isBasicPlan = BASIC_PRICE_IDS.includes(priceId);

    // Check if user has an existing active/trialing subscription
    let existingSubscription: Stripe.Subscription | null = null;
    let isOnTrial = false;

    if (customerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });

      const activeSub = subscriptions.data.find(
        (s: { status: string }) => s.status === "active" || s.status === "trialing"
      );

      if (activeSub) {
        existingSubscription = activeSub;
        isOnTrial = activeSub.status === 'trialing';
        const currentPriceId = activeSub.items.data[0]?.price?.id;
        
        logStep("Existing subscription found", { 
          subscriptionId: activeSub.id, 
          status: activeSub.status,
          currentPriceId,
          isOnTrial
        });

        // Check if already on the same price
        if (currentPriceId === priceId) {
          return new Response(JSON.stringify({ 
            error: "You are already subscribed to this plan" 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          });
        }
      }
    }

    // Determine if this is a new subscription or a plan change
    const isPlanChange = existingSubscription !== null;
    
    // For new subscriptions: Only Basic plan gets 30-day trial
    // For plan changes: No trial, but we need to cancel old subscription after checkout
    const shouldHaveTrial = isBasicPlan && !customerId;
    
    logStep("Checkout type determined", { 
      isPlanChange,
      isBasicPlan, 
      hasExistingCustomer: !!customerId,
      hasTrialPeriod: shouldHaveTrial,
      existingSubscriptionId: existingSubscription?.id
    });

    // Build subscription_data based on scenario
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {};
    
    if (shouldHaveTrial) {
      subscriptionData.trial_period_days = 30;
    }
    
    // Store existing subscription ID in metadata so we can cancel it after checkout success
    if (existingSubscription) {
      subscriptionData.metadata = {
        previous_subscription_id: existingSubscription.id,
        was_on_trial: isOnTrial ? 'true' : 'false'
      };
    }

    // Create checkout session - ALL plan changes and new subscriptions go through checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      payment_method_collection: "always",
      subscription_data: Object.keys(subscriptionData).length > 0 ? subscriptionData : undefined,
      success_url: `${origin}/settings/plans?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings/plans?canceled=true`,
    });

    logStep("Checkout session created", { 
      sessionId: session.id, 
      url: session.url, 
      hasTrialPeriod: shouldHaveTrial,
      isPlanChange,
      previousSubscriptionId: existingSubscription?.id
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
