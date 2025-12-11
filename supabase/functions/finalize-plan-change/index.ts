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

    logStep("Plan change finalized successfully", {
      newSubscriptionId: newSubscription.id,
      previousSubscriptionCanceled: !!previousSubscriptionId
    });

    return new Response(JSON.stringify({ 
      success: true,
      message: previousSubscriptionId 
        ? "Plan changed successfully! Your previous subscription has been canceled with a prorated refund."
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
