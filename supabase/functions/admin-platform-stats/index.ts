import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "npm:stripe@18.5.0";

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Authenticate & authorize
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");
    if (userData.user.email !== SUPER_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      modRequestsRes,
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
      supabase.from("modification_requests").select("id, status", { count: "exact", head: false }).catch(() => ({ data: [], count: 0 })),
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

    // Campaigns by month (last 6 months)
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

    // Assets per advertiser
    const assetsByAdvertiser: Record<string, number> = {};
    (creativeAssetsRes.data || []).forEach((a: any) => {
      const key = `${a.platform}:${a.advertiser_id}`;
      assetsByAdvertiser[key] = (assetsByAdvertiser[key] || 0) + 1;
    });

    // Launch statuses
    const launchStatuses: Record<string, number> = {};
    (launchStatusRes.data || []).forEach((l: any) => {
      const s = l.status || "pending";
      launchStatuses[s] = (launchStatuses[s] || 0) + 1;
    });

    // Push statuses
    const pushStatuses: Record<string, number> = {};
    (pushConfigsRes.data || []).forEach((p: any) => {
      const s = p.push_status || "pending";
      pushStatuses[s] = (pushStatuses[s] || 0) + 1;
    });

    // Role distribution
    const roleDistribution: Record<string, number> = {};
    (userRolesRes.data || []).forEach((r: any) => {
      roleDistribution[r.role] = (roleDistribution[r.role] || 0) + 1;
    });

    // Stripe subscription stats
    let stripeStats = { active: 0, trialing: 0, canceled: 0, past_due: 0, total_customers: 0 };
    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey) {
        const stripe = new Stripe(stripeKey);
        const [activeSubs, trialingSubs, canceledSubs, pastDueSubs, customers] = await Promise.all([
          stripe.subscriptions.list({ status: "active", limit: 1 }),
          stripe.subscriptions.list({ status: "trialing", limit: 1 }),
          stripe.subscriptions.list({ status: "canceled", limit: 1 }),
          stripe.subscriptions.list({ status: "past_due", limit: 1 }),
          stripe.customers.list({ limit: 1 }),
        ]);
        stripeStats = {
          active: activeSubs.has_more ? 100 : activeSubs.data.length, // approximate
          trialing: trialingSubs.has_more ? 100 : trialingSubs.data.length,
          canceled: canceledSubs.has_more ? 100 : canceledSubs.data.length,
          past_due: pastDueSubs.has_more ? 100 : pastDueSubs.data.length,
          total_customers: customers.has_more ? 100 : customers.data.length,
        };

        // Get more accurate counts
        const [activeList, trialingList, canceledList, pastDueList] = await Promise.all([
          stripe.subscriptions.list({ status: "active", limit: 100 }),
          stripe.subscriptions.list({ status: "trialing", limit: 100 }),
          stripe.subscriptions.list({ status: "canceled", limit: 100 }),
          stripe.subscriptions.list({ status: "past_due", limit: 100 }),
        ]);
        stripeStats = {
          active: activeList.data.length,
          trialing: trialingList.data.length,
          canceled: canceledList.data.length,
          past_due: pastDueList.data.length,
          total_customers: stripeStats.total_customers,
        };
      }
    } catch (e) {
      console.error("Stripe stats error:", e);
    }

    const stats = {
      // Users
      totalUsers,
      usersThisMonth,
      totalWorkspaces: teamsRes.count || 0,

      // Subscriptions
      subscriptions: stripeStats,

      // Campaigns / ActiPlans
      totalCampaigns: campaignsRes.count || 0,
      campaignsThisMonth: campaignsThisMonthRes.count || 0,
      campaignStatuses,
      campaignsByMonth,

      // Platforms
      totalConnections: connectedPlatformsRes.count || 0,
      activeConnections: activePlatforms,
      platformBreakdown,

      // Ad Accounts
      metaAdAccounts: metaAdAccountsRes.count || 0,
      tiktokAdAccounts: tiktokAdAccountsRes.count || 0,

      // Creative Assets
      totalAssets: creativeAssetsRes.count || 0,
      assetsByAdvertiser,
      totalCreatives: creativesRes.count || 0,

      // Assignments & Ads
      totalAssignments: creativeAssignmentsRes.count || 0,

      // Launches
      totalLaunches: launchStatusRes.count || 0,
      launchStatuses,

      // Pushes
      totalPushConfigs: pushConfigsRes.count || 0,
      pushStatuses,
      totalPushJobs: pushJobsRes.count || 0,

      // Swaps
      totalSwaps: swapsAllRes.count || 0,
      swapsThisMonth: swapsThisMonthRes.count || 0,

      // Insights
      totalInsights: insightsRes.count || 0,

      // Activity
      totalActivityLogs: activityLogsRes.count || 0,

      // Roles
      roleDistribution,
      totalInvitations: (userRolesRes.count || 0),

      // Recent campaigns
      recentCampaigns: recentCampaignsRes.data || [],
    };

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500,
    });
  }
});
