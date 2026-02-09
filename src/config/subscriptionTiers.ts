// Subscription tier configuration with Stripe product IDs
// Based on billing/stripe-yearly-pricing-created memory

export type SubscriptionTier = "trial" | "basic" | "freelancer" | "enterprise" | "agency";

export const PRICE_IDS = {
  basic: {
    monthly: "price_1ScnObKrTGU4P754AAJ9Q5NU",
    yearly: "price_1ScnL9KrTGU4P754QirsF0Sd",
    productId: "prod_TZxJsj5K3hZ8Ku", // ActiPlan Basic
  },
  freelancer: {
    monthly: "price_1SyblZKrTGU4P754e0GfARV4",
    yearly: "price_1SyblbKrTGU4P754Otu9dcxm",
    productId: "prod_TwUlLQvTFz0efa", // ActiPlan Freelancer (USD)
  },
  enterprise: {
    monthly: "price_1SyblcKrTGU4P754HYOgkuIQ",
    yearly: "price_1SybldKrTGU4P754EBnjjPos",
    productId: "prod_TwUlg5cv5lkldX", // ActiPlan Enterprise (USD)
  },
  agency: {
    monthly: "price_1SyblfKrTGU4P754gwTKmrsC",
    yearly: "price_1SyblfKrTGU4P754PtKbziMk",
    productId: "prod_TwUlIMDiwjhsq6", // ActiPlan Agency (USD)
  },
} as const;

// Legacy price IDs that should still map to their respective tiers
// These are older prices created before the USD-standardized pricing was introduced
export const LEGACY_PRICE_IDS: Record<string, SubscriptionTier> = {
  "price_1ScnOeKrTGU4P75446dvndr3": "agency", // Legacy ActiPlan Agency Monthly ($999 USD)
};

export const LEGACY_PRODUCT_IDS: Record<string, SubscriptionTier> = {
  "prod_TZxJAdnaSLNRsJ": "agency", // Legacy ActiPlan Agency Monthly
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
    if (config.productId === productId) {
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
