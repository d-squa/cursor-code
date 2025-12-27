import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, GripVertical, Split, X, Lightbulb } from "lucide-react";
import { AdSetConfig, AdSetSplitDimension } from "@/types/mediaplan";
import { LANGUAGE_OPTIONS } from "@/utils/targetingOptions";
import { MARKET_OPTIONS } from "@/utils/markets";
import { getPlacementsForSelection } from "@/utils/placements";

interface AdSetSplitManagerProps {
  dimension: AdSetSplitDimension;
  adSets: AdSetConfig[];
  platformName: string;
  platformId: string;
  phaseName: string;
  onAdSetsChange: (adSets: AdSetConfig[]) => void;
  onRemoveSplit: () => void;
  // Available options based on context
  availablePlacements?: string[];
  availableAudiences?: Array<{ id: string; name: string; type: string }>;
  availableOptimizationGoals?: Array<{ value: string; label: string }>;
  // Current phase values for context
  currentGender?: string;
  currentAgeMin?: number;
  currentAgeMax?: number;
  currentLanguages?: string[];
  currentLocations?: string[];
  currentDevices?: string[];
}

const DIMENSION_LABELS: Record<AdSetSplitDimension, string> = {
  none: "None",
  placement: "Placement",
  optimization_goal: "Optimization Goal",
  audience: "Audience",
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
  optimization_goal: "OPT",
  audience: "AUD",
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
      const deviceOpt = DEVICE_OPTIONS.find(d => d.value === dimensionValue);
      valueSuffix = deviceOpt?.taxonomy || String(dimensionValue).toUpperCase().slice(0, 3);
      break;
    case "placement":
      valueSuffix = String(dimensionValue).replace(/\s+/g, '').toUpperCase().slice(0, 6);
      break;
    case "language":
      const langOpt = LANGUAGE_OPTIONS.find(l => l.value === dimensionValue);
      valueSuffix = langOpt?.label.split(' ')[0].toUpperCase().slice(0, 3) || String(dimensionValue).toUpperCase();
      break;
    case "location":
      valueSuffix = String(dimensionValue).toUpperCase();
      break;
    case "optimization_goal":
      const goalOpt = options.availableOptimizationGoals?.find(g => g.value === dimensionValue);
      valueSuffix = goalOpt?.label.replace(/\s+/g, '').toUpperCase().slice(0, 6) || String(dimensionValue).slice(0, 6);
      break;
    case "audience":
      const audOpt = options.availableAudiences?.find(a => a.id === dimensionValue);
      valueSuffix = audOpt?.type.toUpperCase().slice(0, 3) || "CUS";
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
  availablePlacements = [],
  availableAudiences = [],
  availableOptimizationGoals = [],
  currentGender,
  currentAgeMin,
  currentAgeMax,
  currentLanguages,
  currentLocations,
  currentDevices,
}: AdSetSplitManagerProps) {
  // Calculate total budget percentage
  const totalBudget = adSets.reduce((sum, as) => sum + as.budgetPercentage, 0);

  // Get default value based on dimension and current phase values
  function getDefaultDimensionValue(dim: AdSetSplitDimension, excludeValues: Array<string | { min: number; max: number }> = []): string | string[] | number | { min: number; max: number } {
    const options = { availablePlacements, availableAudiences, availableOptimizationGoals };
    
    switch (dim) {
      case "placement":
        const unusedPlacement = availablePlacements.find(p => !excludeValues.includes(p));
        return unusedPlacement || availablePlacements[0] || "Feed";
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

  // Add new ad set with intelligent defaults
  const addAdSet = () => {
    const existingValues = adSets.map(as => as.dimensionValue);
    const newValue = getDefaultDimensionValue(dimension, existingValues as any);
    const newAdSet: AdSetConfig = {
      id: `adset-${Date.now()}`,
      name: generateAdSetName(phaseName, dimension, newValue, { availableOptimizationGoals, availableAudiences }),
      dimensionValue: newValue,
      budgetPercentage: Math.max(0, Math.round((100 - totalBudget) / 1) || Math.round(100 / (adSets.length + 1))),
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

  // Update ad set with auto-taxonomy name regeneration
  const updateAdSet = (id: string, updates: Partial<AdSetConfig>) => {
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

  // Render dimension-specific input
  const renderDimensionInput = (adSet: AdSetConfig) => {
    switch (dimension) {
      case "placement":
        return (
          <Select
            value={adSet.dimensionValue as string}
            onValueChange={(value) => updateAdSet(adSet.id, { 
              dimensionValue: value,
              placements: [value],
              tiktokPlacements: platformId === "tiktok" ? [value] : undefined,
            })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select placement" />
            </SelectTrigger>
            <SelectContent>
              {availablePlacements.map((placement) => (
                <SelectItem key={placement} value={placement}>
                  {placement}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "optimization_goal":
        return (
          <Select
            value={adSet.dimensionValue as string}
            onValueChange={(value) => updateAdSet(adSet.id, { 
              dimensionValue: value,
              optimizationGoal: value,
            })}
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
        );

      case "audience":
        return (
          <Select
            value={adSet.dimensionValue as string}
            onValueChange={(value) => {
              const audience = availableAudiences.find(a => a.id === value);
              updateAdSet(adSet.id, { 
                dimensionValue: value,
                audiences: audience ? [{ ...audience, source: "custom" }] : [],
              });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select audience" />
            </SelectTrigger>
            <SelectContent>
              {availableAudiences.map((audience) => (
                <SelectItem key={audience.id} value={audience.id}>
                  {audience.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "language":
        return (
          <Select
            value={adSet.dimensionValue as string}
            onValueChange={(value) => updateAdSet(adSet.id, { 
              dimensionValue: value,
              languages: [value],
            })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "location":
        return (
          <Select
            value={adSet.dimensionValue as string}
            onValueChange={(value) => updateAdSet(adSet.id, { 
              dimensionValue: value,
              countries: [value],
            })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              {MARKET_OPTIONS.map((market) => (
                <SelectItem key={market.value} value={market.value}>
                  {market.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "gender":
        return (
          <Select
            value={adSet.dimensionValue as string}
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
        return (
          <Select
            value={adSet.dimensionValue as string}
            onValueChange={(value) => updateAdSet(adSet.id, { 
              dimensionValue: value,
              devices: [value],
            })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select device" />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "age":
        const ageValue = adSet.dimensionValue as { min: number; max: number };
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
          Create multiple ad sets targeting different {DIMENSION_LABELS[dimension].toLowerCase()} values
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

        {/* Budget summary */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total budget allocation:</span>
          <Badge variant={totalBudget === 100 ? "default" : "destructive"}>
            {totalBudget}%
          </Badge>
        </div>

        {/* Ad Sets list */}
        <div className="space-y-3">
          {adSets.map((adSet, index) => (
            <div
              key={adSet.id}
              className="flex items-center gap-3 p-3 bg-background rounded-lg border"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
              
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
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

                {/* Budget Percentage */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Budget %</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[adSet.budgetPercentage]}
                      onValueChange={([value]) => updateAdSet(adSet.id, { budgetPercentage: value })}
                      max={100}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-12 text-sm text-right">{adSet.budgetPercentage}%</span>
                  </div>
                </div>
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

        {totalBudget !== 100 && (
          <p className="text-xs text-destructive">
            Budget allocation must equal 100%. Current: {totalBudget}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}