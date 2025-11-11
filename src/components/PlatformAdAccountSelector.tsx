import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";

interface AdAccount {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adAccounts: AdAccount[];
  onSelect: (account: AdAccount) => void;
  loading?: boolean;
}

export default function PlatformAdAccountSelector({ open, onOpenChange, adAccounts, onSelect, loading }: Props) {
  const [selectedId, setSelectedId] = useState<string>("");

  const selectedAccount = useMemo(() => adAccounts.find(a => a.id === selectedId) || null, [adAccounts, selectedId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select an Ad Account</DialogTitle>
          <DialogDescription>
            Choose the exact ad account you want to link to this platform connection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger aria-label="Select ad account">
                <SelectValue placeholder="Select an ad account" />
              </SelectTrigger>
              <SelectContent>
                {adAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name} • {acc.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedAccount && onSelect(selectedAccount)}
              disabled={!selectedAccount || !!loading}
            >
              {loading ? "Linking..." : "Link Ad Account"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
