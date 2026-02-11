import { useState } from "react";
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
  const [confirmed, setConfirmed] = useState(false);

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
    setConfirmed(true);
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
        {confirmed ? (
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
        ) : (
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
        )}
      </main>
    </div>
  );
};

export default BookDemo;
