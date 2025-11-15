import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { MARKET_OPTIONS } from "@/utils/markets";

interface MarketSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (marketValue: string, marketLabel: string) => void;
}

export function MarketSelectionDialog({ 
  open, 
  onOpenChange, 
  onConfirm 
}: MarketSelectionDialogProps) {
  const [selectedMarket, setSelectedMarket] = useState<string>("");

  const handleConfirm = () => {
    if (selectedMarket) {
      const market = MARKET_OPTIONS.find(m => m.value === selectedMarket);
      if (market) {
        onConfirm(market.value, market.label);
        setSelectedMarket("");
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Market for Duplicate</DialogTitle>
          <DialogDescription>
            Choose which market to assign to the duplicated configuration
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Market</Label>
            <Select value={selectedMarket} onValueChange={setSelectedMarket}>
              <SelectTrigger>
                <SelectValue placeholder="Select a market" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {MARKET_OPTIONS.map((market) => (
                  <SelectItem key={market.value} value={market.value}>
                    {market.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedMarket}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
