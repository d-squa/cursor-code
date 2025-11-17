import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, MapPin, User, Smartphone, Globe, Monitor, Target, TrendingUp, Users, Repeat } from "lucide-react";

interface TargetingData {
  market: string;
  location?: string[];
  ageMin?: number;
  ageMax?: number;
  gender?: string[];
  devices?: string[];
  languages?: string[];
  os?: string[];
  interests?: Array<{ name: string; id: string; audienceSize?: number }>;
  behaviors?: Array<{ name: string; id: string; audienceSize?: number }>;
  customAudiences?: Array<{ name: string; id: string; type: string }>;
  lookalikes?: Array<{ name: string; id: string; sourceAudienceId: string }>;
  customerLists?: Array<{ name: string; id: string }>;
}

interface TargetingCardProps {
  targeting: TargetingData;
  onRemove: () => void;
}

export function TargetingCard({ targeting, onRemove }: TargetingCardProps) {
  const formatAgeRange = () => {
    if (targeting.ageMin && targeting.ageMax) {
      return `${targeting.ageMin}-${targeting.ageMax}`;
    }
    if (targeting.ageMin) {
      return `${targeting.ageMin}+`;
    }
    return "All Ages";
  };

  const formatAudienceSize = (size?: number) => {
    if (!size) return "";
    if (size >= 1000000) return `(${(size / 1000000).toFixed(1)}M)`;
    if (size >= 1000) return `(${(size / 1000).toFixed(1)}K)`;
    return `(${size})`;
  };

  return (
    <Card className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
      
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          {targeting.market}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Demographics */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Demographics</h4>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Age: {formatAgeRange()}
            </Badge>
            {targeting.gender && targeting.gender.length > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {targeting.gender.join(", ")}
              </Badge>
            )}
            {!targeting.devices && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Smartphone className="h-3 w-3" />
                All Devices
              </Badge>
            )}
            {!targeting.languages && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                All Languages
              </Badge>
            )}
            {!targeting.os && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Monitor className="h-3 w-3" />
                All OS
              </Badge>
            )}
          </div>
        </div>

        {/* Interests */}
        {targeting.interests && targeting.interests.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Interests ({targeting.interests.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {targeting.interests.map((interest, idx) => (
                <Badge key={idx} variant="default">
                  {interest.name} {formatAudienceSize(interest.audienceSize)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Behaviors */}
        {targeting.behaviors && targeting.behaviors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Behaviors ({targeting.behaviors.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {targeting.behaviors.map((behavior, idx) => (
                <Badge key={idx} variant="default">
                  {behavior.name} {formatAudienceSize(behavior.audienceSize)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Custom Audiences */}
        {targeting.customAudiences && targeting.customAudiences.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              Custom Audiences ({targeting.customAudiences.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {targeting.customAudiences.map((audience, idx) => (
                <Badge key={idx} variant="secondary">
                  {audience.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Lookalikes */}
        {targeting.lookalikes && targeting.lookalikes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Lookalike Audiences ({targeting.lookalikes.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {targeting.lookalikes.map((audience, idx) => (
                <Badge key={idx} variant="secondary">
                  {audience.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Customer Lists */}
        {targeting.customerLists && targeting.customerLists.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Customer Lists ({targeting.customerLists.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {targeting.customerLists.map((list, idx) => (
                <Badge key={idx} variant="secondary">
                  {list.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
