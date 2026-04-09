// Structure-centric view: shows each ad set with its assigned creatives
import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ChevronDown, 
  ChevronUp, 
  Image, 
  Video, 
  Check, 
  X, 
  Info,
  Layers,
  Target,
  AlertCircle,
  Lightbulb,
  Sparkles,
  FolderOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchConfidenceIndicator } from './MatchConfidenceIndicator';
import type { StructureMatchResult, UnassignedAsset, DigestedAsset, UICreativeMatch, CampaignStructure, SaveProgressItem, SaveStatus } from '@/hooks/useCreativeMatching';
import { findCompatibleFormats } from '@/utils/platformAdSpecs';

// Suggestion for empty ad sets
interface EmptyAdSetSuggestion {
  structure: CampaignStructure;
  suggestedAssets: Array<{
    asset: DigestedAsset;
    blockingReason: string;
    isPlatformOnly: boolean;
  }>;
}

// Default Meta API limit: 50 non-archived ads per ad set
const ADS_PER_AD_SET_LIMIT = 50;

interface StructureCentricViewProps {
  structureResults: StructureMatchResult[];
  unassignedAssets: UnassignedAsset[];
  acceptedMatches: Map<string, UICreativeMatch>;
  saveProgress?: Map<string, SaveProgressItem>;
  onAcceptAsset: (assetId: string, structure: StructureMatchResult['structure']) => void;
  onRejectAsset: (assetId: string, structureId: string) => void;
}

function AssetThumbnail({ asset }: { asset: DigestedAsset }) {
  const Icon = asset.mediaType === 'video' ? Video : Image;
  return (
    <div className="w-12 h-12 bg-muted rounded flex items-center justify-center shrink-0">
      <Icon className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

function MatchCriteriaList({ criteria }: { criteria: string[] }) {
  if (criteria.length === 0) return null;
  
  // Icons for common criteria types
  const getCriteriaIcon = (criterion: string) => {
    const lower = criterion.toLowerCase();
    if (lower.includes('dimension')) return '📐';
    if (lower.includes('platform')) return '📱';
    if (lower.includes('language')) return '🌐';
    if (lower.includes('market')) return '📍';
    if (lower.includes('media')) return '🎬';
    if (lower.includes('campaign')) return '🎯';
    return '✓';
  };
  
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {criteria.slice(0, 3).map((c, i) => (
        <Badge key={i} variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-500/50 text-emerald-600">
          <span className="mr-0.5">{getCriteriaIcon(c)}</span>
          {c}
        </Badge>
      ))}
      {criteria.length > 3 && (
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          +{criteria.length - 3}
        </Badge>
      )}
    </div>
  );
}

// Save status indicator component
function SaveStatusIndicator({ status, error }: { status: SaveStatus; error?: string }) {
  const config: Record<SaveStatus, { icon: React.ReactNode; label: string; className: string }> = {
    pending: { 
      icon: <div className="h-3 w-3 rounded-full border-2 border-muted-foreground/60 border-dashed animate-pulse" />, 
      label: 'Queued', 
      className: 'text-muted-foreground' 
    },
    uploading: { 
      icon: <div className="h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />, 
      label: 'Uploading', 
      className: 'text-blue-500' 
    },
    saving: { 
      icon: <div className="h-3 w-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />, 
      label: 'Saving', 
      className: 'text-amber-500' 
    },
    done: { 
      icon: <Check className="h-3 w-3" />, 
      label: 'Saved', 
      className: 'text-emerald-500' 
    },
    error: { 
      icon: <AlertCircle className="h-3 w-3" />, 
      label: 'Error', 
      className: 'text-destructive' 
    },
  };

  const { icon, label, className } = config[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1 shrink-0", className)}>
            {icon}
            <span className="text-[10px] font-medium">{label}</span>
          </div>
        </TooltipTrigger>
        {status === 'error' && error && (
          <TooltipContent side="left" className="text-xs max-w-[200px]">
            {error}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

function StructureCard({ 
  result, 
  acceptedMatches,
  saveProgress,
  onAcceptAsset, 
  onRejectAsset,
  onAcceptAll
}: { 
  result: StructureMatchResult;
  acceptedMatches: Map<string, UICreativeMatch>;
  saveProgress?: Map<string, SaveProgressItem>;
  onAcceptAsset: (assetId: string) => void;
  onRejectAsset: (assetId: string) => void;
  onAcceptAll: () => void;
}) {
  // Default to collapsed
  const [isExpanded, setIsExpanded] = useState(false);
  const { structure, assignedAssets } = result;
  
  // Check accepted status using composite key: assetId:structureId
  const isAssetAccepted = (assetId: string) => acceptedMatches.has(`${assetId}:${structure.id}`);
  const acceptedCount = assignedAssets.filter(a => isAssetAccepted(a.asset.id)).length;
  const hasAssets = assignedAssets.length > 0;
  const allAccepted = hasAssets && acceptedCount === assignedAssets.length;
  const hasUnaccepted = hasAssets && acceptedCount < assignedAssets.length;

  return (
    <Card className={cn(
      "transition-all",
      !hasAssets && "opacity-60",
      acceptedCount > 0 && "ring-1 ring-emerald-500/30"
    )}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground mb-0.5">
                  {structure.campaignName}
                </div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium truncate">
                    {structure.adSetName}
                  </CardTitle>
                  {acceptedCount > 0 && (
                    <Badge className="bg-emerald-500 text-[10px] py-0">
                      {acceptedCount} accepted
                    </Badge>
                  )}
                </div>
                {/* Show taxonomy elements compact inline - only if we have meaningful elements */}
                {structure.taxonomyElements && Object.entries(structure.taxonomyElements).length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                    {Object.entries(structure.taxonomyElements)
                      .filter(([key, value]) => {
                        if (!value || value === '') return false;
                        // Always show split-related params (even if ALL)
                        const splitParams = ['Gender', 'Devices', 'Age Range', 'Languages', 'Location'];
                        if (splitParams.includes(key)) return true;
                        return value !== 'ALL';
                      })
                      .slice(0, 12)
                      .map(([param, value], idx) => (
                        <span key={param}>
                          {idx > 0 && <span className="mx-1">•</span>}
                          <span className="text-muted-foreground/70">{param}:</span>
                          <span className="font-medium text-foreground/80 ml-0.5">{value}</span>
                        </span>
                      ))
                    }
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasUnaccepted && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                    onClick={(e) => { e.stopPropagation(); onAcceptAll(); }}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Accept All
                  </Button>
                )}
                <Badge variant={hasAssets ? "secondary" : "outline"} className="shrink-0">
                  <Layers className="h-3 w-3 mr-1" />
                  {assignedAssets.length}
                </Badge>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {!hasAssets ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No creatives matched this ad set
              </div>
            ) : (
              <div className="space-y-2">
                {assignedAssets.map((assignedAsset) => {
                  const { asset, confidenceScore, reasoning, matchedCriteria, issues } = assignedAsset;
                  // Use composite key to check if this specific asset-structure pair is accepted
                  const isAccepted = isAssetAccepted(asset.id);
                  const compositeKey = `${asset.id}:${structure.id}`;
                  const progressItem = saveProgress?.get(compositeKey);
                  
                  return (
                    <div 
                      key={asset.id}
                      className={cn(
                        "p-2 rounded-lg border flex items-center gap-3",
                        isAccepted ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/30",
                        progressItem?.status === 'done' && "bg-emerald-500/15 border-emerald-500/50",
                        progressItem?.status === 'error' && "bg-destructive/10 border-destructive/30"
                      )}
                    >
                      <AssetThumbnail asset={asset} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{asset.fileName}</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
                                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="p-3 max-w-xs">
                                <div className="space-y-2">
                                  <p className="font-semibold text-xs border-b pb-1">Why matched:</p>
                                  <ul className="space-y-1 text-xs">
                                    {reasoning.map((r, i) => (
                                      <li key={i} className="flex items-start gap-1">
                                        <Check className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                                        <span>{r}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  {issues.length > 0 && (
                                    <>
                                      <p className="font-semibold text-xs border-t pt-2 text-amber-600">Warnings:</p>
                                      <ul className="space-y-1 text-xs">
                                        {issues.map((issue, i) => (
                                          <li key={i} className="text-amber-600">{issue.message}</li>
                                        ))}
                                      </ul>
                                    </>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <MatchCriteriaList criteria={matchedCriteria} />
                      </div>
                      <MatchConfidenceIndicator score={confidenceScore} size="sm" />
                      
                      {/* Show save progress if any progress exists */}
                      {progressItem ? (
                        <SaveStatusIndicator status={progressItem.status} error={progressItem.error} />
                      ) : isAccepted ? (
                        <Badge className="bg-emerald-500 shrink-0">
                          <Check className="h-3 w-3 mr-1" />
                          Accepted
                        </Badge>
                      ) : (
                        <div className="flex gap-1 shrink-0">
                          <Button 
                            size="sm" 
                            onClick={() => onAcceptAsset(asset.id)}
                            className="bg-emerald-500 hover:bg-emerald-600"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => onRejectAsset(asset.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function UnassignedAssetsPanel({ 
  unassignedAssets,
  structureResults,
  onManualAssign
}: { 
  unassignedAssets: UnassignedAsset[];
  structureResults: StructureMatchResult[];
  onManualAssign: (assetId: string, structure: CampaignStructure) => void;
}) {
  // Default to collapsed
  const [isExpanded, setIsExpanded] = useState(false);
  const [assigningAssetId, setAssigningAssetId] = useState<string | null>(null);
  
  // Get all available structures for manual assignment
  const availableStructures = useMemo(() => {
    return structureResults.map(r => r.structure);
  }, [structureResults]);

  // Group structures by platform > market > phase for easier selection
  const groupedStructures = useMemo(() => {
    const groups: Record<string, Record<string, Record<string, CampaignStructure[]>>> = {};
    
    for (const structure of availableStructures) {
      const platform = structure.platform || 'unknown';
      const market = structure.market || 'Global';
      const phase = structure.phases?.[0] || structure.campaignName || 'Default';
      
      if (!groups[platform]) groups[platform] = {};
      if (!groups[platform][market]) groups[platform][market] = {};
      if (!groups[platform][market][phase]) groups[platform][market][phase] = [];
      
      groups[platform][market][phase].push(structure);
    }
    
    return groups;
  }, [availableStructures]);

  const handleAssign = (assetId: string, structure: CampaignStructure) => {
    onManualAssign(assetId, structure);
    setAssigningAssetId(null);
  };
  
  if (unassignedAssets.length === 0) return null;
  
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-amber-500/10 transition-colors pb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-sm font-medium text-amber-700">
                  Unassigned Creatives
                </CardTitle>
                <p className="text-xs text-amber-600/80">
                  Could not match to any ad set - use manual assign to override
                </p>
              </div>
              <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                {unassignedAssets.length}
              </Badge>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {unassignedAssets.map((unassigned) => {
              const { asset, extractedSignals, reasons, closestMatches } = unassigned;
              const isAssigning = assigningAssetId === asset.id;
              
              return (
                <div key={asset.id} className="p-3 rounded-lg border border-amber-500/20 bg-background">
                  <div className="flex items-start gap-3">
                    <AssetThumbnail asset={asset} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium truncate">{asset.fileName}</p>
                        <Button
                          size="sm"
                          variant={isAssigning ? "secondary" : "outline"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssigningAssetId(isAssigning ? null : asset.id);
                          }}
                          className="shrink-0 text-xs h-7"
                        >
                          {isAssigning ? 'Cancel' : 'Assign'}
                        </Button>
                      </div>
                      
                      {/* Manual assignment selector */}
                      {isAssigning && (
                        <div className="mt-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
                          <p className="text-xs font-medium text-primary mb-2">
                            Select an ad set to assign this creative:
                          </p>
                          <ScrollArea className="max-h-[200px]">
                            <div className="space-y-2">
                              {Object.entries(groupedStructures).map(([platform, markets]) => (
                                <div key={platform} className="space-y-1">
                                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                                    {platform}
                                  </p>
                                  {Object.entries(markets).map(([market, phases]) => (
                                    <div key={market} className="pl-2 space-y-1">
                                      {Object.entries(phases).map(([phase, structures]) => (
                                        <div key={phase} className="space-y-0.5">
                                          <p className="text-[10px] text-muted-foreground">
                                            {market} › {phase}
                                          </p>
                                          <div className="pl-2 flex flex-wrap gap-1">
                                            {structures.map((structure) => (
                                              <Button
                                                key={structure.id}
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleAssign(asset.id, structure)}
                                                className="text-[10px] h-6 px-2"
                                              >
                                                {structure.adSetName}
                                              </Button>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      )}
                      
                      {/* Extracted signals */}
                      {!isAssigning && Object.keys(extractedSignals).length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                            Extracted from filename:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(extractedSignals).map(([key, value]) => (
                              <Badge 
                                key={key} 
                                variant="outline" 
                                className="text-[10px] py-0 px-1.5"
                              >
                                {key}: {value}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Reasons for not matching */}
                      {!isAssigning && (
                        <div className="mt-2">
                          <p className="text-[10px] text-destructive uppercase tracking-wide mb-1">
                            Why not assigned:
                          </p>
                          <ul className="space-y-0.5">
                            {reasons.map((reason, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                <X className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* Closest matches */}
                      {!isAssigning && closestMatches && closestMatches.length > 0 && (
                        <div className="mt-2 pt-2 border-t">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                            Closest matches:
                          </p>
                          <div className="space-y-1">
                            {closestMatches.slice(0, 2).map((match, i) => (
                              <div key={i} className="text-xs flex items-center gap-2">
                                <span className="font-medium truncate">{match.structure.adSetName}</span>
                                <Badge variant="outline" className="text-[10px] py-0">
                                  {match.score}%
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleAssign(asset.id, match.structure)}
                                  className="text-[10px] h-5 px-1.5 text-primary hover:text-primary"
                                >
                                  <Check className="h-3 w-3 mr-0.5" />
                                  Assign
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Panel for empty ad sets that need creatives
function EmptyAdSetsPanel({ 
  emptyStructures,
  suggestionsByStructureId,
  acceptedMatches,
  onAcceptSuggestion,
  onBroadenMatch
}: { 
  emptyStructures: StructureMatchResult[];
  suggestionsByStructureId: Map<string, EmptyAdSetSuggestion>;
  acceptedMatches: Map<string, UICreativeMatch>;
  onAcceptSuggestion: (assetId: string, structure: CampaignStructure) => void;
  onBroadenMatch?: (structureId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (emptyStructures.length === 0) return null;
  
  return (
    <Card className="border-orange-500/30 bg-orange-500/5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-orange-500/10 transition-colors pb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                <FolderOpen className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-sm font-medium text-orange-700">
                  Ad Sets Needing Creatives
                </CardTitle>
                <p className="text-xs text-orange-600/80">
                  Upload more creatives for these slots
                </p>
              </div>
              <Badge variant="outline" className="border-orange-500/50 text-orange-600">
                {emptyStructures.length}
              </Badge>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-2">
            {emptyStructures.map((result) => {
              const { structure } = result;
              const suggestion = suggestionsByStructureId.get(structure.id);
              const suggestedAssets = suggestion?.suggestedAssets ?? [];
              
              return (
                <div key={structure.id} className="p-3 rounded-lg border border-orange-500/20 bg-background">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{structure.adSetName}</span>
                        <Badge variant="outline" className="text-[10px] py-0">
                          {structure.platform}
                        </Badge>
                        {structure.market && (
                          <Badge variant="secondary" className="text-[10px] py-0">
                            {structure.market}
                          </Badge>
                        )}
                      </div>
                      {/* Show taxonomy elements */}
                      {structure.taxonomyElements && Object.entries(structure.taxonomyElements).length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                          {Object.entries(structure.taxonomyElements)
                            .filter(([key, value]) => {
                              if (!value || value === '') return false;
                              const splitParams = ['Gender', 'Devices', 'Age Range', 'Languages', 'Location'];
                              if (splitParams.includes(key)) return true;
                              return value !== 'ALL';
                            })
                            .slice(0, 8)
                            .map(([param, value], idx) => (
                              <span key={param}>
                                {idx > 0 && <span className="mx-1">•</span>}
                                <span className="text-muted-foreground/70">{param}:</span>
                                <span className="font-medium text-foreground/80 ml-0.5">{value}</span>
                              </span>
                            ))
                          }
                        </div>
                      )}
                      {/* Show what's needed */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {structure.formatConstraints && structure.formatConstraints.length > 0 && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-dashed">
                            Formats: {structure.formatConstraints.join(', ')}
                          </Badge>
                        )}
                        {structure.placementConstraints && structure.placementConstraints.length > 0 && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-dashed">
                            Placements: {structure.placementConstraints.slice(0, 2).join(', ')}{structure.placementConstraints.length > 2 ? '...' : ''}
                          </Badge>
                        )}
                        {structure.language && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-dashed">
                            Lang: {structure.language}
                          </Badge>
                        )}
                      </div>

                      {/* Suggested creatives displayed under the ad set name */}
                      {suggestedAssets.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {suggestedAssets.map((sa) => {
                            const isAccepted = acceptedMatches.has(`${sa.asset.id}:${structure.id}`);

                            return (
                              <div
                                key={sa.asset.id}
                                className={cn(
                                  "p-2 rounded-lg border flex items-center gap-3",
                                  isAccepted ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/30"
                                )}
                              >
                                <AssetThumbnail asset={sa.asset} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{sa.asset.fileName}</p>
                                  <p className="text-[10px] text-amber-600 mt-0.5">{sa.blockingReason}</p>
                                </div>
                                {isAccepted ? (
                                  <Badge className="bg-emerald-500 shrink-0">
                                    <Check className="h-3 w-3 mr-1" />
                                    Accepted
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => onAcceptSuggestion(sa.asset.id, structure)}
                                    className="bg-emerald-500 hover:bg-emerald-600"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Hierarchical types for Platform > Market > Campaign (Phase) > AdSet grouping
interface PlatformGroup {
  platform: string;
  markets: MarketGroup[];
}

interface MarketGroup {
  market: string;
  campaigns: CampaignGroup[];
}

interface CampaignGroup {
  // Campaign in this context is the Phase from the phase scheduler
  campaignName: string; // This is the phase name
  adSets: StructureMatchResult[];
}

// Helper to group structure results hierarchically: Platform > Market > Campaign (Phase) > AdSet
function groupResultsHierarchically(results: StructureMatchResult[]): PlatformGroup[] {
  // Platform -> Market -> Campaign (Phase) -> AdSets
  const platformMap = new Map<string, Map<string, Map<string, StructureMatchResult[]>>>();
  
  for (const result of results) {
    const platform = result.structure.platform || 'unknown';
    const market = result.structure.market || 'unknown';
    // The "campaign" is the phase from the phase scheduler
    const campaignName = result.structure.phases?.[0] || result.structure.campaignName || 'Default Campaign';
    
    if (!platformMap.has(platform)) {
      platformMap.set(platform, new Map());
    }
    const marketMap = platformMap.get(platform)!;
    
    if (!marketMap.has(market)) {
      marketMap.set(market, new Map());
    }
    const campaignMap = marketMap.get(market)!;
    
    if (!campaignMap.has(campaignName)) {
      campaignMap.set(campaignName, []);
    }
    campaignMap.get(campaignName)!.push(result);
  }
  
  const groups: PlatformGroup[] = [];
  for (const [platform, marketMap] of platformMap) {
    const markets: MarketGroup[] = [];
    for (const [market, campaignMap] of marketMap) {
      const campaigns: CampaignGroup[] = [];
      for (const [campaignName, adSets] of campaignMap) {
        campaigns.push({ campaignName, adSets });
      }
      markets.push({ market, campaigns });
    }
    groups.push({ platform, markets });
  }
  
  return groups;
}

// Panel for assigned ad sets with matched creatives - hierarchical view
function AssignedAssetsPanel({ 
  structureResults, 
  acceptedMatches,
  saveProgress,
  onAcceptAsset,
  onRejectAsset,
  onAcceptAll,
  forceExpand,
}: { 
  structureResults: StructureMatchResult[];
  acceptedMatches: Map<string, UICreativeMatch>;
  saveProgress?: Map<string, SaveProgressItem>;
  onAcceptAsset: (assetId: string, structure: StructureMatchResult['structure']) => void;
  onRejectAsset: (assetId: string, structureId: string) => void;
  onAcceptAll: () => void;
  forceExpand?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(forceExpand ?? false);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());

  const resultsWithAssets = useMemo(
    () => structureResults.filter((r) => r.assignedAssets.length > 0),
    [structureResults]
  );

  const hierarchicalGroups = useMemo(
    () => groupResultsHierarchically(resultsWithAssets),
    [resultsWithAssets]
  );

  // React to forceExpand changes - expand/collapse all levels
  useEffect(() => {
    if (forceExpand === undefined) return;
    setIsExpanded(forceExpand);
    if (forceExpand) {
      // Expand all levels
      setExpandedPlatforms(new Set(hierarchicalGroups.map(g => g.platform)));
      setExpandedMarkets(new Set(hierarchicalGroups.flatMap(g => 
        g.markets.map(m => `${g.platform}:${m.market}`)
      )));
      setExpandedCampaigns(new Set(hierarchicalGroups.flatMap(g => 
        g.markets.flatMap(m => m.campaigns.map(c => `${g.platform}:${m.market}:${c.campaignName}`))
      )));
      setExpandedAdSets(new Set(resultsWithAssets.map(r => r.structure.id)));
    } else {
      // Collapse all levels
      setExpandedPlatforms(new Set());
      setExpandedMarkets(new Set());
      setExpandedCampaigns(new Set());
      setExpandedAdSets(new Set());
    }
  }, [forceExpand, hierarchicalGroups, resultsWithAssets]);

  const activeSaveInProgress = useMemo(() => {
    if (!saveProgress || saveProgress.size === 0) return false;
    for (const item of saveProgress.values()) {
      if (item.status === 'pending' || item.status === 'uploading' || item.status === 'saving') return true;
    }
    return false;
  }, [saveProgress]);

  useEffect(() => {
    if (!activeSaveInProgress || resultsWithAssets.length === 0) return;

    setIsExpanded(true);
    // Expand all platforms, markets, and campaigns when saving
    setExpandedPlatforms(new Set(hierarchicalGroups.map(g => g.platform)));
    setExpandedMarkets(new Set(hierarchicalGroups.flatMap(g => g.markets.map(m => `${g.platform}:${m.market}`))));
    setExpandedCampaigns(new Set(hierarchicalGroups.flatMap(g => 
      g.markets.flatMap(m => m.campaigns.map(c => `${g.platform}:${m.market}:${c.campaignName}`))
    )));
    setExpandedAdSets(new Set(resultsWithAssets.map(r => r.structure.id)));
  }, [activeSaveInProgress, resultsWithAssets, hierarchicalGroups]);
  
  if (resultsWithAssets.length === 0) return null;
  
  const totalAssigned = resultsWithAssets.reduce((sum, r) => sum + r.assignedAssets.length, 0);
  const totalAccepted = resultsWithAssets.reduce((sum, r) => {
    return sum + r.assignedAssets.filter(a => acceptedMatches.has(`${a.asset.id}:${r.structure.id}`)).length;
  }, 0);
  const hasUnaccepted = totalAccepted < totalAssigned;
  
  const togglePlatform = (platform: string) => {
    setExpandedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const toggleMarket = (marketKey: string) => {
    setExpandedMarkets(prev => {
      const next = new Set(prev);
      if (next.has(marketKey)) next.delete(marketKey);
      else next.add(marketKey);
      return next;
    });
  };

  const toggleCampaign = (campaignKey: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(campaignKey)) next.delete(campaignKey);
      else next.add(campaignKey);
      return next;
    });
  };

  const toggleAdSet = (id: string) => {
    setExpandedAdSets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('meta') || p.includes('facebook')) return '📘';
    if (p.includes('tiktok')) return '🎵';
    if (p.includes('google')) return '🔍';
    if (p.includes('snapchat')) return '👻';
    if (p.includes('linkedin')) return '💼';
    return '📱';
  };

  const getMarketIcon = (market: string) => {
    // Show flag emoji or globe for markets
    return '🌍';
  };
  
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-emerald-500/10 transition-colors pb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Layers className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-sm font-medium text-emerald-700">
                  Matched Creatives
                </CardTitle>
                <p className="text-xs text-emerald-600/80">
                  {resultsWithAssets.length} ad sets with {totalAssigned} creatives
                </p>
              </div>
              {hasUnaccepted && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-3 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/20"
                  onClick={(e) => { e.stopPropagation(); onAcceptAll(); }}
                >
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Apply All
                </Button>
              )}
              <Badge variant="outline" className="border-emerald-500/50 text-emerald-600">
                {totalAccepted}/{totalAssigned}
              </Badge>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-2">
            {/* Platform level */}
            {hierarchicalGroups.map((platformGroup) => {
              const isPlatformExpanded = expandedPlatforms.has(platformGroup.platform);
              const platformAssetCount = platformGroup.markets.reduce(
                (sum, m) => sum + m.campaigns.reduce((cs, c) => cs + c.adSets.reduce((as, a) => as + a.assignedAssets.length, 0), 0), 0
              );
              const platformAdSetCount = platformGroup.markets.reduce(
                (sum, m) => sum + m.campaigns.reduce((cs, c) => cs + c.adSets.length, 0), 0
              );
              
              return (
                <div key={platformGroup.platform} className="border rounded-lg bg-background overflow-hidden">
                  <Collapsible open={isPlatformExpanded} onOpenChange={() => togglePlatform(platformGroup.platform)}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors bg-muted/30">
                        <span className="text-lg">{getPlatformIcon(platformGroup.platform)}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold capitalize">{platformGroup.platform}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {platformGroup.markets.length} market{platformGroup.markets.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {platformAdSetCount} ad sets • {platformAssetCount} creatives
                        </Badge>
                        {isPlatformExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="pl-4 pr-3 pb-2 space-y-2">
                        {/* Market level */}
                        {platformGroup.markets.map((marketGroup) => {
                          const marketKey = `${platformGroup.platform}:${marketGroup.market}`;
                          const isMarketExpanded = expandedMarkets.has(marketKey);
                          const marketAssetCount = marketGroup.campaigns.reduce(
                            (sum, c) => sum + c.adSets.reduce((as, a) => as + a.assignedAssets.length, 0), 0
                          );
                          const marketAdSetCount = marketGroup.campaigns.reduce((sum, c) => sum + c.adSets.length, 0);
                          
                          return (
                            <div key={marketKey} className="border rounded-lg bg-background overflow-hidden">
                              <Collapsible open={isMarketExpanded} onOpenChange={() => toggleMarket(marketKey)}>
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
                                    <span className="text-base">{getMarketIcon(marketGroup.market)}</span>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium">{marketGroup.market}</span>
                                      <span className="text-xs text-muted-foreground ml-2">
                                        {marketGroup.campaigns.length} campaign{marketGroup.campaigns.length !== 1 ? 's' : ''}
                                      </span>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                      {marketAdSetCount} ad sets • {marketAssetCount} creatives
                                    </Badge>
                                    {isMarketExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </div>
                                </CollapsibleTrigger>
                                
                                <CollapsibleContent>
                                  <div className="pl-4 pr-2 pb-2 space-y-2">
                                    {/* Campaign level (this is the Phase from phase scheduler) */}
                                    {marketGroup.campaigns.map((campaignGroup) => {
                                      const campaignKey = `${platformGroup.platform}:${marketGroup.market}:${campaignGroup.campaignName}`;
                                      const isCampaignExpanded = expandedCampaigns.has(campaignKey);
                                      const campaignAssetCount = campaignGroup.adSets.reduce((sum, a) => sum + a.assignedAssets.length, 0);
                                      
                                      return (
                                        <div key={campaignKey} className="border rounded-lg bg-muted/10 overflow-hidden">
                                          <Collapsible open={isCampaignExpanded} onOpenChange={() => toggleCampaign(campaignKey)}>
                                            <CollapsibleTrigger asChild>
                                              <div className="flex items-center gap-2.5 p-2 cursor-pointer hover:bg-muted/50 transition-colors">
                                                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                                  <Target className="h-3 w-3 text-primary" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <span className="text-xs font-medium">{campaignGroup.campaignName}</span>
                                                </div>
                                                <Badge variant="secondary" className="text-[10px] h-5">
                                                  {campaignGroup.adSets.length} ad sets • {campaignAssetCount} creatives
                                                </Badge>
                                                {isCampaignExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                              </div>
                                            </CollapsibleTrigger>
                                            
                                            <CollapsibleContent>
                                              <div className="pl-3 pr-2 pb-2 space-y-1.5">
                                                {/* AdSet level */}
                                                {campaignGroup.adSets.map((result) => {
                                                  const { structure, assignedAssets } = result;
                                                  const isAdSetExpanded = expandedAdSets.has(structure.id);
                                                  const acceptedCount = assignedAssets.filter(a => acceptedMatches.has(`${a.asset.id}:${structure.id}`)).length;
                                                  const hasAdSetUnaccepted = acceptedCount < assignedAssets.length;
                                                  const isAtLimit = acceptedCount >= ADS_PER_AD_SET_LIMIT;
                                                  const remainingSlots = Math.max(0, ADS_PER_AD_SET_LIMIT - acceptedCount);
                                                  
                                                  return (
                                                    <div key={structure.id} className="border rounded-lg bg-background">
                                                      <Collapsible open={isAdSetExpanded} onOpenChange={() => toggleAdSet(structure.id)}>
                                                        <CollapsibleTrigger asChild>
                                                          <div className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 transition-colors">
                                                            <div className="w-5 h-5 rounded bg-secondary/50 flex items-center justify-center shrink-0">
                                                              <Layers className="h-3 w-3 text-muted-foreground" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                              <div className="flex items-center gap-2">
                                                                <span className="text-xs font-medium truncate">{structure.adSetName}</span>
                                                                {acceptedCount > 0 && (
                                                                  <Badge className={cn(
                                                                    "text-[10px] py-0 h-4",
                                                                    isAtLimit ? "bg-amber-500" : "bg-emerald-500"
                                                                  )}>
                                                                    {acceptedCount}/{ADS_PER_AD_SET_LIMIT} ads
                                                                  </Badge>
                                                                )}
                                                                {isAtLimit && (
                                                                  <Badge variant="destructive" className="text-[10px] py-0 h-4">
                                                                    <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                                                                    Limit
                                                                  </Badge>
                                                                )}
                                                              </div>
                                                              {/* Compact taxonomy info */}
                                                              {structure.taxonomyElements && Object.entries(structure.taxonomyElements).length > 0 && (
                                                                <div className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed truncate">
                                                                  {Object.entries(structure.taxonomyElements)
                                                                    .filter(([key, value]) => {
                                                                      if (!value || value === '') return false;
                                                                      const splitParams = ['Gender', 'Devices', 'Age Range', 'Languages', 'Location'];
                                                                      if (splitParams.includes(key)) return true;
                                                                      return value !== 'ALL';
                                                                    })
                                                                    .slice(0, 6)
                                                                    .map(([param, value], idx) => (
                                                                      <span key={param}>
                                                                        {idx > 0 && <span className="mx-0.5">•</span>}
                                                                        <span className="font-medium">{String(value)}</span>
                                                                      </span>
                                                                    ))
                                                                  }
                                                                </div>
                                                              )}
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                              {hasAdSetUnaccepted && !isAtLimit && (
                                                                <Button
                                                                  size="sm"
                                                                  variant="ghost"
                                                                  className="h-5 text-[9px] px-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                                                  onClick={(e) => { 
                                                                    e.stopPropagation();
                                                                    // Sort by confidence and accept up to the limit
                                                                    const sorted = [...assignedAssets].sort((a, b) => b.confidenceScore - a.confidenceScore);
                                                                    let slotsLeft = remainingSlots;
                                                                    for (const a of sorted) {
                                                                      if (slotsLeft <= 0) break;
                                                                      if (!acceptedMatches.has(`${a.asset.id}:${structure.id}`)) {
                                                                        onAcceptAsset(a.asset.id, structure);
                                                                        slotsLeft--;
                                                                      }
                                                                    }
                                                                    if (remainingSlots < assignedAssets.filter(a => !acceptedMatches.has(`${a.asset.id}:${structure.id}`)).length) {
                                                                      // Will show toast from hook
                                                                    }
                                                                  }}
                                                                >
                                                                  <Check className="h-2.5 w-2.5 mr-0.5" />
                                                                  Accept{remainingSlots < assignedAssets.length ? ` (${remainingSlots} left)` : ''}
                                                                </Button>
                                                              )}
                                                              <Badge variant="secondary" className="shrink-0 text-[10px] h-4">
                                                                {assignedAssets.length}
                                                              </Badge>
                                                              {isAdSetExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                            </div>
                                                          </div>
                                                        </CollapsibleTrigger>
                                                        
                                                        <CollapsibleContent>
                                                          <div className="px-2 pb-2 space-y-1.5">
                                                            {assignedAssets.map((assignedAsset) => {
                                                              const { asset, confidenceScore, reasoning, matchedCriteria, issues } = assignedAsset;
                                                              const isAccepted = acceptedMatches.has(`${asset.id}:${structure.id}`);
                                                              const compositeKey = `${asset.id}:${structure.id}`;
                                                              const progressItem = saveProgress?.get(compositeKey);
                                                              
                                                              return (
                                                                <div 
                                                                  key={asset.id}
                                                                  className={cn(
                                                                    "p-2 rounded-lg border flex items-center gap-2",
                                                                    isAccepted ? "bg-emerald-500/10 border-emerald-500/30" : "bg-background",
                                                                    progressItem?.status === 'done' && "bg-emerald-500/15 border-emerald-500/50",
                                                                    progressItem?.status === 'error' && "bg-destructive/10 border-destructive/30"
                                                                  )}
                                                                >
                                                                  <AssetThumbnail asset={asset} />
                                                                  <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                      <span className="text-xs font-medium truncate">{asset.fileName}</span>
                                                                      <TooltipProvider>
                                                                        <Tooltip>
                                                                          <TooltipTrigger asChild>
                                                                            <Button variant="ghost" size="icon" className="h-4 w-4 p-0">
                                                                              <Info className="h-3 w-3 text-muted-foreground" />
                                                                            </Button>
                                                                          </TooltipTrigger>
                                                                          <TooltipContent side="right" className="p-3 max-w-xs">
                                                                            <div className="space-y-2">
                                                                              <p className="font-semibold text-xs border-b pb-1">Why matched:</p>
                                                                              <ul className="space-y-1 text-xs">
                                                                                {reasoning.map((r, i) => (
                                                                                  <li key={i} className="flex items-start gap-1">
                                                                                    <Check className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                                                                                    <span>{r}</span>
                                                                                  </li>
                                                                                ))}
                                                                              </ul>
                                                                              {issues.length > 0 && (
                                                                                <>
                                                                                  <p className="font-semibold text-xs border-t pt-2 text-amber-600">Warnings:</p>
                                                                                  <ul className="space-y-1 text-xs">
                                                                                    {issues.map((issue, i) => (
                                                                                      <li key={i} className="text-amber-600">{issue.message}</li>
                                                                                    ))}
                                                                                  </ul>
                                                                                </>
                                                                              )}
                                                                            </div>
                                                                          </TooltipContent>
                                                                        </Tooltip>
                                                                      </TooltipProvider>
                                                                    </div>
                                                                    <MatchCriteriaList criteria={matchedCriteria} />
                                                                  </div>
                                                                  <MatchConfidenceIndicator score={confidenceScore} size="sm" />
                                                                  
                                                                  {progressItem ? (
                                                                    <SaveStatusIndicator status={progressItem.status} error={progressItem.error} />
                                                                  ) : isAccepted ? (
                                                                     <Button
                                                                       size="sm"
                                                                       variant="outline"
                                                                       onClick={() => onRejectAsset(asset.id, structure.id)}
                                                                       className="shrink-0 h-6 px-2 text-[10px] border-emerald-500/50 text-emerald-600 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                                                                     >
                                                                       <X className="h-2.5 w-2.5 mr-0.5" />
                                                                       Unmatch
                                                                     </Button>
                                                                  ) : (
                                                                    <div className="flex gap-1 shrink-0">
                                                                      <Button 
                                                                        size="sm" 
                                                                        onClick={() => onAcceptAsset(asset.id, structure)}
                                                                        className="bg-emerald-500 hover:bg-emerald-600 h-6 w-6 p-0"
                                                                      >
                                                                        <Check className="h-3 w-3" />
                                                                      </Button>
                                                                      <Button 
                                                                        size="sm" 
                                                                        variant="ghost"
                                                                        onClick={() => onRejectAsset(asset.id, structure.id)}
                                                                        className="h-6 w-6 p-0"
                                                                      >
                                                                        <X className="h-3 w-3" />
                                                                      </Button>
                                                                    </div>
                                                                  )}
                                                                </div>
                                                              );
                                                            })}
                                                          </div>
                                                        </CollapsibleContent>
                                                      </Collapsible>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </CollapsibleContent>
                                          </Collapsible>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Suggestions panel for empty ad sets
function SuggestionsPanel({ 
  suggestions, 
  acceptedMatches,
  onAcceptSuggestion,
  forceOpen,
}: { 
  suggestions: EmptyAdSetSuggestion[];
  acceptedMatches: Map<string, UICreativeMatch>;
  onAcceptSuggestion: (assetId: string, structure: CampaignStructure) => void;
  forceOpen?: boolean;
}) {
  // Default to collapsed (but auto-open after user clicks "Find Similar")
  const [isExpanded, setIsExpanded] = useState(Boolean(forceOpen));

  useEffect(() => {
    if (forceOpen) setIsExpanded(true);
  }, [forceOpen]);
  
  if (suggestions.length === 0) return null;
  
  const totalSuggestions = suggestions.reduce((sum, s) => sum + s.suggestedAssets.length, 0);
  
  // Count how many are not yet accepted
  const unacceptedCount = suggestions.reduce((sum, s) => {
    return sum + s.suggestedAssets.filter(sa => !acceptedMatches.has(`${sa.asset.id}:${s.structure.id}`)).length;
  }, 0);
  
  const handleApplyAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    suggestions.forEach(s => {
      s.suggestedAssets.forEach(sa => {
        if (!acceptedMatches.has(`${sa.asset.id}:${s.structure.id}`)) {
          onAcceptSuggestion(sa.asset.id, s.structure);
        }
      });
    });
  };
  
  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-blue-500/10 transition-colors pb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <Lightbulb className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-sm font-medium text-blue-700">
                  Suggestions for Empty Ad Sets
                </CardTitle>
                <p className="text-xs text-blue-600/80">
                  {suggestions.length} ad sets could use {totalSuggestions} creatives
                </p>
              </div>
              {unacceptedCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-500/20"
                  onClick={handleApplyAll}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Apply All
                </Button>
              )}
              <Badge variant="outline" className="border-blue-500/50 text-blue-600">
                {totalSuggestions}
              </Badge>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {suggestions.map((suggestion) => {
              const { structure, suggestedAssets } = suggestion;
              const acceptedCount = suggestedAssets.filter(sa => 
                acceptedMatches.has(`${sa.asset.id}:${structure.id}`)
              ).length;
              const hasUnaccepted = acceptedCount < suggestedAssets.length;
              
              return (
                <div key={structure.id} className="p-3 rounded-lg border border-blue-500/20 bg-background">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{structure.adSetName}</p>
                      {/* Show taxonomy elements inline */}
                      {structure.taxonomyElements && Object.entries(structure.taxonomyElements).length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                          {Object.entries(structure.taxonomyElements)
                            .filter(([key, value]) => {
                              if (!value || value === '') return false;
                              // Always show split-related params (even if ALL)
                              const splitParams = ['Gender', 'Devices', 'Age Range', 'Languages', 'Location'];
                              if (splitParams.includes(key)) return true;
                              return value !== 'ALL';
                            })
                            .slice(0, 10)
                            .map(([param, value], idx) => (
                              <span key={param}>
                                {idx > 0 && <span className="mx-1">•</span>}
                                <span className="text-muted-foreground/70">{param}:</span>
                                <span className="font-medium text-foreground/80 ml-0.5">{value}</span>
                              </span>
                            ))
                          }
                        </div>
                      )}
                    </div>
                    {hasUnaccepted && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                        onClick={() => {
                          suggestedAssets.forEach(sa => {
                            if (!acceptedMatches.has(`${sa.asset.id}:${structure.id}`)) {
                              onAcceptSuggestion(sa.asset.id, structure);
                            }
                          });
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Apply All
                      </Button>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {suggestedAssets.length}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 pl-11">
                    {suggestedAssets.map((sa) => {
                      const isAccepted = acceptedMatches.has(`${sa.asset.id}:${structure.id}`);
                      
                      return (
                        <div 
                          key={sa.asset.id}
                          className={cn(
                            "p-2 rounded-lg border flex items-center gap-3",
                            isAccepted ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/30"
                          )}
                        >
                          <AssetThumbnail asset={sa.asset} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{sa.asset.fileName}</p>
                            <p className="text-[10px] text-amber-600 mt-0.5">
                              {sa.blockingReason}
                            </p>
                          </div>
                          {isAccepted ? (
                            <Badge className="bg-emerald-500 shrink-0">
                              <Check className="h-3 w-3 mr-1" />
                              Accepted
                            </Badge>
                          ) : (
                            <Button 
                              size="sm" 
                              onClick={() => onAcceptSuggestion(sa.asset.id, structure)}
                              className="bg-blue-500 hover:bg-blue-600"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function StructureCentricView({
  structureResults,
  unassignedAssets,
  acceptedMatches,
  saveProgress,
  onAcceptAsset,
  onRejectAsset,
}: StructureCentricViewProps) {
  // Global expand/collapse state - passed to child panels
  const [globalExpanded, setGlobalExpanded] = useState(true);
  // Key to force re-render child panels when global state changes
  const [expandKey, setExpandKey] = useState(0);

  // Treat accepted suggestions as assigned for UI (so empty/unassigned counts update live)
  const acceptedAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const key of acceptedMatches.keys()) {
      // Parse compositeKey: last segment is structureId, everything before is assetId
      const lastColonIdx = key.lastIndexOf(':');
      const assetId = key.slice(0, lastColonIdx);
      if (assetId) ids.add(assetId);
    }
    return ids;
  }, [acceptedMatches]);

  const displayUnassignedAssets = useMemo(() => {
    if (acceptedAssetIds.size === 0) return unassignedAssets;
    return unassignedAssets.filter(u => !acceptedAssetIds.has(u.asset.id));
  }, [unassignedAssets, acceptedAssetIds]);

  const mergedStructureResults = useMemo(() => {
    if (acceptedMatches.size === 0) return structureResults;

    // Build a quick lookup for assets by id so we can show accepted suggestions
    const assetById = new Map<string, DigestedAsset>();
    for (const r of structureResults) {
      for (const a of r.assignedAssets) assetById.set(a.asset.id, a.asset);
    }
    for (const u of unassignedAssets) assetById.set(u.asset.id, u.asset);

    // Group accepted matches by structure id
    const acceptedByStructureId = new Map<string, Array<{ assetId: string; match: UICreativeMatch }>>();
    for (const [key, match] of acceptedMatches.entries()) {
      // Parse compositeKey: last segment is structureId, everything before is assetId
      const lastColonIdx = key.lastIndexOf(':');
      const assetId = key.slice(0, lastColonIdx);
      const structureId = key.slice(lastColonIdx + 1);
      if (!assetId || !structureId) continue;
      const arr = acceptedByStructureId.get(structureId) ?? [];
      arr.push({ assetId, match });
      acceptedByStructureId.set(structureId, arr);
    }

    return structureResults.map((r) => {
      const acceptedForStructure = acceptedByStructureId.get(r.structure.id);
      if (!acceptedForStructure || acceptedForStructure.length === 0) return r;

      const existingAssetIds = new Set(r.assignedAssets.map(a => a.asset.id));
      const added = acceptedForStructure
        .filter(({ assetId }) => !existingAssetIds.has(assetId))
        .map(({ assetId, match }) => {
          const asset = assetById.get(assetId);
          if (!asset) return null;

          return {
            asset,
            confidenceScore: match.confidenceScore,
            reasoning: match.reasoning,
            matchedCriteria: ['Accepted by user'],
            issues: match.compatibilityIssues.map(i => ({
              type: i.type,
              severity: i.severity,
              message: i.message,
            })),
          };
        })
        .filter(Boolean) as StructureMatchResult['assignedAssets'];

      if (added.length === 0) return r;
      return {
        ...r,
        assignedAssets: [...r.assignedAssets, ...added],
      };
    });
  }, [structureResults, unassignedAssets, acceptedMatches]);

  // Sort structures: ones with assets first, then by number of assets
  const sortedResults = useMemo(() => {
    return [...mergedStructureResults].sort((a, b) => {
      if (a.assignedAssets.length === 0 && b.assignedAssets.length > 0) return 1;
      if (b.assignedAssets.length === 0 && a.assignedAssets.length > 0) return -1;
      return b.assignedAssets.length - a.assignedAssets.length;
    });
  }, [mergedStructureResults]);

  const totalAssigned = mergedStructureResults.reduce((sum, r) => sum + r.assignedAssets.length, 0);
  const structuresWithAssets = mergedStructureResults.filter(r => r.assignedAssets.length > 0).length;

  // Get empty ad sets (need creatives)
  const emptyStructures = useMemo(
    () => mergedStructureResults.filter(r => r.assignedAssets.length === 0),
    [mergedStructureResults]
  );

  // Find suggestions for empty ad sets from unassigned assets
  // Important: We use the original `unassignedAssets` to build suggestions, but we skip any
  // asset that has already been accepted for THIS specific structure. This way, accepting
  // an asset for one structure only removes the suggestion from that structure, not from all.
  const suggestions = useMemo((): EmptyAdSetSuggestion[] => {
    const emptyResults = mergedStructureResults.filter(r => r.assignedAssets.length === 0);
    if (emptyResults.length === 0 || unassignedAssets.length === 0) return [];

    // Build a set of "assetId:structureId" keys that are already accepted
    const acceptedKeys = new Set(acceptedMatches.keys());

    const result: EmptyAdSetSuggestion[] = [];

    for (const emptyResult of emptyResults) {
      const structure = emptyResult.structure;
      const structurePlatform = structure.platform?.toLowerCase() || '';

      const suggestedAssets: EmptyAdSetSuggestion['suggestedAssets'] = [];

      for (const unassigned of unassignedAssets) {
        const { asset, closestMatches } = unassigned;

        // Skip if this asset is already accepted for THIS structure
        const key = `${asset.id}:${structure.id}`;
        if (acceptedKeys.has(key)) continue;

        // CRITICAL: Always check dimension compatibility with the platform
        // Never suggest a creative whose dimensions don't work for the ad set's platform
        const assetWidth = asset.technicalAttributes?.width;
        const assetHeight = asset.technicalAttributes?.height;
        
        if (structurePlatform && assetWidth && assetHeight) {
          const mediaType = asset.mediaType === 'video' ? 'video' : 'image';
          const compatibleFormats = findCompatibleFormats(
            assetWidth,
            assetHeight,
            mediaType,
            structurePlatform
          );
          
          // If no compatible formats for this platform, skip this asset entirely
          if (compatibleFormats.length === 0) {
            continue;
          }
        }

        // Check if this specific structure appears in the asset's closest matches
        const matchForThisStructure = closestMatches?.find(m => m.structure.id === structure.id);

        if (matchForThisStructure) {
          // We have matching data for this specific structure
          const blockingReasons = matchForThisStructure.blockingReasons || [];
          const lowerReasons = blockingReasons.map(r => r.toLowerCase());

          const platformBlockReasons = blockingReasons.filter((_, idx) =>
            lowerReasons[idx]?.includes('platform') ||
            lowerReasons[idx]?.includes('meta') ||
            lowerReasons[idx]?.includes('tiktok') ||
            lowerReasons[idx]?.includes('google')
          );

          const marketBlockReasons = blockingReasons.filter((_, idx) => 
            lowerReasons[idx]?.includes('market')
          );

          const softBlockReasons = [...platformBlockReasons, ...marketBlockReasons];

          // Suggest if:
          // 1. Only platform/market are blocking (dimensions, format, language are compatible)
          // 2. OR score is reasonable (>=30)
          // 3. OR there are no blocking reasons at all (somehow not auto-matched)
          const isPlatformOrMarketOnly = softBlockReasons.length > 0 && softBlockReasons.length === blockingReasons.length;
          const hasGoodScore = matchForThisStructure.score >= 30;
          const noHardBlockers = blockingReasons.length === 0;

          if (isPlatformOrMarketOnly || hasGoodScore || noHardBlockers) {
            suggestedAssets.push({
              asset,
              blockingReason: softBlockReasons[0] || blockingReasons[0] || 'Compatible - review recommended',
              isPlatformOnly: isPlatformOrMarketOnly,
            });
          }
        } else {
          // This structure wasn't in closestMatches, but dimensions are compatible
          // Suggest anyway since dimension check passed above
          suggestedAssets.push({
            asset,
            blockingReason: 'Dimensions compatible - no other match data',
            isPlatformOnly: false,
          });
        }
      }

      if (suggestedAssets.length > 0) {
        result.push({ structure, suggestedAssets });
      }
    }

    return result;
  }, [mergedStructureResults, unassignedAssets, acceptedMatches]);

  const suggestionsByStructureId = useMemo(() => {
    const map = new Map<string, EmptyAdSetSuggestion>();
    for (const s of suggestions) map.set(s.structure.id, s);
    return map;
  }, [suggestions]);

  // Calculate save progress stats
  const saveProgressStats = useMemo(() => {
    if (!saveProgress || saveProgress.size === 0) return null;
    const items = Array.from(saveProgress.values());
    const total = items.length;
    const done = items.filter(i => i.status === 'done').length;
    const errors = items.filter(i => i.status === 'error').length;
    const inProgress = items.filter(i => i.status === 'uploading' || i.status === 'saving').length;
    const pending = items.filter(i => i.status === 'pending').length;

    const started = total - pending;
    const completed = done + errors;
    // Weighted: most time is spent uploading/creating, final DB write is last.
    const percent = total === 0 ? 0 : Math.round((started / total) * 90 + (completed / total) * 10);

    return { total, done, errors, inProgress, pending, started, completed, percent };
  }, [saveProgress]);

  return (
    <div className="space-y-4">
      {/* Save progress banner when saving */}
      {saveProgressStats && (saveProgressStats.inProgress > 0 || saveProgressStats.pending > 0) && (
        <div className="rounded-lg border bg-primary/5 border-primary/20 p-3">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <div className="flex-1">
              <div className="text-sm font-medium text-primary">Saving creatives…</div>
              <div className="text-xs text-muted-foreground">
                Processing {saveProgressStats.started}/{saveProgressStats.total}
                {saveProgressStats.errors > 0 && (
                  <span className="text-destructive ml-2">• {saveProgressStats.errors} errors</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">{saveProgressStats.percent}%</div>
            </div>
          </div>

          <div className="mt-2 space-y-1.5">
            <Progress value={saveProgressStats.percent} className="h-2" />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Queued: {saveProgressStats.pending}</span>
              <span>Working: {saveProgressStats.inProgress}</span>
              <span>Saved: {saveProgressStats.done}</span>
            </div>
          </div>
        </div>
      )}

      {/* Summary header with expand/collapse controls */}
      <div className="flex items-center justify-between gap-4 text-sm pb-3 border-b">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <span className="text-muted-foreground">Ad Sets:</span>{' '}
            <span className="font-medium">{structuresWithAssets}/{mergedStructureResults.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Assigned:</span>{' '}
            <span className="font-medium text-emerald-600">{totalAssigned}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Unassigned:</span>{' '}
            <span className="font-medium text-amber-600">{displayUnassignedAssets.length}</span>
          </div>
          {emptyStructures.length > 0 && (
            <div>
              <span className="text-muted-foreground">Empty Slots:</span>{' '}
              <span className="font-medium text-orange-600">{emptyStructures.length}</span>
            </div>
          )}
          {suggestions.length > 0 && (
            <div>
              <span className="text-muted-foreground">Suggestions:</span>{' '}
              <span className="font-medium text-blue-600">{suggestions.reduce((s, x) => s + x.suggestedAssets.length, 0)}</span>
            </div>
          )}
        </div>
        {/* Expand/Collapse controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              setGlobalExpanded(true);
              setExpandKey(k => k + 1);
            }}
          >
            <ChevronDown className="h-4 w-4 mr-1" />
            Expand All
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              setGlobalExpanded(false);
              setExpandKey(k => k + 1);
            }}
          >
            <ChevronUp className="h-4 w-4 mr-1" />
            Collapse All
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[600px] pr-4">
        <div className="space-y-3">
          {/* Assigned creatives panel - grouped under one foldable card */}
          <AssignedAssetsPanel
            key={expandKey}
            structureResults={sortedResults}
            acceptedMatches={acceptedMatches}
            saveProgress={saveProgress}
            onAcceptAsset={onAcceptAsset}
            onRejectAsset={onRejectAsset}
            onAcceptAll={() => {
              sortedResults.forEach(result => {
                result.assignedAssets.forEach(a => onAcceptAsset(a.asset.id, result.structure));
              });
            }}
            forceExpand={globalExpanded}
          />

          {/* Keep legacy SuggestionsPanel mounted but hidden (we now show suggestions under each empty ad set) */}
          <SuggestionsPanel
            suggestions={[]}
            acceptedMatches={acceptedMatches}
            onAcceptSuggestion={onAcceptAsset}
            forceOpen={false}
          />

          {/* Empty ad sets panel - shows suggestions under each ad set */}
          <EmptyAdSetsPanel
            emptyStructures={emptyStructures}
            suggestionsByStructureId={suggestionsByStructureId}
            acceptedMatches={acceptedMatches}
            onAcceptSuggestion={onAcceptAsset}
          />

          {/* Unassigned assets panel */}
          <UnassignedAssetsPanel 
            unassignedAssets={displayUnassignedAssets} 
            structureResults={structureResults}
            onManualAssign={onAcceptAsset}
          />
        </div>
      </ScrollArea>
    </div>
  );
}

