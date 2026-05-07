import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { buildStripeCustomerParams, PROFILE_SELECT } from "../_shared/stripe-customer-helpers.ts";

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
  "price_1ScnObKrTGU4P754AAJ9Q5NU", // legacy monthly
  "price_1ScnL9KrTGU4P754QirsF0Sd", // legacy yearly
  "price_1SydZ7KrTGU4P754jqI2guPI", // current monthly (USD)
  "price_1SydZEKrTGU4P754aNJHK8pc", // current yearly (USD)
];

// Price metadata for GTM tracking and comparison (all USD)
const PRICE_METADATA: Record<
  string,
  { amount: number; planName: string; productId: string; billingCycle: "monthly" | "yearly" }
> = {
  // Basic (current USD)
  price_1SydZ7KrTGU4P754jqI2guPI: {
    amount: 3900,
    planName: "Basic",
    productId: "prod_TwWcmKdhIOpj2s",
    billingCycle: "monthly",
  },
  price_1SydZEKrTGU4P754aNJHK8pc: {
    amount: 39780,
    planName: "Basic",
    productId: "prod_TwWcQkm8fqfqaO",
    billingCycle: "yearly",
  },
  // Basic (legacy)
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
  // Freelancer (current USD)
  price_1SydVjKrTGU4P754mZJJWvAq: {
    amount: 9900,
    planName: "Freelancer",
    productId: "prod_TwWYJSunEeVqiq",
    billingCycle: "monthly",
  },
  price_1SydVuKrTGU4P754zRmad5iJ: {
    amount: 100980,
    planName: "Freelancer",
    productId: "prod_TwWYJSunEeVqiq",
    billingCycle: "yearly",
  },
  // Freelancer (legacy)
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
  // Enterprise (current USD)
  price_1SydW1KrTGU4P754aeyvSJP8: {
    amount: 24900,
    planName: "Enterprise",
    productId: "prod_TwWZ9ID4ZXtZDA",
    billingCycle: "monthly",
  },
  price_1SydW3KrTGU4P754G3iA7VZM: {
    amount: 253980,
    planName: "Enterprise",
    productId: "prod_TwWZVDvQQ5cYE7",
    billingCycle: "yearly",
  },
  // Enterprise (legacy)
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
  // Agency (current USD)
  price_1SydW5KrTGU4P754vsPg9hWw: {
    amount: 69900,
    planName: "Agency",
    productId: "prod_TwWZww84JxfY9y",
    billingCycle: "monthly",
  },
  price_1SydW8KrTGU4P754AEitLX2A: {
    amount: 712980,
    planName: "Agency",
    productId: "prod_TwWZDJv1p9us5v",
    billingCycle: "yearly",
  },
  // Agency (legacy)
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
  // Legacy Agency
  price_1ScnOeKrTGU4P75446dvndr3: {
    amount: 99900,
    planName: "Agency",
    productId: "prod_TZxJAdnaSLNRsJ",
    billingCycle: "monthly",
  },
};

// Legacy/alternate price IDs that may still be sent by older landing pages.
// Map them to active Stripe prices for this project.
const PRICE_ID_ALIASES: Record<string, string> = {
  // Freelancer legacy aliases -> current
  price_1SyXF5KrTGU4P7548Gb4bgd6: "price_1SydVjKrTGU4P754mZJJWvAq",
  price_1SyXYDKrTGU4P75427F7A2ge: "price_1SydVuKrTGU4P754zRmad5iJ",
  // Enterprise legacy aliases -> current
  price_1SyX3xKrTGU4P754lgSWx7dq: "price_1SydW1KrTGU4P754aeyvSJP8",
  price_1SyX8xKrTGU4P754mXynM6Qn: "price_1SydW3KrTGU4P754G3iA7VZM",
  // Agency legacy aliases -> current
  price_1SyXAnKrTGU4P754hsNny2H7: "price_1SydW5KrTGU4P754vsPg9hWw",
  price_1SyXD1KrTGU4P7541vWVImFY: "price_1SydW8KrTGU4P754AEitLX2A",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let requestedPriceId: string | null = null;
  let resolvedPriceId: string | null = null;

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
    requestedPriceId = parseResult.data.priceId;
    const priceId = PRICE_ID_ALIASES[requestedPriceId] ?? requestedPriceId;
    resolvedPriceId = priceId;
    logStep("Price ID received", { requestedPriceId, resolvedPriceId: priceId });
    if (!PRICE_METADATA[priceId]) {
      logStep("Unsupported price ID", { requestedPriceId, resolvedPriceId: priceId });
      return new Response(JSON.stringify({
        error: "Unsupported plan price selected",
        errorCode: "UNSUPPORTED_PRICE_ID",
        requestedPriceId,
        resolvedPriceId: priceId,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
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

      // Sync profile data to Stripe (fills in name/phone/address if missing)
      try {
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select(PROFILE_SELECT)
          .eq("id", user.id)
          .single();
        if (profile) {
          const params = buildStripeCustomerParams(user.email!, user.id, profile);
          await stripe.customers.update(customerId, {
            name: params.name,
            phone: params.phone,
            address: params.address,
            metadata: params.metadata,
          });
          logStep("Synced profile data to existing Stripe customer");
        }
      } catch (syncErr) {
        logStep("Warning: failed to sync profile to Stripe", { error: String(syncErr) });
      }
    } else {
      // No mapping exists — search Stripe by email first to avoid duplicates
      logStep("No billing_customers mapping, searching Stripe by email first");

      const existingCustomers = await stripe.customers.list({ email: user.email, limit: 5 });
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
              errorCode: "ALREADY_SUBSCRIBED_SAME_PLAN",
              requestedPriceId,
              resolvedPriceId: priceId,
              currentPriceId,
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

        // ALL plan changes (upgrades and downgrades) go through Stripe Checkout
        // This ensures user explicitly reviews and confirms any payment changes
        // Per the "no silent payment" principle - nothing payment-related should happen without checkout
        logStep("Plan change requires checkout confirmation", { isUpgrade, isDowngrade });

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
          `${origin}/choose-plan?success=true&session_id={CHECKOUT_SESSION_ID}` +
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
          cancel_url: `${origin}/choose-plan?canceled=true`,
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
      `${origin}/choose-plan?success=true&session_id={CHECKOUT_SESSION_ID}` +
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
      cancel_url: `${origin}/choose-plan?canceled=true`,
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
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error?.type ?? null;
    const errorCode = error?.code ?? null;
    logStep("ERROR", { message: errorMessage, type: errorType, code: errorCode });

    // Surface Stripe request failures as actionable 400s instead of opaque 500s.
    const isStripeRequestError =
      errorType === "StripeInvalidRequestError" ||
      errorType === "StripeAuthenticationError" ||
      errorType === "StripePermissionError";

    return new Response(JSON.stringify({
      error: errorMessage || "Unable to process checkout request",
      errorCode: isStripeRequestError ? "STRIPE_REQUEST_ERROR" : "CHECKOUT_INTERNAL_ERROR",
      stripeType: errorType,
      stripeCode: errorCode,
      requestedPriceId,
      resolvedPriceId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: isStripeRequestError ? 400 : 500,
    });
  }
});
