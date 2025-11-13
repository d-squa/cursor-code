import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, GripVertical, Link2, ChevronDown } from "lucide-react";
import { Phase } from "./PlatformConfiguration";
import { format, addDays, differenceInDays, parseISO } from "date-fns";
import { platformAdFormats } from "@/utils/adFormats";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CampaignPublisherConfig } from "./CampaignPublisherConfig";
import { TargetingConfigComponent } from "./TargetingConfig";
import { getOptimizationGoalForFocus } from "@/utils/strategyFocusMapping";

interface PhaseSchedulerProps {
  phases: Phase[];
  onPhasesChange: (phases: Phase[]) => void;
  startDate: string;
  endDate: string;
  platformId?: string;
  platformName: string;
}

interface DraggingState {
  phaseId: string;
  isStart: boolean;
  initialX: number;
}

// Platform-specific objective mappings
const platformObjectiveMapping: Record<string, Record<string, string[]>> = {
  "Facebook (Meta)": {
    "Awareness": ["Brand Awareness", "Reach"],
    "Consideration": ["Traffic", "Engagement", "App Installs", "Video Views", "Lead Generation"],
    "Conversion": ["Conversions", "Catalog Sales"],
  },
  "Instagram (Meta)": {
    "Awareness": ["Brand Awareness", "Reach"],
    "Consideration": ["Traffic", "Engagement", "Video Views"],
    "Conversion": ["Conversions", "Shopping"],
  },
  "Google Ads": {
    "Awareness": ["Display", "Video", "Discovery"],
    "Consideration": ["Search", "Shopping", "Video"],
    "Conversion": ["Performance Max", "Shopping", "Search"],
  },
  "YouTube (Google)": {
    "Awareness": ["Video Reach", "Brand Awareness"],
    "Consideration": ["Video Views", "Consideration"],
    "Conversion": ["Conversions", "Action"],
  },
  "LinkedIn": {
    "Awareness": ["Brand Awareness", "Reach"],
    "Consideration": ["Website Visits", "Engagement", "Video Views"],
    "Conversion": ["Lead Generation", "Conversions"],
  },
  "TikTok": {
    "Awareness": ["Reach", "Video Views"],
    "Consideration": ["Traffic", "Community Interaction"],
    "Conversion": ["Conversions", "App Installs"],
  },
};

export function PhaseScheduler({ phases, onPhasesChange, startDate, endDate, platformId = "meta", platformName }: PhaseSchedulerProps) {
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<{ [key: string]: boolean }>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize default phases if empty
  useEffect(() => {
    if (phases.length === 0 && startDate && endDate) {
      const campaignStart = parseISO(startDate);
      const campaignEnd = parseISO(endDate);
      const totalDays = differenceInDays(campaignEnd, campaignStart);
      
      if (totalDays > 0) {
        const defaultPhases: Phase[] = [
          {
            id: "phase-awareness",
            name: "Awareness",
            startDate: format(campaignStart, "yyyy-MM-dd"),
            endDate: format(addDays(campaignStart, Math.floor(totalDays * 0.5)), "yyyy-MM-dd"),
            budgetPercentage: 50,
            assetTypes: [],
            isLoyaltyPhase: false,
          },
          {
            id: "phase-consideration",
            name: "Consideration",
            startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.5)), "yyyy-MM-dd"),
            endDate: format(addDays(campaignStart, Math.floor(totalDays * 0.8)), "yyyy-MM-dd"),
            budgetPercentage: 30,
            assetTypes: [],
            isLoyaltyPhase: false,
          },
          {
            id: "phase-conversion",
            name: "Conversion",
            startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.8)), "yyyy-MM-dd"),
            endDate: format(campaignEnd, "yyyy-MM-dd"),
            budgetPercentage: 20,
            assetTypes: [],
            isLoyaltyPhase: false,
          },
          {
            id: "phase-loyalty",
            name: "Loyalty",
            startDate: format(campaignStart, "yyyy-MM-dd"),
            endDate: format(campaignEnd, "yyyy-MM-dd"),
            budgetPercentage: 0,
            assetTypes: [],
            isLoyaltyPhase: true,
          },
        ];
        onPhasesChange(defaultPhases);
      }
    }
  }, [startDate, endDate]);

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
    const newPhase: Phase = {
      id: `phase-${Date.now()}`,
      name: `Phase ${phases.length + 1}`,
      startDate: format(campaignStart, "yyyy-MM-dd"),
      endDate: format(addDays(campaignStart, 7), "yyyy-MM-dd"),
      budgetPercentage: 0,
    };
    onPhasesChange([...phases, newPhase]);
  };

  const removePhase = (phaseId: string) => {
    onPhasesChange(phases.filter(p => p.id !== phaseId));
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
    onPhasesChange(phases.map(p => p.id === phaseId ? { ...p, [field]: value } : p));
  };

  const getAvailableObjectives = (phaseName: string) => {
    const phaseType = phaseName.toLowerCase().includes("awareness")
      ? "Awareness"
      : phaseName.toLowerCase().includes("consideration")
      ? "Consideration"
      : "Conversion";
    
    // Try exact match first, then fallback to Meta for facebook/instagram
    let objectives = platformObjectiveMapping[platformName]?.[phaseType];
    if (!objectives && platformName.toLowerCase().includes("meta")) {
      objectives = platformObjectiveMapping["Facebook (Meta)"]?.[phaseType];
    }
    return objectives || ["Awareness", "Traffic", "Engagement", "Conversions"];
  };

  const getOptimizationGoals = (objective: string) => {
    // Return optimization goals based on objective
    const objectiveLower = objective.toLowerCase();
    if (objectiveLower.includes("awareness") || objectiveLower.includes("reach")) {
      return ["Impressions", "Reach", "Brand Awareness"];
    } else if (objectiveLower.includes("traffic")) {
      return ["Link Clicks", "Landing Page Views", "Impressions"];
    } else if (objectiveLower.includes("engagement")) {
      return ["Post Engagement", "Page Likes", "Event Responses"];
    } else if (objectiveLower.includes("video")) {
      return ["ThruPlay", "2-Second Video Views", "Video Views"];
    } else if (objectiveLower.includes("lead")) {
      return ["Leads", "Conversions"];
    } else if (objectiveLower.includes("conversion") || objectiveLower.includes("catalog") || objectiveLower.includes("shopping")) {
      return ["Conversions", "Value", "Link Clicks"];
    } else if (objectiveLower.includes("app")) {
      return ["App Installs", "App Events", "Value"];
    }
    return ["Conversions", "Link Clicks", "Impressions"];
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-destructive/20"
                    onClick={() => removePhase(phase.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 hover:bg-destructive/20"
                    onClick={() => removePhase(phase.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
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
            const availableObjectives = getAvailableObjectives(phase.name);
            
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
                      {/* Objective Selection */}
                      <div className="space-y-2">
                        <Label htmlFor={`objective-${phase.id}`}>Campaign Objective</Label>
                        <Select
                          value={phase.objective || ""}
                          onValueChange={(value) => updatePhaseField(phase.id, "objective", value)}
                        >
                          <SelectTrigger id={`objective-${phase.id}`}>
                            <SelectValue placeholder="Select objective" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableObjectives.map((obj) => (
                              <SelectItem key={obj} value={obj}>
                                {obj}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Optimization Goal */}
                      {phase.objective && (
                        <div className="space-y-2">
                          <Label htmlFor={`optimization-${phase.id}`}>Optimization Goal</Label>
                          <Select
                            value={phase.optimizationGoal || ""}
                            onValueChange={(value) => updatePhaseField(phase.id, "optimizationGoal", value)}
                          >
                            <SelectTrigger id={`optimization-${phase.id}`}>
                              <SelectValue placeholder="Select optimization goal" />
                            </SelectTrigger>
                            <SelectContent>
                              {getOptimizationGoals(phase.objective).map((goal) => (
                                <SelectItem key={goal} value={goal}>
                                  {goal}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Publisher Platforms & Placements */}
                      <div className="space-y-2">
                        <CampaignPublisherConfig
                          platformName={platformName}
                          publisherPlatforms={phase.publisherPlatforms || []}
                          positions={phase.positions || {}}
                          onPublisherPlatformsChange={(publishers) => 
                            updatePhaseField(phase.id, "publisherPlatforms", publishers)
                          }
                          onPositionsChange={(positions) => 
                            updatePhaseField(phase.id, "positions", positions)
                          }
                        />
                      </div>

                      {/* Override Targeting */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`override-targeting-${phase.id}`}>Override Targeting</Label>
                          <Switch
                            id={`override-targeting-${phase.id}`}
                            checked={phase.overrideTargeting || false}
                            onCheckedChange={(checked) => 
                              updatePhaseField(phase.id, "overrideTargeting", checked)
                            }
                          />
                        </div>
                        
                        {phase.overrideTargeting && (
                          <TargetingConfigComponent
                            targeting={phase.targeting || {}}
                            onUpdate={(targeting) => updatePhaseField(phase.id, "targeting", targeting)}
                            platformName={platformName}
                            showAdFormats={false}
                          />
                        )}
                      </div>
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
    </Card>
  );
}
