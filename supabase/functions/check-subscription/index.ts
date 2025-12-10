import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found, returning unsubscribed state");
      return new Response(JSON.stringify({ 
        subscribed: false,
        onTrial: false,
        productId: null,
        priceId: null,
        billingPeriod: null,
        subscriptionEnd: null,
        trialEnd: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Check for active or trialing subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });

    // Find active or trialing subscription
    const activeSub = subscriptions.data.find(
      (s: { status: string }) => s.status === "active" || s.status === "trialing"
    );

    if (!activeSub) {
      logStep("No active subscription found");
      return new Response(JSON.stringify({ 
        subscribed: false,
        onTrial: false,
        productId: null,
        priceId: null,
        billingPeriod: null,
        subscriptionEnd: null,
        trialEnd: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let subscriptionEnd: string | null = null;
    let trialEnd: string | null = null;
    
    // Safely convert timestamps to ISO strings
    if (activeSub.current_period_end && typeof activeSub.current_period_end === 'number') {
      subscriptionEnd = new Date(activeSub.current_period_end * 1000).toISOString();
    }
    
    if (activeSub.trial_end && typeof activeSub.trial_end === 'number') {
      trialEnd = new Date(activeSub.trial_end * 1000).toISOString();
    }
    
    const priceItem = activeSub.items.data[0]?.price;
    const productId = priceItem?.product as string;
    const priceId = priceItem?.id as string;
    const onTrial = activeSub.status === "trialing";
    
    // Determine billing period from price interval
    const billingPeriod = priceItem?.recurring?.interval === 'year' ? 'yearly' : 'monthly';

    logStep("Active subscription found", { 
      subscriptionId: activeSub.id, 
      status: activeSub.status,
      onTrial,
      productId,
      priceId,
      billingPeriod,
      subscriptionEnd,
      trialEnd
    });

    return new Response(JSON.stringify({
      subscribed: true,
      onTrial,
      productId,
      priceId,
      billingPeriod,
      subscriptionEnd,
      trialEnd,
      status: activeSub.status
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});