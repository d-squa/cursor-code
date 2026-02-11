import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    ttq?: { track: (...args: unknown[]) => void };
    dataLayer?: Record<string, unknown>[];
  }
}

const CALENDLY_URL = "https://calendly.com/dsquad-theagency/30min";

const BookDemo = () => {
  const navigate = useNavigate();

  const fireConversionPixels = () => {
    if (window.fbq) {
      window.fbq("track", "Schedule");
    }
    if (window.dataLayer) {
      window.dataLayer.push({
        event: "demo_booking_confirmed",
      });
    }
    if (window.gtag) {
      window.gtag("event", "conversion", {
        send_to: "AW-CONVERSION_ID/CONVERSION_LABEL",
        event_callback: () => {},
      });
    }
    if (window.ttq) {
      window.ttq.track("SubmitForm");
    }
  };

  const handleConfirmBooking = () => {
    fireConversionPixels();
    navigate("/book-demo/confirmation");
  };

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
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Book a Demo</h1>
            <p className="text-muted-foreground">
              Select a date and time below, then confirm your booking.
            </p>
          </div>

          <div className="rounded-lg border bg-card overflow-hidden mb-6">
            <iframe
              src={CALENDLY_URL}
              width="100%"
              height="700"
              frameBorder="0"
              title="Schedule a Demo"
              className="w-full"
            />
          </div>

          <div className="flex justify-center">
            <Button onClick={handleConfirmBooking} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              I've Scheduled My Demo
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default BookDemo;
