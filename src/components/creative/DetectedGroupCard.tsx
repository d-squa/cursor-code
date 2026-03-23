// Inline card for a detected creative group (carousel or asset customization)
// Shows thumbnails, reason, and approve/reject actions

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Layers, LayoutGrid, Image as ImageIcon, Video, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DetectedGroup } from '@/utils/creativeProcessingDetection';

interface DetectedGroupCardProps {
  group: DetectedGroup;
  status: 'pending' | 'approved' | 'rejected';
  onApprove: (groupId: string) => void;
  onReject: (groupId: string) => void;
}

export function DetectedGroupCard({ group, status, onApprove, onReject }: DetectedGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isCarousel = group.type === 'carousel';

  return (
    <Card className={cn(
      'transition-all',
      status === 'approved' && 'ring-2 ring-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/20',
      status === 'rejected' && 'opacity-50 bg-muted/30',
    )}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={cn(
            'p-2 rounded-lg',
            isCarousel ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'
          )}>
            {isCarousel ? (
              <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <LayoutGrid className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={cn(
                'text-xs',
                isCarousel ? 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300'
                  : 'border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300'
              )}>
                {isCarousel ? 'Carousel' : 'Asset Customization'}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {group.assets.length} assets
              </Badge>
              {status !== 'pending' && (
                <Badge variant={status === 'approved' ? 'default' : 'destructive'} className="text-xs">
                  {status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                </Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground">{group.reason}</p>

            {/* Thumbnail preview strip */}
            <div className="flex gap-1 mt-2 overflow-x-auto">
              {group.assets.slice(0, expanded ? undefined : 5).map((asset) => (
                <div 
                  key={asset.id}
                  className="w-10 h-10 rounded border bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden"
                  title={asset.name}
                >
                  {asset.assetType === 'video' ? (
                    <Video className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              ))}
              {!expanded && group.assets.length > 5 && (
                <button
                  onClick={() => setExpanded(true)}
                  className="w-10 h-10 rounded border bg-muted flex-shrink-0 flex items-center justify-center text-xs text-muted-foreground hover:bg-accent"
                >
                  +{group.assets.length - 5}
                </button>
              )}
            </div>

            {/* Expanded asset list */}
            {expanded && (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {group.assets.map((asset, i) => (
                  <div key={asset.id} className="flex items-center gap-2">
                    <span className="text-foreground font-mono">{i + 1}.</span>
                    <span className="truncate">{asset.name}</span>
                    {asset.width && asset.height && (
                      <span className="text-muted-foreground flex-shrink-0">
                        {asset.width}×{asset.height}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {group.assets.length > 2 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? 'Collapse' : `Show all ${group.assets.length} assets`}
              </button>
            )}
          </div>

          {/* Actions */}
          {status === 'pending' && (
            <div className="flex gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                onClick={() => onApprove(group.id)}
              >
                <Check className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onReject(group.id)}
              >
                <X className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </div>
          )}

          {status !== 'pending' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => status === 'approved' ? onReject(group.id) : onApprove(group.id)}
            >
              {status === 'approved' ? 'Undo' : 'Approve'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
