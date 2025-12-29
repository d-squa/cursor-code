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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchConfidenceIndicator } from './MatchConfidenceIndicator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{result.bestMatch.structure.adSetName}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {result.bestMatch.structure.platform} • {result.bestMatch.structure.campaignName}
              </p>
            </div>
            <MatchConfidenceIndicator score={result.bestMatch.confidenceScore} size="sm" />
            <div className="flex gap-1">
              <Button size="sm" onClick={() => onAccept(result.bestMatch!)} className="bg-emerald-500 hover:bg-emerald-600">
                <Check className="h-4 w-4 mr-1" />Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => onReject(result.bestMatch!.structure.id)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {isAccepted && acceptedMatch && (
          <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-3">
            <Check className="h-5 w-5 text-emerald-500" />
            <div className="flex-1">
              <span className="font-medium text-sm">{acceptedMatch.structure.adSetName}</span>
              <p className="text-xs text-muted-foreground">{acceptedMatch.structure.platform} • {acceptedMatch.structure.campaignName}</p>
            </div>
            <MatchConfidenceIndicator score={acceptedMatch.confidenceScore} size="sm" />
            <Button size="sm" variant="ghost" onClick={() => onClearRejection(acceptedMatch.structure.id)}>
              <RotateCcw className="h-4 w-4 mr-1" />Change
            </Button>
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
                  <div key={idx} className={cn('flex items-center gap-3 p-2 rounded border', isRejected ? 'opacity-50 bg-muted/30' : 'bg-background')}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{match.structure.adSetName}</p>
                      <p className="text-xs text-muted-foreground">{match.structure.platform} • {match.structure.market}</p>
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
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
