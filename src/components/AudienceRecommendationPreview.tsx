import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Target, TrendingUp, Users, Repeat, MapPin, Calendar, Languages, Smartphone, User } from "lucide-react";
import { AudienceRecommendation } from "@/hooks/useAudienceRecommendations";

interface AudienceRecommendationPreviewProps {
  recommendations: AudienceRecommendation[];
}

export function AudienceRecommendationPreview({ recommendations }: AudienceRecommendationPreviewProps) {
  // Extract unique audience items by category
  const retargeting = recommendations
    .find(r => r.category === "Retargeting")
    ?.items.filter(i => i.available) || [];
  
  const lookalikes = recommendations
    .find(r => r.category === "Lookalikes")
    ?.items.filter(i => i.available) || [];
  
  const newAcquisition = recommendations
    .find(r => r.category === "New Acquisition")
    ?.items || [];

  const savedAudiences = recommendations
    .find(r => r.category === "Saved Audiences")
    ?.items.filter(i => i.available) || [];

  // Extract interests and behaviors from New Acquisition
  const interests = newAcquisition.filter(i => i.source === "Interests");
  const behaviors = newAcquisition.filter(i => i.source === "Behaviors");

  const hasAnyAudiences = retargeting.length > 0 || lookalikes.length > 0 || 
                          interests.length > 0 || behaviors.length > 0 || 
                          savedAudiences.length > 0;

  if (!hasAnyAudiences) {
    return null;
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4" />
          Audience Preview - Review Before Applying
        </CardTitle>
        <CardDescription className="text-xs">
          Review all selected audiences and their details before applying to your campaign
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Retargeting Audiences */}
        {retargeting.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-blue-500" />
              <h4 className="text-sm font-semibold">Retargeting ({retargeting.length})</h4>
            </div>
            <div className="pl-6 space-y-2">
              {retargeting.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border bg-blue-50 dark:bg-blue-950/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{item.audienceName || item.source}</span>
                    <Badge variant="secondary" className="text-xs">Available</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                  {item.audienceId && (
                    <p className="text-xs text-muted-foreground mt-1">ID: {item.audienceId}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lookalike Audiences */}
        {lookalikes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              <h4 className="text-sm font-semibold">Lookalike Audiences ({lookalikes.length})</h4>
            </div>
            <div className="pl-6 space-y-2">
              {lookalikes.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border bg-purple-50 dark:bg-purple-950/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{item.audienceName || item.source}</span>
                    <Badge variant="secondary" className="text-xs">Available</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                  {item.audienceId && (
                    <p className="text-xs text-muted-foreground mt-1">ID: {item.audienceId}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interests */}
        {interests.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-green-500" />
              <h4 className="text-sm font-semibold">Interests ({interests.length})</h4>
            </div>
            <div className="pl-6 space-y-2">
              {interests.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border bg-green-50 dark:bg-green-950/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{item.source}</span>
                    {item.audienceId && (
                      <span className="text-xs text-muted-foreground">ID: {item.audienceId}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Behaviors */}
        {behaviors.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              <h4 className="text-sm font-semibold">Behaviors ({behaviors.length})</h4>
            </div>
            <div className="pl-6 space-y-2">
              {behaviors.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border bg-orange-50 dark:bg-orange-950/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{item.source}</span>
                    {item.audienceId && (
                      <span className="text-xs text-muted-foreground">ID: {item.audienceId}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saved Audiences */}
        {savedAudiences.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              <h4 className="text-sm font-semibold">Saved Audiences ({savedAudiences.length})</h4>
            </div>
            <div className="pl-6 space-y-2">
              {savedAudiences.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border bg-indigo-50 dark:bg-indigo-950/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{item.audienceName || item.source}</span>
                    <Badge variant="secondary" className="text-xs">Available</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                  {item.audienceId && (
                    <p className="text-xs text-muted-foreground mt-1">ID: {item.audienceId}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
          <p className="font-medium mb-2">📊 What happens when you apply:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>These audiences will be added to your targeting configuration</li>
            <li>You can review and adjust demographics (age, gender, device, language) in the fields below</li>
            <li>Only demographics affect reach predictions - audience selections refine your targeting</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
