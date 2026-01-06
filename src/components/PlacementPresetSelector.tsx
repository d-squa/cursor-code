import { cn } from "@/lib/utils";
import { 
  Sparkles, 
  Smartphone, 
  LayoutList, 
  GalleryHorizontal, 
  GalleryVertical, 
  Settings2,
  LucideIcon
} from "lucide-react";
import { 
  META_PLACEMENT_PRESETS, 
  MetaPlacementPreset,
  PlacementPresetConfig 
} from "@/utils/metaPlacementPresets";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Map icon names to components
const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  Smartphone,
  LayoutList,
  GalleryHorizontal,
  GalleryVertical,
  Settings2,
};

interface PlacementPresetSelectorProps {
  selectedPreset: MetaPlacementPreset;
  onPresetChange: (preset: MetaPlacementPreset) => void;
  disabled?: boolean;
}

export function PlacementPresetSelector({
  selectedPreset,
  onPresetChange,
  disabled = false,
}: PlacementPresetSelectorProps) {
  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {META_PLACEMENT_PRESETS.map((preset) => {
            const IconComponent = ICON_MAP[preset.icon] || Settings2;
            const isSelected = selectedPreset === preset.id;
            
            return (
              <Tooltip key={preset.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPresetChange(preset.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
                      "text-sm font-medium",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background hover:bg-accent hover:text-accent-foreground border-border",
                      disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <IconComponent className="h-4 w-4" />
                    <span>{preset.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium">{preset.label}</p>
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
                  {preset.isCarousel && (
                    <p className="text-xs text-primary mt-1">
                      ✓ Optimized for carousel creative matching
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
