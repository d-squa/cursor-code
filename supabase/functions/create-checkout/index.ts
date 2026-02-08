import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

// Input validation schema
const checkoutInputSchema = z.object({
  priceId: z.string().regex(/^price_[a-zA-Z0-9]+$/, "Invalid price ID format"),
});

// Basic plan price IDs - these get 30-day trial for NEW subscriptions only
const BASIC_PRICE_IDS = [
  "price_1ScnObKrTGU4P754AAJ9Q5NU", // monthly
  "price_1ScnL9KrTGU4P754QirsF0Sd", // yearly
];

// Price metadata for GTM tracking and comparison (all USD)
const PRICE_METADATA: Record<
  string,
  { amount: number; planName: string; productId: string; billingCycle: "monthly" | "yearly" }
> = {
  // Basic (USD)
  price_1ScnObKrTGU4P754AAJ9Q5NU: {
    amount: 3900,
    planName: "Basic",
    productId: "prod_TZxJsj5K3hZ8Ku",
    billingCycle: "monthly",
  },
  price_1ScnL9KrTGU4P754QirsF0Sd: {
    amount: 39780,
    planName: "Basic",
    productId: "prod_TZxJsj5K3hZ8Ku",
    billingCycle: "yearly",
  },
  // Freelancer (USD)
  price_1SyblZKrTGU4P754e0GfARV4: {
    amount: 9900,
    planName: "Freelancer",
    productId: "prod_TwUlLQvTFz0efa",
    billingCycle: "monthly",
  },
  price_1SyblbKrTGU4P754Otu9dcxm: {
    amount: 100980,
    planName: "Freelancer",
    productId: "prod_TwUlLQvTFz0efa",
    billingCycle: "yearly",
  },
  // Enterprise (USD)
  price_1SyblcKrTGU4P754HYOgkuIQ: {
    amount: 24900,
    planName: "Enterprise",
    productId: "prod_TwUlg5cv5lkldX",
    billingCycle: "monthly",
  },
  price_1SybldKrTGU4P754EBnjjPos: {
    amount: 253980,
    planName: "Enterprise",
    productId: "prod_TwUlg5cv5lkldX",
    billingCycle: "yearly",
  },
  // Agency (USD)
  price_1SyblfKrTGU4P754gwTKmrsC: {
    amount: 69900,
    planName: "Agency",
    productId: "prod_TwUlIMDiwjhsq6",
    billingCycle: "monthly",
  },
  price_1SyblfKrTGU4P754PtKbziMk: {
    amount: 712980,
    planName: "Agency",
    productId: "prod_TwUlIMDiwjhsq6",
    billingCycle: "yearly",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
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
          supabase_user_id: user.id,
        },
      });
      customerId = newCustomer.id;
      logStep("Created new Stripe customer", { customerId });

      // Store the mapping in billing_customers
      const { error: insertError } = await supabaseClient.from("billing_customers").insert({
        user_id: user.id,
        email: user.email,
        stripe_customer_id: customerId,
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
        (s: Stripe.Subscription) => s.status === "active" || s.status === "trialing",
      );

      if (activeSub) {
        existingSubscription = activeSub;
        const currentPriceId = activeSub.items.data[0]?.price?.id;
        const currentCurrency = activeSub.items.data[0]?.price?.currency;

        logStep("Existing active subscription found", {
          subscriptionId: activeSub.id,
          status: activeSub.status,
          currentPriceId,
          currentCurrency,
        });

        // Check for currency mismatch - Stripe doesn't allow mixing currencies on a customer
        // All our new prices are USD; if user is on EUR (old prices), they must cancel first
        if (currentCurrency && currentCurrency !== "usd") {
          logStep("Currency mismatch detected", { currentCurrency, targetCurrency: "usd" });
          return new Response(
            JSON.stringify({
              error: `Your current subscription uses ${currentCurrency.toUpperCase()}. Please cancel your current plan first, then subscribe to the new USD plan.`,
              errorCode: "CURRENCY_MISMATCH",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }

        // Check if already on the same price (only for active/trialing subs)
        if (currentPriceId === priceId) {
          return new Response(
            JSON.stringify({
              error: "You are already subscribed to this plan",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }

        // Determine if this is a downgrade or upgrade
        const currentAmount = PRICE_METADATA[currentPriceId || ""]?.amount || 0;
        const newAmount = PRICE_METADATA[priceId]?.amount || 0;
        const isDowngrade = newAmount < currentAmount;
        const isUpgrade = newAmount > currentAmount;
        const isTrialing = activeSub.status === "trialing";

        logStep("Plan change detected", {
          oldPriceId: currentPriceId,
          newPriceId: priceId,
          currentAmount,
          newAmount,
          isDowngrade,
          isUpgrade,
          isTrialing,
        });

        // For UPGRADES: Use Stripe's subscription update with proration
        // This charges only the prorated difference, not the full new price
        if (isUpgrade && !isTrialing) {
          logStep("Processing upgrade with proration");

          try {
            // Get the subscription item ID
            const subscriptionItemId = activeSub.items.data[0]?.id;

            if (!subscriptionItemId) {
              throw new Error("Could not find subscription item to update");
            }

            // Update the subscription in-place with proration
            // Stripe will automatically calculate and charge the prorated difference
            const updatedSubscription = await stripe.subscriptions.update(activeSub.id, {
              items: [
                {
                  id: subscriptionItemId,
                  price: priceId,
                },
              ],
              proration_behavior: "create_prorations", // Create prorated invoice items
              payment_behavior: "pending_if_incomplete", // Allow payment to be collected
            });

            logStep("Subscription upgraded successfully with proration", {
              subscriptionId: updatedSubscription.id,
              newPriceId: priceId,
              status: updatedSubscription.status,
            });

            // Create an invoice immediately to collect the prorated amount
            try {
              const invoice = await stripe.invoices.create({
                customer: customerId,
                subscription: activeSub.id,
                auto_advance: true, // Automatically finalize and attempt payment
              });

              if (invoice.status === "draft") {
                await stripe.invoices.finalizeInvoice(invoice.id);
                await stripe.invoices.pay(invoice.id);
              }

              logStep("Prorated invoice created and paid", {
                invoiceId: invoice.id,
                amount: invoice.amount_due,
              });
            } catch (invoiceError) {
              // Invoice may already be created/paid by proration, that's fine
              logStep("Invoice handling note", {
                note: "Proration may have been applied to next billing cycle",
                error: invoiceError instanceof Error ? invoiceError.message : String(invoiceError),
              });
            }

            const priceInfo = PRICE_METADATA[priceId];

            // Redirect to success page directly (no checkout needed for upgrades)
            const successUrl =
              `${origin}/settings/plans?success=true&upgraded=true` +
              `&plan_name=${encodeURIComponent(priceInfo?.planName || "")}` +
              `&stripe_price_id=${encodeURIComponent(priceId)}` +
              `&stripe_product_id=${encodeURIComponent(priceInfo?.productId || "")}` +
              `&billing_cycle=${encodeURIComponent(priceInfo?.billingCycle || "")}`;

            return new Response(
              JSON.stringify({
                url: successUrl,
                type: "upgrade_complete",
                message: `Successfully upgraded to ${priceInfo?.planName}! Prorated charges have been applied.`,
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
              },
            );
          } catch (upgradeError) {
            logStep("Error during upgrade", {
              error: upgradeError instanceof Error ? upgradeError.message : String(upgradeError),
            });

            // Fall back to checkout if direct upgrade fails
            logStep("Falling back to checkout for upgrade");
          }
        }

        // Calculate prorated refund for downgrades (non-trial)
        let refundAmount = 0;
        if (isDowngrade && !isTrialing) {
          try {
            const now = Math.floor(Date.now() / 1000);

            // Get the latest paid invoice - the line items contain the actual billing period
            const invoices = await stripe.invoices.list({
              subscription: activeSub.id,
              limit: 1,
              status: "paid",
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
                lineItemPeriod: lineItem?.period,
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
                    refundAmount,
                  });
                } else {
                  logStep("Refund conditions not met", {
                    unusedSeconds,
                    totalPeriodSeconds,
                    paidAmount,
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
              error: refundCalcError instanceof Error ? refundCalcError.message : String(refundCalcError),
            });
          }
        }

        // Create checkout session for the new plan (downgrades or fallback for upgrades)
        // Store previous subscription ID in metadata - will be canceled AFTER checkout completes
        const priceInfo = PRICE_METADATA[priceId];
        const priceInCurrency = priceInfo ? (priceInfo.amount / 100).toFixed(2) : "0.00";
        const successUrl =
          `${origin}/settings/plans?success=true&session_id={CHECKOUT_SESSION_ID}` +
          `&plan_name=${encodeURIComponent(priceInfo?.planName || "")}` +
          `&stripe_price_id=${encodeURIComponent(priceId)}` +
          `&stripe_product_id=${encodeURIComponent(priceInfo?.productId || "")}` +
          `&billing_cycle=${encodeURIComponent(priceInfo?.billingCycle || "")}` +
          `&is_trial=false` +
          `&price=${encodeURIComponent(priceInCurrency)}` +
          `&quantity=1` +
          `&currency=USD`;

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
          metadata: {
            plan_name: priceInfo?.planName || "Unknown",
            stripe_price_id: priceId,
            stripe_product_id: priceInfo?.productId || "",
            billing_cycle: priceInfo?.billingCycle || "monthly",
          },
          subscription_data: {
            metadata: {
              previous_subscription_id: activeSub.id,
              refund_amount: refundAmount.toString(),
              is_downgrade: isDowngrade.toString(),
            },
          },
          success_url: successUrl,
          cancel_url: `${origin}/settings/plans?canceled=true`,
        });

        logStep("Plan change checkout session created", {
          sessionId: session.id,
          url: session.url,
          previousSubscriptionId: activeSub.id,
          refundAmount,
          isDowngrade,
        });

        return new Response(
          JSON.stringify({
            url: session.url,
            type: "checkout",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }
    }

    // NEW SUBSCRIPTION: Use Stripe Checkout
    // Trial only for Basic plan with no existing subscription
    const shouldHaveTrial = isBasicPlan && !existingSubscription;

    logStep("Creating checkout for new subscription", {
      isBasicPlan,
      hasExistingCustomer: !!customerId,
      hasTrialPeriod: shouldHaveTrial,
    });

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {};

    if (shouldHaveTrial) {
      subscriptionData.trial_period_days = 30;
      logStep("Adding 30-day trial period");
    }

    const priceInfo = PRICE_METADATA[priceId];
    const priceInCurrency = priceInfo ? (priceInfo.amount / 100).toFixed(2) : "0.00";
    const successUrl =
      `${origin}/settings/plans?success=true&session_id={CHECKOUT_SESSION_ID}` +
      `&plan_name=${encodeURIComponent(priceInfo?.planName || "")}` +
      `&stripe_price_id=${encodeURIComponent(priceId)}` +
      `&stripe_product_id=${encodeURIComponent(priceInfo?.productId || "")}` +
      `&billing_cycle=${encodeURIComponent(priceInfo?.billingCycle || "")}` +
      `&is_trial=${shouldHaveTrial}` +
      `&price=${encodeURIComponent(priceInCurrency)}` +
      `&quantity=1` +
      `&currency=USD`;

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
      metadata: {
        plan_name: priceInfo?.planName || "Unknown",
        stripe_price_id: priceId,
        stripe_product_id: priceInfo?.productId || "",
        billing_cycle: priceInfo?.billingCycle || "monthly",
      },
      subscription_data: Object.keys(subscriptionData).length > 0 ? subscriptionData : undefined,
      success_url: successUrl,
      cancel_url: `${origin}/settings/plans?canceled=true`,
    });

    logStep("Checkout session created", {
      sessionId: session.id,
      url: session.url,
      hasTrialPeriod: shouldHaveTrial,
    });

    return new Response(
      JSON.stringify({
        url: session.url,
        type: "checkout",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: "Unable to process checkout request" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
