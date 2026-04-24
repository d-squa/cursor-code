import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
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
  Layers,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TreeViewControls } from "./TreeViewControls";
import type { LaunchFilters } from "./LaunchFilters";

export type CreativeAssignmentStatus = "pending" | "pushing" | "pushed" | "error";

export interface CreativeAssignmentItem {
  id: string;
  creative_id: string;
  creativeName: string;
  originalFilename?: string;
  mediaType: string;
  creativeType?: string;
  platform: string;
  market: string;
  phaseName: string;
  adSetName?: string;
  status: CreativeAssignmentStatus;
  errorMessage?: string;
  urlParameters?: string;
  isGrouped?: boolean;
  memberCount?: number;
}

export interface AdSetStatus {
  id: string;
  platform: string;
  market: string;
  phaseName: string | null;
  entityType: string;
  entityName?: string;
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
  filters: LaunchFilters;
  onDeleteCreativeAssignment?: (assignmentId: string) => Promise<void>;
  // Triggered by the per-PMax-campaign "Push Asset Groups" button.
  // Scoped to (market, phaseName); the edge function pushes every
  // awaiting_assets / push_failed asset group under that PMax campaign shell.
  onPushPmaxAssetGroups?: (market: string, phaseName: string) => Promise<void>;
  pushingPmaxKey?: string | null; // `${market}|${phaseName}` while in flight
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
    awaiting_assets: {
      icon: <Clock className="h-3 w-3" />,
      label: "Awaiting Assets",
      className: "text-amber-500",
    },
    assets_incomplete: {
      icon: <AlertCircle className="h-3 w-3" />,
      label: "Assets Incomplete",
      className: "text-destructive",
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

// Tree item component for creatives
function CreativeTreeItem({ 
  item, 
  onDelete,
  isDeleting 
}: { 
  item: CreativeAssignmentItem;
  onDelete?: (id: string) => Promise<void>;
  isDeleting?: boolean;
}) {
  const Icon = item.mediaType === "video" ? Video : Image;
  const canDelete = !item.isGrouped && item.status !== "pushed" && item.status !== "pushing";

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-1.5 px-2 rounded text-sm group",
        item.status === "pushed"
          ? "text-emerald-600"
          : item.status === "pushing"
            ? "text-amber-600"
            : item.status === "error"
              ? "text-destructive"
              : "text-muted-foreground"
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex-1 truncate cursor-help">{item.creativeName}</span>
          </TooltipTrigger>
          {item.originalFilename && (
            <TooltipContent side="top" className="text-xs max-w-[300px]">
              <p className="font-medium">Original file:</p>
              <p className="text-muted-foreground">{item.originalFilename}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      {item.isGrouped && (item.memberCount || 0) > 1 && (
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
          {item.memberCount} assets
        </Badge>
      )}
      <ItemStatusIndicator status={item.status} error={item.errorMessage} />
      {canDelete && onDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Creative Assignment</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove "{item.creativeName}" from this campaign. The creative itself will remain in your library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(item.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// Hierarchical tree view for meshed creatives - Platform > Market > Phase > AdSet > Ads
function MeshedCreativesTree({ 
  creativeAssignments, 
  expandedState, 
  onToggle,
  onDelete,
  deletingId
}: { 
  creativeAssignments: CreativeAssignmentItem[];
  expandedState: Record<string, boolean>;
  onToggle: (key: string) => void;
  onDelete?: (id: string) => Promise<void>;
  deletingId?: string | null;
}) {
  // Group by platform -> market -> phase -> adset -> ads
  const grouped = useMemo(() => {
    const result: Record<string, Record<string, Record<string, Record<string, CreativeAssignmentItem[]>>>> = {};
    creativeAssignments.forEach(item => {
      if (!result[item.platform]) result[item.platform] = {};
      if (!result[item.platform][item.market]) result[item.platform][item.market] = {};
      const phaseKey = item.phaseName || 'default';
      if (!result[item.platform][item.market][phaseKey]) result[item.platform][item.market][phaseKey] = {};
      const adSetKey = item.adSetName || 'default';
      if (!result[item.platform][item.market][phaseKey][adSetKey]) {
        result[item.platform][item.market][phaseKey][adSetKey] = [];
      }
      result[item.platform][item.market][phaseKey][adSetKey].push(item);
    });
    return result;
  }, [creativeAssignments]);

  return (
    <div className="space-y-1">
      {Object.entries(grouped).map(([platform, markets]) => (
        <div key={platform}>
          <div
            className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer font-medium"
            onClick={() => onToggle(`creative:platform:${platform}`)}
          >
            {expandedState[`creative:platform:${platform}`] ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Layers className="h-4 w-4 text-primary" />
            <span>{platform}</span>
            <Badge variant="outline" className="ml-auto text-xs">
              {Object.values(markets).flatMap(m => Object.values(m).flatMap(p => Object.values(p))).flat().length} ads
            </Badge>
          </div>
          
          {expandedState[`creative:platform:${platform}`] && (
            <div className="ml-6 border-l pl-2">
              {Object.entries(markets).map(([market, phases]) => (
                <div key={market}>
                  <div
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
                    onClick={() => onToggle(`creative:market:${platform}:${market}`)}
                  >
                    {expandedState[`creative:market:${platform}:${market}`] ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span className="text-muted-foreground">{market}</span>
                    <Badge variant="secondary" className="ml-auto text-xs h-5">
                      {Object.values(phases).flatMap(p => Object.values(p)).flat().length}
                    </Badge>
                  </div>
                  
                  {expandedState[`creative:market:${platform}:${market}`] && (
                    <div className="ml-4">
                      {Object.entries(phases).map(([phase, adSets]) => (
                        <div key={phase}>
                          <div
                            className="flex items-center gap-2 p-1 rounded hover:bg-muted/50 cursor-pointer text-xs"
                            onClick={() => onToggle(`creative:phase:${platform}:${market}:${phase}`)}
                          >
                            {expandedState[`creative:phase:${platform}:${market}:${phase}`] ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                            <span className="text-muted-foreground">{phase}</span>
                            <Badge variant="secondary" className="ml-auto text-xs h-4 px-1">
                              {Object.values(adSets).flat().length}
                            </Badge>
                          </div>
                          
                          {expandedState[`creative:phase:${platform}:${market}:${phase}`] && (
                            <div className="ml-4">
                              {Object.entries(adSets).map(([adSet, items]) => (
                                <div key={adSet}>
                                  <div
                                    className="flex items-center gap-2 p-1 rounded hover:bg-muted/50 cursor-pointer text-xs"
                                    onClick={() => onToggle(`creative:adset:${platform}:${market}:${phase}:${adSet}`)}
                                  >
                                    {expandedState[`creative:adset:${platform}:${market}:${phase}:${adSet}`] ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                    <Rocket className="h-3 w-3 shrink-0 text-primary" />
                                    <span className="text-muted-foreground">{adSet}</span>
                                    <Badge variant="secondary" className="ml-auto text-xs h-4 px-1">
                                      {items.length}
                                    </Badge>
                                  </div>
                                  
                                  {expandedState[`creative:adset:${platform}:${market}:${phase}:${adSet}`] && (
                                    <div className="ml-4 space-y-0.5">
                                      {items.map(item => (
                                        <CreativeTreeItem 
                                          key={item.id} 
                                          item={item} 
                                          onDelete={onDelete}
                                          isDeleting={deletingId === item.id}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {creativeAssignments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No creatives assigned to this campaign.
        </p>
      )}
    </div>
  );
}

// Hierarchical tree view for campaign shell - Platform > Market > Campaign > Ad Set
function CampaignsShellTree({
  adSetStatuses,
  expandedState,
  onToggle,
  onPushPmaxAssetGroups,
  pushingPmaxKey,
}: {
  adSetStatuses: AdSetStatus[];
  expandedState: Record<string, boolean>;
  onToggle: (key: string) => void;
  onPushPmaxAssetGroups?: (market: string, phaseName: string) => Promise<void>;
  pushingPmaxKey?: string | null;
}) {
  // Group by platform -> market -> phase (campaign) -> adsets
  const grouped = useMemo(() => {
    const result: Record<string, Record<string, Record<string, AdSetStatus[]>>> = {};
    adSetStatuses.forEach(item => {
      if (!result[item.platform]) result[item.platform] = {};
      if (!result[item.platform][item.market]) result[item.platform][item.market] = {};
      const phaseKey = item.phaseName || 'default';
      if (!result[item.platform][item.market][phaseKey]) {
        result[item.platform][item.market][phaseKey] = [];
      }
      result[item.platform][item.market][phaseKey].push(item);
    });
    return result;
  }, [adSetStatuses]);

  return (
    <div className="space-y-1">
      {Object.entries(grouped).map(([platform, markets]) => (
        <div key={platform}>
          <div
            className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer font-medium"
            onClick={() => onToggle(`shell:platform:${platform}`)}
          >
            {expandedState[`shell:platform:${platform}`] ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Layers className="h-4 w-4 text-primary" />
            <span>{platform}</span>
            <Badge variant="outline" className="ml-auto text-xs">
              {Object.values(markets).flatMap(m => Object.values(m)).flat().length} ad sets
            </Badge>
          </div>
          
          {expandedState[`shell:platform:${platform}`] && (
            <div className="ml-6 border-l pl-2">
              {Object.entries(markets).map(([market, phases]) => (
                <div key={market}>
                  <div
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
                    onClick={() => onToggle(`shell:market:${platform}:${market}`)}
                  >
                    {expandedState[`shell:market:${platform}:${market}`] ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span className="text-muted-foreground">{market}</span>
                    <Badge variant="secondary" className="ml-auto text-xs h-5">
                      {Object.values(phases).flat().length}
                    </Badge>
                  </div>
                  
                  {expandedState[`shell:market:${platform}:${market}`] && (
                    <div className="ml-4">
                      {Object.entries(phases).map(([phase, adSets]) => {
                        // Get campaign entities for this phase
                        const campaignEntity = adSets.find(s => s.entityType === 'campaign');
                        const adSetEntities = adSets.filter(s => s.entityType === 'adset');
                        
                        return (
                          <div key={phase}>
                            <div
                              className="flex items-center gap-2 p-1 rounded hover:bg-muted/50 cursor-pointer text-xs"
                              onClick={() => onToggle(`shell:phase:${platform}:${market}:${phase}`)}
                            >
                              {expandedState[`shell:phase:${platform}:${market}:${phase}`] ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                              <Rocket className="h-3 w-3 shrink-0 text-primary" />
                              <span className="text-muted-foreground truncate">
                                {campaignEntity?.entityName || phase}
                              </span>
                              {campaignEntity && (
                                <ItemStatusIndicator status={campaignEntity.status} error={campaignEntity.errorMessage} />
                              )}
                              <Badge variant="secondary" className="ml-auto text-xs h-4 px-1">
                                {adSetEntities.length}
                              </Badge>
                            </div>
                            
                            {expandedState[`shell:phase:${platform}:${market}:${phase}`] && (
                              <div className="ml-4 space-y-0.5">
                                {adSetEntities.map(adSet => (
                                  <div
                                    key={adSet.id}
                                    className={cn(
                                      "flex items-center gap-3 py-1.5 px-2 rounded text-sm",
                                      adSet.status === "pushed_to_dsp" || adSet.status === "live"
                                        ? "text-emerald-600"
                                        : adSet.status === "pushing"
                                          ? "text-amber-600"
                                          : ["push_failed", "validation_error"].includes(adSet.status)
                                            ? "text-destructive"
                                            : "text-muted-foreground"
                                    )}
                                  >
                                    <Layers className="h-3 w-3 shrink-0" />
                                    <span className="flex-1 truncate">{adSet.entityName || `Ad Set ${adSet.id.slice(0, 8)}`}</span>
                                    <ItemStatusIndicator status={adSet.status} error={adSet.errorMessage} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {adSetStatuses.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No campaign structure found. Run validation first.
        </p>
      )}
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
  filters,
  onDeleteCreativeAssignment,
}: LaunchProgressTrackerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["shell", "creatives"]));
  const [creativesExpanded, setCreativesExpanded] = useState<Record<string, boolean>>({});
  const [shellExpanded, setShellExpanded] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteCreative = useCallback(async (id: string) => {
    if (!onDeleteCreativeAssignment) return;
    setDeletingId(id);
    try {
      await onDeleteCreativeAssignment(id);
    } finally {
      setDeletingId(null);
    }
  }, [onDeleteCreativeAssignment]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Apply filters to ad set statuses
  const filteredAdSetStatuses = useMemo(() => {
    return adSetStatuses.filter(item => {
      if (filters.platform && item.platform !== filters.platform) return false;
      if (filters.market && item.market !== filters.market) return false;
      if (filters.phase && item.phaseName !== filters.phase) return false;
      return true;
    });
  }, [adSetStatuses, filters]);

  // Apply filters to creative assignments
  const filteredCreativeAssignments = useMemo(() => {
    return creativeAssignments.filter(item => {
      if (filters.platform && item.platform !== filters.platform) return false;
      if (filters.market && item.market !== filters.market) return false;
      if (filters.phase && item.phaseName !== filters.phase) return false;
      if (filters.parameterSearch && filters.parameterSearch.trim()) {
        const searchTerm = filters.parameterSearch.toLowerCase().trim();
        const urlParams = (item.urlParameters || '').toLowerCase();
        if (!urlParams.includes(searchTerm)) return false;
      }
      return true;
    });
  }, [creativeAssignments, filters]);

  const toggleCreativeNode = useCallback((key: string) => {
    setCreativesExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleShellNode = useCallback((key: string) => {
    setShellExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Expand/collapse all for creatives
  const expandAllCreatives = useCallback(() => {
    const newState: Record<string, boolean> = {};
    const platforms = [...new Set(filteredCreativeAssignments.map(s => s.platform))];
    platforms.forEach(platform => {
      newState[`creative:platform:${platform}`] = true;
      const markets = [...new Set(filteredCreativeAssignments.filter(s => s.platform === platform).map(s => s.market))];
      markets.forEach(market => {
        newState[`creative:market:${platform}:${market}`] = true;
        const phases = [...new Set(filteredCreativeAssignments.filter(s => s.platform === platform && s.market === market).map(s => s.phaseName || 'default'))];
        phases.forEach(phase => {
          newState[`creative:phase:${platform}:${market}:${phase}`] = true;
          const adSets = [...new Set(filteredCreativeAssignments.filter(s => s.platform === platform && s.market === market && (s.phaseName || 'default') === phase).map(s => s.adSetName || 'default'))];
          adSets.forEach(adSet => {
            newState[`creative:adset:${platform}:${market}:${phase}:${adSet}`] = true;
          });
        });
      });
    });
    setCreativesExpanded(newState);
  }, [filteredCreativeAssignments]);

  const collapseAllCreatives = useCallback(() => {
    setCreativesExpanded({});
  }, []);

  const expandCreativesLevel = useCallback((level: 'platforms' | 'markets' | 'campaigns') => {
    const newState: Record<string, boolean> = { ...creativesExpanded };
    const platforms = [...new Set(filteredCreativeAssignments.map(s => s.platform))];
    
    if (level === 'platforms') {
      platforms.forEach(platform => {
        newState[`creative:platform:${platform}`] = true;
      });
    } else if (level === 'markets') {
      platforms.forEach(platform => {
        const markets = [...new Set(filteredCreativeAssignments.filter(s => s.platform === platform).map(s => s.market))];
        markets.forEach(market => {
          newState[`creative:market:${platform}:${market}`] = true;
        });
      });
    } else if (level === 'campaigns') {
      platforms.forEach(platform => {
        const markets = [...new Set(filteredCreativeAssignments.filter(s => s.platform === platform).map(s => s.market))];
        markets.forEach(market => {
          const phases = [...new Set(filteredCreativeAssignments.filter(s => s.platform === platform && s.market === market).map(s => s.phaseName || 'default'))];
          phases.forEach(phase => {
            newState[`creative:phase:${platform}:${market}:${phase}`] = true;
          });
        });
      });
    }
    setCreativesExpanded(newState);
  }, [filteredCreativeAssignments, creativesExpanded]);

  const collapseCreativesLevel = useCallback((level: 'platforms' | 'markets' | 'campaigns') => {
    const newState: Record<string, boolean> = { ...creativesExpanded };
    const platforms = [...new Set(filteredCreativeAssignments.map(s => s.platform))];
    
    if (level === 'platforms') {
      platforms.forEach(platform => {
        delete newState[`creative:platform:${platform}`];
      });
    } else if (level === 'markets') {
      platforms.forEach(platform => {
        const markets = [...new Set(filteredCreativeAssignments.filter(s => s.platform === platform).map(s => s.market))];
        markets.forEach(market => {
          delete newState[`creative:market:${platform}:${market}`];
        });
      });
    } else if (level === 'campaigns') {
      platforms.forEach(platform => {
        const markets = [...new Set(filteredCreativeAssignments.filter(s => s.platform === platform).map(s => s.market))];
        markets.forEach(market => {
          const phases = [...new Set(filteredCreativeAssignments.filter(s => s.platform === platform && s.market === market).map(s => s.phaseName || 'default'))];
          phases.forEach(phase => {
            delete newState[`creative:phase:${platform}:${market}:${phase}`];
          });
        });
      });
    }
    setCreativesExpanded(newState);
  }, [filteredCreativeAssignments, creativesExpanded]);

  // Expand/collapse all for shell
  const expandAllShell = useCallback(() => {
    const newState: Record<string, boolean> = {};
    const platforms = [...new Set(filteredAdSetStatuses.map(s => s.platform))];
    platforms.forEach(platform => {
      newState[`shell:platform:${platform}`] = true;
      const markets = [...new Set(filteredAdSetStatuses.filter(s => s.platform === platform).map(s => s.market))];
      markets.forEach(market => {
        newState[`shell:market:${platform}:${market}`] = true;
        const phases = [...new Set(filteredAdSetStatuses.filter(s => s.platform === platform && s.market === market).map(s => s.phaseName || 'default'))];
        phases.forEach(phase => {
          newState[`shell:phase:${platform}:${market}:${phase}`] = true;
        });
      });
    });
    setShellExpanded(newState);
  }, [filteredAdSetStatuses]);

  const collapseAllShell = useCallback(() => {
    setShellExpanded({});
  }, []);

  const expandShellLevel = useCallback((level: 'platforms' | 'markets' | 'campaigns') => {
    const newState: Record<string, boolean> = { ...shellExpanded };
    const platforms = [...new Set(filteredAdSetStatuses.map(s => s.platform))];
    
    if (level === 'platforms') {
      platforms.forEach(platform => {
        newState[`shell:platform:${platform}`] = true;
      });
    } else if (level === 'markets') {
      platforms.forEach(platform => {
        const markets = [...new Set(filteredAdSetStatuses.filter(s => s.platform === platform).map(s => s.market))];
        markets.forEach(market => {
          newState[`shell:market:${platform}:${market}`] = true;
        });
      });
    } else if (level === 'campaigns') {
      platforms.forEach(platform => {
        const markets = [...new Set(filteredAdSetStatuses.filter(s => s.platform === platform).map(s => s.market))];
        markets.forEach(market => {
          const phases = [...new Set(filteredAdSetStatuses.filter(s => s.platform === platform && s.market === market).map(s => s.phaseName || 'default'))];
          phases.forEach(phase => {
            newState[`shell:phase:${platform}:${market}:${phase}`] = true;
          });
        });
      });
    }
    setShellExpanded(newState);
  }, [filteredAdSetStatuses, shellExpanded]);

  const collapseShellLevel = useCallback((level: 'platforms' | 'markets' | 'campaigns') => {
    const newState: Record<string, boolean> = { ...shellExpanded };
    const platforms = [...new Set(filteredAdSetStatuses.map(s => s.platform))];
    
    if (level === 'platforms') {
      platforms.forEach(platform => {
        delete newState[`shell:platform:${platform}`];
      });
    } else if (level === 'markets') {
      platforms.forEach(platform => {
        const markets = [...new Set(filteredAdSetStatuses.filter(s => s.platform === platform).map(s => s.market))];
        markets.forEach(market => {
          delete newState[`shell:market:${platform}:${market}`];
        });
      });
    } else if (level === 'campaigns') {
      platforms.forEach(platform => {
        const markets = [...new Set(filteredAdSetStatuses.filter(s => s.platform === platform).map(s => s.market))];
        markets.forEach(market => {
          const phases = [...new Set(filteredAdSetStatuses.filter(s => s.platform === platform && s.market === market).map(s => s.phaseName || 'default'))];
          phases.forEach(phase => {
            delete newState[`shell:phase:${platform}:${market}:${phase}`];
          });
        });
      });
    }
    setShellExpanded(newState);
  }, [filteredAdSetStatuses, shellExpanded]);

  // Calculate ad set progress
  const adSetProgress = useMemo(() => {
    const total = filteredAdSetStatuses.length;
    const pushed = filteredAdSetStatuses.filter((s) =>
      ["pushed_to_dsp", "live"].includes(s.status)
    ).length;
    const pushing = filteredAdSetStatuses.filter((s) => s.status === "pushing").length;
    const errors = filteredAdSetStatuses.filter((s) =>
      ["push_failed", "validation_error"].includes(s.status)
    ).length;
    return { total, pushed, pushing, errors, percent: total > 0 ? (pushed / total) * 100 : 0 };
  }, [filteredAdSetStatuses]);

  // Calculate creative progress
  const creativeProgress = useMemo(() => {
    const total = filteredCreativeAssignments.length;
    const pushed = filteredCreativeAssignments.filter((c) => c.status === "pushed").length;
    const pushing = filteredCreativeAssignments.filter((c) => c.status === "pushing").length;
    const errors = filteredCreativeAssignments.filter((c) => c.status === "error").length;
    return { total, pushed, pushing, errors, percent: total > 0 ? (pushed / total) * 100 : 0 };
  }, [filteredCreativeAssignments]);

  // Check if all ad sets are pushed (requirement for creative push)
  const allAdSetsPushed = adSetProgress.pushed === adSetProgress.total && adSetProgress.total > 0;

  return (
    <div className="space-y-4">
      {/* Campaign Shell Card - Step 1 */}
      <Collapsible
        open={expandedSections.has("shell")}
        onOpenChange={() => toggleSection("shell")}
      >
        <Card className={cn(
          "transition-all",
          currentStep === 1 && "ring-2 ring-primary",
          adSetProgress.pushed === adSetProgress.total && adSetProgress.total > 0 && "ring-1 ring-emerald-500/30"
        )}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                  adSetProgress.pushed === adSetProgress.total && adSetProgress.total > 0
                    ? "bg-emerald-500 text-white"
                    : currentStep === 1
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                )}>
                  {adSetProgress.pushed === adSetProgress.total && adSetProgress.total > 0 ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    "1"
                  )}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    Campaigns Shell
                    {isPushingCampaign && (
                      <Badge variant="secondary" className="text-amber-600">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Pushing...
                      </Badge>
                    )}
                    {adSetProgress.pushed === adSetProgress.total && adSetProgress.total > 0 && (
                      <Badge className="bg-emerald-500">
                        <Check className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {adSetProgress.pushed}/{adSetProgress.total} entities pushed
                    {adSetProgress.pushing > 0 && ` · ${adSetProgress.pushing} in progress`}
                    {adSetProgress.errors > 0 && ` · ${adSetProgress.errors} errors`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {expandedSections.has("shell") ? (
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
              <div className="flex items-center justify-end mb-3">
                <TreeViewControls
                  onExpandAll={expandAllShell}
                  onCollapseAll={collapseAllShell}
                  onExpandLevel={expandShellLevel}
                  onCollapseLevel={collapseShellLevel}
                />
              </div>
              <div className="max-h-[600px] overflow-auto">
                <CampaignsShellTree
                  adSetStatuses={filteredAdSetStatuses}
                  expandedState={shellExpanded}
                  onToggle={toggleShellNode}
                />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Meshed Creatives Card - Step 2 */}
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
                    Meshed Creatives
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
                <>
                  <div className="flex items-center justify-end mb-3">
                    <TreeViewControls
                      onExpandAll={expandAllCreatives}
                      onCollapseAll={collapseAllCreatives}
                      onExpandLevel={expandCreativesLevel}
                      onCollapseLevel={collapseCreativesLevel}
                    />
                  </div>
                  <div className="max-h-[600px] overflow-auto">
                    <MeshedCreativesTree
                      creativeAssignments={filteredCreativeAssignments}
                      expandedState={creativesExpanded}
                      onToggle={toggleCreativeNode}
                      onDelete={onDeleteCreativeAssignment ? handleDeleteCreative : undefined}
                      deletingId={deletingId}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
