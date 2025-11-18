/**
 * Audience Type Decision Matrix
 * Maps platform phases to appropriate audience types based on objective and optimization goal
 */

export interface AudienceTypeMatrixEntry {
  platform: string;
  phase: "Awareness" | "Consideration" | "Conversion";
  source: string;
  features: string;
  type: "Custom Audience" | "Lookalike Audience" | "New Audience" | "Saved Audience";
  strategy: string;
}

export const AUDIENCE_TYPE_MATRIX: AudienceTypeMatrixEntry[] = [
  // Conversion Phase
  { platform: "Meta", phase: "Conversion", source: "App Activity", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Conversion", source: "Catalog", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Conversion", source: "Customer List", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Conversion", source: "Offline Activity", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Conversion", source: "Website", features: "", type: "Custom Audience", strategy: "Retarget" },
  
  // Consideration Phase
  { platform: "Meta", phase: "Consideration", source: "Events", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Consideration", source: "Facebook Page", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Consideration", source: "Instagram Account", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Consideration", source: "Instant Experience", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Consideration", source: "Lead Form", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Consideration", source: "Lookalikes", features: "", type: "Lookalike Audience", strategy: "Expand to new but similar audiences" },
  { platform: "Meta", phase: "Consideration", source: "On-Facebook Listings", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Consideration", source: "Shopping", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Consideration", source: "Video", features: "", type: "Custom Audience", strategy: "Retarget" },
  { platform: "Meta", phase: "Consideration", source: "App Activity", features: "", type: "Custom Audience", strategy: "Retarget" },
  
  // Awareness Phase
  { platform: "Meta", phase: "Awareness", source: "Native Audience", features: "Location", type: "New Audience", strategy: "Expand to new audiences" },
  { platform: "Meta", phase: "Awareness", source: "Native Audience", features: "Age", type: "New Audience", strategy: "Expand to new audiences" },
  { platform: "Meta", phase: "Awareness", source: "Native Audience", features: "Gender", type: "New Audience", strategy: "Expand to new audiences" },
  { platform: "Meta", phase: "Awareness", source: "Native Audience", features: "Demographics", type: "New Audience", strategy: "Expand to new audiences" },
  { platform: "Meta", phase: "Awareness", source: "Native Audience", features: "Interests", type: "New Audience", strategy: "Expand to new audiences" },
  { platform: "Meta", phase: "Awareness", source: "Native Audience", features: "Behaviors", type: "New Audience", strategy: "Expand to new audiences" },
  { platform: "Meta", phase: "Awareness", source: "Native Audience", features: "Language", type: "New Audience", strategy: "Expand to new audiences" },
  { platform: "Meta", phase: "Awareness", source: "Native Audience", features: "Audience Expansion", type: "New Audience", strategy: "Expand to new but more optimized" },
  { platform: "Meta", phase: "Awareness", source: "Saved Audience", features: "", type: "Saved Audience", strategy: "Expand to new audiences" },
];

/**
 * Get applicable audience types for a given phase
 */
export function getAudienceTypesForPhase(
  phase: string,
  platform: string = "Meta"
): AudienceTypeMatrixEntry[] {
  const normalizedPhase = normalizePhaseToMatrix(phase);
  return AUDIENCE_TYPE_MATRIX.filter(
    entry => entry.platform === platform && entry.phase === normalizedPhase
  );
}

/**
 * Normalize phase names to match matrix categories
 */
function normalizePhaseToMatrix(phaseName: string): "Awareness" | "Consideration" | "Conversion" {
  const lower = phaseName.toLowerCase();
  
  if (lower.includes("awareness") || lower.includes("reach") || lower.includes("visibility")) {
    return "Awareness";
  }
  
  if (lower.includes("consideration") || lower.includes("interest") || lower.includes("engagement") || 
      lower.includes("authority") || lower.includes("trust") || lower.includes("preference")) {
    return "Consideration";
  }
  
  // Default to Conversion for purchase, conversion, intent, loyalty, retention, etc.
  return "Conversion";
}

/**
 * Get sources grouped by type for a phase
 */
export function getSourcesByTypeForPhase(
  phase: string,
  platform: string = "Meta"
): Record<string, AudienceTypeMatrixEntry[]> {
  const entries = getAudienceTypesForPhase(phase, platform);
  const grouped: Record<string, AudienceTypeMatrixEntry[]> = {};
  
  entries.forEach(entry => {
    if (!grouped[entry.type]) {
      grouped[entry.type] = [];
    }
    grouped[entry.type].push(entry);
  });
  
  return grouped;
}

/**
 * Check if phase should use native targeting (basic demographics)
 */
export function shouldUseNativeTargeting(phase: string): boolean {
  const normalized = normalizePhaseToMatrix(phase);
  return normalized === "Awareness";
}

/**
 * Get human-readable description for audience type
 */
export function getAudienceTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    "Custom Audience": "People who have already interacted with your business",
    "Lookalike Audience": "New people similar to your existing customers",
    "New Audience": "Reach new people based on demographics and interests",
    "Saved Audience": "Previously saved audience segments"
  };
  return descriptions[type] || type;
}
