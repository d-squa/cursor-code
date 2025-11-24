import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useMemo, useState } from "react";

interface AdAccount {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adAccounts: AdAccount[];
  onSelect: (accounts: AdAccount[]) => void;
  loading?: boolean;
  platformType?: string;
}

export default function PlatformAdAccountSelector({ open, onOpenChange, adAccounts, onSelect, loading, platformType = 'meta' }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const platformName = platformType === 'tiktok' ? 'TikTok' : 'Meta';
  const accountLabel = platformType === 'tiktok' ? 'advertiser account' : 'ad account';

  // When dialog opens or accounts change, default to selecting all for convenience
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(adAccounts.map((a) => a.id)));
    }
  }, [open, adAccounts]);

  const allSelected = adAccounts.length > 0 && selectedIds.size === adAccounts.length;

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(adAccounts.map((a) => a.id)));
    }
  };

  const handleToggle = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const selectedAccounts = useMemo(
    () => adAccounts.filter((a) => selectedIds.has(a.id)),
    [adAccounts, selectedIds]
  );

  const handleConfirm = () => {
    onSelect(selectedAccounts);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select {platformName} {accountLabel === 'ad account' ? 'Ad Accounts' : 'Advertiser Accounts'}</DialogTitle>
          <DialogDescription>
            We found {adAccounts.length} {accountLabel}{adAccounts.length !== 1 ? "s" : ""}. Choose which ones to sync. Selected: {selectedAccounts.length}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between pb-2">
          <div className="text-sm text-muted-foreground">
            {allSelected ? "All accounts selected" : selectedAccounts.length === 0 ? "No accounts selected" : `${selectedAccounts.length} selected`}
          </div>
          <Button variant="ghost" size="sm" onClick={handleToggleAll} disabled={loading}>
            {allSelected ? "Deselect all" : "Select all"}
          </Button>
        </div>

        <ScrollArea className="max-h-[300px] pr-4">
          <div className="space-y-2">
            {adAccounts.map((acc) => (
              <label key={acc.id} className="flex items-start space-x-3 p-3 rounded-lg border bg-card cursor-pointer">
                <Checkbox
                  checked={selectedIds.has(acc.id)}
                  onCheckedChange={(val) => handleToggle(acc.id, Boolean(val))}
                  disabled={loading}
                />
                <div className="flex-1 text-sm space-y-1">
                  <div className="font-medium">{acc.name}</div>
                  <div className="text-xs text-muted-foreground">{acc.id}</div>
                </div>
              </label>
            ))}
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
  );
}
