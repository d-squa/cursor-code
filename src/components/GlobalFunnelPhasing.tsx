import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Save } from "lucide-react";
import { FunnelStage } from "@/types/mediaplan";
import { format, addDays, differenceInDays, parseISO } from "date-fns";
import { toast } from "sonner";

interface GlobalFunnelPhasingProps {
  startDate: string;
  endDate: string;
  globalFunnel: FunnelStage[];
  onGlobalFunnelChange: (funnel: FunnelStage[]) => void;
  onSaveGlobal: () => void;
}

interface DraggingState {
  stageId: string;
  isStart: boolean;
  initialX: number;
}

export function GlobalFunnelPhasing({
  startDate,
  endDate,
  globalFunnel,
  onGlobalFunnelChange,
  onSaveGlobal,
}: GlobalFunnelPhasingProps) {
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize default funnel stages if empty
  useEffect(() => {
    if (globalFunnel.length === 0 && startDate && endDate) {
      const campaignStart = parseISO(startDate);
      const campaignEnd = parseISO(endDate);
      const totalDays = differenceInDays(campaignEnd, campaignStart);
      
      if (totalDays > 0) {
        const defaultStages: FunnelStage[] = [
          {
            id: "stage-awareness",
            name: "Awareness",
            startDate: format(campaignStart, "yyyy-MM-dd"),
            endDate: format(addDays(campaignStart, Math.floor(totalDays * 0.4)), "yyyy-MM-dd"),
            budgetPercentage: 40,
          },
          {
            id: "stage-consideration",
            name: "Consideration",
            startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.4)), "yyyy-MM-dd"),
            endDate: format(addDays(campaignStart, Math.floor(totalDays * 0.7)), "yyyy-MM-dd"),
            budgetPercentage: 30,
          },
          {
            id: "stage-conversion",
            name: "Conversion",
            startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.7)), "yyyy-MM-dd"),
            endDate: format(addDays(campaignStart, Math.floor(totalDays * 0.9)), "yyyy-MM-dd"),
            budgetPercentage: 20,
          },
          {
            id: "stage-loyalty",
            name: "Loyalty",
            startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.9)), "yyyy-MM-dd"),
            endDate: format(campaignEnd, "yyyy-MM-dd"),
            budgetPercentage: 10,
          },
        ];
        onGlobalFunnelChange(defaultStages);
      }
    }
  }, [startDate, endDate, globalFunnel.length]);

  if (!startDate || !endDate) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            Please complete Activation Details first.
          </p>
        </CardContent>
      </Card>
    );
  }

  const campaignStart = parseISO(startDate);
  const campaignEnd = parseISO(endDate);
  const totalDays = differenceInDays(campaignEnd, campaignStart);

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

  const handleMouseDown = (stageId: string, isStart: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    setDragging({ stageId, isStart, initialX: e.clientX });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const position = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newDate = positionToDate(position);

    const updatedStages = globalFunnel.map(stage => {
      if (stage.id === dragging.stageId) {
        if (dragging.isStart) {
          return { ...stage, startDate: newDate };
        } else {
          return { ...stage, endDate: newDate };
        }
      }
      return stage;
    });

    onGlobalFunnelChange(updatedStages);
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

  const updateBudget = (stageId: string, budget: number) => {
    onGlobalFunnelChange(
      globalFunnel.map(s => s.id === stageId ? { ...s, budgetPercentage: Math.max(0, Math.min(100, budget)) } : s)
    );
  };

  const getStageColor = (name: string) => {
    const colors: Record<string, string> = {
      Awareness: "bg-blue-500/20 border-blue-500",
      Consideration: "bg-purple-500/20 border-purple-500",
      Conversion: "bg-green-500/20 border-green-500",
      Loyalty: "bg-orange-500/20 border-orange-500",
    };
    return colors[name] || "bg-gray-500/20 border-gray-500";
  };

  const totalBudget = globalFunnel.reduce((sum, stage) => sum + stage.budgetPercentage, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Global Full-Funnel Phasing</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {format(campaignStart, "MMM d, yyyy")} - {format(campaignEnd, "MMM d, yyyy")} ({totalDays + 1} days)
            </p>
          </div>
          <Button onClick={onSaveGlobal} size="sm">
            <Save className="h-4 w-4 mr-2" />
            Apply to All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="relative h-48 bg-muted/30 rounded-lg border mb-4"
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

          {/* Stage bars */}
          {globalFunnel.map((stage, index) => {
            const startPos = dateToPosition(stage.startDate);
            const endPos = dateToPosition(stage.endDate);
            const width = endPos - startPos;
            const stageDays = differenceInDays(parseISO(stage.endDate), parseISO(stage.startDate)) + 1;
            const timePercentage = totalDays > 0 ? Math.round((stageDays / (totalDays + 1)) * 100) : 0;

            return (
              <div
                key={stage.id}
                className={`absolute h-12 ${getStageColor(stage.name)} border-2 rounded-md transition-all hover:shadow-lg`}
                style={{
                  left: `${startPos}%`,
                  width: `${width}%`,
                  top: `${28 + index * 28}px`,
                  zIndex: dragging?.stageId === stage.id ? 20 : 10,
                }}
              >
                {/* Start handle */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-current opacity-50 hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => handleMouseDown(stage.id, true, e)}
                >
                  <GripVertical className="h-3 w-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>

                {/* Stage content */}
                <div className="px-3 py-1 flex items-center justify-between h-full">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-medium truncate">{stage.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {timePercentage}%
                    </Badge>
                    {editingBudget === stage.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={stage.budgetPercentage.toFixed(1)}
                          onChange={(e) => updateBudget(stage.id, parseFloat(e.target.value) || 0)}
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
                        onClick={() => setEditingBudget(stage.id)}
                      >
                        {stage.budgetPercentage.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                </div>

                {/* End handle */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-current opacity-50 hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => handleMouseDown(stage.id, false, e)}
                >
                  <GripVertical className="h-3 w-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total Budget Allocation:</span>
          <Badge variant={totalBudget === 100 ? "default" : "destructive"}>
            {totalBudget.toFixed(1)}%
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
