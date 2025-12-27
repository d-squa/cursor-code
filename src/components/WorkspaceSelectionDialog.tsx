import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Workspace } from "@/hooks/useWorkspace";

interface WorkspaceSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  onConfirm: (workspaceId: string) => void;
  title?: string;
  description?: string;
}

export function WorkspaceSelectionDialog({ 
  open, 
  onOpenChange, 
  workspaces,
  currentWorkspaceId,
  onConfirm,
  title = "Select Workspace",
  description = "Choose which workspace to place this item in"
}: WorkspaceSelectionDialogProps) {
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>(currentWorkspaceId || "");

  const handleConfirm = () => {
    if (selectedWorkspace) {
      onConfirm(selectedWorkspace);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Workspace</Label>
            <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
              <SelectTrigger>
                <SelectValue placeholder="Select a workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
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
          <Button onClick={handleConfirm} disabled={!selectedWorkspace}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
