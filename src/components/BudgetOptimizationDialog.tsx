import { useEffect, useState } from "react";
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
import { Layers, Split, Megaphone, Boxes } from "lucide-react";

export type SplitLevel = 'campaign' | 'adgroup';

interface BudgetOptimizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimensionLabel: string;
  /** When true, after picking CBO/ABO the dialog asks Campaign vs Ad Group split level. */
  askSplitLevel?: boolean;
  onSelectCBO: (splitLevel?: SplitLevel) => void;
  onSelectABO: (splitLevel?: SplitLevel) => void;
}

export function BudgetOptimizationDialog({
  open,
  onOpenChange,
  dimensionLabel,
  askSplitLevel = false,
  onSelectCBO,
  onSelectABO,
}: BudgetOptimizationDialogProps) {
  const [step, setStep] = useState<'budget' | 'level'>('budget');
  const [pendingBudget, setPendingBudget] = useState<'cbo' | 'abo' | null>(null);

  useEffect(() => {
    if (open) {
      setStep('budget');
      setPendingBudget(null);
    }
  }, [open]);

  const handleBudgetPick = (choice: 'cbo' | 'abo') => {
    if (askSplitLevel) {
      setPendingBudget(choice);
      setStep('level');
      return;
    }
    if (choice === 'cbo') onSelectCBO();
    else onSelectABO();
    onOpenChange(false);
  };

  const handleLevelPick = (level: SplitLevel) => {
    if (pendingBudget === 'cbo') onSelectCBO(level);
    else onSelectABO(level);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {step === 'budget' && (
          <>
            <DialogHeader>
              <DialogTitle>Choose Budget Optimization</DialogTitle>
              <DialogDescription>
                How would you like to manage budget for your {dimensionLabel} split?
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <Card
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleBudgetPick('cbo')}
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
                onClick={() => handleBudgetPick('abo')}
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
          </>
        )}

        {step === 'level' && (
          <>
            <DialogHeader>
              <DialogTitle>Apply split at which level?</DialogTitle>
              <DialogDescription>
                For Google Search, you can split your {dimensionLabel} variants either as separate campaigns or as separate ad groups inside one campaign.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <Card
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleLevelPick('campaign')}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">Campaign level</CardTitle>
                  </div>
                  <Badge variant="outline" className="w-fit">More isolated control</Badge>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Each {dimensionLabel} variant becomes its own <strong>campaign</strong> (e.g. one campaign per language × strategy).
                  </CardDescription>
                  <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                    <li>• Independent budgets and bidding per variant</li>
                    <li>• Cleaner reporting per dimension value</li>
                    <li>• Best when variants behave very differently</li>
                  </ul>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleLevelPick('adgroup')}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Boxes className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">Ad Group level</CardTitle>
                  </div>
                  <Badge variant="secondary" className="w-fit">Recommended</Badge>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    All variants live as <strong>ad groups</strong> inside the same campaign. Budget and bidding are shared.
                  </CardDescription>
                  <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                    <li>• Lets Google reallocate spend across variants</li>
                    <li>• Simpler campaign structure to manage</li>
                    <li>• Default for most Google Search splits</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('budget')}>
                Back
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
