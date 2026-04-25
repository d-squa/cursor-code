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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  AlertOctagon,
  CheckCircle,
} from "lucide-react";
import type { QCTrackingItem } from "@/hooks/useQCTracking";
import type { QCChecklistItem } from "@/config/qcChecklists";
import { QC_STATE_LABELS, QC_STAGE_ORDER, getQCColorClass, getQCIconColor, getNextState, getPreviousState } from "@/utils/qcUtils";
import type { QCState } from "@/utils/qcUtils";
import { useSetupMistakes, type SetupMistake } from "@/hooks/useSetupMistakes";
import { SetupMistakeDialog, type SetupMistakeContext } from "@/components/SetupMistakeDialog";

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
  onToggleAll: (trackingId: string, items: QCChecklistItem[], checked: boolean, checkMethod?: string) => void;
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
  const [setupMistakeDialogOpen, setSetupMistakeDialogOpen] = useState(false);
  const [setupMistakeContext, setSetupMistakeContext] = useState<SetupMistakeContext | null>(null);

  const {
    mistakes: setupMistakes,
    refresh: refreshMistakes,
    resolveMistake,
    hasOpenMistakeForTracking,
    openMistakesForTracking,
  } = useSetupMistakes({ campaignId, enabled: !!campaignId });

  const openMistakesByTracking = useMemo(() => {
    const map: Record<string, SetupMistake[]> = {};
    setupMistakes.forEach((m) => {
      if (m.status !== "open" || !m.qc_tracking_id) return;
      if (!map[m.qc_tracking_id]) map[m.qc_tracking_id] = [];
      map[m.qc_tracking_id].push(m);
    });
    return map;
  }, [setupMistakes]);

  const handleLogMistake = useCallback((item: QCTrackingItem) => {
    setSetupMistakeContext({
      campaignId: campaignId || item.campaign_id,
      qcTrackingId: item.id,
      platform: item.platform,
      market: item.market,
      phaseName: item.phase_name,
      adSetName: item.ad_set_name,
      adName: item.entity_type === "ad" ? (item.entity_name || null) : null,
      entityType: item.entity_type,
    });
    setSetupMistakeDialogOpen(true);
  }, [campaignId]);

  const handleResolveMistake = useCallback(async (mistakeId: string) => {
    try {
      await resolveMistake(mistakeId);
      toast.success("Setup mistake resolved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to resolve");
    }
  }, [resolveMistake]);

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
      // Block if there are open Setup Mistakes for this item
      if (hasOpenMistakeForTracking(trackingId)) {
        toast.error("Cannot move to Pushed Live: this item has unresolved Setup Mistakes. Resolve them first.");
        return;
      }
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
  }, [onUpdateState, items, hasOpenMistakeForTracking]);

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
  const handleBulkCheckAndAdvance = (trackingId: string, checklist: QCChecklistItem[], currentState: QCState, checkMethod: string = 'bulk') => {
    onToggleAll(trackingId, checklist, true, checkMethod);
    if (currentState === 'waiting_for_final_qc') {
      // Small delay to let the toggle persist first
      setTimeout(() => onUpdateState(trackingId, 'qc'), 100);
    }
  };

  return (
    <>
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
                              {Object.entries(phases).map(([phase, phaseItems]) => {
                                const phaseKey = `${platform}|${market}|${phase}`;
                                const isPhaseExpanded = expandedPhases[phaseKey] ?? true;

                                // Separate campaigns, ad sets, and ads
                                const campaigns = phaseItems.filter(i => i.entity_type === 'campaign');
                                const adsets = phaseItems.filter(i => i.entity_type === 'adset');
                                const ads = phaseItems.filter(i => i.entity_type === 'ad');

                                // Group ads by their ad_set_name (fallback: parse from entity_name "Ad in {name}")
                                const adsByAdSet: Record<string, QCTrackingItem[]> = {};
                                for (const ad of ads) {
                                  let adSetKey = ad.ad_set_name;
                                  if (!adSetKey && ad.entity_name?.startsWith('Ad in ')) {
                                    adSetKey = ad.entity_name.substring(6);
                                  }
                                  adSetKey = adSetKey || '_unassigned';
                                  if (!adsByAdSet[adSetKey]) adsByAdSet[adSetKey] = [];
                                  adsByAdSet[adSetKey].push(ad);
                                }

                                return (
                                  <div key={phase} className="ml-4">
                                    {phase !== '_none' ? (
                                      <Collapsible open={isPhaseExpanded} onOpenChange={() => togglePhase(phaseKey)}>
                                        <CollapsibleTrigger className="flex items-center gap-2 w-full py-0.5 px-2 hover:bg-muted/20 rounded text-xs text-muted-foreground italic">
                                          {isPhaseExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                          {phase}
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                          <HierarchicalEntityContent
                                            campaigns={campaigns}
                                            adsets={adsets}
                                            adsByAdSet={adsByAdSet}
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
                                            qcEnforceIndividual={qcEnforceIndividual}
                                            onLogMistake={handleLogMistake}
                                            onResolveMistake={handleResolveMistake}
                                            openMistakesByTracking={openMistakesByTracking}
                                          />
                                        </CollapsibleContent>
                                      </Collapsible>
                                    ) : (
                                      <HierarchicalEntityContent
                                        campaigns={campaigns}
                                        adsets={adsets}
                                        adsByAdSet={adsByAdSet}
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
                                        qcEnforceIndividual={qcEnforceIndividual}
                                            onLogMistake={handleLogMistake}
                                            onResolveMistake={handleResolveMistake}
                                            openMistakesByTracking={openMistakesByTracking}
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
    <SetupMistakeDialog
      open={setupMistakeDialogOpen}
      onOpenChange={setSetupMistakeDialogOpen}
      context={setupMistakeContext}
      onSuccess={() => { void refreshMistakes(); }}
    />
    </>
  );
}

// ─── Hierarchical Entity Content (Campaign > Ad Set > Ad) ───────────────────

interface HierarchicalEntityContentProps {
  campaigns: QCTrackingItem[];
  adsets: QCTrackingItem[];
  adsByAdSet: Record<string, QCTrackingItem[]>;
  expandedEntities: Record<string, boolean>;
  toggleEntity: (id: string) => void;
  getChecklist: (platform: string, entityType: string) => QCChecklistItem[];
  getCompletions: (trackingId: string) => Record<string, boolean>;
  getCompletionCount: (trackingId: string, items: QCChecklistItem[]) => { checked: number; total: number };
  isAllChecked: (trackingId: string, items: QCChecklistItem[]) => boolean;
  onToggleItem: (trackingId: string, itemKey: string, checked: boolean) => void;
  onToggleAll: (trackingId: string, items: QCChecklistItem[], checked: boolean, checkMethod?: string) => void;
  onUpdateState: (trackingId: string, newState: QCState) => void;
  onBulkCheckAndAdvance: (trackingId: string, checklist: QCChecklistItem[], currentState: QCState, checkMethod?: string) => void;
  qcEnforceIndividual?: boolean;
  onLogMistake: (item: QCTrackingItem) => void;
  onResolveMistake: (mistakeId: string) => void;
  openMistakesByTracking: Record<string, SetupMistake[]>;
}

function HierarchicalEntityContent({
  campaigns,
  adsets,
  adsByAdSet,
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
  onLogMistake,
  onResolveMistake,
  openMistakesByTracking,
}: HierarchicalEntityContentProps) {
  const allAds = Object.values(adsByAdSet).flat();
  const adGroups = Object.entries(adsByAdSet).map(([groupName, groupAds]) => ({
    groupName,
    ads: groupAds,
    normalizedName: normalizeHierarchyKey(groupName),
    languageBucket: inferAdSetLanguageBucket(groupName),
  }));
  const remainingGroups = new Map(adGroups.map((group) => [group.groupName, group]));
  const childAdsByAdSetId = new Map<string, QCTrackingItem[]>();

  for (const adset of adsets) {
    const exactMatchKeys = new Set(
      [adset.entity_name, adset.ad_set_name]
        .map(normalizeHierarchyKey)
        .filter(Boolean)
    );

    let matchedGroup = adGroups.find(
      (group) => remainingGroups.has(group.groupName) && exactMatchKeys.has(group.normalizedName)
    );

    if (!matchedGroup) {
      const languageBucket = inferAdSetLanguageBucket(adset.entity_name || adset.ad_set_name);
      if (languageBucket) {
        matchedGroup = adGroups.find(
          (group) => remainingGroups.has(group.groupName) && group.languageBucket === languageBucket
        );
      }
    }

    if (matchedGroup) {
      childAdsByAdSetId.set(adset.id, matchedGroup.ads);
      remainingGroups.delete(matchedGroup.groupName);
    }
  }

  const unmatchedAdGroups = Array.from(remainingGroups.values()).filter((group) => group.groupName !== '_unassigned');
  const orphanAds = remainingGroups.get('_unassigned')?.ads || [];

  return (
    <>
      {/* Campaigns */}
      {campaigns.length > 0 && (
        <div className="ml-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 py-0.5">
            <div className="text-xs font-medium text-muted-foreground/70">Campaigns</div>
            {!qcEnforceIndividual && (
              <ScopedBulkCheckMenu
                getChecklist={getChecklist}
                onBulkCheckAndAdvance={onBulkCheckAndAdvance}
                scopes={[
                  { label: 'All campaigns', items: campaigns },
                  ...(adsets.length > 0 ? [{ label: 'All ad sets', items: adsets }] : []),
                  ...(allAds.length > 0 ? [{ label: 'All ads', items: allAds }] : []),
                  ...(adsets.length > 0 && allAds.length > 0 ? [{ label: 'All ad sets & ads', items: [...adsets, ...allAds] }] : []),
                  ...(adsets.length + allAds.length > 0
                    ? [{ label: 'Everything', items: [...campaigns, ...adsets, ...allAds] }]
                    : []),
                ]}
              />
            )}
          </div>
          {campaigns.map(item => (
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
                                            onLogMistake={onLogMistake}
                                            onResolveMistake={onResolveMistake}
                                            openMistakesByTracking={openMistakesByTracking}
            />
          ))}
        </div>
      )}

      {/* Ad Sets with nested Ads */}
      {adsets.length > 0 && (
        <div className="ml-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 py-0.5">
            <div className="text-xs font-medium text-muted-foreground/70">Ad Sets</div>
            {!qcEnforceIndividual && (
              <ScopedBulkCheckMenu
                getChecklist={getChecklist}
                onBulkCheckAndAdvance={onBulkCheckAndAdvance}
                scopes={[
                  { label: 'All ad sets', items: adsets },
                  ...(allAds.length > 0 ? [{ label: 'All ads under all ad sets', items: allAds }] : []),
                  ...(allAds.length > 0 ? [{ label: 'All ad sets & ads', items: [...adsets, ...allAds] }] : []),
                ]}
              />
            )}
          </div>
          {adsets.map(adsetItem => {
            const childAds = childAdsByAdSetId.get(adsetItem.id) || [];

            return (
              <div key={adsetItem.id}>
                <EntityRow
                  item={adsetItem}
                  isExpanded={expandedEntities[adsetItem.id] ?? false}
                  onToggleExpand={() => toggleEntity(adsetItem.id)}
                  checklist={getChecklist(adsetItem.platform, adsetItem.entity_type)}
                  completions={getCompletions(adsetItem.id)}
                  completionCount={getCompletionCount(adsetItem.id, getChecklist(adsetItem.platform, adsetItem.entity_type))}
                  allChecked={isAllChecked(adsetItem.id, getChecklist(adsetItem.platform, adsetItem.entity_type))}
                  onToggleItem={(key, checked) => onToggleItem(adsetItem.id, key, checked)}
                  onToggleAll={(checked) => onToggleAll(adsetItem.id, getChecklist(adsetItem.platform, adsetItem.entity_type), checked)}
                  onUpdateState={(state) => onUpdateState(adsetItem.id, state)}
                  onBulkCheckAndAdvance={() => onBulkCheckAndAdvance(adsetItem.id, getChecklist(adsetItem.platform, adsetItem.entity_type), adsetItem.current_state)}
                  qcEnforceIndividual={qcEnforceIndividual}
                                            onLogMistake={onLogMistake}
                                            onResolveMistake={onResolveMistake}
                                            openMistakesByTracking={openMistakesByTracking}
                />
                {childAds.length > 0 && (
                  <div className="ml-6 space-y-0.5">
                    <div className="flex items-center justify-between px-2 py-0.5">
                      <div className="text-[10px] font-medium text-muted-foreground/50">Ads ({childAds.length})</div>
                      {!qcEnforceIndividual && childAds.length > 1 && (
                        <ScopedBulkCheckMenu
                          getChecklist={getChecklist}
                          onBulkCheckAndAdvance={onBulkCheckAndAdvance}
                          scopes={[
                            { label: 'All ads in this ad set', items: childAds },
                          ]}
                        />
                      )}
                    </div>
                    {childAds.map(ad => (
                      <EntityRow
                        key={ad.id}
                        item={ad}
                        isExpanded={expandedEntities[ad.id] ?? false}
                        onToggleExpand={() => toggleEntity(ad.id)}
                        checklist={getChecklist(ad.platform, ad.entity_type)}
                        completions={getCompletions(ad.id)}
                        completionCount={getCompletionCount(ad.id, getChecklist(ad.platform, ad.entity_type))}
                        allChecked={isAllChecked(ad.id, getChecklist(ad.platform, ad.entity_type))}
                        onToggleItem={(key, checked) => onToggleItem(ad.id, key, checked)}
                        onToggleAll={(checked) => onToggleAll(ad.id, getChecklist(ad.platform, ad.entity_type), checked)}
                        onUpdateState={(state) => onUpdateState(ad.id, state)}
                        onBulkCheckAndAdvance={() => onBulkCheckAndAdvance(ad.id, getChecklist(ad.platform, ad.entity_type), ad.current_state)}
                        qcEnforceIndividual={qcEnforceIndividual}
                                            onLogMistake={onLogMistake}
                                            onResolveMistake={onResolveMistake}
                                            openMistakesByTracking={openMistakesByTracking}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unmatched Ad Groups */}
      {unmatchedAdGroups.length > 0 && (
        <div className="ml-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 py-0.5">
            <div className="text-xs font-medium text-muted-foreground/70">Ads</div>
          </div>
          {unmatchedAdGroups.map((group) => (
            <div key={group.groupName} className="ml-4 space-y-0.5">
              <div className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground/50">
                {group.groupName} ({group.ads.length})
              </div>
              {group.ads.map(ad => (
                <EntityRow
                  key={ad.id}
                  item={ad}
                  isExpanded={expandedEntities[ad.id] ?? false}
                  onToggleExpand={() => toggleEntity(ad.id)}
                  checklist={getChecklist(ad.platform, ad.entity_type)}
                  completions={getCompletions(ad.id)}
                  completionCount={getCompletionCount(ad.id, getChecklist(ad.platform, ad.entity_type))}
                  allChecked={isAllChecked(ad.id, getChecklist(ad.platform, ad.entity_type))}
                  onToggleItem={(key, checked) => onToggleItem(ad.id, key, checked)}
                  onToggleAll={(checked) => onToggleAll(ad.id, getChecklist(ad.platform, ad.entity_type), checked)}
                  onUpdateState={(state) => onUpdateState(ad.id, state)}
                  onBulkCheckAndAdvance={() => onBulkCheckAndAdvance(ad.id, getChecklist(ad.platform, ad.entity_type), ad.current_state)}
                  qcEnforceIndividual={qcEnforceIndividual}
                                            onLogMistake={onLogMistake}
                                            onResolveMistake={onResolveMistake}
                                            openMistakesByTracking={openMistakesByTracking}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Orphan Ads (no matching ad set key at all) */}
      {orphanAds.length > 0 && (
        <div className="ml-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 py-0.5">
            <div className="text-xs font-medium text-muted-foreground/70">Unassigned Ads</div>
          </div>
          {orphanAds.map(ad => (
            <EntityRow
              key={ad.id}
              item={ad}
              isExpanded={expandedEntities[ad.id] ?? false}
              onToggleExpand={() => toggleEntity(ad.id)}
              checklist={getChecklist(ad.platform, ad.entity_type)}
              completions={getCompletions(ad.id)}
              completionCount={getCompletionCount(ad.id, getChecklist(ad.platform, ad.entity_type))}
              allChecked={isAllChecked(ad.id, getChecklist(ad.platform, ad.entity_type))}
              onToggleItem={(key, checked) => onToggleItem(ad.id, key, checked)}
              onToggleAll={(checked) => onToggleAll(ad.id, getChecklist(ad.platform, ad.entity_type), checked)}
              onUpdateState={(state) => onUpdateState(ad.id, state)}
              onBulkCheckAndAdvance={() => onBulkCheckAndAdvance(ad.id, getChecklist(ad.platform, ad.entity_type), ad.current_state)}
              qcEnforceIndividual={qcEnforceIndividual}
                                            onLogMistake={onLogMistake}
                                            onResolveMistake={onResolveMistake}
                                            openMistakesByTracking={openMistakesByTracking}
            />
          ))}
        </div>
      )}
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
  onLogMistake?: (item: QCTrackingItem) => void;
  onResolveMistake?: (mistakeId: string) => void;
  openMistakesByTracking?: Record<string, SetupMistake[]>;
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
  onLogMistake,
  onResolveMistake,
  openMistakesByTracking,
}: EntityRowProps) {
  const openMistakes = openMistakesByTracking?.[item.id] || [];
  const hasOpenMistakes = openMistakes.length > 0;
  const nextState = getNextState(item.current_state);
  const prevState = getPreviousState(item.current_state);
  const allowMistakeLogging = item.current_state === 'waiting_for_final_qc' || item.current_state === 'qc';
  const blockedByMistake = nextState === 'pushed_live' && hasOpenMistakes;
  const canAdvance = (item.current_state === 'waiting_for_final_qc' ? allChecked : true) && !blockedByMistake;

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
              {allowMistakeLogging && onLogMistake && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2 text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onLogMistake(item); }}
                >
                  <AlertOctagon className="h-3 w-3 mr-1" />
                  Setup Mistake
                </Button>
              )}
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
                    <TooltipContent>
                      {blockedByMistake
                        ? 'Resolve all open Setup Mistakes before moving to Pushed Live'
                        : 'Complete all checklist items first'}
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
            </div>
          </div>

          {hasOpenMistakes && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 space-y-1.5">
              <div className="text-[11px] font-semibold text-destructive flex items-center gap-1">
                <AlertOctagon className="h-3 w-3" />
                {openMistakes.length} open Setup Mistake{openMistakes.length > 1 ? 's' : ''} — blocks Pushed Live
              </div>
              {openMistakes.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{m.title}</div>
                    {m.description && (
                      <div className="text-muted-foreground line-clamp-2">{m.description}</div>
                    )}
                  </div>
                  {onResolveMistake && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] px-2 shrink-0"
                      onClick={(e) => { e.stopPropagation(); onResolveMistake(m.id); }}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Resolve
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

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

// ─── Scoped Bulk Check Menu with Confirmation ─────────────────────────────

interface BulkCheckScope {
  label: string;
  items: QCTrackingItem[];
}

interface ScopedBulkCheckMenuProps {
  getChecklist: (platform: string, entityType: string) => QCChecklistItem[];
  onBulkCheckAndAdvance: (trackingId: string, checklist: QCChecklistItem[], currentState: QCState, checkMethod?: string) => void;
  scopes: BulkCheckScope[];
}

function ScopedBulkCheckMenu({ getChecklist, onBulkCheckAndAdvance, scopes }: ScopedBulkCheckMenuProps) {
  const [confirmScope, setConfirmScope] = useState<BulkCheckScope | null>(null);

  const handleBulkCheck = (scope: BulkCheckScope) => {
    for (const item of scope.items) {
      const checklist = getChecklist(item.platform, item.entity_type);
      onBulkCheckAndAdvance(item.id, checklist, item.current_state, 'scoped_bulk');
    }
    setConfirmScope(null);
  };

  // If only one scope, render a simple button with confirmation
  if (scopes.length === 1) {
    const scope = scopes[0];
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-[10px] px-1.5"
          onClick={(e) => { e.stopPropagation(); setConfirmScope(scope); }}
        >
          <CheckCheck className="h-3 w-3 mr-0.5" />
          Check {scope.label}
        </Button>
        <AlertDialog open={!!confirmScope} onOpenChange={(open) => !open && setConfirmScope(null)}>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Bulk Check: {confirmScope?.label}?</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to mark all checklist items as checked for {confirmScope?.items.length} entities and automatically advance them to <strong>Checked</strong> state.
                This action is your responsibility — please ensure all items have been properly reviewed before confirming.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmScope && handleBulkCheck(confirmScope)}>
                Yes, Check & Advance
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Multiple scopes: render a dropdown
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={(e) => e.stopPropagation()}>
            <CheckCheck className="h-3 w-3 mr-0.5" />
            Check All
            <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {scopes.map((scope) => (
            <DropdownMenuItem
              key={scope.label}
              className="text-xs"
              onClick={() => setConfirmScope(scope)}
            >
              {scope.label} ({scope.items.length})
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!confirmScope} onOpenChange={(open) => !open && setConfirmScope(null)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Check: {confirmScope?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to mark all checklist items as checked for {confirmScope?.items.length} entities and automatically advance them to <strong>Checked</strong> state.
              This action is your responsibility — please ensure all items have been properly reviewed before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmScope && handleBulkCheck(confirmScope)}>
              Yes, Check & Advance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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

type TreeStructure = Record<string, Record<string, Record<string, QCTrackingItem[]>>>;

function buildTree(items: QCTrackingItem[]): TreeStructure {
  const tree: TreeStructure = {};
  for (const item of items) {
    const platform = item.platform;
    const market = item.market || 'Unknown';
    const phase = item.phase_name || '_none';

    if (!tree[platform]) tree[platform] = {};
    if (!tree[platform][market]) tree[platform][market] = {};
    if (!tree[platform][market][phase]) tree[platform][market][phase] = [];
    tree[platform][market][phase].push(item);
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

function normalizeHierarchyKey(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function inferAdSetLanguageBucket(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toUpperCase();

  if (!normalized) return '';

  if (/(^|[_\s-])ARA(BIC)?($|[_\s-])/.test(normalized) || /(^|[_\s-])AR($|[_\s-])/.test(normalized)) {
    return 'ara';
  }

  if (/(^|[_\s-])ENG(LISH)?($|[_\s-])/.test(normalized) || /(^|[_\s-])EN($|[_\s-])/.test(normalized)) {
    return 'eng';
  }

  if (normalized.includes('ALL') || normalized.includes('ESFRDE') || normalized.includes('MULTI')) {
    return 'all';
  }

  return '';
}
