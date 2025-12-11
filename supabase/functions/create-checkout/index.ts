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

// Price amounts in cents for comparison (to detect upgrade vs downgrade)
const PRICE_AMOUNTS: Record<string, number> = {
  "price_1ScnObKrTGU4P754AAJ9Q5NU": 3900,    // Basic Monthly $39
  "price_1ScnL9KrTGU4P754QirsF0Sd": 39780,   // Basic Yearly $397.80
  "price_1ScnOcKrTGU4P754y5pmh5jf": 8900,    // Freelancer Monthly $89
  "price_1ScnNYKrTGU4P754hbyoSjdc": 90780,   // Freelancer Yearly $907.80
  "price_1ScnOdKrTGU4P7542mtt9uyC": 18900,   // Enterprise Monthly $189
  "price_1ScnOOKrTGU4P754r7bdJ94j": 192780,  // Enterprise Yearly $1927.80
  "price_1ScnOeKrTGU4P75446dvndr3": 99900,   // Agency Monthly $999
  "price_1ScnOPKrTGU4P754sNgouHiL": 1018980, // Agency Yearly $10189.80
};

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
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing customer found", { customerId });
    }

    const origin = req.headers.get("origin") || "https://lovable.dev";
    const isBasicPlan = BASIC_PRICE_IDS.includes(priceId);

    // Check if user has an existing active/trialing subscription
    let existingSubscription: Stripe.Subscription | null = null;

    if (customerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });

      // First try to find active/trialing subscription
      let activeSub = subscriptions.data.find(
        (s: Stripe.Subscription) => s.status === "active" || s.status === "trialing"
      );

      // If no active sub, check for very recently cancelled one (within last 5 mins) 
      // This handles race condition where subscription was just cancelled
      if (!activeSub) {
        const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
        activeSub = subscriptions.data.find(
          (s: Stripe.Subscription) => 
            s.status === "canceled" && 
            s.canceled_at && 
            s.canceled_at > fiveMinutesAgo
        );
        if (activeSub) {
          logStep("Found recently cancelled subscription for comparison", { 
            subscriptionId: activeSub.id,
            cancelledAt: activeSub.canceled_at
          });
        }
      }

      if (activeSub) {
        existingSubscription = activeSub;
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

        // Determine if this is a downgrade
        const currentAmount = PRICE_AMOUNTS[currentPriceId || ''] || 0;
        const newAmount = PRICE_AMOUNTS[priceId] || 0;
        const isDowngrade = newAmount < currentAmount;
        const isTrialing = activeSub.status === "trialing";

        logStep("Plan change detected", { 
          oldPriceId: currentPriceId, 
          newPriceId: priceId,
          currentAmount,
          newAmount,
          isDowngrade,
          isTrialing
        });

        // Calculate prorated refund for downgrades (non-trial)
        let refundAmount = 0;
        if (isDowngrade && !isTrialing) {
          // For canceled subscriptions, period_end might be in the past
          // We need to find the most recent invoice to get actual paid amount and period
          try {
            const invoices = await stripe.invoices.list({
              subscription: activeSub.id,
              limit: 1,
              status: 'paid',
            });
            
            if (invoices.data.length > 0) {
              const latestInvoice = invoices.data[0];
              const periodStart = latestInvoice.period_start;
              const periodEnd = latestInvoice.period_end;
              const paidAmount = latestInvoice.amount_paid; // Amount actually paid in cents
              const now = Math.floor(Date.now() / 1000);
              
              const totalPeriodSeconds = periodEnd - periodStart;
              const unusedSeconds = periodEnd - now;
              
              logStep("Invoice-based refund calculation", { 
                invoiceId: latestInvoice.id,
                periodStart,
                periodEnd,
                now,
                paidAmount,
                totalPeriodSeconds,
                unusedSeconds
              });
              
              if (unusedSeconds > 0 && totalPeriodSeconds > 0 && paidAmount > 0) {
                const unusedRatio = unusedSeconds / totalPeriodSeconds;
                refundAmount = Math.floor(paidAmount * unusedRatio);
                
                logStep("Calculated prorated refund from invoice", { 
                  unusedRatio: unusedRatio.toFixed(4),
                  paidAmount,
                  refundAmount
                });
              } else {
                logStep("Refund conditions not met", { 
                  unusedSeconds,
                  totalPeriodSeconds,
                  paidAmount
                });
              }
            } else {
              logStep("No paid invoice found for subscription");
            }
          } catch (invoiceError) {
            logStep("Error fetching invoices for refund calculation", { 
              error: invoiceError instanceof Error ? invoiceError.message : String(invoiceError) 
            });
          }
        }

        // Create checkout session for the new plan
        // Store previous subscription ID and refund info in metadata
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
          subscription_data: {
            metadata: {
              previous_subscription_id: activeSub.id,
              refund_amount: refundAmount.toString(),
              is_downgrade: isDowngrade.toString(),
            },
          },
          success_url: `${origin}/settings/plans?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/settings/plans?canceled=true`,
        });

        logStep("Plan change checkout session created", { 
          sessionId: session.id, 
          url: session.url,
          previousSubscriptionId: activeSub.id,
          refundAmount,
          isDowngrade
        });

        return new Response(JSON.stringify({ 
          url: session.url,
          type: 'checkout'
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // NEW SUBSCRIPTION: Use Stripe Checkout
    // Trial only for Basic plan with no existing subscription
    const shouldHaveTrial = isBasicPlan && !existingSubscription;
    
    logStep("Creating checkout for new subscription", { 
      isBasicPlan, 
      hasExistingCustomer: !!customerId,
      hasTrialPeriod: shouldHaveTrial
    });

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {};
    
    if (shouldHaveTrial) {
      subscriptionData.trial_period_days = 30;
      logStep("Adding 30-day trial period");
    }

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
      hasTrialPeriod: shouldHaveTrial
    });

    return new Response(JSON.stringify({ 
      url: session.url,
      type: 'checkout'
    }), {
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
