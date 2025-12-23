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

    // Parse request body for activeWorkspaceId
    let activeWorkspaceId: string | null = null;
    try {
      const body = await req.json();
      activeWorkspaceId = body?.activeWorkspaceId ?? null;
      logStep("Received activeWorkspaceId", { activeWorkspaceId });
    } catch {
      // No body or invalid JSON - that's ok
    }

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

    // STRICT: Only use billing_customers mapping - no email-based lookup
    // This prevents cross-account subscription leakage
    const getCustomerIdFromMapping = async (userId: string): Promise<string | null> => {
      const { data: billingCustomer, error } = await supabaseClient
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .single();

      if (error || !billingCustomer) {
        logStep("No billing_customers mapping found for user", { userId });
        return null;
      }

      logStep("Found billing_customers mapping", { 
        userId, 
        stripeCustomerId: billingCustomer.stripe_customer_id 
      });
      return billingCustomer.stripe_customer_id;
    };

    // Determine if we're checking personal workspace or a team workspace
    // If activeWorkspaceId is provided, check if user owns that workspace
    let isPersonalWorkspace = true;
    let teamToCheck: { id: string; owner_id: string } | null = null;

    if (activeWorkspaceId) {
      const { data: team } = await supabaseClient
        .from("teams")
        .select("id, owner_id")
        .eq("id", activeWorkspaceId)
        .single();

      if (team) {
        // If user owns this workspace, it's their personal workspace
        isPersonalWorkspace = team.owner_id === user.id;
        if (!isPersonalWorkspace) {
          teamToCheck = team;
        }
        logStep("Workspace check", { activeWorkspaceId, isPersonalWorkspace, teamOwnerId: team.owner_id });
      }
    }

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
        (s: { status: string }) => s.status === "active" || s.status === "trialing"
      );

      if (activeSub) {
        let subscriptionEnd: string | null = null;
        let trialEnd: string | null = null;

        if (activeSub.current_period_end && typeof activeSub.current_period_end === "number") {
          subscriptionEnd = new Date(activeSub.current_period_end * 1000).toISOString();
        }

        if (activeSub.trial_end && typeof activeSub.trial_end === "number") {
          trialEnd = new Date(activeSub.trial_end * 1000).toISOString();
        }

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
          subscriptionEnd,
          trialEnd,
        });

        return new Response(
          JSON.stringify({
            subscribed: true,
            onTrial,
            productId,
            priceId,
            billingPeriod,
            subscriptionEnd,
            trialEnd,
            status: activeSub.status,
            subscriptionType: "personal",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }
    }

    // If viewing personal workspace and no personal subscription, return unsubscribed
    // Don't check team subscriptions for personal workspace
    if (isPersonalWorkspace) {
      logStep("Personal workspace with no personal subscription");
      return new Response(JSON.stringify({ 
        subscribed: false,
        onTrial: false,
        productId: null,
        priceId: null,
        billingPeriod: null,
        subscriptionEnd: null,
        trialEnd: null,
        subscriptionType: "personal"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
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

        const ownerActiveSub = ownerSubscriptions.data.find(
          (s: { status: string }) => s.status === "active" || s.status === "trialing"
        );

        if (ownerActiveSub) {
          const priceItem = ownerActiveSub.items.data[0]?.price;
          const productId = priceItem?.product as string;
          const priceId = priceItem?.id as string;
          
          // Check if this is an Enterprise or Agency plan (which allows team members)
          const enterprisePriceIds = [
            "price_1ScnOdKrTGU4P7542mtt9uyC", // enterprise monthly
            "price_1ScnOOKrTGU4P754r7bdJ94j", // enterprise yearly
          ];
          const agencyPriceIds = [
            "price_1ScnOeKrTGU4P75446dvndr3", // agency monthly
            "price_1ScnOPKrTGU4P754sNgouHiL", // agency yearly
          ];

          const isTeamPlan = [...enterprisePriceIds, ...agencyPriceIds].includes(priceId);

          if (isTeamPlan) {
            let subscriptionEnd: string | null = null;
            let trialEnd: string | null = null;
            
            if (ownerActiveSub.current_period_end && typeof ownerActiveSub.current_period_end === 'number') {
              subscriptionEnd = new Date(ownerActiveSub.current_period_end * 1000).toISOString();
            }
            
            if (ownerActiveSub.trial_end && typeof ownerActiveSub.trial_end === 'number') {
              trialEnd = new Date(ownerActiveSub.trial_end * 1000).toISOString();
            }

            const onTrial = ownerActiveSub.status === "trialing";
            const billingPeriod = priceItem?.recurring?.interval === 'year' ? 'yearly' : 'monthly';

            logStep("User has access via team subscription", { 
              teamId: team.id,
              subscriptionId: ownerActiveSub.id, 
              status: ownerActiveSub.status,
              onTrial,
              productId,
              priceId,
              billingPeriod
            });

            return new Response(JSON.stringify({
              subscribed: true,
              onTrial,
              productId,
              priceId,
              billingPeriod,
              subscriptionEnd,
              trialEnd,
              status: ownerActiveSub.status,
              subscriptionType: "team",
              teamId: team.id
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
          } else {
            logStep("Team owner subscription is not a team plan", { priceId });
          }
        }
      } else {
        logStep("Team owner has no Stripe customer mapping", { teamOwnerId });
      }
    }

    logStep("No subscription found (personal or team)");
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

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
