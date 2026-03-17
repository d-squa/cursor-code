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

    // Get user from auth header
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

    const { messages, conversationId, campaignContext } = await req.json();

    // Use service role client for data fetching
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Build context: fetch benchmark data and campaign data if available
    let contextParts: string[] = [];

    // Fetch user's benchmark data
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

    // Fetch campaign data if specific campaign context
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

      // Fetch performance insights
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

    // Fetch user's campaigns summary for general context
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

    const systemPrompt = `You are ActiPlan AI Assistant, an expert digital marketing strategist and media buying advisor. You help users with:

1. **Benchmarks & Performance**: Analyze campaign performance data, provide benchmark comparisons, and identify optimization opportunities. When benchmark data is available in the context, use it to give data-backed recommendations.

2. **Digital Marketing Concepts**: Explain metrics (CPM, CPC, CTR, ROAS, CPA, etc.), ad formats (carousel, video, stories, reels, etc.), strategies (awareness, consideration, conversion), platform-specific features, and industry best practices.

3. **Campaign Strategy**: Guide users on funnel strategy, audience targeting, budget allocation across platforms/markets/phases, bidding strategies, and optimization goals.

4. **Troubleshooting**: Help diagnose campaign performance issues, identify underperforming segments, suggest A/B testing approaches, and recommend data analysis perspectives.

5. **Step-by-Step Guidance**: Walk users through creating campaigns, setting up targeting, configuring creatives, interpreting performance reports, and using ActiPlan features.

6. **Optimization Ideas**: Suggest which dimensions to analyze (platform, market, creative, audience), how to read performance trends, pacing analysis, and budget reallocation strategies.

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
