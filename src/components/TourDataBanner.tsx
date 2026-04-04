import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Eye, EyeOff, X } from "lucide-react";
import { useTourDataContext } from "@/contexts/TourDataContext";

export function TourDataBanner() {
  const { isSeeded, isVisible, toggleVisibility } = useTourDataContext();
  const [dismissed, setDismissed] = useState(false);

  if (!isSeeded || !isVisible || dismissed) return null;

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3 mx-4 mt-2">
      <div className="flex items-center gap-2.5">
        <GraduationCap className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium text-primary">
          You're viewing <Badge variant="outline" className="mx-1 text-primary border-primary/30">Sample Tour Data</Badge> — this is demo data to help you explore the platform
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleVisibility(false)}
          className="gap-1.5 text-primary hover:text-primary/80 h-7 text-xs"
        >
          <EyeOff className="h-3 w-3" />
          Hide Sample Data
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDismissed(true)}
          className="h-6 w-6 text-primary/60 hover:text-primary"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/** Small badge to show on sample data items in lists */
export function SampleDataBadge() {
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/5">
      <GraduationCap className="h-2.5 w-2.5 mr-0.5" />
      Tour Data
    </Badge>
  );
}
