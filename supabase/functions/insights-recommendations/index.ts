import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InsightsRequest {
  campaignIds: string[];
  platforms: string[];
  timeComparison: string;
  breakdowns: string[];
  crossPlatformEnabled: boolean;
  useSampleData?: boolean;
}

// Generate sample data that mimics real API response structure
function generateSampleData(platforms: string[], breakdowns: string[], timeComparison: string) {
  const currentPeriodData: any[] = [];
  const comparisonPeriodData: any[] = [];
  
  const ageGroups = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const genders = ['male', 'female', 'unknown'];
  const countries = ['US', 'UK', 'CA', 'AU', 'DE', 'FR'];
  const devices = ['mobile', 'desktop', 'tablet'];
  const placements = ['feed', 'stories', 'reels', 'right_column', 'marketplace'];
  const publishers = ['facebook', 'instagram', 'audience_network', 'messenger'];
  
  // Generate data for each platform
  platforms.forEach(platform => {
    // Generate breakdown combinations
    const breakdownValues: Record<string, string[]> = {
      age: ageGroups,
      gender: genders,
      country: countries,
      region: ['California', 'Texas', 'New York', 'Florida', 'Illinois'],
      device_platform: devices,
      placement: platform === 'tiktok' ? ['tiktok_feed', 'pangle'] : placements,
      publisher_platform: platform === 'tiktok' ? ['tiktok'] : publishers
    };
    
    // Get the first breakdown for segmentation
    const primaryBreakdown = breakdowns[0] || 'age';
    const values = breakdownValues[primaryBreakdown] || ageGroups;
    
    values.forEach((value, idx) => {
      // Current period data - with some variation
      const baseSpend = Math.random() * 1000 + 500;
      const baseImpressions = Math.floor(Math.random() * 100000 + 50000);
      const baseClicks = Math.floor(baseImpressions * (Math.random() * 0.03 + 0.01));
      const baseResults = Math.floor(baseClicks * (Math.random() * 0.15 + 0.05));
      
      currentPeriodData.push({
        platform,
        [primaryBreakdown]: value,
        date_start: '2024-12-01',
        date_stop: '2024-12-07',
        spend: baseSpend,
        impressions: baseImpressions,
        clicks: baseClicks,
        results: baseResults,
        reach: Math.floor(baseImpressions * 0.7),
        frequency: 1.4 + Math.random() * 0.5,
        cpm: (baseSpend / baseImpressions) * 1000,
        cpc: baseSpend / baseClicks,
        ctr: (baseClicks / baseImpressions) * 100,
        cpr: baseSpend / baseResults,
        result_rate: (baseResults / baseImpressions) * 100,
        objective: platform === 'meta' ? 'CONVERSIONS' : 'TRAFFIC',
        optimization_goal: platform === 'meta' ? 'OFFSITE_CONVERSIONS' : 'CLICK',
        adset_name: `${platform.toUpperCase()}_${value}_AdSet`
      });
      
      // Comparison period data - slightly different performance
      const compSpend = baseSpend * (0.85 + Math.random() * 0.3);
      const compImpressions = Math.floor(baseImpressions * (0.9 + Math.random() * 0.2));
      const compClicks = Math.floor(compImpressions * (Math.random() * 0.025 + 0.008));
      const compResults = Math.floor(compClicks * (Math.random() * 0.12 + 0.04));
      
      comparisonPeriodData.push({
        platform,
        [primaryBreakdown]: value,
        date_start: '2024-11-24',
        date_stop: '2024-11-30',
        spend: compSpend,
        impressions: compImpressions,
        clicks: compClicks,
        results: compResults,
        reach: Math.floor(compImpressions * 0.7),
        frequency: 1.3 + Math.random() * 0.4,
        cpm: (compSpend / compImpressions) * 1000,
        cpc: compSpend / compClicks,
        ctr: (compClicks / compImpressions) * 100,
        cpr: compSpend / compResults,
        result_rate: (compResults / compImpressions) * 100,
        objective: platform === 'meta' ? 'CONVERSIONS' : 'TRAFFIC',
        optimization_goal: platform === 'meta' ? 'OFFSITE_CONVERSIONS' : 'CLICK',
        adset_name: `${platform.toUpperCase()}_${value}_AdSet`
      });
    });
  });
  
  return { currentPeriodData, comparisonPeriodData };
}

// Build the AI analysis prompt
function buildAnalysisPrompt(
  currentData: any[],
  comparisonData: any[],
  breakdowns: string[],
  timeComparison: string,
  crossPlatformEnabled: boolean
): string {
  const breakdownLabel = breakdowns.join(', ');
  const timeLabel = timeComparison.replace(/_/g, ' ');
  
  const currentDataStr = JSON.stringify(currentData, null, 2);
  const comparisonDataStr = JSON.stringify(comparisonData, null, 2);
  
  const platformList = [...new Set(currentData.map(d => d.platform))];
  const isCrossPlatform = crossPlatformEnabled && platformList.length > 1;
  
  return `
I am a digital marketing performance analyst, and I need help analyzing campaign performance evolution.

${isCrossPlatform ? `
**CROSS-PLATFORM ANALYSIS MODE**
This analysis compares performance across multiple platforms: ${platformList.join(', ')}.
Please identify:
- Which platform is performing best for the objectives
- Cross-platform budget allocation recommendations
- Platform-specific optimization opportunities
- Unified audience insights across platforms
` : `
**SINGLE PLATFORM ANALYSIS MODE**
Analyzing performance for: ${platformList[0]}
`}

The performance data has been pre-calculated and includes:
- CPM (cost per 1,000 impressions)
- CPC (cost per click)
- CPR (cost per result) - Refer to as "Cost per Result"
- CTR (click-through rate)
- Results (number of optimization_goal outcomes achieved)
- Result Rate (Results ÷ Impressions × 100)
- Spend, Impressions, Clicks, Reach, Frequency
- Ad Set Name, objective, optimization_goal

The data breakdown is segmented by: ${breakdownLabel}

**PRIMARY KPIs for analysis (use these first):**
1. Results - volume of optimization goal completions
2. Cost per Result (CPR) - efficiency metric
3. Result Rate - conversion efficiency

**SECONDARY KPIs (use when primary KPIs are inconclusive):**
- CPM, CTR, CPC

**Time Comparison:** ${timeLabel}

---

**CURRENT PERIOD DATA:**
${currentDataStr}

---

**COMPARISON PERIOD DATA:**
${comparisonDataStr}

---

Please follow this EXACT structure in your response:

---

**1. Performance Analysis**
Analyze the overall performance trends, focusing on primary KPIs first. Highlight top and bottom performers by ${breakdownLabel}.
${isCrossPlatform ? 'Compare performance across platforms and identify which platform delivers best results for the optimization goal.' : ''}

---

**2. Key Insights**
Extract 3-5 actionable insights from the data. Include specific metrics and percentages. Focus on statistically significant differences.
${isCrossPlatform ? 'Include cross-platform insights about audience behavior differences.' : ''}

---

**3. ${timeLabel.charAt(0).toUpperCase() + timeLabel.slice(1)} Performance Changes**
Detail the specific changes between periods. For each significant change:
- State the metric, both period values, and % change
- Explain potential causes
- Rate severity: Positive/Neutral/Needs Attention

---

**4. Recommendations for Optimization**
Provide 4-6 specific, actionable recommendations based on the data.
${isCrossPlatform ? `
Include:
- Cross-platform budget reallocation suggestions
- Platform-specific targeting adjustments
- Unified audience strategy recommendations
` : ''}
Prioritize recommendations by expected impact.

---

Respond using **markdown formatting**, no emojis, no JSON, and no follow-up questions.
Base all recommendations on the actual data provided, not generic best practices.
Always mention the % evolution with actual values from each period.
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: InsightsRequest = await req.json();
    const { 
      campaignIds, 
      platforms, 
      timeComparison, 
      breakdowns, 
      crossPlatformEnabled,
      useSampleData = true 
    } = body;

    console.log("Insights request:", { campaignIds, platforms, timeComparison, breakdowns, crossPlatformEnabled });

    // Generate sample data for testing
    const { currentPeriodData, comparisonPeriodData } = generateSampleData(
      platforms, 
      breakdowns, 
      timeComparison
    );

    console.log(`Generated ${currentPeriodData.length} current period records and ${comparisonPeriodData.length} comparison records`);

    // Calculate aggregate metrics for raw data summary
    const totalSpend = currentPeriodData.reduce((sum, d) => sum + d.spend, 0);
    const totalResults = currentPeriodData.reduce((sum, d) => sum + d.results, 0);
    const totalImpressions = currentPeriodData.reduce((sum, d) => sum + d.impressions, 0);
    const avgCPR = totalResults > 0 ? totalSpend / totalResults : 0;
    const avgResultRate = totalImpressions > 0 ? (totalResults / totalImpressions) * 100 : 0;

    // Build the AI prompt
    const prompt = buildAnalysisPrompt(
      currentPeriodData,
      comparisonPeriodData,
      breakdowns,
      timeComparison,
      crossPlatformEnabled
    );

    // Call Lovable AI for analysis
    let analysis = "";
    
    if (lovableApiKey) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { 
                role: "system", 
                content: "You are an expert digital marketing performance analyst. Provide clear, data-driven insights and actionable recommendations. Be specific with metrics and percentages. Format your response in clean markdown." 
              },
              { role: "user", content: prompt }
            ],
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error("AI API error:", aiResponse.status, errorText);
          
          if (aiResponse.status === 429) {
            analysis = "**Rate limit exceeded.** Please try again in a few moments.";
          } else if (aiResponse.status === 402) {
            analysis = "**AI credits depleted.** Please add credits to your workspace to continue using AI analysis.";
          } else {
            analysis = `**AI analysis temporarily unavailable.** Error: ${errorText}`;
          }
        } else {
          const aiData = await aiResponse.json();
          analysis = aiData.choices?.[0]?.message?.content || "No analysis generated.";
        }
      } catch (aiError: any) {
        console.error("AI call failed:", aiError);
        analysis = `**AI analysis error:** ${aiError.message}`;
      }
    } else {
      analysis = `
**1. Performance Analysis**

Based on the sample data provided, here's a summary of performance across the selected dimensions:

- **Top Performers:** The 25-34 age group shows the highest result rate at approximately 0.12%, with a cost per result of $8.50
- **Underperformers:** The 65+ segment has the lowest engagement metrics with CTR at 0.8%
- **Spend Efficiency:** Mobile devices show 15% lower CPM compared to desktop

---

**2. Key Insights**

1. **Age 25-34 drives 35% of total conversions** while only consuming 28% of budget - indicating high efficiency
2. **Female audiences** convert at 22% higher rate than male audiences for the same spend
3. **Feed placements** outperform Stories by 18% in result rate

---

**3. Week on Week Performance Changes**

- **Results:** +12% (Current: 1,245 vs Previous: 1,112) - Positive
- **CPR:** -8% (Current: $9.50 vs Previous: $10.32) - Positive improvement
- **CTR:** +0.15pp (Current: 2.1% vs Previous: 1.95%) - Positive

---

**4. Recommendations for Optimization**

1. **Shift 15% budget to 25-34 age group** - highest performing segment
2. **Reduce 65+ targeting** unless brand awareness is the goal
3. **Increase feed placement allocation** by 20% at expense of Stories
4. **Test female-focused creatives** given higher conversion rates

*Note: This is sample analysis. Connect live campaign data for real insights.*
`;
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        rawData: {
          totalSpend: Math.round(totalSpend * 100) / 100,
          totalResults,
          avgCPR: Math.round(avgCPR * 100) / 100,
          avgResultRate: Math.round(avgResultRate * 100) / 100,
          recordCount: currentPeriodData.length,
          platforms,
          breakdowns,
          timeComparison
        },
        sampleDataUsed: useSampleData
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Insights error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
