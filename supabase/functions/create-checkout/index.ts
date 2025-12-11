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

// Basic plan price IDs - these get 30-day trial for NEW subscriptions
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

    // Check if user has an existing subscription
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
        logStep("Existing subscription found", { 
          subscriptionId: activeSub.id, 
          status: activeSub.status,
          currentPriceId: activeSub.items.data[0]?.price?.id 
        });

        // Check if already on the same price
        const currentPriceId = activeSub.items.data[0]?.price?.id;
        if (currentPriceId === priceId) {
          return new Response(JSON.stringify({ 
            error: "You are already subscribed to this plan" 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          });
        }

        // Update the existing subscription to the new price
        // Must delete old item and add new item to properly replace the plan
        const subscriptionItemId = activeSub.items.data[0]?.id;
        
        // Build update params - delete old item, add new price
        const updateParams: Stripe.SubscriptionUpdateParams = {
          items: [
            {
              id: subscriptionItemId,
              deleted: true,
            },
            {
              price: priceId,
            }
          ],
          proration_behavior: 'create_prorations',
        };

        // If upgrading from trial to a non-Basic plan, end the trial immediately
        if (activeSub.status === "trialing" && !isBasicPlan) {
          updateParams.trial_end = 'now';
          logStep("Ending trial immediately for upgrade to non-Basic plan");
        }

        // Update the subscription
        const updatedSub = await stripe.subscriptions.update(activeSub.id, updateParams);
        
        logStep("Subscription updated successfully", { 
          subscriptionId: updatedSub.id,
          newStatus: updatedSub.status,
          newPriceId: updatedSub.items.data[0]?.price?.id
        });

        // Return success - no redirect needed, subscription updated directly
        return new Response(JSON.stringify({ 
          success: true,
          message: "Subscription updated successfully",
          subscriptionId: updatedSub.id,
          status: updatedSub.status
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // No existing subscription - create new checkout session
    logStep("No existing subscription, creating checkout session");

    // Only Basic plan gets 30-day trial for new subscriptions
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = isBasicPlan 
      ? { trial_period_days: 30 }
      : {}; // No trial for Freelance+

    logStep("Plan type determined", { isBasicPlan, hasTrialPeriod: isBasicPlan });

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

    logStep("Checkout session created", { sessionId: session.id, url: session.url, hasTrialPeriod: isBasicPlan });

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
