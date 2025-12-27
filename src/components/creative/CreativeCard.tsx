// Creative Card component with drag-drop support
import { useState, memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  MoreVertical, 
  Play, 
  Image as ImageIcon, 
  Copy, 
  Trash2, 
  Edit, 
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Clock,
  GripVertical,
} from 'lucide-react';
import type { Creative, CreativeStatus, Platform } from '@/types/creative';
import { cn } from '@/lib/utils';

interface CreativeCardProps {
  creative: Creative;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onEdit?: (creative: Creative) => void;
  onDuplicate?: (creative: Creative) => void;
  onDelete?: (id: string) => void;
  onDragStart?: (e: React.DragEvent, creative: Creative) => void;
  isDragging?: boolean;
  compact?: boolean;
}

const statusColors: Record<CreativeStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  ready: 'bg-green-500/20 text-green-700 dark:text-green-400',
  needs_review: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  error: 'bg-destructive/20 text-destructive',
  published: 'bg-primary/20 text-primary',
};

const statusIcons: Record<CreativeStatus, React.ReactNode> = {
  draft: <Clock className="h-3 w-3" />,
  ready: <CheckCircle className="h-3 w-3" />,
  needs_review: <AlertCircle className="h-3 w-3" />,
  error: <AlertCircle className="h-3 w-3" />,
  published: <CheckCircle className="h-3 w-3" />,
};

const platformColors: Record<Platform, string> = {
  meta: 'bg-blue-500',
  tiktok: 'bg-black',
  google: 'bg-red-500',
  linkedin: 'bg-blue-700',
  snapchat: 'bg-yellow-400',
  pinterest: 'bg-red-600',
  x: 'bg-gray-900',
};

export const CreativeCard = memo(function CreativeCard({
  creative,
  isSelected = false,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onDragStart,
  isDragging = false,
  compact = false,
}: CreativeCardProps) {
  const [imageError, setImageError] = useState(false);
  const thumbnailUrl = creative.thumbnailUrl || creative.mediaUrls?.[0];
  const isVideo = creative.creativeType === 'video' || creative.durationSeconds;

  return (
    <Card
      className={cn(
        'group relative transition-all duration-200 cursor-pointer hover:shadow-lg',
        isSelected && 'ring-2 ring-primary',
        isDragging && 'opacity-50 scale-95',
        !creative.isValid && 'border-destructive/50'
      )}
      draggable={!!onDragStart}
      onDragStart={(e) => onDragStart?.(e, creative)}
    >
      {/* Drag Handle */}
      {onDragStart && (
        <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Selection Checkbox */}
      {onSelect && (
        <div className="absolute top-2 right-2 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect(creative.id, !!checked)}
            className="bg-background/80 backdrop-blur"
          />
        </div>
      )}

      {/* Thumbnail */}
      <div className={cn(
        'relative overflow-hidden rounded-t-lg bg-muted',
        compact ? 'aspect-square' : 'aspect-video'
      )}>
        {thumbnailUrl && !imageError ? (
          <>
            <img
              src={thumbnailUrl}
              alt={creative.name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
              loading="lazy"
            />
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="h-10 w-10 text-white" fill="white" />
              </div>
            )}
            {creative.durationSeconds && (
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                {Math.floor(creative.durationSeconds / 60)}:{String(creative.durationSeconds % 60).padStart(2, '0')}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground" />
          </div>
        )}

        {/* Platform Badge */}
        <div className={cn(
          'absolute top-2 left-8 px-2 py-0.5 text-xs font-medium text-white rounded',
          platformColors[creative.platform]
        )}>
          {creative.platform}
        </div>
      </div>

      <CardContent className={cn('p-3', compact && 'p-2')}>
        {/* Name & Status */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="font-medium text-sm line-clamp-1 flex-1" title={creative.name}>
            {creative.name}
          </h4>
          <Badge variant="secondary" className={cn('text-xs shrink-0', statusColors[creative.status])}>
            {statusIcons[creative.status]}
            <span className="ml-1 capitalize">{creative.status.replace('_', ' ')}</span>
          </Badge>
        </div>

        {/* Mapping Info */}
        {!compact && (
          <div className="flex flex-wrap gap-1 mb-2">
            {creative.market && (
              <Badge variant="outline" className="text-xs">
                {creative.market}
              </Badge>
            )}
            {creative.phaseName && (
              <Badge variant="outline" className="text-xs">
                {creative.phaseName}
              </Badge>
            )}
            {creative.optimizationGoal && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs max-w-[80px] truncate">
                      {creative.optimizationGoal}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{creative.optimizationGoal}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}

        {/* Dimensions */}
        {creative.width && creative.height && !compact && (
          <p className="text-xs text-muted-foreground mb-2">
            {creative.width} × {creative.height}
            {creative.aspectRatio && ` (${creative.aspectRatio})`}
          </p>
        )}

        {/* Validation Errors */}
        {!creative.isValid && creative.validationErrors.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="w-full">
                <div className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  <span>{creative.validationErrors.length} issue(s)</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[250px]">
                <ul className="text-xs space-y-1">
                  {creative.validationErrors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t">
          <div className="flex gap-1">
            {creative.destinationUrl && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(creative.destinationUrl, '_blank');
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open destination URL</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(creative)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={() => onDuplicate(creative)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => onDelete(creative.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
});
