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
import { Upload, Rocket, AlertTriangle, Image, Video, Layers, Repeat } from 'lucide-react';

interface PageInfo {
  pageId: string;
  pageName: string;
  pictureUrl?: string;
  platform: 'meta' | 'tiktok';
  adAccountId?: string;
  adAccountName?: string;
}

interface AdSummary {
  total: number;
  dark: number;
  organic: number;
  carousel: number;
}

interface AdAccountInfo {
  platform: 'meta' | 'tiktok';
  accountId: string;
  accountName?: string;
}

interface PushConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  type: 'ads' | 'campaign';
  adCount?: number;
  campaignCount?: number;
  pages?: PageInfo[];
  accounts?: AdAccountInfo[];
  adSummary?: AdSummary;
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
  accounts = [],
  adSummary,
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
      <AlertDialogContent className="!max-w-2xl w-full">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {type === 'ads' && (
          <div className="space-y-4 py-2">
            {/* Ad Summary Stats */}
            {adSummary && adSummary.total > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Ad Summary:</p>
                <div className="flex flex-wrap gap-2">
                  {adSummary.dark > 0 && (
                    <Badge variant="secondary" className="flex items-center gap-1.5">
                      <Image className="h-3 w-3" />
                      {adSummary.dark} Dark Ad{adSummary.dark !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  {adSummary.organic > 0 && (
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="flex items-center gap-1.5 border-green-500/50 text-green-700 dark:text-green-400 w-fit">
                        <Repeat className="h-3 w-3" />
                        {adSummary.organic} Organic Post{adSummary.organic !== 1 ? 's' : ''}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Note: Organic posts with website traffic optimization require a landing page URL
                      </span>
                    </div>
                  )}
                  {adSummary.carousel > 0 && (
                    <Badge variant="secondary" className="flex items-center gap-1.5">
                      <Layers className="h-3 w-3" />
                      {adSummary.carousel} Carousel{adSummary.carousel !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Target Pages */}
            {pages.length > 0 && (
              <div className="space-y-2">
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
                        <p className="text-sm font-medium truncate">{page.pageName}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {page.platform === 'meta' ? 'Facebook/Instagram' : 'TikTok'}
                          </Badge>

                          {(page.adAccountName || page.adAccountId) && (
                            <span className="text-xs text-muted-foreground truncate">
                              {page.platform === 'meta' ? 'Ad account:' : 'Advertiser:'}{' '}
                              {page.adAccountName || 'Unknown'}
                              {page.adAccountId ? ` (${page.adAccountId})` : ''}
                            </span>
                          )}

                          {page.pageName !== page.pageId && (
                            <span className="text-xs text-muted-foreground truncate">
                              Page: {page.pageId.length > 12 ? `${page.pageId.slice(0, 6)}...${page.pageId.slice(-4)}` : page.pageId}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {type === 'campaign' && (
          <div className="space-y-4 py-2">
            {accounts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Target Ad Accounts:</p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {accounts.map((acc, idx) => (
                    <div
                      key={`${acc.platform}-${acc.accountId}-${idx}`}
                      className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={acc.platform === 'meta' ? 'bg-blue-600 text-white' : 'bg-black text-white'}>
                          {(acc.accountName || acc.accountId)?.charAt(0) || (acc.platform === 'meta' ? 'M' : 'T')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {acc.accountName || 'Unknown account'}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {acc.platform === 'meta' ? 'Meta' : 'TikTok'}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">
                            {acc.platform === 'meta' ? 'Ad account:' : 'Advertiser:'} {acc.accountId}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Campaigns will be created in PAUSED status. You can activate them from the DSP dashboard.
              </p>
            </div>
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
