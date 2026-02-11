import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, CalendarDays, CheckCircle2 } from "lucide-react";

// Declare global pixel functions
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
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    companyName: "",
  });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const isFormValid =
    formData.fullName.trim() !== "" &&
    formData.email.trim() !== "" &&
    formData.phone.trim() !== "" &&
    formData.companyName.trim() !== "";

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFormValid) {
      setFormSubmitted(true);
    }
  };

  const fireConversionPixels = () => {
    // Meta Pixel
    if (window.fbq) {
      window.fbq("track", "Schedule");
    }
    // Google Ads via GTM dataLayer
    if (window.dataLayer) {
      window.dataLayer.push({
        event: "demo_booking_confirmed",
        bookingEmail: formData.email,
        bookingCompany: formData.companyName,
      });
    }
    // Google Ads gtag fallback
    if (window.gtag) {
      window.gtag("event", "conversion", {
        send_to: "AW-CONVERSION_ID/CONVERSION_LABEL",
        event_callback: () => {},
      });
    }
    // TikTok Pixel
    if (window.ttq) {
      window.ttq.track("SubmitForm");
    }
  };

  const handleConfirmBooking = () => {
    fireConversionPixels();
    setConfirmed(true);
  };

  const calendlyUrlWithParams = `${CALENDLY_URL}?name=${encodeURIComponent(formData.fullName)}&email=${encodeURIComponent(formData.email)}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <img src="/logo.png" alt="ActiPlan" className="h-8 md:h-10 w-auto" />
            </Link>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-12 md:py-20">
        {confirmed ? (
          /* Confirmation State */
          <div className="max-w-lg mx-auto text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Demo Booked!</h1>
            <p className="text-muted-foreground mb-8">
              Thanks, {formData.fullName}! We've received your booking request. Check your email at{" "}
              <span className="font-medium text-foreground">{formData.email}</span> for the calendar
              invite and meeting details.
            </p>
            <Button onClick={() => navigate("/")} className="gap-2">
              Back to Home <ArrowLeft className="h-4 w-4 rotate-180" />
            </Button>
          </div>
        ) : !formSubmitted ? (
          /* Step 1: Contact Form */
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-8">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <CalendarDays className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3">Book a Demo</h1>
              <p className="text-muted-foreground">
                See how ActiPlan can transform your media team. Fill in your details and pick a time
                that works for you.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Your Details</CardTitle>
                <CardDescription>We'll use this to prepare a personalized demo for you.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name *</Label>
                    <Input
                      id="fullName"
                      placeholder="John Doe"
                      value={formData.fullName}
                      onChange={(e) => setFormData((p) => ({ ...p, fullName: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@company.com"
                      value={formData.email}
                      onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={formData.phone}
                      onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input
                      id="companyName"
                      placeholder="Acme Inc."
                      value={formData.companyName}
                      onChange={(e) => setFormData((p) => ({ ...p, companyName: e.target.value }))}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full mt-2" disabled={!isFormValid}>
                    Continue to Schedule
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Step 2: Calendly Embed + Confirm */
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Pick a Time</h1>
              <p className="text-muted-foreground">
                Select a date and time slot below, then confirm your booking.
              </p>
            </div>

            <div className="rounded-lg border bg-card overflow-hidden mb-6">
              <iframe
                src={calendlyUrlWithParams}
                width="100%"
                height="700"
                frameBorder="0"
                title="Schedule a Demo"
                className="w-full"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" onClick={() => setFormSubmitted(false)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Edit Details
              </Button>
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
