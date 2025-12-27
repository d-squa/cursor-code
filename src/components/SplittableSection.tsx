import { ReactNode } from "react";
import { AdSetSplitButton } from "./AdSetSplitButton";
import { AdSetSplitDimension } from "@/types/mediaplan";
import { cn } from "@/lib/utils";

interface SplittableSectionProps {
  children: ReactNode;
  dimension: AdSetSplitDimension;
  dimensionLabel: string;
  currentSplitDimension?: AdSetSplitDimension;
  onSplitClick: (dimension: AdSetSplitDimension) => void;
  className?: string;
  disabled?: boolean;
}

export function SplittableSection({
  children,
  dimension,
  dimensionLabel,
  currentSplitDimension,
  onSplitClick,
  className,
  disabled,
}: SplittableSectionProps) {
  const isActive = currentSplitDimension === dimension;
  const isDisabled = disabled || (currentSplitDimension && currentSplitDimension !== 'none' && currentSplitDimension !== dimension);

  return (
    <div className={cn("group relative", className)}>
      {/* Split button positioned at top-right of the section */}
      <div className="absolute -top-2 -right-2 z-10">
        <AdSetSplitButton
          dimension={dimension}
          dimensionLabel={dimensionLabel}
          isActive={isActive}
          disabled={isDisabled}
          onClick={() => {
            if (isActive) {
              // Remove split
              onSplitClick('none');
            } else {
              // Set this dimension as the split
              onSplitClick(dimension);
            }
          }}
        />
      </div>
      {children}
    </div>
  );
}
