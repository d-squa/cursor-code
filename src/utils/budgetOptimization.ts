/**
 * Budget Optimization Engine
 * 
 * Analyzes forecast data across platforms for the same optimization goals
 * and recommends budget shifts from expensive to cheaper platforms.
 */

// Normalize optimization goal names across platforms for comparison
const GOAL_NORMALIZATION: Record<string, string> = {
  // Clicks / Traffic
  'LINK_CLICKS': 'CLICKS',
  'CLICK': 'CLICKS',
  'MAXIMIZE_CLICKS': 'CLICKS',
  'LANDING_PAGE_VIEWS': 'LANDING_PAGE_VIEWS',
  'TRAFFIC_LANDING_PAGE_VIEW': 'LANDING_PAGE_VIEWS',
  'LANDING_PAGE_VIEW': 'LANDING_PAGE_VIEWS',
  // Video Views
  'VIDEO_VIEWS': 'VIDEO_VIEWS',
  'THRUPLAY': 'VIDEO_VIEWS',
  'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS': 'VIDEO_VIEWS',
  'FOCUSED_VIEW': 'VIDEO_VIEWS',
  'ENGAGED_VIEW_FIFTEEN': 'VIDEO_VIEWS',
  'SIX_SECOND_VIDEO_VIEW': 'VIDEO_VIEWS',
  // Conversions
  'OFFSITE_CONVERSIONS': 'CONVERSIONS',
  'CONVERSION': 'CONVERSIONS',
  'CONVERSIONS': 'CONVERSIONS',
  'CONVERT': 'CONVERSIONS',
  'PMAX_CONVERSIONS': 'CONVERSIONS',
  'MAXIMIZE_CONVERSIONS': 'CONVERSIONS',
  'SEARCH_CLICKS': 'SEARCH_CLICKS',
  // Reach / Awareness
  'REACH': 'REACH',
  'IMPRESSIONS': 'IMPRESSIONS',
  // Leads
  'LEADS': 'LEADS',
  'LEAD_GENERATION': 'LEADS',
  'FORM': 'LEADS',
  // App Installs
  'APP_INSTALLS': 'APP_INSTALLS',
  'INSTALL': 'APP_INSTALLS',
  // Shopping / Catalog
  'CATALOG_SALES': 'CATALOG_SALES',
  'SHOPPING_CONVERSIONS': 'CATALOG_SALES',
  'COMPLETE_PAYMENT': 'CATALOG_SALES',
  'ON_WEB_ORDER': 'CATALOG_SALES',
};

const GOAL_DISPLAY_NAMES: Record<string, string> = {
  'CLICKS': 'Clicks / Traffic',
  'LANDING_PAGE_VIEWS': 'Landing Page Views',
  'VIDEO_VIEWS': 'Video Views',
  'CONVERSIONS': 'Conversions',
  'SEARCH_CLICKS': 'Search Clicks',
  'REACH': 'Reach',
  'IMPRESSIONS': 'Impressions',
  'LEADS': 'Leads',
  'APP_INSTALLS': 'App Installs',
  'CATALOG_SALES': 'Catalog / Shopping Sales',
};

function normalizeGoal(goal: string): string {
  return GOAL_NORMALIZATION[goal.toUpperCase()] || goal.toUpperCase();
}

export function getGoalDisplayName(normalizedGoal: string): string {
  return GOAL_DISPLAY_NAMES[normalizedGoal] || normalizedGoal;
}

export interface PhaseEntry {
  platformId: string;
  platformName: string;
  marketName: string;
  phaseName: string;
  optimizationGoal: string;
  normalizedGoal: string;
  budget: number;
  costPerResult: number;
  result: number;
}

export interface GoalRecommendation {
  normalizedGoal: string;
  displayName: string;
  totalBudget: number;
  entries: PhaseEntry[];
  // Old allocation
  oldByPlatform: Record<string, { budget: number; result: number; costPerResult: number }>;
  // New optimized allocation
  newByPlatform: Record<string, { budget: number; result: number; costPerResult: number }>;
  // Total results change
  oldTotalResult: number;
  newTotalResult: number;
  resultChangePercent: number;
}

export interface BudgetOptimizationResult {
  recommendations: GoalRecommendation[];
  // Platform-level summary
  platformSummary: Record<string, {
    platformName: string;
    oldBudget: number;
    newBudget: number;
    budgetChangePercent: number;
    oldResults: number;
    newResults: number;
    resultChangePercent: number;
  }>;
  // Totals
  totalOldResults: number;
  totalNewResults: number;
  totalResultChangePercent: number;
  hasRecommendations: boolean;
}

interface ActiplanForecastInput {
  platforms: Array<{
    platformId: string;
    platformName: string;
    markets: Array<{
      marketName: string;
      phases: Array<{
        phaseName: string;
        budget: number;
        optimizationGoal: string;
        costPerResult: number;
        result: number;
      }>;
      // If no phases, use resultsByGoal
      budget: number;
      resultsByGoal: Array<{
        goal: string;
        kpi: string;
        result: number;
        costPerResult: number;
      }>;
    }>;
  }>;
}

/**
 * Analyze the forecast and generate budget optimization recommendations.
 * Groups phases by normalized optimization goal across platforms,
 * then redistributes budget inversely proportional to CPR (cheaper gets more).
 */
export function analyzeBudgetOptimization(
  actiplanForecast: ActiplanForecastInput
): BudgetOptimizationResult {
  // Step 1: Extract all phase entries
  const allEntries: PhaseEntry[] = [];
  let skippedEntries = 0;
  // Track skipped budget per platform so total is conserved
  const skippedBudgetByPlatform = new Map<string, number>();

  for (const platform of actiplanForecast.platforms) {
    for (const market of platform.markets) {
      if (market.phases && market.phases.length > 0) {
        for (const phase of market.phases) {
          if (phase.costPerResult > 0 && phase.budget > 0) {
            allEntries.push({
              platformId: platform.platformId,
              platformName: platform.platformName,
              marketName: market.marketName,
              phaseName: phase.phaseName,
              optimizationGoal: phase.optimizationGoal,
              normalizedGoal: normalizeGoal(phase.optimizationGoal),
              budget: phase.budget,
              costPerResult: phase.costPerResult,
              result: phase.result,
            });
          } else {
            skippedEntries++;
            // Preserve skipped budget so totals stay correct
            const prev = skippedBudgetByPlatform.get(platform.platformId) || 0;
            skippedBudgetByPlatform.set(platform.platformId, prev + (phase.budget || 0));
            console.log(`💡 Budget opt: skipped phase ${phase.phaseName} (${platform.platformName}/${market.marketName}) - CPR=${phase.costPerResult}, budget=${phase.budget}`);
          }
        }
      } else if (market.resultsByGoal && market.resultsByGoal.length > 0) {
        for (const goalData of market.resultsByGoal) {
          if (goalData.costPerResult > 0 && market.budget > 0) {
            allEntries.push({
              platformId: platform.platformId,
              platformName: platform.platformName,
              marketName: market.marketName,
              phaseName: goalData.kpi,
              optimizationGoal: goalData.goal,
              normalizedGoal: normalizeGoal(goalData.goal),
              budget: market.budget,
              costPerResult: goalData.costPerResult,
              result: goalData.result,
            });
          } else {
            skippedEntries++;
            const prev = skippedBudgetByPlatform.get(platform.platformId) || 0;
            skippedBudgetByPlatform.set(platform.platformId, prev + (market.budget || 0));
          }
        }
      }
    }
  }

  console.log(`💡 Budget opt: ${allEntries.length} valid entries, ${skippedEntries} skipped`);
  allEntries.forEach(e => console.log(`  • ${e.platformName} / ${e.marketName} / ${e.phaseName}: goal=${e.optimizationGoal} → ${e.normalizedGoal}, CPR=$${e.costPerResult.toFixed(2)}, budget=$${e.budget.toFixed(0)}`));

  // Step 2: Group by normalized goal
  const goalGroups = new Map<string, PhaseEntry[]>();
  for (const entry of allEntries) {
    const group = goalGroups.get(entry.normalizedGoal) || [];
    group.push(entry);
    goalGroups.set(entry.normalizedGoal, group);
  }

  // Step 3: For each goal with multiple platforms, calculate optimal distribution
  const recommendations: GoalRecommendation[] = [];
  const platformOldBudgets = new Map<string, { name: string; budget: number; results: number }>();
  const platformNewBudgets = new Map<string, { name: string; budget: number; results: number }>();

  // Initialize platform totals from all entries
  for (const entry of allEntries) {
    const old = platformOldBudgets.get(entry.platformId) || { name: entry.platformName, budget: 0, results: 0 };
    old.budget += entry.budget;
    old.results += entry.result;
    platformOldBudgets.set(entry.platformId, old);

    if (!platformNewBudgets.has(entry.platformId)) {
      platformNewBudgets.set(entry.platformId, { name: entry.platformName, budget: 0, results: 0 });
    }
  }

  // Add skipped budgets to both old and new so totals are conserved
  for (const [platformId, skippedBudget] of skippedBudgetByPlatform) {
    const oldEntry = platformOldBudgets.get(platformId);
    if (oldEntry) {
      oldEntry.budget += skippedBudget;
    } else {
      const platformName = actiplanForecast.platforms.find(p => p.platformId === platformId)?.platformName || platformId;
      platformOldBudgets.set(platformId, { name: platformName, budget: skippedBudget, results: 0 });
    }
    const newEntry = platformNewBudgets.get(platformId);
    if (newEntry) {
      newEntry.budget += skippedBudget;
    } else {
      const platformName = actiplanForecast.platforms.find(p => p.platformId === platformId)?.platformName || platformId;
      platformNewBudgets.set(platformId, { name: platformName, budget: skippedBudget, results: 0 });
    }
  }

  for (const [normalizedGoal, entries] of goalGroups) {
    // Get unique platforms for this goal
    const platformIds = new Set(entries.map(e => e.platformId));
    
    if (platformIds.size < 2) {
      // Only one platform for this goal — no optimization possible, keep as-is
      for (const entry of entries) {
        const p = platformNewBudgets.get(entry.platformId)!;
        p.budget += entry.budget;
        p.results += entry.result;
      }
      continue;
    }

    // Calculate weighted average CPR per platform for this goal
    const platformCPR = new Map<string, { totalBudget: number; totalResult: number; weightedCPR: number; entries: PhaseEntry[] }>();
    
    for (const entry of entries) {
      const existing = platformCPR.get(entry.platformId) || { totalBudget: 0, totalResult: 0, weightedCPR: 0, entries: [] };
      existing.totalBudget += entry.budget;
      existing.totalResult += entry.result;
      existing.entries.push(entry);
      platformCPR.set(entry.platformId, existing);
    }

    // Calculate weighted CPR per platform
    for (const [, data] of platformCPR) {
      data.weightedCPR = data.totalResult > 0 ? data.totalBudget / data.totalResult : Infinity;
    }

    const totalGoalBudget = entries.reduce((sum, e) => sum + e.budget, 0);

    // Check if there's any meaningful difference (any difference per user request)
    const cprs = Array.from(platformCPR.values()).map(d => d.weightedCPR).filter(c => isFinite(c));
    if (cprs.length < 2) {
      for (const entry of entries) {
        const p = platformNewBudgets.get(entry.platformId)!;
        p.budget += entry.budget;
        p.results += entry.result;
      }
      continue;
    }

    const minCPR = Math.min(...cprs);
    const maxCPR = Math.max(...cprs);
    
    // Skip if CPRs are identical
    if (maxCPR - minCPR < 0.01) {
      for (const entry of entries) {
        const p = platformNewBudgets.get(entry.platformId)!;
        p.budget += entry.budget;
        p.results += entry.result;
      }
      continue;
    }

    // Redistribute: weight = 1/CPR (cheaper platform gets more budget)
    const platformWeights = new Map<string, number>();
    let totalWeight = 0;
    
    for (const [platformId, data] of platformCPR) {
      if (isFinite(data.weightedCPR) && data.weightedCPR > 0) {
        const weight = 1 / data.weightedCPR;
        platformWeights.set(platformId, weight);
        totalWeight += weight;
      }
    }

    // Build old and new allocation
    const oldByPlatform: Record<string, { budget: number; result: number; costPerResult: number }> = {};
    const newByPlatform: Record<string, { budget: number; result: number; costPerResult: number }> = {};
    let oldTotalResult = 0;
    let newTotalResult = 0;

    for (const [platformId, data] of platformCPR) {
      const platformName = data.entries[0].platformName;
      oldByPlatform[platformName] = {
        budget: data.totalBudget,
        result: data.totalResult,
        costPerResult: data.weightedCPR,
      };
      oldTotalResult += data.totalResult;

      // New allocation
      const weight = platformWeights.get(platformId) || 0;
      const newBudget = totalWeight > 0 ? totalGoalBudget * (weight / totalWeight) : data.totalBudget;
      const newResult = data.weightedCPR > 0 ? newBudget / data.weightedCPR : 0;

      newByPlatform[platformName] = {
        budget: newBudget,
        result: newResult,
        costPerResult: data.weightedCPR,
      };
      newTotalResult += newResult;

      // Update platform new totals
      const p = platformNewBudgets.get(platformId)!;
      p.budget += newBudget;
      p.results += newResult;
    }

    const resultChangePercent = oldTotalResult > 0
      ? ((newTotalResult - oldTotalResult) / oldTotalResult) * 100
      : 0;

    // Only add if there's an actual improvement
    if (resultChangePercent > 0.1) {
      recommendations.push({
        normalizedGoal,
        displayName: getGoalDisplayName(normalizedGoal),
        totalBudget: totalGoalBudget,
        entries,
        oldByPlatform,
        newByPlatform,
        oldTotalResult,
        newTotalResult,
        resultChangePercent,
      });
    } else {
      // No improvement, keep original budgets
      for (const [platformId, data] of platformCPR) {
        const p = platformNewBudgets.get(platformId)!;
        // Undo the optimized values and use originals
        p.budget = p.budget - (totalWeight > 0 ? totalGoalBudget * ((platformWeights.get(platformId) || 0) / totalWeight) : data.totalBudget) + data.totalBudget;
        p.results = p.results - (data.weightedCPR > 0 ? (totalWeight > 0 ? totalGoalBudget * ((platformWeights.get(platformId) || 0) / totalWeight) : data.totalBudget) / data.weightedCPR : 0) + data.totalResult;
      }
    }
  }

  // Build platform summary
  const platformSummary: BudgetOptimizationResult['platformSummary'] = {};
  
  for (const [platformId, oldData] of platformOldBudgets) {
    const newData = platformNewBudgets.get(platformId)!;
    platformSummary[platformId] = {
      platformName: oldData.name,
      oldBudget: oldData.budget,
      newBudget: newData.budget,
      budgetChangePercent: oldData.budget > 0 ? ((newData.budget - oldData.budget) / oldData.budget) * 100 : 0,
      oldResults: oldData.results,
      newResults: newData.results,
      resultChangePercent: oldData.results > 0 ? ((newData.results - oldData.results) / oldData.results) * 100 : 0,
    };
  }

  const totalOldResults = Array.from(platformOldBudgets.values()).reduce((s, d) => s + d.results, 0);
  const totalNewResults = Array.from(platformNewBudgets.values()).reduce((s, d) => s + d.results, 0);

  return {
    recommendations: recommendations.sort((a, b) => b.resultChangePercent - a.resultChangePercent),
    platformSummary,
    totalOldResults,
    totalNewResults,
    totalResultChangePercent: totalOldResults > 0 ? ((totalNewResults - totalOldResults) / totalOldResults) * 100 : 0,
    hasRecommendations: recommendations.length > 0,
  };
}

/**
 * Apply the budget optimization to the platforms array.
 * Returns a new platforms array with updated budget percentages.
 */
export function applyBudgetOptimization(
  platforms: Array<{
    id: string;
    name: string;
    enabled: boolean;
    budgetPercentage: number;
    markets: Array<{
      id: string;
      name: string;
      budgetPercentage: number;
      phases?: Array<{
        id: string;
        name: string;
        budgetPercentage: number;
        optimizationGoal?: string;
        [key: string]: any;
      }>;
      [key: string]: any;
    }>;
  }>,
  optimization: BudgetOptimizationResult,
  totalBudget: number
): typeof platforms {
  if (!optimization.hasRecommendations) return platforms;

  // Build a map of new platform budgets
  const newPlatformBudgets = new Map<string, number>();
  
  for (const [platformId, summary] of Object.entries(optimization.platformSummary)) {
    newPlatformBudgets.set(platformId, summary.newBudget);
  }

  // Calculate new platform budget percentages
  return platforms.map(platform => {
    const newBudget = newPlatformBudgets.get(platform.id);
    if (newBudget === undefined) return platform;

    const newPercentage = totalBudget > 0 ? (newBudget / totalBudget) * 100 : platform.budgetPercentage;

    // Now distribute the new platform budget across markets proportionally
    const oldPlatformBudget = totalBudget * (platform.budgetPercentage / 100);
    const budgetRatio = oldPlatformBudget > 0 ? newBudget / oldPlatformBudget : 1;

    // For markets, we need to adjust phase budgets based on optimization
    const newMarkets = platform.markets.map(market => {
      if (!market.phases || market.phases.length === 0) return market;

      // Check if any phases in this market were part of optimization
      const goalBudgetChanges = new Map<string, number>(); // normalizedGoal → ratio

      for (const rec of optimization.recommendations) {
        const platformName = platform.name;
        const oldPlatData = rec.oldByPlatform[platformName];
        const newPlatData = rec.newByPlatform[platformName];
        
        if (oldPlatData && newPlatData && oldPlatData.budget > 0) {
          goalBudgetChanges.set(rec.normalizedGoal, newPlatData.budget / oldPlatData.budget);
        }
      }

      if (goalBudgetChanges.size === 0) return market;

      // Adjust phase budgets
      const marketBudget = totalBudget * (platform.budgetPercentage / 100) * (market.budgetPercentage / 100);
      let newMarketBudget = 0;

      const adjustedPhases = market.phases.map(phase => {
        const ng = normalizeGoal(phase.optimizationGoal || '');
        const ratio = goalBudgetChanges.get(ng);
        const phaseBudget = marketBudget * (phase.budgetPercentage / 100);
        const newPhaseBudget = ratio !== undefined ? phaseBudget * ratio : phaseBudget;
        newMarketBudget += newPhaseBudget;
        return { ...phase, _newBudget: newPhaseBudget };
      });

      // Recalculate phase percentages relative to new market total
      if (newMarketBudget > 0) {
        const newPhases = adjustedPhases.map(phase => ({
          ...phase,
          budgetPercentage: (phase._newBudget / newMarketBudget) * 100,
          _newBudget: undefined,
        }));

        // Recalculate market percentage of the platform
        const newPlatformTotal = newBudget;
        const newMarketPercentage = newPlatformTotal > 0 ? (newMarketBudget / newPlatformTotal) * 100 : market.budgetPercentage;

        return { ...market, budgetPercentage: newMarketPercentage, phases: newPhases };
      }

      return market;
    });

    // Normalize market percentages to sum to 100
    const totalMarketPct = newMarkets.reduce((s, m) => s + m.budgetPercentage, 0);
    const normalizedMarkets = totalMarketPct > 0
      ? newMarkets.map(m => ({ ...m, budgetPercentage: (m.budgetPercentage / totalMarketPct) * 100 }))
      : newMarkets;

    return {
      ...platform,
      budgetPercentage: newPercentage,
      markets: normalizedMarkets,
    };
  });
}
