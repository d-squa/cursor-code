import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
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
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: January 12, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              ActiPlan ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our cross-platform activation management service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
            
            <h3 className="text-xl font-medium mb-3 mt-6">2.1 Personal Information</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We may collect personal information that you voluntarily provide when using our Service, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Name and email address</li>
              <li>Company name and role</li>
              <li>Billing and payment information</li>
              <li>Account credentials</li>
              <li>Communication preferences</li>
            </ul>

            <h3 className="text-xl font-medium mb-3 mt-6">2.2 Usage Information</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We automatically collect certain information when you use our Service:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Device and browser information</li>
              <li>IP address and location data</li>
              <li>Usage patterns and feature interactions</li>
              <li>Log data and analytics</li>
            </ul>

            <h3 className="text-xl font-medium mb-3 mt-6">2.3 Third-Party Platform Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              When you connect advertising platforms (such as Meta, TikTok, or Google Ads), we access data from these platforms as authorized by you, including ad account information, campaign data, audience insights, and performance metrics.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We use the collected information for the following purposes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Provide, maintain, and improve our Service</li>
              <li>Process transactions and send related information</li>
              <li>Send administrative information and updates</li>
              <li>Respond to inquiries and provide customer support</li>
              <li>Monitor and analyze usage trends and preferences</li>
              <li>Detect, prevent, and address technical issues</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Information Sharing</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We may share your information in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Service Providers:</strong> With third-party vendors who perform services on our behalf</li>
              <li><strong>Business Transfers:</strong> In connection with any merger, sale, or acquisition</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
              <li><strong>With Your Consent:</strong> When you have given us permission to share</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement appropriate technical and organizational security measures to protect your personal information. These include encryption, secure servers, access controls, and regular security assessments. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. When you delete your account, we will delete or anonymize your personal information within 30 days, except where we are required to retain it for legal purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Depending on your location, you may have the following rights regarding your personal information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Access:</strong> Request a copy of your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request transfer of your data to another service</li>
              <li><strong>Objection:</strong> Object to certain processing of your information</li>
              <li><strong>Restriction:</strong> Request restriction of processing</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              To exercise these rights, please contact us at privacy@actiplan.io.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Cookies and Tracking</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use cookies and similar tracking technologies to collect and store information about your preferences and activity on our Service. You can control cookies through your browser settings, but disabling certain cookies may affect the functionality of our Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. International Data Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place when transferring data internationally, including standard contractual clauses and other legal mechanisms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If we learn that we have collected personal information from a child, we will take steps to delete that information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. We encourage you to review this Privacy Policy periodically.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              If you have any questions about this Privacy Policy or our privacy practices, please contact us:
            </p>
            <ul className="list-none space-y-2 text-muted-foreground">
              <li><strong>Email:</strong> privacy@actiplan.io</li>
              <li><strong>Support:</strong> support@actiplan.io</li>
            </ul>
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

export default PrivacyPolicy;
