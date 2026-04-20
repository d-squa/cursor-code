import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertTriangle, Copy, Check, GraduationCap, RotateCcw, Eye, EyeOff } from "lucide-react";
import { useTourDataContext } from "@/contexts/TourDataContext";
import { resetOnboardingTour } from "@/components/OnboardingTour";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AccountSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Fetch billing customer (license/subscription ID)
  const { data: billingCustomer } = useQuery({
    queryKey: ["billing-customer"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data } = await supabase
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      return data;
    },
  });

  // Fetch user profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", error);
        // Return a fallback with email from auth user
        return { 
          id: userData.user.id, 
          email: userData.user.email || "", 
          company_name: null 
        };
      }
      
      // If no profile found due to RLS, use auth user email
      if (!data) {
        return { 
          id: userData.user.id, 
          email: userData.user.email || "", 
          company_name: null 
        };
      }
      
      setCompanyName(data.company_name || "");
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setPhoneNumber(data.phone || "");
      setAddressLine1(data.address_line1 || "");
      setAddressCity(data.address_city || "");
      setAddressState(data.address_state || "");
      setAddressPostalCode(data.address_postal_code || "");
      setAddressCountry(data.address_country || "");
      return data;
    },
  });

  // Update profile mutation
  const updateProfile = useMutation({
    mutationFn: async (data: {
      company_name: string;
      first_name: string;
      last_name: string;
      phone: string;
      address_line1: string;
      address_city: string;
      address_state: string;
      address_postal_code: string;
      address_country: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({
          company_name: data.company_name,
          first_name: data.first_name || null,
          last_name: data.last_name || null,
          phone: data.phone || null,
          full_name: `${data.first_name} ${data.last_name}`.trim() || null,
          address_line1: data.address_line1 || null,
          address_city: data.address_city || null,
          address_state: data.address_state || null,
          address_postal_code: data.address_postal_code || null,
          address_country: data.address_country || null,
        })
        .eq("id", userData.user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated successfully");
    },
    onError: () => {
      toast.error("Failed to update profile");
    },
  });

  // Update password mutation
  const updatePassword = useMutation({
    mutationFn: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update password");
    },
  });

  const handleUpdateProfile = () => {
    if (!firstName.trim() || !lastName.trim() || !phoneNumber.trim()) {
      toast.error("First name, last name, and phone number are required");
      return;
    }
    updateProfile.mutate({
      company_name: companyName,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phoneNumber.trim(),
      address_line1: addressLine1,
      address_city: addressCity,
      address_state: addressState,
      address_postal_code: addressPostalCode,
      address_country: addressCountry,
    });
  };

  const handleUpdatePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    updatePassword.mutate(newPassword);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }

    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("delete-account", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Account deleted successfully");
      await supabase.auth.signOut();
      navigate("/");
    } catch (error: any) {
      console.error("Delete account error:", error);
      toast.error(error.message || "Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Account Settings</h2>
        <p className="text-muted-foreground mt-2">
          Manage your profile information and security settings
        </p>
      </div>

      {/* Account IDs Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Account IDs</CardTitle>
          <CardDescription>
            Your unique identifiers for reference and support
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-xs text-muted-foreground">User ID</p>
              <p className="font-mono text-sm">{profile?.id || "—"}</p>
            </div>
            {profile?.id && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(profile.id, "userId")}>
                {copiedField === "userId" ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-xs text-muted-foreground">License ID</p>
              <p className="font-mono text-sm">{billingCustomer?.stripe_customer_id || "No active license"}</p>
            </div>
            {billingCustomer?.stripe_customer_id && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(billingCustomer.stripe_customer_id, "licenseId")}>
                {copiedField === "licenseId" ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your account profile information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={profile?.email || ""}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed. Contact support if you need to update it.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">Company Name</Label>
            <Input
              id="company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter your company name"
            />
          </div>

          <Separator />
          <p className="text-sm font-medium">Address (Optional)</p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="addressLine1">Street Address</Label>
              <Input
                id="addressLine1"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="addressCity">City</Label>
                <Input
                  id="addressCity"
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  placeholder="New York"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressState">State / Region</Label>
                <Input
                  id="addressState"
                  value={addressState}
                  onChange={(e) => setAddressState(e.target.value)}
                  placeholder="NY"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="addressPostalCode">Postal Code</Label>
                <Input
                  id="addressPostalCode"
                  value={addressPostalCode}
                  onChange={(e) => setAddressPostalCode(e.target.value)}
                  placeholder="10001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressCountry">Country</Label>
                <Input
                  id="addressCountry"
                  value={addressCountry}
                  onChange={(e) => setAddressCountry(e.target.value)}
                  placeholder="US"
                />
              </div>
            </div>
          </div>

          <Button 
            onClick={handleUpdateProfile} 
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>

          <Button 
            onClick={handleUpdatePassword} 
            disabled={updatePassword.isPending || !newPassword || !confirmPassword}
          >
            {updatePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </Button>
        </CardContent>
      </Card>

      {/* Tour & Sample Data */}
      <TourSettingsCard />

      {/* Delete Account */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Delete Account
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete My Account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-4">
                  <p>
                    This will permanently delete your account, cancel any active subscriptions, 
                    and remove all your data. This action cannot be undone.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="delete-confirm">
                      Type <span className="font-bold">DELETE</span> to confirm
                    </Label>
                    <Input
                      id="delete-confirm"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="DELETE"
                    />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirmation("")}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmation !== "DELETE" || isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete Account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

function TourSettingsCard() {
  const navigate = useNavigate();
  const { isSeeded, isVisible, toggleVisibility, seedTourData, loading } = useTourDataContext();

  const handleReplayTour = () => {
    resetOnboardingTour();
    navigate("/app/overview");
    window.location.reload();
  };

  const handleSeedData = async () => {
    await seedTourData();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          Interactive Tour & Sample Data
        </CardTitle>
        <CardDescription>
          Manage the onboarding tour and sample demo data used to explore the platform.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Replay Onboarding Tour</p>
            <p className="text-xs text-muted-foreground">Walk through the platform features again</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReplayTour} className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" />
            Replay Tour
          </Button>
        </div>

        <Separator />

        {isSeeded ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Show Sample Tour Data</p>
              <p className="text-xs text-muted-foreground">
                {isVisible ? "Sample data is currently visible across the platform" : "Sample data is hidden from all views"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isVisible ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
              <Switch checked={isVisible} onCheckedChange={toggleVisibility} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Load Sample Data</p>
              <p className="text-xs text-muted-foreground">Create demo connections, campaign, and performance data</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleSeedData} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
              Load Sample Data
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
