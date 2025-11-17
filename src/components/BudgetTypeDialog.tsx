import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, DollarSign } from "lucide-react";

interface BudgetTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (budgetType: "daily" | "lifetime") => void;
  campaignBudget: number;
  startDate: string;
  endDate: string;
  loading?: boolean;
}

export function BudgetTypeDialog({
  open,
  onOpenChange,
  onConfirm,
  campaignBudget,
  startDate,
  endDate,
  loading = false,
}: BudgetTypeDialogProps) {
  const [selectedType, setSelectedType] = useState<"daily" | "lifetime">("lifetime");

  const { durationDays, dailyBudget } = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1; // Include both start and end days
    const daily = campaignBudget / duration;
    return { durationDays: duration, dailyBudget: daily };
  }, [startDate, endDate, campaignBudget]);

  const handleConfirm = () => {
    onConfirm(selectedType);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Select Budget Type</DialogTitle>
          <DialogDescription>
            Choose how you want to allocate your campaign budget across DSP platforms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={selectedType} onValueChange={(value) => setSelectedType(value as "daily" | "lifetime")}>
            <Card className={selectedType === "lifetime" ? "border-primary" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="lifetime" id="lifetime" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="lifetime" className="text-base font-medium cursor-pointer">
                      Lifetime Budget
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Set the total budget for the entire campaign duration. The platform will optimize spending across all days.
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">${campaignBudget.toLocaleString()}</span>
                        <span className="text-muted-foreground">total</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{durationDays} days</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={selectedType === "daily" ? "border-primary" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="daily" id="daily" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="daily" className="text-base font-medium cursor-pointer">
                      Daily Budget
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Set a fixed daily spending limit. The campaign will spend up to this amount each day.
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">${dailyBudget.toFixed(2)}</span>
                        <span className="text-muted-foreground">per day</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{durationDays} days</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Total: ${campaignBudget.toLocaleString()} ÷ {durationDays} days (including start and end date)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Pushing..." : "Push to DSP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
