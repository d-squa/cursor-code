import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, GripVertical, Link2 } from "lucide-react";
import { Phase } from "@/types/hierarchy";
import { format, addDays, differenceInDays, parseISO } from "date-fns";

interface PhaseTimelineProps {
  phases: Phase[];
  onPhasesChange: (phases: Phase[]) => void;
  startDate: string;
  endDate: string;
  platformId?: string;
}

interface DraggingState {
  phaseId: string;
  isStart: boolean;
  initialX: number;
}

export function PhaseTimeline({ phases, onPhasesChange, startDate, endDate, platformId = "meta" }: PhaseTimelineProps) {
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
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
            campaigns: [],
          },
          {
            id: "phase-consideration",
            name: "Consideration",
            startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.5)), "yyyy-MM-dd"),
            endDate: format(addDays(campaignStart, Math.floor(totalDays * 0.8)), "yyyy-MM-dd"),
            budgetPercentage: 30,
            campaigns: [],
          },
          {
            id: "phase-conversion",
            name: "Conversion",
            startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.8)), "yyyy-MM-dd"),
            endDate: format(campaignEnd, "yyyy-MM-dd"),
            budgetPercentage: 20,
            campaigns: [],
          },
        ];
        onPhasesChange(defaultPhases);
      }
    }
  }, [startDate, endDate, phases.length]);

  if (!startDate || !endDate) {
    return (
      <div className="text-sm text-muted-foreground p-4 border rounded-lg">
        Please select activation start and end dates first.
      </div>
    );
  }

  const campaignStart = parseISO(startDate);
  const campaignEnd = parseISO(endDate);
  const totalDays = differenceInDays(campaignEnd, campaignStart);

  if (totalDays <= 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 border rounded-lg">
        End date must be after start date.
      </div>
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
      campaigns: [],
    };
    onPhasesChange([...phases, newPhase]);
  };

  const removePhase = (phaseId: string) => {
    onPhasesChange(phases.filter(p => p.id !== phaseId));
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {format(campaignStart, "MMM d, yyyy")} - {format(campaignEnd, "MMM d, yyyy")} ({totalDays + 1} days)
        </p>
        <Button type="button" variant="outline" size="sm" onClick={addPhase}>
          <Plus className="h-3 w-3 mr-1" />
          Add Phase
        </Button>
      </div>

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
        {phases.map((phase, index) => {
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
                        onChange={(e) => updatePhaseBudget(phase.id, parseFloat(e.target.value) || 0)}
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
      </div>
    </div>
  );
}
