import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle } from "lucide-react";

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
  const handleConfirm = () => {
    // Pass all accounts to trigger sync
    onSelect(adAccounts);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meta Connection Successful</DialogTitle>
          <DialogDescription>
            We found {adAccounts.length} ad account{adAccounts.length !== 1 ? 's' : ''} associated with your Meta account. Click confirm to sync all resources.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[300px] pr-4">
          <div className="space-y-2">
            {adAccounts.map((acc) => (
              <div key={acc.id} className="flex items-start space-x-3 p-3 rounded-lg border bg-card">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-sm space-y-1">
                  <div className="font-medium">{acc.name}</div>
                  <div className="text-xs text-muted-foreground">{acc.id}</div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!!loading}>
            {loading ? "Syncing..." : "Confirm & Sync Resources"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
