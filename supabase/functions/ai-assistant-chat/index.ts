import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, conversationId, campaignContext, isAdmin, teamId } = await req.json();

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let contextParts: string[] = [];

    // ─── Admin operational statistics context ───
    if (isAdmin && teamId) {
      try {
        // Team productivity: campaigns count by status
        const { data: teamCampaigns } = await supabaseAdmin
          .from("campaigns")
          .select("id, name, status, total_budget, user_id, created_at, updated_at, platforms, objective")
          .eq("team_id", teamId)
          .order("updated_at", { ascending: false })
          .limit(100);

        if (teamCampaigns && teamCampaigns.length > 0) {
          const statusCounts: Record<string, number> = {};
          let totalBudget = 0;
          const platformCounts: Record<string, number> = {};
          const objectiveCounts: Record<string, number> = {};

          for (const c of teamCampaigns) {
            const s = c.status || "draft";
            statusCounts[s] = (statusCounts[s] || 0) + 1;
            totalBudget += c.total_budget || 0;

            const platforms = Array.isArray(c.platforms) ? c.platforms : [];
            for (const p of platforms) {
              platformCounts[String(p)] = (platformCounts[String(p)] || 0) + 1;
            }
            if (c.objective) {
              objectiveCounts[c.objective] = (objectiveCounts[c.objective] || 0) + 1;
            }
          }

          contextParts.push(`## Team Campaign Statistics (${teamCampaigns.length} total campaigns)
Status breakdown: ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}
Total budget across campaigns: $${totalBudget.toLocaleString()}
Platform usage: ${Object.entries(platformCounts).map(([k, v]) => `${k}: ${v} campaigns`).join(", ")}
Objective distribution: ${Object.entries(objectiveCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
        }

        // Team members and roles
        const { data: teamMembers } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .eq("team_id", teamId);

        if (teamMembers && teamMembers.length > 0) {
          const roleCounts: Record<string, number> = {};
          for (const m of teamMembers) {
            roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
          }
          contextParts.push(`## Team Members (${teamMembers.length} total)
Role breakdown: ${Object.entries(roleCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}`);

          // Get unique user IDs for profile lookup
          const userIds = [...new Set(teamMembers.map(m => m.user_id))];
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("id, email, full_name")
            .in("id", userIds);

          if (profiles && profiles.length > 0) {
            const memberDetails = profiles.map(p => {
              const role = teamMembers.find(m => m.user_id === p.id)?.role || "unknown";
              return `- ${p.full_name || p.email} (${role})`;
            }).join("\n");
            contextParts.push(`## Team Member Details\n${memberDetails}`);
          }
        }

        // Platform connections
        const { data: connections } = await supabaseAdmin
          .from("connected_platforms")
          .select("platform_type, platform_name, is_active, ad_account_id, ad_account_name")
          .eq("team_id", teamId);

        if (connections && connections.length > 0) {
          const platformSummary = connections.map(c =>
            `- ${c.platform_name} (${c.platform_type}): ${c.is_active ? "Active" : "Inactive"}${c.ad_account_name ? ` — Account: ${c.ad_account_name}` : ""}`
          ).join("\n");
          contextParts.push(`## Connected Platforms (${connections.length} connections)\n${platformSummary}`);
        }

        // Campaign launch status summary
        const { data: launchStatuses } = await supabaseAdmin
          .from("campaign_launch_status")
          .select("campaign_id, platform, status, entity_type, error_message")
          .in("campaign_id", (teamCampaigns || []).map(c => c.id))
          .limit(200);

        if (launchStatuses && launchStatuses.length > 0) {
          const launchCounts: Record<string, number> = {};
          let errorCount = 0;
          for (const ls of launchStatuses) {
            launchCounts[ls.status] = (launchCounts[ls.status] || 0) + 1;
            if (ls.error_message) errorCount++;
          }
          contextParts.push(`## Campaign Push/Launch Statistics
Total entities: ${launchStatuses.length}
Status breakdown: ${Object.entries(launchCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}
Entities with errors: ${errorCount}`);
        }

        // Modification requests (approval workflow)
        const { data: modRequests } = await supabaseAdmin
          .from("campaign_change_history")
          .select("action, change_type, created_at, campaign_id")
          .in("campaign_id", (teamCampaigns || []).map(c => c.id))
          .order("created_at", { ascending: false })
          .limit(50);

        if (modRequests && modRequests.length > 0) {
          const actionCounts: Record<string, number> = {};
          for (const r of modRequests) {
            actionCounts[r.action] = (actionCounts[r.action] || 0) + 1;
          }
          contextParts.push(`## Change History (last 50 actions)
Action breakdown: ${Object.entries(actionCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
        }

        // Activity logs for time tracking
        const { data: activityLogs } = await supabaseAdmin
          .from("activity_logs")
          .select("action_type, estimated_hours, actual_hours, created_at, user_id")
          .in("campaign_id", (teamCampaigns || []).map(c => c.id))
          .order("created_at", { ascending: false })
          .limit(100);

        if (activityLogs && activityLogs.length > 0) {
          let totalEstimated = 0;
          let totalActual = 0;
          const actionTypeCounts: Record<string, number> = {};
          for (const log of activityLogs) {
            totalEstimated += log.estimated_hours || 0;
            totalActual += log.actual_hours || 0;
            actionTypeCounts[log.action_type] = (actionTypeCounts[log.action_type] || 0) + 1;
          }
          contextParts.push(`## Team Activity & Time Tracking (last 100 activities)
Total estimated hours: ${totalEstimated.toFixed(1)}h
Total actual hours: ${totalActual.toFixed(1)}h
Activity types: ${Object.entries(actionTypeCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
        }

        // Benchmark data across team
        const { data: benchmarks } = await supabaseAdmin
          .from("campaign_performance_benchmarks")
          .select("market, optimization_goal, avg_cost_per_result, total_spend, total_results, industry, platform")
          .in("user_id", (teamMembers || []).map(m => m.user_id))
          .order("date_range_end", { ascending: false })
          .limit(50);

        if (benchmarks && benchmarks.length > 0) {
          const totalSpend = benchmarks.reduce((s, b) => s + (b.total_spend || 0), 0);
          const marketSpend: Record<string, number> = {};
          const platformSpend: Record<string, number> = {};
          for (const b of benchmarks) {
            marketSpend[b.market] = (marketSpend[b.market] || 0) + (b.total_spend || 0);
            platformSpend[b.platform] = (platformSpend[b.platform] || 0) + (b.total_spend || 0);
          }
          contextParts.push(`## Team Cost & Benchmark Data
Total tracked spend: $${totalSpend.toLocaleString()}
Spend by market: ${Object.entries(marketSpend).map(([k, v]) => `${k}: $${v.toLocaleString()}`).join(", ")}
Spend by platform: ${Object.entries(platformSpend).map(([k, v]) => `${k}: $${v.toLocaleString()}`).join(", ")}`);
        }

      } catch (adminErr) {
        console.error("Error fetching admin context:", adminErr);
      }
    }

    // ─── Standard user context (benchmarks + campaigns) ───
    if (campaignContext?.industry) {
      const { data: benchmarks } = await supabaseAdmin
        .from("campaign_performance_benchmarks")
        .select("*")
        .ilike("industry", campaignContext.industry)
        .order("date_range_end", { ascending: false })
        .limit(50);

      if (benchmarks && benchmarks.length > 0) {
        const benchmarkSummary = benchmarks.map((b: any) =>
          `${b.market}/${b.optimization_goal}: CPR=$${b.avg_cost_per_result?.toFixed(2)}, Spend=$${b.total_spend?.toFixed(0)}, Results=${b.total_results}, Campaigns=${b.campaign_count}`
        ).join("\n");
        contextParts.push(`## User's Campaign Benchmarks (Industry: ${campaignContext.industry})\n${benchmarkSummary}`);
      }
    }

    if (campaignContext?.campaignId) {
      const { data: campaign } = await supabaseAdmin
        .from("campaigns")
        .select("*")
        .eq("id", campaignContext.campaignId)
        .single();

      if (campaign) {
        contextParts.push(`## Current Campaign Context
Name: ${campaign.name}
Objective: ${campaign.objective}
Total Budget: $${campaign.total_budget}
Start: ${campaign.start_date || 'Not set'}
End: ${campaign.end_date || 'Not set'}
Status: ${campaign.status || 'draft'}
Platforms: ${JSON.stringify(campaign.platforms)}
Budget Allocation: ${JSON.stringify(campaign.budget_allocation)}`);
      }

      const { data: insights } = await supabaseAdmin
        .from("campaign_insights")
        .select("*")
        .eq("campaign_id", campaignContext.campaignId)
        .order("fetched_at", { ascending: false })
        .limit(5);

      if (insights && insights.length > 0) {
        const insightsSummary = insights.map((i: any) =>
          `Platform: ${i.platform}, Metrics: ${JSON.stringify(i.metrics)}`
        ).join("\n");
        contextParts.push(`## Campaign Performance Data\n${insightsSummary}`);
      }
    }

    if (!campaignContext?.campaignId) {
      const { data: campaigns } = await supabaseAdmin
        .from("campaigns")
        .select("id, name, objective, total_budget, status, platforms, start_date, end_date")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(10);

      if (campaigns && campaigns.length > 0) {
        const campaignList = campaigns.map((c: any) =>
          `- ${c.name} (${c.objective}, $${c.total_budget}, ${c.status || 'draft'}, platforms: ${JSON.stringify(c.platforms)})`
        ).join("\n");
        contextParts.push(`## User's Recent Campaigns\n${campaignList}`);
      }
    }

    const contextBlock = contextParts.length > 0
      ? `\n\n---\nCONTEXT DATA (use this to provide personalized answers):\n${contextParts.join("\n\n")}\n---\n`
      : "";

    const adminInstructions = isAdmin ? `

7. **Operational Statistics (Admin Mode)**: You have access to team-wide operational data. Help admins understand:
   - **Team productivity**: Campaign creation rates, statuses, time tracking, who is doing what
   - **Platform usage**: Which platforms are most connected, ad account distribution
   - **Campaign operations**: Push success/failure rates, error patterns, approval workflow stats
   - **Cost & billing**: Spend distribution across markets/platforms, benchmark comparisons
   
   Provide data-driven summaries, trend insights, and actionable recommendations for improving team operations. When asked about specific team members, reference their activity data.` : "";

    const systemPrompt = `You are ActiPlan AI Assistant, an expert digital marketing strategist and media buying advisor. You help users with:

1. **Benchmarks & Performance**: Analyze campaign performance data, provide benchmark comparisons, and identify optimization opportunities. When benchmark data is available in the context, use it to give data-backed recommendations.

2. **Digital Marketing Concepts**: Explain metrics (CPM, CPC, CTR, ROAS, CPA, etc.), ad formats (carousel, video, stories, reels, etc.), strategies (awareness, consideration, conversion), platform-specific features, and industry best practices.

3. **Campaign Strategy**: Guide users on funnel strategy, audience targeting, budget allocation across platforms/markets/phases, bidding strategies, and optimization goals.

4. **Troubleshooting**: Help diagnose campaign performance issues, identify underperforming segments, suggest A/B testing approaches, and recommend data analysis perspectives.

5. **Step-by-Step Guidance**: Walk users through creating campaigns, setting up targeting, configuring creatives, interpreting performance reports, and using ActiPlan features.

6. **Optimization Ideas**: Suggest which dimensions to analyze (platform, market, creative, audience), how to read performance trends, pacing analysis, and budget reallocation strategies.${adminInstructions}

When you have campaign or benchmark data in context, always reference specific numbers and provide actionable, personalized advice. Be conversational but professional. Use clear formatting with headers and bullet points. When discussing costs, always mention the currency and context.

If you don't have enough data to answer precisely, say so and suggest what data the user should look at or provide.${contextBlock}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
