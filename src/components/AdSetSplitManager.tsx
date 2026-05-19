import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, GripVertical, Split, X, Lightbulb, Ban, Loader2 } from "lucide-react";
import { AdSetConfig, AdSetSplitDimension } from "@/types/mediaplan";
import { LANGUAGE_OPTIONS, normalizeLanguageValues } from "@/utils/targetingOptions";
import { MARKET_OPTIONS } from "@/utils/markets";
import { getPlacementsForSelection } from "@/utils/placements";
import { MultiSelect } from "@/components/ui/multi-select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIPLAN_BUDGET_SLIDER_STEP,
  ACTIPLAN_MIN_ENTITY_BUDGET_EUR,
  ceilBudgetPercentageToSliderStep,
  clampBudgetPercentage,
  clampPercentageToMinimumEur,
  minAdSetBudgetPercentage,
} from "@/utils/actiplanBudgetMinimums";

interface AdSetSplitManagerProps {
  dimension: AdSetSplitDimension;
  adSets: AdSetConfig[];
  platformName: string;
  platformId: string;
  phaseName: string;
  onAdSetsChange: (adSets: AdSetConfig[]) => void;
  onRemoveSplit: () => void;
  useCBO?: boolean; // Campaign Budget Optimization mode
  // Available options based on context
  availablePlacements?: string[];
  availableAudiences?: Array<{ id: string; name: string; type: string }>;
  availableOptimizationGoals?: Array<{ value: string; label: string }>;
  // Ad account for fetching audiences
  adAccountId?: string;
  // Current phase values for context
  currentGender?: string;
  currentAgeMin?: number;
  currentAgeMax?: number;
  currentLanguages?: string[];
  currentLocations?: string[];
  currentDevices?: string[];
  // Cross-exclude for audience_selection
  autoCrossExclude?: boolean;
  onAutoCrossExcludeChange?: (enabled: boolean) => void;
  /** Absolute phase budget (USD) for validating ad set minimum allocations. */
  phaseBudgetEur?: number;
}

const DIMENSION_LABELS: Record<AdSetSplitDimension, string> = {
  none: "None",
  placement: "Placement",
  ad_format: "Ad Format",
  optimization_goal: "Optimization Goal",
  audience: "Audience",
  audience_selection: "Audience Selection",
  language: "Language",
  location: "Location",
  gender: "Gender",
  device: "Device",
  age: "Age Range",
};

// Taxonomy abbreviations for ad set names
const DIMENSION_TAXONOMY: Record<AdSetSplitDimension, string> = {
  none: "",
  placement: "PLMT",
  ad_format: "FMT",
  optimization_goal: "OPT",
  audience: "AUD",
  audience_selection: "AUDSEL",
  language: "LANG",
  location: "GEO",
  gender: "GEN",
  device: "DEV",
  age: "AGE",
};

const GENDER_OPTIONS = [
  { value: "all", label: "All", taxonomy: "ALL" },
  { value: "male", label: "Male", taxonomy: "M" },
  { value: "female", label: "Female", taxonomy: "F" },
];

const DEVICE_OPTIONS = [
  { value: "mobile", label: "Mobile", taxonomy: "MOB" },
  { value: "desktop", label: "Desktop", taxonomy: "DSK" },
  { value: "tablet", label: "Tablet", taxonomy: "TAB" },
];

// Get complementary values for intelligent auto-fill
function getComplementaryValues(
  dimension: AdSetSplitDimension, 
  currentValue: string | string[] | number | { min: number; max: number } | undefined,
  options: { availableAudiences?: Array<{ id: string; name: string; type: string }>; availableOptimizationGoals?: Array<{ value: string; label: string }>; availablePlacements?: string[] }
): Array<string | { min: number; max: number }> {
  switch (dimension) {
    case "gender":
      if (currentValue === "female") return ["male"];
      if (currentValue === "male") return ["female"];
      return ["male", "female"];
    case "device":
      const currentDevices = Array.isArray(currentValue) ? currentValue : [currentValue];
      return DEVICE_OPTIONS
        .map(d => d.value)
        .filter(d => !currentDevices.includes(d));
    case "placement":
      const currentPlacements = Array.isArray(currentValue) ? currentValue : [currentValue];
      return (options.availablePlacements || [])
        .filter(p => !currentPlacements.includes(p))
        .slice(0, 3); // Limit to 3 suggestions
    case "language":
      const currentLangs = Array.isArray(currentValue) ? currentValue : [currentValue];
      return LANGUAGE_OPTIONS
        .map(l => l.value)
        .filter(l => !currentLangs.includes(l))
        .slice(0, 3);
    case "location":
      const currentLocs = Array.isArray(currentValue) ? currentValue : [currentValue];
      return MARKET_OPTIONS
        .map(m => m.value)
        .filter(m => !currentLocs.includes(m))
        .slice(0, 3);
    case "optimization_goal":
      const currentGoal = currentValue as string;
      return (options.availableOptimizationGoals || [])
        .map(g => g.value)
        .filter(g => g !== currentGoal)
        .slice(0, 2);
    case "audience":
      const currentAud = currentValue as string;
      return (options.availableAudiences || [])
        .map(a => a.id)
        .filter(a => a !== currentAud)
        .slice(0, 2);
    case "age":
      const ageValue = currentValue as { min: number; max: number };
      // Suggest complementary age ranges
      if (ageValue?.max <= 35) {
        return [{ min: 35, max: 55 }, { min: 55, max: 65 }];
      }
      if (ageValue?.min >= 45) {
        return [{ min: 18, max: 34 }, { min: 35, max: 44 }];
      }
      return [{ min: 18, max: 34 }, { min: 45, max: 65 }];
    default:
      return [];
  }
}

// Generate taxonomy-based name for ad set
function generateAdSetName(
  phaseName: string,
  dimension: AdSetSplitDimension,
  dimensionValue: string | string[] | number | { min: number; max: number },
  options: {
    availableOptimizationGoals?: Array<{ value: string; label: string }>;
    availableAudiences?: Array<{ id: string; name: string; type: string }>;
  }
): string {
  const prefix = DIMENSION_TAXONOMY[dimension];
  let valueSuffix = "";

  switch (dimension) {
    case "gender":
      const genderOpt = GENDER_OPTIONS.find(g => g.value === dimensionValue);
      valueSuffix = genderOpt?.taxonomy || String(dimensionValue).toUpperCase().slice(0, 3);
      break;
    case "device":
      if (Array.isArray(dimensionValue)) {
        valueSuffix = dimensionValue.map(d => 
          DEVICE_OPTIONS.find(opt => opt.value === d)?.taxonomy || d.toUpperCase().slice(0, 3)
        ).join('+');
      } else {
        const deviceOpt = DEVICE_OPTIONS.find(d => d.value === dimensionValue);
        valueSuffix = deviceOpt?.taxonomy || String(dimensionValue).toUpperCase().slice(0, 3);
      }
      break;
    case "placement":
      valueSuffix = String(dimensionValue).replace(/\s+/g, '').toUpperCase().slice(0, 6);
      break;
    case "language":
      if (Array.isArray(dimensionValue)) {
        valueSuffix = dimensionValue.map(l => 
          LANGUAGE_OPTIONS.find(opt => opt.value === l)?.label.split(' ')[0].toUpperCase().slice(0, 3) || l.toUpperCase()
        ).join('+');
      } else {
        const langOpt = LANGUAGE_OPTIONS.find(l => l.value === dimensionValue);
        valueSuffix = langOpt?.label.split(' ')[0].toUpperCase().slice(0, 3) || String(dimensionValue).toUpperCase();
      }
      break;
    case "location":
      if (Array.isArray(dimensionValue)) {
        valueSuffix = dimensionValue.map(l => l.toUpperCase()).join('+');
      } else {
        valueSuffix = String(dimensionValue).toUpperCase();
      }
      break;
    case "optimization_goal":
      const goalOpt = options.availableOptimizationGoals?.find(g => g.value === dimensionValue);
      valueSuffix = goalOpt?.label.replace(/\s+/g, '').toUpperCase().slice(0, 6) || String(dimensionValue).slice(0, 6);
      break;
    case "audience":
      if (Array.isArray(dimensionValue)) {
        valueSuffix = dimensionValue.map(id => {
          const aud = options.availableAudiences?.find(a => a.id === id);
          return aud?.type.toUpperCase().slice(0, 3) || "CUS";
        }).join('+');
      } else {
        const audOpt = options.availableAudiences?.find(a => a.id === dimensionValue);
        valueSuffix = audOpt?.type.toUpperCase().slice(0, 3) || "CUS";
      }
      break;
    case "audience_selection":
      // Map audience selection types to taxonomy abbreviations
      if (dimensionValue === "custom") valueSuffix = "CUS";
      else if (dimensionValue === "lookalike") valueSuffix = "LAL";
      else if (dimensionValue === "retargeting") valueSuffix = "RET";
      else if (dimensionValue === "broad") valueSuffix = "BRD";
      else valueSuffix = String(dimensionValue).toUpperCase().slice(0, 3);
      break;
    case "age":
      const ageVal = dimensionValue as { min: number; max: number };
      valueSuffix = `${ageVal.min}-${ageVal.max}`;
      break;
    default:
      valueSuffix = String(dimensionValue).slice(0, 6);
  }

  return `${phaseName}_${prefix}_${valueSuffix}`;
}

export function AdSetSplitManager({
  dimension,
  adSets,
  platformName,
  platformId,
  phaseName,
  onAdSetsChange,
  onRemoveSplit,
  useCBO = false,
  availablePlacements = [],
  availableAudiences = [],
  availableOptimizationGoals = [],
  adAccountId,
  currentGender,
  currentAgeMin,
  currentAgeMax,
  currentLanguages,
  currentLocations,
  currentDevices,
  autoCrossExclude = true,
  onAutoCrossExcludeChange,
  phaseBudgetEur,
}: AdSetSplitManagerProps) {
  // State for cross-exclude (default true for audience_selection)
  const [localAutoCrossExclude, setLocalAutoCrossExclude] = useState(autoCrossExclude);
  
  // State for fetched audiences (for audience_selection dimension)
  const [fetchedAudiences, setFetchedAudiences] = useState<
    Array<{ id: string; name: string; type: string; subtype?: string; source?: string }>
  >([]);
  const [audiencesLoading, setAudiencesLoading] = useState(false);
  
  // Audience selection options for cross-exclude
  const AUDIENCE_SELECTION_OPTIONS = [
    { value: "custom", label: "Custom Audiences" },
    { value: "lookalike", label: "Lookalike Audiences" },
    { value: "retargeting", label: "Retargeting Audiences" },
    { value: "broad", label: "Broad Targeting" },
  ];
  
  // Fetch audiences when dimension is audience_selection and adAccountId is available
  useEffect(() => {
    if (dimension !== "audience_selection" || !adAccountId) return;
    
    // Only fetch Meta audiences for Meta platform
    const isGoogle = platformName?.toLowerCase().includes('google');
    const isTikTok = platformName?.toLowerCase().includes('tiktok');
    if (isGoogle || isTikTok) {
      console.log(`${isGoogle ? 'Google Ads' : 'TikTok'} audience fetching not yet implemented`);
      setFetchedAudiences([]);
      setAudiencesLoading(false);
      return;
    }

    const fetchAudiences = async () => {
      setAudiencesLoading(true);
      try {
        // Fetch ALL available audiences for the ad account (custom + saved)
        // The backend function returns an array.
        const { data, error } = await supabase.functions.invoke("fetch-meta-audiences", {
          body: { adAccountId },
        });

        if (error) {
          console.error("Error fetching audiences:", error);
          return;
        }

        const audiences = Array.isArray(data) ? data : (data?.audiences ?? []);

        setFetchedAudiences(
          audiences.map((aud: any) => ({
            id: aud.id,
            name: aud.name,
            type: aud.subtype || aud.source || "Unknown",
            subtype: aud.subtype,
            source: aud.source,
          }))
        );
      } catch (err) {
        console.error("Error fetching audiences:", err);
      } finally {
        setAudiencesLoading(false);
      }
    };

    fetchAudiences();
  }, [dimension, adAccountId]);
  
  // Calculate excluded audiences for each ad set when using audience_selection dimension
  const adSetsWithExclusions = useMemo(() => {
    if (dimension !== 'audience_selection' || !localAutoCrossExclude) {
      return adSets;
    }
    
    return adSets.map(adSet => {
      // Get all other ad sets' dimension values
      const otherValues = adSets
        .filter(as => as.id !== adSet.id)
        .map(as => as.dimensionValue as string)
        .filter(Boolean);
      
      // Create excluded audiences based on other ad sets' selections
      const excludedAudiences = otherValues.map(value => {
        const option = AUDIENCE_SELECTION_OPTIONS.find(o => o.value === value);
        return {
          id: value,
          name: option?.label || value,
          type: value,
          source: 'audience_selection_split',
        };
      });
      
      return {
        ...adSet,
        excludedAudiences,
      };
    });
  }, [adSets, dimension, localAutoCrossExclude]);
  
  // Update parent when cross-exclude changes
  useEffect(() => {
    if (dimension === 'audience_selection' && localAutoCrossExclude) {
      onAdSetsChange(adSetsWithExclusions);
    }
  }, [adSetsWithExclusions, localAutoCrossExclude, dimension]);
  
  // Calculate total budget percentage
  const totalBudget = adSets.reduce((sum, as) => sum + as.budgetPercentage, 0);

  // Meta publisher platforms - defined early for use in getDimensionFields
  const META_PUBLISHER_OPTIONS = [
    { value: "facebook", label: "Facebook" },
    { value: "instagram", label: "Instagram" },
    { value: "audience_network", label: "Audience Network" },
    { value: "messenger", label: "Messenger" },
  ];

  // TikTok placement options - defined early for use in getDefaultDimensionValue
  const TIKTOK_PLACEMENT_OPTIONS_LIST = [
    { value: "PLACEMENT_TIKTOK", label: "TikTok" },
    { value: "PLACEMENT_PANGLE", label: "Pangle" },
    { value: "PLACEMENT_TOPBUZZ", label: "TopBuzz/BuzzVideo" },
  ];

  // Meta positions per publisher - defined early for use in getDimensionFields
  const META_POSITIONS: Record<string, Array<{ value: string; label: string }>> = {
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

  // Ad format options for splitting
  const AD_FORMAT_OPTIONS = [
    { value: "in_feed", label: "In-Feed" },
    { value: "stories", label: "Stories" },
    { value: "in_feed_carousel", label: "In-Feed Carousel" },
    { value: "story_carousel", label: "Story Carousel" },
  ];

  // Get default value based on dimension and current phase values
  function getDefaultDimensionValue(dim: AdSetSplitDimension, excludeValues: Array<string | { min: number; max: number }> = []): string | string[] | number | { min: number; max: number } {
    const isTikTok = platformId === 'tiktok';
    
    switch (dim) {
      case "placement":
        if (isTikTok) {
          const unusedTikTokPlacement = TIKTOK_PLACEMENT_OPTIONS_LIST.find(p => !excludeValues.includes(p.value));
          return unusedTikTokPlacement?.value || TIKTOK_PLACEMENT_OPTIONS_LIST[0]?.value || "PLACEMENT_TIKTOK";
        }
        const unusedPlacement = META_PUBLISHER_OPTIONS.find(p => !excludeValues.includes(p.value));
        return unusedPlacement?.value || META_PUBLISHER_OPTIONS[0]?.value || "facebook";
      case "ad_format":
        const unusedFormat = AD_FORMAT_OPTIONS.find(f => !excludeValues.includes(f.value));
        return unusedFormat?.value || AD_FORMAT_OPTIONS[0]?.value || "in_feed";
      case "optimization_goal":
        const unusedGoal = availableOptimizationGoals.find(g => !excludeValues.includes(g.value));
        return unusedGoal?.value || availableOptimizationGoals[0]?.value || "";
      case "audience":
        const unusedAud = availableAudiences.find(a => !excludeValues.includes(a.id));
        return unusedAud?.id || availableAudiences[0]?.id || "";
      case "language":
        const unusedLang = LANGUAGE_OPTIONS.find(l => !excludeValues.includes(l.value));
        return unusedLang?.value || currentLanguages?.[0] || "en";
      case "location":
        const unusedLoc = MARKET_OPTIONS.find(m => !excludeValues.includes(m.value));
        return unusedLoc?.value || currentLocations?.[0] || "US";
      case "gender":
        if (!excludeValues.includes("male") && currentGender !== "male") return "male";
        if (!excludeValues.includes("female") && currentGender !== "female") return "female";
        return "all";
      case "device":
        const unusedDevice = DEVICE_OPTIONS.find(d => !excludeValues.includes(d.value));
        return unusedDevice?.value || "mobile";
      case "age":
        // Find an age range not already used
        const usedAges = excludeValues.filter((v): v is { min: number; max: number } => typeof v === 'object' && 'min' in v);
        if (usedAges.length === 0) return { min: currentAgeMin || 18, max: currentAgeMax || 34 };
        if (usedAges.some(a => a.max <= 35)) return { min: 35, max: 55 };
        return { min: 18, max: 34 };
      default:
        return "";
    }
  }

  // Get dimension-specific field overrides for an ad set
  function getDimensionFields(dim: AdSetSplitDimension, value: string | string[] | number | { min: number; max: number }): Partial<AdSetConfig> {
    const isTikTok = platformId === 'tiktok';
    
    switch (dim) {
      case "placement":
        if (isTikTok) {
          return { tiktokPlacements: [value as string] };
        }
        const publisher = value as string;
        const positions = META_POSITIONS[publisher];
        const defaultPosition = positions?.[0]?.value;
        return { 
          publisherPlatforms: [publisher],
          positions: defaultPosition ? { [publisher]: [defaultPosition] } : undefined,
        };
      case "gender":
        return { gender: value as string };
      case "device":
        return { devices: Array.isArray(value) ? value : [value as string] };
      case "language":
        return { languages: Array.isArray(value) ? value : [value as string] };
      case "location":
        return { countries: Array.isArray(value) ? value : [value as string] };
      case "optimization_goal":
        return { optimizationGoal: value as string };
      case "ad_format":
        // Ad format affects placement preset for taxonomy and creative matching
        return { placementPreset: value as string };
      case "age":
        const ageVal = value as { min: number; max: number };
        return { ageMin: ageVal.min, ageMax: ageVal.max };
      default:
        return {};
    }
  }

  // Add new ad set with intelligent defaults
  const addAdSet = () => {
    const existingValues = adSets.map(as => as.dimensionValue);
    const newValue = getDefaultDimensionValue(dimension, existingValues as any);
    const newAdSet: AdSetConfig = {
      id: `adset-${Date.now()}`,
      name: generateAdSetName(phaseName, dimension, newValue, { availableOptimizationGoals, availableAudiences }),
      dimensionValue: newValue,
      budgetPercentage: Math.max(0, Math.round((100 - totalBudget) / 1) || Math.round(100 / (adSets.length + 1))),
      ...getDimensionFields(dimension, newValue),
    };
    
    // Rebalance budgets
    const totalWithNew = adSets.length + 1;
    const equalBudget = Math.round(100 / totalWithNew);
    let remaining = 100;
    const rebalanced = adSets.map((as, idx) => {
      if (idx === adSets.length - 1) {
        const thisBudget = remaining - equalBudget;
        remaining = equalBudget;
        return { ...as, budgetPercentage: thisBudget };
      }
      remaining -= equalBudget;
      return { ...as, budgetPercentage: equalBudget };
    });
    
    onAdSetsChange([...rebalanced, { ...newAdSet, budgetPercentage: remaining }]);
  };

  // Remove ad set
  const removeAdSet = (id: string) => {
    const newAdSets = adSets.filter(as => as.id !== id);
    if (newAdSets.length > 0) {
      const equalBudget = Math.round(100 / newAdSets.length);
      let remaining = 100;
      const redistributed = newAdSets.map((as, idx) => {
        if (idx === newAdSets.length - 1) {
          return { ...as, budgetPercentage: remaining };
        }
        remaining -= equalBudget;
        return { ...as, budgetPercentage: equalBudget };
      });
      onAdSetsChange(redistributed);
    } else {
      onAdSetsChange([]);
    }
  };

  const minAdSetSliderPct = () =>
    phaseBudgetEur && phaseBudgetEur > 0
      ? ceilBudgetPercentageToSliderStep(
          minAdSetBudgetPercentage(phaseBudgetEur),
          ACTIPLAN_BUDGET_SLIDER_STEP,
        )
      : 0;

  // Update ad set with auto-taxonomy name regeneration
  const updateAdSet = (id: string, updates: Partial<AdSetConfig>) => {
    if (updates.budgetPercentage !== undefined && phaseBudgetEur && phaseBudgetEur > 0) {
      updates = {
        ...updates,
        budgetPercentage: clampPercentageToMinimumEur(
          updates.budgetPercentage,
          phaseBudgetEur,
          ACTIPLAN_MIN_ENTITY_BUDGET_EUR,
          ACTIPLAN_BUDGET_SLIDER_STEP,
        ),
      };
    }
    onAdSetsChange(adSets.map(as => {
      if (as.id === id) {
        const updated = { ...as, ...updates };
        // Auto-regenerate name if dimension value changed
        if (updates.dimensionValue !== undefined) {
          updated.name = generateAdSetName(phaseName, dimension, updates.dimensionValue, { availableOptimizationGoals, availableAudiences });
        }
        return updated;
      }
      return as;
    }));
  };

  // Get positions for a specific publisher
  const getPositionsForPublisher = (publisher: string): Array<{ value: string; label: string }> => {
    return META_POSITIONS[publisher] || [];
  };

  // Render dimension-specific input
  const renderDimensionInput = (adSet: AdSetConfig) => {
    switch (dimension) {
      case "placement":
        if (platformId === "tiktok") {
          // TikTok: Multi-select placements
          const tiktokPlacementValues = Array.isArray(adSet.tiktokPlacements) 
            ? adSet.tiktokPlacements 
            : adSet.dimensionValue ? [adSet.dimensionValue as string] : [];
          
          return (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Placements</Label>
              <MultiSelect
                options={TIKTOK_PLACEMENT_OPTIONS_LIST}
                value={tiktokPlacementValues}
                onChange={(values) => updateAdSet(adSet.id, { 
                  dimensionValue: values.join('+'),
                  tiktokPlacements: values,
                })}
                placeholder="Select TikTok placements"
              />
            </div>
          );
        }
        
        // Meta: Multi-select Publishers + Positions per publisher
        const selectedPublishers = adSet.publisherPlatforms || [];
        
        // Get all available positions for selected publishers
        const getPositionsOptionsForPublishers = (publishers: string[]) => {
          const allPositions: Array<{ value: string; label: string; publisher: string }> = [];
          publishers.forEach(pub => {
            const positions = getPositionsForPublisher(pub);
            positions.forEach(pos => {
              allPositions.push({
                value: `${pub}:${pos.value}`,
                label: `${META_PUBLISHER_OPTIONS.find(p => p.value === pub)?.label || pub} - ${pos.label}`,
                publisher: pub,
              });
            });
          });
          return allPositions;
        };
        
        // Convert positions object to flat array for MultiSelect
        const flattenPositions = (positions: Record<string, string[]> | undefined): string[] => {
          if (!positions) return [];
          const flat: string[] = [];
          Object.entries(positions).forEach(([pub, posArr]) => {
            posArr.forEach(pos => flat.push(`${pub}:${pos}`));
          });
          return flat;
        };
        
        // Convert flat array back to positions object
        const unflattenPositions = (flat: string[]): Record<string, string[]> => {
          const positions: Record<string, string[]> = {};
          flat.forEach(item => {
            const [pub, pos] = item.split(':');
            if (!positions[pub]) positions[pub] = [];
            positions[pub].push(pos);
          });
          return positions;
        };
        
        const currentFlatPositions = flattenPositions(adSet.positions);
        const availablePositionsForSelected = getPositionsOptionsForPublishers(selectedPublishers);
        
        return (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Publishers</Label>
              <MultiSelect
                options={META_PUBLISHER_OPTIONS}
                value={selectedPublishers}
                onChange={(values) => {
                  // When publishers change, keep existing positions for remaining publishers
                  const newPositions: Record<string, string[]> = {};
                  values.forEach(pub => {
                    if (adSet.positions?.[pub]) {
                      newPositions[pub] = adSet.positions[pub];
                    } else {
                      // Set default position for new publisher
                      const defaultPos = getPositionsForPublisher(pub);
                      if (defaultPos.length > 0) {
                        newPositions[pub] = [defaultPos[0].value];
                      }
                    }
                  });
                  updateAdSet(adSet.id, { 
                    dimensionValue: values.join('+'),
                    publisherPlatforms: values,
                    positions: newPositions,
                  });
                }}
                placeholder="Select publishers"
              />
            </div>
            
            {selectedPublishers.length > 0 && availablePositionsForSelected.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Positions</Label>
                <MultiSelect
                  options={availablePositionsForSelected.map(p => ({ value: p.value, label: p.label }))}
                  value={currentFlatPositions}
                  onChange={(values) => {
                    const newPositions = unflattenPositions(values);
                    updateAdSet(adSet.id, { 
                      positions: newPositions,
                    });
                  }}
                  placeholder="Select positions"
                />
              </div>
            )}
          </div>
        );

      case "optimization_goal":
        // Read from optimizationGoal field first (persisted), fallback to dimensionValue
        const optGoalValue = adSet.optimizationGoal || adSet.dimensionValue as string || "";
        
        // Get the billing event for this optimization goal from the mapping
        const goalOption = availableOptimizationGoals.find(g => g.value === optGoalValue);
        const suggestedBillingEvent = (goalOption as any)?.billingEvent;
        
        // Bid strategy options
        const BID_STRATEGY_OPTIONS = platformId === 'tiktok' 
          ? [
              { value: "BID_TYPE_NO_BID", label: "Lowest Cost (No Bid Cap)" },
              { value: "BID_TYPE_CUSTOM", label: "Cost Cap / Bid Cap" },
            ]
          : [
              { value: "LOWEST_COST_WITHOUT_CAP", label: "Lowest Cost (No Cap)" },
              { value: "LOWEST_COST_WITH_BID_CAP", label: "Bid Cap" },
              { value: "COST_CAP", label: "Cost Cap" },
            ];
        
        const requiresBidAmount = platformId === 'tiktok' 
          ? adSet.bidStrategy === 'BID_TYPE_CUSTOM'
          : adSet.bidStrategy === 'LOWEST_COST_WITH_BID_CAP' || adSet.bidStrategy === 'COST_CAP';
        
        return (
          <div className="space-y-3">
            {/* Optimization Goal Selector */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Optimization Goal</Label>
              <Select
                value={optGoalValue}
                onValueChange={(value) => {
                  const newGoalOption = availableOptimizationGoals.find(g => g.value === value);
                  const newBillingEvent = (newGoalOption as any)?.billingEvent;
                  updateAdSet(adSet.id, { 
                    dimensionValue: value,
                    optimizationGoal: value,
                    billingEvent: newBillingEvent || adSet.billingEvent,
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select optimization goal" />
                </SelectTrigger>
                <SelectContent>
                  {availableOptimizationGoals.map((goal) => (
                    <SelectItem key={goal.value} value={goal.value}>
                      {goal.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Bid Strategy Selector */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Bid Strategy</Label>
              <Select
                value={adSet.bidStrategy || (platformId === 'tiktok' ? 'BID_TYPE_NO_BID' : 'LOWEST_COST_WITHOUT_CAP')}
                onValueChange={(value) => updateAdSet(adSet.id, { bidStrategy: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select bid strategy" />
                </SelectTrigger>
                <SelectContent>
                  {BID_STRATEGY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Bid Amount (only shown when required by bid strategy) */}
            {requiresBidAmount && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Bid Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="e.g., 5.00"
                  value={adSet.bidAmount || ''}
                  onChange={(e) => updateAdSet(adSet.id, { bidAmount: parseFloat(e.target.value) || undefined })}
                />
              </div>
            )}
            
            {/* Billing Event (auto-set based on goal, but can be overridden) */}
            {suggestedBillingEvent && (
              <div className="text-xs text-muted-foreground mt-1">
                Billing: <span className="font-medium">{suggestedBillingEvent}</span>
              </div>
            )}
          </div>
        );

      case "audience":
        const audValues = Array.isArray(adSet.dimensionValue) 
          ? adSet.dimensionValue as string[]
          : adSet.dimensionValue ? [adSet.dimensionValue as string] : [];
        return (
          <MultiSelect
            options={availableAudiences.map(a => ({ value: a.id, label: a.name }))}
            value={audValues}
            onChange={(values) => {
              const selectedAudiences = values.map(v => {
                const aud = availableAudiences.find(a => a.id === v);
                return aud ? { ...aud, source: "custom" } : null;
              }).filter(Boolean);
              updateAdSet(adSet.id, { 
                dimensionValue: values,
                audiences: selectedAudiences as any[],
              });
            }}
            placeholder="Select audiences"
          />
        );

      case "language":
        // Stored values may be ISO strings or legacy Meta numeric IDs; normalize to ISO for the UI
        // First, determine the source array - skip empty string dimensionValue entirely
        let langValuesRaw: Array<string | number> = [];
        
        if (Array.isArray(adSet.languages) && adSet.languages.length > 0) {
          langValuesRaw = adSet.languages as Array<string | number>;
        } else if (Array.isArray(adSet.dimensionValue) && adSet.dimensionValue.length > 0) {
          langValuesRaw = adSet.dimensionValue as Array<string | number>;
        } else if (adSet.dimensionValue && typeof adSet.dimensionValue === 'string' && adSet.dimensionValue.trim() !== '') {
          langValuesRaw = [adSet.dimensionValue];
        } else if (typeof adSet.dimensionValue === 'number') {
          langValuesRaw = [adSet.dimensionValue];
        }
        // else: leave as empty array - don't add empty strings
        
        // Filter out any remaining empty strings or invalid values
        langValuesRaw = langValuesRaw.filter(
          (v) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "")
        );

        const langValues = normalizeLanguageValues(langValuesRaw);

        return (
          <MultiSelect
            options={LANGUAGE_OPTIONS.map((l) => ({ value: l.value, label: l.label }))}
            value={langValues}
            onChange={(values) =>
              updateAdSet(adSet.id, {
                dimensionValue: values,
                languages: values,
              })
            }
            placeholder="Select languages"
          />
        );

      case "location":
        // Read from countries field first (persisted), fallback to dimensionValue
        const locValues = Array.isArray(adSet.countries) 
          ? adSet.countries as string[]
          : Array.isArray(adSet.dimensionValue) 
            ? adSet.dimensionValue as string[]
            : adSet.dimensionValue ? [adSet.dimensionValue as string] : [];
        return (
          <MultiSelect
            options={MARKET_OPTIONS.map(m => ({ value: m.value, label: m.label }))}
            value={locValues}
            onChange={(values) => updateAdSet(adSet.id, { 
              dimensionValue: values,
              countries: values,
            })}
            placeholder="Select locations"
          />
        );

      case "gender":
        // Read from gender field first (persisted), fallback to dimensionValue
        const genderValue = adSet.gender || adSet.dimensionValue as string || "";
        return (
          <Select
            value={genderValue}
            onValueChange={(value) => updateAdSet(adSet.id, { 
              dimensionValue: value,
              gender: value,
            })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "device":
        // Read from devices field first (persisted), fallback to dimensionValue
        const deviceValues = Array.isArray(adSet.devices) 
          ? adSet.devices as string[]
          : Array.isArray(adSet.dimensionValue) 
            ? adSet.dimensionValue as string[]
            : adSet.dimensionValue ? [adSet.dimensionValue as string] : [];
        return (
          <MultiSelect
            options={DEVICE_OPTIONS.map(d => ({ value: d.value, label: d.label }))}
            value={deviceValues}
            onChange={(values) => updateAdSet(adSet.id, { 
              dimensionValue: values,
              devices: values,
            })}
            placeholder="Select devices"
          />
        );

      case "age":
        // Read from ageMin/ageMax fields first (persisted), fallback to dimensionValue
        const ageValue = (adSet.ageMin !== undefined && adSet.ageMax !== undefined)
          ? { min: adSet.ageMin, max: adSet.ageMax }
          : adSet.dimensionValue as { min: number; max: number } || { min: 18, max: 65 };
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="w-20"
              min={13}
              max={65}
              value={ageValue?.min ?? 18}
              onChange={(e) => updateAdSet(adSet.id, { 
                dimensionValue: { ...(ageValue || { min: 18, max: 65 }), min: parseInt(e.target.value) || 18 },
                ageMin: parseInt(e.target.value) || 18,
              })}
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="number"
              className="w-20"
              min={13}
              max={65}
              value={ageValue?.max ?? 65}
              onChange={(e) => updateAdSet(adSet.id, { 
                dimensionValue: { ...(ageValue || { min: 18, max: 65 }), max: parseInt(e.target.value) || 65 },
                ageMax: parseInt(e.target.value) || 65,
              })}
            />
          </div>
        );

      case "audience_selection":
        // Audience selection split options: Custom (mix & match all), Lookalike, Retargeting, Broad
        const AUDIENCE_TYPE_OPTIONS = [
          { value: "custom", label: "Custom (Mix & Match)" },
          { value: "lookalike", label: "Lookalike Audiences" },
          { value: "retargeting", label: "Retargeting Audiences" },
          { value: "broad", label: "Broad Targeting" },
        ];
        
        // Use fetched audiences when an ad account is connected; otherwise fall back to provided audiences
        const audiencesToFilter = adAccountId ? fetchedAudiences : availableAudiences;
        
        // Filter audiences based on selected type
        const selectedType = adSet.dimensionValue as string;
        const filteredAudiences = audiencesToFilter.filter((a: any) => {
          const subtypeOrType = a.subtype ?? a.type ?? a.source ?? "";
          const key = String(subtypeOrType).toLowerCase();

          const isSaved = key.includes("saved");
          const isLookalike = key.includes("lookalike");
          const isRetargeting =
            key.includes("website") ||
            key.includes("app") ||
            key.includes("engagement") ||
            key.includes("video") ||
            key.includes("event");

          // Custom = show ALL audience types (mix & match)
          if (selectedType === "custom") return !isSaved;
          if (selectedType === "lookalike") return isLookalike;
          if (selectedType === "retargeting") return isRetargeting && !isLookalike;
          return false; // "broad" doesn't have specific audiences
        });
        
        const selectedAudienceIds = adSet.audiences?.map(a => a.id) || [];
        
        return (
          <div className="space-y-3">
            {/* Audience Type Selector */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Strategy Type</Label>
              <Select
                value={selectedType}
                onValueChange={(value) => updateAdSet(adSet.id, { 
                  dimensionValue: value,
                  audiences: [], // Clear selected audiences when type changes
                })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select strategy type" />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Audience Lists Multi-Select - only for non-broad types */}
            {selectedType && selectedType !== "broad" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {selectedType === "custom" ? "Select Audiences (All Types)" : `Select ${AUDIENCE_TYPE_OPTIONS.find(o => o.value === selectedType)?.label || "Audiences"}`}
                </Label>
                {audiencesLoading ? (
                  <div className="flex items-center gap-2 p-2 border rounded bg-muted/30">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs text-muted-foreground">Loading audiences...</span>
                  </div>
                ) : filteredAudiences.length > 0 ? (
                  <MultiSelect
                    options={filteredAudiences.map(a => ({
                      value: a.id,
                      label: a.name,
                    }))}
                    value={selectedAudienceIds}
                    onChange={(ids) => {
                      const selectedAudiences = ids.map(id => {
                        const aud = audiencesToFilter.find(a => a.id === id);
                        return aud ? {
                          id: aud.id,
                          name: aud.name,
                          type: aud.type,
                          source: 'audience_selection_split',
                        } : null;
                      }).filter(Boolean) as typeof adSet.audiences;
                      updateAdSet(adSet.id, { audiences: selectedAudiences });
                    }}
                    placeholder={selectedType === "custom" ? "Select any audiences..." : `Select ${selectedType} audiences...`}
                    className="w-full"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground italic p-2 border rounded bg-muted/30">
                    No audiences available. {!adAccountId ? 'Connect an ad account to load audiences.' : 'Create audiences in your ad platform.'}
                  </p>
                )}
              </div>
            )}
            
            {selectedType === "broad" && (
              <p className="text-xs text-muted-foreground italic p-2 border rounded bg-muted/30">
                Broad targeting uses no specific audience lists - targeting is based on demographics only.
              </p>
            )}
          </div>
        );

      case "ad_format":
        // Ad format split - select from preset placement formats
        const adFormatValue = adSet.placementPreset || adSet.dimensionValue as string || "";
        return (
          <Select
            value={adFormatValue}
            onValueChange={(value) => updateAdSet(adSet.id, { 
              dimensionValue: value,
              placementPreset: value,
            })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select ad format" />
            </SelectTrigger>
            <SelectContent>
              {AD_FORMAT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Split className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Ad Set Split by {DIMENSION_LABELS[dimension]}</CardTitle>
            <Badge variant={useCBO ? "secondary" : "outline"} className="text-xs">
              {useCBO ? "CBO" : "ABO"}
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemoveSplit}
            className="text-destructive hover:text-destructive"
          >
            <X className="h-4 w-4 mr-1" />
            Remove Split
          </Button>
        </div>
        <CardDescription className="text-xs">
          {useCBO 
            ? "Campaign Budget Optimization: Platform automatically distributes budget across ad sets"
            : "Ad Set Budget Optimization: You control budget distribution per ad set"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tip about splitting after setup */}
        <Alert className="bg-amber-500/10 border-amber-500/30">
          <Lightbulb className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
            <strong>Tip:</strong> Complete your ad set configuration first, then split. This way you only configure once instead of updating each ad set separately.
          </AlertDescription>
        </Alert>

        {/* Auto Cross-Exclude Toggle - only show for audience_selection */}
        {dimension === 'audience_selection' && (
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="cross-exclude" className="text-sm font-medium cursor-pointer">
                  Auto Cross-Exclude
                </Label>
                <p className="text-xs text-muted-foreground">
                  Each ad set automatically excludes audiences from other ad sets
                </p>
              </div>
            </div>
            <Switch
              id="cross-exclude"
              checked={localAutoCrossExclude}
              onCheckedChange={(checked) => {
                setLocalAutoCrossExclude(checked);
                onAutoCrossExcludeChange?.(checked);
              }}
            />
          </div>
        )}

        {/* Budget summary - only show for ABO */}
        {!useCBO && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total budget allocation:</span>
            <Badge variant={totalBudget === 100 ? "default" : "destructive"}>
              {totalBudget}%
            </Badge>
          </div>
        )}

        {/* Ad Sets list */}
        <div className="space-y-3">
          {adSets.map((adSet, index) => (
            <div
              key={adSet.id}
              className="flex items-center gap-3 p-3 bg-background rounded-lg border"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
              
              <div className={`flex-1 grid grid-cols-1 gap-3 ${useCBO ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                {/* Ad Set Name - Auto-generated with taxonomy */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Name (auto-generated)</Label>
                  <Input
                    value={adSet.name}
                    onChange={(e) => updateAdSet(adSet.id, { name: e.target.value })}
                    className="h-8 text-sm font-mono"
                    title="Auto-generated taxonomy name. You can edit if needed."
                  />
                </div>

                {/* Dimension Value - Same control as in phase config */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{DIMENSION_LABELS[dimension]}</Label>
                  {renderDimensionInput(adSet)}
                </div>

                {/* Budget Percentage - only show for ABO */}
                {!useCBO && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Budget %</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[Math.max(adSet.budgetPercentage, minAdSetSliderPct())]}
                        onValueChange={([value]) => {
                          const minPct = minAdSetSliderPct();
                          updateAdSet(adSet.id, {
                            budgetPercentage: clampBudgetPercentage(value, minPct),
                          });
                        }}
                        onValueCommit={([value]) => {
                          const minPct = minAdSetSliderPct();
                          updateAdSet(adSet.id, {
                            budgetPercentage: clampBudgetPercentage(value, minPct),
                          });
                        }}
                        min={minAdSetSliderPct()}
                        max={100}
                        step={ACTIPLAN_BUDGET_SLIDER_STEP}
                        className="flex-1"
                      />
                      <span className="w-12 text-sm text-right">{adSet.budgetPercentage}%</span>
                    </div>
                  </div>
                )}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeAdSet(adSet.id)}
                disabled={adSets.length <= 1}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Add Ad Set button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addAdSet}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Ad Set
        </Button>

        {!useCBO && totalBudget !== 100 && (
          <p className="text-xs text-destructive">
            Budget allocation must equal 100%. Current: {totalBudget}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}