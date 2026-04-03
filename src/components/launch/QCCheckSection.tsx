import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCheck,
  Zap,
  ChevronsUpDown,
  ChevronsDownUp,
  FastForward,
  Rewind,
  Mail,
} from "lucide-react";
import type { QCTrackingItem } from "@/hooks/useQCTracking";
import type { QCChecklistItem } from "@/config/qcChecklists";
import { QC_STATE_LABELS, QC_STAGE_ORDER, getQCColorClass, getQCIconColor, getNextState, getPreviousState } from "@/utils/qcUtils";
import type { QCState } from "@/utils/qcUtils";

interface QCCheckSectionProps {
  items: QCTrackingItem[];
  loading: boolean;
  campaignId?: string;
  qcEnforceIndividual?: boolean;
  summary: {
    total: number;
    waitingForQC: number;
    inQC: number;
    pushedLive: number;
    delivering: number;
    errors: number;
    autoCompleted: number;
  };
  getChecklist: (platform: string, entityType: string) => QCChecklistItem[];
  getCompletions: (trackingId: string) => Record<string, boolean>;
  getCompletionCount: (trackingId: string, items: QCChecklistItem[]) => { checked: number; total: number };
  isAllChecked: (trackingId: string, items: QCChecklistItem[]) => boolean;
  onToggleItem: (trackingId: string, itemKey: string, checked: boolean) => void;
  onToggleAll: (trackingId: string, items: QCChecklistItem[], checked: boolean) => void;
  onUpdateState: (trackingId: string, newState: QCState) => void;
  onInitialize: () => void;
}

export function QCCheckSection({
  items,
  loading,
  campaignId,
  qcEnforceIndividual = false,
  summary,
  getChecklist,
  getCompletions,
  getCompletionCount,
  isAllChecked,
  onToggleItem,
  onToggleAll,
  onUpdateState,
  onInitialize,
}: QCCheckSectionProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({});
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({});
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const [expandedEntities, setExpandedEntities] = useState<Record<string, boolean>>({});
  const [initAttempts, setInitAttempts] = useState(0);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [pendingLiveAction, setPendingLiveAction] = useState<(() => void) | null>(null);

  // Send stakeholder notification when campaign goes live
  const sendLiveNotification = useCallback(async () => {
    if (!campaignId) return;
    try {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("name")
        .eq("id", campaignId)
        .single();

      await supabase.functions.invoke("send-dsp-push-notification", {
        body: {
          campaignId,
          campaignName: campaign?.name || "Campaign",
          finalStatus: "pushed_to_dsp",
          results: [],
        },
      });
      console.log("✅ Live stakeholder notification sent");
    } catch (err) {
      console.error("Failed to send live notification:", err);
    }
  }, [campaignId]);

  // Auto-initialize tracking entries when first mounted or when items are empty (max 2 attempts)
  useEffect(() => {
    if (!loading && items.length === 0 && initAttempts < 2) {
      setInitAttempts(prev => prev + 1);
      onInitialize();
    }
  }, [loading, items.length, onInitialize, initAttempts]);

  // Wraps onUpdateState to intercept FORWARD transitions to pushed_live with confirmation
  const handleUpdateStateWithLiveCheck = useCallback((trackingId: string, newState: QCState) => {
    if (newState === 'pushed_live') {
      // Only confirm when moving FORWARD to pushed_live (from qc), not when moving BACK (from delivering)
      const item = items.find(i => i.id === trackingId);
      const isForwardTransition = item && item.current_state === 'qc';
      if (isForwardTransition) {
        setPendingLiveAction(() => () => {
          onUpdateState(trackingId, newState);
          // Send stakeholder email notification
          sendLiveNotification();
        });
        setLiveConfirmOpen(true);
      } else {
        onUpdateState(trackingId, newState);
      }
    } else {
      onUpdateState(trackingId, newState);
    }
  }, [onUpdateState, items]);

  const tree = useMemo(() => buildTree(items), [items]);

  // Check if all items are fully checked and can advance
  const allItemsChecked = useMemo(() => {
    return items.every(item => {
      const checklist = getChecklist(item.platform, item.entity_type);
      return isAllChecked(item.id, checklist);
    });
  }, [items, getChecklist, isAllChecked]);

  // Check if all items are at the same state and can advance together
  const canMoveAllForward = useMemo(() => {
    if (items.length === 0) return false;
    return items.every(item => {
      const nextState = getNextState(item.current_state);
      if (!nextState) return false;
      if (item.current_state === 'waiting_for_final_qc') {
        const checklist = getChecklist(item.platform, item.entity_type);
        return isAllChecked(item.id, checklist);
      }
      return true;
    });
  }, [items, getChecklist, isAllChecked]);

  const canMoveAllBack = useMemo(() => {
    if (items.length === 0) return false;
    return items.some(item => getPreviousState(item.current_state) !== null);
  }, [items]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
          Loading Quality Check...
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No entities to QC yet. Push campaigns first to start the quality check process.</p>
        </CardContent>
      </Card>
    );
  }

  const deliveredPercent = summary.total > 0 ? Math.round(((summary.delivering + summary.pushedLive) / summary.total) * 100) : 0;
  const checkedPercent = summary.total > 0 ? Math.round(((summary.inQC + summary.pushedLive + summary.delivering) / summary.total) * 100) : 0;

  const expandAll = () => {
    const platforms: Record<string, boolean> = {};
    const markets: Record<string, boolean> = {};
    const phases: Record<string, boolean> = {};
    const entities: Record<string, boolean> = {};
    for (const item of items) {
      platforms[item.platform] = true;
      markets[`${item.platform}|${item.market || 'Unknown'}`] = true;
      phases[`${item.platform}|${item.market || 'Unknown'}|${item.phase_name || '_none'}`] = true;
      entities[item.id] = true;
    }
    setExpandedPlatforms(platforms);
    setExpandedMarkets(markets);
    setExpandedPhases(phases);
    setExpandedEntities(entities);
  };

  const collapseAll = () => {
    setExpandedPlatforms({});
    setExpandedMarkets({});
    setExpandedPhases({});
    setExpandedEntities({});
  };

  const togglePlatform = (platform: string) => {
    setExpandedPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  };

  const toggleMarket = (key: string) => {
    setExpandedMarkets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const togglePhase = (key: string) => {
    setExpandedPhases(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleEntity = (id: string) => {
    setExpandedEntities(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMoveAllForward = () => {
    // Check if any items will move FORWARD to pushed_live (from qc state)
    const willMoveToPushedLive = items.some(item => {
      const nextState = getNextState(item.current_state);
      return nextState === 'pushed_live' && item.current_state === 'qc';
    });

    const doMove = () => {
      for (const item of items) {
        const nextState = getNextState(item.current_state);
        if (nextState) {
          if (item.current_state === 'waiting_for_final_qc') {
            const checklist = getChecklist(item.platform, item.entity_type);
            if (isAllChecked(item.id, checklist)) {
              onUpdateState(item.id, nextState);
            }
          } else {
            onUpdateState(item.id, nextState);
          }
        }
      }
    };

    if (willMoveToPushedLive) {
      setPendingLiveAction(() => () => {
        doMove();
        sendLiveNotification();
      });
      setLiveConfirmOpen(true);
    } else {
      doMove();
    }
  };

  const handleMoveAllBack = () => {
    // Moving back should NOT trigger the live email confirmation
    const doMove = () => {
      for (const item of items) {
        const prevState = getPreviousState(item.current_state);
        if (prevState) {
          onUpdateState(item.id, prevState);
        }
      }
    };
    doMove();
  };

  // Auto-advance handler: check all + move to Checked
  const handleBulkCheckAndAdvance = (trackingId: string, checklist: QCChecklistItem[], currentState: QCState) => {
    onToggleAll(trackingId, checklist, true);
    if (currentState === 'waiting_for_final_qc') {
      // Small delay to let the toggle persist first
      setTimeout(() => onUpdateState(trackingId, 'qc'), 100);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Quality Check
            {summary.delivering > 0 && (
              <Badge variant="outline" className="ml-2 bg-green-500/10 text-green-700 border-green-500/30">
                {summary.delivering} Delivering
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={expandAll} className="h-7 px-2 text-xs">
              <ChevronsUpDown className="h-3 w-3 mr-1" />
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll} className="h-7 px-2 text-xs">
              <ChevronsDownUp className="h-3 w-3 mr-1" />
              Collapse All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Overview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">QC Progress</span>
            <span className="font-medium">{checkedPercent}% Complete</span>
          </div>
          <Progress value={checkedPercent} className="h-2" />
          <div className="grid grid-cols-4 gap-2 text-xs">
            {QC_STAGE_ORDER.map(stage => {
              const count = items.filter(i => i.current_state === stage).length;
              return (
                <div key={stage} className="flex items-center gap-1">
                  <div className={`h-2 w-2 rounded-full ${getStateDotColor(stage)}`} />
                  <span>{QC_STATE_LABELS[stage]}: {count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Global Move All Buttons */}
        <div className="flex items-center justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!canMoveAllBack}>
                <Rewind className="h-3 w-3 mr-1" />
                Move All Back
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move All Items Back?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will move all {items.filter(i => getPreviousState(i.current_state) !== null).length} eligible items to their previous state.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleMoveAllBack}>Yes, Move All Back</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="default" size="sm" className="h-7 text-xs" disabled={!canMoveAllForward}>
                <FastForward className="h-3 w-3 mr-1" />
                Move All Forward
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move All Items Forward?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will advance all eligible items to their next state. Items that haven't completed their checklist will be skipped. This action is your responsibility.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleMoveAllForward}>Yes, Move All Forward</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Separator />

        {/* Live Confirmation Dialog */}
        <AlertDialog open={liveConfirmOpen} onOpenChange={setLiveConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-purple-500" />
                Set ActiPlan Status to Live?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Setting the status to <strong>Pushed Live</strong> will send an email confirmation to all stakeholders notifying them that the campaign is now live. Are you sure you want to proceed?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingLiveAction(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                pendingLiveAction?.();
                setPendingLiveAction(null);
                setLiveConfirmOpen(false);
              }}>
                Yes, Set as Live
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Tree View */}
        <TooltipProvider>
          <div className="space-y-1">
            {Object.entries(tree).map(([platform, markets]) => {
              const isExpanded = expandedPlatforms[platform] ?? true;
              const platformItems = items.filter(i => i.platform === platform);
              const platformChecked = platformItems.filter(i => i.current_state !== 'waiting_for_final_qc').length;

              return (
                <Collapsible key={platform} open={isExpanded} onOpenChange={() => togglePlatform(platform)}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="capitalize">{platform}</span>
                      <Badge variant="outline" className="text-xs">{platformItems.length}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {platformChecked}/{platformItems.length} progressed
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-4 space-y-1">
                      {Object.entries(markets).map(([market, phases]) => {
                        const marketKey = `${platform}|${market}`;
                        const isMarketExpanded = expandedMarkets[marketKey] ?? true;

                        return (
                          <Collapsible key={market} open={isMarketExpanded} onOpenChange={() => toggleMarket(marketKey)}>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full py-1 px-2 hover:bg-muted/30 rounded text-xs font-medium text-muted-foreground">
                              {isMarketExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {market}
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              {Object.entries(phases).map(([phase, entityGroups]) => {
                                const phaseKey = `${platform}|${market}|${phase}`;
                                const isPhaseExpanded = expandedPhases[phaseKey] ?? true;

                                return (
                                  <div key={phase} className="ml-4">
                                    {phase !== '_none' ? (
                                      <Collapsible open={isPhaseExpanded} onOpenChange={() => togglePhase(phaseKey)}>
                                        <CollapsibleTrigger className="flex items-center gap-2 w-full py-0.5 px-2 hover:bg-muted/20 rounded text-xs text-muted-foreground italic">
                                          {isPhaseExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                          {phase}
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                          <EntityGroupContent
                                            entityGroups={entityGroups}
                                            expandedEntities={expandedEntities}
                                            toggleEntity={toggleEntity}
                                            getChecklist={getChecklist}
                                            getCompletions={getCompletions}
                                            getCompletionCount={getCompletionCount}
                                            isAllChecked={isAllChecked}
                                            onToggleItem={onToggleItem}
                                            onToggleAll={onToggleAll}
                                            onUpdateState={handleUpdateStateWithLiveCheck}
                                            onBulkCheckAndAdvance={handleBulkCheckAndAdvance}
                                          />
                                        </CollapsibleContent>
                                      </Collapsible>
                                    ) : (
                                      <EntityGroupContent
                                        entityGroups={entityGroups}
                                        expandedEntities={expandedEntities}
                                        toggleEntity={toggleEntity}
                                        getChecklist={getChecklist}
                                        getCompletions={getCompletions}
                                        getCompletionCount={getCompletionCount}
                                        isAllChecked={isAllChecked}
                                        onToggleItem={onToggleItem}
                                        onToggleAll={onToggleAll}
                                        onUpdateState={handleUpdateStateWithLiveCheck}
                                        onBulkCheckAndAdvance={handleBulkCheckAndAdvance}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
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

// ─── Entity Group Content ───────────────────────────────────────────────────

interface EntityGroupContentProps {
  entityGroups: Record<string, QCTrackingItem[]>;
  expandedEntities: Record<string, boolean>;
  toggleEntity: (id: string) => void;
  getChecklist: (platform: string, entityType: string) => QCChecklistItem[];
  getCompletions: (trackingId: string) => Record<string, boolean>;
  getCompletionCount: (trackingId: string, items: QCChecklistItem[]) => { checked: number; total: number };
  isAllChecked: (trackingId: string, items: QCChecklistItem[]) => boolean;
  onToggleItem: (trackingId: string, itemKey: string, checked: boolean) => void;
  onToggleAll: (trackingId: string, items: QCChecklistItem[], checked: boolean) => void;
  onUpdateState: (trackingId: string, newState: QCState) => void;
  onBulkCheckAndAdvance: (trackingId: string, checklist: QCChecklistItem[], currentState: QCState) => void;
  qcEnforceIndividual?: boolean;
}

function EntityGroupContent({
  entityGroups,
  expandedEntities,
  toggleEntity,
  getChecklist,
  getCompletions,
  getCompletionCount,
  isAllChecked,
  onToggleItem,
  onToggleAll,
  onUpdateState,
  onBulkCheckAndAdvance,
  qcEnforceIndividual = false,
}: EntityGroupContentProps) {
  return (
    <>
      {Object.entries(entityGroups).map(([entityType, entityItems]) => (
        <div key={entityType} className="ml-2 space-y-0.5">
            <div className="flex items-center justify-between px-2 py-0.5">
              <div className="text-xs font-medium text-muted-foreground/70 capitalize">
                {entityType === 'adset' ? 'Ad Sets' : entityType === 'ad' ? 'Ads' : 'Campaigns'}
              </div>
              {!qcEnforceIndividual && (
                <BulkCheckAllButton
                  entityItems={entityItems}
                  entityType={entityType}
                  getChecklist={getChecklist}
                  onBulkCheckAndAdvance={onBulkCheckAndAdvance}
                />
              )}
          </div>
          {entityItems.map(item => (
            <EntityRow
              key={item.id}
              item={item}
              isExpanded={expandedEntities[item.id] ?? false}
              onToggleExpand={() => toggleEntity(item.id)}
              checklist={getChecklist(item.platform, item.entity_type)}
              completions={getCompletions(item.id)}
              completionCount={getCompletionCount(item.id, getChecklist(item.platform, item.entity_type))}
              allChecked={isAllChecked(item.id, getChecklist(item.platform, item.entity_type))}
              onToggleItem={(key, checked) => onToggleItem(item.id, key, checked)}
              onToggleAll={(checked) => onToggleAll(item.id, getChecklist(item.platform, item.entity_type), checked)}
              onUpdateState={(state) => onUpdateState(item.id, state)}
              onBulkCheckAndAdvance={() => onBulkCheckAndAdvance(item.id, getChecklist(item.platform, item.entity_type), item.current_state)}
              qcEnforceIndividual={qcEnforceIndividual}
            />
          ))}
        </div>
      ))}
    </>
  );
}

// ─── Entity Row with Checklist ──────────────────────────────────────────────

interface EntityRowProps {
  item: QCTrackingItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  checklist: QCChecklistItem[];
  completions: Record<string, boolean>;
  completionCount: { checked: number; total: number };
  allChecked: boolean;
  onToggleItem: (key: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onUpdateState: (state: QCState) => void;
  onBulkCheckAndAdvance: () => void;
  qcEnforceIndividual?: boolean;
}

function EntityRow({
  item,
  isExpanded,
  onToggleExpand,
  checklist,
  completions,
  completionCount,
  allChecked,
  onToggleItem,
  onToggleAll,
  onUpdateState,
  onBulkCheckAndAdvance,
  qcEnforceIndividual = false,
}: EntityRowProps) {
  const nextState = getNextState(item.current_state);
  const prevState = getPreviousState(item.current_state);
  const canAdvance = item.current_state === 'waiting_for_final_qc' ? allChecked : true;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-1.5 px-2 hover:bg-muted/30 rounded text-xs group">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <span className="truncate">{item.entity_name || item.dsp_entity_id || 'Unnamed'}</span>
          <span className="text-muted-foreground shrink-0">
            ({completionCount.checked}/{completionCount.total})
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getQCColorClass(item.current_state)}`}>
            {QC_STATE_LABELS[item.current_state]}
          </Badge>
          {item.auto_completed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Zap className="h-3 w-3 text-green-500" />
              </TooltipTrigger>
              <TooltipContent>Auto-detected as delivering</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-7 mr-2 mb-2 p-3 bg-muted/20 rounded-md border space-y-3">
          {/* Check All / Uncheck All */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                disabled={qcEnforceIndividual}
                title={qcEnforceIndividual ? 'QC enforcement is enabled — items must be checked individually' : undefined}
                onClick={(e) => { e.stopPropagation(); onToggleAll(!allChecked); }}
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                {allChecked ? 'Uncheck All' : 'Check All'}
              </Button>
            </div>
            <div className="flex items-center gap-1">
              {prevState && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs px-2"
                      onClick={(e) => { e.stopPropagation(); onUpdateState(prevState); }}
                    >
                      <ArrowLeft className="h-3 w-3 mr-1" />
                      Back to {QC_STATE_LABELS[prevState]}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move back to previous state</TooltipContent>
                </Tooltip>
              )}
              {nextState && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={canAdvance ? "default" : "outline"}
                      className="h-6 text-xs px-2"
                      disabled={!canAdvance}
                      onClick={(e) => { e.stopPropagation(); onUpdateState(nextState); }}
                    >
                      <ArrowRight className="h-3 w-3 mr-1" />
                      Move to {QC_STATE_LABELS[nextState]}
                    </Button>
                  </TooltipTrigger>
                  {!canAdvance && (
                    <TooltipContent>Complete all checklist items first</TooltipContent>
                  )}
                </Tooltip>
              )}
            </div>
          </div>

          {/* Checklist Items */}
          <div className="space-y-1.5">
            {groupByCategory(checklist).map(([category, categoryItems]) => (
              <div key={category}>
                {category !== '_default' && (
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2 mb-1">
                    {category}
                  </div>
                )}
                {categoryItems.map(ci => (
                  <label
                    key={ci.key}
                    className="flex items-start gap-2 py-0.5 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={completions[ci.key] ?? false}
                      onCheckedChange={(checked) => onToggleItem(ci.key, !!checked)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium leading-tight">{ci.label}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{ci.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Bulk Check All Button with Confirmation + Auto-Advance ────────────────

interface BulkCheckAllButtonProps {
  entityItems: QCTrackingItem[];
  entityType: string;
  getChecklist: (platform: string, entityType: string) => QCChecklistItem[];
  onBulkCheckAndAdvance: (trackingId: string, checklist: QCChecklistItem[], currentState: QCState) => void;
}

function BulkCheckAllButton({ entityItems, entityType, getChecklist, onBulkCheckAndAdvance }: BulkCheckAllButtonProps) {
  const label = entityType === 'adset' ? 'Ad Sets' : entityType === 'ad' ? 'Ads' : 'Campaigns';

  const handleBulkCheck = () => {
    for (const item of entityItems) {
      const checklist = getChecklist(item.platform, item.entity_type);
      onBulkCheckAndAdvance(item.id, checklist, item.current_state);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={(e) => e.stopPropagation()}>
          <CheckCheck className="h-3 w-3 mr-0.5" />
          Check All {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Bulk Check All {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to mark all checklist items as checked for {entityItems.length} {label.toLowerCase()} and automatically advance them to <strong>Checked</strong> state. 
            This action is your responsibility — please ensure all items have been properly reviewed before confirming.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleBulkCheck}>
            Yes, Check All & Advance
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStateDotColor(state: QCState): string {
  switch (state) {
    case 'waiting_for_final_qc': return 'bg-amber-500';
    case 'qc': return 'bg-blue-500';
    case 'pushed_live': return 'bg-purple-500';
    case 'delivering': return 'bg-green-500';
    default: return 'bg-muted-foreground';
  }
}

type TreeStructure = Record<string, Record<string, Record<string, Record<string, QCTrackingItem[]>>>>;

function buildTree(items: QCTrackingItem[]): TreeStructure {
  const tree: TreeStructure = {};
  for (const item of items) {
    const platform = item.platform;
    const market = item.market || 'Unknown';
    const phase = item.phase_name || '_none';
    const entityType = item.entity_type;

    if (!tree[platform]) tree[platform] = {};
    if (!tree[platform][market]) tree[platform][market] = {};
    if (!tree[platform][market][phase]) tree[platform][market][phase] = {};
    if (!tree[platform][market][phase][entityType]) tree[platform][market][phase][entityType] = [];
    tree[platform][market][phase][entityType].push(item);
  }
  return tree;
}

function groupByCategory(items: QCChecklistItem[]): [string, QCChecklistItem[]][] {
  const groups: Record<string, QCChecklistItem[]> = {};
  for (const item of items) {
    const cat = item.category || '_default';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return Object.entries(groups);
}
