import { useState } from "react";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BugReportDialog } from "./BugReportDialog";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";

export const BugReportButton = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Only show for authenticated users and not on public landing pages
  const publicRoutes = ["/", "/book-demo", "/book-demo/confirmation", "/terms", "/privacy", "/compare-plans"];
  const isPublicRoute = publicRoutes.includes(location.pathname);
  
  if (!user || isPublicRoute) return null;

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
