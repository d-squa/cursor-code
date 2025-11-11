import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

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
}

export default function PlatformAdAccountSelector({ open, onOpenChange, adAccounts, onSelect, loading }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleAccount = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleConfirm = () => {
    const selected = adAccounts.filter(acc => selectedIds.has(acc.id));
    onSelect(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Ad Accounts</DialogTitle>
          <DialogDescription>
            Choose one or more ad accounts you want to link to this platform connection.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-3">
            {adAccounts.map((acc) => (
              <div key={acc.id} className="flex items-start space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <Checkbox
                  id={acc.id}
                  checked={selectedIds.has(acc.id)}
                  onCheckedChange={() => toggleAccount(acc.id)}
                />
                <label htmlFor={acc.id} className="flex-1 cursor-pointer text-sm leading-none space-y-1">
                  <div className="font-medium">{acc.name}</div>
                  <div className="text-xs text-muted-foreground">{acc.id}</div>
                </label>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-between items-center pt-4">
          <div className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0 || !!loading}
            >
              {loading ? "Linking..." : `Link ${selectedIds.size} Account${selectedIds.size !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
