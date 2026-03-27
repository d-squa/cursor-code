import { supabase } from "@/integrations/supabase/client";

export interface BenchmarkData {
  market: string;
  optimization_goal: string;
  industry: string | null;
  platform: string;
  avg_cost_per_result: number | null;
  total_spend: number;
  total_results: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  landing_page_views: number;
  revenue: number;
  campaign_count: number;
  date_range_start?: string;
  date_range_end?: string;
}

/**
 * Click-based / visit-based optimization goals where CTR is the primary rate metric.
 * CTR click metric depends on goal:
 *   - LINK_CLICKS, TRAFFIC → link_clicks
 *   - LANDING_PAGE_VIEWS, TRAFFIC_LANDING_PAGE_VIEW → landing_page_views
 *   - Default → clicks
 */
const CLICK_BASED_GOALS = new Set([
  'LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'TRAFFIC_LANDING_PAGE_VIEW',
  'CLICK', 'TRAFFIC', 'DEMAND_GEN_CLICKS', 'SEARCH_CLICKS',
]);

/**
 * Check if an optimization goal is click/visit-based (should show CTR)
 */
export function isClickBasedGoal(optimizationGoal: string): boolean {
  return CLICK_BASED_GOALS.has(optimizationGoal.toUpperCase());
}

/**
 * Calculate CTR from raw benchmark data.
 * The "click" metric used depends on the optimization goal:
 *   - Landing page view goals → landing_page_views / impressions
 *   - Link click goals → link_clicks / impressions  
 *   - Default → clicks / impressions
 */
export function calculateBenchmarkCTR(benchmark: BenchmarkData): number | null {
  if (!benchmark.impressions || benchmark.impressions <= 0) return null;
  
  const goal = benchmark.optimization_goal?.toUpperCase() || '';
  
  let clickMetric: number;
  if (goal.includes('LANDING_PAGE') || goal === 'TRAFFIC_LANDING_PAGE_VIEW') {
    clickMetric = benchmark.landing_page_views || 0;
  } else if (goal.includes('LINK_CLICK') || goal === 'CLICK' || goal === 'TRAFFIC') {
    clickMetric = benchmark.link_clicks || benchmark.clicks || 0;
  } else {
    clickMetric = benchmark.clicks || 0;
  }
  
  if (clickMetric <= 0) return null;
  return (clickMetric / benchmark.impressions) * 100;
}

/**
 * Calculate ROAS from raw benchmark data: revenue / total_spend
 * Only meaningful for revenue-based objectives.
 */
export function calculateBenchmarkROAS(benchmark: BenchmarkData): number | null {
  if (!benchmark.total_spend || benchmark.total_spend <= 0) return null;
  if (!benchmark.revenue || benchmark.revenue <= 0) return null;
  return benchmark.revenue / benchmark.total_spend;
}

/**
 * Normalizes optimization goal names across platforms for benchmark lookup.
 * TikTok API/UI uses different names than what's stored in benchmarks.
 */
function normalizeBenchmarkGoal(goal: string, platform: string): string {
  const upper = goal.toUpperCase();
  
  if (platform === 'tiktok') {
    // TikTok UI goals → DB stored goals mapping
    const tiktokGoalMap: Record<string, string> = {
      'CONVERT': 'CONVERSION',
      'LANDING_PAGE_VIEW': 'TRAFFIC_LANDING_PAGE_VIEW',
      'FORM': 'LEAD_GENERATION',
      'PROFILE_VISIT': 'ENGAGED_VIEW_FIFTEEN', // closest match
      'SHOW': 'IMPRESSION',
      'VIDEO_VIEW': 'VIDEO_VIEWS',
      'ENGAGED_VIEW': 'ENGAGED_VIEW_FIFTEEN',
      'SIX_SECOND_VIDEO_VIEW': 'ENGAGED_VIEW_FIFTEEN',
      'INSTALL': 'APP_INSTALLS',
      'ON_WEB_ORDER': 'CONVERSION',
      'ON_WEB_ADD_TO_CART': 'CONVERSION',
      'COMPLETE_PAYMENT': 'CONVERSION',
    };
    return tiktokGoalMap[upper] || upper;
  }
  
  if (platform === 'meta') {
    const metaGoalMap: Record<string, string> = {
      'IMPRESSIONS': 'REACH',
      'CPV': 'THRUPLAY',
      'CPE': 'POST_ENGAGEMENT',
      'CPE-P': 'POST_ENGAGEMENT',
      'ENGAGEMENT': 'POST_ENGAGEMENT',
      'VIDEO_VIEW': 'VIDEO_VIEWS',
      'THRUPLAYS': 'THRUPLAY',
      'CPFL': 'PAGE_LIKES',
      'CPV2SC': 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS',
    };
    return metaGoalMap[upper] || upper;
  }
  
  if (platform === 'google') {
    // Google Ads UI/bidding strategy goals → DB stored goals mapping
    const googleGoalMap: Record<string, string> = {
      // Bidding strategies (used in forecast)
      'MAXIMIZE_CLICKS': 'CLICK',
      'MAXIMIZE CLICKS': 'CLICK',
      'MANUAL_CPC': 'CLICK',
      'MANUAL CPC': 'CLICK',
      'MAXIMUM_CPC': 'CLICK',
      'MAXIMUM CPC': 'CLICK',
      'CPM': 'REACH',
      'VIEWABLE_IMPRESSIONS': 'CLICK',
      'MAXIMIZE_CONVERSIONS': 'CONVERSION',
      'MAXIMIZE CONVERSIONS': 'CONVERSION',
      'TARGET_CPA': 'CONVERSION',
      'TARGET CPA': 'CONVERSION',
      'MAXIMIZE_CONVERSION_VALUE': 'CONVERSION',
      'MAXIMIZE CONVERSION VALUE': 'CONVERSION',
      'TARGET_ROAS': 'CONVERSION',
      'TARGET ROAS': 'CONVERSION',
      'TARGET_IMPRESSION_SHARE': 'CLICK',
      // Campaign type / objective mappings
      'REACH': 'CLICK',
      'VIDEO VIEWS': 'CLICK',
      'VIDEO_VIEWS': 'CLICK',
      'AD SEQUENCE': 'CLICK',
      'AD_SEQUENCE': 'CLICK',
      'AUDIO REACH': 'CLICK',
      'AUDIO_REACH': 'CLICK',
      'SEARCH': 'SEARCH_CLICKS',
      'PERFORMANCE MAX': 'PMAX_CONVERSIONS',
      'PERFORMANCE_MAX': 'PMAX_CONVERSIONS',
      'CONVERSIONS': 'CONVERSION',
      'SHOPPING': 'SHOPPING_CONVERSIONS',
      'STANDARD SHOPPING': 'SHOPPING_CONVERSIONS',
      'STANDARD_SHOPPING': 'SHOPPING_CONVERSIONS',
      'APP INSTALLS': 'CONVERSION',
      'APP_INSTALLS': 'CONVERSION',
      'APP ENGAGEMENT': 'CONVERSION',
      'APP_ENGAGEMENT': 'CONVERSION',
      'APP PRE-REGISTRATION': 'CONVERSION',
      'APP_PRE-REGISTRATION': 'CONVERSION',
      'DEMAND GEN': 'DEMAND_GEN_CLICKS',
      'DEMAND_GEN': 'DEMAND_GEN_CLICKS',
    };
    return googleGoalMap[upper] || upper;
  }
  
  return upper;
}

/**
 * Determines the platform key for benchmark lookup from platform ID string
 */
export function getPlatformKeyFromId(platformId: string): string {
  const lower = platformId.toLowerCase();
  if (lower.includes('tiktok')) return 'tiktok';
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'meta';
  if (lower.includes('google')) return 'google';
  if (lower.includes('snapchat')) return 'snapchat';
  return 'meta'; // default
}

/**
 * Fetches benchmark data for a specific platform, market, optimization goal, and industry
 * All conditions are HARD requirements - benchmark is only returned if all match
 */
export async function getBenchmarkCostPerResult(
  market: string,
  optimizationGoal: string,
  industry?: string | null,
  platform?: string
): Promise<number | null> {
  try {
    const platformKey = platform || 'meta';
    const normalizedGoal = normalizeBenchmarkGoal(optimizationGoal, platformKey);

    const runQuery = async (goal: string) => {
      let query = supabase
        .from("campaign_performance_benchmarks")
        .select("total_spend,total_results,avg_cost_per_result")
        .ilike("market", market)
        .eq("platform", platformKey)
        .ilike("optimization_goal", goal);

      if (industry) {
        query = query.ilike("industry", industry);
      } else {
        console.log(`No industry provided, skipping benchmark for ${platformKey}/${market}/${goal}`);
        return null;
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        return null;
      }

      const totals = data.reduce(
        (acc, row) => ({
          spend: acc.spend + Number(row.total_spend || 0),
          results: acc.results + Number(row.total_results || 0),
        }),
        { spend: 0, results: 0 },
      );

      if (totals.results > 0) {
        return totals.spend / totals.results;
      }

      const latestWithAvg = data.find((row) => typeof row.avg_cost_per_result === "number" && row.avg_cost_per_result > 0);
      return latestWithAvg?.avg_cost_per_result ?? null;
    };

    const normalizedMatch = await runQuery(normalizedGoal);
    if (normalizedMatch && normalizedMatch > 0) {
      return normalizedMatch;
    }

    if (normalizedGoal !== optimizationGoal.toUpperCase()) {
      const fallbackMatch = await runQuery(optimizationGoal);
      if (fallbackMatch && fallbackMatch > 0) {
        return fallbackMatch;
      }
    }

    console.log(`No benchmark found for ${platformKey}/${industry}/${market}/${normalizedGoal}`);
    return null;
  } catch (error) {
    console.error("Error fetching benchmark:", error);
    return null;
  }
}

/**
 * Fetches all benchmarks for the current user, filtered by platform and optionally by industry
 * @param industry - If provided, only returns benchmarks matching this industry (HARD condition)
 * @param platform - Platform to filter by (e.g., 'meta', 'tiktok', 'google')
 * @returns Map of benchmarks keyed by "PLATFORM_MARKET_optimizationGoal"
 */
export async function getAllBenchmarks(
  industry?: string | null,
  platform?: string,
  dateRange?: { startDate?: string; endDate?: string }
): Promise<Map<string, BenchmarkData>> {
  try {
    let query = supabase
      .from("campaign_performance_benchmarks")
      .select("*");

    if (platform) {
      query = query.eq("platform", platform);
      console.log(`📊 Fetching benchmarks for platform: ${platform}`);
    }

    if (industry) {
      query = query.ilike("industry", industry);
      console.log(`📊 Fetching benchmarks filtered by industry (case-insensitive): ${industry}`);
    } else {
      console.log(`⚠️ No industry provided - benchmarks will not be used (hard requirement)`);
      return new Map();
    }

    if (dateRange?.startDate) {
      const startISO = dateRange.startDate.length === 7 ? `${dateRange.startDate}-01` : dateRange.startDate;
      query = query.gte("date_range_start", startISO);
      console.log(`📊 Benchmark date filter: start >= ${startISO}`);
    }
    if (dateRange?.endDate) {
      const [y, m] = dateRange.endDate.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const endISO = `${dateRange.endDate}-${String(lastDay).padStart(2, "0")}`;
      query = query.lte("date_range_end", endISO);
      console.log(`📊 Benchmark date filter: end <= ${endISO}`);
    }

    const { data, error } = await query.order("date_range_end", { ascending: false });

    if (error) {
      console.error("Error fetching benchmarks:", error);
      return new Map();
    }

    const benchmarkMap = new Map<string, BenchmarkData>();

    for (const item of data || []) {
      const normalizedPlatform = (item.platform || "meta").toLowerCase();
      const normalizedMarket = item.market?.toUpperCase() || "";
      const normalizedGoal = item.optimization_goal?.toUpperCase() || "";
      const key = `${normalizedPlatform}_${normalizedMarket}_${normalizedGoal}`;
      const existing = benchmarkMap.get(key);

      if (!existing) {
        benchmarkMap.set(key, {
          ...(item as BenchmarkData),
          platform: normalizedPlatform,
          total_spend: Number(item.total_spend || 0),
          total_results: Number(item.total_results || 0),
          impressions: Number(item.impressions || 0),
          clicks: Number(item.clicks || 0),
          link_clicks: Number(item.link_clicks || 0),
          landing_page_views: Number(item.landing_page_views || 0),
          revenue: Number(item.revenue || 0),
          campaign_count: Number(item.campaign_count || 0),
          avg_cost_per_result: Number(item.total_results || 0) > 0
            ? Number(item.total_spend || 0) / Number(item.total_results || 0)
            : item.avg_cost_per_result,
        });
        continue;
      }

      existing.total_spend += Number(item.total_spend || 0);
      existing.total_results += Number(item.total_results || 0);
      existing.impressions += Number(item.impressions || 0);
      existing.clicks += Number(item.clicks || 0);
      existing.link_clicks += Number(item.link_clicks || 0);
      existing.landing_page_views += Number(item.landing_page_views || 0);
      existing.revenue += Number(item.revenue || 0);
      existing.campaign_count += Number(item.campaign_count || 0);
      existing.date_range_start = existing.date_range_start && item.date_range_start
        ? (existing.date_range_start < item.date_range_start ? existing.date_range_start : item.date_range_start)
        : existing.date_range_start || item.date_range_start;
      existing.date_range_end = existing.date_range_end && item.date_range_end
        ? (existing.date_range_end > item.date_range_end ? existing.date_range_end : item.date_range_end)
        : existing.date_range_end || item.date_range_end;
      existing.avg_cost_per_result = existing.total_results > 0
        ? existing.total_spend / existing.total_results
        : existing.avg_cost_per_result;
    }

    benchmarkMap.forEach((item, key) => {
      console.log(`  📌 Benchmark loaded: ${key} → CPR: $${item.avg_cost_per_result?.toFixed(2) || "N/A"}`);
    });

    console.log(`✅ Loaded ${benchmarkMap.size} benchmarks for industry: ${industry}${platform ? `, platform: ${platform}` : ''}`);

    return benchmarkMap;
  } catch (error) {
    console.error("Error fetching all benchmarks:", error);
    return new Map();
  }
}

/**
 * Looks up a benchmark from a pre-loaded map, trying normalized goal names
 */
export function lookupBenchmark(
  benchmarks: Map<string, BenchmarkData>,
  platform: string,
  market: string,
  optimizationGoal: string
): BenchmarkData | undefined {
  const platformKey = platform.toLowerCase();
  const marketKey = market.toUpperCase();
  const goalKey = optimizationGoal.toUpperCase();
  
  // Try direct lookup
  const directKey = `${platformKey}_${marketKey}_${goalKey}`;
  let benchmark = benchmarks.get(directKey);
  if (benchmark) return benchmark;
  
  // Try normalized goal
  const normalizedGoal = normalizeBenchmarkGoal(optimizationGoal, platformKey);
  if (normalizedGoal !== goalKey) {
    const normalizedKey = `${platformKey}_${marketKey}_${normalizedGoal}`;
    benchmark = benchmarks.get(normalizedKey);
    if (benchmark) return benchmark;
  }
  
  // Try CLICK as fallback for traffic-related goals
  if (['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'TRAFFIC_LANDING_PAGE_VIEW', 'LANDING_PAGE_VIEW'].includes(goalKey)) {
    const clickKey = `${platformKey}_${marketKey}_CLICK`;
    benchmark = benchmarks.get(clickKey);
    if (benchmark) return benchmark;
  }
  
  return undefined;
}

/**
 * Revenue-based optimization goals where ROAS is the primary metric
 */
const REVENUE_BASED_GOALS = new Set([
  'PURCHASE', 'OFFSITE_CONVERSIONS', 'VALUE_OPTIMIZATION', 'VALUE',
  'SHOPPING_CONVERSIONS', 'PMAX_CONVERSIONS', 'CATALOG_SALES',
  'COMPLETE_PAYMENT', 'ON_WEB_ORDER', 'OMNI_PURCHASE',
]);

/**
 * Check if an optimization goal is revenue/ROAS-based
 */
export function isRevenueBasedGoal(optimizationGoal: string): boolean {
  return REVENUE_BASED_GOALS.has(optimizationGoal.toUpperCase());
}

/**
 * Calculates cost per result using benchmark if available, otherwise uses estimation
 */
export async function calculateCostPerResultWithBenchmark(
  market: string,
  optimizationGoal: string,
  industry: string | null | undefined,
  budget: number,
  fallbackResult: number,
  platform?: string
): Promise<[number, number, boolean]> {
  const benchmarkCPR = await getBenchmarkCostPerResult(market, optimizationGoal, industry, platform);
  
  if (benchmarkCPR && benchmarkCPR > 0) {
    const result = budget / benchmarkCPR;
    return [benchmarkCPR, result, true];
  }
  
  const costPerResult = fallbackResult > 0 ? budget / fallbackResult : 0;
  return [costPerResult, fallbackResult, false];
}
