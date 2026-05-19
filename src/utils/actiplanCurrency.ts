/** ActiPlan uses USD as the single display and validation currency. */
export const ACTIPLAN_CURRENCY_CODE = "USD" as const;
export const ACTIPLAN_CURRENCY_SYMBOL = "$";

/** Minimum allocated budget (USD) for activation total, campaigns, and ad sets. */
export const ACTIPLAN_MIN_ENTITY_BUDGET = 50;

/** @deprecated Use {@link ACTIPLAN_MIN_ENTITY_BUDGET} — kept for existing imports. */
export const ACTIPLAN_MIN_ENTITY_BUDGET_EUR = ACTIPLAN_MIN_ENTITY_BUDGET;

export function formatActiPlanMoney(amount: number, decimals?: number): string {
  const resolvedDecimals =
    decimals ??
    (Number.isFinite(amount) && Math.abs(amount - Math.round(amount)) < 1e-9 ? 0 : 2);
  return `${ACTIPLAN_CURRENCY_SYMBOL}${amount.toLocaleString("en-US", {
    minimumFractionDigits: resolvedDecimals,
    maximumFractionDigits: resolvedDecimals,
  })}`;
}
