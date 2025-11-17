import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, DollarSign } from "lucide-react";
import { Campaign } from "./PlatformConfiguration";

interface CampaignBudgetTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (campaignBudgetTypes: Record<string, "daily" | "lifetime">) => void;
  campaigns: Campaign[];
  marketBudget: number;
  startDate: string;
  endDate: string;
  loading?: boolean;
}

export function CampaignBudgetTypeDialog({
  open,
  onOpenChange,
  onConfirm,
  campaigns,
  marketBudget,
  startDate,
  endDate,
  loading = false,
}: CampaignBudgetTypeDialogProps) {
  const [budgetTypes, setBudgetTypes] = useState<Record<string, "daily" | "lifetime">>(() => {
    const initial: Record<string, "daily" | "lifetime"> = {};
    campaigns.forEach((campaign) => {
      initial[campaign.id] = campaign.budgetType || "lifetime";
    });
    return initial;
  });

  const { durationDays, campaignDailyBudgets } = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    const budgetPerCampaign = marketBudget / campaigns.length;
    const dailyBudgets: Record<string, number> = {};
    campaigns.forEach((campaign) => {
      dailyBudgets[campaign.id] = budgetPerCampaign / duration;
    });
    
    return { durationDays: duration, campaignDailyBudgets: dailyBudgets };
  }, [startDate, endDate, marketBudget, campaigns]);

  const handleConfirm = () => {
    onConfirm(budgetTypes);
  };

  const getBudgetExplanation = (campaignId: string, type: "daily" | "lifetime") => {
    const budgetPerCampaign = marketBudget / campaigns.length;
    
    if (type === "lifetime") {
      return `Total budget of $${budgetPerCampaign.toLocaleString()} will be optimized across ${durationDays} days`;
    } else {
      return `Daily spend of $${campaignDailyBudgets[campaignId].toFixed(2)} per day for ${durationDays} days`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply Budget Type To All Campaigns</DialogTitle>
          <DialogDescription>
            Set how the budget will be allocated for each campaign under this market.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-4 mb-4 p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">${marketBudget.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">market budget</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{durationDays} days</span>
            </div>
          </div>

          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">{campaign.name}</Label>
                    <Select
                      value={budgetTypes[campaign.id]}
                      onValueChange={(value) =>
                        setBudgetTypes((prev) => ({ ...prev, [campaign.id]: value as "daily" | "lifetime" }))
                      }
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                        <SelectItem value="daily">Daily Budget</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-sm text-muted-foreground">
                      {getBudgetExplanation(campaign.id, budgetTypes[campaign.id])}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Applying..." : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
