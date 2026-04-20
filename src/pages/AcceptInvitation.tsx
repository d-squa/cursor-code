import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Users, User, ArrowRight, AlertTriangle } from "lucide-react";

type SubscriptionChoice = "personal" | "team" | null;
type EmailStatus = "checking" | "new" | "exists_other_subscription" | "exists_same_team" | null;

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepting, setAccepting] = useState(false);
  
  // Email status checking
  const [emailStatus, setEmailStatus] = useState<EmailStatus>(null);
  const [existingSubscriptionInfo, setExistingSubscriptionInfo] = useState<string | null>(null);
  
  // Subscription choice state for existing users
  const [hasExistingSubscription, setHasExistingSubscription] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [showSubscriptionChoice, setShowSubscriptionChoice] = useState(false);
  const [subscriptionChoice, setSubscriptionChoice] = useState<SubscriptionChoice>(null);

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link");
      setLoading(false);
      return;
    }

    loadInvitation();
  }, [token]);

  // Check if email exists when invitation is loaded (run only once)
  const emailCheckDone = useRef(false);
  useEffect(() => {
    if (invitation && !user && !emailCheckDone.current) {
      emailCheckDone.current = true;
      checkEmailStatus();
    }
  }, [invitation, user]);

  // Check subscription when user is logged in
  useEffect(() => {
    if (user && invitation) {
      // Verify user is using the invited email
      if (user.email?.toLowerCase() !== invitation.email?.toLowerCase()) {
        toast.error("Please sign in with the email address you were invited with");
        supabase.auth.signOut();
        return;
      }
      checkUserSubscription();
    }
  }, [user, invitation]);

  const loadInvitation = async () => {
    try {
      // NOTE: We intentionally avoid joining `teams` here because the teams
      // table RLS requires authentication. Unauthenticated invited users
      // would get a query error, causing "Invalid Invitation" even for
      // valid pending invitations.
      const { data, error: fetchError } = await supabase
        .from("invitations")
        .select("*")
        .eq("token", token)
        .eq("status", "pending")
        .single();

      if (fetchError) throw fetchError;

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        setError("This invitation has expired");
        setLoading(false);
        return;
      }

      // Build a teams-like object for display.
      // We can't join teams (RLS blocks unauthenticated users), so we'll
      // resolve the team name after the user authenticates. Use a placeholder.
      const enriched = {
        ...data,
        teams: { id: data.team_id, name: "the team" },
      };

      setInvitation(enriched);
    } catch (err: any) {
      setError("Invalid or expired invitation");
    } finally {
      setLoading(false);
    }
  };

  const checkEmailStatus = async () => {
    if (!invitation?.email) return;
    
    setEmailStatus("checking");
    
    // Use AbortController to add a timeout so we never hang
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    try {
      const { data, error: statusError } = await supabase.functions.invoke("invitation-account-status", {
        body: { token },
      });

      clearTimeout(timeout);

      if (statusError) {
        console.warn("Email status check returned error, defaulting to new:", statusError);
        setEmailStatus("new");
        return;
      }

      // Update team name from backend (which can read teams via service role)
      if (data?.teamName && invitation) {
        setInvitation((prev: any) => ({
          ...prev,
          teams: { ...prev?.teams, name: data.teamName },
        }));
      }

      if (data?.exists) {
        setEmailStatus("exists_other_subscription");
        setExistingSubscriptionInfo("You already have an ActiPlan account. Sign in to join this workspace.");
      } else {
        setEmailStatus("new");
      }
    } catch (err) {
      clearTimeout(timeout);
      console.error("Error checking email status:", err);
      setEmailStatus("new");
    }
  };

  const checkUserSubscription = async () => {
    if (!user) return;
    
    setCheckingSubscription(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) return;

      const { data, error } = await supabase.functions.invoke("check-subscription", {
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (error) throw error;

      // If user has an active subscription, show choice
      if (data?.subscribed) {
        setHasExistingSubscription(true);
        setShowSubscriptionChoice(true);
      }
    } catch (err) {
      console.error("Error checking subscription:", err);
    } finally {
      setCheckingSubscription(false);
    }
  };

  const acceptInvitationBackend = async (opts?: {
    accessToken?: string;
    choiceOverride?: SubscriptionChoice;
  }) => {
    if (!token) throw new Error("Missing invitation token");

    const accessToken =
      opts?.accessToken ??
      (await supabase.auth.getSession()).data.session?.access_token;

    if (!accessToken) throw new Error("Please sign in to continue");

    const { data, error: fnError } = await supabase.functions.invoke("accept-invitation", {
      body: {
        token,
        subscriptionChoice: opts?.choiceOverride ?? subscriptionChoice,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (fnError) throw fnError;
    return data as { ok: boolean; already_member?: boolean };
  };

  const finishInvite = (choice?: SubscriptionChoice, userIdOverride?: string) => {
    const mode = choice ?? subscriptionChoice;

    if (mode) {
      localStorage.setItem("actiplan_subscription_mode", mode);
    }

    const existingOnboarding = localStorage.getItem("actiplan_onboarding");
    if (!existingOnboarding) {
      localStorage.setItem(
        "actiplan_onboarding",
        JSON.stringify({
          completedAt: new Date().toISOString(),
          skippedViaTeamInvite: true,
        })
      );
    }

    // IMPORTANT: Clear signup source so trial activation doesn't fire for invited users
    // Invited users use the team owner's subscription, not their own
    localStorage.removeItem("actiplan_signup_source");

    // Set active workspace to the invited team so subscription check uses team owner's plan
    const uid = userIdOverride ?? user?.id;
    if (invitation?.team_id && uid) {
      localStorage.setItem(`actiplan.activeWorkspaceId:${uid}`, invitation.team_id);
    }
  };

  const handleCreateAccountAndJoin = async () => {
    if (!invitation) return;

    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setAccepting(true);

    try {
      // Sign up - with auto-confirm enabled, we get a session immediately
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/overview`,
          data: {
            invited_to_team: invitation.team_id,
          },
        },
      });

      if (signUpError) throw signUpError;

      // With auto-confirm enabled, signUp returns a session directly
      let accessToken = signUpData.session?.access_token;

      // If no session from signUp, try to sign in
      if (!accessToken) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password,
        });

        if (signInError) {
          // Email confirmation is likely required - store invitation for post-confirmation acceptance
          console.log("No session after signup - email confirmation likely required");
          localStorage.setItem("actiplan_pending_invitation", JSON.stringify({
            token,
            teamId: invitation.team_id,
          }));
          // Also pre-set onboarding as complete for invited users
          localStorage.setItem(
            "actiplan_onboarding",
            JSON.stringify({
              completedAt: new Date().toISOString(),
              skippedViaTeamInvite: true,
            })
          );
          localStorage.removeItem("actiplan_signup_source");
          toast.success("Account created! Please check your email to confirm, then sign in.");
          navigate(`/auth?email=${encodeURIComponent(invitation.email)}`);
          return;
        }

        accessToken = signInData.session?.access_token;
      }

      if (!accessToken) {
        // No session at all - likely needs email confirmation
        localStorage.setItem("actiplan_pending_invitation", JSON.stringify({
          token,
          teamId: invitation.team_id,
        }));
        localStorage.setItem(
          "actiplan_onboarding",
          JSON.stringify({
            completedAt: new Date().toISOString(),
            skippedViaTeamInvite: true,
          })
        );
        localStorage.removeItem("actiplan_signup_source");
        toast.success("Account created! Please check your email to confirm, then sign in.");
        navigate(`/auth?email=${encodeURIComponent(invitation.email)}`);
        return;
      }

      await acceptInvitationBackend({ accessToken });

      // Get the user ID from the session for workspace assignment
      const { data: { user: sessionUser } } = await supabase.auth.getUser();
      finishInvite(undefined, sessionUser?.id);
      toast.success("Welcome to ActiPlan! You've joined the team.");
      navigate("/app/overview");
    } catch (err: any) {
      console.error("Error creating account:", err);
      if (String(err?.message || "").toLowerCase().includes("already registered")) {
        setEmailStatus("exists_other_subscription");
        setExistingSubscriptionInfo("This email is already registered. Please sign in.");
        toast.error("This email is already registered. Please sign in instead.");
      } else {
        toast.error("Failed to create account: " + err.message);
      }
    } finally {
      setAccepting(false);
    }
  };

  const handleSignInAndJoin = async () => {
    if (!invitation || !password) return;

    setAccepting(true);

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: invitation.email,
        password,
      });

      if (signInError) throw signInError;

      const accessToken = signInData.session?.access_token;
      if (!accessToken) throw new Error("Missing session");

      // If the user already has a subscription, prompt about separate workspaces.
      const { data: subData, error: subError } = await supabase.functions.invoke("check-subscription", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!subError && subData?.subscribed) {
        setHasExistingSubscription(true);
        setShowSubscriptionChoice(true);
        toast.info("Choose how you'd like to use your workspaces.");
        return;
      }

      await acceptInvitationBackend({ accessToken });
      finishInvite();

      toast.success("Invitation accepted! Welcome to the team.");
      navigate("/app/overview");
    } catch (err: any) {
      console.error("Error signing in:", err);
      toast.error("Invalid password. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const handleAcceptInvitation = async (choiceOverride?: SubscriptionChoice) => {
    if (!invitation || !user) return;

    if (hasExistingSubscription && !choiceOverride && !subscriptionChoice) {
      setShowSubscriptionChoice(true);
      return;
    }

    setAccepting(true);

    try {
      await acceptInvitationBackend({ choiceOverride });

      finishInvite(choiceOverride);

      if ((choiceOverride ?? subscriptionChoice) === "team") {
        toast.success("Invitation accepted! You can manage your personal subscription in settings.");
      } else {
        toast.success("Invitation accepted! Welcome to the team.");
      }

      navigate("/app/overview");
    } catch (err: any) {
      console.error("Error accepting invitation:", err);
      toast.error("Failed to accept invitation: " + err.message);
    } finally {
      setAccepting(false);
    }
  };

  const handleSubscriptionChoice = (choice: SubscriptionChoice) => {
    setSubscriptionChoice(choice);
    setShowSubscriptionChoice(false);

    // Continue automatically after selecting a workspace mode
    setTimeout(() => {
      void handleAcceptInvitation(choice);
    }, 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Invalid Invitation</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/app/overview")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show subscription choice screen for logged-in users with existing subscription
  if (showSubscriptionChoice && hasExistingSubscription && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <CardTitle>Multiple Workspaces</CardTitle>
            </div>
            <CardDescription>
              You already have an ActiPlan subscription. You'll have access to both your personal workspace and{" "}
              <strong>{invitation?.teams?.name}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Option 1: Keep personal subscription */}
            <button
              onClick={() => handleSubscriptionChoice("personal")}
              className="w-full p-4 rounded-lg border-2 border-border hover:border-primary transition-colors text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold flex items-center gap-2">
                    Keep Both Workspaces
                    <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Keep your personal subscription and also join the team. You'll have access to both workspaces
                    and can switch between them.
                  </p>
                </div>
              </div>
            </button>

            {/* Option 2: Use team subscription */}
            <button
              onClick={() => handleSubscriptionChoice("team")}
              className="w-full p-4 rounded-lg border-2 border-border hover:border-primary transition-colors text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold flex items-center gap-2">
                    Use Team Subscription Only
                    <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Join the team using their subscription. You can cancel your personal subscription from settings
                    to avoid duplicate billing.
                  </p>
                </div>
              </div>
            </button>

            <div className="pt-4 border-t">
              <button
                onClick={() => setShowSubscriptionChoice(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main invitation view
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <CardTitle>Join ActiPlan</CardTitle>
          </div>
          <CardDescription>
            You've been invited to join <strong>{invitation?.teams?.name}</strong> on ActiPlan as a{" "}
            <strong>{invitation?.role}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Email field - always locked */}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={invitation?.email || ""}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground mt-1">
              You must use this email address to accept the invitation
            </p>
          </div>

          {emailStatus === "checking" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking your account status...
            </div>
          )}

          {/* User is logged in */}
          {user && (
            <>
              {checkingSubscription && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking your subscription...
                </div>
              )}

              {/* Show subscription choice indicator if already made */}
              {subscriptionChoice && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm">
                    <strong>Workspace choice:</strong>{" "}
                    {subscriptionChoice === "personal" 
                      ? "Keep both workspaces" 
                      : "Use team subscription"}
                  </p>
                  <button
                    onClick={() => setShowSubscriptionChoice(true)}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Change
                  </button>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                You're signed in as <strong>{user.email}</strong>
              </p>

              <Button
                onClick={() => void handleAcceptInvitation()}
                disabled={accepting || checkingSubscription || (hasExistingSubscription && !subscriptionChoice)}
                className="w-full"
              >
                {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {hasExistingSubscription && !subscriptionChoice 
                  ? "Choose Workspace First" 
                  : "Accept & Join Team"}
              </Button>
            </>
          )}

          {/* User is not logged in - New user flow */}
          {!user && emailStatus === "new" && (
            <>
              <p className="text-sm text-muted-foreground">
                Create a password to set up your ActiPlan account and join the team.
              </p>

              <div>
                <Label htmlFor="password">Create Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                />
              </div>

              <Button
                onClick={handleCreateAccountAndJoin}
                disabled={accepting || !password || !confirmPassword}
                className="w-full"
              >
                {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account & Join Team
              </Button>
            </>
          )}

          {/* User is not logged in - Existing user flow */}
          {!user && emailStatus === "exists_other_subscription" && (
            <>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Existing Account Found</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {existingSubscriptionInfo || "This email already has an ActiPlan account."} 
                      {" "}Sign in to join this team. You'll be able to access both workspaces.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </div>

              <Button
                onClick={handleSignInAndJoin}
                disabled={accepting || !password}
                className="w-full"
              >
                {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In & Join Team
              </Button>

              <div className="text-center">
                <Button
                  variant="link"
                  className="text-xs p-0 h-auto"
                  onClick={() => navigate("/auth?mode=reset")}
                >
                  Forgot your password?
                </Button>
              </div>
            </>
          )}

          {/* Fallback if email status not determined yet */}
          {!user && emailStatus === null && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
