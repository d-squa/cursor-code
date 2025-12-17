import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

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
  includeActivityLogs?: boolean;
  includeCompetitorAnalysis?: boolean;
  clientId?: string;
  clientName?: string;
  clientIndustry?: string;
  isGeneralPerformance?: boolean;
}

interface ActivityLog {
  id: string;
  title: string;
  description: string;
  action_type: string;
  affected_platforms: string[];
  affected_markets: string[];
  affected_phases: string[];
  created_at: string;
  metadata?: any;
}

interface ModificationRequest {
  id: string;
  change_type: string;
  description: string;
  status: string;
  created_at: string;
}

// Generate sample data that mimics real API response structure
function generateSampleData(platforms: string[], breakdowns: string[], timeComparison: string, isGeneralPerformance: boolean = false) {
  const currentPeriodData: any[] = [];
  const comparisonPeriodData: any[] = [];
  
  const ageGroups = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const genders = ['male', 'female', 'unknown'];
  const countries = ['US', 'UK', 'CA', 'AU', 'DE', 'FR'];
  const devices = ['mobile', 'desktop', 'tablet'];
  const placements = ['feed', 'stories', 'reels', 'right_column', 'marketplace'];
  const publishers = ['facebook', 'instagram', 'audience_network', 'messenger'];
  
  // Ad set naming convention patterns for general performance mode
  const adSetPatterns = [
    { name: 'CONV_LAL_1%_18-35_AllPlc', targeting: 'Lookalike 1%', audience: '18-35', strategy: 'Conversions' },
    { name: 'CONV_RTG_Web_25-54_Feed', targeting: 'Retargeting Web', audience: '25-54', strategy: 'Conversions' },
    { name: 'CONV_INT_Fashion_18-44_Auto', targeting: 'Interest Fashion', audience: '18-44', strategy: 'Conversions' },
    { name: 'TRAFFIC_BRD_25-65_AllPlc', targeting: 'Broad', audience: '25-65', strategy: 'Traffic' },
    { name: 'REACH_LAL_2%_35-54_Stories', targeting: 'Lookalike 2%', audience: '35-54', strategy: 'Reach' },
    { name: 'CONV_CUS_HighValue_AllAge_Feed', targeting: 'Custom High Value', audience: 'All Ages', strategy: 'Conversions' },
  ];
  
  // Generate data for each platform
  platforms.forEach(platform => {
    if (isGeneralPerformance) {
      // General performance mode: use ad set naming patterns
      adSetPatterns.forEach((pattern, idx) => {
        const baseSpend = Math.random() * 1500 + 500;
        const baseImpressions = Math.floor(Math.random() * 150000 + 50000);
        const baseClicks = Math.floor(baseImpressions * (Math.random() * 0.035 + 0.01));
        const baseResults = Math.floor(baseClicks * (Math.random() * 0.18 + 0.05));
        
        currentPeriodData.push({
          platform,
          adset_name: `${platform.toUpperCase()}_${pattern.name}`,
          targeting_type: pattern.targeting,
          audience_segment: pattern.audience,
          strategy: pattern.strategy,
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
          objective: pattern.strategy.toUpperCase(),
          optimization_goal: pattern.strategy === 'Conversions' ? 'OFFSITE_CONVERSIONS' : pattern.strategy === 'Traffic' ? 'LINK_CLICKS' : 'REACH'
        });
        
        // Comparison period
        const compSpend = baseSpend * (0.85 + Math.random() * 0.3);
        const compImpressions = Math.floor(baseImpressions * (0.9 + Math.random() * 0.2));
        const compClicks = Math.floor(compImpressions * (Math.random() * 0.028 + 0.008));
        const compResults = Math.floor(compClicks * (Math.random() * 0.14 + 0.04));
        
        comparisonPeriodData.push({
          platform,
          adset_name: `${platform.toUpperCase()}_${pattern.name}`,
          targeting_type: pattern.targeting,
          audience_segment: pattern.audience,
          strategy: pattern.strategy,
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
          objective: pattern.strategy.toUpperCase(),
          optimization_goal: pattern.strategy === 'Conversions' ? 'OFFSITE_CONVERSIONS' : pattern.strategy === 'Traffic' ? 'LINK_CLICKS' : 'REACH'
        });
      });
    } else {
      // Regular breakdown mode
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
    }
  });
  
  return { currentPeriodData, comparisonPeriodData };
}

// Format activity logs for AI prompt
function formatActivityLogsForPrompt(
  activityLogs: ActivityLog[],
  modificationRequests: ModificationRequest[]
): string {
  if (activityLogs.length === 0 && modificationRequests.length === 0) {
    return '';
  }

  let logsSection = `
---

**ACTIVITY LOGS (Actions taken during this period):**

These are actual changes and optimizations made to the campaign. Use this information to correlate performance changes with specific actions taken.

`;

  if (activityLogs.length > 0) {
    logsSection += `**Logged Actions:**
`;
    activityLogs.forEach(log => {
      const date = new Date(log.created_at).toLocaleDateString();
      const platforms = log.affected_platforms?.join(', ') || 'All';
      logsSection += `- **${date}** [${log.action_type.replace('_', ' ').toUpperCase()}] ${log.title}
  - Description: ${log.description || 'N/A'}
  - Affected Platforms: ${platforms}
  - Affected Markets: ${log.affected_markets?.join(', ') || 'All'}
`;
    });
  }

  if (modificationRequests.length > 0) {
    logsSection += `
**Change Requests:**
`;
    modificationRequests.forEach(req => {
      const date = new Date(req.created_at).toLocaleDateString();
      logsSection += `- **${date}** [${req.change_type.replace('_', ' ').toUpperCase()}] - Status: ${req.status}
  - Description: ${req.description}
`;
    });
  }

  logsSection += `
When analyzing performance changes, consider whether any of the above actions might explain the observed trends.
`;

  return logsSection;
}

// Format competitor data for AI prompt with explicit competitor names
function formatCompetitorDataForPrompt(competitorData: any): string {
  if (!competitorData || (!competitorData.meta?.length && !competitorData.tiktok?.length)) {
    return '';
  }

  // Extract unique competitor names
  const metaCompetitors = competitorData.meta?.map((ad: any) => ad.page_name || ad.advertiser_name).filter(Boolean) || [];
  const tiktokCompetitors = competitorData.tiktok?.map((ad: any) => ad.advertiser_name).filter(Boolean) || [];
  const allCompetitors = [...new Set([...metaCompetitors, ...tiktokCompetitors])];
  
  let competitorSection = `
---

**COMPETITOR ADVERTISING ACTIVITY:**

**IMPORTANT: You MUST explicitly mention the following competitor names by name in your analysis:**
${allCompetitors.map((name, idx) => `${idx + 1}. ${name}`).join('\n')}

These are direct competitors actively advertising. Analyze their activity and reference them BY NAME when discussing competitive landscape.

`;

  if (competitorData.meta?.length > 0) {
    competitorSection += `**Meta (Facebook/Instagram) Competitor Ads (${competitorData.meta.length} total):**
`;
    // Group by advertiser name
    const metaByAdvertiser = new Map<string, any[]>();
    competitorData.meta.forEach((ad: any) => {
      const name = ad.page_name || ad.advertiser_name || 'Unknown';
      if (!metaByAdvertiser.has(name)) {
        metaByAdvertiser.set(name, []);
      }
      metaByAdvertiser.get(name)!.push(ad);
    });
    
    metaByAdvertiser.forEach((ads, advertiserName) => {
      const activeCount = ads.filter((a: any) => !a.ad_delivery_stop_time).length;
      competitorSection += `- **${advertiserName}**: ${ads.length} ads (${activeCount} active)
`;
    });
  }

  if (competitorData.tiktok?.length > 0) {
    competitorSection += `
**TikTok Competitor Ads (${competitorData.tiktok.length} total):**
`;
    // Group by advertiser name
    const tiktokByAdvertiser = new Map<string, any[]>();
    competitorData.tiktok.forEach((ad: any) => {
      const name = ad.advertiser_name || 'Unknown';
      if (!tiktokByAdvertiser.has(name)) {
        tiktokByAdvertiser.set(name, []);
      }
      tiktokByAdvertiser.get(name)!.push(ad);
    });
    
    tiktokByAdvertiser.forEach((ads, advertiserName) => {
      const activeCount = ads.filter((a: any) => a.is_active).length;
      competitorSection += `- **${advertiserName}**: ${ads.length} ads (${activeCount} active)
`;
    });
  }

  competitorSection += `
**Summary:** ${competitorData.summary?.totalCompetitorAds || allCompetitors.length} total competitor ads found across ${allCompetitors.length} unique competitors.
Data source: ${competitorData.summary?.usedLiveData ? 'Live API data' : 'Sample data (no live API access)'}

When analyzing performance, ALWAYS:
1. Mention specific competitor names (e.g., "${allCompetitors[0] || 'Competitor A'}", "${allCompetitors[1] || 'Competitor B'}")
2. Correlate your performance changes with competitor activity levels
3. Recommend competitive positioning strategies against these specific competitors
`;

  return competitorSection;
}

// Build the AI analysis prompt
function buildAnalysisPrompt(
  currentData: any[],
  comparisonData: any[],
  breakdowns: string[],
  timeComparison: string,
  crossPlatformEnabled: boolean,
  activityLogsSection: string,
  competitorSection: string,
  isGeneralPerformance: boolean = false
): string {
  const timeLabel = timeComparison.replace(/_/g, ' ');
  
  const currentDataStr = JSON.stringify(currentData, null, 2);
  const comparisonDataStr = JSON.stringify(comparisonData, null, 2);
  
  const platformList = [...new Set(currentData.map(d => d.platform))];
  const isCrossPlatform = crossPlatformEnabled && platformList.length > 1;
  
  const hasActivityLogs = activityLogsSection.length > 0;
  const hasCompetitorData = competitorSection.length > 0;
  
  // Determine breakdown label based on mode
  const breakdownLabel = isGeneralPerformance ? 'Ad Set Name (naming convention)' : breakdowns.join(', ');
  
  return `
I am a digital marketing performance analyst, and I need help analyzing campaign performance evolution.

${isGeneralPerformance ? `
**GENERAL PERFORMANCE ANALYSIS MODE**
This analysis focuses on overall campaign performance using ad set naming conventions as differentiators.
Please analyze performance by:
- Ad Set Name patterns (decode naming conventions to identify targeting, creative, or audience types)
- Overall campaign health metrics
- Budget efficiency across ad sets
- Top and bottom performing ad sets by name/strategy
` : ''}
${!isGeneralPerformance && isCrossPlatform ? `
**CROSS-PLATFORM ANALYSIS MODE**
This analysis compares performance across multiple platforms: ${platformList.join(', ')}.
Please identify:
- Which platform is performing best for the objectives
- Cross-platform budget allocation recommendations
- Platform-specific optimization opportunities
- Unified audience insights across platforms
` : ''}
${!isGeneralPerformance && !isCrossPlatform ? `
**SINGLE PLATFORM ANALYSIS MODE**
Analyzing performance for: ${platformList[0]}
` : ''}

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

${activityLogsSection}

${competitorSection}

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

${hasActivityLogs ? `
**3. Activity Impact Analysis**
Correlate the logged actions and change requests with observed performance changes. For each significant action:
- State what action was taken and when
- Identify if performance metrics changed after the action
- Rate the likely impact: High/Medium/Low/Inconclusive
- Provide recommendations for future similar actions

---
` : ''}

${hasCompetitorData ? `
**${hasActivityLogs ? '4' : '3'}. Competitive Landscape Analysis**
**CRITICAL: You MUST mention specific competitor names from the data above in this section.**

Analyze how competitor activity is affecting campaign performance:
- List each competitor BY NAME and their current advertising activity level
- Explain how each major competitor's activity correlates with your performance metrics
- Identify which specific competitors pose the biggest threat
- Note competitive positioning opportunities against named competitors
- Recommend specific competitive response strategies for each key competitor

Example format: "**Competitor Name** is running X active ads, which may be contributing to..."

---
` : ''}

**${hasActivityLogs && hasCompetitorData ? '5' : hasActivityLogs || hasCompetitorData ? '4' : '3'}. ${timeLabel.charAt(0).toUpperCase() + timeLabel.slice(1)} Performance Changes**
Detail the specific changes between periods. For each significant change:
- State the metric, both period values, and % change
- Explain potential causes${hasActivityLogs ? ' (referencing logged actions where applicable)' : ''}${hasCompetitorData ? ' (considering competitor activity)' : ''}
- Rate severity: Positive/Neutral/Needs Attention

---

**${hasActivityLogs && hasCompetitorData ? '6' : hasActivityLogs || hasCompetitorData ? '5' : '4'}. Recommendations for Optimization**
Provide 4-6 specific, actionable recommendations based on the data.
${isCrossPlatform ? `
Include:
- Cross-platform budget reallocation suggestions
- Platform-specific targeting adjustments
- Unified audience strategy recommendations
` : ''}
${hasCompetitorData ? '- Competitive response tactics' : ''}
${hasActivityLogs ? '- Guidance on replicating successful past actions' : ''}
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
      useSampleData = true,
      includeActivityLogs = true,
      includeCompetitorAnalysis = false,
      clientId,
      clientName,
      clientIndustry,
      isGeneralPerformance = false
    } = body;

    console.log("Insights request:", { campaignIds, platforms, timeComparison, breakdowns, crossPlatformEnabled, includeActivityLogs, includeCompetitorAnalysis, isGeneralPerformance });

    // Fetch activity logs if enabled
    let activityLogs: ActivityLog[] = [];
    let modificationRequests: ModificationRequest[] = [];
    
    if (includeActivityLogs && campaignIds.length > 0) {
      // Fetch activity logs for selected campaigns
      const { data: logsData } = await supabase
        .from('activity_logs')
        .select('id, title, description, action_type, affected_platforms, affected_markets, affected_phases, created_at, metadata')
        .in('campaign_id', campaignIds)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (logsData) {
        activityLogs = logsData as ActivityLog[];
      }
      
      // Fetch modification requests for selected campaigns
      const { data: requestsData } = await supabase
        .from('modification_requests')
        .select('id, change_type, description, status, created_at')
        .in('campaign_id', campaignIds)
        .order('created_at', { ascending: false })
        .limit(30);
      
      if (requestsData) {
        modificationRequests = requestsData as ModificationRequest[];
      }
      
      console.log(`Fetched ${activityLogs.length} activity logs and ${modificationRequests.length} modification requests`);
    }

    // Fetch competitor data if enabled
    let competitorData: any = null;
    if (includeCompetitorAnalysis) {
      console.log("=== COMPETITOR ANALYSIS ENABLED ===");
      console.log("Client ID provided:", clientId || "None");
      console.log("Client Name provided:", clientName || "None");
      console.log("Client Industry provided:", clientIndustry || "None");
      
      try {
        // Use provided clientName/clientIndustry or fetch from clientId
        let searchClientName = clientName;
        let searchClientIndustry = clientIndustry;
        
        if (!searchClientName && clientId) {
          console.log("Fetching client data from database for clientId:", clientId);
          const { data: clientData, error: clientError } = await supabase
            .from('clients')
            .select('name, industry')
            .eq('id', clientId)
            .single();
          
          if (clientError) {
            console.error("Error fetching client:", clientError);
          } else if (clientData) {
            searchClientName = clientData.name;
            searchClientIndustry = clientData.industry;
            console.log("Client data retrieved:", { name: searchClientName, industry: searchClientIndustry });
          }
        }
        
        if (searchClientName && searchClientIndustry) {
          console.log("Calling competitor-ads-search with:", { clientName: searchClientName, industry: searchClientIndustry, platforms });
          
          // Call competitor analysis edge function
          const competitorResponse = await fetch(
            `${supabaseUrl}/functions/v1/competitor-ads-search`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                clientName: searchClientName,
                industry: searchClientIndustry,
                platforms
              })
            }
          );
          
          if (competitorResponse.ok) {
            competitorData = await competitorResponse.json();
            console.log("Competitor data received successfully");
            console.log("Top competitors found:", competitorData.summary?.topCompetitors || []);
            console.log("Total ads found:", competitorData.summary?.totalCompetitorAds || 0);
            console.log("Used live data:", competitorData.summary?.usedLiveData || false);
          } else {
            const errorText = await competitorResponse.text();
            console.error("Competitor API error:", competitorResponse.status, errorText);
          }
        } else {
          console.log("Skipping competitor analysis: Missing client name or industry");
        }
      } catch (compError) {
        console.error('Error fetching competitor data:', compError);
        // Continue without competitor data
      }
    } else {
      console.log("Competitor analysis not enabled for this request");
    }

    // Generate sample data for testing
    const { currentPeriodData, comparisonPeriodData } = generateSampleData(
      platforms, 
      breakdowns, 
      timeComparison,
      isGeneralPerformance
    );


    console.log(`Generated ${currentPeriodData.length} current period records and ${comparisonPeriodData.length} comparison records`);

    // Calculate aggregate metrics for raw data summary
    const totalSpend = currentPeriodData.reduce((sum, d) => sum + d.spend, 0);
    const totalResults = currentPeriodData.reduce((sum, d) => sum + d.results, 0);
    const totalImpressions = currentPeriodData.reduce((sum, d) => sum + d.impressions, 0);
    const avgCPR = totalResults > 0 ? totalSpend / totalResults : 0;
    const avgResultRate = totalImpressions > 0 ? (totalResults / totalImpressions) * 100 : 0;

    // Format activity logs and competitor data for prompt
    const activityLogsSection = formatActivityLogsForPrompt(activityLogs, modificationRequests);
    const competitorSection = formatCompetitorDataForPrompt(competitorData);

    // Build the AI prompt
    const prompt = buildAnalysisPrompt(
      currentPeriodData,
      comparisonPeriodData,
      breakdowns,
      timeComparison,
      crossPlatformEnabled,
      activityLogsSection,
      competitorSection,
      isGeneralPerformance
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
                content: "You are an expert digital marketing performance analyst. Provide clear, data-driven insights and actionable recommendations. Be specific with metrics and percentages. When activity logs are provided, correlate them with performance changes to explain causation. When competitor data is provided, factor it into your analysis. Format your response in clean markdown." 
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
        activityLogs: {
          logs: activityLogs,
          requests: modificationRequests,
          totalCount: activityLogs.length + modificationRequests.length
        },
        competitorData: competitorData || null,
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
