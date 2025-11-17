import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Target, Repeat, TrendingUp } from "lucide-react";
import { Phase } from "./PlatformConfiguration";
import { TargetingConfig } from "./TargetingConfig";

interface AudienceSummaryCardProps {
  targeting?: TargetingConfig;
  phases?: Phase[];
  title?: string;
}

export function AudienceSummaryCard({ targeting, phases, title = "Audience Targeting Summary" }: AudienceSummaryCardProps) {
  // Collect all unique targeting from phases
  const phaseTargeting = phases
    ?.filter(p => p.overrideTargeting && p.targeting)
    .map(p => ({ phaseName: p.name, targeting: p.targeting! })) || [];

  const hasGlobalTargeting = targeting && (
    targeting.websiteAudience ||
    targeting.lookalikeAudience ||
    targeting.interests ||
    targeting.customerList ||
    targeting.keywordList
  );

  const hasPhaseTargeting = phaseTargeting.length > 0;

  if (!hasGlobalTargeting && !hasPhaseTargeting) {
    return null;
  }

  const renderTargetingSection = (config: TargetingConfig, label?: string) => {
    const items = [];

    if (config.websiteAudience) {
      items.push({
        icon: Repeat,
        label: "Retargeting",
        value: config.websiteAudience,
        variant: "secondary" as const
      });
    }

    if (config.lookalikeAudience) {
      items.push({
        icon: Users,
        label: "Lookalike",
        value: config.lookalikeAudience,
        variant: "default" as const
      });
    }

    if (config.interests) {
      items.push({
        icon: Target,
        label: "Interests",
        value: config.interests,
        variant: "outline" as const
      });
    }

    if (config.customerList) {
      items.push({
        icon: Users,
        label: "Customer List",
        value: config.customerList,
        variant: "secondary" as const
      });
    }

    if (config.keywordList) {
      items.push({
        icon: TrendingUp,
        label: "Keywords",
        value: config.keywordList,
        variant: "outline" as const
      });
    }

    if (items.length === 0) return null;

    return (
      <div className="space-y-3">
        {label && <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>}
        <div className="space-y-2">
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="flex items-start gap-2 p-3 rounded-lg border bg-card">
                <Icon className="h-4 w-4 mt-0.5 text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{item.label}</span>
                    <Badge variant={item.variant} className="text-xs">
                      {item.value.split(',').length} audience{item.value.split(',').length > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasGlobalTargeting && (
          <div>
            {renderTargetingSection(targeting!, "Campaign-Level Targeting")}
          </div>
        )}

        {hasPhaseTargeting && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Phase-Specific Targeting</h4>
            {phaseTargeting.map((pt, idx) => (
              <div key={idx} className="pl-4 border-l-2 border-primary/20">
                {renderTargetingSection(pt.targeting, pt.phaseName)}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
