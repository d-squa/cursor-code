import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileText, FileX } from "lucide-react";

export type ApplyMode = 'all' | 'blanks';

interface ApplyModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mode: ApplyMode) => void;
  groupLabel: string;
  itemCount: number;
  filledCount: number;
}

export function ApplyModeDialog({
  open,
  onOpenChange,
  onConfirm,
  groupLabel,
  itemCount,
  filledCount,
}: ApplyModeDialogProps) {
  const blankCount = itemCount - filledCount;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apply to "{groupLabel}"</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Some creatives already have values filled in. How would you like to apply the pasted data?
            </p>
            <div className="flex gap-4 text-sm mt-3">
              <span className="text-muted-foreground">
                Total: <strong className="text-foreground">{itemCount}</strong>
              </span>
              <span className="text-muted-foreground">
                Filled: <strong className="text-foreground">{filledCount}</strong>
              </span>
              <span className="text-muted-foreground">
                Blank: <strong className="text-foreground">{blankCount}</strong>
              </span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="outline"
            onClick={() => {
              onConfirm('blanks');
              onOpenChange(false);
            }}
            className="gap-2"
          >
            <FileX className="h-4 w-4" />
            Only blank fields ({blankCount})
          </Button>
          <Button
            onClick={() => {
              onConfirm('all');
              onOpenChange(false);
            }}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            All creatives ({itemCount})
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}