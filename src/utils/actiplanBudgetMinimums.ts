import type { AdSetConfig, Phase } from "@/types/mediaplan";
import {
  getSearchStrategyGroups,
  getEffectiveSearchKeywords,
  isSearchPhaseLike,
} from "@/utils/searchStrategyCampaigns";

/** Minimum allocated budget (EUR) for activation total, DSP campaigns, and ad sets. */
export const ACTIPLAN_MIN_ENTITY_BUDGET_EUR = 50;

export type BudgetViolationLevel =
  | "activation"
  | "platform"
  | "market"
  | "phase"
  | "campaign"
  | "adset";

export interface BudgetViolation {
  level: BudgetViolationLevel;
  platformId?: string;
  platformName?: string;
  marketName?: string;
  phaseName?: string;
  campaignUnitName?: string;
  adSetName?: string;
  amountEur: number;
  minimumEur: number;
  fieldPath?: "step1" | "step3";
}

export interface ActiPlanBudgetValidationInput {
  totalBudgetEur: number;
  startDate?: string;
  endDate?: string;
  platforms: Array<{
    id: string;
    name: string;
    enabled?: boolean;
    budgetPercentage?: number;
    markets: Array<{
      id?: string;
      name: string;
      budgetPercentage?: number;
      phases?: Phase[];
      adSets?: AdSetConfig[];
    }>;
  }>;
  selectedKeywords?: Array<Record<string, unknown>>;
  defaultAdSetsPerPlatform?: Record<string, AdSetConfig[]>;
  /** When true, only platforms with enabled !== false are validated (step 3). */
  onlyEnabledPlatforms?: boolean;
  /** When true, skip platforms with empty id (step 1 selector rows). */
  skipEmptyPlatformIds?: boolean;
}

export function calculatePlatformBudgetEur(totalBudgetEur: number, platformBudgetPct: number): number {
  return (totalBudgetEur * (platformBudgetPct || 0)) / 100;
}

export function calculateMarketBudgetEur(
  totalBudgetEur: number,
  platformBudgetPct: number,
  marketBudgetPct: number,
): number {
  const platformBudget = calculatePlatformBudgetEur(totalBudgetEur, platformBudgetPct);
  return (platformBudget * (marketBudgetPct || 0)) / 100;
}

/** Minimum platform % so allocated EUR is at least the ActiPlan floor (0 when total is too small). */
export function minPlatformBudgetPercentage(totalBudgetEur: number, minimumEur = ACTIPLAN_MIN_ENTITY_BUDGET_EUR): number {
  if (!totalBudgetEur || totalBudgetEur <= 0) return 0;
  return Math.min(100, (minimumEur / totalBudgetEur) * 100);
}

export function calculatePhaseBudgetEur(marketBudgetEur: number, phaseBudgetPct: number): number {
  return (marketBudgetEur * (phaseBudgetPct || 0)) / 100;
}

export function calculateAdSetBudgetEur(parentBudgetEur: number, adSetBudgetPct: number): number {
  return (parentBudgetEur * (adSetBudgetPct || 0)) / 100;
}

function isBelowMinimum(amountEur: number, minimumEur = ACTIPLAN_MIN_ENTITY_BUDGET_EUR): boolean {
  return amountEur > 0 && amountEur < minimumEur;
}

function pushViolation(
  violations: BudgetViolation[],
  violation: Omit<BudgetViolation, "minimumEur"> & { minimumEur?: number },
) {
  violations.push({
    ...violation,
    minimumEur: violation.minimumEur ?? ACTIPLAN_MIN_ENTITY_BUDGET_EUR,
  });
}

function resolveEffectiveAdSets(
  phase: Phase,
  market: { adSets?: AdSetConfig[] },
  platformId: string,
  defaultAdSetsPerPlatform?: Record<string, AdSetConfig[]>,
): AdSetConfig[] | undefined {
  if (phase.adSets?.length) return phase.adSets;
  if (market.adSets?.length) return market.adSets;
  const defaults = defaultAdSetsPerPlatform?.[platformId];
  if (defaults?.length) return defaults;
  return undefined;
}

function getCampaignUnitsForPhase(params: {
  platformId: string;
  market: Record<string, unknown>;
  phase: Phase;
  phaseBudgetEur: number;
  selectedKeywords?: Array<Record<string, unknown>>;
}): Array<{ name: string; budgetEur: number }> {
  const phaseName = phase.name || "Default";
  const keywords = getEffectiveSearchKeywords({
    keywords: params.selectedKeywords as any,
    platformId: params.platformId,
    market: params.market,
    phase: phase as Record<string, unknown>,
  });

  if (isSearchPhaseLike({ platformId: params.platformId, phase: phase as Record<string, unknown> })) {
    const groups = getSearchStrategyGroups({
      keywords: keywords as any,
      platformId: params.platformId,
      market: params.market,
    });

    if (groups.length > 0) {
      return groups.map((group) => ({
        name: `${phaseName} - ${group.label}`,
        budgetEur: calculatePhaseBudgetEur(params.phaseBudgetEur, group.budgetPercentage),
      }));
    }
  }

  return [{ name: phaseName, budgetEur: params.phaseBudgetEur }];
}

export function validateActiPlanBudgets(input: ActiPlanBudgetValidationInput): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  const minimumEur = ACTIPLAN_MIN_ENTITY_BUDGET_EUR;
  const totalBudgetEur = Number(input.totalBudgetEur) || 0;

  if (totalBudgetEur > 0 && totalBudgetEur < minimumEur) {
    pushViolation(violations, {
      level: "activation",
      amountEur: totalBudgetEur,
      fieldPath: "step1",
    });
  }

  for (const platform of input.platforms) {
    if (input.skipEmptyPlatformIds && !platform.id) continue;
    if (input.onlyEnabledPlatforms && platform.enabled === false) continue;

    const platformPct = platform.budgetPercentage ?? 100;
    const platformBudgetEur = calculatePlatformBudgetEur(totalBudgetEur, platformPct);

    if (platform.id && platformPct > 0 && isBelowMinimum(platformBudgetEur)) {
      pushViolation(violations, {
        level: "platform",
        platformId: platform.id,
        platformName: platform.name,
        amountEur: platformBudgetEur,
        fieldPath: "step1",
      });
    }

    for (const market of platform.markets || []) {
      const marketBudgetEur = calculateMarketBudgetEur(
        totalBudgetEur,
        platformPct,
        market.budgetPercentage ?? 100,
      );
      const marketName = market.name;

      if (platform.id && marketBudgetEur > 0 && isBelowMinimum(marketBudgetEur)) {
        pushViolation(violations, {
          level: "market",
          platformId: platform.id,
          platformName: platform.name,
          marketName,
          amountEur: marketBudgetEur,
          fieldPath: "step1",
        });
      }

      const phases =
        market.phases && market.phases.length > 0
          ? market.phases
          : [{ id: "default", name: "Default", budgetPercentage: 100 } as Phase];

      for (const phase of phases) {
        const phaseBudgetEur = calculatePhaseBudgetEur(marketBudgetEur, phase.budgetPercentage ?? 100);
        const phaseName = phase.name || "Default";

        if (isBelowMinimum(phaseBudgetEur)) {
          pushViolation(violations, {
            level: "phase",
            platformId: platform.id,
            platformName: platform.name,
            marketName,
            phaseName,
            amountEur: phaseBudgetEur,
            fieldPath: "step3",
          });
        }

        const campaignUnits = getCampaignUnitsForPhase({
          platformId: platform.id,
          market: market as Record<string, unknown>,
          phase,
          phaseBudgetEur,
          selectedKeywords: input.selectedKeywords,
        });

        for (const unit of campaignUnits) {
          if (isBelowMinimum(unit.budgetEur)) {
            pushViolation(violations, {
              level: "campaign",
              platformId: platform.id,
              platformName: platform.name,
              marketName,
              phaseName,
              campaignUnitName: unit.name,
              amountEur: unit.budgetEur,
              fieldPath: "step3",
            });
          }

          const effectiveAdSets = resolveEffectiveAdSets(
            phase,
            market,
            platform.id,
            input.defaultAdSetsPerPlatform,
          );

          if (effectiveAdSets?.length) {
            for (const adSet of effectiveAdSets) {
              const adSetBudgetEur = calculateAdSetBudgetEur(
                unit.budgetEur,
                adSet.budgetPercentage || 100 / effectiveAdSets.length,
              );
              if (isBelowMinimum(adSetBudgetEur)) {
                pushViolation(violations, {
                  level: "adset",
                  platformId: platform.id,
                  platformName: platform.name,
                  marketName,
                  phaseName,
                  campaignUnitName: unit.name,
                  adSetName: adSet.name || "Ad Set",
                  amountEur: adSetBudgetEur,
                  fieldPath: "step3",
                });
              }
            }
          }
        }
      }
    }
  }

  return violations;
}

export function formatBudgetViolation(violation: BudgetViolation): string {
  const min = violation.minimumEur.toFixed(0);
  const amt = violation.amountEur.toFixed(2);

  switch (violation.level) {
    case "activation":
      return `Total activation budget must be at least €${min} (currently €${amt}).`;
    case "platform":
      return `${violation.platformName || "Platform"}: platform budget €${amt} is below the €${min} minimum. Increase its share or total budget.`;
    case "market":
      return `${violation.platformName || "Platform"} · ${violation.marketName}: market budget €${amt} is below the €${min} minimum.`;
    case "phase":
      return `${violation.platformName || "Platform"} · ${violation.marketName} · ${violation.phaseName}: phase budget €${amt} is below the €${min} minimum.`;
    case "campaign":
      return `${violation.platformName || "Platform"} · ${violation.marketName} · ${violation.campaignUnitName}: campaign budget €${amt} is below the €${min} minimum.`;
    case "adset":
      return `${violation.platformName || "Platform"} · ${violation.marketName} · ${violation.adSetName || "Ad set"}${violation.campaignUnitName ? ` (${violation.campaignUnitName})` : ""}: ad set budget €${amt} is below the €${min} minimum.`;
    default:
      return `Budget €${amt} is below the €${min} minimum.`;
  }
}

export function formatBudgetViolationsSummary(violations: BudgetViolation[], maxItems = 3): string {
  if (violations.length === 0) return "";
  const lines = violations.slice(0, maxItems).map(formatBudgetViolation);
  if (violations.length > maxItems) {
    lines.push(`…and ${violations.length - maxItems} more.`);
  }
  return lines.join("\n");
}

export function getActiPlanBudgetValidationInputFromEditorState(params: {
  totalBudget: string | number;
  startDate?: string;
  endDate?: string;
  platformsWithMarkets: ActiPlanBudgetValidationInput["platforms"];
  basicTargeting?: { selectedKeywords?: Array<Record<string, unknown>>; defaultAdSetsPerPlatform?: Record<string, AdSetConfig[]> };
  onlyEnabledPlatforms?: boolean;
  skipEmptyPlatformIds?: boolean;
}): ActiPlanBudgetValidationInput {
  return {
    totalBudgetEur: typeof params.totalBudget === "string" ? parseFloat(params.totalBudget) || 0 : params.totalBudget,
    startDate: params.startDate,
    endDate: params.endDate,
    platforms: params.platformsWithMarkets,
    selectedKeywords: params.basicTargeting?.selectedKeywords,
    defaultAdSetsPerPlatform: params.basicTargeting?.defaultAdSetsPerPlatform,
    onlyEnabledPlatforms: params.onlyEnabledPlatforms,
    skipEmptyPlatformIds: params.skipEmptyPlatformIds,
  };
}
