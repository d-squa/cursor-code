import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { z } from "zod";
import { useSessionManager } from "@/hooks/useSessionManager";

// Input validation schemas
const authSchema = z.object({
  email: z.string().email("Please enter a valid email").max(255).trim(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  firstName: z.string().min(1, "First name is required").max(50).trim(),
  lastName: z.string().min(1, "Last name is required").max(50).trim(),
  phone: z.string().min(1, "Phone number is required").max(30).trim(),
  companyName: z.string().max(100).optional(),
  addressLine1: z.string().max(200).optional(),
  addressCity: z.string().max(100).optional(),
  addressState: z.string().max(100).optional(),
  addressPostalCode: z.string().max(20).optional(),
  addressCountry: z.string().max(100).optional(),
});

const profileCompletionSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50).trim(),
  lastName: z.string().min(1, "Last name is required").max(50).trim(),
  phone: z.string().min(1, "Phone number is required").max(30).trim(),
  addressLine1: z.string().max(200).optional(),
  addressCity: z.string().max(100).optional(),
  addressState: z.string().max(100).optional(),
  addressPostalCode: z.string().max(20).optional(),
  addressCountry: z.string().max(100).optional(),
});

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get("mode") !== "signup");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [showPostConfirmSuccess, setShowPostConfirmSuccess] = useState(false);
  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const navigate = useNavigate();
  const { registerSession, startValidation, clearSession } = useSessionManager();

  // Check if user was redirected here because email not confirmed
  const needsEmailConfirmation = searchParams.get("confirm_email") === "true";
  const isConfirmedRedirect = searchParams.get("confirmed") === "true";

  useEffect(() => {
    let isMounted = true;

    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted || !session) return;

      // If email is not confirmed, force confirmation screen
      if (!session.user.email_confirmed_at) {
        setShowEmailConfirmation(true);
        setEmail(session.user.email || "");
        return;
      }

      // If we have a pending signup email, only apply it to the same user.
      // Otherwise it can trap returning users on /auth due to stale localStorage.
      const pendingEmail = localStorage.getItem("actiplan_pending_signup_email");
      const sessionEmail = session.user.email ?? "";

      if (pendingEmail && pendingEmail === sessionEmail) {
        if (isConfirmedRedirect) {
          localStorage.removeItem("actiplan_pending_signup_email");
          localStorage.removeItem("actiplan_onboarding");
          setShowEmailConfirmation(false);
          setShowPostConfirmSuccess(true);
        } else {
          setShowEmailConfirmation(true);
          setEmail(pendingEmail);
        }
        return;
      }

      // Clear stale pending email if it belongs to a different user
      if (pendingEmail && pendingEmail !== sessionEmail) {
        localStorage.removeItem("actiplan_pending_signup_email");
      }

      // Otherwise, normal routing — check if profile needs completion (Google OAuth users)
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, phone")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!profile?.first_name || !profile?.last_name || !profile?.phone) {
        setShowProfileCompletion(true);
        // Pre-fill from Google metadata if available
        const meta = session.user.user_metadata;
        if (meta?.full_name) {
          const parts = meta.full_name.split(" ");
          setFirstName(parts[0] || "");
          setLastName(parts.slice(1).join(" ") || "");
        }
        return;
      }

      const onboardingData = localStorage.getItem("actiplan_onboarding");
      let onboardingComplete = false;
      if (onboardingData) {
        try {
          onboardingComplete = Boolean(JSON.parse(onboardingData)?.completedAt);
        } catch {
          onboardingComplete = false;
        }
      }

      if (onboardingComplete) {
        navigate("/overview");
        return;
      }

      navigate("/onboarding");
    };

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        if (!session.user.email_confirmed_at) {
          setShowEmailConfirmation(true);
          setEmail(session.user.email || "");
          return;
        }

        // Register the session for single-session enforcement (async, deferred)
        setTimeout(() => {
          void (async () => {
            await registerSession(session);
            startValidation(session);
          })();
        }, 0);

        // Only check pending email if it matches current session email
        const pendingEmail = localStorage.getItem("actiplan_pending_signup_email");
        if (pendingEmail && pendingEmail === session.user.email) {
          if (isConfirmedRedirect) {
            localStorage.removeItem("actiplan_pending_signup_email");
            localStorage.removeItem("actiplan_onboarding");
            setShowEmailConfirmation(false);
            setShowPostConfirmSuccess(true);
          } else {
            setShowEmailConfirmation(true);
            setEmail(pendingEmail);
          }
          return;
        }
        
        // Clear stale pending email if it doesn't match current user
        if (pendingEmail && pendingEmail !== session.user.email) {
          localStorage.removeItem("actiplan_pending_signup_email");
        }

        setShowEmailConfirmation(false);
        setShowPostConfirmSuccess(false);

        // Super admin bypass - skip onboarding and subscription checks
        if (session.user.email === "superadmin@actiplan.app") {
          navigate("/admin");
          return;
        }

        // Check if profile needs completion (Google OAuth users) - async wrapper
        setTimeout(() => {
          void (async () => {
            const { data: profile } = await supabase
              .from("profiles")
              .select("first_name, last_name, phone")
              .eq("id", session.user.id)
              .maybeSingle();

            if (!profile?.first_name || !profile?.last_name || !profile?.phone) {
              setShowProfileCompletion(true);
              const meta = session.user.user_metadata;
              if (meta?.full_name) {
                const parts = meta.full_name.split(" ");
                setFirstName(parts[0] || "");
                setLastName(parts.slice(1).join(" ") || "");
              }
              return;
            }

            const onboardingData = localStorage.getItem("actiplan_onboarding");
            let onboardingComplete = false;
            if (onboardingData) {
              try {
                onboardingComplete = Boolean(JSON.parse(onboardingData)?.completedAt);
              } catch {
                onboardingComplete = false;
              }
            }

            if (!onboardingComplete) {
              navigate("/onboarding");
              return;
            }

            // Onboarding complete - check subscription status and redirect
            try {
              const { data: subData } = await supabase.functions.invoke("check-subscription", {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              });

              if (subData?.subscribed) {
                navigate("/overview");
                return;
              }

              // Check if user came from a custom landing page - auto-activate trial
              const signupSource = localStorage.getItem("actiplan_signup_source");
              if (signupSource === "landing") {
                try {
                  const { data: trialData, error: trialError } = await supabase.functions.invoke("activate-free-trial", {
                    headers: {
                      Authorization: `Bearer ${session.access_token}`,
                    },
                  });

                  if (trialError) {
                    console.error("Error activating free trial:", trialError);
                    navigate("/choose-plan");
                    return;
                  }

                  if (trialData?.success) {
                    localStorage.removeItem("actiplan_signup_source");
                    toast.success("Welcome! Your 30-day free trial has started.");
                    navigate("/overview");
                    return;
                  }
                } catch (err) {
                  console.error("Error activating free trial:", err);
                }
              }

              // No subscription and not from landing - redirect to choose plan
              navigate("/choose-plan");
            } catch (error) {
              console.error("Error checking subscription:", error);
              navigate("/overview");
            }
          })();
        }, 0);
      }

      if (event === "SIGNED_OUT") {
        clearSession();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [
    navigate,
    registerSession,
    startValidation,
    clearSession,
    needsEmailConfirmation,
    isConfirmedRedirect,
  ]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate inputs
    if (isLogin) {
      const loginResult = z.object({
        email: z.string().email("Please enter a valid email").max(255).trim(),
        password: z.string().min(8, "Password must be at least 8 characters").max(128),
      }).safeParse({ email: email.trim(), password });

      if (!loginResult.success) {
        toast.error(loginResult.error.errors[0].message);
        setLoading(false);
        return;
      }

      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: loginResult.data.email,
          password: loginResult.data.password,
        });
        if (error) throw error;
        toast.success("Welcome back!");
      } catch (error: any) {
        toast.error(error.message || "An error occurred");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Signup validation
    const validationResult = authSchema.safeParse({
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      companyName: companyName || undefined,
      addressLine1: addressLine1 || undefined,
      addressCity: addressCity || undefined,
      addressState: addressState || undefined,
      addressPostalCode: addressPostalCode || undefined,
      addressCountry: addressCountry || undefined,
    });

    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      toast.error(firstError.message);
      setLoading(false);
      return;
    }

    const validatedData = validationResult.data;

    try {
      // CRITICAL: Force sign-out before sign-up to prevent session contamination
      await supabase.auth.signOut();
      clearSession();
      
      const { data, error } = await supabase.auth.signUp({
        email: validatedData.email,
        password: validatedData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth?confirmed=true`,
          data: {
            first_name: validatedData.firstName,
            last_name: validatedData.lastName,
            phone: validatedData.phone,
            company_name: validatedData.companyName,
          },
        },
      });

      if (error) throw error;
      
      // Store address fields in profile if provided
      if (validatedData.addressLine1 || validatedData.addressCity || validatedData.addressState || validatedData.addressPostalCode || validatedData.addressCountry) {
        // Will be saved after email confirmation when profile exists
        localStorage.setItem("actiplan_pending_address", JSON.stringify({
          address_line1: validatedData.addressLine1,
          address_city: validatedData.addressCity,
          address_state: validatedData.addressState,
          address_postal_code: validatedData.addressPostalCode,
          address_country: validatedData.addressCountry,
        }));
      }
      
      // Clear any stale onboarding data from previous sessions
      localStorage.removeItem("actiplan_onboarding");
      
      // Store email for reference
      localStorage.setItem("actiplan_pending_signup_email", validatedData.email);
      
      // Show email confirmation message - don't redirect to onboarding yet
      setShowEmailConfirmation(true);
      toast.success("Check your email to confirm your account!");
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
      toast.success("Password reset email sent!");
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset email");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleProfileCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = profileCompletionSchema.safeParse({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      addressLine1: addressLine1 || undefined,
      addressCity: addressCity || undefined,
      addressState: addressState || undefined,
      addressPostalCode: addressPostalCode || undefined,
      addressCountry: addressCountry || undefined,
    });

    if (!result.success) {
      toast.error(result.error.errors[0].message);
      setLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: result.data.firstName,
          last_name: result.data.lastName,
          phone: result.data.phone,
          full_name: `${result.data.firstName} ${result.data.lastName}`.trim(),
          address_line1: result.data.addressLine1 || null,
          address_city: result.data.addressCity || null,
          address_state: result.data.addressState || null,
          address_postal_code: result.data.addressPostalCode || null,
          address_country: result.data.addressCountry || null,
        })
        .eq("id", session.user.id);

      if (error) throw error;

      setShowProfileCompletion(false);
      toast.success("Profile completed!");
      navigate("/onboarding");
    } catch (error: any) {
      toast.error(error.message || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      // Clear any stale onboarding data from previous sessions
      localStorage.removeItem("actiplan_onboarding");
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in with Google");
    }
  };

  // Show forgot password screen
  if (showForgotPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-4">
              <img src="/logo.png" alt="ActiPlan" className="h-10 w-auto" />
            </div>
            <CardTitle className="text-2xl">{forgotSent ? "Check Your Email" : "Reset Password"}</CardTitle>
            <CardDescription>
              {forgotSent
                ? `We've sent a password reset link to ${forgotEmail}`
                : "Enter your email and we'll send you a reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {forgotSent ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
                <Button variant="outline" className="w-full" onClick={() => { setForgotSent(false); }}>
                  Try again
                </Button>
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setForgotSent(false); setForgotEmail(""); }}
                  className="text-sm text-primary hover:underline"
                >
                  ← Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={forgotLoading}>
                  {forgotLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(false); setForgotEmail(""); }}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    ← Back to sign in
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show post-confirmation success screen
  if (showPostConfirmSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">Email Confirmed</CardTitle>
            <CardDescription className="mt-2">
              Your account is verified. You can continue to onboarding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full" onClick={() => navigate("/onboarding")}>Continue</Button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back to home
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show email confirmation screen after signup
  if (showEmailConfirmation) {
    const handleEscapeConfirmation = () => {
      // Clear stale pending email that might be trapping user
      localStorage.removeItem("actiplan_pending_signup_email");
      setShowEmailConfirmation(false);
      setIsLogin(true);
      setEmail("");
      setPassword("");
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-2xl">Check Your Email</CardTitle>
            <CardDescription className="mt-2">
              We've sent a confirmation link to <span className="font-medium text-foreground">{email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the link in the email to confirm your account and start your free trial.
            </p>
            <div className="pt-4 border-t space-y-3">
              <p className="text-sm text-muted-foreground">Didn't receive the email?</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowEmailConfirmation(false);
                  setIsLogin(false);
                }}
              >
                Try again
              </Button>
              <div className="text-sm text-muted-foreground">
                Already confirmed or have an account?{" "}
                <button
                  type="button"
                  onClick={handleEscapeConfirmation}
                  className="text-primary hover:underline font-medium"
                >
                  Sign in instead
                </button>
              </div>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back to home
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show profile completion screen (Google OAuth users missing required fields)
  if (showProfileCompletion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-4">
              <img src="/logo.png" alt="ActiPlan" className="h-10 w-auto" />
            </div>
            <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
            <CardDescription>
              Please provide a few more details to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileCompletion} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="pc-firstName">First Name *</Label>
                  <Input
                    id="pc-firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pc-lastName">Last Name *</Label>
                  <Input
                    id="pc-lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pc-phone">Phone Number *</Label>
                <Input
                  id="pc-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">Address (Optional)</p>
              <div className="space-y-3">
                <Input
                  placeholder="Street Address"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="City"
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                  />
                  <Input
                    placeholder="State / Region"
                    value={addressState}
                    onChange={(e) => setAddressState(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Postal Code"
                    value={addressPostalCode}
                    onChange={(e) => setAddressPostalCode(e.target.value)}
                  />
                  <Input
                    placeholder="Country"
                    value={addressCountry}
                    onChange={(e) => setAddressCountry(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <img src="/logo.png" alt="ActiPlan" className="h-10 w-auto" />
          </div>
          <CardTitle className="text-2xl">{isLogin ? "Welcome Back" : "Start Your Free Trial"}</CardTitle>
          <CardDescription>
            {isLogin ? "Sign in to your account" : "Create an account to get started with ActiPlan"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={8}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Minimum 8 characters required
              </p>
              {isLogin && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(true); setForgotEmail(email); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
            {!isLogin && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company Name (Optional)</Label>
                  <Input
                    id="company"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Corp"
                  />
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">Address (Optional)</p>
                <div className="space-y-3">
                  <Input
                    placeholder="Street Address"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="City"
                      value={addressCity}
                      onChange={(e) => setAddressCity(e.target.value)}
                    />
                    <Input
                      placeholder="State / Region"
                      value={addressState}
                      onChange={(e) => setAddressState(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Postal Code"
                      value={addressPostalCode}
                      onChange={(e) => setAddressPostalCode(e.target.value)}
                    />
                    <Input
                      placeholder="Country"
                      value={addressCountry}
                      onChange={(e) => setAddressCountry(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isLogin ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                <>{isLogin ? "Sign In" : "Create Account"}</>
              )}
            </Button>
          </form>
          
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>
          
          <Button 
            type="button" 
            variant="outline" 
            className="w-full" 
            onClick={handleGoogleSignIn}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>
          
          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline"
            >
              {isLogin ? "Don't have an account? Start free trial" : "Already have an account? Sign in"}
            </button>
          </div>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to home
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
