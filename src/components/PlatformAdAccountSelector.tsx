import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useEffect, useMemo, useState, useRef } from "react";
import { AlertCircle, Info } from "lucide-react";
import { useAdAccountLimits, AD_ACCOUNT_LIMITS, SWAP_LIMITS } from "@/hooks/useAdAccountLimits";
import AdAccountUpgradeModal from "@/components/AdAccountUpgradeModal";

interface AdAccount {
  id: string;
  name: string;
  business_center?: {
    bc_id: string;
    name: string;
    role?: string;
    status?: string;
  } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adAccounts: AdAccount[];
  onSelect: (accounts: AdAccount[]) => void;
  loading?: boolean;
  platformType?: string;
  existingAccountIds?: string[];
  teamId?: string | null;
}

export default function PlatformAdAccountSelector({ 
  open, 
  onOpenChange, 
  adAccounts, 
  onSelect, 
  loading, 
  platformType = 'meta',
  existingAccountIds = [],
  teamId = null,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeModalProps, setUpgradeModalProps] = useState<{
    limitType: 'account_limit' | 'swap_limit' | 'no_multiple_accounts';
    currentCount?: number;
    swapsUsed?: number;
  }>({ limitType: 'account_limit' });

  // IMPORTANT: limits must be scoped to the active workspace (team)
  const adAccountLimits = useAdAccountLimits(teamId);
  const platform = (platformType === 'meta' || platformType === 'tiktok') ? platformType : 'meta';
  const platformLimits = adAccountLimits[platform];

  const platformName = platformType === 'tiktok' ? 'TikTok' : platformType === 'google' ? 'Google Ads' : 'Meta';
  const accountLabel = platformType === 'tiktok' ? 'advertiser account' : platformType === 'google' ? 'customer account' : 'ad account';

  const maxSelectable = platformLimits.maxAllowed;

  // Calculate how many *additional* accounts can be added without replacing existing ones
  const maxNewAccounts = useMemo(() => {
    const remaining = maxSelectable - platformLimits.currentCount;
    return Math.max(0, remaining);
  }, [maxSelectable, platformLimits.currentCount]);

  const isSingleAccountPlan = maxSelectable === 1;

  const swapsRemaining = useMemo(() => {
    if (platformLimits.swapsAllowed === Infinity) return Infinity;
    return Math.max(0, platformLimits.swapsAllowed - platformLimits.swapsUsed);
  }, [platformLimits.swapsAllowed, platformLimits.swapsUsed]);

  // Check which accounts are already linked (reconnect case)
  const reconnectAccountIds = useMemo(() => {
    return new Set(adAccounts.filter(acc => existingAccountIds.includes(acc.id)).map(acc => acc.id));
  }, [adAccounts, existingAccountIds]);

  // New accounts that would count against the limit
  const newAccountsSelected = useMemo(() => {
    return Array.from(selectedIds).filter(id => !reconnectAccountIds.has(id));
  }, [selectedIds, reconnectAccountIds]);

  // Track if dialog just opened (false -> true transition)
  const wasOpenRef = useRef(false);

  // When dialog opens, select reconnecting accounts by default
  // IMPORTANT: Only initialize state on the open transition, not on prop changes while open
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    
    if (!justOpened) return;
    
    // Start with reconnecting accounts pre-selected
    const defaultSelected = new Set<string>();
    adAccounts.forEach(acc => {
      if (existingAccountIds.includes(acc.id)) {
        defaultSelected.add(acc.id);
      }
    });
    
    // If no existing accounts, and we can add accounts, select first one
    if (defaultSelected.size === 0 && maxNewAccounts > 0 && adAccounts.length > 0) {
      // Don't auto-select for trial/basic tiers if they already have an account
      if (platformLimits.currentCount === 0) {
        defaultSelected.add(adAccounts[0].id);
      }
    }
    
    setSelectedIds(defaultSelected);
  }, [open, adAccounts, existingAccountIds, maxNewAccounts, platformLimits.currentCount]);

  const handleToggle = (id: string, checked: boolean) => {
    const isReconnect = reconnectAccountIds.has(id);

    if (checked) {
      // Single-account tiers behave like a radio group: selecting a new account replaces the old one.
      if (isSingleAccountPlan) {
        const isSwitching = selectedIds.size > 0 && !selectedIds.has(id);
        const wouldConsumeSwap =
          isSwitching && platformLimits.currentCount >= maxSelectable && !isReconnect;

        if (wouldConsumeSwap && !platformLimits.canSwap) {
          setUpgradeModalProps({
            limitType: 'swap_limit',
            swapsUsed: platformLimits.swapsUsed,
          });
          setUpgradeModalOpen(true);
          return;
        }

        setSelectedIds(new Set([id]));
        return;
      }

      // Multi-account tiers: enforce the max selectable accounts.
      if (selectedIds.size >= maxSelectable) {
        setUpgradeModalProps({
          limitType: 'account_limit',
          currentCount: platformLimits.currentCount,
        });
        setUpgradeModalOpen(true);
        return;
      }

      setSelectedIds((prev) => new Set([...prev, id]));
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    const reconnects = Array.from(reconnectAccountIds);
    const nonReconnects = adAccounts
      .filter((acc) => !reconnectAccountIds.has(acc.id))
      .map((acc) => acc.id);

    // Always include reconnects, then add accounts up to the overall selection limit
    const availableSlots = Math.max(0, maxSelectable - reconnects.length);
    const newSelections = nonReconnects.slice(0, availableSlots);
    setSelectedIds(new Set([...reconnects, ...newSelections]));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const selectedAccounts = useMemo(
    () => adAccounts.filter((a) => selectedIds.has(a.id)),
    [adAccounts, selectedIds]
  );

  const handleConfirm = () => {
    onSelect(selectedAccounts);
  };

  const selectionAtLimit = selectedIds.size >= maxSelectable;
  const showLimitWarning = !isSingleAccountPlan && selectionAtLimit && maxSelectable > 0;
  const showNoMultipleWarning = isSingleAccountPlan && platformLimits.currentCount > 0;
  const showSwapLimitReached = showNoMultipleWarning && !platformLimits.canSwap;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select {platformName} {accountLabel === 'ad account' ? 'Ad Accounts' : 'Advertiser Accounts'}</DialogTitle>
            <DialogDescription>
              We found {adAccounts.length} {accountLabel}{adAccounts.length !== 1 ? "s" : ""}. 
              {maxNewAccounts > 0 ? (
                <> You can link up to {maxNewAccounts} more account{maxNewAccounts !== 1 ? 's' : ''}.</>
              ) : platformLimits.currentCount === 0 ? (
                <> Choose which one to sync.</>
              ) : (
                <> You've reached your account limit.</>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Limit info badge */}
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="gap-1">
              <Info className="h-3 w-3" />
              {platformLimits.currentCount} / {platformLimits.maxAllowed} accounts used
            </Badge>
            <Badge variant="outline" className="gap-1">
              {platformLimits.swapsUsed} / {platformLimits.swapsAllowed === Infinity ? '∞' : platformLimits.swapsAllowed} swaps this period
            </Badge>
          </div>

           {showNoMultipleWarning && (
             <Alert variant={showSwapLimitReached ? "destructive" : undefined}>
               {showSwapLimitReached ? (
                 <AlertCircle className="h-4 w-4" />
               ) : (
                 <Info className="h-4 w-4" />
               )}
               <AlertDescription>
                 {showSwapLimitReached ? (
                   <>
                     You’ve used all your swaps for this billing period. You can’t switch to a new {accountLabel} until it resets
                     or you upgrade.
                   </>
                 ) : (
                   <>
                     Your plan allows <strong>{maxSelectable}</strong> {accountLabel} at a time. Select a different {accountLabel} to swap
                     (uses 1 swap). Upgrade to link multiple accounts.
                   </>
                 )}
               </AlertDescription>
             </Alert>
           )}

           {showLimitWarning && (
             <Alert>
               <Info className="h-4 w-4" />
               <AlertDescription>
                 You can select up to {maxSelectable} account{maxSelectable !== 1 ? "s" : ""}. Deselect one to choose another.
               </AlertDescription>
             </Alert>
           )}

          <div className="flex items-center justify-between pb-2">
            <div className="text-sm text-muted-foreground">
              {selectedAccounts.length === 0 ? "No accounts selected" : `${selectedAccounts.length} selected (${newAccountsSelected.length} new)`}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleDeselectAll} disabled={loading || selectedIds.size === 0}>
                Deselect all
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSelectAll} disabled={loading}>
                Select all
              </Button>
            </div>
          </div>

          <ScrollArea className="max-h-[300px] pr-4">
            <div className="space-y-2">
              {adAccounts.map((acc) => {
                const isReconnect = reconnectAccountIds.has(acc.id);
                const isSelected = selectedIds.has(acc.id);

                const wouldExceedSelectionLimit =
                  !isSingleAccountPlan && !isSelected && selectedIds.size >= maxSelectable;

                const swapSelectionLocked =
                  isSingleAccountPlan &&
                  !isSelected &&
                  platformLimits.currentCount >= maxSelectable &&
                  !isReconnect &&
                  !platformLimits.canSwap;

                const rowMuted = swapSelectionLocked || wouldExceedSelectionLimit;

                return (
                  <label 
                    key={acc.id} 
                    className={`flex items-start space-x-3 p-3 rounded-lg border bg-card transition-colors
                      ${rowMuted ? 'opacity-50' : 'hover:bg-muted/50'}
                      ${swapSelectionLocked ? 'cursor-not-allowed' : 'cursor-pointer'}
                      ${isReconnect ? 'border-primary/30 bg-primary/5' : ''}
                    `}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(val) => handleToggle(acc.id, Boolean(val))}
                      disabled={loading || swapSelectionLocked}
                    />
                    <div className="flex-1 text-sm space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{acc.name}</span>
                        {isReconnect && (
                          <Badge variant="secondary" className="text-xs">Reconnect</Badge>
                        )}
                      </div>
                      {acc.business_center?.name && (
                        <div className="text-xs text-muted-foreground">
                          Business Center: {acc.business_center.name}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">{acc.id}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!!loading || selectedAccounts.length === 0}>
              {loading ? "Syncing..." : `Confirm & Sync ${selectedAccounts.length || "Selected"}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AdAccountUpgradeModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        limitType={upgradeModalProps.limitType}
        currentTier={adAccountLimits.tier}
        platform={platform}
        currentCount={upgradeModalProps.currentCount}
        swapsUsed={upgradeModalProps.swapsUsed}
      />
    </>
  );
}
