// Subscription tier configuration with Stripe product IDs
// Based on billing/stripe-yearly-pricing-created memory

export type SubscriptionTier = "trial" | "basic" | "freelancer" | "enterprise" | "agency";

export const PRICE_IDS = {
  basic: {
    monthly: "price_1SydZ7KrTGU4P754jqI2guPI",
    yearly: "price_1SydZEKrTGU4P754aNJHK8pc",
    productId: "prod_TwWcmKdhIOpj2s", // ActiPlan Basic Monthly product
    yearlyProductId: "prod_TwWcQkm8fqfqaO", // ActiPlan Basic Yearly product
  },
  freelancer: {
    monthly: "price_1SydVjKrTGU4P754mZJJWvAq",
    yearly: "price_1SydVuKrTGU4P754zRmad5iJ",
    productId: "prod_TwWYJSunEeVqiq", // ActiPlan Freelancer
    yearlyProductId: "prod_TwWZOkeoiYb7F4", // ActiPlan Freelancer Yearly
  },
  enterprise: {
    monthly: "price_1SydW1KrTGU4P754aeyvSJP8",
    yearly: "price_1SydW3KrTGU4P754G3iA7VZM",
    productId: "prod_TwWZ9ID4ZXtZDA", // ActiPlan Enterprise
    yearlyProductId: "prod_TwWZVDvQQ5cYE7", // ActiPlan Enterprise Yearly
  },
  agency: {
    monthly: "price_1SydW5KrTGU4P754vsPg9hWw",
    yearly: "price_1SydW8KrTGU4P754AEitLX2A",
    productId: "prod_TwWZww84JxfY9y", // ActiPlan Agency
    yearlyProductId: "prod_TwWZDJv1p9us5v", // ActiPlan Agency Yearly
  },
} as const;

// Legacy price IDs that should still map to their respective tiers
// These are older prices created before the USD-standardized pricing was introduced
export const LEGACY_PRICE_IDS: Record<string, SubscriptionTier> = {
  "price_1ScnOeKrTGU4P75446dvndr3": "agency", // Legacy ActiPlan Agency Monthly ($999 USD)
  "price_1ScnObKrTGU4P754AAJ9Q5NU": "basic", // Previous Basic Monthly
  "price_1ScnL9KrTGU4P754QirsF0Sd": "basic", // Previous Basic Yearly
  "price_1SyblZKrTGU4P754e0GfARV4": "freelancer", // Previous Freelancer Monthly
  "price_1SyblbKrTGU4P754Otu9dcxm": "freelancer", // Previous Freelancer Yearly
  "price_1SyblcKrTGU4P754HYOgkuIQ": "enterprise", // Previous Enterprise Monthly
  "price_1SybldKrTGU4P754EBnjjPos": "enterprise", // Previous Enterprise Yearly
  "price_1SyblfKrTGU4P754gwTKmrsC": "agency", // Previous Agency Monthly
  "price_1SyblfKrTGU4P754PtKbziMk": "agency", // Previous Agency Yearly
};

export const LEGACY_PRODUCT_IDS: Record<string, SubscriptionTier> = {
  "prod_TZxJAdnaSLNRsJ": "agency", // Legacy ActiPlan Agency Monthly
  "prod_TZxJsj5K3hZ8Ku": "basic", // Previous Basic product
  "prod_TwUlLQvTFz0efa": "freelancer", // Previous Freelancer product
  "prod_TwUlg5cv5lkldX": "enterprise", // Previous Enterprise product
  "prod_TwUlIMDiwjhsq6": "agency", // Previous Agency product
};

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

  // Check legacy price IDs
  if (LEGACY_PRICE_IDS[priceId]) {
    return LEGACY_PRICE_IDS[priceId];
  }

  // Default to trial if price ID not recognized
  return "trial";
}

// Map product IDs to tiers (fallback)
export function getTierFromProductId(productId: string | null): SubscriptionTier {
  if (!productId) return "trial";

  for (const [tier, config] of Object.entries(PRICE_IDS)) {
    if (config.productId === productId || config.yearlyProductId === productId) {
      return tier as SubscriptionTier;
    }
  }

  // Check legacy product IDs
  if (LEGACY_PRODUCT_IDS[productId]) {
    return LEGACY_PRODUCT_IDS[productId];
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

// Daily ActiPlan limits per tier (DSP pushes per day)
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
  enterprise: 150,
  agency: 300,
};

// Monthly swap limits per tier per platform
export const SWAP_LIMITS: Record<SubscriptionTier, number> = {
  trial: 1,
  basic: 1,
  freelancer: 3,
  enterprise: 3,
  agency: 6,
};

// OAuth connection limits per tier per platform (number of users who can connect)
export const OAUTH_CONNECTION_LIMITS: Record<SubscriptionTier, number> = {
  trial: 1,
  basic: 1,
  freelancer: 1,
  enterprise: 3,
  agency: 6,
};

/** Max teams per billing workspace (default team + additional teams). Enforced in UI; DB stores workspace_id on teams. */
export const MAX_TEAMS_PER_WORKSPACE: Record<SubscriptionTier, number> = {
  trial: 1,
  basic: 1,
  freelancer: 2,
  enterprise: 5,
  agency: 25,
};

export function getMaxTeamsForTier(tier: SubscriptionTier): number {
  return MAX_TEAMS_PER_WORKSPACE[tier] ?? 1;
}

// Team member limits per tier (total team size = owners + admins + members)
export const TEAM_MEMBER_LIMITS: Record<SubscriptionTier, { owners: number; admins: number; members: number }> = {
  trial: { owners: 1, admins: 0, members: 0 },
  basic: { owners: 1, admins: 0, members: 0 },
  freelancer: { owners: 1, admins: 0, members: 0 },
  enterprise: { owners: 1, admins: 1, members: 3 }, // 5 total
  agency: { owners: 1, admins: 2, members: 7 }, // 10 total
};

// Tier display names
export const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  trial: "Trial",
  basic: "Basic",
  freelancer: "Freelancer",
  enterprise: "Enterprise",
  agency: "Agency",
};
