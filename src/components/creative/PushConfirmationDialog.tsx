// Confirmation dialog for push operations (ads to page, campaign to DSP)
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Upload, Rocket, AlertTriangle } from 'lucide-react';

interface PageInfo {
  pageId: string;
  pageName: string;
  pictureUrl?: string;
  platform: 'meta' | 'tiktok';
}

interface PushConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  type: 'ads' | 'campaign';
  adCount?: number;
  campaignCount?: number;
  pages?: PageInfo[];
  isLoading?: boolean;
}

export function PushConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  type,
  adCount = 0,
  campaignCount = 0,
  pages = [],
  isLoading = false,
}: PushConfirmationDialogProps) {
  const title = type === 'ads' 
    ? 'Push Creatives to DSP?' 
    : 'Push Campaign Shell to DSP?';
  
  const description = type === 'ads'
    ? `You are about to push ${adCount} ad(s) to the following page(s). This will upload your creatives to the platform's ad libraries.`
    : `You are about to push ${campaignCount} campaign(s) to the DSP. This will create campaign shells in PAUSED/DISABLED status.`;

  const icon = type === 'ads' ? Upload : Rocket;
  const Icon = icon;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {type === 'ads' && pages.length > 0 && (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-foreground">Target Pages/Identities:</p>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {pages.map((page, idx) => (
                <div 
                  key={`${page.platform}-${page.pageId}-${idx}`}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={page.pictureUrl} alt={page.pageName} />
                    <AvatarFallback className={page.platform === 'meta' ? 'bg-blue-600 text-white' : 'bg-black text-white'}>
                      {page.pageName?.charAt(0) || (page.platform === 'meta' ? 'F' : 'T')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{page.pageName || page.pageId}</p>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {page.platform === 'meta' ? 'Facebook/Instagram' : 'TikTok'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {type === 'campaign' && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Campaigns will be created in PAUSED status. You can activate them from the DSP dashboard.
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Pushing...' : 'Proceed'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
