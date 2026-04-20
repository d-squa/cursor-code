import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function BlurredPlaceholderCard() {
  const navigate = useNavigate();

  return (
    <Card className="relative overflow-hidden aspect-square">
      {/* Blurred placeholder content */}
      <div className="blur-sm pointer-events-none select-none p-4 h-full">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-4 w-12 bg-muted rounded" />
        </div>
        <div className="h-4 w-16 bg-muted rounded mb-3" />
        <div className="space-y-2 mb-3">
          <div className="h-2 w-full bg-muted rounded" />
          <div className="h-3 w-full bg-muted rounded-full" />
        </div>
        <div className="space-y-1">
          <div className="h-2 w-12 bg-muted rounded" />
          <div className="h-2 w-full bg-muted rounded-full" />
        </div>
      </div>
      
      {/* Overlay with CTA */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-[1px]">
        <p className="text-xs text-muted-foreground mb-2 text-center px-4">
          No campaigns yet
        </p>
        <Button size="sm" className="h-7 text-xs" onClick={() => navigate("/app/app")}>
          <Plus className="h-3 w-3 mr-1" />
          Create
        </Button>
      </div>
    </Card>
  );
}