import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { format, differenceInMinutes, differenceInHours } from "date-fns";
import type { QCTrackingItem, QCTransition } from "@/hooks/useQCTracking";
import { QC_STATE_LABELS, QC_STAGE_ORDER, getQCColorClass, isValidTransition } from "@/utils/qcUtils";
import type { QCState } from "@/utils/qcUtils";

interface QCStatusPanelProps {
  items: QCTrackingItem[];
  transitions: QCTransition[];
  loading: boolean;
  summary: {
    total: number;
    waitingForQC: number;
    inQC: number;
    pushedLive: number;
    delivering: number;
    errors: number;
    autoCompleted: number;
  };
}

export function QCStatusPanel({ items, transitions, loading, summary }: QCStatusPanelProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading QC status...
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No QC tracking data yet. QC states will appear once campaigns are pushed and synced.</p>
        </CardContent>
      </Card>
    );
  }

  const deliveredPercent = summary.total > 0 ? Math.round((summary.delivering / summary.total) * 100) : 0;

  // Group by platform
  const byPlatform = items.reduce<Record<string, QCTrackingItem[]>>((acc, item) => {
    const key = item.platform;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const togglePlatform = (platform: string) => {
    setExpandedPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  };

  // Get time between transitions for an item
  const getTransitionTimes = (trackingId: string) => {
    const itemTransitions = transitions.filter(t => t.qc_tracking_id === trackingId);
    if (itemTransitions.length < 2) return null;

    const times: { from: QCState | null; to: QCState; duration: string }[] = [];
    for (let i = 1; i < itemTransitions.length; i++) {
      const prev = itemTransitions[i - 1];
      const curr = itemTransitions[i];
      const mins = differenceInMinutes(new Date(curr.transitioned_at), new Date(prev.transitioned_at));
      const hrs = differenceInHours(new Date(curr.transitioned_at), new Date(prev.transitioned_at));
      times.push({
        from: prev.to_state,
        to: curr.to_state,
        duration: hrs >= 1 ? `${hrs}h ${mins % 60}m` : `${mins}m`,
      });
    }
    return times;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Quality Control Status
          {summary.errors > 0 && (
            <Badge variant="destructive" className="ml-2">
              {summary.errors} Error{summary.errors > 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Overview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">QC Completion</span>
            <span className="font-medium">{deliveredPercent}% Delivering</span>
          </div>
          <Progress value={deliveredPercent} className="h-2" />
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <span>Waiting: {summary.waitingForQC}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span>QC: {summary.inQC}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-purple-500" />
              <span>Pushed Live: {summary.pushedLive}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span>Delivering: {summary.delivering}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Per Platform breakdown */}
        <TooltipProvider>
          <div className="space-y-2">
            {Object.entries(byPlatform).map(([platform, platformItems]) => {
              const isExpanded = expandedPlatforms[platform] ?? false;
              const errorCount = platformItems.filter(i => !i.is_valid).length;

              return (
                <Collapsible key={platform} open={isExpanded} onOpenChange={() => togglePlatform(platform)}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md text-sm">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-medium capitalize">{platform}</span>
                      <Badge variant="outline" className="text-xs">{platformItems.length}</Badge>
                      {errorCount > 0 && (
                        <Badge variant="destructive" className="text-xs">{errorCount} error{errorCount > 1 ? 's' : ''}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {QC_STAGE_ORDER.map(stage => {
                        const count = platformItems.filter(i => i.current_state === stage).length;
                        if (count === 0) return null;
                        return (
                          <Badge key={stage} variant="outline" className={`text-xs ${getQCColorClass(stage)}`}>
                            {QC_STATE_LABELS[stage].substring(0, 3)}: {count}
                          </Badge>
                        );
                      })}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-6 mt-1">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Entity</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Market</TableHead>
                            <TableHead className="text-xs">QC State</TableHead>
                            <TableHead className="text-xs">Impressions</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {platformItems.map(item => {
                            const transitionTimes = getTransitionTimes(item.id);
                            const transitionCheck = item.previous_state
                              ? isValidTransition(item.previous_state, item.current_state)
                              : { valid: true };

                            return (
                              <TableRow key={item.id}>
                                <TableCell className="text-xs max-w-[200px] truncate">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help">{item.entity_name || item.dsp_entity_id || '-'}</span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[400px]">
                                      <div className="space-y-1 text-xs">
                                        <p className="font-medium">{item.entity_name}</p>
                                        {item.dsp_entity_id && <p className="text-muted-foreground">DSP ID: {item.dsp_entity_id}</p>}
                                        {item.qc_parameter_raw && <p>Raw QC: {item.qc_parameter_raw}</p>}
                                        {transitionTimes && (
                                          <div className="mt-1 pt-1 border-t">
                                            <p className="font-medium mb-1">Transition Times:</p>
                                            {transitionTimes.map((t, i) => (
                                              <p key={i}>
                                                {t.from ? QC_STATE_LABELS[t.from] : 'Start'} → {QC_STATE_LABELS[t.to]}: {t.duration}
                                              </p>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TableCell>
                                <TableCell className="text-xs capitalize">{item.entity_type}</TableCell>
                                <TableCell className="text-xs">{item.market || '-'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={`text-xs ${getQCColorClass(item.current_state)}`}>
                                    {QC_STATE_LABELS[item.current_state]}
                                  </Badge>
                                  {item.auto_completed && (
                                    <Badge variant="outline" className="text-xs ml-1 bg-green-500/10 text-green-700 border-green-500/30">
                                      Auto
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {item.impressions_count > 0 ? item.impressions_count.toLocaleString() : '-'}
                                </TableCell>
                                <TableCell>
                                  {!item.is_valid ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-1">
                                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                                          <span className="text-xs text-destructive">Error</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-[300px]">
                                        <p className="text-xs">{item.validation_error}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : !transitionCheck.valid ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-1">
                                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                          <span className="text-xs text-amber-600">Skipped</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p className="text-xs">
                                          Skipped stages: {transitionCheck.skippedStages?.map(s => QC_STATE_LABELS[s]).join(', ')}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : item.current_state === 'delivering' ? (
                                    <div className="flex items-center gap-1">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                      <span className="text-xs text-green-600">Live</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className="text-xs text-muted-foreground">
                                        {format(new Date(item.updated_at), 'MMM d, HH:mm')}
                                      </span>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
