import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Plus, X, GripVertical } from "lucide-react";
import { Phase } from "./PlatformConfiguration";
import { format, addDays, differenceInDays, parseISO } from "date-fns";

interface PhaseSchedulerProps {
  phases: Phase[];
  onPhasesChange: (phases: Phase[]) => void;
  startDate: string;
  endDate: string;
}

interface DraggingState {
  phaseId: string;
  isStart: boolean;
  initialX: number;
}

export function PhaseScheduler({ phases, onPhasesChange, startDate, endDate }: PhaseSchedulerProps) {
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [budgetPopover, setBudgetPopover] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const campaignStart = startDate ? parseISO(startDate) : new Date();
  const campaignEnd = endDate ? parseISO(endDate) : addDays(campaignStart, 90);
  const totalDays = differenceInDays(campaignEnd, campaignStart);

  const dateToPosition = (dateStr: string): number => {
    if (!dateStr) return 0;
    const date = parseISO(dateStr);
    const days = differenceInDays(date, campaignStart);
    return (days / totalDays) * 100;
  };

  const positionToDate = (position: number): string => {
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
    if (dragging) {
      setBudgetPopover(dragging.phaseId);
    }
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
          {format(campaignStart, "MMM d, yyyy")} - {format(campaignEnd, "MMM d, yyyy")}
        </p>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="relative h-40 bg-muted/30 rounded-lg border"
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

            return (
              <div
                key={phase.id}
                className={`absolute h-12 ${getPhaseColor(index)} border-2 rounded-md transition-all hover:shadow-lg`}
                style={{
                  left: `${startPos}%`,
                  width: `${width}%`,
                  top: `${28 + index * 20}px`,
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
                    <Popover open={budgetPopover === phase.id} onOpenChange={(open) => !open && setBudgetPopover(null)}>
                      <PopoverTrigger asChild>
                        <Badge variant="secondary" className="text-[10px] cursor-pointer">
                          {phase.budgetPercentage}%
                        </Badge>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="start">
                        <div className="space-y-2">
                          <Label className="text-xs">Phase Budget Allocation</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={phase.budgetPercentage}
                              onChange={(e) => updatePhaseBudget(phase.id, parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm"
                              min="0"
                              max="100"
                            />
                            <span className="text-sm text-muted-foreground">%</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(parseISO(phase.startDate), "MMM d")} - {format(parseISO(phase.endDate), "MMM d, yyyy")}
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
        </div>

        {/* Phase list summary */}
        <div className="mt-4 space-y-2">
          {phases.map((phase, index) => (
            <div key={phase.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded ${getPhaseColor(index).split(" ")[0]}`} />
                <span className="font-medium">{phase.name}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>{format(parseISO(phase.startDate), "MMM d")} - {format(parseISO(phase.endDate), "MMM d")}</span>
                <span className="font-semibold text-foreground">{phase.budgetPercentage}%</span>
              </div>
            </div>
          ))}
          {phases.length > 0 && (
            <div className="flex items-center justify-between text-xs font-semibold pt-2 border-t">
              <span>Total Allocation</span>
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
