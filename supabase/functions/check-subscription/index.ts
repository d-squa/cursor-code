import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const unsubscribedResponse = (subscriptionType: "personal" | "team" = "personal") =>
  jsonResponse({
    subscribed: false,
    onTrial: false,
    productId: null,
    priceId: null,
    billingPeriod: null,
    subscriptionStart: null,
    subscriptionEnd: null,
    trialEnd: null,
    status: null,
    subscriptionType,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  /** Reflects active workspace after resolution; used for fallbacks and error payloads. Default personal until resolved. */
  let subscriptionTypeForScope: "personal" | "team" = "personal";

  try {
    logStep("Function started");

    // Parse request body for activeWorkspaceId
    let activeWorkspaceId: string | null = null;
    try {
      const body = await req.json();
      activeWorkspaceId = body?.activeWorkspaceId ?? null;
      logStep("Received activeWorkspaceId", { activeWorkspaceId });
    } catch {
      // No body or invalid JSON - that's ok
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Resolve workspace scope early so any fallback response reflects the active scope.
    let isPersonalWorkspace = true;
    let teamToCheck: { id: string; owner_id: string } | null = null;

    if (activeWorkspaceId) {
      const { data: team } = await supabaseClient
        .from("teams")
        .select("id, owner_id")
        .eq("id", activeWorkspaceId)
        .single();

      if (team) {
        isPersonalWorkspace = team.owner_id === user.id;
        if (!isPersonalWorkspace) {
          teamToCheck = team;
        }
        logStep("Workspace check", { activeWorkspaceId, isPersonalWorkspace, teamOwnerId: team.owner_id });
      }
    }

    subscriptionTypeForScope = isPersonalWorkspace ? "personal" : "team";

    // ── CHECK FOR ADMIN SUBSCRIPTION OVERRIDE ──
    // If an override exists for this user, return it immediately without touching Stripe
    const { data: override } = await supabaseClient
      .from("subscription_overrides")
      .select("tier, billing_period")
      .eq("user_id", user.id)
      .maybeSingle();

    if (override) {
      logStep("Subscription override found", { tier: override.tier, billingPeriod: override.billing_period });

      // Map tier to the corresponding price/product IDs so the frontend resolves correctly
      const tierPriceMap: Record<string, { monthly: string; yearly: string; productId: string; yearlyProductId: string }> = {
        basic: { monthly: "price_1SydZ7KrTGU4P754jqI2guPI", yearly: "price_1SydZEKrTGU4P754aNJHK8pc", productId: "prod_TwWcmKdhIOpj2s", yearlyProductId: "prod_TwWcQkm8fqfqaO" },
        freelancer: { monthly: "price_1SydVjKrTGU4P754mZJJWvAq", yearly: "price_1SydVuKrTGU4P754zRmad5iJ", productId: "prod_TwWYJSunEeVqiq", yearlyProductId: "prod_TwWZOkeoiYb7F4" },
        enterprise: { monthly: "price_1SydW1KrTGU4P754aeyvSJP8", yearly: "price_1SydW3KrTGU4P754G3iA7VZM", productId: "prod_TwWZ9ID4ZXtZDA", yearlyProductId: "prod_TwWZVDvQQ5cYE7" },
        agency: { monthly: "price_1SydW5KrTGU4P754vsPg9hWw", yearly: "price_1SydW8KrTGU4P754AEitLX2A", productId: "prod_TwWZww84JxfY9y", yearlyProductId: "prod_TwWZDJv1p9us5v" },
      };

      const tierConfig = tierPriceMap[override.tier];
      if (!tierConfig) {
        logStep("Unknown override tier; falling back to unsubscribed", { tier: override.tier });
        return unsubscribedResponse(subscriptionTypeForScope);
      }
      const isYearly = override.billing_period === "yearly";
      const priceId = isYearly ? tierConfig.yearly : tierConfig.monthly;
      const productId = isYearly ? tierConfig.yearlyProductId : tierConfig.productId;

      return jsonResponse({
          subscribed: true,
          onTrial: false,
          productId,
          priceId,
          billingPeriod: override.billing_period,
          subscriptionStart: new Date().toISOString(),
          subscriptionEnd: null,
          trialEnd: null,
          status: "active",
          subscriptionType: "personal",
          isOverride: true,
        });
    }
    // ── END OVERRIDE CHECK ──

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("STRIPE_SECRET_KEY missing; returning unsubscribed fallback");
      return unsubscribedResponse(subscriptionTypeForScope);
    }
    logStep("Stripe key verified");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Look up Stripe customer ID from billing_customers mapping
    // If not found, fallback to Stripe email search and auto-create the mapping
    const getCustomerIdFromMapping = async (userId: string): Promise<string | null> => {
      const { data: billingCustomer, error } = await supabaseClient
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .single();

      if (!error && billingCustomer) {
        logStep("Found billing_customers mapping", {
          userId,
          stripeCustomerId: billingCustomer.stripe_customer_id,
        });
        return billingCustomer.stripe_customer_id;
      }

      // No mapping found — attempt self-heal by searching Stripe by email
      logStep("No billing_customers mapping found, attempting email-based self-heal", { userId });

      // Get user email from profiles
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .single();

      if (!profile?.email) {
        logStep("No profile/email found for user, cannot self-heal", { userId });
        return null;
      }

      // Search Stripe for customers with this email
      const customers = await stripe.customers.list({ email: profile.email, limit: 1 });
      if (customers.data.length === 0) {
        logStep("No Stripe customer found for email", { email: profile.email });
        return null;
      }

      const stripeCustomerId = customers.data[0].id;
      logStep("Found Stripe customer by email, creating billing_customers mapping", {
        userId,
        stripeCustomerId,
        email: profile.email,
      });

      // Auto-create the mapping (service role client bypasses RLS)
      await supabaseClient.from("billing_customers").upsert({
        user_id: userId,
        email: profile.email,
        stripe_customer_id: stripeCustomerId,
      }, { onConflict: "user_id" });

      return stripeCustomerId;
    };

    // IMPORTANT: Subscription is scoped to the active workspace.
    // - Personal workspace: use the user's OWN subscription.
    // - Team workspace: use the TEAM OWNER subscription (do NOT fall back to personal).

    if (isPersonalWorkspace) {
      // First, check if user has their own subscription via billing_customers mapping
      const customerId = await getCustomerIdFromMapping(user.id);

      if (customerId) {
        logStep("Found Stripe customer", { customerId });

        // Check for active or trialing subscriptions
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 10,
        });

        // Find active or trialing subscription
        const activeSub = subscriptions.data.find(
          (s: { status: string }) => s.status === "active" || s.status === "trialing",
        );

        if (activeSub) {
          let subscriptionStart: string | null = null;
          let subscriptionEnd: string | null = null;
          let trialEnd: string | null = null;

          // In Stripe API 2025+, current_period_start/end are on subscription items, not root
          // Also check root level for older API compatibility
          const subAny = activeSub as any;

          // Try subscription root level first (older API)
          let periodStart = subAny.current_period_start;
          let periodEnd = subAny.current_period_end;

          // If not on root, try subscription items (newer API 2025+)
          if (!periodStart && activeSub.items?.data?.[0]) {
            const firstItem = activeSub.items.data[0] as any;
            periodStart = firstItem.current_period_start;
            periodEnd = firstItem.current_period_end;
          }

          // Fallback to billing_cycle_anchor and start_date
          if (!periodStart && subAny.billing_cycle_anchor) {
            periodStart = subAny.billing_cycle_anchor;
          }
          if (!periodStart && subAny.start_date) {
            periodStart = subAny.start_date;
          }

          logStep("Period dates extraction", {
            rootPeriodStart: subAny.current_period_start,
            rootPeriodEnd: subAny.current_period_end,
            itemPeriodStart: activeSub.items?.data?.[0] ? (activeSub.items.data[0] as any).current_period_start : null,
            itemPeriodEnd: activeSub.items?.data?.[0] ? (activeSub.items.data[0] as any).current_period_end : null,
            billingCycleAnchor: subAny.billing_cycle_anchor,
            startDate: subAny.start_date,
            finalPeriodStart: periodStart,
            finalPeriodEnd: periodEnd,
          });

          // Convert to ISO strings
          if (periodStart) {
            if (typeof periodStart === "number") {
              subscriptionStart = new Date(periodStart * 1000).toISOString();
            }
          }

          if (periodEnd) {
            if (typeof periodEnd === "number") {
              subscriptionEnd = new Date(periodEnd * 1000).toISOString();
            }
          }

          // Handle trial_end
          const trialEndVal = subAny.trial_end;
          if (trialEndVal && typeof trialEndVal === "number") {
            trialEnd = new Date(trialEndVal * 1000).toISOString();
          }

          logStep("Parsed subscription dates", { subscriptionStart, subscriptionEnd, trialEnd });

          const priceItem = activeSub.items.data[0]?.price;
          const productId = priceItem?.product as string;
          const priceId = priceItem?.id as string;
          const onTrial = activeSub.status === "trialing";
          const billingPeriod = priceItem?.recurring?.interval === "year" ? "yearly" : "monthly";

          logStep("User has own active subscription", {
            subscriptionId: activeSub.id,
            status: activeSub.status,
            onTrial,
            productId,
            priceId,
            billingPeriod,
            subscriptionStart,
            subscriptionEnd,
            trialEnd,
          });

          return jsonResponse({
              subscribed: true,
              onTrial,
              productId,
              priceId,
              billingPeriod,
              subscriptionStart,
              subscriptionEnd,
              trialEnd,
              status: activeSub.status,
              subscriptionType: "personal",
            });
        }
      }

      // If viewing personal workspace and no personal subscription, return unsubscribed
      // Don't check team subscriptions for personal workspace
      logStep("Personal workspace with no personal subscription");
      return unsubscribedResponse("personal");
    }

    // We're viewing a team workspace - check only THAT team's owner subscription
    logStep("Checking team workspace subscription", { teamId: teamToCheck?.id });

    if (teamToCheck) {
      const team = teamToCheck;
      const teamOwnerId = team.owner_id;
      logStep("Checking team owner subscription", { teamId: team.id, ownerId: teamOwnerId });

      // STRICT: Use billing_customers mapping for team owner too
      const ownerCustomerId = await getCustomerIdFromMapping(teamOwnerId);

      if (ownerCustomerId) {
        const ownerSubscriptions = await stripe.subscriptions.list({
          customer: ownerCustomerId,
          status: "all",
          limit: 10,
        });

        // Check if this is an Enterprise or Agency plan (which allows team members)
        // NOTE: The Stripe list can contain multiple active/trialing subscriptions.
        // We must choose the best eligible one (agency > enterprise).
        const enterprisePriceIds = [
          "price_1SydW1KrTGU4P754aeyvSJP8", // enterprise monthly (current)
          "price_1SydW3KrTGU4P754G3iA7VZM", // enterprise yearly (current)
          "price_1SyblcKrTGU4P754HYOgkuIQ", // enterprise monthly (legacy)
          "price_1SybldKrTGU4P754EBnjjPos", // enterprise yearly (legacy)
        ];
        const agencyPriceIds = [
          "price_1SydW5KrTGU4P754vsPg9hWw", // agency monthly (current)
          "price_1SydW8KrTGU4P754AEitLX2A", // agency yearly (current)
          "price_1SyblfKrTGU4P754gwTKmrsC", // agency monthly (legacy)
          "price_1SyblfKrTGU4P754PtKbziMk", // agency yearly (legacy)
          "price_1ScnOeKrTGU4P75446dvndr3", // agency monthly (legacy 2)
        ];

        const getSubPriceId = (sub: any): string | null => sub?.items?.data?.[0]?.price?.id ?? null;
        const isActiveOrTrialing = (sub: any) => sub?.status === "active" || sub?.status === "trialing";

        const ownerEligibleSub =
          ownerSubscriptions.data.find((s: any) => {
            const pid = getSubPriceId(s);
            return isActiveOrTrialing(s) && !!pid && agencyPriceIds.includes(pid);
          }) ??
          ownerSubscriptions.data.find((s: any) => {
            const pid = getSubPriceId(s);
            return isActiveOrTrialing(s) && !!pid && enterprisePriceIds.includes(pid);
          });

        if (!ownerEligibleSub) {
          const activePrices = ownerSubscriptions.data.filter(isActiveOrTrialing).map(getSubPriceId).filter(Boolean);

          logStep("No eligible team subscription found", {
            teamId: team.id,
            ownerId: teamOwnerId,
            activePrices,
          });
        } else {
          const priceItem = ownerEligibleSub.items.data[0]?.price;
          const productId = priceItem?.product as string;
          const priceId = priceItem?.id as string;

          let subscriptionStart: string | null = null;
          let subscriptionEnd: string | null = null;
          let trialEnd: string | null = null;

          // In Stripe API 2025+, current_period_start/end are on subscription items, not root
          const subAny = ownerEligibleSub as any;

          // Try subscription root level first (older API)
          let periodStart = subAny.current_period_start;
          let periodEnd = subAny.current_period_end;

          // If not on root, try subscription items (newer API 2025+)
          if (!periodStart && ownerEligibleSub.items?.data?.[0]) {
            const firstItem = ownerEligibleSub.items.data[0] as any;
            periodStart = firstItem.current_period_start;
            periodEnd = firstItem.current_period_end;
          }

          // Fallback to billing_cycle_anchor and start_date
          if (!periodStart && subAny.billing_cycle_anchor) {
            periodStart = subAny.billing_cycle_anchor;
          }
          if (!periodStart && subAny.start_date) {
            periodStart = subAny.start_date;
          }

          // Convert to ISO strings
          if (periodStart && typeof periodStart === "number") {
            subscriptionStart = new Date(periodStart * 1000).toISOString();
          }
          if (periodEnd && typeof periodEnd === "number") {
            subscriptionEnd = new Date(periodEnd * 1000).toISOString();
          }

          // Handle trial_end
          const trialEndVal = subAny.trial_end;
          if (trialEndVal && typeof trialEndVal === "number") {
            trialEnd = new Date(trialEndVal * 1000).toISOString();
          }

          const onTrial = ownerEligibleSub.status === "trialing";
          const billingPeriod = priceItem?.recurring?.interval === "year" ? "yearly" : "monthly";

          logStep("User has access via team subscription", {
            teamId: team.id,
            subscriptionId: ownerEligibleSub.id,
            status: ownerEligibleSub.status,
            onTrial,
            productId,
            priceId,
            billingPeriod,
            subscriptionStart,
          });

          return jsonResponse({
              subscribed: true,
              onTrial,
              productId,
              priceId,
              billingPeriod,
              subscriptionStart,
              subscriptionEnd,
              trialEnd,
              status: ownerEligibleSub.status,
              subscriptionType: "team",
              teamId: team.id,
            });
        }
      } else {
        logStep("Team owner has no Stripe customer mapping", { teamOwnerId });
      }
    }

    logStep("No subscription found (personal or team)");
    return unsubscribedResponse("team");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return jsonResponse(
      {
        error: errorMessage,
        subscribed: false,
        onTrial: false,
        productId: null,
        priceId: null,
        billingPeriod: null,
        subscriptionStart: null,
        subscriptionEnd: null,
        trialEnd: null,
        status: null,
        subscriptionType: subscriptionTypeForScope,
      },
      500,
    );
  }
});
