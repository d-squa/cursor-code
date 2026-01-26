import { supabase } from "@/integrations/supabase/client";

export interface BenchmarkData {
  market: string;
  optimization_goal: string;
  industry: string | null;
  avg_cost_per_result: number | null;
  total_spend: number;
  total_results: number;
  impressions: number;
  campaign_count: number;
}

/**
 * Fetches benchmark data for a specific market, optimization goal, and industry
 * All three conditions are HARD requirements - benchmark is only returned if all match
 * @param market - The market code (e.g., "US", "AE")
 * @param optimizationGoal - The optimization goal (e.g., "LINK_CLICKS", "THRUPLAY")
 * @param industry - The client's industry (e.g., "e-commerce", "finance")
 * @returns The benchmark cost per result or null if not available
 */
export async function getBenchmarkCostPerResult(
  market: string,
  optimizationGoal: string,
  industry?: string | null
): Promise<number | null> {
  try {
    let query = supabase
      .from("campaign_performance_benchmarks")
      .select("avg_cost_per_result")
      .ilike("market", market)
      .ilike("optimization_goal", optimizationGoal);
    
    // Industry is a HARD condition - only match if industry is provided and matches
    if (industry) {
      // Use case-insensitive matching for industry
      query = query.ilike("industry", industry);
    } else {
      // If no industry provided, we can't use benchmarks (hard requirement)
      console.log(`No industry provided, skipping benchmark for ${market}/${optimizationGoal}`);
      return null;
    }
    
    const { data, error } = await query
      .order("date_range_end", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.log(`No benchmark found for ${industry}/${market}/${optimizationGoal}`);
      return null;
    }

    return data?.avg_cost_per_result || null;
  } catch (error) {
    console.error("Error fetching benchmark:", error);
    return null;
  }
}

/**
 * Fetches all benchmarks for the current user, optionally filtered by industry
 * @param industry - If provided, only returns benchmarks matching this industry (HARD condition)
 * @returns Map of benchmarks keyed by "market_optimizationGoal"
 */
export async function getAllBenchmarks(industry?: string | null): Promise<Map<string, BenchmarkData>> {
  try {
    let query = supabase
      .from("campaign_performance_benchmarks")
      .select("*");
    
    // Industry is a HARD condition when provided
    if (industry) {
      // Use case-insensitive matching via ilike
      query = query.ilike("industry", industry);
      console.log(`📊 Fetching benchmarks filtered by industry (case-insensitive): ${industry}`);
    } else {
      console.log(`⚠️ No industry provided - benchmarks will not be used (hard requirement)`);
      return new Map(); // Return empty map if no industry - can't use benchmarks without it
    }
    
    const { data, error } = await query.order("date_range_end", { ascending: false });

    if (error) {
      console.error("Error fetching benchmarks:", error);
      return new Map();
    }

    const benchmarkMap = new Map<string, BenchmarkData>();
    
    // Group by market and optimization goal, keeping only the most recent
    // Use uppercase keys for case-insensitive lookup
    const seen = new Set<string>();
    for (const item of data || []) {
      // Normalize to uppercase for consistent lookup
      const normalizedMarket = item.market?.toUpperCase() || '';
      const normalizedGoal = item.optimization_goal?.toUpperCase() || '';
      const key = `${normalizedMarket}_${normalizedGoal}`;
      if (!seen.has(key)) {
        benchmarkMap.set(key, item as BenchmarkData);
        seen.add(key);
        console.log(`  📌 Benchmark loaded: ${key} → CPR: $${item.avg_cost_per_result?.toFixed(2)}`);
      }
    }
    
    console.log(`✅ Loaded ${benchmarkMap.size} benchmarks for industry: ${industry}`);

    return benchmarkMap;
  } catch (error) {
    console.error("Error fetching all benchmarks:", error);
    return new Map();
  }
}

/**
 * Calculates cost per result using benchmark if available, otherwise uses estimation
 * Benchmark is only used if all three conditions match: industry, market, optimization goal
 * @param market - The market code
 * @param optimizationGoal - The optimization goal
 * @param industry - The client's industry (HARD requirement for benchmark matching)
 * @param budget - The campaign budget
 * @param fallbackResult - Fallback result count if no benchmark available
 * @returns Tuple of [costPerResult, result, isBenchmark]
 */
export async function calculateCostPerResultWithBenchmark(
  market: string,
  optimizationGoal: string,
  industry: string | null | undefined,
  budget: number,
  fallbackResult: number
): Promise<[number, number, boolean]> {
  const benchmarkCPR = await getBenchmarkCostPerResult(market, optimizationGoal, industry);
  
  if (benchmarkCPR && benchmarkCPR > 0) {
    // Use benchmark data
    const result = budget / benchmarkCPR;
    return [benchmarkCPR, result, true];
  }
  
  // Use fallback estimation
  const costPerResult = fallbackResult > 0 ? budget / fallbackResult : 0;
  return [costPerResult, fallbackResult, false];
}
