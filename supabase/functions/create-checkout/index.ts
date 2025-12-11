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
        const currentPriceId = activeSub.items.data[0]?.price?.id;
        logStep("Existing subscription found", { 
          subscriptionId: activeSub.id, 
          status: activeSub.status,
          currentPriceId
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

        // Fetch both current and new price details to determine upgrade vs downgrade
        const [currentPrice, newPrice] = await Promise.all([
          stripe.prices.retrieve(currentPriceId),
          stripe.prices.retrieve(priceId)
        ]);

        // Normalize prices to monthly equivalent for comparison
        const getCurrentMonthlyAmount = (price: Stripe.Price) => {
          const amount = price.unit_amount || 0;
          if (price.recurring?.interval === 'year') {
            return amount / 12;
          }
          return amount;
        };

        const currentMonthly = getCurrentMonthlyAmount(currentPrice);
        const newMonthly = getCurrentMonthlyAmount(newPrice);
        const isDowngrade = newMonthly < currentMonthly;
        const isOnTrial = activeSub.status === 'trialing';

        logStep("Price comparison", { 
          currentMonthly: currentMonthly / 100,
          newMonthly: newMonthly / 100,
          isDowngrade,
          isOnTrial
        });

        const subscriptionItemId = activeSub.items.data[0]?.id;

        if (isDowngrade) {
          // For downgrades: Update subscription with proration (Stripe issues credit automatically)
          logStep("Processing downgrade");

          // For trials, just update the plan and end trial
          if (isOnTrial) {
            await stripe.subscriptions.update(activeSub.id, {
              items: [{
                id: subscriptionItemId,
                price: priceId,
              }],
              trial_end: 'now', // End trial, start billing at new (lower) price
              proration_behavior: 'none',
            });
            
            logStep("Subscription downgraded from trial - now billing at new rate");
            
            return new Response(JSON.stringify({ 
              success: true,
              message: "Plan changed successfully! Your subscription is now active at the new rate.",
              redirectUrl: `${origin}/settings/plans?success=true`
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
          }

          // For paid subscriptions, use Stripe's proration to handle credits
          await stripe.subscriptions.update(activeSub.id, {
            items: [{
              id: subscriptionItemId,
              price: priceId,
            }],
            proration_behavior: 'create_prorations', // Stripe creates credit for unused time
          });

          logStep("Subscription downgraded with proration credit");

          return new Response(JSON.stringify({ 
            success: true,
            message: "Plan downgraded successfully. Credit for unused time has been applied to your account.",
            redirectUrl: `${origin}/settings/plans?success=true`
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });

        } else {
          // For upgrades: Update existing subscription in-place (no new subscription)
          logStep("Processing upgrade", { isOnTrial });
          
          if (isOnTrial) {
            // Upgrading from trial: End trial immediately and start billing for new plan
            logStep("Processing upgrade from trial - ending trial and starting billing");
            
            await stripe.subscriptions.update(activeSub.id, {
              items: [{
                id: subscriptionItemId,
                price: priceId,
              }],
              trial_end: 'now', // End trial immediately, start billing
              proration_behavior: 'none', // No proration needed since trial was free
            });
            
            logStep("Subscription upgraded from trial - billing started");
            
            return new Response(JSON.stringify({ 
              success: true,
              message: "Plan upgraded successfully! Your subscription is now active and billing has started.",
              redirectUrl: `${origin}/settings/plans?success=true`
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
          } else {
            // Upgrading from paid subscription: Update in-place with proration
            // Stripe will automatically charge the prorated difference
            logStep("Processing upgrade from paid - updating subscription with proration");
            
            await stripe.subscriptions.update(activeSub.id, {
              items: [{
                id: subscriptionItemId,
                price: priceId,
              }],
              proration_behavior: 'create_prorations', // Stripe handles proration automatically
            });
            
            logStep("Subscription upgraded from paid - proration applied");
            
            return new Response(JSON.stringify({ 
              success: true,
              message: "Plan upgraded successfully! A prorated charge has been applied.",
              redirectUrl: `${origin}/settings/plans?success=true`
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
          }
        }
      }
    }

    // No existing subscription - create new checkout session
    logStep("Creating checkout session for new subscription");

    // Only Basic plan gets 30-day trial for brand new customers (no prior subscription)
    const hadPriorSubscription = customerId ? true : false;
    const shouldHaveTrial = isBasicPlan && !hadPriorSubscription;
    
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = shouldHaveTrial 
      ? { trial_period_days: 30 }
      : {};

    logStep("Plan type determined", { 
      isBasicPlan, 
      hadPriorSubscription,
      hasTrialPeriod: shouldHaveTrial 
    });

    // Create checkout session
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
      subscription_data: subscriptionData,
      success_url: `${origin}/settings/plans?success=true`,
      cancel_url: `${origin}/settings/plans?canceled=true`,
    });

    logStep("Checkout session created", { 
      sessionId: session.id, 
      url: session.url, 
      hasTrialPeriod: shouldHaveTrial 
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
