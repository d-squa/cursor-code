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
  Sparkles
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
  
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {criteria.slice(0, 3).map((c, i) => (
        <Badge key={i} variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-500/50 text-emerald-600">
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
  onRejectAsset 
}: { 
  result: StructureMatchResult;
  acceptedMatches: Map<string, UICreativeMatch>;
  onAcceptAsset: (assetId: string) => void;
  onRejectAsset: (assetId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(result.assignedAssets.length > 0);
  const { structure, assignedAssets } = result;
  
  // Check accepted status using composite key: assetId:structureId
  const isAssetAccepted = (assetId: string) => acceptedMatches.has(`${assetId}:${structure.id}`);
  const acceptedCount = assignedAssets.filter(a => isAssetAccepted(a.asset.id)).length;
  const hasAssets = assignedAssets.length > 0;

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
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <Badge variant="outline" className="text-[10px] py-0 px-1">
                    {structure.platform}
                  </Badge>
                  {structure.market && (
                    <span>{structure.market}</span>
                  )}
                  {structure.language && (
                    <>
                      <span>•</span>
                      <span className="uppercase">{structure.language}</span>
                    </>
                  )}
                  {structure.funnelStage && (
                    <>
                      <span>•</span>
                      <span className="capitalize">{structure.funnelStage}</span>
                    </>
                  )}
                </div>
                {/* Show taxonomy elements compact inline */}
                {structure.taxonomyElements && Object.keys(structure.taxonomyElements).length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                    {Object.entries(structure.taxonomyElements).map(([param, value], idx) => (
                      <span key={param}>
                        {idx > 0 && <span className="mx-1">•</span>}
                        <span className="text-muted-foreground/70">{param}:</span>
                        <span className="font-medium text-foreground/80">{value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
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
  const [isExpanded, setIsExpanded] = useState(true);
  
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
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (suggestions.length === 0) return null;
  
  const totalSuggestions = suggestions.reduce((sum, s) => sum + s.suggestedAssets.length, 0);
  
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
                  Creatives that could fit if platform constraint is relaxed
                </p>
              </div>
              <Badge variant="outline" className="border-blue-500/50 text-blue-600">
                {totalSuggestions} suggestions
              </Badge>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {suggestions.map((suggestion) => {
              const { structure, suggestedAssets } = suggestion;
              
              return (
                <div key={structure.id} className="p-3 rounded-lg border border-blue-500/20 bg-background">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">{structure.adSetName}</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1">
                      {structure.platform}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 mt-2">
                    {suggestedAssets.map(({ asset, blockingReason, isPlatformOnly }) => {
                      const isAccepted = acceptedMatches.has(`${asset.id}:${structure.id}`);
                      
                      return (
                        <div 
                          key={asset.id}
                          className={cn(
                            "p-2 rounded border flex items-center gap-2",
                            isAccepted ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/30"
                          )}
                        >
                          <AssetThumbnail asset={asset} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{asset.fileName}</p>
                            <p className="text-[10px] text-muted-foreground">{blockingReason}</p>
                          </div>
                          {isPlatformOnly && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="text-[10px] py-0 px-1 border-blue-500/50 text-blue-600">
                                    <Sparkles className="h-3 w-3 mr-0.5" />
                                    Platform only
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Only platform constraint is blocking this match</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {isAccepted ? (
                            <Badge className="bg-emerald-500 shrink-0 text-[10px]">
                              <Check className="h-3 w-3 mr-1" />
                              Accepted
                            </Badge>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-7 text-xs border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
                              onClick={() => onAcceptSuggestion(asset.id, structure)}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Apply
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
        {suggestions.length > 0 && (
          <div>
            <span className="text-muted-foreground">Suggestions:</span>{' '}
            <span className="font-medium text-blue-600">{suggestions.reduce((s, x) => s + x.suggestedAssets.length, 0)}</span>
          </div>
        )}
      </div>

      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-3">
          {/* Suggestions panel for empty ad sets */}
          <SuggestionsPanel 
            suggestions={suggestions} 
            acceptedMatches={acceptedMatches}
            onAcceptSuggestion={onAcceptAsset} 
          />
          
          {/* Unassigned assets panel */}
          <UnassignedAssetsPanel unassignedAssets={unassignedAssets} />
          
          {/* Structure cards */}
          {sortedResults.map((result) => (
            <StructureCard
              key={result.structure.id}
              result={result}
              acceptedMatches={acceptedMatches}
              onAcceptAsset={(assetId) => onAcceptAsset(assetId, result.structure)}
              onRejectAsset={(assetId) => onRejectAsset(assetId, result.structure.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
