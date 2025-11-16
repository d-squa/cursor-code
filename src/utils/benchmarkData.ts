import { supabase } from "@/integrations/supabase/client";

export interface BenchmarkData {
  market: string;
  optimization_goal: string;
  avg_cost_per_result: number | null;
  total_spend: number;
  total_results: number;
  impressions: number;
  campaign_count: number;
}

/**
 * Fetches benchmark data for a specific market and optimization goal
 * @param market - The market code (e.g., "US", "AE")
 * @param optimizationGoal - The optimization goal (e.g., "LINK_CLICKS", "THRUPLAY")
 * @returns The benchmark cost per result or null if not available
 */
export async function getBenchmarkCostPerResult(
  market: string,
  optimizationGoal: string
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("campaign_performance_benchmarks")
      .select("avg_cost_per_result")
      .eq("market", market)
      .eq("optimization_goal", optimizationGoal)
      .order("date_range_end", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.log(`No benchmark found for ${market} / ${optimizationGoal}`);
      return null;
    }

    return data?.avg_cost_per_result || null;
  } catch (error) {
    console.error("Error fetching benchmark:", error);
    return null;
  }
}

/**
 * Fetches all benchmarks for the current user
 * @returns Map of benchmarks keyed by "market_optimizationGoal"
 */
export async function getAllBenchmarks(): Promise<Map<string, BenchmarkData>> {
  try {
    const { data, error } = await supabase
      .from("campaign_performance_benchmarks")
      .select("*")
      .order("date_range_end", { ascending: false });

    if (error) {
      console.error("Error fetching benchmarks:", error);
      return new Map();
    }

    const benchmarkMap = new Map<string, BenchmarkData>();
    
    // Group by market and optimization goal, keeping only the most recent
    const seen = new Set<string>();
    for (const item of data || []) {
      const key = `${item.market}_${item.optimization_goal}`;
      if (!seen.has(key)) {
        benchmarkMap.set(key, item as BenchmarkData);
        seen.add(key);
      }
    }

    return benchmarkMap;
  } catch (error) {
    console.error("Error fetching all benchmarks:", error);
    return new Map();
  }
}

/**
 * Calculates cost per result using benchmark if available, otherwise uses estimation
 * @param market - The market code
 * @param optimizationGoal - The optimization goal
 * @param budget - The campaign budget
 * @param fallbackResult - Fallback result count if no benchmark available
 * @returns Tuple of [costPerResult, result, isBenchmark]
 */
export async function calculateCostPerResultWithBenchmark(
  market: string,
  optimizationGoal: string,
  budget: number,
  fallbackResult: number
): Promise<[number, number, boolean]> {
  const benchmarkCPR = await getBenchmarkCostPerResult(market, optimizationGoal);
  
  if (benchmarkCPR && benchmarkCPR > 0) {
    // Use benchmark data
    const result = budget / benchmarkCPR;
    return [benchmarkCPR, result, true];
  }
  
  // Use fallback estimation
  const costPerResult = fallbackResult > 0 ? budget / fallbackResult : 0;
  return [costPerResult, fallbackResult, false];
}
