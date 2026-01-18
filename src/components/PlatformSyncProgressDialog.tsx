import { useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { PlatformSyncProgress } from "@/hooks/useTikTokSyncProgress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: PlatformSyncProgress | null;
  onComplete?: () => void;
}

// Friendly names for asset types
const ASSET_TYPE_LABELS: Record<string, string> = {
  'ad_accounts': 'Ad Accounts',
  'advertisers': 'Advertisers',
  'business_centers': 'Business Centers',
  'pixels': 'Pixels',
  'pages': 'Pages',
  'instagram_accounts': 'Instagram Accounts',
  'catalogs': 'Catalogs',
  'product_sets': 'Product Sets',
  'conversion_events': 'Conversion Events',
  'identities': 'Identities',
};

export default function PlatformSyncProgressDialog({ open, onOpenChange, progress, onComplete }: Props) {
  const percentage = progress 
    ? Math.round((progress.currentStep / Math.max(progress.totalSteps, 1)) * 100)
    : 0;

  const isComplete = progress?.status === 'completed';
  const isError = progress?.status === 'error';
  const isSyncing = progress?.status === 'syncing' || progress?.status === 'pending';

  // Auto-trigger onComplete when sync finishes
  useEffect(() => {
    if (isComplete && onComplete) {
      // Small delay to let UI update before transitioning
      const timer = setTimeout(() => {
        onComplete();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onComplete]);

  const platformName = progress?.platform === 'meta' ? 'Meta' : 'TikTok';
  const assetTypeLabel = progress?.currentAssetType 
    ? ASSET_TYPE_LABELS[progress.currentAssetType] || progress.currentAssetType
    : null;

  const handleClose = () => {
    if (isComplete && onComplete) {
      onComplete();
    }
    onOpenChange(false);
  };

  // Build summary of synced items
  const getSyncedSummary = () => {
    if (!progress?.processedCounts) return null;
    const counts = progress.processedCounts;
    const parts: string[] = [];
    
    if (counts.adAccounts) parts.push(`${counts.adAccounts} ad account${counts.adAccounts !== 1 ? 's' : ''}`);
    if (counts.pixels) parts.push(`${counts.pixels} pixel${counts.pixels !== 1 ? 's' : ''}`);
    if (counts.pages) parts.push(`${counts.pages} page${counts.pages !== 1 ? 's' : ''}`);
    if (counts.instagramAccounts) parts.push(`${counts.instagramAccounts} Instagram account${counts.instagramAccounts !== 1 ? 's' : ''}`);
    if (counts.catalogs) parts.push(`${counts.catalogs} catalog${counts.catalogs !== 1 ? 's' : ''}`);
    if (counts.productSets) parts.push(`${counts.productSets} product set${counts.productSets !== 1 ? 's' : ''}`);
    if (counts.identities) parts.push(`${counts.identities} ${counts.identities !== 1 ? 'identities' : 'identity'}`);
    if (counts.conversionEvents) parts.push(`${counts.conversionEvents} conversion event${counts.conversionEvents !== 1 ? 's' : ''}`);
    
    return parts.length > 0 ? parts.join(', ') : null;
  };

  return (
    <Dialog open={open} onOpenChange={isSyncing ? undefined : onOpenChange}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => isSyncing && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSyncing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {isComplete && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {isError && <AlertCircle className="h-5 w-5 text-destructive" />}
            {isSyncing ? `Syncing ${platformName} Assets` : isComplete ? "Sync Complete" : "Sync Failed"}
          </DialogTitle>
          <DialogDescription>
            {isSyncing && "Please wait while we fetch your account assets. This may take a moment if you have many accounts."}
            {isComplete && (getSyncedSummary() ? `Successfully synced: ${getSyncedSummary()}.` : "Successfully synced your account assets.")}
            {isError && "There was a problem syncing your accounts."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isSyncing && (
            <>
              <Progress value={percentage} className="h-3" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  Step {progress?.currentStep ?? 0} of {progress?.totalSteps ?? '?'}
                </span>
                <span>{percentage}%</span>
              </div>
              {assetTypeLabel && (
                <p className="text-sm text-muted-foreground">
                  Syncing: <span className="font-medium">{assetTypeLabel}</span>
                  {progress?.currentAssetName && (
                    <span className="text-xs ml-1">({progress.currentAssetName})</span>
                  )}
                </p>
              )}
              <Alert>
                <AlertDescription className="text-sm">
                  You can close this page and come back later. The sync will continue in the background.
                </AlertDescription>
              </Alert>
            </>
          )}

          {isError && progress?.errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{progress.errorMessage}</AlertDescription>
            </Alert>
          )}

          {(isComplete || isError) && (
            <div className="flex justify-end">
              <Button onClick={handleClose}>
                {isComplete ? "Continue" : "Close"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
