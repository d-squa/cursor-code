import { useMemo, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Sparkles, Zap } from "lucide-react";
import { useSampleMode } from "@/contexts/SampleModeContext";
import {
  getStrategyGroupsForPlatform,
  getStrategyById,
  getVariantLabel,
  getDurationWarning,
  generatePhasesFromStrategy,
} from "@/utils/strategyMatrix";
import type { StrategyGroup, StrategyDefinition } from "@/utils/strategyMatrix";
import { generateAutoDetectPhases } from "@/utils/funnelPhases";

interface StrategySelectorProps {
  strategy: string;
  selectedStrategyId?: string;
  platformId: string;
  startDate: string;
  endDate: string;
  onStrategyChange: (strategy: string, phases: any[], selectedStrategyId?: string) => void;
  /** For auto-detect mode */
  adFormats?: string[];
  hasPixel?: boolean;
  hasCatalog?: boolean;
  hasKeywords?: boolean;
}

export function StrategySelector({
  strategy,
  selectedStrategyId,
  platformId,
  startDate,
  endDate,
  onStrategyChange,
  adFormats = [],
  hasPixel = false,
  hasCatalog = false,
  hasKeywords = false,
}: StrategySelectorProps) {
  const { isSampleMode } = useSampleMode();

  // In sample/tour mode, force the strategy to "auto-detect" on mount
  useEffect(() => {
    if (isSampleMode && strategy !== "auto-detect") {
      const newPhases = generateAutoDetectPhases(adFormats, hasPixel, hasCatalog, startDate, endDate, platformId, hasKeywords) || [];
      onStrategyChange("auto-detect", newPhases, undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSampleMode]);

  const normalizedPlatform = useMemo(() => {
    const p = (platformId || "meta").toLowerCase();
    if (p.includes("tiktok")) return "tiktok";
    if (p.includes("google")) return "google";
    return "meta";
  }, [platformId]);

  const strategyGroups = useMemo(() => getStrategyGroupsForPlatform(normalizedPlatform), [normalizedPlatform]);

  const selectedStrategy = useMemo(() => {
    if (!selectedStrategyId) return undefined;
    return getStrategyById(selectedStrategyId);
  }, [selectedStrategyId]);

  const selectedGroup = useMemo(() => {
    if (!selectedStrategy) return undefined;
    return strategyGroups.find(g => g.variants.some(v => v.id === selectedStrategy.id));
  }, [selectedStrategy, strategyGroups]);

  const durationWarnings = useMemo(() => {
    if (!selectedStrategy) return [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    return selectedStrategy.phases
      .map((phase) => {
        const actualDays = Math.round((phase.durationPercent / 100) * totalDays);
        return getDurationWarning(phase, actualDays);
      })
      .filter(Boolean) as string[];
  }, [selectedStrategy, startDate, endDate]);

  const handleStrategyTypeChange = (value: string) => {
    if (value === "auto-detect") {
      const newPhases = generateAutoDetectPhases(adFormats, hasPixel, hasCatalog, startDate, endDate, platformId, hasKeywords) || [];
      onStrategyChange(value, newPhases, undefined);
    } else if (value === "full-funnel") {
      // Don't generate phases yet — user needs to pick a strategy group
      onStrategyChange(value, [], undefined);
    } else if (value === "manual") {
      onStrategyChange(value, [], undefined);
    }
  };

  const handleSelectStrategyGroup = (groupId: string) => {
    const group = strategyGroups.find(g => g.id === groupId);
    if (!group || !startDate || !endDate) return;
    const defaultVariant = group.variants[0];
    applyStrategy(defaultVariant);
  };

  const handleSelectVariant = (strategyId: string) => {
    const strat = getStrategyById(strategyId);
    if (!strat || !startDate || !endDate) return;
    applyStrategy(strat);
  };

  const applyStrategy = (strat: StrategyDefinition) => {
    if (!startDate || !endDate) return;
    const generatedPhases = generatePhasesFromStrategy(strat, startDate, endDate);
    onStrategyChange("full-funnel", generatedPhases, strat.id);
  };

  return (
    <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
      <h4 className="font-medium">Campaign Strategy</h4>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Strategy Type</Label>
          <Select value={strategy || "auto-detect"} onValueChange={handleStrategyTypeChange} disabled={isSampleMode}>
            <SelectTrigger>
              <SelectValue placeholder="Select strategy type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto-detect">Auto-Generate</SelectItem>
              <SelectItem value="full-funnel">Full-Funnel Strategy</SelectItem>
              <SelectItem value="manual">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {strategy === "full-funnel" && (
          <div className="space-y-2">
            <Label>Strategy</Label>
            <Select value={selectedGroup?.id || ""} onValueChange={handleSelectStrategyGroup}>
              <SelectTrigger>
                <SelectValue placeholder="Select a strategy…" />
              </SelectTrigger>
              <SelectContent>
                {strategyGroups.map(group => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Variant Toggle */}
      {strategy === "full-funnel" && selectedGroup && selectedGroup.variants.length > 1 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Variant</Label>
          <div className="flex gap-2">
            {selectedGroup.variants.map(variant => {
              const isSelected = selectedStrategyId === variant.id;
              return (
                <Button
                  key={variant.id}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSelectVariant(variant.id)}
                  className="flex items-center gap-1.5"
                >
                  {variant.variant === "base" && <Zap className="h-3 w-3" />}
                  {(variant.variant === "advantage+" || variant.variant === "smart") && <Sparkles className="h-3 w-3" />}
                  {getVariantLabel(variant.variant)}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Duration Warnings */}
      {durationWarnings.length > 0 && (
        <div className="space-y-1">
          {durationWarnings.map((warning, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-amber-600">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Phase Summary Cards */}
      {selectedStrategy && (
        <div className="space-y-3 mt-2">
          <Label className="text-xs text-muted-foreground">Funnel Phases</Label>
          <div className="grid gap-2">
            {selectedStrategy.phases.map((phase, idx) => (
              <div key={idx} className="p-3 rounded-lg border bg-background/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{phase.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {phase.budgetPercent}% budget
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {phase.durationPercent}% duration
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                  <span className="bg-muted px-1.5 py-0.5 rounded border">
                    {phase.objective === "OUTCOME_SALES" ? "Sales" :
                     phase.objective === "OUTCOME_LEADS" ? "Leads" :
                     phase.objective === "OUTCOME_APP_PROMOTION" ? "App Promotion" :
                     phase.objective === "OUTCOME_ENGAGEMENT" ? "Engagement" :
                     phase.objective === "OUTCOME_TRAFFIC" ? "Traffic" :
                     phase.objective === "OUTCOME_AWARENESS" ? "Awareness" :
                     phase.objective}
                  </span>
                  <span className="bg-muted px-1.5 py-0.5 rounded border">{phase.audienceTypes}</span>
                  <span className="bg-muted px-1.5 py-0.5 rounded border">{phase.adFormats}</span>
                </div>
                <div className="text-[10px] text-muted-foreground/70">
                  {phase.automationFeatures} · {phase.billingType} · {phase.optimizationLocation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
