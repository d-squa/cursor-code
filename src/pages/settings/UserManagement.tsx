import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
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
import { UserPlus, Trash2, Mail, Send, Copy } from "lucide-react";
import { FeatureGate } from "@/components/FeatureGate";

export default function UserManagement() {
  const { user } = useAuth();
  const { isAdmin, isOwner } = useRole();
  const queryClient = useQueryClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [inviteTeamId, setInviteTeamId] = useState<string>("");
  
  // Admins and owners can manage users
  const canManageUsers = isAdmin || isOwner;

  // Fetch users with their roles - scoped to current user's teams
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["users-with-roles", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // First, get the teams the current user belongs to (either as owner or member)
      const [{ data: ownedTeams, error: ownedError }, { data: memberTeams, error: memberError }] = await Promise.all([
        supabase.from("teams").select("id, owner_id").eq("owner_id", user.id),
        supabase.from("user_roles").select("team_id").eq("user_id", user.id),
      ]);

      if (ownedError) throw ownedError;
      if (memberError) throw memberError;

      // Collect all team IDs the user has access to
      const userTeamIds = new Set<string>();
      (ownedTeams ?? []).forEach((t: any) => userTeamIds.add(t.id));
      (memberTeams ?? []).forEach((r: any) => {
        if (r.team_id) userTeamIds.add(r.team_id);
      });

      if (userTeamIds.size === 0) return [];

      const teamIdArray = Array.from(userTeamIds);

      // Fetch roles and teams for users in these teams only
      const [{ data: teamRoles, error: rolesError }, { data: teamsData, error: teamsError }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role, team_id").in("team_id", teamIdArray),
        supabase.from("teams").select("id, owner_id").in("id", teamIdArray),
      ]);

      if (rolesError) throw rolesError;
      if (teamsError) throw teamsError;

      // Get unique user IDs from roles + team owners
      const userIdsInTeams = new Set<string>();
      (teamRoles ?? []).forEach((r: any) => userIdsInTeams.add(r.user_id));
      (teamsData ?? []).forEach((t: any) => userIdsInTeams.add(t.owner_id));

      if (userIdsInTeams.size === 0) return [];

      // Fetch profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", Array.from(userIdsInTeams))
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Build role map from accessible teams only - include "owner" role from user_roles
      const rolesByUser = new Map<string, Set<string>>();
      (teamRoles ?? []).forEach((r: any) => {
        const set = rolesByUser.get(r.user_id) ?? new Set<string>();
        set.add(r.role);
        rolesByUser.set(r.user_id, set);
      });

      // For team owners who might not have a user_roles entry, add "owner" to their roles
      (teamsData ?? []).forEach((t: any) => {
        if (t.owner_id) {
          const set = rolesByUser.get(t.owner_id) ?? new Set<string>();
          set.add("owner");
          rolesByUser.set(t.owner_id, set);
        }
      });

      // Pick the highest priority role from all roles the user has
      const priority = ["owner", "admin", "campaign_manager", "collaborator", "member", "viewer"] as const;
      const pickRole = (userId: string) => {
        const roles = rolesByUser.get(userId);
        if (!roles || roles.size === 0) return "member";
        return priority.find((p) => roles.has(p)) ?? "member";
      };

      return (profiles ?? []).map((profile: any) => ({ ...profile, role: pickRole(profile.id) }));
    },
    enabled: !!user?.id,
  });

  // Fetch all teams for invitation dropdown
  const { data: teams } = useQuery({
    queryKey: ["teams-for-invite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch pending invitations
  const { data: invitations } = useQuery({
    queryKey: ["invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select(`
          *,
          teams (name)
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
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
      setInviteTeamId("");
    },
    onError: (error) => {
      toast.error("Failed to send invitation: " + error.message);
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
      // Get team name for email
      const { data: team } = await supabase
        .from("teams")
        .select("name")
        .eq("id", invitation.team_id)
        .single();

      // Send invitation email
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
    if (!inviteEmail || !inviteRole || !inviteTeamId) {
      toast.error("Please fill in all fields");
      return;
    }

    createInvitation.mutate({
      email: inviteEmail,
      role: inviteRole,
      teamId: inviteTeamId,
    });
  };

  if (loadingUsers) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading ActiPlanners...</div>
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
            {canManageUsers 
              ? "Invite ActiPlanners, manage permissions, and assign teams"
              : "View team members in your organization"
            }
          </p>
        </div>
        
        {canManageUsers && (
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
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
                  <Select value={inviteTeamId} onValueChange={setInviteTeamId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams?.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((userItem: any) => (
              <TableRow key={userItem.id}>
                <TableCell>{userItem.email}</TableCell>
                <TableCell>
                  {userItem.role ? (
                    <Badge variant={userItem.role === 'owner' ? 'default' : userItem.role === 'admin' ? 'secondary' : 'outline'}>
                      {userItem.role.replace('_', ' ')}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{userItem.company_name || "—"}</TableCell>
                <TableCell>
                  {new Date(userItem.created_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
    </FeatureGate>
  );
}
