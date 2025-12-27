import { Button } from "@/components/ui/button";
import { Split } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AdSetSplitButtonProps {
  dimension: string;
  dimensionLabel: string;
  isActive: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function AdSetSplitButton({ 
  dimension, 
  dimensionLabel, 
  isActive, 
  disabled,
  onClick 
}: AdSetSplitButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={isActive ? "default" : "ghost"}
            size="icon"
            className={cn(
              "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
              isActive && "opacity-100 bg-primary text-primary-foreground"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            disabled={disabled}
          >
            <Split className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">
            {isActive 
              ? `Remove ${dimensionLabel} split` 
              : `Split ad sets by ${dimensionLabel}`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
