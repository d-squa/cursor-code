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

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email").max(255).trim(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email").max(255).trim(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get("mode") !== "signup");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [showPostConfirmSuccess, setShowPostConfirmSuccess] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const navigate = useNavigate();
  const { registerSession, startValidation, clearSession } = useSessionManager();

  const needsEmailConfirmation = searchParams.get("confirm_email") === "true";
  const isConfirmedRedirect = searchParams.get("confirmed") === "true";

  useEffect(() => {
    let isMounted = true;

    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted || !session) return;

      if (!session.user.email_confirmed_at) {
        setShowEmailConfirmation(true);
        setEmail(session.user.email || "");
        return;
      }

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

      if (pendingEmail && pendingEmail !== sessionEmail) {
        localStorage.removeItem("actiplan_pending_signup_email");
      }

      // Always route to onboarding — it handles profile completion on step 1
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
        navigate("/app/overview");
        return;
      }

      navigate("/onboarding");
    };

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearSession();
        return;
      }

      if (!session || (event !== "SIGNED_IN" && event !== "INITIAL_SESSION")) {
        return;
      }

      if (!session.user.email_confirmed_at) {
        setShowEmailConfirmation(true);
        setEmail(session.user.email || "");
        return;
      }

      setTimeout(() => {
        void (async () => {
          await registerSession(session);
          startValidation(session);
        })();
      }, 0);

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
      
      if (pendingEmail && pendingEmail !== session.user.email) {
        localStorage.removeItem("actiplan_pending_signup_email");
      }

      setShowEmailConfirmation(false);
      setShowPostConfirmSuccess(false);

      if (session.user.email === "superadmin@actiplan.app") {
        navigate("/app/admin");
        return;
      }

      // Route to onboarding — step 1 handles profile data collection
      setTimeout(() => {
        void (async () => {
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

          // Finishing team invite after email confirm: guard accepts invite + sets workspace before billing checks
          if (typeof localStorage !== "undefined" && localStorage.getItem("actiplan_pending_invitation")) {
            navigate("/app/overview");
            return;
          }

          try {
            const { data: subData } = await supabase.functions.invoke("check-subscription", {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            });

            if (subData?.subscribed) {
              navigate("/app/overview");
              return;
            }

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

                if (trialError) {
                  console.error("Error activating free trial:", trialError);
                  sessionStorage.removeItem("actiplan_trial_activating");
                  navigate("/choose-plan");
                  return;
                }

                if (trialData?.success) {
                  localStorage.removeItem("actiplan_signup_source");
                  sessionStorage.removeItem("actiplan_trial_activating");
                  toast.success("Welcome! Your 30-day free trial has started.");
                  navigate("/app/overview");
                  return;
                }
                sessionStorage.removeItem("actiplan_trial_activating");
              } catch (err) {
                console.error("Error activating free trial:", err);
                sessionStorage.removeItem("actiplan_trial_activating");
              }
            }

            navigate("/choose-plan");
          } catch (error) {
            console.error("Error checking subscription:", error);
            navigate("/app/overview");
          }
        })();
      }, 0);
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

    if (isLogin) {
      const loginResult = loginSchema.safeParse({ email: email.trim(), password });

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

    // Signup
    const validationResult = signupSchema.safeParse({
      email: email.trim(),
      password,
    });

    if (!validationResult.success) {
      toast.error(validationResult.error.errors[0].message);
      setLoading(false);
      return;
    }

    try {
      await supabase.auth.signOut();
      clearSession();
      
      const { error } = await supabase.auth.signUp({
        email: validationResult.data.email,
        password: validationResult.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth?confirmed=true`,
        },
      });

      if (error) throw error;
      
      localStorage.removeItem("actiplan_onboarding");
      localStorage.setItem("actiplan_pending_signup_email", validationResult.data.email);
      
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

  const handleGoogleSignIn = async () => {
    try {
      localStorage.removeItem("actiplan_onboarding");

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in with Google");
    }
  };

  // Forgot password screen
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

  // Post-confirmation success screen
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

  // Email confirmation screen
  if (showEmailConfirmation) {
    const handleEscapeConfirmation = () => {
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
