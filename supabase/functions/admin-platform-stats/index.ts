import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPER_ADMIN_EMAIL = "superadmin@actiplan.app";

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

    // Authenticate & authorize
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userData.user.email !== SUPER_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse filters from request body
    let filters: { userId?: string; teamId?: string; stripeCustomerId?: string } = {};
    try {
      if (req.method === "POST") {
        const body = await req.json();
        filters = body.filters || {};
      }
    } catch (_) {
      // No body or invalid JSON, use no filters
    }

    const { userId, teamId, stripeCustomerId } = filters;

    console.log("[ADMIN-STATS] Filters:", JSON.stringify(filters));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Helper: apply user filter to a query
    const applyUserFilter = (query: any, col = "user_id") => {
      if (userId) return query.eq(col, userId);
      return query;
    };

    // Helper: apply team filter
    const applyTeamFilter = (query: any, col = "team_id") => {
      if (teamId) return query.eq(col, teamId);
      return query;
    };

    // If filtering by user, get their team_ids for team-scoped tables
    let userTeamIds: string[] = [];
    if (userId && !teamId) {
      const { data: roles } = await supabase.from("user_roles").select("team_id").eq("user_id", userId);
      userTeamIds = (roles || []).map((r: any) => r.team_id).filter(Boolean);
    }

    // Build filtered queries
    // Profiles
    let profilesQ = supabase.from("profiles").select("id, created_at, email, full_name", { count: "exact", head: false });
    if (userId) profilesQ = profilesQ.eq("id", userId);

    // Teams
    let teamsQ = supabase.from("teams").select("id, name, owner_id", { count: "exact", head: false });
    if (teamId) teamsQ = teamsQ.eq("id", teamId);
    if (userId) teamsQ = teamsQ.eq("owner_id", userId);

    // Campaigns
    let campaignsQ = supabase.from("campaigns").select("id, status, created_at, name, total_budget, user_id, team_id", { count: "exact", head: false });
    campaignsQ = applyUserFilter(campaignsQ);
    campaignsQ = applyTeamFilter(campaignsQ);

    let campaignsThisMonthQ = supabase.from("campaigns").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth);
    campaignsThisMonthQ = applyUserFilter(campaignsThisMonthQ);
    campaignsThisMonthQ = applyTeamFilter(campaignsThisMonthQ);

    // Connected platforms
    let connPlatQ = supabase.from("connected_platforms").select("id, platform_type, is_active", { count: "exact", head: false });
    connPlatQ = applyUserFilter(connPlatQ);
    connPlatQ = applyTeamFilter(connPlatQ);

    // Meta ad accounts
    let metaQ = supabase.from("meta_ad_accounts").select("id", { count: "exact", head: true });
    metaQ = applyUserFilter(metaQ);
    if (teamId) metaQ = metaQ.eq("team_id", teamId);

    // TikTok ad accounts
    let tiktokQ = supabase.from("tiktok_ad_accounts").select("id", { count: "exact", head: true });
    tiktokQ = applyUserFilter(tiktokQ);
    if (teamId) tiktokQ = tiktokQ.eq("team_id", teamId);

    // Creative assets
    let assetsQ = supabase.from("creative_library_assets").select("id, platform, advertiser_id", { count: "exact", head: false });
    assetsQ = applyUserFilter(assetsQ);
    if (teamId) assetsQ = assetsQ.eq("team_id", teamId);

    // Creative assignments
    let assignQ = supabase.from("creative_assignments").select("id, campaign_id", { count: "exact", head: false });
    // assignments don't have user_id directly, skip user filter for now

    // Launch status
    let launchQ = supabase.from("campaign_launch_status").select("id, status, campaign_id", { count: "exact", head: false });

    // Swaps
    let swapsAllQ = supabase.from("ad_account_swap_logs").select("id", { count: "exact", head: true });
    swapsAllQ = applyUserFilter(swapsAllQ);
    if (teamId) swapsAllQ = swapsAllQ.eq("team_id", teamId);

    let swapsMonthQ = supabase.from("ad_account_swap_logs").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth);
    swapsMonthQ = applyUserFilter(swapsMonthQ);
    if (teamId) swapsMonthQ = swapsMonthQ.eq("team_id", teamId);

    // Insights
    let insightsQ = supabase.from("campaign_insights").select("id", { count: "exact", head: true });

    // Activity logs
    let actLogsQ = supabase.from("activity_logs").select("id", { count: "exact", head: true });
    actLogsQ = applyUserFilter(actLogsQ);

    // User roles
    let rolesQ = supabase.from("user_roles").select("id, role, team_id, user_id", { count: "exact", head: false });
    if (teamId) rolesQ = rolesQ.eq("team_id", teamId);
    if (userId) rolesQ = rolesQ.eq("user_id", userId);

    // Push configs
    let pushConfigQ = supabase.from("ad_push_configurations").select("id, push_status", { count: "exact", head: false });
    pushConfigQ = applyUserFilter(pushConfigQ);
    if (teamId) pushConfigQ = pushConfigQ.eq("team_id", teamId);

    // Push jobs
    let pushJobsQ = supabase.from("creative_push_jobs").select("id, status", { count: "exact", head: false });
    pushJobsQ = applyUserFilter(pushJobsQ);

    // Creatives
    let creativesQ = supabase.from("creatives").select("id", { count: "exact", head: true });
    creativesQ = applyUserFilter(creativesQ);
    if (teamId) creativesQ = creativesQ.eq("team_id", teamId);

    // Recent campaigns (reuse filtered query)
    let recentQ = supabase.from("campaigns").select("id, name, status, created_at, total_budget, user_id").order("created_at", { ascending: false }).limit(10);
    recentQ = applyUserFilter(recentQ);
    if (teamId) recentQ = recentQ.eq("team_id", teamId);

    // Also fetch filter option lists (users, teams) for the UI
    const [usersListRes, teamsListRes, billingListRes, allUserRolesRes] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name").order("email"),
      supabase.from("teams").select("id, name, owner_id").order("name"),
      supabase.from("billing_customers").select("id, user_id, stripe_customer_id, email"),
      supabase.from("user_roles").select("user_id, team_id"),
    ]);

    const [
      profilesRes,
      teamsRes,
      campaignsRes,
      campaignsThisMonthRes,
      connectedPlatformsRes,
      metaAdAccountsRes,
      tiktokAdAccountsRes,
      creativeAssetsRes,
      assignmentsRes,
      launchStatusRes,
      swapsAllRes,
      swapsThisMonthRes,
      insightsRes,
      activityLogsRes,
      userRolesRes,
      pushConfigsRes,
      pushJobsRes,
      creativesRes,
      recentCampaignsRes,
    ] = await Promise.all([
      profilesQ,
      teamsQ,
      campaignsQ,
      campaignsThisMonthQ,
      connPlatQ,
      metaQ,
      tiktokQ,
      assetsQ,
      assignQ,
      launchQ,
      swapsAllQ,
      swapsMonthQ,
      insightsQ,
      actLogsQ,
      rolesQ,
      pushConfigQ,
      pushJobsQ,
      creativesQ,
      recentQ,
    ]);

    // Compute derived metrics
    const profiles = profilesRes.data || [];
    const totalUsers = profilesRes.count || 0;
    const usersThisMonth = profiles.filter((p: any) => p.created_at >= startOfMonth).length;

    const connectedPlatforms = connectedPlatformsRes.data || [];
    const activePlatforms = connectedPlatforms.filter((p: any) => p.is_active).length;
    const platformBreakdown: Record<string, number> = {};
    connectedPlatforms.forEach((p: any) => {
      platformBreakdown[p.platform_type] = (platformBreakdown[p.platform_type] || 0) + 1;
    });

    const allCampaigns = campaignsRes.data || [];
    const campaignStatuses: Record<string, number> = {};
    allCampaigns.forEach((c: any) => {
      const s = c.status || "draft";
      campaignStatuses[s] = (campaignStatuses[s] || 0) + 1;
    });

    const campaignsByMonth: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      campaignsByMonth[key] = 0;
    }
    allCampaigns.forEach((c: any) => {
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (campaignsByMonth[key] !== undefined) {
        campaignsByMonth[key]++;
      }
    });

    const assetsByAdvertiser: Record<string, number> = {};
    (creativeAssetsRes.data || []).forEach((a: any) => {
      const key = `${a.platform}:${a.advertiser_id}`;
      assetsByAdvertiser[key] = (assetsByAdvertiser[key] || 0) + 1;
    });

    const launchStatuses: Record<string, number> = {};
    (launchStatusRes.data || []).forEach((l: any) => {
      const s = l.status || "pending";
      launchStatuses[s] = (launchStatuses[s] || 0) + 1;
    });

    const pushStatuses: Record<string, number> = {};
    (pushConfigsRes.data || []).forEach((p: any) => {
      const s = p.push_status || "pending";
      pushStatuses[s] = (pushStatuses[s] || 0) + 1;
    });

    const roleDistribution: Record<string, number> = {};
    (userRolesRes.data || []).forEach((r: any) => {
      roleDistribution[r.role] = (roleDistribution[r.role] || 0) + 1;
    });

    // Stripe subscription stats
    let stripeStats = { active: 0, trialing: 0, canceled: 0, past_due: 0, total_customers: 0 };
    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey) {
        const { default: Stripe } = await import("npm:stripe@17");
        const stripe = new Stripe(stripeKey);

        if (stripeCustomerId) {
          // Filter to specific customer
          const [activeList, trialingList, canceledList, pastDueList] = await Promise.all([
            stripe.subscriptions.list({ status: "active", customer: stripeCustomerId, limit: 100 }),
            stripe.subscriptions.list({ status: "trialing", customer: stripeCustomerId, limit: 100 }),
            stripe.subscriptions.list({ status: "canceled", customer: stripeCustomerId, limit: 100 }),
            stripe.subscriptions.list({ status: "past_due", customer: stripeCustomerId, limit: 100 }),
          ]);
          stripeStats = {
            active: activeList.data.length,
            trialing: trialingList.data.length,
            canceled: canceledList.data.length,
            past_due: pastDueList.data.length,
            total_customers: 1,
          };
        } else if (userId) {
          // Find stripe customer for this user
          const { data: billingRow } = await supabase.from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
          if (billingRow?.stripe_customer_id) {
            const [activeList, trialingList, canceledList, pastDueList] = await Promise.all([
              stripe.subscriptions.list({ status: "active", customer: billingRow.stripe_customer_id, limit: 100 }),
              stripe.subscriptions.list({ status: "trialing", customer: billingRow.stripe_customer_id, limit: 100 }),
              stripe.subscriptions.list({ status: "canceled", customer: billingRow.stripe_customer_id, limit: 100 }),
              stripe.subscriptions.list({ status: "past_due", customer: billingRow.stripe_customer_id, limit: 100 }),
            ]);
            stripeStats = {
              active: activeList.data.length,
              trialing: trialingList.data.length,
              canceled: canceledList.data.length,
              past_due: pastDueList.data.length,
              total_customers: 1,
            };
          }
        } else {
          const [activeList, trialingList, canceledList, pastDueList, customers] = await Promise.all([
            stripe.subscriptions.list({ status: "active", limit: 100 }),
            stripe.subscriptions.list({ status: "trialing", limit: 100 }),
            stripe.subscriptions.list({ status: "canceled", limit: 100 }),
            stripe.subscriptions.list({ status: "past_due", limit: 100 }),
            stripe.customers.list({ limit: 1 }),
          ]);
          stripeStats = {
            active: activeList.data.length,
            trialing: trialingList.data.length,
            canceled: canceledList.data.length,
            past_due: pastDueList.data.length,
            total_customers: customers.has_more ? 100 : customers.data.length,
          };
        }
      }
    } catch (e) {
      console.error("[ADMIN-STATS] Stripe stats error:", e);
    }

    const stats = {
      totalUsers,
      usersThisMonth,
      totalWorkspaces: teamsRes.count || 0,
      subscriptions: stripeStats,
      totalCampaigns: campaignsRes.count || 0,
      campaignsThisMonth: campaignsThisMonthRes.count || 0,
      campaignStatuses,
      campaignsByMonth,
      totalConnections: connectedPlatformsRes.count || 0,
      activeConnections: activePlatforms,
      platformBreakdown,
      metaAdAccounts: metaAdAccountsRes.count || 0,
      tiktokAdAccounts: tiktokAdAccountsRes.count || 0,
      totalAssets: creativeAssetsRes.count || 0,
      assetsByAdvertiser,
      totalCreatives: creativesRes.count || 0,
      totalAssignments: assignmentsRes.count || 0,
      totalLaunches: launchStatusRes.count || 0,
      launchStatuses,
      totalPushConfigs: pushConfigsRes.count || 0,
      pushStatuses,
      totalPushJobs: pushJobsRes.count || 0,
      totalSwaps: swapsAllRes.count || 0,
      swapsThisMonth: swapsThisMonthRes.count || 0,
      totalInsights: insightsRes.count || 0,
      totalActivityLogs: activityLogsRes.count || 0,
      roleDistribution,
      totalInvitations: (userRolesRes.count || 0),
      recentCampaigns: recentCampaignsRes.data || [],
      // Filter options for the UI
      filterOptions: {
        users: (usersListRes.data || []).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name })),
        teams: (teamsListRes.data || []).map((t: any) => ({ id: t.id, name: t.name, ownerId: t.owner_id })),
        billingCustomers: (billingListRes.data || []).map((b: any) => ({ userId: b.user_id, stripeCustomerId: b.stripe_customer_id, email: b.email })),
        userTeams: (allUserRolesRes.data || []).reduce((acc: Record<string, string[]>, r: any) => {
          if (!acc[r.user_id]) acc[r.user_id] = [];
          if (r.team_id && !acc[r.user_id].includes(r.team_id)) acc[r.user_id].push(r.team_id);
          return acc;
        }, {}),
      },
    };

    console.log("[ADMIN-STATS] Success");
    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ADMIN-STATS] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
