import * as React from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type BudgetTypeToggleValue = "" | "none" | "daily" | "lifetime";

export interface BudgetTypeToggleOption {
  value: Exclude<BudgetTypeToggleValue, "">;
  label: string;
}

interface BudgetTypeToggleGroupProps {
  value: BudgetTypeToggleValue;
  onValueChange: (value: BudgetTypeToggleValue) => void;
  options: BudgetTypeToggleOption[];
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * Stable, non-dropdown control for Budget Type.
 * Avoids Select/portal focus race conditions that can cause flicker/revert.
 */
export function BudgetTypeToggleGroup({
  value,
  onValueChange,
  options,
  disabled,
  id,
  className,
}: BudgetTypeToggleGroupProps) {
  return (
    <ToggleGroup
      id={id}
      type="single"
      variant="outline"
      size="sm"
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        // Radix can emit "" when toggling off; ignore to keep stable selection.
        if (!v) return;
        onValueChange(v as BudgetTypeToggleValue);
      }}
      className={cn("w-full justify-start", className)}
    >
      {options.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} className="flex-1">
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
