import { ReactNode, useState } from "react";
import { AdSetSplitButton } from "./AdSetSplitButton";
import { AdSetSplitDimension } from "@/types/mediaplan";
import { BudgetOptimizationDialog, SplitLevel } from "./BudgetOptimizationDialog";
import { cn } from "@/lib/utils";

interface SplittableSectionProps {
  children: ReactNode;
  dimension: AdSetSplitDimension;
  dimensionLabel: string;
  currentSplitDimension?: AdSetSplitDimension;
  /**
   * When true, after the CBO/ABO budget choice the user is also asked whether
   * the split should be applied at the campaign or ad group level. This is
   * specific to Google Search where both layouts are valid.
   */
  askSplitLevel?: boolean;
  onSplitClick: (
    dimension: AdSetSplitDimension,
    useCBO?: boolean,
    splitLevel?: SplitLevel,
  ) => void;
  className?: string;
  disabled?: boolean;
}

export function SplittableSection({
  children,
  dimension,
  dimensionLabel,
  currentSplitDimension,
  askSplitLevel,
  onSplitClick,
  className,
  disabled,
}: SplittableSectionProps) {
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const isActive = currentSplitDimension === dimension;
  const isDisabled = disabled || (currentSplitDimension && currentSplitDimension !== 'none' && currentSplitDimension !== dimension);

  const handleSplitButtonClick = () => {
    if (isActive) {
      // Remove split
      onSplitClick('none');
    } else {
      // Show budget optimization dialog
      setShowBudgetDialog(true);
    }
  };

  return (
    <div className={cn("group relative", className)}>
      {/* Split button positioned at top-right of the section */}
      <div className="absolute -top-2 -right-2 z-10">
        <AdSetSplitButton
          dimension={dimension}
          dimensionLabel={dimensionLabel}
          isActive={isActive}
          disabled={isDisabled}
          onClick={handleSplitButtonClick}
        />
      </div>
      {children}

      <BudgetOptimizationDialog
        open={showBudgetDialog}
        onOpenChange={setShowBudgetDialog}
        dimensionLabel={dimensionLabel}
        askSplitLevel={askSplitLevel}
        onSelectCBO={(splitLevel) => {
          onSplitClick(dimension, true, splitLevel);
        }}
        onSelectABO={(splitLevel) => {
          onSplitClick(dimension, false, splitLevel);
        }}
      />
    </div>
  );
}
