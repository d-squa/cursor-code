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
  console.log(`[FINALIZE-PLAN-CHANGE] ${step}${detailsStr}`);
};

// Input validation schema
const sessionInputSchema = z.object({
  sessionId: z.string().regex(/^cs_[a-zA-Z0-9]+$/, "Invalid session ID format")
});

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

    const body = await req.json();
    const parseResult = sessionInputSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const { sessionId } = parseResult.data;
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
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
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

    // Check metadata for refund info
    // Note: previous subscription is now canceled in create-checkout before checkout is created
    const refundAmountFromMetadata = parseInt(newSubscription.metadata?.refund_amount || '0', 10);
    const isDowngrade = newSubscription.metadata?.is_downgrade === 'true';
    const previousPlanCanceled = newSubscription.metadata?.previous_plan_canceled === 'true';
    
    logStep("Subscription metadata", { 
      refundAmountFromMetadata,
      isDowngrade,
      previousPlanCanceled
    });

    // Issue refund for downgrade
    let refundedAmount = 0;
    if (isDowngrade && refundAmountFromMetadata > 0) {
      logStep("Processing downgrade refund", { refundAmountFromMetadata });
      
      try {
        const customerId = typeof newSubscription.customer === 'string' 
          ? newSubscription.customer 
          : newSubscription.customer.id;
        
        // Find a charge to refund against
        const charges = await stripe.charges.list({
          customer: customerId,
          limit: 10
        });
        
        logStep("Found charges", { count: charges.data.length });
        
        // Find a charge that can cover the refund amount
        const refundableCharge = charges.data.find((c: Stripe.Charge) => 
          c.status === 'succeeded' && 
          c.amount >= refundAmountFromMetadata &&
          (c.amount_refunded || 0) + refundAmountFromMetadata <= c.amount
        );
        
        if (refundableCharge) {
          logStep("Found refundable charge", { 
            chargeId: refundableCharge.id, 
            chargeAmount: refundableCharge.amount,
            alreadyRefunded: refundableCharge.amount_refunded
          });
          
          const refund = await stripe.refunds.create({
            charge: refundableCharge.id,
            amount: refundAmountFromMetadata,
            reason: 'requested_by_customer'
          });
          
          refundedAmount = refundAmountFromMetadata / 100; // Convert to dollars
          logStep("Refund issued successfully", { 
            refundId: refund.id,
            chargeId: refundableCharge.id, 
            refundAmount: refundedAmount 
          });
        } else {
          logStep("No suitable charge found for refund, checking for partial refund options");
          
          // Try to find any charge we can partially refund
          for (const charge of charges.data) {
            if (charge.status !== 'succeeded') continue;
            
            const availableForRefund = charge.amount - (charge.amount_refunded || 0);
            if (availableForRefund > 0) {
              const refundThisAmount = Math.min(availableForRefund, refundAmountFromMetadata);
              
              const refund = await stripe.refunds.create({
                charge: charge.id,
                amount: refundThisAmount,
                reason: 'requested_by_customer'
              });
              
              refundedAmount = refundThisAmount / 100;
              logStep("Partial refund issued", { 
                refundId: refund.id,
                chargeId: charge.id, 
                refundAmount: refundedAmount 
              });
              break;
            }
          }
          
          if (refundedAmount === 0) {
            logStep("No refundable charges found");
          }
        }
      } catch (refundError) {
        logStep("Error processing refund", { 
          error: refundError instanceof Error ? refundError.message : String(refundError)
        });
      }
    }

    logStep("Plan change finalized successfully", {
      newSubscriptionId: newSubscription.id,
      previousPlanCanceled,
      refundedAmount,
      isDowngrade
    });

    return new Response(JSON.stringify({ 
      success: true,
      refundedAmount,
      isDowngrade,
      message: refundedAmount > 0
        ? `Plan changed successfully! $${refundedAmount.toFixed(2)} has been refunded to your card.`
        : previousPlanCanceled 
          ? "Plan changed successfully!"
          : "Subscription activated successfully!"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: "Unable to finalize plan change" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
