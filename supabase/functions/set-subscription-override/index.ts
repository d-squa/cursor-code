import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPER_ADMIN_EMAIL = "superadmin@actiplan.app";

const TIER_PRICE_MAP: Record<string, { monthly: string; yearly: string }> = {
  basic: { monthly: "price_1SydZ7KrTGU4P754jqI2guPI", yearly: "price_1SydZEKrTGU4P754aNJHK8pc" },
  freelancer: { monthly: "price_1SydVjKrTGU4P754mZJJWvAq", yearly: "price_1SydVuKrTGU4P754zRmad5iJ" },
  enterprise: { monthly: "price_1SydW1KrTGU4P754aeyvSJP8", yearly: "price_1SydW3KrTGU4P754G3iA7VZM" },
  agency: { monthly: "price_1SydW5KrTGU4P754vsPg9hWw", yearly: "price_1SydW8KrTGU4P754AEitLX2A" },
};

const OVERRIDE_COUPON_NAME = "actiplan_test_user_100_off";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate caller as super admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user || userData.user.email !== SUPER_ADMIN_EMAIL) {
      // Also check if user has admin role
      const isAdmin = userData?.user ? await checkAdminRole(supabase, userData.user.id) : false;
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const { action, targetUserId, tier, billingPeriod } = body;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (action === "remove") {
      return await handleRemove(supabase, stripe, targetUserId, corsHeaders);
    }

    // action === "set"
    if (!targetUserId || !tier || !billingPeriod) {
      return new Response(JSON.stringify({ error: "Missing targetUserId, tier, or billingPeriod" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceConfig = TIER_PRICE_MAP[tier];
    if (!priceConfig) {
      return new Response(JSON.stringify({ error: `Unknown tier: ${tier}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceId = billingPeriod === "yearly" ? priceConfig.yearly : priceConfig.monthly;

    // 1. Get target user's email from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", targetUserId)
      .single();

    if (!profile?.email) {
      return new Response(JSON.stringify({ error: "User not found or has no email" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[OVERRIDE] Setting ${tier}/${billingPeriod} for user ${targetUserId} (${profile.email})`);

    // 2. Find or create Stripe customer
    let customerId: string;
    const { data: billingRow } = await supabase
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (billingRow?.stripe_customer_id) {
      customerId = billingRow.stripe_customer_id;
      console.log(`[OVERRIDE] Found existing Stripe customer: ${customerId}`);
    } else {
      // Check Stripe by email
      const existing = await stripe.customers.list({ email: profile.email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: profile.email,
          metadata: { user_id: targetUserId, source: "subscription_override" },
        });
        customerId = customer.id;
      }
      // Upsert billing_customers mapping
      await supabase.from("billing_customers").upsert({
        user_id: targetUserId,
        stripe_customer_id: customerId,
        email: profile.email,
      }, { onConflict: "user_id" });
      console.log(`[OVERRIDE] Created/mapped Stripe customer: ${customerId}`);
    }

    // 3. Find or create the 100% off forever coupon
    let couponId: string;
    try {
      const coupon = await stripe.coupons.retrieve(OVERRIDE_COUPON_NAME);
      couponId = coupon.id;
    } catch {
      const coupon = await stripe.coupons.create({
        id: OVERRIDE_COUPON_NAME,
        percent_off: 100,
        duration: "forever",
        name: "ActiPlan Test User (100% Off)",
      });
      couponId = coupon.id;
    }
    console.log(`[OVERRIDE] Using coupon: ${couponId}`);

    // 4. Cancel any existing subscriptions for this customer
    const existingSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 50,
    });
    for (const sub of existingSubs.data) {
      if (sub.status === "active" || sub.status === "trialing") {
        await stripe.subscriptions.cancel(sub.id, { prorate: false });
        console.log(`[OVERRIDE] Cancelled existing subscription: ${sub.id}`);
      }
    }

    // 5. Create new subscription with 100% off coupon
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      discounts: [{ coupon: couponId }],
      metadata: {
        override: "true",
        user_id: targetUserId,
        tier,
        billing_period: billingPeriod,
      },
    });
    console.log(`[OVERRIDE] Created Stripe subscription: ${subscription.id}`);

    // 6. Upsert the local override record
    const { error: upsertError } = await supabase.from("subscription_overrides").upsert({
      user_id: targetUserId,
      tier,
      billing_period: billingPeriod,
      created_by: userData.user!.id,
    }, { onConflict: "user_id" });

    if (upsertError) {
      console.error(`[OVERRIDE] DB upsert error:`, upsertError);
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      tier,
      billingPeriod,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[OVERRIDE] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function checkAdminRole(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "owner"]);
  return (data?.length ?? 0) > 0;
}

async function handleRemove(supabase: any, stripe: Stripe, targetUserId: string, corsHeaders: Record<string, string>) {
  console.log(`[OVERRIDE] Removing override for user: ${targetUserId}`);

  // Cancel Stripe subscription with override metadata
  const { data: billingRow } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (billingRow?.stripe_customer_id) {
    const subs = await stripe.subscriptions.list({
      customer: billingRow.stripe_customer_id,
      status: "active",
      limit: 50,
    });
    for (const sub of subs.data) {
      if ((sub as any).metadata?.override === "true") {
        await stripe.subscriptions.cancel(sub.id, { prorate: false });
        console.log(`[OVERRIDE] Cancelled override subscription: ${sub.id}`);
      }
    }
  }

  // Delete local override
  await supabase.from("subscription_overrides").delete().eq("user_id", targetUserId);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}
