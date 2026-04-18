import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSampleMode } from "@/contexts/SampleModeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Trash2, Mail, Send, Copy, MoreHorizontal, UserMinus, AlertTriangle } from "lucide-react";
import { FeatureGate } from "@/components/FeatureGate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function UserManagement() {
  const { user } = useAuth();
  const { workspaces, activeWorkspaceId, activeWorkspace, loading: workspacesLoading } = useWorkspace();
  const queryClient = useQueryClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [inviteTeamId, setInviteTeamId] = useState<string>("");
  const [removeConfirm, setRemoveConfirm] = useState<{ userId: string; email: string; type: "team" | "platform" } | null>(null);

  useEffect(() => {
    if (activeWorkspaceId) setInviteTeamId(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const { data: myTeamRole } = useQuery({
    queryKey: ["my-team-role", user?.id, activeWorkspaceId, activeWorkspace?.owner_id],
    enabled: !!user?.id && !!activeWorkspaceId,
    queryFn: async () => {
      if (!user?.id || !activeWorkspaceId) return null;
      if (activeWorkspace?.owner_id === user.id) return "owner";

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("team_id", activeWorkspaceId)
        .maybeSingle();

      if (error) throw error;
      return (data?.role as string | null) ?? "member";
    },
  });

  // Admins and owners can manage users (within the active workspace)
  const canManageUsers = myTeamRole === "owner" || myTeamRole === "admin";
  const { isSampleMode } = useSampleMode();

  const activeWorkspaceName = useMemo(() => activeWorkspace?.name ?? "Workspace", [activeWorkspace?.name]);

  // Fetch users with their roles - scoped to active workspace
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["users-with-roles", user?.id, activeWorkspaceId],
    queryFn: async () => {
      if (!user?.id || !activeWorkspaceId) return [];

      const [{ data: team, error: teamError }, { data: teamRoles, error: rolesError }] = await Promise.all([
        supabase.from("teams").select("id, owner_id").eq("id", activeWorkspaceId).single(),
        supabase.from("user_roles").select("user_id, role").eq("team_id", activeWorkspaceId),
      ]);

      if (teamError) throw teamError;
      if (rolesError) throw rolesError;

      const userIds = new Set<string>();
      (teamRoles ?? []).forEach((r: any) => userIds.add(r.user_id));
      if (team?.owner_id) userIds.add(team.owner_id);

      if (userIds.size === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", Array.from(userIds))
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const rolesByUser = new Map<string, Set<string>>();
      (teamRoles ?? []).forEach((r: any) => {
        const set = rolesByUser.get(r.user_id) ?? new Set<string>();
        set.add(r.role);
        rolesByUser.set(r.user_id, set);
      });

      const priority = ["admin", "campaign_manager", "collaborator", "member", "viewer"] as const;
      const pickRole = (userId: string) => {
        if (team?.owner_id && userId === team.owner_id) return "owner";

        const roles = rolesByUser.get(userId);
        if (!roles || roles.size === 0) return "member";
        return priority.find((p) => roles.has(p)) ?? "member";
      };

      return (profiles ?? []).map((profile: any) => ({ ...profile, role: pickRole(profile.id) }));
    },
    enabled: !!user?.id && !!activeWorkspaceId,
  });

  const teams = workspaces;


  // Fetch pending invitations (active workspace only)
  const { data: invitations } = useQuery({
    queryKey: ["invitations", activeWorkspaceId],
    queryFn: async () => {
      if (!activeWorkspaceId) return [];

      const { data, error } = await supabase
        .from("invitations")
        .select(
          `
          *,
          teams (name)
        `
        )
        .eq("status", "pending")
        .eq("team_id", activeWorkspaceId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!activeWorkspaceId,
  });

  // Create invitation mutation
  const createInvitation = useMutation({
    mutationFn: async ({ email, role, teamId }: { email: string; role: string; teamId: string }) => {
      // Generate unique token
      const token = crypto.randomUUID();

      // Create invitation
      const { data: invitation, error: inviteError } = await supabase
        .from("invitations")
        .insert([{
          email,
          role: role as any,
          team_id: teamId,
          token,
          created_by: user?.id,
        }])
        .select()
        .single();

      if (inviteError) throw inviteError;

      // Get team name for email
      const { data: team } = await supabase
        .from("teams")
        .select("name")
        .eq("id", teamId)
        .single();

      // Send invitation email
      const { error: emailError } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email,
          teamName: team?.name || "Team",
          role,
          invitationToken: token,
          origin: window.location.origin,
        },
      });

      if (emailError) throw emailError;

      return invitation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation sent successfully!");
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      setInviteTeamId(activeWorkspaceId || "");
    },
    onError: (error) => {
      toast.error("Failed to send invitation: " + error.message);
    },
  });

  // Remove user from team mutation
  const removeUserFromTeam = useMutation({
    mutationFn: async (userId: string) => {
      if (!activeWorkspaceId) throw new Error("No active workspace");
      
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("team_id", activeWorkspaceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast.success(`User removed from ${activeWorkspaceName}`);
      setRemoveConfirm(null);
    },
    onError: (error) => {
      toast.error("Failed to remove user: " + error.message);
    },
  });

  // Remove user from ALL teams (platform-wide)
  const removeUserFromPlatform = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast.success("User removed from all teams");
      setRemoveConfirm(null);
    },
    onError: (error) => {
      toast.error("Failed to remove user: " + error.message);
    },
  });

  // Update user role mutation
  const updateUserRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      if (!activeWorkspaceId) throw new Error("No active workspace");

      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole as any })
        .eq("user_id", userId)
        .eq("team_id", activeWorkspaceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast.success("Role updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update role: " + error.message);
    },
  });

  // Cancel invitation mutation
  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "cancelled" })
        .eq("id", invitationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation cancelled");
    },
    onError: (error) => {
      toast.error("Failed to cancel invitation: " + error.message);
    },
  });

  // Resend invitation mutation
  const resendInvitation = useMutation({
    mutationFn: async (invitation: any) => {
      const { data: team } = await supabase
        .from("teams")
        .select("name")
        .eq("id", invitation.team_id)
        .single();

      const { error: emailError } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: invitation.email,
          teamName: team?.name || "Team",
          role: invitation.role,
          invitationToken: invitation.token,
        },
      });

      if (emailError) throw emailError;
    },
    onSuccess: () => {
      toast.success("Invitation resent successfully!");
    },
    onError: (error) => {
      toast.error("Failed to resend invitation: " + error.message);
    },
  });

  const copyInvitationUrl = (token: string) => {
    const baseUrl = window.location.origin;
    const invitationUrl = `${baseUrl}/accept-invitation?token=${token}`;
    
    navigator.clipboard.writeText(invitationUrl).then(() => {
      toast.success("Invitation URL copied to clipboard!");
    }).catch(() => {
      toast.error("Failed to copy URL");
    });
  };

  const handleInvite = () => {
    if (!inviteEmail || !inviteRole || !activeWorkspaceId) {
      toast.error("Please fill in all fields");
      return;
    }

    createInvitation.mutate({
      email: inviteEmail,
      role: inviteRole,
      teamId: activeWorkspaceId,
    });
  };

  if (workspacesLoading || loadingUsers) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading team members...</div>
      </div>
    );
  }

  return (
    <FeatureGate feature="user_management">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {canManageUsers ? "ActiPlanner Management" : "Team Members"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Workspace: <span className="font-medium text-foreground">{activeWorkspaceName}</span>
          </p>
        </div>

        {canManageUsers && (
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isSampleMode} title={isSampleMode ? "Disabled in Sample Mode" : undefined}>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite ActiPlanner
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite New ActiPlanner</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="actiplanner@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="team">Team</Label>
                  <Input
                    value={activeWorkspace?.name || "Current Workspace"}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="campaign_manager">Campaign Manager</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleInvite} 
                  className="w-full"
                  disabled={createInvitation.isPending}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Send Invitation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Pending Invitations - only show to admins/owners */}
      {canManageUsers && invitations && invitations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Pending Invitations</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation: any) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>{invitation.teams?.name || "N/A"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{invitation.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(invitation.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {new Date(invitation.expires_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resendInvitation.mutate(invitation)}
                        title="Resend invitation"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyInvitationUrl(invitation.token)}
                        title="Copy invitation URL"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelInvitation.mutate(invitation.id)}
                        title="Cancel invitation"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Active ActiPlanners */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          {canManageUsers ? "Active ActiPlanners" : "Team Members"}
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Joined</TableHead>
              {canManageUsers && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((userItem: any) => {
              const isOwner = userItem.role === "owner";
              const isSelf = userItem.id === user?.id;
              const canModify = canManageUsers && !isOwner && !isSelf;

              return (
                <TableRow key={userItem.id}>
                  <TableCell>{userItem.email}</TableCell>
                  <TableCell>
                    {canModify ? (
                      <Select
                        value={userItem.role}
                        onValueChange={(newRole) =>
                          updateUserRole.mutate({ userId: userItem.id, newRole })
                        }
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="campaign_manager">Campaign Manager</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : userItem.role ? (
                      <Badge
                        variant={
                          isOwner ? "default" : userItem.role === "admin" ? "secondary" : "outline"
                        }
                      >
                        {userItem.role.replace("_", " ")}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{userItem.company_name || "—"}</TableCell>
                  <TableCell>
                    {new Date(userItem.created_at).toLocaleDateString()}
                  </TableCell>
                  {canManageUsers && (
                    <TableCell>
                      {canModify && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setRemoveConfirm({ userId: userItem.id, email: userItem.email, type: "team" })}
                            >
                              <UserMinus className="mr-2 h-4 w-4" />
                              Remove from this team
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setRemoveConfirm({ userId: userItem.id, email: userItem.email, type: "platform" })}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove from all teams
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!removeConfirm} onOpenChange={(open) => !open && setRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {removeConfirm?.type === "team" ? "Remove from team" : "Remove from all teams"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeConfirm?.type === "team" ? (
                <>
                  This will remove <strong>{removeConfirm?.email}</strong> from <strong>{activeWorkspaceName}</strong> only.
                  They will retain access to any other teams they belong to.
                </>
              ) : (
                <>
                  This will remove <strong>{removeConfirm?.email}</strong> from <strong>all assigned teams</strong> on the platform.
                  They will lose access to every workspace. This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!removeConfirm) return;
                if (removeConfirm.type === "team") {
                  removeUserFromTeam.mutate(removeConfirm.userId);
                } else {
                  removeUserFromPlatform.mutate(removeConfirm.userId);
                }
              }}
            >
              {removeConfirm?.type === "team" ? "Remove from team" : "Remove from all teams"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </FeatureGate>
  );
}
