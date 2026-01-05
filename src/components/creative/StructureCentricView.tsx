// Structure-centric view: shows each ad set with its assigned creatives
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import type { StructureMatchResult, UnassignedAsset, DigestedAsset, UICreativeMatch, CampaignStructure } from '@/hooks/useCreativeMatching';

// Suggestion for empty ad sets
interface EmptyAdSetSuggestion {
  structure: CampaignStructure;
  suggestedAssets: Array<{
    asset: DigestedAsset;
    blockingReason: string;
    isPlatformOnly: boolean;
  }>;
}

interface StructureCentricViewProps {
  structureResults: StructureMatchResult[];
  unassignedAssets: UnassignedAsset[];
  acceptedMatches: Map<string, UICreativeMatch>;
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

function StructureCard({ 
  result, 
  acceptedMatches,
  onAcceptAsset, 
  onRejectAsset,
  onAcceptAll
}: { 
  result: StructureMatchResult;
  acceptedMatches: Map<string, UICreativeMatch>;
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
                  
                  return (
                    <div 
                      key={asset.id}
                      className={cn(
                        "p-2 rounded-lg border flex items-center gap-3",
                        isAccepted ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/30"
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
                      {isAccepted ? (
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

function UnassignedAssetsPanel({ unassignedAssets }: { unassignedAssets: UnassignedAsset[] }) {
  // Default to collapsed
  const [isExpanded, setIsExpanded] = useState(false);
  
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
                  Could not match to any ad set
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
              
              return (
                <div key={asset.id} className="p-3 rounded-lg border border-amber-500/20 bg-background">
                  <div className="flex items-start gap-3">
                    <AssetThumbnail asset={asset} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{asset.fileName}</p>
                      
                      {/* Extracted signals */}
                      {Object.keys(extractedSignals).length > 0 && (
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
                      
                      {/* Closest matches */}
                      {closestMatches && closestMatches.length > 0 && (
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
  emptyStructures 
}: { 
  emptyStructures: StructureMatchResult[];
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

// Panel for assigned ad sets with matched creatives
function AssignedAssetsPanel({ 
  structureResults, 
  acceptedMatches,
  onAcceptAsset,
  onRejectAsset,
  onAcceptAll
}: { 
  structureResults: StructureMatchResult[];
  acceptedMatches: Map<string, UICreativeMatch>;
  onAcceptAsset: (assetId: string, structure: StructureMatchResult['structure']) => void;
  onRejectAsset: (assetId: string, structureId: string) => void;
  onAcceptAll: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());
  
  const resultsWithAssets = structureResults.filter(r => r.assignedAssets.length > 0);
  
  if (resultsWithAssets.length === 0) return null;
  
  const totalAssigned = resultsWithAssets.reduce((sum, r) => sum + r.assignedAssets.length, 0);
  const totalAccepted = resultsWithAssets.reduce((sum, r) => {
    return sum + r.assignedAssets.filter(a => acceptedMatches.has(`${a.asset.id}:${r.structure.id}`)).length;
  }, 0);
  const hasUnaccepted = totalAccepted < totalAssigned;
  
  const toggleAdSet = (id: string) => {
    setExpandedAdSets(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
            {resultsWithAssets.map((result) => {
              const { structure, assignedAssets } = result;
              const isAdSetExpanded = expandedAdSets.has(structure.id);
              const acceptedCount = assignedAssets.filter(a => acceptedMatches.has(`${a.asset.id}:${structure.id}`)).length;
              const hasAdSetUnaccepted = acceptedCount < assignedAssets.length;
              
              return (
                <div key={structure.id} className="border rounded-lg bg-background">
                  <Collapsible open={isAdSetExpanded} onOpenChange={() => toggleAdSet(structure.id)}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Target className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{structure.adSetName}</span>
                            {acceptedCount > 0 && (
                              <Badge className="bg-emerald-500 text-[10px] py-0">
                                {acceptedCount} accepted
                              </Badge>
                            )}
                          </div>
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
                          {hasAdSetUnaccepted && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                assignedAssets.forEach(a => onAcceptAsset(a.asset.id, structure));
                              }}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Accept All
                            </Button>
                          )}
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {assignedAssets.length}
                          </Badge>
                          {isAdSetExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="px-3 pb-3 space-y-2">
                        {assignedAssets.map((assignedAsset) => {
                          const { asset, confidenceScore, reasoning, matchedCriteria, issues } = assignedAsset;
                          const isAccepted = acceptedMatches.has(`${asset.id}:${structure.id}`);
                          
                          return (
                            <div 
                              key={asset.id}
                              className={cn(
                                "p-2 rounded-lg border flex items-center gap-3",
                                isAccepted ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/30"
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
                              {isAccepted ? (
                                <Badge className="bg-emerald-500 shrink-0">
                                  <Check className="h-3 w-3 mr-1" />
                                  Accepted
                                </Badge>
                              ) : (
                                <div className="flex gap-1 shrink-0">
                                  <Button 
                                    size="sm" 
                                    onClick={() => onAcceptAsset(asset.id, structure)}
                                    className="bg-emerald-500 hover:bg-emerald-600"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => onRejectAsset(asset.id, structure.id)}
                                  >
                                    <X className="h-4 w-4" />
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
  onAcceptSuggestion 
}: { 
  suggestions: EmptyAdSetSuggestion[];
  acceptedMatches: Map<string, UICreativeMatch>;
  onAcceptSuggestion: (assetId: string, structure: CampaignStructure) => void;
}) {
  // Default to collapsed
  const [isExpanded, setIsExpanded] = useState(false);
  
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
  onAcceptAsset,
  onRejectAsset,
}: StructureCentricViewProps) {
  // Sort structures: ones with assets first, then by number of assets
  const sortedResults = [...structureResults].sort((a, b) => {
    if (a.assignedAssets.length === 0 && b.assignedAssets.length > 0) return 1;
    if (b.assignedAssets.length === 0 && a.assignedAssets.length > 0) return -1;
    return b.assignedAssets.length - a.assignedAssets.length;
  });

  const totalAssigned = structureResults.reduce((sum, r) => sum + r.assignedAssets.length, 0);
  const structuresWithAssets = structureResults.filter(r => r.assignedAssets.length > 0).length;
  
  // Get empty ad sets (need creatives)
  const emptyStructures = useMemo(() => 
    structureResults.filter(r => r.assignedAssets.length === 0),
    [structureResults]
  );
  
  // Find suggestions for empty ad sets from unassigned assets
  const suggestions = useMemo((): EmptyAdSetSuggestion[] => {
    const emptyStructures = structureResults.filter(r => r.assignedAssets.length === 0);
    if (emptyStructures.length === 0 || unassignedAssets.length === 0) return [];
    
    const result: EmptyAdSetSuggestion[] = [];
    
    for (const emptyResult of emptyStructures) {
      const structure = emptyResult.structure;
      const suggestedAssets: EmptyAdSetSuggestion['suggestedAssets'] = [];
      
      for (const unassigned of unassignedAssets) {
        const { asset, reasons, closestMatches } = unassigned;
        
        // Check if this structure is in closest matches
        const closestMatch = closestMatches?.find(m => m.structure.id === structure.id);
        
        // Check if platform is the main blocking reason
        const platformBlockReasons = reasons.filter(r => 
          r.toLowerCase().includes('platform') || 
          r.toLowerCase().includes('meta') || 
          r.toLowerCase().includes('tiktok') || 
          r.toLowerCase().includes('google')
        );
        
        const isPlatformOnly = platformBlockReasons.length > 0 && 
          platformBlockReasons.length === reasons.length;
        
        // Include if platform is the main constraint OR if it's in closest matches with decent score
        if (isPlatformOnly || (closestMatch && closestMatch.score >= 30)) {
          suggestedAssets.push({
            asset,
            blockingReason: platformBlockReasons[0] || reasons[0] || 'No specific constraint detected',
            isPlatformOnly
          });
        }
      }
      
      if (suggestedAssets.length > 0) {
        result.push({ structure, suggestedAssets });
      }
    }
    
    return result;
  }, [structureResults, unassignedAssets]);

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center gap-4 text-sm pb-3 border-b">
        <div>
          <span className="text-muted-foreground">Ad Sets:</span>{' '}
          <span className="font-medium">{structuresWithAssets}/{structureResults.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Assigned:</span>{' '}
          <span className="font-medium text-emerald-600">{totalAssigned}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Unassigned:</span>{' '}
          <span className="font-medium text-amber-600">{unassignedAssets.length}</span>
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

      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-3">
          {/* Assigned creatives panel - grouped under one foldable card */}
          <AssignedAssetsPanel 
            structureResults={sortedResults}
            acceptedMatches={acceptedMatches}
            onAcceptAsset={onAcceptAsset}
            onRejectAsset={onRejectAsset}
            onAcceptAll={() => {
              sortedResults.forEach(result => {
                result.assignedAssets.forEach(a => onAcceptAsset(a.asset.id, result.structure));
              });
            }}
          />
          
          {/* Suggestions panel for empty ad sets */}
          <SuggestionsPanel 
            suggestions={suggestions} 
            acceptedMatches={acceptedMatches}
            onAcceptSuggestion={onAcceptAsset} 
          />
          
          {/* Empty ad sets panel - need creatives */}
          <EmptyAdSetsPanel emptyStructures={emptyStructures} />
          
          {/* Unassigned assets panel */}
          <UnassignedAssetsPanel unassignedAssets={unassignedAssets} />
        </div>
      </ScrollArea>
    </div>
  );
}
