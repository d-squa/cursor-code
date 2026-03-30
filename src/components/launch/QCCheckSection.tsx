import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import type { QCTrackingItem } from "@/hooks/useQCTracking";
import type { QCChecklistItem } from "@/config/qcChecklists";
import { QC_STATE_LABELS, QC_STAGE_ORDER, getQCColorClass, getQCIconColor, getNextState, getPreviousState } from "@/utils/qcUtils";
import type { QCState } from "@/utils/qcUtils";

interface QCCheckSectionProps {
  items: QCTrackingItem[];
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
  const [expandedEntities, setExpandedEntities] = useState<Record<string, boolean>>({});
  const [initAttempts, setInitAttempts] = useState(0);

  // Auto-initialize tracking entries when first mounted or when items are empty (max 2 attempts)
  useEffect(() => {
    if (!loading && items.length === 0 && initAttempts < 2) {
      setInitAttempts(prev => prev + 1);
      onInitialize();
    }
  }, [loading, items.length, onInitialize, initAttempts]);

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

  // Group by platform → market → phase
  const tree = buildTree(items);

  const togglePlatform = (platform: string) => {
    setExpandedPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  };

  const toggleEntity = (id: string) => {
    setExpandedEntities(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Quality Check
          {summary.delivering > 0 && (
            <Badge variant="outline" className="ml-2 bg-green-500/10 text-green-700 border-green-500/30">
              {summary.delivering} Delivering
            </Badge>
          )}
        </CardTitle>
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

        <Separator />

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
                      {Object.entries(markets).map(([market, phases]) => (
                        <div key={market} className="ml-2">
                          <div className="text-xs font-medium text-muted-foreground py-1 px-2">{market}</div>
                          {Object.entries(phases).map(([phase, entityGroups]) => (
                            <div key={phase} className="ml-4">
                              {phase !== '_none' && (
                                <div className="text-xs text-muted-foreground py-0.5 px-2 italic">{phase}</div>
                              )}
                              {Object.entries(entityGroups).map(([entityType, entityItems]) => (
                                <div key={entityType} className="ml-2 space-y-0.5">
                                  <div className="text-xs font-medium text-muted-foreground/70 px-2 py-0.5 capitalize">
                                    {entityType === 'adset' ? 'Ad Sets' : entityType === 'ad' ? 'Ads' : 'Campaigns'}
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
                                    />
                                  ))}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
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
}: EntityRowProps) {
  const nextState = getNextState(item.current_state);
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
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={(e) => { e.stopPropagation(); onToggleAll(!allChecked); }}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              {allChecked ? 'Uncheck All' : 'Check All'}
            </Button>
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
