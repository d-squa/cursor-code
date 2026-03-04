import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, Mail, Loader2 } from "lucide-react";
import { useTrialCheckout } from "@/hooks/useTrialCheckout";

interface OnboardingData {
  fullName: string;
  company: string;
  source: string;
  role: string;
  teamSize: string;
  experience: string;
}

export const OnboardingWizard = () => {
  const navigate = useNavigate();
  const { startBasicTrial, isProcessing } = useTrialCheckout();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [formData, setFormData] = useState<OnboardingData>({
    fullName: "",
    company: "",
    source: "",
    role: "",
    teamSize: "",
    experience: "",
  });

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setHasSession(!!session);
      
      const email = localStorage.getItem("actiplan_pending_signup_email");
      setPendingEmail(email);
    };
    checkSession();
  }, []);

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.fullName.trim() !== "";
      case 2:
        return formData.role !== "" && formData.teamSize !== "";
      case 3:
        return formData.source !== "" && formData.experience !== "";
      default:
        return true;
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      // Store onboarding data in localStorage and mark as complete
      localStorage.setItem("actiplan_onboarding", JSON.stringify({
        ...formData,
        completedAt: new Date().toISOString()
      }));
      
      // Save to database if user has session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { error } = await supabase
          .from("profiles")
          .update({ 
            full_name: formData.fullName,
            company_name: formData.company || null,
            role: formData.role,
            team_size: formData.teamSize,
            discovery_source: formData.source,
            paid_media_experience: formData.experience,
            onboarding_completed_at: new Date().toISOString()
          })
          .eq("id", session.user.id);
        
        if (error) {
          console.error("Error saving onboarding data:", error);
        }
      }

      if (hasSession && session) {
        // User already confirmed email - check subscription and redirect
        localStorage.removeItem("actiplan_pending_signup_email");
        
        try {
          const { data: subData } = await supabase.functions.invoke("check-subscription", {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          
          if (subData?.subscribed) {
            toast.success("Welcome to ActiPlan! Let's get started.");
            navigate("/overview");
          } else {
            // Check if user came from a custom landing page - auto-activate trial
            const signupSource = localStorage.getItem("actiplan_signup_source");
            if (signupSource === "landing") {
              try {
                const { data: trialData, error: trialError } = await supabase.functions.invoke("activate-free-trial", {
                  headers: {
                    Authorization: `Bearer ${session.access_token}`,
                  },
                });

                if (!trialError && trialData?.success) {
                  localStorage.removeItem("actiplan_signup_source");
                  toast.success("Welcome! Your 30-day free trial has started.");
                  navigate("/overview");
                  return;
                }
              } catch (err) {
                console.error("Error activating free trial:", err);
              }
            }

            // Not from landing page or trial activation failed - use standard checkout
            toast.success("Almost there! Complete your free trial setup.");
            await startBasicTrial();
          }
        } catch (error) {
          console.error("Error checking subscription:", error);
          // On error, still try to start trial checkout
          await startBasicTrial();
        }
      } else {
        // User needs to confirm email - show confirmation screen
        setShowEmailConfirmation(true);
      }
    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Email confirmation screen
  if (showEmailConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription className="text-base mt-2">
              We've sent a confirmation link to{" "}
              <span className="font-medium text-foreground">{pendingEmail}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Click the link in your email to confirm your account and start using ActiPlan.
            </p>
            <div className="pt-4 space-y-2">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate("/auth")}
              >
                Back to Sign In
              </Button>
              <p className="text-sm text-muted-foreground">
                Didn't receive the email? Check your spam folder or{" "}
                <button 
                  className="text-primary hover:underline"
                  onClick={() => {
                    toast.info("Please try signing up again if you didn't receive the email.");
                    navigate("/auth?mode=signup");
                  }}
                >
                  try again
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">Welcome to ActiPlan</span>
          </div>
          <Progress value={progress} className="h-2 mb-4" />
          <CardTitle className="text-2xl">
            {step === 1 && "Tell us about yourself"}
            {step === 2 && "Your work profile"}
            {step === 3 && "Almost done!"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "Help us personalize your experience"}
            {step === 2 && "This helps us recommend the right features"}
            {step === 3 && "Just a few more details"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company / Organization</Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Your company name (optional)"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="role">Your Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="media-buyer">Media Buyer</SelectItem>
                    <SelectItem value="media-planner">Media Planner</SelectItem>
                    <SelectItem value="account-manager">Account Manager</SelectItem>
                    <SelectItem value="marketing-manager">Marketing Manager</SelectItem>
                    <SelectItem value="agency-owner">Agency Owner</SelectItem>
                    <SelectItem value="freelancer">Freelancer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="teamSize">Team Size *</Label>
                <Select
                  value={formData.teamSize}
                  onValueChange={(value) => setFormData({ ...formData, teamSize: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">Just me</SelectItem>
                    <SelectItem value="2-5">2-5 people</SelectItem>
                    <SelectItem value="6-10">6-10 people</SelectItem>
                    <SelectItem value="11-25">11-25 people</SelectItem>
                    <SelectItem value="26-50">26-50 people</SelectItem>
                    <SelectItem value="50+">50+ people</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="source">How did you hear about us? *</Label>
                <Select
                  value={formData.source}
                  onValueChange={(value) => setFormData({ ...formData, source: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google Search</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="referral">Referral / Word of Mouth</SelectItem>
                    <SelectItem value="social">Social Media</SelectItem>
                    <SelectItem value="event">Event / Conference</SelectItem>
                    <SelectItem value="blog">Blog / Article</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience">Paid Media Experience *</Label>
                <Select
                  value={formData.experience}
                  onValueChange={(value) => setFormData({ ...formData, experience: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select experience" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner (less than 1 year)</SelectItem>
                    <SelectItem value="intermediate">Intermediate (1-3 years)</SelectItem>
                    <SelectItem value="advanced">Advanced (3-5 years)</SelectItem>
                    <SelectItem value="expert">Expert (5+ years)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 1}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>

            {step < totalSteps ? (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
                className="gap-2"
              >
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleComplete}
                disabled={!canProceed() || isSubmitting || isProcessing}
                className="gap-2"
              >
                {isSubmitting || isProcessing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Setting up...</>
                ) : (
                  <>Complete <CheckCircle2 className="h-4 w-4" /></>
                )}
              </Button>
            )}
          </div>

          <button
            onClick={async () => {
              // Store partial onboarding data and mark as complete
              localStorage.setItem("actiplan_onboarding", JSON.stringify({
                ...formData,
                skipped: true,
                completedAt: new Date().toISOString()
              }));
              
              // Save partial data to database
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user) {
                await supabase
                  .from("profiles")
                  .update({ 
                    full_name: formData.fullName || null,
                    company_name: formData.company || null,
                    role: formData.role || null,
                    team_size: formData.teamSize || null,
                    discovery_source: formData.source || null,
                    paid_media_experience: formData.experience || null,
                    onboarding_completed_at: new Date().toISOString()
                  })
                  .eq("id", session.user.id);
              }
              
              if (hasSession && session) {
                try {
                  const { data: subData } = await supabase.functions.invoke("check-subscription", {
                    headers: {
                      Authorization: `Bearer ${session.access_token}`,
                    },
                  });
                  
                  if (subData?.subscribed) {
                    navigate("/overview");
                  } else {
                    await startBasicTrial();
                  }
                } catch (error) {
                  await startBasicTrial();
                }
              } else {
                setShowEmailConfirmation(true);
              }
            }}
            className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingWizard;
