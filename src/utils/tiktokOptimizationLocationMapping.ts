/**
 * TikTok Objective → Optimization Goal → Optimization Location Mapping
 * Based on the official TikTok advertising matrix
 * 
 * Rules:
 * - Some objectives don't support optimization location (N/A)
 * - Some objectives support only specific locations
 * - Some optimization goals within an objective determine the valid locations
 */

export interface TikTokLocationConfig {
  value: string;
  label: string;
  requiresPixel?: boolean;
  requiresApp?: boolean;
  requiresMessaging?: boolean;
  requiresInstantForm?: boolean;
}

export interface TikTokOptimizationLocationMapping {
  objective: string;
  optimizationGoal: string;
  locations: TikTokLocationConfig[];
}

// Complete mapping based on the advertising matrix
export const TIKTOK_OPTIMIZATION_LOCATION_MATRIX: TikTokOptimizationLocationMapping[] = [
  // AWARENESS - NO OPTIMIZATION LOCATION (N/A)
  {
    objective: "REACH",
    optimizationGoal: "REACH",
    locations: [] // N/A - no optimization location for REACH
  },

  // TRAFFIC - Website, App, TikTok Shop only
  {
    objective: "TRAFFIC",
    optimizationGoal: "CLICK",
    locations: [
      { value: "Website", label: "Website" },
      { value: "App", label: "App", requiresApp: true },
      { value: "TikTok Shop", label: "TikTok Shop" },
    ]
  },
  {
    objective: "TRAFFIC",
    optimizationGoal: "LANDING_PAGE_VIEW",
    locations: [
      { value: "Website", label: "Website" },
    ]
  },
  {
    objective: "TRAFFIC",
    optimizationGoal: "ENGAGED_SESSION",
    locations: [
      { value: "Website", label: "Website" },
    ]
  },

  // VIDEO VIEWS - NO OPTIMIZATION LOCATION (N/A)
  {
    objective: "VIDEO_VIEWS",
    optimizationGoal: "VIDEO_VIEW",
    locations: []
  },
  {
    objective: "VIDEO_VIEWS",
    optimizationGoal: "FOCUSED_VIEW",
    locations: []
  },
  {
    objective: "VIDEO_VIEWS",
    optimizationGoal: "6S_VIDEO_VIEW",
    locations: []
  },
  {
    objective: "VIDEO_VIEWS",
    optimizationGoal: "15S_VIDEO_VIEW",
    locations: []
  },

  // COMMUNITY INTERACTION - NO OPTIMIZATION LOCATION (N/A)
  {
    objective: "COMMUNITY_INTERACTION",
    optimizationGoal: "PROFILE_VISIT",
    locations: []
  },
  {
    objective: "COMMUNITY_INTERACTION",
    optimizationGoal: "FOLLOW",
    locations: []
  },

  // APP PROMOTION - App only
  {
    objective: "APP_PROMOTION",
    optimizationGoal: "CLICK",
    locations: [
      { value: "App", label: "App", requiresApp: true },
    ]
  },
  {
    objective: "APP_PROMOTION",
    optimizationGoal: "APP_INSTALL",
    locations: [
      { value: "App", label: "App", requiresApp: true },
    ]
  },
  {
    objective: "APP_PROMOTION",
    optimizationGoal: "APP_EVENT",
    locations: [
      { value: "App", label: "App", requiresApp: true },
    ]
  },

  // LEAD GENERATION - Multiple locations based on optimization goal
  {
    objective: "LEAD_GENERATION",
    optimizationGoal: "CLICK",
    locations: [
      { value: "Website", label: "Website" },
      { value: "TikTok Direct Messages", label: "TikTok Direct Messages", requiresMessaging: true },
      { value: "Instant Messaging Apps", label: "Instant Messaging Apps", requiresMessaging: true },
      { value: "Phone Call", label: "Phone Call" },
    ]
  },
  {
    objective: "LEAD_GENERATION",
    optimizationGoal: "CONVERT",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
    ]
  },
  {
    objective: "LEAD_GENERATION",
    optimizationGoal: "CONVERSION",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
    ]
  },
  {
    objective: "LEAD_GENERATION",
    optimizationGoal: "FORM",
    locations: [
      { value: "Instant Form", label: "Instant Form", requiresInstantForm: true },
    ]
  },
  {
    objective: "LEAD_GENERATION",
    optimizationGoal: "LEAD",
    locations: [
      { value: "Instant Form", label: "Instant Form", requiresInstantForm: true },
    ]
  },
  {
    objective: "LEAD_GENERATION",
    optimizationGoal: "CONVERSATION",
    locations: [
      { value: "TikTok Direct Messages", label: "TikTok Direct Messages", requiresMessaging: true },
      { value: "Instant Messaging Apps", label: "Instant Messaging Apps", requiresMessaging: true },
    ]
  },
  {
    objective: "LEAD_GENERATION",
    optimizationGoal: "MESSAGING",
    locations: [
      { value: "TikTok Direct Messages", label: "TikTok Direct Messages", requiresMessaging: true },
      { value: "Instant Messaging Apps", label: "Instant Messaging Apps", requiresMessaging: true },
    ]
  },
  {
    objective: "LEAD_GENERATION",
    optimizationGoal: "PHONE_CALL",
    locations: [
      { value: "Phone Call", label: "Phone Call" },
    ]
  },

  // SALES/CONVERSIONS - Website, TikTok Instant Page, App, Website & App
  {
    objective: "CONVERSIONS",
    optimizationGoal: "VALUE",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
      { value: "TikTok Instant Page", label: "TikTok Instant Page", requiresPixel: true },
      { value: "Website & App", label: "Website & App", requiresPixel: true, requiresApp: true },
    ]
  },
  {
    objective: "CONVERSIONS",
    optimizationGoal: "CONVERT",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
      { value: "TikTok Instant Page", label: "TikTok Instant Page", requiresPixel: true },
      { value: "Website & App", label: "Website & App", requiresPixel: true, requiresApp: true },
    ]
  },
  {
    objective: "CONVERSIONS",
    optimizationGoal: "CONVERSION",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
      { value: "TikTok Instant Page", label: "TikTok Instant Page", requiresPixel: true },
      { value: "Website & App", label: "Website & App", requiresPixel: true, requiresApp: true },
    ]
  },
  {
    objective: "CONVERSIONS",
    optimizationGoal: "CLICK",
    locations: [
      { value: "Website", label: "Website" },
      { value: "App", label: "App", requiresApp: true },
    ]
  },
  {
    objective: "CONVERSIONS",
    optimizationGoal: "LANDING_PAGE_VIEW",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
    ]
  },
  {
    objective: "CONVERSIONS",
    optimizationGoal: "ENGAGED_SESSION",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
    ]
  },
  // SALES objective (alternative name for CONVERSIONS)
  {
    objective: "SALES",
    optimizationGoal: "VALUE",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
      { value: "TikTok Instant Page", label: "TikTok Instant Page", requiresPixel: true },
      { value: "Website & App", label: "Website & App", requiresPixel: true, requiresApp: true },
    ]
  },
  {
    objective: "SALES",
    optimizationGoal: "CONVERT",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
      { value: "TikTok Instant Page", label: "TikTok Instant Page", requiresPixel: true },
      { value: "Website & App", label: "Website & App", requiresPixel: true, requiresApp: true },
    ]
  },
  {
    objective: "SALES",
    optimizationGoal: "CONVERSION",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
      { value: "TikTok Instant Page", label: "TikTok Instant Page", requiresPixel: true },
      { value: "Website & App", label: "Website & App", requiresPixel: true, requiresApp: true },
    ]
  },
  {
    objective: "SALES",
    optimizationGoal: "CLICK",
    locations: [
      { value: "App", label: "App", requiresApp: true },
    ]
  },

  // PRODUCT SALES (Catalog)
  {
    objective: "PRODUCT_SALES",
    optimizationGoal: "CONVERT",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
    ]
  },
  {
    objective: "PRODUCT_SALES",
    optimizationGoal: "VALUE",
    locations: [
      { value: "Website", label: "Website", requiresPixel: true },
    ]
  },
];

/**
 * Get valid optimization locations for an objective/optimization goal combination
 */
export function getValidTikTokLocations(
  objective: string,
  optimizationGoal: string
): TikTokLocationConfig[] {
  const normalizedObjective = objective?.toUpperCase().replace(/\s+/g, '_') || '';
  const normalizedGoal = optimizationGoal?.toUpperCase().replace(/\s+/g, '_') || '';
  
  // Find exact match
  const match = TIKTOK_OPTIMIZATION_LOCATION_MATRIX.find(
    m => m.objective.toUpperCase() === normalizedObjective && 
         m.optimizationGoal.toUpperCase() === normalizedGoal
  );
  
  if (match) {
    return match.locations;
  }
  
  // Try to find by objective only (return all possible locations for that objective)
  const objectiveMatches = TIKTOK_OPTIMIZATION_LOCATION_MATRIX.filter(
    m => m.objective.toUpperCase() === normalizedObjective
  );
  
  if (objectiveMatches.length > 0) {
    // Combine unique locations from all matching entries
    const locationMap = new Map<string, TikTokLocationConfig>();
    objectiveMatches.forEach(m => {
      m.locations.forEach(loc => {
        if (!locationMap.has(loc.value)) {
          locationMap.set(loc.value, loc);
        }
      });
    });
    return Array.from(locationMap.values());
  }
  
  return [];
}

/**
 * Check if an objective requires optimization location selection
 */
export function objectiveRequiresLocation(objective: string): boolean {
  const normalizedObjective = objective?.toUpperCase().replace(/\s+/g, '_') || '';
  
  // Objectives that don't have optimization locations
  const noLocationObjectives = [
    'REACH',
    'VIDEO_VIEWS',
    'COMMUNITY_INTERACTION',
  ];
  
  return !noLocationObjectives.includes(normalizedObjective);
}

/**
 * Get the default location for an objective/goal combination
 */
export function getDefaultTikTokLocation(
  objective: string,
  optimizationGoal: string
): string | null {
  const locations = getValidTikTokLocations(objective, optimizationGoal);
  return locations.length > 0 ? locations[0].value : null;
}

/**
 * Validate if a location is valid for an objective/goal combination
 */
export function isValidTikTokLocation(
  objective: string,
  optimizationGoal: string,
  location: string
): boolean {
  const validLocations = getValidTikTokLocations(objective, optimizationGoal);
  return validLocations.some(loc => loc.value === location);
}

/**
 * Auto-correct invalid location selection
 * Returns null if location is valid, or the correct location if not
 */
export function autoCorrectTikTokLocation(
  objective: string,
  optimizationGoal: string,
  currentLocation: string | undefined
): string | null {
  // If objective doesn't require location, return null (should clear the field)
  if (!objectiveRequiresLocation(objective)) {
    return null;
  }
  
  const validLocations = getValidTikTokLocations(objective, optimizationGoal);
  
  // If no valid locations for this combination, return null
  if (validLocations.length === 0) {
    return null;
  }
  
  // If current location is valid, keep it
  if (currentLocation && validLocations.some(loc => loc.value === currentLocation)) {
    return currentLocation;
  }
  
  // Return the first valid location as default
  return validLocations[0].value;
}
