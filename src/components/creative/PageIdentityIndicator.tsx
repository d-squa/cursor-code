// Small page/identity indicator with icon and tooltip
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PageIdentityIndicatorProps {
  platform: 'meta' | 'tiktok' | string;
  pageName?: string;
  pageId?: string;
  pictureUrl?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function PageIdentityIndicator({
  platform,
  pageName,
  pageId,
  pictureUrl,
  className,
  size = 'sm',
}: PageIdentityIndicatorProps) {
  const isMeta = platform.toLowerCase().includes('meta');
  const displayName = pageName || pageId || (isMeta ? 'Facebook Page' : 'TikTok Identity');
  
  const sizeClass = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  if (!pageId && !pageName) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar className={cn(sizeClass, 'cursor-help shrink-0', className)}>
            <AvatarImage src={pictureUrl} alt={displayName} />
            <AvatarFallback 
              className={cn(
                textSize,
                isMeta ? 'bg-blue-600 text-white' : 'bg-black text-white'
              )}
            >
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <div className="space-y-1">
            <p className="font-medium text-xs">{displayName}</p>
            <p className="text-xs text-muted-foreground">
              {isMeta ? 'Facebook/Instagram Page' : 'TikTok Identity'}
            </p>
            {pageId && <p className="text-[10px] text-muted-foreground font-mono">ID: {pageId}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
