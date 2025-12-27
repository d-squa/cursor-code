import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, GripVertical, Split, X } from "lucide-react";
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

const GENDER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const DEVICE_OPTIONS = [
  { value: "mobile", label: "Mobile" },
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tablet" },
];

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
}: AdSetSplitManagerProps) {
  // Calculate total budget percentage
  const totalBudget = adSets.reduce((sum, as) => sum + as.budgetPercentage, 0);

  // Add new ad set
  const addAdSet = () => {
    const newAdSet: AdSetConfig = {
      id: `adset-${Date.now()}`,
      name: `${phaseName} - Ad Set ${adSets.length + 1}`,
      dimensionValue: getDefaultDimensionValue(dimension),
      budgetPercentage: Math.max(0, 100 - totalBudget),
    };
    onAdSetsChange([...adSets, newAdSet]);
  };

  // Remove ad set
  const removeAdSet = (id: string) => {
    const newAdSets = adSets.filter(as => as.id !== id);
    // Redistribute budget equally if removing
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

  // Update ad set
  const updateAdSet = (id: string, updates: Partial<AdSetConfig>) => {
    onAdSetsChange(adSets.map(as => 
      as.id === id ? { ...as, ...updates } : as
    ));
  };

  // Get default value based on dimension
  function getDefaultDimensionValue(dim: AdSetSplitDimension): string | string[] | number | { min: number; max: number } {
    switch (dim) {
      case "placement":
        return availablePlacements[0] || "Feed";
      case "optimization_goal":
        return availableOptimizationGoals[0]?.value || "";
      case "audience":
        return availableAudiences[0]?.id || "";
      case "language":
        return LANGUAGE_OPTIONS[0]?.value || "en";
      case "location":
        return MARKET_OPTIONS[0]?.value || "US";
      case "gender":
        return "all";
      case "device":
        return "mobile";
      case "age":
        return { min: 18, max: 65 };
      default:
        return "";
    }
  }

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
                {/* Ad Set Name */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={adSet.name}
                    onChange={(e) => updateAdSet(adSet.id, { name: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>

                {/* Dimension Value */}
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
