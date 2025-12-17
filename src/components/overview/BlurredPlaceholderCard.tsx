import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function BlurredPlaceholderCard() {
  const navigate = useNavigate();

  return (
    <Card className="relative overflow-hidden">
      {/* Blurred content */}
      <div className="blur-sm pointer-events-none select-none">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="h-5 w-48 bg-muted rounded" />
              <div className="flex items-center gap-2 mt-2">
                <div className="h-4 w-32 bg-muted rounded" />
              </div>
            </div>
            <Badge variant="outline">Live</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-16 bg-muted rounded" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <div className="h-3 w-16 bg-muted rounded" />
                <div className="h-3 w-32 bg-muted rounded" />
              </div>
              <div className="h-2 w-full bg-muted rounded-full" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-4 w-20 bg-muted rounded" />
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-3 w-14 bg-muted rounded" />
                  <div className="flex-1 h-1.5 bg-muted rounded-full" />
                  <div className="h-3 w-10 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-3 w-32 bg-muted rounded" />
          </div>

          <div className="h-8 w-full bg-muted rounded" />
        </CardContent>
      </div>

      {/* Overlay with CTA */}
      <div className="absolute inset-0 bg-background/60 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Create and launch your first ActiPlan to see performance metrics here
        </p>
        <Button onClick={() => navigate("/app/new")} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Create ActiPlan
        </Button>
      </div>
    </Card>
  );
}
