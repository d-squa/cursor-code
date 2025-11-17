import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Market, PlatformWithMarkets, Phase } from "@/types/mediaplan";

interface BulkBudgetTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: PlatformWithMarkets | null;
  onSave: (updatedMarkets: Market[]) => void;
}

export default function BulkBudgetTypeDialog({ open, onOpenChange, platform, onSave }: BulkBudgetTypeDialogProps) {
  const [localMarkets, setLocalMarkets] = useState<Market[]>([]);

  useEffect(() => {
    if (open && platform) {
      const clone = (platform.markets || []).map((m) => ({
        ...m,
        phases: (m.phases || []).map((p) => ({ ...p })),
      }));
      setLocalMarkets(clone);
    }
  }, [open, platform]);

  const allPhases: Phase[] = useMemo(
    () => localMarkets.flatMap((m) => m.phases || []),
    [localMarkets]
  );

  const setAll = (type: "daily" | "lifetime" | "") => {
    setLocalMarkets((prev) =>
      prev.map((m) => ({
        ...m,
        phases: (m.phases || []).map((p) => ({ ...p, budgetType: (type || undefined) as any })),
      }))
    );
  };

  const setMarketAll = (marketId: string, type: "daily" | "lifetime" | "none") => {
    setLocalMarkets((prev) =>
      prev.map((m) =>
        m.id === marketId
          ? {
              ...m,
              phases: (m.phases || []).map((p) => ({ ...p, budgetType: (type === "none" ? undefined : type) as any })),
            }
          : m
      )
    );
  };

  const setPhase = (marketId: string, phaseId: string, type: "daily" | "lifetime" | "none" | undefined) => {
    setLocalMarkets((prev) =>
      prev.map((m) =>
        m.id === marketId
          ? {
              ...m,
              phases: (m.phases || []).map((p) =>
                p.id === phaseId ? { ...p, budgetType: (type === "none" || !type ? undefined : type) as any } : p
              ),
            }
          : m
      )
    );
  };

  const handleSave = () => {
    onSave(localMarkets);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Customize Budget Types for {platform?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Label className="mr-2">Quick actions:</Label>
          <Button variant="outline" size="sm" onClick={() => setAll("daily")}>Set ALL to Daily</Button>
          <Button variant="outline" size="sm" onClick={() => setAll("lifetime")}>Set ALL to Lifetime</Button>
          <Button variant="outline" size="sm" onClick={() => setAll("")}>Set ALL to None</Button>
        </div>
        <ScrollArea className="max-h-[60vh] mt-4">
          <div className="space-y-6">
            {localMarkets.map((market) => (
              <div key={market.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">{market.name}</h4>
                  <div className="flex items-center gap-2">
                    <Label className="mr-2">Set market phases:</Label>
                    <Select onValueChange={(v) => setMarketAll(market.id, v as any)}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Bulk set" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="none">None (not set)</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="lifetime">Lifetime</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(market.phases || []).map((phase) => (
                    <div key={phase.id} className="border rounded-md p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{phase.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {phase.startDate} → {phase.endDate}
                          </div>
                        </div>
                        <div className="w-40">
                          <Select
                            value={phase.budgetType || "none"}
                            onValueChange={(v) => setPhase(market.id, phase.id, v === "none" ? undefined : v as any)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Budget type" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover z-50">
                              <SelectItem value="none">None (not set)</SelectItem>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="lifetime">Lifetime</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
