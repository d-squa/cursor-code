import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Target, TrendingUp, Users, Repeat } from "lucide-react";

interface AudienceCardProps {
  type: "interest" | "behavior" | "customAudience" | "lookalike" | "customerList";
  name: string;
  audienceSize?: number;
  metadata?: { id?: string; sourceAudienceId?: string; type?: string };
  onRemove: () => void;
}

export function AudienceCard({ type, name, audienceSize, metadata, onRemove }: AudienceCardProps) {
  const formatAudienceSize = (size?: number) => {
    if (!size) return "";
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return `${size}`;
  };

  const getIcon = () => {
    switch (type) {
      case "interest":
        return Target;
      case "behavior":
        return TrendingUp;
      case "customAudience":
        return Repeat;
      case "lookalike":
      case "customerList":
        return Users;
    }
  };

  const getTypeLabel = () => {
    switch (type) {
      case "interest":
        return "Interest";
      case "behavior":
        return "Behavior";
      case "customAudience":
        return "Custom Audience";
      case "lookalike":
        return "Lookalike";
      case "customerList":
        return "Customer List";
    }
  };

  const getVariant = () => {
    switch (type) {
      case "interest":
        return "default" as const;
      case "behavior":
        return "secondary" as const;
      case "customAudience":
        return "outline" as const;
      case "lookalike":
      case "customerList":
        return "secondary" as const;
    }
  };

  const Icon = getIcon();

  return (
    <Card className="relative group hover:shadow-md transition-shadow">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
      
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <Icon className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant={getVariant()} className="text-xs">
                {getTypeLabel()}
              </Badge>
              {audienceSize && (
                <span className="text-xs text-muted-foreground">
                  {formatAudienceSize(audienceSize)} people
                </span>
              )}
            </div>
            <p className="text-sm font-medium line-clamp-2">{name}</p>
            {metadata?.id && (
              <p className="text-xs text-muted-foreground mt-1">ID: {metadata.id}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
