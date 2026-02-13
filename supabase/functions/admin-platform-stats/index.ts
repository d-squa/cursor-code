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
    console.log("[ADMIN-STATS] Auth header present:", !!authHeader);
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    console.log("[ADMIN-STATS] getUser:", {
      email: userData?.user?.email,
      error: userError?.message,
    });

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userData.user.email !== SUPER_ADMIN_EMAIL) {
      console.log("[ADMIN-STATS] Forbidden:", userData.user.email);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[ADMIN-STATS] Auth passed, fetching stats...");

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Run all queries in parallel
    const [
      profilesRes,
      teamsRes,
      campaignsRes,
      campaignsThisMonthRes,
      connectedPlatformsRes,
      metaAdAccountsRes,
      tiktokAdAccountsRes,
      creativeAssetsRes,
      creativeAssignmentsRes,
      launchStatusRes,
      swapsAllRes,
      swapsThisMonthRes,
      insightsRes,
      activityLogsRes,
      userRolesRes,
      pushConfigsRes,
      pushJobsRes,
      campaignsByStatusRes,
      campaignsByMonthRes,
      platformBreakdownRes,
      recentCampaignsRes,
      creativesRes,
    ] = await Promise.all([
      supabase.from("profiles").select("id, created_at", { count: "exact", head: false }),
      supabase.from("teams").select("id", { count: "exact", head: true }),
      supabase.from("campaigns").select("id", { count: "exact", head: true }),
      supabase.from("campaigns").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth),
      supabase.from("connected_platforms").select("id, platform_type, is_active", { count: "exact", head: false }),
      supabase.from("meta_ad_accounts").select("id", { count: "exact", head: true }),
      supabase.from("tiktok_ad_accounts").select("id", { count: "exact", head: true }),
      supabase.from("creative_library_assets").select("id, platform, advertiser_id", { count: "exact", head: false }),
      supabase.from("creative_assignments").select("id", { count: "exact", head: true }),
      supabase.from("campaign_launch_status").select("id, status", { count: "exact", head: false }),
      supabase.from("ad_account_swap_logs").select("id", { count: "exact", head: true }),
      supabase.from("ad_account_swap_logs").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth),
      supabase.from("campaign_insights").select("id", { count: "exact", head: true }),
      supabase.from("activity_logs").select("id", { count: "exact", head: true }),
      supabase.from("user_roles").select("id, role, team_id", { count: "exact", head: false }),
      supabase.from("ad_push_configurations").select("id, push_status", { count: "exact", head: false }),
      supabase.from("creative_push_jobs").select("id, status", { count: "exact", head: false }),
      supabase.from("campaigns").select("status"),
      supabase.from("campaigns").select("created_at"),
      supabase.from("connected_platforms").select("platform_type"),
      supabase.from("campaigns").select("id, name, status, created_at, total_budget, user_id").order("created_at", { ascending: false }).limit(10),
      supabase.from("creatives").select("id", { count: "exact", head: true }),
    ]);

    // Compute derived metrics
    const profiles = profilesRes.data || [];
    const totalUsers = profilesRes.count || 0;
    const usersThisMonth = profiles.filter((p: any) => p.created_at >= startOfMonth).length;

    const connectedPlatforms = connectedPlatformsRes.data || [];
    const activePlatforms = connectedPlatforms.filter((p: any) => p.is_active).length;
    const platformBreakdown: Record<string, number> = {};
    (platformBreakdownRes.data || []).forEach((p: any) => {
      platformBreakdown[p.platform_type] = (platformBreakdown[p.platform_type] || 0) + 1;
    });

    const campaignStatuses: Record<string, number> = {};
    (campaignsByStatusRes.data || []).forEach((c: any) => {
      const s = c.status || "draft";
      campaignStatuses[s] = (campaignStatuses[s] || 0) + 1;
    });

    const campaignsByMonth: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      campaignsByMonth[key] = 0;
    }
    (campaignsByMonthRes.data || []).forEach((c: any) => {
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

    // Stripe subscription stats - lazy import to avoid boot crash
    let stripeStats = { active: 0, trialing: 0, canceled: 0, past_due: 0, total_customers: 0 };
    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey) {
        const { default: Stripe } = await import("npm:stripe@17");
        const stripe = new Stripe(stripeKey);
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
      totalAssignments: creativeAssignmentsRes.count || 0,
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
