import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers, Split } from "lucide-react";

interface BudgetOptimizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimensionLabel: string;
  onSelectCBO: () => void;
  onSelectABO: () => void;
}

export function BudgetOptimizationDialog({
  open,
  onOpenChange,
  dimensionLabel,
  onSelectCBO,
  onSelectABO,
}: BudgetOptimizationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose Budget Optimization</DialogTitle>
          <DialogDescription>
            How would you like to manage budget for your {dimensionLabel} split?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <Card 
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => {
              onSelectCBO();
              onOpenChange(false);
            }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Campaign Budget Optimization (CBO)</CardTitle>
              </div>
              <Badge variant="secondary" className="w-fit">Recommended</Badge>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Set budget at the <strong>campaign level</strong>. The platform automatically distributes budget across ad sets based on performance.
              </CardDescription>
              <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                <li>• Best for letting algorithms optimize spend</li>
                <li>• Less manual control, more automation</li>
                <li>• Platform decides which ad sets get more budget</li>
              </ul>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => {
              onSelectABO();
              onOpenChange(false);
            }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Split className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Ad Set Budget Optimization (ABO)</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Set budget <strong>per ad set</strong> with specific percentage splits. You control exactly how much each ad set receives.
              </CardDescription>
              <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                <li>• Full control over budget distribution</li>
                <li>• Great for A/B testing with equal spend</li>
                <li>• Predictable spend per audience/placement</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
