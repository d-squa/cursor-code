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

    // First, check if user has their own subscription
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length > 0) {
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

      if (activeSub) {
        let subscriptionEnd: string | null = null;
        let trialEnd: string | null = null;
        
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
        const billingPeriod = priceItem?.recurring?.interval === 'year' ? 'yearly' : 'monthly';

        logStep("User has own active subscription", { 
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
          status: activeSub.status,
          subscriptionType: "personal"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    logStep("No personal subscription found, checking team membership");

    // Check if user is a member of any team
    const { data: userRoles, error: rolesError } = await supabaseClient
      .from("user_roles")
      .select("team_id, role")
      .eq("user_id", user.id);

    if (rolesError) {
      logStep("Error fetching user roles", { error: rolesError.message });
    }

    if (userRoles && userRoles.length > 0) {
      logStep("User has team memberships", { count: userRoles.length });

      // Check each team's owner for an active subscription
      for (const userRole of userRoles) {
        const teamId = userRole.team_id;
        
        // Get the team to find the owner
        const { data: team, error: teamError } = await supabaseClient
          .from("teams")
          .select("id, owner_id")
          .eq("id", teamId)
          .single();
          
        if (teamError || !team) {
          logStep("Could not find team", { teamId, error: teamError?.message });
          continue;
        }

        const teamOwnerId = team.owner_id;
        logStep("Checking team owner subscription", { teamId: team.id, ownerId: teamOwnerId });

        // Get team owner's email from profiles
        const { data: ownerProfile, error: profileError } = await supabaseClient
          .from("profiles")
          .select("email")
          .eq("id", teamOwnerId)
          .single();

        if (profileError || !ownerProfile?.email) {
          logStep("Could not find team owner email", { error: profileError?.message });
          continue;
        }

        // Check if team owner has a subscription
        const ownerCustomers = await stripe.customers.list({ email: ownerProfile.email, limit: 1 });

        if (ownerCustomers.data.length === 0) {
          logStep("Team owner has no Stripe customer", { ownerEmail: ownerProfile.email });
          continue;
        }

        const ownerCustomerId = ownerCustomers.data[0].id;
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
          // Enterprise and Agency price IDs from subscriptionTiers.ts
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
