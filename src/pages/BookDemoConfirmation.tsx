import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowLeft } from "lucide-react";

const BookDemoConfirmation = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
          <Link to="/">
            <img src="/logo.png" alt="ActiPlan" className="h-8 md:h-10 w-auto" />
          </Link>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-lg mx-auto text-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-4">Demo Booked!</h1>
          <p className="text-muted-foreground mb-8">
            Thanks for scheduling a demo! Check your email for the calendar invite and meeting details.
          </p>
          <Button onClick={() => navigate("/")} className="gap-2">
            Back to Home <ArrowLeft className="h-4 w-4 rotate-180" />
          </Button>
        </div>
      </main>
    </div>
  );
};

export default BookDemoConfirmation;
