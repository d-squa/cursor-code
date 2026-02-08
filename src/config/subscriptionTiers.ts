// Subscription tier configuration with Stripe product IDs
// Based on billing/stripe-yearly-pricing-created memory

export type SubscriptionTier = "trial" | "basic" | "freelancer" | "enterprise" | "agency";

export const PRICE_IDS = {
  basic: {
    monthly: "price_1ScnObKrTGU4P754AAJ9Q5NU",
    yearly: "price_1ScnL9KrTGU4P754QirsF0Sd",
    productId: "prod_TZxJsj5K3hZ8Ku", // ActiPlan Basic Monthly
  },
  freelancer: {
    monthly: "price_1SyXF5KrTGU4P7548Gb4bgd6",
    yearly: "price_1SyXYDKrTGU4P75427F7A2ge",
    productId: "prod_TZxJ4XAvny2Nnl", // ActiPlan Freelancer Monthly
  },
  enterprise: {
    monthly: "price_1SyX3xKrTGU4P754lgSWx7dq",
    yearly: "price_1SyX8xKrTGU4P754mXynM6Qn",
    productId: "prod_TZxJTdbXy2Rlhb", // ActiPlan Enterprise Monthly
  },
  agency: {
    monthly: "price_1SyXAnKrTGU4P754hsNny2H7",
    yearly: "price_1SyXD1KrTGU4P7541vWVImFY",
    productId: "prod_TZxJAdnaSLNRsJ", // ActiPlan Agency Monthly
  },
} as const;

// Get billing period from price ID
export function getBillingPeriodFromPriceId(priceId: string | null): "monthly" | "yearly" | null {
  if (!priceId) return null;

  for (const config of Object.values(PRICE_IDS)) {
    if (config.monthly === priceId) return "monthly";
    if (config.yearly === priceId) return "yearly";
  }

  return null;
}

// Map price IDs to tiers (more reliable than product IDs)
export function getTierFromPriceId(priceId: string | null): SubscriptionTier {
  if (!priceId) return "trial";

  for (const [tier, config] of Object.entries(PRICE_IDS)) {
    if (config.monthly === priceId || config.yearly === priceId) {
      return tier as SubscriptionTier;
    }
  }

  // Default to trial if price ID not recognized
  return "trial";
}

// Map product IDs to tiers (fallback)
export function getTierFromProductId(productId: string | null): SubscriptionTier {
  if (!productId) return "trial";

  for (const [tier, config] of Object.entries(PRICE_IDS)) {
    if (config.productId === productId) {
      return tier as SubscriptionTier;
    }
  }

  // Default to trial if product ID not recognized
  return "trial";
}

// Tier hierarchy for comparison (higher number = more features)
export const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  trial: 0,
  basic: 1,
  freelancer: 2,
  enterprise: 3,
  agency: 4,
};

// Check if a tier has access to another tier's features
export function tierHasAccess(userTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
  return TIER_HIERARCHY[userTier] >= TIER_HIERARCHY[requiredTier];
}

// Daily ActiPlan limits per tier
export const ACTIPLAN_DAILY_LIMITS: Record<SubscriptionTier, number> = {
  trial: 1,
  basic: 1,
  freelancer: 2,
  enterprise: 5,
  agency: Infinity,
};

// Ad account limits per tier per platform
export const AD_ACCOUNT_LIMITS: Record<SubscriptionTier, number> = {
  trial: 1,
  basic: 1,
  freelancer: 3,
  enterprise: 30,
  agency: Infinity,
};

// Monthly swap limits per tier per platform
export const SWAP_LIMITS: Record<SubscriptionTier, number> = {
  trial: 1,
  basic: 1,
  freelancer: 1,
  enterprise: 3,
  agency: Infinity,
};

// Team member limits per tier
export const TEAM_MEMBER_LIMITS: Record<SubscriptionTier, { owners: number; admins: number; members: number }> = {
  trial: { owners: 1, admins: 0, members: 0 },
  basic: { owners: 1, admins: 0, members: 0 },
  freelancer: { owners: 1, admins: 0, members: 0 },
  enterprise: { owners: 1, admins: 0, members: 4 },
  agency: { owners: 1, admins: 1, members: 8 },
};

// Tier display names
export const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  trial: "Trial",
  basic: "Basic",
  freelancer: "Freelancer",
  enterprise: "Enterprise",
  agency: "Agency",
};
