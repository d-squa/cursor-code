import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Facebook } from "lucide-react";

interface AdAccountSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Array<{ id: string; name: string }>;
  onConfirm: (selectedIds: string[]) => void;
}

export default function AdAccountSelectionDialog({
  open,
  onOpenChange,
  accounts,
  onConfirm,
}: AdAccountSelectionDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleAccount = (accountId: string) => {
    setSelectedIds((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === accounts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(accounts.map((acc) => acc.id));
    }
  };

  const handleConfirm = () => {
    if (selectedIds.length === 0) {
      return;
    }
    onConfirm(selectedIds);
    setSelectedIds([]);
  };

  const handleCancel = () => {
    setSelectedIds([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Facebook className="h-5 w-5 text-blue-600" />
            <DialogTitle>Select Ad Accounts to Sync</DialogTitle>
          </div>
          <DialogDescription>
            Choose which Meta ad accounts you want to sync to your workspace
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 border-b">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={selectedIds.length === accounts.length}
              onCheckedChange={toggleAll}
            />
            <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
              Select All ({accounts.length} accounts)
            </label>
          </div>
          <Badge variant="secondary">{selectedIds.length} selected</Badge>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => toggleAccount(account.id)}
            >
              <Checkbox
                checked={selectedIds.includes(account.id)}
                onCheckedChange={() => toggleAccount(account.id)}
              />
              <div className="flex-1">
                <p className="font-medium">{account.name}</p>
                <p className="text-xs text-muted-foreground">ID: {account.id}</p>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedIds.length === 0}>
            Sync {selectedIds.length > 0 ? `${selectedIds.length} ` : ""}Account
            {selectedIds.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
