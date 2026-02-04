import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { useState } from "react";

interface Platform {
  id: string;
  name: string;
}

interface PlatformSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availablePlatforms: Platform[];
  onConfirm: (platformId: string) => void;
}

export function PlatformSelectionDialog({ 
  open, 
  onOpenChange, 
  availablePlatforms, 
  onConfirm 
}: PlatformSelectionDialogProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>("");

  const handleConfirm = () => {
    if (selectedPlatform) {
      onConfirm(selectedPlatform);
      setSelectedPlatform("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Platform for Duplicate</DialogTitle>
          <DialogDescription>
            Choose which platform type to assign to the duplicated configuration
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Platform</Label>
            <Combobox
              options={availablePlatforms.map((platform) => ({
                value: platform.id,
                label: platform.name
              }))}
              value={selectedPlatform}
              onValueChange={setSelectedPlatform}
              placeholder="Select a platform"
              searchPlaceholder="Search platforms..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedPlatform}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
