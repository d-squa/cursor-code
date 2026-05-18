/** Shared minimum budget rules for launch validation and DSP push (EUR). */

import {
  buildSearchStrategyCampaigns,
  getEffectiveSearchKeywords,
  isSearchPhaseLike,
} from "./search-strategy-campaigns.ts";

export const ACTIPLAN_MIN_ENTITY_BUDGET_EUR = 50;

export interface ActiPlanPushBudgetError {
  platform: string;
  market: string;
  phase: string;
  message: string;
  fieldPath: string;
  blocking: true;
}

export function calculateMarketBudgetEur(
  totalBudgetEur: number,
  platformBudgetPct: number,
  marketBudgetPct: number,
): number {
  const platformBudget = (totalBudgetEur * (platformBudgetPct || 0)) / 100;
  return (platformBudget * (marketBudgetPct || 0)) / 100;
}

export function calculatePhaseBudgetEur(marketBudgetEur: number, phaseBudgetPct: number): number {
  return (marketBudgetEur * (phaseBudgetPct || 0)) / 100;
}

export function calculateAdSetBudgetEur(parentBudgetEur: number, adSetBudgetPct: number): number {
  return (parentBudgetEur * (adSetBudgetPct || 0)) / 100;
}

export function isBelowActiPlanMinimumBudget(amountEur: number): boolean {
  return amountEur > 0 && amountEur < ACTIPLAN_MIN_ENTITY_BUDGET_EUR;
}

export function formatMinimumBudgetMessage(
  entityLabel: string,
  amountEur: number,
  minimumEur = ACTIPLAN_MIN_ENTITY_BUDGET_EUR,
): string {
  return `${entityLabel} budget is €${amountEur.toFixed(2)}. Minimum allocated budget is €${minimumEur.toFixed(0)}. Increase total budget or allocation percentages.`;
}

function pushActiPlanError(
  errors: ActiPlanPushBudgetError[],
  params: Omit<ActiPlanPushBudgetError, "blocking">,
) {
  errors.push({ ...params, blocking: true });
}

function resolveEffectiveAdSets(
  phase: Record<string, unknown>,
  market: Record<string, unknown>,
  platformId: string,
  defaultAdSetsPerPlatform: Record<string, unknown[]>,
): unknown[] | undefined {
  const phaseAdSets = phase.adSets as unknown[] | undefined;
  if (phaseAdSets?.length) return phaseAdSets;
  const marketAdSets = market.adSets as unknown[] | undefined;
  if (marketAdSets?.length) return marketAdSets;
  const defaults = defaultAdSetsPerPlatform[platformId];
  if (Array.isArray(defaults) && defaults.length > 0) return defaults;
  return undefined;
}

/** Validates activation, phase, campaign unit, and ad set budgets before DSP push. */
export function validateActiPlanBudgetsForPush(
  campaign: Record<string, unknown>,
  platformId: string,
  platformName: string,
  platformBudgetPct: number,
  markets: Record<string, unknown>,
): ActiPlanPushBudgetError[] {
  const errors: ActiPlanPushBudgetError[] = [];
  const totalBudget = Number(campaign.total_budget) || 0;

  const genericConfig = (campaign.generic_config || {}) as Record<string, unknown>;
  const targetingPreset = (genericConfig.targetingPreset ||
    genericConfig.basicTargeting ||
    {}) as Record<string, unknown>;
  const selectedKeywords = Array.isArray(targetingPreset.selectedKeywords)
    ? targetingPreset.selectedKeywords
    : (Array.isArray(genericConfig.selectedKeywords) ? genericConfig.selectedKeywords : []);
  const defaultAdSetsPerPlatform = (genericConfig.defaultAdSetsPerPlatform ||
    {}) as Record<string, unknown[]>;

  for (const [marketCode, marketRaw] of Object.entries(markets)) {
    const market = marketRaw as Record<string, unknown>;
    const marketName = String(market.name || marketCode);
    const marketBudgetEur = calculateMarketBudgetEur(
      totalBudget,
      platformBudgetPct,
      Number(market.budgetPercentage) || 100,
    );
    const phases = (Array.isArray(market.phases) && market.phases.length > 0)
      ? market.phases as Record<string, unknown>[]
      : [{ name: "Default", budgetPercentage: 100 }];

    for (const phase of phases) {
      const phaseName = String(phase.name || "Default");
      const phaseBudgetEur = calculatePhaseBudgetEur(
        marketBudgetEur,
        Number(phase.budgetPercentage) || 100,
      );

      if (isBelowActiPlanMinimumBudget(phaseBudgetEur)) {
        pushActiPlanError(errors, {
          platform: platformName,
          market: marketName,
          phase: phaseName,
          message: formatMinimumBudgetMessage(`Phase "${phaseName}"`, phaseBudgetEur),
          fieldPath: "step3",
        });
      }

      const effectiveSearchKeywords = getEffectiveSearchKeywords({
        keywords: selectedKeywords as Record<string, unknown>[],
        platformId,
        market,
        phase,
      });

      const strategyCampaigns = isSearchPhaseLike({ platformId, phase })
        ? buildSearchStrategyCampaigns({
          keywords: effectiveSearchKeywords,
          platformId,
          market,
          phaseName,
          phaseBudget: phaseBudgetEur,
        })
        : [];

      const campaignUnits = strategyCampaigns.length > 0
        ? strategyCampaigns.map((unit) => ({
          name: unit.campaignName,
          budget: unit.budget,
        }))
        : [{ name: phaseName, budget: phaseBudgetEur }];

      for (const unit of campaignUnits) {
        if (isBelowActiPlanMinimumBudget(unit.budget)) {
          pushActiPlanError(errors, {
            platform: platformName,
            market: marketName,
            phase: phaseName,
            message: formatMinimumBudgetMessage(`Campaign "${unit.name}"`, unit.budget),
            fieldPath: "step3",
          });
        }

        const effectiveAdSets = resolveEffectiveAdSets(
          phase,
          market,
          platformId,
          defaultAdSetsPerPlatform,
        );

        if (effectiveAdSets?.length) {
          for (const adSetRaw of effectiveAdSets) {
            const adSet = adSetRaw as Record<string, unknown>;
            const adSetName = String(adSet.name || "Ad Set");
            const adSetBudgetPct = Number(adSet.budgetPercentage) ||
              (100 / effectiveAdSets.length);
            const adSetBudgetEur = calculateAdSetBudgetEur(unit.budget, adSetBudgetPct);

            if (isBelowActiPlanMinimumBudget(adSetBudgetEur)) {
              pushActiPlanError(errors, {
                platform: platformName,
                market: marketName,
                phase: phaseName,
                message: formatMinimumBudgetMessage(`Ad set "${adSetName}"`, adSetBudgetEur),
                fieldPath: "step3",
              });
            }
          }
        }
      }
    }
  }

  return errors;
}
