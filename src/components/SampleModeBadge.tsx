import { GraduationCap, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSampleMode } from "@/contexts/SampleModeContext";
import { useTourDataContext } from "@/contexts/TourDataContext";

/**
 * Persistent global badge shown whenever Sample Tour Data is active.
 * Sits top-right, indicates read-only mode, and offers a quick toggle off.
 */
export function SampleModeBadge() {
  const { isSampleMode } = useSampleMode();
  const { toggleVisibility } = useTourDataContext();

  if (!isSampleMode) return null;

  return (
    <div className="fixed top-3 right-3 z-[55] pointer-events-auto">
      <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 backdrop-blur px-3 py-1.5 shadow-md">
        <GraduationCap className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">
          Sample Data · Read-Only
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleVisibility(false)}
          className="h-6 px-2 text-xs text-primary hover:text-primary/80 gap-1"
        >
          <EyeOff className="h-3 w-3" />
          Turn off
        </Button>
      </div>
    </div>
  );
}
