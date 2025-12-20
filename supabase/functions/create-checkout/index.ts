import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

// Input validation schema
const checkoutInputSchema = z.object({
  priceId: z.string().regex(/^price_[a-zA-Z0-9]+$/, "Invalid price ID format")
});

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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const body = await req.json();
    const parseResult = checkoutInputSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const { priceId } = parseResult.data;
    logStep("Price ID received", { priceId });

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email || !user?.id) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // STRICT: Use billing_customers mapping - no email-based lookup
    // This prevents cross-account subscription leakage
    let customerId: string | undefined;

    // Check billing_customers table first
    const { data: billingCustomer } = await supabaseClient
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (billingCustomer) {
      customerId = billingCustomer.stripe_customer_id;
      logStep("Found existing billing_customers mapping", { customerId });
    } else {
      // No mapping exists - create a new Stripe customer
      logStep("No billing_customers mapping, creating new Stripe customer");
      
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id
        }
      });
      customerId = newCustomer.id;
      logStep("Created new Stripe customer", { customerId });

      // Store the mapping in billing_customers
      const { error: insertError } = await supabaseClient
        .from("billing_customers")
        .insert({
          user_id: user.id,
          email: user.email,
          stripe_customer_id: customerId
        });

      if (insertError) {
        logStep("Warning: Failed to store billing_customers mapping", { error: insertError.message });
        // Continue anyway - the customer was created
      } else {
        logStep("Stored billing_customers mapping");
      }
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

      // Only look for truly active/trialing subscriptions - cancelled subscriptions should NOT block new purchases
      const activeSub = subscriptions.data.find(
        (s: Stripe.Subscription) => s.status === "active" || s.status === "trialing"
      );

      if (activeSub) {
        existingSubscription = activeSub;
        const currentPriceId = activeSub.items.data[0]?.price?.id;
        
        logStep("Existing active subscription found", { 
          subscriptionId: activeSub.id, 
          status: activeSub.status,
          currentPriceId
        });

        // Check if already on the same price (only for active/trialing subs)
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
          try {
            const now = Math.floor(Date.now() / 1000);
            
            // Get the latest paid invoice - the line items contain the actual billing period
            const invoices = await stripe.invoices.list({
              subscription: activeSub.id,
              limit: 1,
              status: 'paid',
            });
            
            if (invoices.data.length > 0) {
              const latestInvoice = invoices.data[0];
              const paidAmount = latestInvoice.amount_paid;
              
              // Get period from invoice line items (more reliable for canceled subs)
              const lineItem = latestInvoice.lines?.data?.[0];
              const periodStart = lineItem?.period?.start || activeSub.current_period_start;
              const periodEnd = lineItem?.period?.end || activeSub.current_period_end;
              
              logStep("Invoice-based refund calculation", { 
                invoiceId: latestInvoice.id,
                subscriptionId: activeSub.id,
                periodStart,
                periodEnd,
                now,
                paidAmount,
                lineItemPeriod: lineItem?.period
              });
              
              if (periodStart && periodEnd) {
                const totalPeriodSeconds = periodEnd - periodStart;
                const unusedSeconds = periodEnd - now;
                
                if (unusedSeconds > 0 && totalPeriodSeconds > 0 && paidAmount > 0) {
                  const unusedRatio = unusedSeconds / totalPeriodSeconds;
                  refundAmount = Math.floor(paidAmount * unusedRatio);
                  
                  logStep("Calculated prorated refund", { 
                    totalPeriodSeconds,
                    unusedSeconds,
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
                logStep("Could not determine billing period", { periodStart, periodEnd });
              }
            } else {
              logStep("No paid invoice found for subscription");
            }
          } catch (refundCalcError) {
            logStep("Error calculating refund", { 
              error: refundCalcError instanceof Error ? refundCalcError.message : String(refundCalcError) 
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
    return new Response(JSON.stringify({ error: "Unable to process checkout request" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
