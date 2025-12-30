// Individual creative with match suggestions
import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Check, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Image, 
  Video, 
  FileText,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchConfidenceIndicator } from './MatchConfidenceIndicator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DigestedAsset, UIMatchingResult, UICreativeMatch } from '@/hooks/useCreativeMatching';

interface CreativeMatchCardProps {
  result: UIMatchingResult;
  asset: DigestedAsset;
  acceptedMatch?: UICreativeMatch;
  rejectedStructureIds: Set<string>;
  onAccept: (match: UICreativeMatch) => void;
  onReject: (structureId: string) => void;
  onClearRejection: (structureId: string) => void;
  onRemove: () => void;
}

// Compact inline badges showing key match points with sources
function MatchedElementsBadges({ match }: { match: UICreativeMatch }) {
  const { reasoning } = match;
  
  // Extract key matches with sources from reasoning
  const keyMatches: Array<{ label: string; hasSource: boolean }> = [];
  
  reasoning.forEach(reason => {
    const sourceMatch = reason.match(/filename contains "([^"]+)"/);
    if (sourceMatch) {
      // Extract the type from the beginning of the reason
      const typeMatch = reason.match(/^([^:]+):/);
      if (typeMatch) {
        keyMatches.push({ label: `${typeMatch[1]}: "${sourceMatch[1]}"`, hasSource: true });
      }
    }
  });
  
  if (keyMatches.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {keyMatches.slice(0, 4).map((elem, idx) => (
        <Badge 
          key={idx} 
          variant="outline" 
          className="text-[10px] py-0 px-1.5 border-dashed border-amber-500/50 text-amber-600"
        >
          {elem.label}
        </Badge>
      ))}
      {keyMatches.length > 4 && (
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          +{keyMatches.length - 4} more
        </Badge>
      )}
    </div>
  );
}

// Parse a reasoning string to extract the type, value, and source
function parseReasoning(reason: string): { type: string; value: string; source?: string } | null {
  // Pattern: "Type: matched "value" to ... (source)" or "Type: value ... (source)"
  const matchWithSource = reason.match(/^([^:]+):\s*(?:matched\s+"([^"]+)"|([^(]+))\s*(?:\([^)]+\))?.*?\(([^)]+)\)$/);
  if (matchWithSource) {
    return {
      type: matchWithSource[1].trim(),
      value: matchWithSource[2] || matchWithSource[3]?.trim() || '',
      source: matchWithSource[4]
    };
  }
  
  // Pattern: "Type: value is..." or "Type: value..."
  const simpleMatch = reason.match(/^([^:]+):\s*(.+)$/);
  if (simpleMatch) {
    return {
      type: simpleMatch[1].trim(),
      value: simpleMatch[2].trim()
    };
  }
  
  return null;
}

// Detailed reasoning display with sources
function MatchReasoningList({ reasoning }: { reasoning: string[] }) {
  if (reasoning.length === 0) return null;
  
  return (
    <div className="space-y-1.5 text-xs">
      {reasoning.map((reason, idx) => {
        const parsed = parseReasoning(reason);
        if (!parsed) {
          return (
            <div key={idx} className="flex items-start gap-1.5 text-muted-foreground">
              <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>
              <span>{reason}</span>
            </div>
          );
        }
        
        const hasSource = parsed.source && parsed.source.includes('filename contains');
        
        return (
          <div key={idx} className="flex items-start gap-1.5">
            <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>
            <div className="flex flex-col">
              <span className="text-foreground font-medium">{parsed.type}</span>
              <span className="text-muted-foreground">{parsed.value}</span>
              {hasSource && (
                <span className="text-amber-600 text-[10px] italic">
                  → {parsed.source}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Detailed reasoning tooltip content with source information
function MatchReasoningTooltip({ match }: { match: UICreativeMatch }) {
  const { reasoning, compatibilityIssues, hardConstraintsMet } = match;
  const warnings = compatibilityIssues.filter(i => i.severity === 'warning');
  const errors = compatibilityIssues.filter(i => i.severity === 'error');
  
  return (
    <div className="space-y-3 max-w-sm">
      <div className="flex items-center gap-2">
        <span className={cn("text-xs font-medium", hardConstraintsMet ? "text-emerald-500" : "text-destructive")}>
          {hardConstraintsMet ? "✓ All constraints met" : "✗ Constraint issues"}
        </span>
      </div>
      
      {reasoning.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground border-b border-border pb-1">
            Match Reasoning
          </p>
          <MatchReasoningList reasoning={reasoning} />
        </div>
      )}
      
      {errors.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-destructive/30">
          <p className="text-xs font-medium text-destructive">Errors:</p>
          <ul className="text-xs space-y-0.5">
            {errors.map((issue, idx) => (
              <li key={idx} className="text-destructive flex items-start gap-1">
                <X className="h-3 w-3 shrink-0 mt-0.5" />
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {warnings.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-amber-500/30">
          <p className="text-xs font-medium text-amber-600">Warnings:</p>
          <ul className="text-xs space-y-0.5">
            {warnings.slice(0, 3).map((issue, idx) => (
              <li key={idx} className="text-amber-600 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CreativeMatchCard({
  result,
  asset,
  acceptedMatch,
  rejectedStructureIds,
  onAccept,
  onReject,
  onClearRejection,
  onRemove,
}: CreativeMatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);

  const hasMatches = result.matches.length > 0;
  const isAccepted = !!acceptedMatch;
  const displayedMatches = showAllMatches ? result.matches : result.matches.slice(0, 3);

  const MediaIcon = asset.mediaType === 'video' ? Video : asset.mediaType === 'image' ? Image : FileText;

  const getStatusBadge = () => {
    if (isAccepted) return <Badge className="bg-emerald-500 hover:bg-emerald-600">Accepted</Badge>;
    if (!hasMatches) return <Badge variant="destructive">No Match</Badge>;
    if (result.bestMatch && result.bestMatch.confidenceScore >= 80) return <Badge variant="secondary">Strong Match</Badge>;
    return <Badge variant="outline">Review</Badge>;
  };

  return (
    <TooltipProvider>
      <Card className={cn('transition-all', isAccepted && 'ring-2 ring-emerald-500/50', !hasMatches && 'opacity-75')}>
        <CardHeader className="pb-2">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              <MediaIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium truncate">{asset.fileName}</h4>
                {getStatusBadge()}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{asset.technicalAttributes.width}×{asset.technicalAttributes.height}</span>
                <span>•</span>
                <span className="capitalize">{asset.mediaType}</span>
                {asset.technicalAttributes.duration && (
                  <>
                    <span>•</span>
                    <span>{Math.round(asset.technicalAttributes.duration)}s</span>
                  </>
                )}
                <span>•</span>
                <span>{(asset.technicalAttributes.fileSize / 1024 / 1024).toFixed(1)}MB</span>
              </div>
              {(asset.hardConstraints.market || asset.hardConstraints.language || asset.hardConstraints.variant) && (
                <div className="flex gap-1 mt-2">
                  {asset.hardConstraints.market && <Badge variant="outline" className="text-xs">{asset.hardConstraints.market}</Badge>}
                  {asset.hardConstraints.language && <Badge variant="outline" className="text-xs">{asset.hardConstraints.language}</Badge>}
                  {asset.hardConstraints.variant && <Badge variant="outline" className="text-xs">{asset.hardConstraints.variant}</Badge>}
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onRemove} className="text-muted-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {hasMatches && result.bestMatch && !isAccepted && (
            <div className="p-3 bg-muted/50 rounded-lg mb-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-medium text-sm truncate">{result.bestMatch.structure.adSetName}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="p-3">
                        <MatchReasoningTooltip match={result.bestMatch} />
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {result.bestMatch.structure.platform} • {result.bestMatch.structure.campaignName}
                  </p>
                  <MatchedElementsBadges match={result.bestMatch} />
                </div>
                <MatchConfidenceIndicator score={result.bestMatch.confidenceScore} size="sm" />
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" onClick={() => onAccept(result.bestMatch!)} className="bg-emerald-500 hover:bg-emerald-600">
                    <Check className="h-4 w-4 mr-1" />Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onReject(result.bestMatch!.structure.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isAccepted && acceptedMatch && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-3">
              <div className="flex items-center gap-3">
                <Check className="h-5 w-5 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{acceptedMatch.structure.adSetName}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="p-3">
                        <MatchReasoningTooltip match={acceptedMatch} />
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground">{acceptedMatch.structure.platform} • {acceptedMatch.structure.campaignName}</p>
                  <MatchedElementsBadges match={acceptedMatch} />
                </div>
                <MatchConfidenceIndicator score={acceptedMatch.confidenceScore} size="sm" />
                <Button size="sm" variant="ghost" onClick={() => onClearRejection(acceptedMatch.structure.id)}>
                  <RotateCcw className="h-4 w-4 mr-1" />Change
                </Button>
              </div>
            </div>
          )}

          {!hasMatches && (
            <div className="flex items-center gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium text-sm">No matching structures found</p>
                <p className="text-xs text-muted-foreground">{result.noMatchReasons?.[0] || 'This asset does not match any existing campaign structures'}</p>
              </div>
            </div>
          )}

          {hasMatches && result.matches.length > 1 && !isAccepted && (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span>{result.matches.length - 1} other match{result.matches.length > 2 ? 'es' : ''}</span>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 mt-2">
                {displayedMatches.slice(1).map((match, idx) => {
                  const isRejected = rejectedStructureIds.has(match.structure.id);
                  return (
                    <div key={idx} className={cn('p-2 rounded border', isRejected ? 'opacity-50 bg-muted/30' : 'bg-background')}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{match.structure.adSetName}</p>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-4 w-4 p-0">
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="p-3">
                                <MatchReasoningTooltip match={match} />
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <p className="text-xs text-muted-foreground">{match.structure.platform} • {match.structure.market}</p>
                          <MatchedElementsBadges match={match} />
                        </div>
                        <MatchConfidenceIndicator score={match.confidenceScore} size="sm" />
                        {isRejected ? (
                          <Button size="sm" variant="ghost" onClick={() => onClearRejection(match.structure.id)}><RotateCcw className="h-4 w-4" /></Button>
                        ) : (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => onAccept(match)}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => onReject(match.structure.id)}><X className="h-4 w-4" /></Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
