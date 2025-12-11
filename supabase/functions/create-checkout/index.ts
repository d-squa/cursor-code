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
          // For downgrades: Calculate prorated refund and issue it to the card
          logStep("Processing downgrade with refund");

          // Calculate remaining value on current subscription
          const currentPeriodStart = activeSub.current_period_start;
          const currentPeriodEnd = activeSub.current_period_end;
          const now = Math.floor(Date.now() / 1000);
          
          const totalPeriodSeconds = currentPeriodEnd - currentPeriodStart;
          const remainingSeconds = currentPeriodEnd - now;
          const remainingRatio = remainingSeconds / totalPeriodSeconds;
          
          // Get the actual amount paid for current period
          const currentPeriodAmount = currentPrice.unit_amount || 0;
          const unusedAmount = Math.floor(currentPeriodAmount * remainingRatio);
          
          // Calculate what the new plan would cost for the remaining period
          const newPlanRemainingCost = Math.floor((newPrice.unit_amount || 0) * remainingRatio);
          
          // Refund amount is the difference (unused current - cost of new for remaining period)
          const refundAmount = unusedAmount - newPlanRemainingCost;

          logStep("Refund calculation", {
            currentPeriodAmount: currentPeriodAmount / 100,
            unusedAmount: unusedAmount / 100,
            newPlanRemainingCost: newPlanRemainingCost / 100,
            refundAmount: refundAmount / 100,
            remainingRatio: (remainingRatio * 100).toFixed(1) + '%'
          });

          // Update subscription (end trial if on trial)
          await stripe.subscriptions.update(activeSub.id, {
            items: [{
              id: subscriptionItemId,
              price: priceId,
            }],
            trial_end: isOnTrial ? 'now' : undefined, // End trial if on trial
            proration_behavior: 'none', // We'll handle refund manually
          });

          logStep("Subscription downgraded");

          // Issue refund if there's a positive amount to refund (only for paid subscriptions)
          if (refundAmount > 0 && !isOnTrial) {
            // Find the most recent successful payment for this subscription
            const invoices = await stripe.invoices.list({
              subscription: activeSub.id,
              status: 'paid',
              limit: 1,
            });

            if (invoices.data.length > 0 && invoices.data[0].payment_intent) {
              const paymentIntentId = typeof invoices.data[0].payment_intent === 'string' 
                ? invoices.data[0].payment_intent 
                : invoices.data[0].payment_intent.id;

              try {
                const refund = await stripe.refunds.create({
                  payment_intent: paymentIntentId,
                  amount: refundAmount,
                  reason: 'requested_by_customer',
                });

                logStep("Refund issued", { 
                  refundId: refund.id, 
                  amount: refundAmount / 100,
                  currency: refund.currency
                });
              } catch (refundError) {
                // Log but don't fail the operation if refund fails
                logStep("Refund failed (subscription still downgraded)", { 
                  error: refundError instanceof Error ? refundError.message : String(refundError)
                });
              }
            } else {
              logStep("No payment found to refund (subscription still downgraded)");
            }
          }

          return new Response(JSON.stringify({ 
            success: true,
            message: refundAmount > 0 && !isOnTrial
              ? `Plan downgraded. A refund of $${(refundAmount / 100).toFixed(2)} will be issued to your card.`
              : "Plan downgraded successfully.",
            refundAmount: refundAmount > 0 && !isOnTrial ? refundAmount / 100 : 0,
            redirectUrl: `${origin}/settings/plans?success=true`
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });

        } else {
          // For upgrades: Different handling based on whether currently on trial or paid
          if (isOnTrial) {
            // Upgrading from trial: Update subscription directly and END trial immediately
            // This starts billing right away for the new plan
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
            // Upgrading from paid subscription: Redirect to checkout for confirmation
            logStep("Processing upgrade from paid - redirecting to checkout");
            
            // Cancel the current subscription at period end (will be replaced by new one)
            await stripe.subscriptions.update(activeSub.id, {
              cancel_at_period_end: true,
            });
            
            logStep("Current subscription marked for cancellation, creating checkout for upgrade");
            
            // Create checkout session for the new plan (no trial for upgrades)
            const session = await stripe.checkout.sessions.create({
              customer: customerId,
              line_items: [
                {
                  price: priceId,
                  quantity: 1,
                },
              ],
              mode: "subscription",
              payment_method_collection: "always",
              // No subscription_data means no trial - Stripe doesn't allow trial_period_days: 0
              success_url: `${origin}/settings/plans?success=true&upgraded=true`,
              cancel_url: `${origin}/settings/plans?canceled=true`,
            });

            logStep("Upgrade checkout session created", { sessionId: session.id });

            return new Response(JSON.stringify({ url: session.url }), {
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
