// Panel showing why a match was suggested
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UICreativeMatch } from '@/hooks/useCreativeMatching';

interface MatchReasoningPanelProps {
  match: UICreativeMatch;
  className?: string;
}

export function MatchReasoningPanel({ match, className }: MatchReasoningPanelProps) {
  const { structure, confidenceScore, reasoning, compatibilityIssues, hardConstraintsMet } = match;

  const errors = compatibilityIssues.filter(i => i.severity === 'error');
  const warnings = compatibilityIssues.filter(i => i.severity === 'warning');

  return (
    <div className={cn('space-y-4 p-4 bg-muted/30 rounded-lg', className)}>
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium">{structure.adSetName}</h4>
          <p className="text-sm text-muted-foreground">{structure.campaignName} → {structure.platform}</p>
        </div>
        <Badge variant={confidenceScore >= 80 ? 'default' : confidenceScore >= 60 ? 'secondary' : 'outline'}>
          {Math.round(confidenceScore)}% match
        </Badge>
      </div>

      <div className="space-y-2">
        <h5 className="text-sm font-medium flex items-center gap-2">
          {hardConstraintsMet ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
          Hard Constraints
        </h5>
        <div className="flex flex-wrap gap-2">
          {structure.market && <Badge variant="outline" className="text-xs">Market: {structure.market}</Badge>}
          {structure.language && <Badge variant="outline" className="text-xs">Language: {structure.language}</Badge>}
          {structure.variant && <Badge variant="outline" className="text-xs">Variant: {structure.variant}</Badge>}
        </div>
      </div>

      {reasoning.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium flex items-center gap-2"><Info className="h-4 w-4 text-primary" />Match Reasoning</h5>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {reasoning.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {errors.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium flex items-center gap-2 text-destructive"><XCircle className="h-4 w-4" />Blocking Issues ({errors.length})</h5>
          <ul className="space-y-1">
            {errors.map((issue, idx) => (
              <li key={idx} className="text-sm text-destructive">
                <span className="font-medium capitalize">{issue.platform || issue.type}:</span> {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium flex items-center gap-2 text-amber-600"><AlertTriangle className="h-4 w-4" />Warnings ({warnings.length})</h5>
          <ul className="space-y-1">
            {warnings.map((issue, idx) => (
              <li key={idx} className="text-sm text-amber-600">
                <span className="font-medium capitalize">{issue.platform || issue.type}:</span> {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
