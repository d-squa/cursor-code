import { useState } from "react";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BugReportDialog } from "./BugReportDialog";
import { useAuth } from "@/hooks/useAuth";

export const BugReportButton = () => {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Only show for authenticated users
  if (!user) return null;

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        className="fixed bottom-6 left-6 h-14 w-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90"
        size="icon"
        title="Report a Bug"
      >
        <Bug className="h-6 w-6" />
      </Button>
      
      <BugReportDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
};
