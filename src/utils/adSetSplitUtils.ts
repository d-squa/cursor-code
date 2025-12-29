import { AdSetConfig, AdSetSplitDimension } from "@/types/mediaplan";
import { LANGUAGE_OPTIONS, GENDER_OPTIONS, DEVICE_OPTIONS } from "@/utils/targetingOptions";
import { MARKET_OPTIONS } from "@/utils/markets";

// Taxonomy abbreviations for ad set names
const DIMENSION_TAXONOMY: Record<AdSetSplitDimension, string> = {
  none: "",
  placement: "PLMT",
  optimization_goal: "OPT",
  audience: "AUD",
  audience_selection: "AUDSEL",
  language: "LANG",
  location: "GEO",
  gender: "GEN",
  device: "DEV",
  age: "AGE",
};

// Meta publisher platform options for split
export const META_PUBLISHER_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "audience_network", label: "Audience Network" },
  { value: "messenger", label: "Messenger" },
];

// TikTok placement options for split
export const TIKTOK_PLACEMENT_OPTIONS = [
  { value: "PLACEMENT_TIKTOK", label: "TikTok" },
  { value: "PLACEMENT_PANGLE", label: "Pangle" },
  { value: "PLACEMENT_TOPBUZZ", label: "TopBuzz/BuzzVideo" },
];

// Meta positions per publisher
export const META_POSITIONS: Record<string, Array<{ value: string; label: string }>> = {
  facebook: [
    { value: "feed", label: "Feed" },
    { value: "right_hand_column", label: "Right Hand Column" },
    { value: "marketplace", label: "Marketplace" },
    { value: "video_feeds", label: "Video Feeds" },
    { value: "story", label: "Stories" },
    { value: "search", label: "Search Results" },
    { value: "instream_video", label: "In-Stream Video" },
    { value: "reels", label: "Reels" },
  ],
  instagram: [
    { value: "stream", label: "Feed" },
    { value: "story", label: "Stories" },
    { value: "explore", label: "Explore" },
    { value: "explore_home", label: "Explore Home" },
    { value: "reels", label: "Reels" },
    { value: "profile_feed", label: "Profile Feed" },
    { value: "search", label: "Search Results" },
  ],
  audience_network: [
    { value: "classic", label: "Native, Banner, Interstitial" },
    { value: "rewarded_video", label: "Rewarded Video" },
  ],
  messenger: [
    { value: "messenger_home", label: "Inbox" },
    { value: "story", label: "Stories" },
    { value: "sponsored_messages", label: "Sponsored Messages" },
  ],
};

// Get taxonomy suffix for a dimension value
function getTaxonomySuffix(
  dimension: AdSetSplitDimension,
  value: string | { min: number; max: number },
  options?: {
    availableOptimizationGoals?: Array<{ value: string; label: string }>;
    availableAudiences?: Array<{ id: string; name: string; type: string }>;
  }
): string {
  switch (dimension) {
    case "gender":
      if (value === "male") return "M";
      if (value === "female") return "F";
      return "ALL";
    case "device":
      if (value === "mobile") return "MOB";
      if (value === "desktop") return "DSK";
      if (value === "tablet") return "TAB";
      return String(value).toUpperCase().slice(0, 3);
    case "placement":
      return String(value).replace(/\s+/g, '').toUpperCase().slice(0, 6);
    case "language":
      const langOpt = LANGUAGE_OPTIONS.find(l => l.value === value);
      return langOpt?.label.split(' ')[0].toUpperCase().slice(0, 3) || String(value).toUpperCase();
    case "location":
      return String(value).toUpperCase();
    case "optimization_goal":
      const goalOpt = options?.availableOptimizationGoals?.find(g => g.value === value);
      return goalOpt?.label.replace(/\s+/g, '').toUpperCase().slice(0, 6) || String(value).slice(0, 6);
    case "audience":
      const audOpt = options?.availableAudiences?.find(a => a.id === value);
      return audOpt?.type.toUpperCase().slice(0, 3) || "CUS";
    case "audience_selection":
      // Map audience selection types to taxonomy abbreviations
      if (value === "custom") return "CUS";
      if (value === "lookalike") return "LAL";
      if (value === "retargeting") return "RET";
      if (value === "broad") return "BRD";
      return String(value).toUpperCase().slice(0, 3);
    case "age":
      const ageVal = value as { min: number; max: number };
      return `${ageVal.min}-${ageVal.max}`;
    default:
      return String(value).slice(0, 6);
  }
}

// Generate taxonomy-based name for ad set
export function generateAdSetName(
  phaseName: string,
  dimension: AdSetSplitDimension,
  dimensionValue: string | string[] | number | { min: number; max: number },
  options?: {
    availableOptimizationGoals?: Array<{ value: string; label: string }>;
    availableAudiences?: Array<{ id: string; name: string; type: string }>;
  }
): string {
  const prefix = DIMENSION_TAXONOMY[dimension];
  const valueSuffix = getTaxonomySuffix(dimension, dimensionValue as any, options);
  return `${phaseName}_${prefix}_${valueSuffix}`;
}

// Get complementary values for intelligent auto-split
export function getComplementaryValues(
  dimension: AdSetSplitDimension,
  currentValue: string | undefined,
  context: {
    platformId?: string;
    availablePlacements?: string[];
    availableOptimizationGoals?: Array<{ value: string; label: string }>;
    availableAudiences?: Array<{ id: string; name: string; type: string }>;
    currentGender?: string;
    currentDevices?: string[];
    currentLanguages?: string[];
    currentLocations?: string[];
    currentAgeMin?: number;
    currentAgeMax?: number;
  }
): Array<{ value: string | { min: number; max: number }; label: string }> {
  switch (dimension) {
    case "gender":
      // If gender is set, suggest complementary gender
      if (context.currentGender === "female" || currentValue === "female") {
        return [{ value: "male", label: "Male" }];
      }
      if (context.currentGender === "male" || currentValue === "male") {
        return [{ value: "female", label: "Female" }];
      }
      // Default: suggest both
      return [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" }
      ];

    case "device":
      const usedDevices = context.currentDevices || [];
      return DEVICE_OPTIONS
        .filter(d => !usedDevices.includes(d.value) && d.value !== currentValue)
        .map(d => ({ value: d.value, label: d.label }));

    case "placement":
      // Use platform-specific placement options
      const isTikTokPlatform = context.platformId === 'tiktok';
      const placementOptions = isTikTokPlatform ? TIKTOK_PLACEMENT_OPTIONS : META_PUBLISHER_OPTIONS;
      return placementOptions
        .filter(p => p.value !== currentValue)
        .slice(0, 2)
        .map(p => ({ value: p.value, label: p.label }));

    case "language":
      const usedLangs = context.currentLanguages || [];
      return LANGUAGE_OPTIONS
        .filter(l => !usedLangs.includes(l.value) && l.value !== currentValue)
        .slice(0, 3)
        .map(l => ({ value: l.value, label: l.label }));

    case "location":
      const usedLocs = context.currentLocations || [];
      return MARKET_OPTIONS
        .filter(m => !usedLocs.includes(m.value) && m.value !== currentValue)
        .slice(0, 3)
        .map(m => ({ value: m.value, label: m.label }));

    case "optimization_goal":
      return (context.availableOptimizationGoals || [])
        .filter(g => g.value !== currentValue)
        .slice(0, 2)
        .map(g => ({ value: g.value, label: g.label }));

    case "audience":
      return (context.availableAudiences || [])
        .filter(a => a.id !== currentValue)
        .slice(0, 2)
        .map(a => ({ value: a.id, label: a.name }));

    case "audience_selection":
      // Return complementary audience selection types
      const allTypes = [
        { value: "custom", label: "Custom Audiences" },
        { value: "lookalike", label: "Lookalike Audiences" },
        { value: "retargeting", label: "Retargeting Audiences" },
        { value: "broad", label: "Broad Targeting" },
      ];
      return allTypes.filter(t => t.value !== currentValue);

    case "age":
      const currentAge = context.currentAgeMin && context.currentAgeMax 
        ? { min: context.currentAgeMin, max: context.currentAgeMax }
        : null;
      
      // Suggest complementary age ranges based on current selection
      if (currentAge && currentAge.max <= 35) {
        return [
          { value: { min: 35, max: 55 }, label: "35-55" },
          { value: { min: 55, max: 65 }, label: "55-65" }
        ];
      }
      if (currentAge && currentAge.min >= 45) {
        return [
          { value: { min: 18, max: 34 }, label: "18-34" },
          { value: { min: 35, max: 44 }, label: "35-44" }
        ];
      }
      return [
        { value: { min: 18, max: 34 }, label: "18-34" },
        { value: { min: 35, max: 54 }, label: "35-54" },
        { value: { min: 55, max: 65 }, label: "55-65" }
      ];

    default:
      return [];
  }
}

// Create initial ad sets when split is activated
export function createInitialAdSets(
  dimension: AdSetSplitDimension,
  phaseName: string,
  context: {
    platformId?: string;
    currentGender?: string;
    currentDevices?: string[];
    currentLanguages?: string[];
    currentLocations?: string[];
    currentAgeMin?: number;
    currentAgeMax?: number;
    currentOptimizationGoal?: string;
    availablePlacements?: string[];
    availableOptimizationGoals?: Array<{ value: string; label: string }>;
    availableAudiences?: Array<{ id: string; name: string; type: string }>;
  }
): AdSetConfig[] {
  const options = {
    availableOptimizationGoals: context.availableOptimizationGoals,
    availableAudiences: context.availableAudiences,
  };

  // Get primary value (from current phase config) and complementary values
  let primaryValue: string | { min: number; max: number };
  let complementaryValues: Array<{ value: string | { min: number; max: number }; label: string }>;

  switch (dimension) {
    case "gender":
      primaryValue = context.currentGender || "female";
      complementaryValues = getComplementaryValues(dimension, primaryValue as string, context);
      break;

    case "device":
      primaryValue = context.currentDevices?.[0] || "mobile";
      complementaryValues = getComplementaryValues(dimension, primaryValue as string, context);
      break;

    case "placement":
      // Use platform-specific placement options
      const isTikTokPlat = context.platformId === 'tiktok';
      const placementOpts = isTikTokPlat ? TIKTOK_PLACEMENT_OPTIONS : META_PUBLISHER_OPTIONS;
      primaryValue = placementOpts[0]?.value || "facebook";
      complementaryValues = getComplementaryValues(dimension, primaryValue as string, context);
      break;

    case "language":
      primaryValue = context.currentLanguages?.[0] || "en";
      complementaryValues = getComplementaryValues(dimension, primaryValue as string, context);
      break;

    case "location":
      primaryValue = context.currentLocations?.[0] || "US";
      complementaryValues = getComplementaryValues(dimension, primaryValue as string, context);
      break;

    case "optimization_goal":
      primaryValue = context.currentOptimizationGoal || context.availableOptimizationGoals?.[0]?.value || "";
      complementaryValues = getComplementaryValues(dimension, primaryValue as string, context);
      break;

    case "audience":
      primaryValue = context.availableAudiences?.[0]?.id || "";
      complementaryValues = getComplementaryValues(dimension, primaryValue as string, context);
      break;

    case "audience_selection":
      primaryValue = "custom"; // Default to Custom Audiences
      complementaryValues = getComplementaryValues(dimension, primaryValue as string, context);
      break;

    case "age":
      primaryValue = { min: context.currentAgeMin || 18, max: context.currentAgeMax || 34 };
      complementaryValues = getComplementaryValues(dimension, undefined, context);
      break;

    default:
      primaryValue = "";
      complementaryValues = [];
  }

  // Create primary ad set
  const adSets: AdSetConfig[] = [
    {
      id: `adset-${Date.now()}`,
      name: generateAdSetName(phaseName, dimension, primaryValue, options),
      dimensionValue: primaryValue,
      budgetPercentage: 50,
      ...getAdSetFieldsForDimension(dimension, primaryValue, { platformId: context.platformId }),
    },
  ];

  // Add one complementary ad set if available
  if (complementaryValues.length > 0) {
    const comp = complementaryValues[0];
    adSets.push({
      id: `adset-${Date.now() + 1}`,
      name: generateAdSetName(phaseName, dimension, comp.value, options),
      dimensionValue: comp.value,
      budgetPercentage: 50,
      ...getAdSetFieldsForDimension(dimension, comp.value, { platformId: context.platformId }),
    });
  }

  return adSets;
}

// Get ad set field overrides based on dimension
function getAdSetFieldsForDimension(
  dimension: AdSetSplitDimension,
  value: string | { min: number; max: number },
  context?: { platformId?: string }
): Partial<AdSetConfig> {
  const isTikTok = context?.platformId === 'tiktok';
  
  switch (dimension) {
    case "gender":
      return { gender: value as string };
    case "device":
      return { devices: [value as string] };
    case "placement":
      if (isTikTok) {
        // TikTok placement handling
        const tiktokPlacement = value as string;
        return { 
          tiktokPlacements: [tiktokPlacement],
        };
      } else {
        // Meta publisher platform handling
        const publisher = value as string;
        // Get default position for the publisher
        const positions = META_POSITIONS[publisher];
        const defaultPosition = positions?.[0]?.value;
        return { 
          publisherPlatforms: [publisher],
          positions: defaultPosition ? { [publisher]: [defaultPosition] } : undefined,
        };
      }
    case "language":
      return { languages: [value as string] };
    case "location":
      return { countries: [value as string] };
    case "optimization_goal":
      return { optimizationGoal: value as string };
    case "age":
      const ageVal = value as { min: number; max: number };
      return { ageMin: ageVal.min, ageMax: ageVal.max };
    default:
      return {};
  }
}