import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accepting, setAccepting] = useState(false);

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link");
      setLoading(false);
      return;
    }

    loadInvitation();
  }, [token]);

  const loadInvitation = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("invitations")
        .select(`
          *,
          teams (id, name)
        `)
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

      setInvitation(data);
    } catch (err: any) {
      setError("Invalid or expired invitation");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!invitation) return;

    setAccepting(true);

    try {
      let userId = user?.id;

      // If user is not logged in, create account
      if (!userId) {
        if (password !== confirmPassword) {
          toast.error("Passwords don't match");
          setAccepting(false);
          return;
        }

        if (password.length < 6) {
          toast.error("Password must be at least 6 characters");
          setAccepting(false);
          return;
        }

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: invitation.email,
          password,
        });

        if (signUpError) throw signUpError;
        userId = signUpData.user?.id;

        if (!userId) throw new Error("Failed to create account");
      }

      // Add user to team with role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: userId,
          team_id: invitation.team_id,
          role: invitation.role,
        });

      if (roleError) throw roleError;

      // Update invitation status
      const { error: updateError } = await supabase
        .from("invitations")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invitation.id);

      if (updateError) throw updateError;

      toast.success("Invitation accepted! Welcome to the team.");
      
      // Redirect to dashboard
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (err: any) {
      console.error("Error accepting invitation:", err);
      toast.error("Failed to accept invitation: " + err.message);
    } finally {
      setAccepting(false);
    }
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
            <Button onClick={() => navigate("/")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <CardTitle>Accept Invitation</CardTitle>
          </div>
          <CardDescription>
            You've been invited to join <strong>{invitation?.teams?.name}</strong> as a{" "}
            <strong>{invitation?.role}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user ? (
            <>
              <p className="text-sm text-muted-foreground">
                Create a password to accept this invitation and create your account.
              </p>
              
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={invitation?.email || ""}
                  disabled
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
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
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You're logged in as <strong>{user.email}</strong>
              </p>
              <p className="text-sm">
                Click below to accept the invitation and join the team.
              </p>
            </div>
          )}

          <Button
            onClick={handleAcceptInvitation}
            disabled={accepting || (!user && (!password || !confirmPassword))}
            className="w-full"
          >
            {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {user ? "Accept Invitation" : "Create Account & Accept"}
          </Button>

          {!user && (
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Button
                variant="link"
                className="p-0 h-auto"
                onClick={() => navigate("/auth")}
              >
                Sign in
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
