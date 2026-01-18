import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { TikTokSyncProgress } from "@/hooks/useTikTokSyncProgress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: TikTokSyncProgress | null;
  onComplete?: () => void;
}

export default function TikTokSyncProgressDialog({ open, onOpenChange, progress, onComplete }: Props) {
  const percentage = progress 
    ? Math.round((progress.processedAdvertisers / Math.max(progress.totalAdvertisers, 1)) * 100)
    : 0;

  const isComplete = progress?.status === 'completed';
  const isError = progress?.status === 'error';
  const isSyncing = progress?.status === 'syncing' || progress?.status === 'pending';

  const handleClose = () => {
    if (isComplete && onComplete) {
      onComplete();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={isSyncing ? undefined : onOpenChange}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => isSyncing && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSyncing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {isComplete && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {isError && <AlertCircle className="h-5 w-5 text-destructive" />}
            {isSyncing ? "Syncing TikTok Accounts" : isComplete ? "Sync Complete" : "Sync Failed"}
          </DialogTitle>
          <DialogDescription>
            {isSyncing && "Please wait while we fetch your advertiser accounts. This may take a moment if you have many accounts."}
            {isComplete && `Successfully synced ${progress?.processedAdvertisers} advertiser account(s).`}
            {isError && "There was a problem syncing your accounts."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isSyncing && (
            <>
              <Progress value={percentage} className="h-3" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {progress?.processedAdvertisers ?? 0} of {progress?.totalAdvertisers ?? '?'} accounts
                </span>
                <span>{percentage}%</span>
              </div>
              {progress?.currentAdvertiserName && (
                <p className="text-sm text-muted-foreground">
                  Processing: <span className="font-medium">{progress.currentAdvertiserName}</span>
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
                {isComplete ? "Continue to Select Accounts" : "Close"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
