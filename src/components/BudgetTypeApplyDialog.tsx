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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetType: "daily" | "lifetime";
  onConfirm: () => void;
  onCustomize?: () => void;
}

export function BudgetTypeApplyDialog({ open, onOpenChange, budgetType, onConfirm, onCustomize }: Props) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCustomize = () => {
    onCustomize?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apply Budget Type to All?</AlertDialogTitle>
          <AlertDialogDescription>
            Would you like to apply <strong>{budgetType === "daily" ? "Daily Budget" : "Lifetime Budget"}</strong> to all phases across all campaigns?
            <br /><br />
            This will set the budget type for all phases that don't currently have one configured.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, just this phase</AlertDialogCancel>
          <AlertDialogAction onClick={handleCustomize}>Customize…</AlertDialogAction>
          <AlertDialogAction onClick={handleConfirm}>Yes, apply to all</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
