import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, GripVertical, Link2, ChevronDown, Copy, Trash2 } from "lucide-react";
import { Phase } from "./PlatformConfiguration";
import { format, addDays, differenceInDays, parseISO } from "date-fns";
import { platformAdFormats } from "@/utils/adFormats";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CampaignPublisherConfig } from "./CampaignPublisherConfig";
import { TargetingConfigComponent } from "./TargetingConfig";
import { getOptimizationGoalForFocus } from "@/utils/strategyFocusMapping";
import { BudgetTypeApplyDialog } from "./BudgetTypeApplyDialog";
import { PhaseAudienceSelector } from "./PhaseAudienceSelector";
import { UnifiedTargeting, UnifiedTargetingConfig } from "./UnifiedTargeting";
import { TiktokPhaseConfig } from "./TiktokPhaseConfig";
import { PhaseTaxonomyInputs } from "./PhaseTaxonomyInputs";
import { shortenValue } from "@/utils/taxonomyUtils";
import { 
  getObjectivesForPlatform, 
  getOptimizationGoalsForObjective, 
  getDefaultOptimizationGoal,
  detectPlatformType,
  type ObjectiveMapping 
} from "@/utils/objectiveOptimizationMapping";

interface PhaseSchedulerProps {
  phases: Phase[];
  onPhasesChange: (phases: Phase[]) => void;
  startDate: string;
  endDate: string;
  platformId?: string;
  platformName: string;
  strategyFocus?: string;
  strategy?: string;
  marketTargeting?: {
    ageMin?: number;
    ageMax?: number;
    gender?: string;
    devices?: string[];
    languages?: string[];
    os?: string[];
  };
  adAccountDefaults?: {
    hasDefaults: boolean;
    conversionBudgetType?: string;
    nonConversionBudgetType?: string;
    // Meta placement defaults
    publisherPlatforms?: string[];
    positions?: {
      facebook?: string[];
      instagram?: string[];
      audience_network?: string[];
      messenger?: string[];
      threads?: string[];
    };
    // TikTok placement defaults
    tiktokPlacementType?: string;
    tiktokPlacements?: string[];
  };
  onApplyBudgetTypeToAll?: (budgetType: "daily" | "lifetime") => void;
  onOpenCustomizeBudgetTypes?: () => void;
  marketBudget?: number;
  adAccountId?: string;
  basicTargeting?: UnifiedTargetingConfig;
}

interface DraggingState {
  phaseId: string;
  isStart: boolean;
  initialX: number;
}

export function PhaseScheduler({ 
  phases, 
  onPhasesChange, 
  startDate, 
  endDate, 
  platformId = "meta", 
  platformName, 
  strategyFocus, 
  strategy, 
  marketTargeting,
  adAccountDefaults,
  onApplyBudgetTypeToAll,
  onOpenCustomizeBudgetTypes,
  marketBudget,
  adAccountId,
  basicTargeting
}: PhaseSchedulerProps) {
  console.log("PhaseScheduler marketBudget:", marketBudget);
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<{ [key: string]: boolean }>({});
  const [budgetTypeDialogOpen, setBudgetTypeDialogOpen] = useState(false);
  const [pendingBudgetType, setPendingBudgetType] = useState<"daily" | "lifetime" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper to get default publishers and placements for platforms
  const getDefaultPublisherConfig = () => {
    // For TikTok, use adAccountDefaults if available
    if (platformId?.toLowerCase() === 'tiktok' || platformName.toLowerCase().includes('tiktok')) {
      return {
        tiktokPlacementType: adAccountDefaults?.tiktokPlacementType || 'PLACEMENT_TYPE_AUTOMATIC',
        tiktokPlacements: adAccountDefaults?.tiktokPlacements || ['PLACEMENT_TIKTOK'],
        publisherPlatforms: [],
        positions: {}
      };
    }
    
    // For Meta, use adAccountDefaults if available
    if (platformName.includes("Meta")) {
      // Use defaults from adAccountDefaults if available
      if (adAccountDefaults?.publisherPlatforms && adAccountDefaults.publisherPlatforms.length > 0) {
        return {
          publisherPlatforms: adAccountDefaults.publisherPlatforms,
          positions: adAccountDefaults.positions || {}
        };
      }
      
      // Fallback to hardcoded defaults
      const publishers = ["facebook", "instagram", "audience_network", "messenger", "threads"];
      const placementOptions: Record<string, Record<string, string[]>> = {
        "Facebook (Meta)": {
          facebook: ["feed", "instant_article", "instream_video", "marketplace", "right_column", "search", "video_feeds", "story"],
          instagram: ["stream", "story", "explore", "explore_home", "reels"],
          audience_network: ["native_banner_interstitial", "instream_video", "rewarded_video"],
          messenger: ["messenger_home", "sponsored_messages", "story"],
          threads: ["threads"]
        }
      };
      const placements = placementOptions["Facebook (Meta)"];
      const positions: any = {};
      publishers.forEach(pub => {
        if (placements[pub]) positions[pub] = placements[pub];
      });
      return { publisherPlatforms: publishers, positions };
    }
    return { publisherPlatforms: [], positions: {} };
  };

  // Initialize default phases if empty
  useEffect(() => {
    if (phases.length === 0 && startDate && endDate) {
  const campaignStart = parseISO(startDate);
  const campaignEnd = parseISO(endDate);
  const totalDays = differenceInDays(campaignEnd, campaignStart);

  const defaultPublisherConfig = getDefaultPublisherConfig();
      
      if (totalDays > 0) {
        // For manual strategy, start with one empty phase
        if (strategy === "manual") {
          const manualPhase: Phase = {
            id: `phase-${Date.now()}`,
            name: "Phase 1",
            startDate: format(campaignStart, "yyyy-MM-dd"),
            endDate: format(campaignEnd, "yyyy-MM-dd"),
            budgetPercentage: 100,
            assetTypes: [],
            isLoyaltyPhase: false,
            ...defaultPublisherConfig,
          };
          onPhasesChange([manualPhase]);
        } else {
          // Default phases for auto-detect and full-funnel
          const defaultPhases: Phase[] = [
            {
              id: "phase-awareness",
              name: "Awareness",
              startDate: format(campaignStart, "yyyy-MM-dd"),
              endDate: format(addDays(campaignStart, Math.floor(totalDays * 0.5)), "yyyy-MM-dd"),
              budgetPercentage: 50,
              assetTypes: [],
              isLoyaltyPhase: false,
              objective: strategyFocus ? getDefaultObjectiveForFocus(strategyFocus, "Awareness") : undefined,
              optimizationGoal: strategyFocus ? getOptimizationGoalForFocus(strategyFocus as any, platformId || "meta") : undefined,
              ...defaultPublisherConfig,
            },
            {
              id: "phase-consideration",
              name: "Consideration",
              startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.5)), "yyyy-MM-dd"),
              endDate: format(addDays(campaignStart, Math.floor(totalDays * 0.8)), "yyyy-MM-dd"),
              budgetPercentage: 30,
              assetTypes: [],
              isLoyaltyPhase: false,
              objective: strategyFocus ? getDefaultObjectiveForFocus(strategyFocus, "Consideration") : undefined,
              optimizationGoal: strategyFocus ? getOptimizationGoalForFocus(strategyFocus as any, platformId || "meta") : undefined,
              ...defaultPublisherConfig,
            },
            {
              id: "phase-conversion",
              name: "Conversion",
              startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.8)), "yyyy-MM-dd"),
              endDate: format(campaignEnd, "yyyy-MM-dd"),
              budgetPercentage: 20,
              assetTypes: [],
              isLoyaltyPhase: false,
              objective: strategyFocus ? getDefaultObjectiveForFocus(strategyFocus, "Conversion") : undefined,
              optimizationGoal: strategyFocus ? getOptimizationGoalForFocus(strategyFocus as any, platformId || "meta") : undefined,
              ...defaultPublisherConfig,
            },
            {
              id: "phase-loyalty",
              name: "Loyalty",
              startDate: format(campaignStart, "yyyy-MM-dd"),
              endDate: format(campaignEnd, "yyyy-MM-dd"),
              budgetPercentage: 0,
              assetTypes: [],
              isLoyaltyPhase: true,
              objective: "Conversions",
              optimizationGoal: "Value",
              ...defaultPublisherConfig,
            },
          ];
          onPhasesChange(defaultPhases);
        }
      }
    }
  }, [startDate, endDate, strategy]);

  // Helper function to get default objective based on strategy focus and phase
  const getDefaultObjectiveForFocus = (focus: string, phaseName: string): string => {
    if (focus === "conversions") {
      return phaseName === "Awareness" ? "Brand Awareness" : phaseName === "Consideration" ? "Traffic" : "Conversions";
    } else if (focus === "leads") {
      return phaseName === "Awareness" ? "Brand Awareness" : phaseName === "Consideration" ? "Traffic" : "Lead Generation";
    } else if (focus === "brand-awareness") {
      return phaseName === "Conversion" ? "Conversions" : "Brand Awareness";
    } else if (focus === "app-installs") {
      return phaseName === "Awareness" ? "Brand Awareness" : "App Installs";
    }
    return "Conversions";
  };

  // Validate dates
  if (!startDate || !endDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please select activation start and end dates first to enable phase scheduling.
          </p>
        </CardContent>
      </Card>
    );
  }

  const campaignStart = parseISO(startDate);
  const campaignEnd = parseISO(endDate);
  
  // Check if dates are valid
  if (isNaN(campaignStart.getTime()) || isNaN(campaignEnd.getTime())) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Invalid dates selected. Please check your activation dates.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  const totalDays = differenceInDays(campaignEnd, campaignStart);

  if (totalDays <= 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            End date must be after start date to schedule phases.
          </p>
        </CardContent>
      </Card>
    );
  }

  const dateToPosition = (dateStr: string): number => {
    if (!dateStr || totalDays <= 0) return 0;
    const date = parseISO(dateStr);
    const days = differenceInDays(date, campaignStart);
    return (days / totalDays) * 100;
  };

  const positionToDate = (position: number): string => {
    if (totalDays <= 0) return format(campaignStart, "yyyy-MM-dd");
    const days = Math.round((position / 100) * totalDays);
    return format(addDays(campaignStart, days), "yyyy-MM-dd");
  };

  const handleMouseDown = (phaseId: string, isStart: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    setDragging({ phaseId, isStart, initialX: e.clientX });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const position = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newDate = positionToDate(position);

    const updatedPhases = phases.map(phase => {
      if (phase.id === dragging.phaseId) {
        if (dragging.isStart) {
          return { ...phase, startDate: newDate };
        } else {
          return { ...phase, endDate: newDate };
        }
      }
      return phase;
    });

    onPhasesChange(updatedPhases);
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  useEffect(() => {
    if (dragging) {
      const handleGlobalMouseUp = () => handleMouseUp();
      window.addEventListener("mouseup", handleGlobalMouseUp);
      return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
    }
  }, [dragging]);

  const addPhase = () => {
    const defaultPublisherConfig = getDefaultPublisherConfig();
    const newPhase: Phase = {
      id: `phase-${Date.now()}`,
      name: `Phase ${phases.length + 1}`,
      startDate: format(campaignStart, "yyyy-MM-dd"),
      endDate: format(addDays(campaignStart, 7), "yyyy-MM-dd"),
      budgetPercentage: 0,
      ...defaultPublisherConfig,
    };
    onPhasesChange([...phases, newPhase]);
  };

  const removePhase = (phaseId: string) => {
    onPhasesChange(phases.filter(p => p.id !== phaseId));
  };

  const duplicatePhase = (phaseId: string) => {
    const phaseToDuplicate = phases.find(p => p.id === phaseId);
    if (!phaseToDuplicate) return;
    
    const newPhase = {
      ...phaseToDuplicate,
      id: `phase-${Date.now()}`,
      name: `${phaseToDuplicate.name} (Copy)`,
    };
    onPhasesChange([...phases, newPhase]);
  };

  const updatePhaseName = (phaseId: string, name: string) => {
    onPhasesChange(phases.map(p => p.id === phaseId ? { ...p, name } : p));
    setEditingName(null);
  };

  const updatePhaseBudget = (phaseId: string, budget: number) => {
    onPhasesChange(phases.map(p => p.id === phaseId ? { ...p, budgetPercentage: budget } : p));
  };

  const snapToPreviousPhase = (phaseId: string) => {
    const currentIndex = phases.findIndex(p => p.id === phaseId);
    if (currentIndex <= 0) return;

    const previousPhase = phases[currentIndex - 1];
    const updatedPhases = phases.map(p => 
      p.id === phaseId ? { ...p, startDate: previousPhase.endDate } : p
    );
    onPhasesChange(updatedPhases);
  };

  const toggleAssetType = (phaseId: string, assetType: string) => {
    onPhasesChange(phases.map(p => {
      if (p.id === phaseId) {
        const currentTypes = p.assetTypes || [];
        const newTypes = currentTypes.includes(assetType)
          ? currentTypes.filter(t => t !== assetType)
          : [...currentTypes, assetType];
        return { ...p, assetTypes: newTypes };
      }
      return p;
    }));
  };

  const updateBudgetValue = (phaseId: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      updatePhaseBudget(phaseId, numValue);
    }
  };

  const updatePhaseField = (phaseId: string, field: string, value: any) => {
    console.log("📝 updatePhaseField called:", { phaseId, field, value });
    const updatedPhases = phases.map(p => p.id === phaseId ? { ...p, [field]: value } : p);
    const updatedPhase = updatedPhases.find(p => p.id === phaseId);
    console.log("📋 Updated phase full object:", updatedPhase);
    console.log(`📋 Updated phase.${field}:`, updatedPhase?.[field]);
    onPhasesChange(updatedPhases);
  };

  const updatePhaseFields = (phaseId: string, updates: Record<string, any>) => {
    console.log("📝 updatePhaseFields called:", { phaseId, updates });
    const updatedPhases = phases.map(p => p.id === phaseId ? { ...p, ...updates } : p);
    onPhasesChange(updatedPhases);
  };

  // Detect platform type for mapping
  const detectedPlatform = detectPlatformType(platformName);
  
  // Get objectives from the centralized mapping
  const getAvailableObjectives = (): ObjectiveMapping[] => {
    if (detectedPlatform) {
      return getObjectivesForPlatform(detectedPlatform);
    }
    // Fallback for unsupported platforms
    return [
      { value: "Awareness", label: "Awareness", optimizationGoals: [{ value: "REACH", label: "Reach" }] },
      { value: "Consideration", label: "Consideration", optimizationGoals: [{ value: "CLICKS", label: "Clicks" }] },
      { value: "Conversion", label: "Conversion", optimizationGoals: [{ value: "CONVERSIONS", label: "Conversions" }] },
    ];
  };

  // Get optimization goals for a specific objective
  const getOptimizationGoalsForPhase = (objective: string) => {
    if (!objective || !detectedPlatform) return [];
    return getOptimizationGoalsForObjective(detectedPlatform, objective);
  };

  // Auto-select optimization goal based on objective and platform
  const getAutoOptimizationGoal = (objective: string): string => {
    if (!detectedPlatform) return "";
    const defaultGoal = getDefaultOptimizationGoal(detectedPlatform, objective);
    return defaultGoal || "";
  };

  const togglePhaseExpansion = (phaseId: string) => {
    setExpandedPhases(prev => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  const getPhaseColor = (index: number) => {
    const colors = [
      "bg-blue-500/20 border-blue-500",
      "bg-purple-500/20 border-purple-500",
      "bg-green-500/20 border-green-500",
      "bg-orange-500/20 border-orange-500",
    ];
    return colors[index % colors.length];
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Phase Timeline</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addPhase}>
            <Plus className="h-3 w-3 mr-1" />
            Add Phase
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {format(campaignStart, "MMM d, yyyy")} - {format(campaignEnd, "MMM d, yyyy")} ({totalDays + 1} days)
        </p>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="relative h-48 bg-muted/30 rounded-lg border"
          onMouseMove={handleMouseMove}
        >
          {/* Timeline markers */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="flex-1 border-r border-muted-foreground/10 last:border-r-0">
                <div className="text-[10px] text-muted-foreground/60 px-1 pt-1">
                  {format(addDays(campaignStart, (totalDays * i) / 10), "MMM d")}
                </div>
              </div>
            ))}
          </div>

          {/* Phase bars */}
          {phases.filter(p => !p.isLoyaltyPhase).map((phase, index) => {
            const startPos = dateToPosition(phase.startDate);
            const endPos = dateToPosition(phase.endDate);
            const width = endPos - startPos;
            const canSnap = index > 0;
            const phaseDays = phase.startDate && phase.endDate ? 
              differenceInDays(parseISO(phase.endDate), parseISO(phase.startDate)) + 1 : 0;
            const timePercentage = totalDays > 0 ? Math.round((phaseDays / (totalDays + 1)) * 100) : 0;

            return (
              <div
                key={phase.id}
                className={`absolute h-12 ${getPhaseColor(index)} border-2 rounded-md transition-all hover:shadow-lg`}
                style={{
                  left: `${startPos}%`,
                  width: `${width}%`,
                  top: `${28 + index * 24}px`,
                  zIndex: dragging?.phaseId === phase.id ? 20 : 10,
                }}
              >
                {/* Start handle */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-current opacity-50 hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => handleMouseDown(phase.id, true, e)}
                >
                  <GripVertical className="h-3 w-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>

                {/* Phase content */}
                <div className="px-3 py-1 flex items-center justify-between h-full">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {canSnap && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={() => snapToPreviousPhase(phase.id)}
                        title="Snap to previous phase"
                      >
                        <Link2 className="h-3 w-3" />
                      </Button>
                    )}
                    {editingName === phase.id ? (
                      <Input
                        value={phase.name}
                        onChange={(e) => onPhasesChange(phases.map(p => p.id === phase.id ? { ...p, name: e.target.value } : p))}
                        onBlur={() => setEditingName(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingName(null)}
                        className="h-6 text-xs px-1 py-0"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="text-xs font-medium truncate cursor-pointer hover:underline"
                        onClick={() => setEditingName(phase.id)}
                        title={phase.name}
                      >
                        {phase.name}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {timePercentage}%
                    </Badge>
                    {editingBudget === phase.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={phase.budgetPercentage}
                          onChange={(e) => updateBudgetValue(phase.id, e.target.value)}
                          onBlur={() => setEditingBudget(null)}
                          onKeyDown={(e) => e.key === "Enter" && setEditingBudget(null)}
                          className="h-6 w-16 text-xs px-1 py-0"
                          min="0"
                          max="100"
                          autoFocus
                        />
                        <span className="text-[10px]">%</span>
                      </div>
                    ) : (
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] cursor-pointer"
                        onClick={() => setEditingBudget(phase.id)}
                      >
                        Budget: {phase.budgetPercentage}%
                      </Badge>
                    )}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">
                          Assets
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="start">
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs font-semibold">Asset Types</Label>
                            <p className="text-[10px] text-muted-foreground mt-1">Select formats for this phase</p>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {platformAdFormats[platformId]?.map((format) => (
                              <div key={format} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${phase.id}-${format}`}
                                  checked={phase.assetTypes?.includes(format)}
                                  onCheckedChange={() => toggleAssetType(phase.id, format)}
                                />
                                <label
                                  htmlFor={`${phase.id}-${format}`}
                                  className="text-xs cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  {format}
                                </label>
                              </div>
                            ))}
                          </div>
                          <div className="pt-2 border-t text-xs text-muted-foreground">
                            {phase.startDate && phase.endDate ? 
                              `${format(parseISO(phase.startDate), "MMM d")} - ${format(parseISO(phase.endDate), "MMM d, yyyy")}`
                              : "Dates not set"}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-accent"
                      onClick={() => duplicatePhase(phase.id)}
                      title="Duplicate phase"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-destructive/20"
                      onClick={() => removePhase(phase.id)}
                      title="Delete phase"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* End handle */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-current opacity-50 hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => handleMouseDown(phase.id, false, e)}
                >
                  <GripVertical className="h-3 w-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
              </div>
            );
          })}

          {/* Loyalty phase - editable timeline */}
          {phases.filter(p => p.isLoyaltyPhase).map((phase) => {
            const startPos = dateToPosition(phase.startDate);
            const endPos = dateToPosition(phase.endDate);
            const width = endPos - startPos;
            const phaseDays = phase.startDate && phase.endDate ? 
              differenceInDays(parseISO(phase.endDate), parseISO(phase.startDate)) + 1 : 0;
            const timePercentage = totalDays > 0 ? Math.round((phaseDays / (totalDays + 1)) * 100) : 0;
            
            return (
              <div
                key={phase.id}
                className="absolute h-8 bg-amber-500/10 border border-amber-500 border-dashed rounded-md"
                style={{
                  left: `${startPos}%`,
                  width: `${width}%`,
                  top: `${28 + (phases.filter(p => !p.isLoyaltyPhase).length) * 24}px`,
                  zIndex: dragging?.phaseId === phase.id ? 20 : 5,
                }}
              >
                {/* Start handle */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-amber-500 opacity-50 hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => handleMouseDown(phase.id, true, e)}
                >
                  <GripVertical className="h-3 w-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="px-3 py-1 flex items-center justify-between h-full">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {editingName === phase.id ? (
                      <Input
                        value={phase.name}
                        onChange={(e) => onPhasesChange(phases.map(p => p.id === phase.id ? { ...p, name: e.target.value } : p))}
                        onBlur={() => setEditingName(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingName(null)}
                        className="h-5 text-xs px-1 py-0"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="text-xs font-medium truncate cursor-pointer hover:underline"
                        onClick={() => setEditingName(phase.id)}
                        title={phase.name}
                      >
                        {phase.name}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {timePercentage}%
                    </Badge>
                    {editingBudget === phase.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={phase.budgetPercentage}
                          onChange={(e) => updateBudgetValue(phase.id, e.target.value)}
                          onBlur={() => setEditingBudget(null)}
                          onKeyDown={(e) => e.key === "Enter" && setEditingBudget(null)}
                          className="h-5 w-16 text-xs px-1 py-0"
                          min="0"
                          max="100"
                          autoFocus
                        />
                        <span className="text-[10px]">%</span>
                      </div>
                    ) : (
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] cursor-pointer"
                        onClick={() => setEditingBudget(phase.id)}
                      >
                        Budget: {phase.budgetPercentage}%
                      </Badge>
                    )}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px]">
                          Assets
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="start">
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs font-semibold">Asset Types</Label>
                            <p className="text-[10px] text-muted-foreground mt-1">Select formats for loyalty phase</p>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {platformAdFormats[platformId]?.map((format) => (
                              <div key={format} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${phase.id}-${format}`}
                                  checked={phase.assetTypes?.includes(format)}
                                  onCheckedChange={() => toggleAssetType(phase.id, format)}
                                />
                                <label
                                  htmlFor={`${phase.id}-${format}`}
                                  className="text-xs cursor-pointer leading-none"
                                >
                                  {format}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 hover:bg-accent"
                      onClick={() => duplicatePhase(phase.id)}
                      title="Duplicate phase"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 hover:bg-destructive/20"
                      onClick={() => removePhase(phase.id)}
                      title="Delete phase"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* End handle */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-amber-500 opacity-50 hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => handleMouseDown(phase.id, false, e)}
                >
                  <GripVertical className="h-3 w-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Phase configuration list */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-semibold">Phase Configuration</Label>
            <p className="text-xs text-muted-foreground">Configure objectives, targeting, and placements for each phase</p>
          </div>
          
          {phases.map((phase, index) => {
            const phaseDays = phase.startDate && phase.endDate ? 
              differenceInDays(parseISO(phase.endDate), parseISO(phase.startDate)) + 1 : 0;
            const availableObjectives = getAvailableObjectives();
            
            return (
              <Collapsible
                key={phase.id}
                open={expandedPhases[phase.id]}
                onOpenChange={() => togglePhaseExpansion(phase.id)}
              >
                <div className="border rounded-lg bg-card">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded ${phase.isLoyaltyPhase ? 'bg-amber-500/40' : getPhaseColor(index).split(" ")[0]}`} />
                        <span className="font-medium">{phase.name}</span>
                        {phase.startDate && phase.endDate && (
                          <Badge variant="outline" className="text-xs">
                            {format(parseISO(phase.startDate), "MMM d")} - {format(parseISO(phase.endDate), "MMM d")} ({phaseDays} days)
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {phase.budgetPercentage}% budget
                        </Badge>
                      </div>
                      <ChevronDown className={`h-4 w-4 transition-transform ${expandedPhases[phase.id] ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="p-4 pt-0 space-y-4 border-t">
                      {/* Targeting Summary */}
                      {marketTargeting && (
                        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                          <Label className="text-sm font-semibold">Inherited Targeting</Label>
                          <div className="text-xs text-muted-foreground space-y-1">
                            {(marketTargeting.ageMin || marketTargeting.ageMax) && (
                              <div className="flex justify-between">
                                <span>Age Range:</span>
                                <span className="font-medium text-foreground">
                                  {marketTargeting.ageMin || 18} - {marketTargeting.ageMax || 65}
                                </span>
                              </div>
                            )}
                            {marketTargeting.gender && marketTargeting.gender !== 'all' && (
                              <div className="flex justify-between">
                                <span>Gender:</span>
                                <span className="font-medium text-foreground">
                                  {marketTargeting.gender === '1' ? 'Male' : marketTargeting.gender === '2' ? 'Female' : 'All'}
                                </span>
                              </div>
                            )}
                            {marketTargeting.languages && marketTargeting.languages.length > 0 && !marketTargeting.languages.includes('all') && (
                              <div className="flex justify-between">
                                <span>Languages:</span>
                                <span className="font-medium text-foreground">
                                  {marketTargeting.languages.length} selected
                                </span>
                              </div>
                            )}
                            {marketTargeting.devices && marketTargeting.devices.length > 0 && !marketTargeting.devices.includes('all') && (
                              <div className="flex justify-between">
                                <span>Devices:</span>
                                <span className="font-medium text-foreground">
                                  {marketTargeting.devices.length} selected
                                </span>
                              </div>
                            )}
                            {marketTargeting.os && marketTargeting.os.length > 0 && !marketTargeting.os.includes('all') && (
                              <div className="flex justify-between">
                                <span>Operating Systems:</span>
                                <span className="font-medium text-foreground">
                                  {marketTargeting.os.length} selected
                                </span>
                              </div>
                            )}
                            {/* Show detailed targeting counts for brand awareness phases */}
                            {!phase.overrideTargeting &&
                              (phase.objective?.toLowerCase().includes('awareness') || 
                              phase.objective?.toLowerCase().includes('reach') ||
                              phase.optimizationGoal?.toLowerCase().includes('awareness') ||
                              phase.optimizationGoal?.toLowerCase().includes('reach')) &&
                              basicTargeting?.selectedItems && basicTargeting.selectedItems.length > 0 && (
                              <div className="flex justify-between pt-2 border-t">
                                <span>Detailed Targeting:</span>
                                <div className="flex flex-col gap-2">
                                  {/* Unified Targeting */}
                                  <div className="flex gap-2 items-center flex-wrap">
                                    <Badge variant="outline" className="text-xs">
                                      {basicTargeting.selectedItems.length} Selected
                                    </Badge>
                                    {basicTargeting.selectedItems.filter(item => item.platforms.length === 2).length > 0 && (
                                      <Badge variant="secondary" className="text-xs">
                                        {basicTargeting.selectedItems.filter(item => item.platforms.length === 2).length} Both Platforms
                                      </Badge>
                                    )}
                                    {basicTargeting.selectedItems.filter(item => item.platforms.includes('meta') && item.platforms.length === 1).length > 0 && (
                                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                        {basicTargeting.selectedItems.filter(item => item.platforms.includes('meta') && item.platforms.length === 1).length} Meta Only
                                      </Badge>
                                    )}
                                    {basicTargeting.selectedItems.filter(item => item.platforms.includes('tiktok') && item.platforms.length === 1).length > 0 && (
                                      <Badge variant="outline" className="text-xs bg-pink-50 text-pink-700 border-pink-200">
                                        {basicTargeting.selectedItems.filter(item => item.platforms.includes('tiktok') && item.platforms.length === 1).length} TikTok Only
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Objective Selection */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`objective-${phase.id}`}>Campaign Objective</Label>
                          {phase.objective && phase.optimizationGoal && (
                            <Badge variant="secondary" className="text-xs">
                              Goal: {getOptimizationGoalsForPhase(phase.objective).find(g => g.value === phase.optimizationGoal)?.label || phase.optimizationGoal}
                            </Badge>
                          )}
                        </div>
                        <Select
                          value={phase.objective || ""}
                          onValueChange={(value) => {
                            const isTikTok = platformName.toLowerCase().includes('tiktok');
                            let adjustedObjective = value;
                            
                            // TikTok conversion campaigns require 90+ days of pixel data
                            // Automatically switch to Traffic objective for better success rate
                            if (isTikTok && (value === "CONVERSIONS" || value === "PRODUCT_SALES")) {
                              console.warn("⚠️ TikTok conversion objective auto-adjusted to Traffic");
                              adjustedObjective = "TRAFFIC";
                            }
                            
                            const updatedPhases = phases.map(p => {
                              if (p.id === phase.id) {
                                // Auto-set optimization goal based on objective and platform
                                const autoGoal = getAutoOptimizationGoal(adjustedObjective);
                                return { ...p, objective: adjustedObjective, optimizationGoal: autoGoal };
                              }
                              return p;
                            });
                            onPhasesChange(updatedPhases);
                          }}
                        >
                          <SelectTrigger id={`objective-${phase.id}`}>
                            <SelectValue placeholder="Select objective" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableObjectives.map((obj) => (
                              <SelectItem key={obj.value} value={obj.value}>
                                {obj.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Optimization Goal */}
                      <div className="space-y-2">
                        <Label htmlFor={`optimization-${phase.id}`}>Optimization Goal</Label>
                        <Select
                          value={phase.optimizationGoal || ""}
                          onValueChange={(value) => updatePhaseField(phase.id, "optimizationGoal", value)}
                          disabled={!phase.objective}
                        >
                          <SelectTrigger id={`optimization-${phase.id}`} className={!phase.objective ? 'opacity-50' : ''}>
                            <SelectValue placeholder={phase.objective ? "Select optimization goal" : "Select objective first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {getOptimizationGoalsForPhase(phase.objective || "").map((goal) => (
                              <SelectItem key={goal.value} value={goal.value}>
                                {goal.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Budget Type - Inline with validation */}
                      <div className={`p-4 rounded-lg border-2 ${!phase.budgetType ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20' : 'border-border bg-muted/50'}`}>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="font-medium">Budget Type *</Label>
                            {!phase.budgetType && (
                              <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-300">
                                Required
                              </Badge>
                            )}
                          </div>
                          <Select
                            value={phase.budgetType || "none"}
                            onValueChange={(value: string) => {
                              const bt = value === "none" ? null : (value as "daily" | "lifetime");
                              onPhasesChange(phases.map(p => p.id === phase.id ? { ...p, budgetType: bt } : p));
                              
                              // If no defaults are set, ask if user wants to apply to all
                              if (!adAccountDefaults?.hasDefaults && onApplyBudgetTypeToAll && bt) {
                                setPendingBudgetType(bt);
                                setBudgetTypeDialogOpen(true);
                              }
                            }}
                          >
                            <SelectTrigger className={!phase.budgetType ? 'border-yellow-500' : ''}>
                              <SelectValue placeholder="Select budget type" />
                            </SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            <SelectItem value="none">None (not set)</SelectItem>
                            <SelectItem value="daily">Daily Budget</SelectItem>
                            <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                          </SelectContent>
                          </Select>
                          {!phase.budgetType && (
                            <p className="text-xs text-yellow-700 dark:text-yellow-300">Please select a budget type to continue</p>
                          )}
                          
                          {/* Daily Budget Breakdown */}
                          {(() => {
                            console.log("Phase:", phase.id, "budgetType:", phase.budgetType, "marketBudget:", marketBudget);
                            return phase.budgetType === "daily" && marketBudget && marketBudget > 0 ? (
                              <div className="mt-3 p-3 rounded-md bg-muted/30 border border-border">
                                <div className="text-xs font-semibold text-muted-foreground mb-2">Daily Budget Breakdown</div>
                              <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Phase Budget:</span>
                                  <span className="font-medium">${((marketBudget * phase.budgetPercentage) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Duration:</span>
                                  <span className="font-medium">
                                    {(() => {
                                      const start = parseISO(phase.startDate);
                                      const end = parseISO(phase.endDate);
                                      const duration = differenceInDays(end, start) + 1;
                                      return `${duration} day${duration !== 1 ? 's' : ''}`;
                                    })()}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-border">
                                  <span className="text-muted-foreground font-medium">Daily Budget:</span>
                                  <span className="font-semibold text-primary">
                                    ${(() => {
                                      const start = parseISO(phase.startDate);
                                      const end = parseISO(phase.endDate);
                                      const duration = differenceInDays(end, start) + 1;
                                      const phaseBudget = (marketBudget * phase.budgetPercentage) / 100;
                                      const dailyBudget = phaseBudget / duration;
                                      return dailyBudget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    })()}
                                  </span>
                                </div>
                              </div>
                            </div>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      {/* Publisher Platforms & Placements */}
                      <div className="space-y-2">
                        <CampaignPublisherConfig
                          platformName={platformName}
                          publisherPlatforms={phase.publisherPlatforms || []}
                          positions={phase.positions || {}}
                          advantagePlusPlacements={phase.advantagePlusPlacements}
                          onPublisherPlatformsChange={(publishers) => 
                            updatePhaseField(phase.id, "publisherPlatforms", publishers)
                          }
                          onPositionsChange={(positions) => 
                            updatePhaseField(phase.id, "positions", positions)
                          }
                          onAdvantagePlusPlacementsChange={(enabled) =>
                            updatePhaseField(phase.id, "advantagePlusPlacements", enabled)
                          }
                        />
                      </div>

                      {/* Campaign Taxonomy */}
                      {adAccountId && (
                        <PhaseTaxonomyInputs
                          adAccountId={adAccountId}
                          platform={platformId?.toLowerCase() === 'tiktok' ? 'tiktok' : 'meta'}
                          entityType="campaign"
                          taxonomyValues={phase.campaignTaxonomyValues || {}}
                          onValuesChange={(values) => updatePhaseField(phase.id, "campaignTaxonomyValues", values)}
                          contextValues={{
                            objective: phase.objective ? shortenValue('objective', phase.objective) : undefined,
                            optimizationGoal: phase.optimizationGoal ? shortenValue('optimizationGoal', phase.optimizationGoal) : undefined,
                            funnelStage: phase.funnelStage ? shortenValue('funnelStage', phase.funnelStage) : undefined,
                          }}
                        />
                      )}

                      {/* Ad Set Taxonomy */}
                      {adAccountId && (
                        <PhaseTaxonomyInputs
                          adAccountId={adAccountId}
                          platform={platformId?.toLowerCase() === 'tiktok' ? 'tiktok' : 'meta'}
                          entityType="adset"
                          taxonomyValues={phase.adsetTaxonomyValues || {}}
                          onValuesChange={(values) => updatePhaseField(phase.id, "adsetTaxonomyValues", values)}
                          contextValues={{
                            optimizationGoal: phase.optimizationGoal ? shortenValue('optimizationGoal', phase.optimizationGoal) : undefined,
                            placement: phase.advantagePlusPlacements ? 'AUTO' : 
                              (phase.publisherPlatforms?.length ? shortenValue('placement', phase.publisherPlatforms[0]) : undefined),
                            bidStrategy: phase.metaBidStrategy ? shortenValue('bidStrategy', phase.metaBidStrategy) : 
                              (phase.tiktokBidStrategy ? shortenValue('bidStrategy', phase.tiktokBidStrategy) : undefined),
                          }}
                        />
                      )}

                      {/* Phase-Level Targeting Override - Available for all objectives */}
                      {basicTargeting && (
                        basicTargeting.selectedItems && basicTargeting.selectedItems.length > 0 ||
                        basicTargeting.ageMin !== undefined ||
                        basicTargeting.genders?.length ||
                        basicTargeting.devices?.length
                      ) && (
                        <div className="border rounded-lg p-4 bg-muted/30">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Override Campaign Targeting</span>
                              {phase.overrideTargeting && (
                                <Badge variant="secondary" className="text-xs">Active</Badge>
                              )}
                            </div>
                            <Switch
                              checked={phase.overrideTargeting === true}
                              onCheckedChange={(checked) => {
                                console.log('🔄 Switch onCheckedChange:', { checked, currentValue: phase.overrideTargeting, phaseId: phase.id });
                                const isTikTok = platformId === 'tiktok';
                                
                                if (checked) {
                                  // When enabling override, initialize with preset if not already customized
                                  if (!phase.targeting && basicTargeting) {
                                    const phaseTargeting: UnifiedTargetingConfig = {
                                      ageMin: basicTargeting.ageMin,
                                      ageMax: basicTargeting.ageMax,
                                      genders: basicTargeting.genders ? [...basicTargeting.genders] : [],
                                      devices: basicTargeting.devices ? [...basicTargeting.devices] : [],
                                      os: basicTargeting.os ? [...basicTargeting.os] : [],
                                      languages: basicTargeting.languages ? [...basicTargeting.languages] : [],
                                      selectedItems: basicTargeting.selectedItems ? 
                                        basicTargeting.selectedItems.filter(item => 
                                          isTikTok ? item.platforms.includes('tiktok') : item.platforms.includes('meta')
                                        ) : []
                                    };
                                    console.log('🔄 Setting override ON with targeting:', phaseTargeting);
                                    updatePhaseFields(phase.id, { overrideTargeting: true, targeting: phaseTargeting });
                                  } else {
                                    console.log('🔄 Setting override ON (no targeting init needed)');
                                    updatePhaseField(phase.id, "overrideTargeting", true);
                                  }
                                } else {
                                  // When disabling override, reset to preset
                                  const presetCopy: UnifiedTargetingConfig | undefined = basicTargeting ? {
                                    ageMin: basicTargeting.ageMin,
                                    ageMax: basicTargeting.ageMax,
                                    genders: basicTargeting.genders ? [...basicTargeting.genders] : [],
                                    devices: basicTargeting.devices ? [...basicTargeting.devices] : [],
                                    os: basicTargeting.os ? [...basicTargeting.os] : [],
                                    languages: basicTargeting.languages ? [...basicTargeting.languages] : [],
                                    selectedItems: basicTargeting.selectedItems ? 
                                      basicTargeting.selectedItems.filter(item => 
                                        isTikTok ? item.platforms.includes('tiktok') : item.platforms.includes('meta')
                                      ) : []
                                  } : undefined;
                                  
                                  console.log('🔄 Setting override OFF, resetting to preset:', presetCopy);
                                  updatePhaseFields(phase.id, { overrideTargeting: false, targeting: presetCopy });
                                }
                              }}
                            />
                          </div>
                          {phase.overrideTargeting && (
                            <div className="pt-4 border-t mt-4">
                              {phase.targeting && (
                                <>
                                  {console.log('[PhaseScheduler] Rendering BasicTargeting:', { 
                                    platformId, 
                                    adAccountId,
                                    phaseId: phase.id,
                                    metaAdAccountId: platformId === 'meta' ? adAccountId : undefined,
                                    tiktokAdvertiserId: platformId === 'tiktok' ? adAccountId : undefined
                                  })}
                                  <UnifiedTargeting
                                    key={`phase-targeting-${phase.id}-${phase.overrideTargeting}`}
                                    targeting={phase.targeting as UnifiedTargetingConfig}
                                    onUpdate={(targeting) => updatePhaseField(phase.id, "targeting", targeting)}
                                    metaAdAccountId={platformId === 'meta' ? adAccountId : undefined}
                                    tiktokAdvertiserId={platformId === 'tiktok' ? adAccountId : undefined}
                                  />
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* TikTok Advanced Settings - Platform-specific */}
                      {platformId?.toLowerCase() === 'tiktok' && (
                        <TiktokPhaseConfig
                          phase={phase}
                          onUpdate={(field, value) => {
                            console.log("🔄 PhaseScheduler onUpdate called:", { phaseId: phase.id, field, value });
                            updatePhaseField(phase.id, field as keyof Phase, value);
                          }}
                        />
                      )}

                      {/* Audience Selection */}
                      {adAccountId && phase.objective && phase.optimizationGoal && (
                        <div className="space-y-3 border-t pt-4 mt-4">
                          <div className="flex items-center gap-2">
                            <Label>Audience Selection</Label>
                            <Badge variant="secondary" className="text-xs">
                              Based on {phase.objective} / {phase.optimizationGoal}
                            </Badge>
                          </div>
                          <PhaseAudienceSelector
                            phaseName={phase.name}
                            phaseId={phase.id}
                            phaseObjective={phase.objective}
                            phaseOptimizationGoal={phase.optimizationGoal}
                            adAccountId={adAccountId}
                            platform={platformName}
                            basicTargeting={undefined}
                            overrideTargeting={phase.overrideTargeting}
                            onAudiencesSelected={(audiences) => {
                              updatePhaseField(phase.id, "audiences", audiences);
                            }}
                            initialSelection={phase.audiences || []}
                          />
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
          
          {phases.length > 0 && (
            <div className="flex items-center justify-between text-xs font-semibold pt-2 border-t mt-4">
              <span>Total Budget Allocation</span>
              <span className={phases.reduce((sum, p) => sum + p.budgetPercentage, 0) === 100 ? "text-primary" : "text-destructive"}>
                {phases.reduce((sum, p) => sum + p.budgetPercentage, 0)}%
              </span>
            </div>
          )}
        </div>
      </CardContent>

      {/* Budget Type Apply Dialog */}
      {pendingBudgetType && (
        <BudgetTypeApplyDialog
          open={budgetTypeDialogOpen}
          onOpenChange={setBudgetTypeDialogOpen}
          budgetType={pendingBudgetType}
          onConfirm={() => {
            if (onApplyBudgetTypeToAll && pendingBudgetType) {
              onApplyBudgetTypeToAll(pendingBudgetType);
            }
          }}
          onCustomize={onOpenCustomizeBudgetTypes}
        />
      )}
    </Card>
  );
}
