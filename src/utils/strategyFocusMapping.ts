/**
 * Maps ad formats and platform configuration to strategy focus
 */

export type StrategyFocus = "purchase" | "leads" | "app-installs" | "conversions" | "brand-awareness";

interface StrategyFocusInput {
  adFormats?: string[];
  hasPixel?: boolean;
  hasCatalog?: boolean;
}

/**
 * Determines the appropriate strategy focus based on ad formats and platform configuration
 */
export function determineStrategyFocus(input: StrategyFocusInput): StrategyFocus | undefined {
  const { adFormats = [], hasPixel = false, hasCatalog = false } = input;

  // Note: even if no ad formats are selected, we can still infer from pixel/catalog.
  // So we do NOT early-return here.


  // Priority 1: Check for specific ad formats that strongly indicate a focus
  const formatString = adFormats.join(" ").toLowerCase();

  // Lead generation formats
  if (
    formatString.includes("lead") ||
    formatString.includes("instant form") ||
    formatString.includes("lead gen")
  ) {
    return "leads";
  }

  // Dynamic ads or catalog-based formats indicate purchase focus
  if (
    formatString.includes("dynamic") ||
    formatString.includes("dpa") ||
    formatString.includes("product") ||
    formatString.includes("shopping") ||
    formatString.includes("catalog")
  ) {
    return "purchase";
  }

  // App install formats
  if (
    formatString.includes("app") ||
    formatString.includes("mobile app")
  ) {
    return "app-installs";
  }

  // Video and awareness formats
  if (
    formatString.includes("video views") ||
    formatString.includes("brand awareness") ||
    formatString.includes("reach") ||
    formatString.includes("video ads") ||
    formatString.includes("in-stream") ||
    formatString.includes("in-feed video") ||
    formatString.includes("story ads")
  ) {
    return "brand-awareness";
  }

  // Collection ads indicate purchase focus
  if (formatString.includes("collection")) {
    return "purchase";
  }

  // Priority 2: Check for pixel/catalog presence
  // If catalog is selected, it's likely purchase-focused
  if (hasCatalog) {
    return "purchase";
  }

  // If pixel is selected but no catalog, likely conversion-focused
  if (hasPixel) {
    return "conversions";
  }

  // Default: if we have formats but can't determine, use conversions
  return "conversions";
}

/**
 * Get recommended optimization goal based on strategy focus and platform
 */
export function getOptimizationGoalForFocus(
  focus: StrategyFocus,
  platformId: string,
  hasPixel: boolean = false
): string {
  const goalMapping: Record<string, Record<StrategyFocus, string>> = {
    meta: {
      purchase: hasPixel ? "Conversions" : "Link Clicks",
      leads: "Lead Generation",
      "app-installs": "App Installs",
      conversions: hasPixel ? "Conversions" : "Landing Page Views",
      "brand-awareness": "Impressions",
    },
    google: {
      purchase: "Conversions",
      leads: "Conversions",
      "app-installs": "App Installs",
      conversions: "Conversions",
      "brand-awareness": "Impressions",
    },
    linkedin: {
      purchase: "Conversions",
      leads: "Lead Generation",
      "app-installs": "Conversions",
      conversions: "Landing Page Actions",
      "brand-awareness": "Impressions",
    },
    tiktok: {
      purchase: "Conversion",
      leads: "Conversion",
      "app-installs": "App Installs",
      conversions: "Conversion",
      "brand-awareness": "Reach",
    },
    snapchat: {
      purchase: "Pixel Purchases",
      leads: "Swipes",
      "app-installs": "App Installs",
      conversions: "Pixel Purchases",
      "brand-awareness": "Impressions",
    },
    pinterest: {
      purchase: "Conversions",
      leads: "Conversions",
      "app-installs": "Conversions",
      conversions: "Conversions",
      "brand-awareness": "Awareness",
    },
  };

  return goalMapping[platformId]?.[focus] || "Conversions";
}
