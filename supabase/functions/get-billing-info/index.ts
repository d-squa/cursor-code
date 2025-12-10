import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-BILLING-INFO] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found, returning empty billing data");
      return new Response(JSON.stringify({
        paymentMethods: [],
        invoices: [],
        balance: 0,
        nextPaymentDate: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customer = customers.data[0];
    logStep("Customer found", { customerId: customer.id });

    // Get payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.id,
      type: "card",
    });

    const formattedPaymentMethods = paymentMethods.data.map((pm: Stripe.PaymentMethod) => ({
      id: pm.id,
      brand: pm.card?.brand || "unknown",
      last4: pm.card?.last4 || "****",
      exp_month: pm.card?.exp_month || 0,
      exp_year: pm.card?.exp_year || 0,
      is_default: pm.id === customer.invoice_settings?.default_payment_method,
    }));

    // Get invoices
    const invoices = await stripe.invoices.list({
      customer: customer.id,
      limit: 10,
    });

    const formattedInvoices = invoices.data.map((inv: Stripe.Invoice) => ({
      id: inv.id,
      date: new Date(inv.created * 1000).toISOString(),
      amount: inv.amount_paid || inv.amount_due,
      currency: inv.currency,
      status: inv.status,
      description: inv.lines.data[0]?.description || "Subscription",
      invoice_pdf: inv.invoice_pdf,
    }));

    // Get upcoming invoice for next payment date
    let nextPaymentDate = null;
    try {
      const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
        customer: customer.id,
      });
      if (upcomingInvoice.next_payment_attempt) {
        nextPaymentDate = new Date(upcomingInvoice.next_payment_attempt * 1000).toISOString();
      }
    } catch (e) {
      // No upcoming invoice - user may not have active subscription
      logStep("No upcoming invoice found");
    }

    // Get customer balance
    const balance = customer.balance || 0;

    logStep("Billing data retrieved successfully");

    return new Response(JSON.stringify({
      paymentMethods: formattedPaymentMethods,
      invoices: formattedInvoices,
      balance,
      nextPaymentDate,
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