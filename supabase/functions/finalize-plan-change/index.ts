import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FINALIZE-PLAN-CHANGE] ${step}${detailsStr}`);
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

    const { sessionId } = await req.json();
    if (!sessionId) throw new Error("Session ID is required");
    logStep("Session ID received", { sessionId });

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { email: user.email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription']
    });

    logStep("Checkout session retrieved", { 
      status: session.status,
      paymentStatus: session.payment_status,
      subscriptionId: session.subscription
    });

    if (session.status !== 'complete') {
      return new Response(JSON.stringify({ 
        error: "Checkout session is not complete" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Get the new subscription
    const newSubscription = session.subscription as Stripe.Subscription;
    if (!newSubscription) {
      return new Response(JSON.stringify({ 
        error: "No subscription found in session" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Check if there was a previous subscription to cancel
    const previousSubscriptionId = newSubscription.metadata?.previous_subscription_id;
    
    if (previousSubscriptionId) {
      logStep("Canceling previous subscription", { previousSubscriptionId });
      
      try {
        // Cancel the old subscription immediately
        await stripe.subscriptions.cancel(previousSubscriptionId, {
          prorate: true, // Issue prorated refund for unused time
        });
        logStep("Previous subscription canceled with prorated refund");
      } catch (cancelError) {
        // Log but don't fail - the old subscription might already be canceled
        logStep("Warning: Could not cancel previous subscription", { 
          error: cancelError instanceof Error ? cancelError.message : String(cancelError)
        });
      }
    }

    // Check if customer has credit balance and refund it
    let refundedAmount = 0;
    if (previousSubscriptionId) {
      try {
        // Get customer ID from subscription
        const customerId = typeof newSubscription.customer === 'string' 
          ? newSubscription.customer 
          : newSubscription.customer.id;
        
        // Check customer balance (negative = credit)
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const creditBalance = customer.balance; // Negative value = credit
        
        if (creditBalance < 0) {
          const refundAmount = Math.abs(creditBalance);
          logStep("Customer has credit balance, issuing refund", { 
            customerId, 
            creditBalance, 
            refundAmount 
          });
          
          // Create a refund by adjusting customer balance to zero
          // and issuing a payout/refund for the credit amount
          await stripe.customers.update(customerId, {
            balance: 0
          });
          
          // Find the most recent charge to refund against
          const charges = await stripe.charges.list({
            customer: customerId,
            limit: 5
          });
          
          const refundableCharge = charges.data.find((c: Stripe.Charge) => 
            c.status === 'succeeded' && 
            !c.refunded && 
            c.amount >= refundAmount
          );
          
          if (refundableCharge) {
            await stripe.refunds.create({
              charge: refundableCharge.id,
              amount: refundAmount,
              reason: 'requested_by_customer'
            });
            refundedAmount = refundAmount / 100; // Convert to dollars
            logStep("Refund issued successfully", { 
              chargeId: refundableCharge.id, 
              refundAmount: refundedAmount 
            });
          } else {
            logStep("No refundable charge found, credit applied to account balance");
          }
        }
      } catch (refundError) {
        logStep("Warning: Could not process refund", { 
          error: refundError instanceof Error ? refundError.message : String(refundError)
        });
      }
    }

    logStep("Plan change finalized successfully", {
      newSubscriptionId: newSubscription.id,
      previousSubscriptionCanceled: !!previousSubscriptionId,
      refundedAmount
    });

    return new Response(JSON.stringify({ 
      success: true,
      refundedAmount,
      message: refundedAmount > 0
        ? `Plan changed successfully! $${refundedAmount.toFixed(2)} has been refunded to your card.`
        : previousSubscriptionId 
          ? "Plan changed successfully!"
          : "Subscription activated successfully!"
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
