import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const TermsAndConditions = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Button>
            </Link>
            <img src="/logo.png" alt="ActiPlan" className="h-8 w-auto" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Terms & Conditions</h1>
        <p className="text-muted-foreground mb-8">Last updated: January 12, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing and using ActiPlan ("the Service"), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to abide by these terms, please do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              ActiPlan is a cross-platform activation management platform designed for media teams. The Service provides tools for campaign planning, creative management, audience targeting, and performance analytics across multiple advertising platforms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              To use certain features of the Service, you must register for an account. When you register, you agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your password and account</li>
              <li>Accept responsibility for all activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Subscription and Billing</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              ActiPlan offers various subscription plans. By subscribing to a paid plan, you agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Pay all fees associated with your chosen subscription plan</li>
              <li>Provide valid payment information</li>
              <li>Authorize automatic renewal of your subscription unless cancelled</li>
              <li>Accept that prices may be subject to change with reasonable notice</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Free Trial</h2>
            <p className="text-muted-foreground leading-relaxed">
              New users may be eligible for a 30-day free trial. At the end of the trial period, your subscription will automatically convert to a paid plan unless you cancel before the trial ends. A valid payment method is required to start your free trial.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon the rights of others</li>
              <li>Transmit any harmful, threatening, or offensive content</li>
              <li>Attempt to gain unauthorized access to the Service or its systems</li>
              <li>Interfere with or disrupt the Service or its servers</li>
              <li>Use the Service for any fraudulent or deceptive purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service and its original content, features, and functionality are owned by ActiPlan and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. You retain ownership of any content you create or upload to the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Third-Party Integrations</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service may integrate with third-party advertising platforms including but not limited to Meta (Facebook/Instagram), TikTok, and Google Ads. Your use of these integrations is subject to the respective terms of service of those platforms. We are not responsible for the actions or policies of third-party platforms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Data and Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your use of the Service is also governed by our Privacy Policy. By using the Service, you consent to the collection and use of information as described in our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, ActiPlan shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied. We do not guarantee that the Service will be uninterrupted, secure, or error-free.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms. Upon termination, your right to use the Service will cease immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the new terms on the Service. Your continued use of the Service after such modifications constitutes your acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">14. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms & Conditions, please contact us at support@actiplan.io.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t bg-muted/30 mt-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="ActiPlan" className="h-6 w-auto" />
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms & Conditions</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} ActiPlan. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default TermsAndConditions;
