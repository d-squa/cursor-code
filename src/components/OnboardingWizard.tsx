import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fireSubscribeConversion } from "@/utils/conversionTracking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, Mail, Loader2 } from "lucide-react";
import { useTrialCheckout } from "@/hooks/useTrialCheckout";

interface OnboardingData {
  firstName: string;
  lastName: string;
  phone: string;
  addressLine1: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
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
  const [step1Completed, setStep1Completed] = useState(false);
  const [formData, setFormData] = useState<OnboardingData>({
    firstName: "",
    lastName: "",
    phone: "",
    addressLine1: "",
    addressCity: "",
    addressState: "",
    addressPostalCode: "",
    addressCountry: "",
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

      // Pre-fill from profile if data exists (e.g. Google OAuth)
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, phone, address_line1, address_city, address_state, address_postal_code, address_country, company_name")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profile) {
          const prefilled: Partial<OnboardingData> = {};
          if (profile.first_name) prefilled.firstName = profile.first_name;
          if (profile.last_name) prefilled.lastName = profile.last_name;
          if (profile.phone) prefilled.phone = profile.phone;
          if (profile.address_line1) prefilled.addressLine1 = profile.address_line1;
          if (profile.address_city) prefilled.addressCity = profile.address_city;
          if (profile.address_state) prefilled.addressState = profile.address_state;
          if (profile.address_postal_code) prefilled.addressPostalCode = profile.address_postal_code;
          if (profile.address_country) prefilled.addressCountry = profile.address_country;
          if (profile.company_name) prefilled.company = profile.company_name;

          if (Object.keys(prefilled).length > 0) {
            setFormData(prev => ({ ...prev, ...prefilled }));
          }

          // If required fields already filled, mark step 1 as done
          if (profile.first_name && profile.last_name && profile.phone) {
            setStep1Completed(true);
          }
        }

        // Also try Google metadata
        if (!profile?.first_name) {
          const meta = session.user.user_metadata;
          if (meta?.full_name) {
            const parts = meta.full_name.split(" ");
            setFormData(prev => ({
              ...prev,
              firstName: prev.firstName || parts[0] || "",
              lastName: prev.lastName || parts.slice(1).join(" ") || "",
            }));
          }
          if (meta?.first_name) {
            setFormData(prev => ({ ...prev, firstName: prev.firstName || meta.first_name }));
          }
          if (meta?.last_name) {
            setFormData(prev => ({ ...prev, lastName: prev.lastName || meta.last_name }));
          }
        }
      }
    };
    checkSession();
  }, []);

  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  const handleNext = async () => {
    // Save profile data when completing step 1
    if (step === 1) {
      if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.phone.trim()) {
        toast.error("Please fill in all required fields");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { error } = await supabase
          .from("profiles")
          .update({
            first_name: formData.firstName.trim(),
            last_name: formData.lastName.trim(),
            phone: formData.phone.trim(),
            full_name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
            company_name: formData.company.trim() || null,
            address_line1: formData.addressLine1.trim() || null,
            address_city: formData.addressCity.trim() || null,
            address_state: formData.addressState.trim() || null,
            address_postal_code: formData.addressPostalCode.trim() || null,
            address_country: formData.addressCountry.trim() || null,
          })
          .eq("id", session.user.id);

        if (error) {
          console.error("Error saving profile:", error);
          toast.error("Failed to save profile data");
          return;
        }
      }
      setStep1Completed(true);
    }

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
        return formData.firstName.trim() !== "" && formData.lastName.trim() !== "" && formData.phone.trim() !== "";
      case 2:
        return formData.role !== "" && formData.teamSize !== "";
      case 3:
        return formData.source !== "" && formData.experience !== "";
      case 4:
        return true;
      default:
        return true;
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      localStorage.setItem("actiplan_onboarding", JSON.stringify({
        ...formData,
        completedAt: new Date().toISOString()
      }));
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { error } = await supabase
          .from("profiles")
          .update({ 
            full_name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
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
            const signupSource = localStorage.getItem("actiplan_signup_source");
            const alreadyActivating = sessionStorage.getItem("actiplan_trial_activating");
            if (signupSource === "landing" && !alreadyActivating) {
              try {
                sessionStorage.setItem("actiplan_trial_activating", "true");
                const { data: trialData, error: trialError } = await supabase.functions.invoke("activate-free-trial", {
                  headers: {
                    Authorization: `Bearer ${session.access_token}`,
                  },
                });

                if (!trialError && (trialData?.success || trialData?.alreadySubscribed)) {
                  localStorage.removeItem("actiplan_signup_source");
                  sessionStorage.removeItem("actiplan_trial_activating");
                  fireSubscribeConversion(`auto-trial:${session.user.id}`);
                  toast.success("Welcome! Your 30-day free trial has started.");
                  navigate("/overview");
                  return;
                }
                sessionStorage.removeItem("actiplan_trial_activating");
              } catch (err) {
                console.error("Error activating free trial:", err);
                sessionStorage.removeItem("actiplan_trial_activating");
              }
              localStorage.removeItem("actiplan_signup_source");
              navigate("/overview");
              return;
            }

            toast.success("Almost there! Complete your free trial setup.");
            await startBasicTrial();
          }
        } catch (error) {
          console.error("Error checking subscription:", error);
          await startBasicTrial();
        }
      } else {
        setShowEmailConfirmation(true);
      }
    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async (permanent = false) => {
    // Track skip count across sessions
    const prevSkipCount = parseInt(localStorage.getItem("actiplan_onboarding_skip_count") || "0", 10);
    const newSkipCount = prevSkipCount + 1;
    localStorage.setItem("actiplan_onboarding_skip_count", String(newSkipCount));

    if (permanent) {
      localStorage.setItem("actiplan_onboarding_dismissed", "true");
    }

    // Store partial onboarding data and mark as complete (for this session)
    localStorage.setItem("actiplan_onboarding", JSON.stringify({
      ...formData,
      skipped: true,
      permanentlyDismissed: permanent,
      completedAt: new Date().toISOString()
    }));
    
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase
        .from("profiles")
        .update({ 
          full_name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
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
          const signupSource = localStorage.getItem("actiplan_signup_source");
          const alreadyActivating = sessionStorage.getItem("actiplan_trial_activating");
          if (signupSource === "landing" && !alreadyActivating) {
            try {
              sessionStorage.setItem("actiplan_trial_activating", "true");
              const { data: trialData } = await supabase.functions.invoke("activate-free-trial", {
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              if (trialData?.success || trialData?.alreadySubscribed) {
                localStorage.removeItem("actiplan_signup_source");
                sessionStorage.removeItem("actiplan_trial_activating");
                fireSubscribeConversion(`auto-trial:${session.user.id}`);
                toast.success("Welcome! Your 30-day free trial has started.");
                navigate("/overview");
                return;
              }
              sessionStorage.removeItem("actiplan_trial_activating");
            } catch (err) {
              console.error("Error activating free trial:", err);
              sessionStorage.removeItem("actiplan_trial_activating");
            }
            localStorage.removeItem("actiplan_signup_source");
            navigate("/overview");
          } else {
            await startBasicTrial();
          }
        }
      } catch (error) {
        const signupSource = localStorage.getItem("actiplan_signup_source");
        if (signupSource === "landing") {
          localStorage.removeItem("actiplan_signup_source");
          navigate("/overview");
        } else {
          await startBasicTrial();
        }
      }
    } else {
      setShowEmailConfirmation(true);
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
            {step === 1 && "Your details"}
            {step === 2 && "Tell us about yourself"}
            {step === 3 && "Your work profile"}
            {step === 4 && "Almost done!"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "We need a few details to set up your account"}
            {step === 2 && "Help us personalize your experience"}
            {step === 3 && "This helps us recommend the right features"}
            {step === 4 && "Just a few more details"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="John"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  required
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
              <Separator />
              <p className="text-xs text-muted-foreground">Address (Optional)</p>
              <div className="space-y-3">
                <Input
                  placeholder="Street Address"
                  value={formData.addressLine1}
                  onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="City"
                    value={formData.addressCity}
                    onChange={(e) => setFormData({ ...formData, addressCity: e.target.value })}
                  />
                  <Input
                    placeholder="State / Region"
                    value={formData.addressState}
                    onChange={(e) => setFormData({ ...formData, addressState: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Postal Code"
                    value={formData.addressPostalCode}
                    onChange={(e) => setFormData({ ...formData, addressPostalCode: e.target.value })}
                  />
                  <Input
                    placeholder="Country"
                    value={formData.addressCountry}
                    onChange={(e) => setFormData({ ...formData, addressCountry: e.target.value })}
                  />
                </div>
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

          {step === 4 && (
            <div className="space-y-4 text-center py-4">
              <div className="flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
              </div>
              <p className="text-muted-foreground">
                You're all set! Click "Complete" to start using ActiPlan.
              </p>
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

          {/* Skip button only shows after step 1 is completed */}
          {step1Completed && step > 1 && (
            <button
              onClick={handleSkip}
              className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip for now
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingWizard;
