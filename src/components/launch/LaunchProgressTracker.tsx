import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Check,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Image,
  Video,
  Clock,
  XCircle,
  Rocket,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type CreativeAssignmentStatus = "pending" | "pushing" | "pushed" | "error";

export interface CreativeAssignmentItem {
  id: string;
  creative_id: string;
  creativeName: string;
  mediaType: string;
  platform: string;
  market: string;
  phaseName: string;
  status: CreativeAssignmentStatus;
  errorMessage?: string;
}

export interface AdSetStatus {
  id: string;
  platform: string;
  market: string;
  phaseName: string | null;
  entityType: string;
  status: string;
  dspEntityId: string | null;
  errorMessage?: string;
}

interface LaunchProgressTrackerProps {
  campaignId: string;
  adSetStatuses: AdSetStatus[];
  creativeAssignments: CreativeAssignmentItem[];
  isPushingCampaign: boolean;
  isPushingCreatives: boolean;
  currentStep: 1 | 2;
}

// Status indicator for individual items
function ItemStatusIndicator({ status, error }: { status: string; error?: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    pending: {
      icon: <Clock className="h-3 w-3" />,
      label: "Pending",
      className: "text-muted-foreground",
    },
    pending_validation: {
      icon: <Clock className="h-3 w-3" />,
      label: "Pending",
      className: "text-muted-foreground",
    },
    ready_for_push: {
      icon: <Rocket className="h-3 w-3" />,
      label: "Ready",
      className: "text-primary",
    },
    pushing: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Pushing...",
      className: "text-amber-500",
    },
    pushed: {
      icon: <Check className="h-3 w-3" />,
      label: "Pushed",
      className: "text-emerald-500",
    },
    pushed_to_dsp: {
      icon: <Check className="h-3 w-3" />,
      label: "Pushed",
      className: "text-blue-500",
    },
    live: {
      icon: <Play className="h-3 w-3" />,
      label: "Live",
      className: "text-emerald-500",
    },
    error: {
      icon: <XCircle className="h-3 w-3" />,
      label: "Error",
      className: "text-destructive",
    },
    push_failed: {
      icon: <XCircle className="h-3 w-3" />,
      label: "Failed",
      className: "text-destructive",
    },
    validation_error: {
      icon: <AlertCircle className="h-3 w-3" />,
      label: "Invalid",
      className: "text-destructive",
    },
  };

  const { icon, label, className } = config[status] || config.pending;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1 shrink-0", className)}>
            {icon}
            <span className="text-xs font-medium">{label}</span>
          </div>
        </TooltipTrigger>
        {error && (
          <TooltipContent side="left" className="text-xs max-w-[250px]">
            {error}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// Ad Set item row
function AdSetRow({ item }: { item: AdSetStatus }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2 rounded-lg border",
        item.status === "pushed_to_dsp" || item.status === "live"
          ? "bg-emerald-500/5 border-emerald-500/20"
          : item.status === "pushing"
            ? "bg-amber-500/5 border-amber-500/20"
            : item.status.includes("error") || item.status === "push_failed"
              ? "bg-destructive/5 border-destructive/20"
              : "bg-muted/30 border-border/50"
      )}
    >
      <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center shrink-0">
        <Rocket className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {item.phaseName || "Campaign"}
          <span className="text-muted-foreground font-normal"> · {item.entityType}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {item.platform} · {item.market}
        </p>
      </div>
      <ItemStatusIndicator status={item.status} error={item.errorMessage} />
    </div>
  );
}

// Creative assignment item row
function CreativeRow({ item }: { item: CreativeAssignmentItem }) {
  const Icon = item.mediaType === "video" ? Video : Image;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2 rounded-lg border",
        item.status === "pushed"
          ? "bg-emerald-500/5 border-emerald-500/20"
          : item.status === "pushing"
            ? "bg-amber-500/5 border-amber-500/20"
            : item.status === "error"
              ? "bg-destructive/5 border-destructive/20"
              : "bg-muted/30 border-border/50"
      )}
    >
      <div className="w-8 h-8 bg-muted rounded flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.creativeName}</p>
        <p className="text-xs text-muted-foreground">
          {item.platform} · {item.market} · {item.phaseName}
        </p>
      </div>
      <ItemStatusIndicator status={item.status} error={item.errorMessage} />
    </div>
  );
}

export function LaunchProgressTracker({
  campaignId,
  adSetStatuses,
  creativeAssignments,
  isPushingCampaign,
  isPushingCreatives,
  currentStep,
}: LaunchProgressTrackerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["adsets", "creatives"]));

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Calculate ad set progress
  const adSetProgress = useMemo(() => {
    const total = adSetStatuses.length;
    const pushed = adSetStatuses.filter((s) =>
      ["pushed_to_dsp", "live"].includes(s.status)
    ).length;
    const pushing = adSetStatuses.filter((s) => s.status === "pushing").length;
    const errors = adSetStatuses.filter((s) =>
      ["push_failed", "validation_error"].includes(s.status)
    ).length;
    return { total, pushed, pushing, errors, percent: total > 0 ? (pushed / total) * 100 : 0 };
  }, [adSetStatuses]);

  // Calculate creative progress
  const creativeProgress = useMemo(() => {
    const total = creativeAssignments.length;
    const pushed = creativeAssignments.filter((c) => c.status === "pushed").length;
    const pushing = creativeAssignments.filter((c) => c.status === "pushing").length;
    const errors = creativeAssignments.filter((c) => c.status === "error").length;
    return { total, pushed, pushing, errors, percent: total > 0 ? (pushed / total) * 100 : 0 };
  }, [creativeAssignments]);

  // Check if all ad sets are pushed (requirement for creative push)
  const allAdSetsPushed = adSetProgress.pushed === adSetProgress.total && adSetProgress.total > 0;

  return (
    <div className="space-y-4">
      {/* Step 1: Campaign & Ad Sets */}
      <Collapsible
        open={expandedSections.has("adsets")}
        onOpenChange={() => toggleSection("adsets")}
      >
        <Card className={cn(
          "transition-all",
          currentStep === 1 && "ring-2 ring-primary",
          allAdSetsPushed && "ring-1 ring-emerald-500/30"
        )}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                  allAdSetsPushed 
                    ? "bg-emerald-500 text-white" 
                    : currentStep === 1 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-muted-foreground"
                )}>
                  {allAdSetsPushed ? <Check className="h-4 w-4" /> : "1"}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    Campaign & Ad Sets
                    {isPushingCampaign && (
                      <Badge variant="secondary" className="text-amber-600">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Pushing...
                      </Badge>
                    )}
                    {allAdSetsPushed && (
                      <Badge className="bg-emerald-500">
                        <Check className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {adSetProgress.pushed}/{adSetProgress.total} entities pushed
                    {adSetProgress.errors > 0 && ` · ${adSetProgress.errors} errors`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {expandedSections.has("adsets") ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
              {adSetProgress.total > 0 && (
                <Progress value={adSetProgress.percent} className="h-1.5 mt-3" />
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {adSetStatuses.map((item) => (
                    <AdSetRow key={item.id} item={item} />
                  ))}
                  {adSetStatuses.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No campaign entities to push. Run validation first.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Step 2: Creatives */}
      <Collapsible
        open={expandedSections.has("creatives")}
        onOpenChange={() => toggleSection("creatives")}
      >
        <Card className={cn(
          "transition-all",
          !allAdSetsPushed && "opacity-60",
          currentStep === 2 && allAdSetsPushed && "ring-2 ring-primary",
          creativeProgress.pushed === creativeProgress.total && creativeProgress.total > 0 && "ring-1 ring-emerald-500/30"
        )}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                  creativeProgress.pushed === creativeProgress.total && creativeProgress.total > 0
                    ? "bg-emerald-500 text-white"
                    : currentStep === 2 && allAdSetsPushed
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                )}>
                  {creativeProgress.pushed === creativeProgress.total && creativeProgress.total > 0 ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    "2"
                  )}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    Creatives / Ads
                    {isPushingCreatives && (
                      <Badge variant="secondary" className="text-amber-600">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Pushing...
                      </Badge>
                    )}
                    {creativeProgress.pushed === creativeProgress.total && creativeProgress.total > 0 && (
                      <Badge className="bg-emerald-500">
                        <Check className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    )}
                    {!allAdSetsPushed && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Requires Step 1
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {creativeProgress.pushed}/{creativeProgress.total} creatives pushed
                    {creativeProgress.pushing > 0 && ` · ${creativeProgress.pushing} in progress`}
                    {creativeProgress.errors > 0 && ` · ${creativeProgress.errors} errors`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {expandedSections.has("creatives") ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
              {creativeProgress.total > 0 && (
                <Progress value={creativeProgress.percent} className="h-1.5 mt-3" />
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {!allAdSetsPushed ? (
                <div className="py-6 text-center">
                  <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Complete Step 1 first to push creatives
                  </p>
                </div>
              ) : (
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-2">
                    {creativeAssignments.map((item) => (
                      <CreativeRow key={item.id} item={item} />
                    ))}
                    {creativeAssignments.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No creatives assigned to this campaign.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
