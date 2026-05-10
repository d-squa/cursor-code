import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input"; import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { FeatureGate } from "@/components/FeatureGate";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Team = Tables<"teams">;
type AppRole = Enums<"app_role">;

export default function Teams() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [newTeam, setNewTeam] = useState({ name: "", description: "" });
  const [inviteData, setInviteData] = useState({ email: "", role: "member" });

  // Fetch teams
  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Team[];
    },
  });

  // Fetch team members for selected team
  const { data: teamMembers } = useQuery({
    queryKey: ["team-members", selectedTeam?.id],
    queryFn: async () => {
      if (!selectedTeam) return [];
      
      // Get user_roles for this team
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role, team_id")
        .eq("team_id", selectedTeam.id);
      
      if (error) throw error;

      // Collect user IDs from roles
      let userIds = data?.map(r => r.user_id) || [];
      
      // Also include the team owner if not already in user_roles
      if (selectedTeam.owner_id && !userIds.includes(selectedTeam.owner_id)) {
        userIds.push(selectedTeam.owner_id);
      }
      
      if (userIds.length === 0) return [];
      
      // Fetch profiles for all users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, company_name")
        .in("id", userIds);
      
      if (profilesError) throw profilesError;

      // Build result: start with user_roles entries
      const result = (data || []).map(role => ({
        ...role,
        profile: profiles?.find(p => p.id === role.user_id) || null
      }));
      
      // Add team owner if they don't have a user_role entry for this team
      const ownerHasRole = data?.some(r => r.user_id === selectedTeam.owner_id);
      if (!ownerHasRole && selectedTeam.owner_id) {
        const ownerProfile = profiles?.find(p => p.id === selectedTeam.owner_id);
        result.unshift({
          id: `owner-${selectedTeam.id}`,
          user_id: selectedTeam.owner_id,
          role: "owner" as AppRole,
          team_id: selectedTeam.id,
          profile: ownerProfile || null
        });
      }
      
      return result;
    },
    enabled: !!selectedTeam,
  });

  // Create team mutation
  const createTeam = useMutation({
    mutationFn: async (team: { name: string; description: string }) => {
      const { data, error } = await supabase
        .from("teams")
        .insert([{ ...team, owner_id: user?.id }])
        .select()
        .single();
      
      if (error) throw error;

      // Owner row is required for RLS elsewhere; roll back the team if this fails.
      if (user?.id && data) {
        const { error: roleError } = await supabase.from("user_roles").insert([
          {
            user_id: user.id,
            role: "owner" as AppRole,
            team_id: data.id,
          },
        ]);

        if (roleError) {
          await supabase.from("teams").delete().eq("id", data.id);
          throw roleError;
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setIsCreateDialogOpen(false);
      setNewTeam({ name: "", description: "" });
      toast.success("Team created successfully");
    },
    onError: () => {
      toast.error("Failed to create team");
    },
  });

  // Update team mutation
  const updateTeam = useMutation({
    mutationFn: async (team: { id: string; name: string; description: string }) => {
      const { error } = await supabase
        .from("teams")
        .update({ name: team.name, description: team.description })
        .eq("id", team.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setIsEditDialogOpen(false);
      toast.success("Team updated successfully");
    },
    onError: () => {
      toast.error("Failed to update team");
    },
  });

  // Delete team mutation
  const deleteTeam = useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase
        .from("teams")
        .delete()
        .eq("id", teamId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Team deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete team");
    },
  });

  // Invite user mutation
  const inviteUser = useMutation({
    mutationFn: async (data: { email: string; role: string; teamId: string }) => {
      // Find user by email
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", data.email)
        .maybeSingle();
      
      if (profileError || !profile) throw new Error("ActiPlanner not found");
      
      // Add user to team with role
      const { error } = await supabase
        .from("user_roles")
        .insert([{
          user_id: profile.id,
          role: data.role as AppRole,
          team_id: data.teamId,
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      setIsInviteDialogOpen(false);
      setInviteData({ email: "", role: "member" });
      toast.success("ActiPlanner invited successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to invite ActiPlanner");
    },
  });

  // Remove team member mutation
  const removeMember = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Member removed successfully");
    },
    onError: () => {
      toast.error("Failed to remove member");
    },
  });

  // Update member role mutation
  const updateMemberRole = useMutation({
    mutationFn: async (data: { roleId: string; newRole: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: data.newRole })
        .eq("id", data.roleId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Role updated successfully");
    },
    onError: () => {
      toast.error("Failed to update role");
    },
  });

  if (teamsLoading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <FeatureGate feature="team_management">
    <div className="container mx-auto p-8 max-w-7xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Teams Management</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Team
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Team</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="name">Team Name</Label>
                <Input
                  id="name"
                  value={newTeam.name}
                  onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                  placeholder="Enter team name"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={newTeam.description}
                  onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                  placeholder="Enter team description"
                />
              </div>
              <Button
                onClick={() => createTeam.mutate(newTeam)}
                disabled={!newTeam.name}
                className="w-full"
              >
                Create Team
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Teams List */}
        <Card>
          <CardHeader>
            <CardTitle>Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teams?.map((team) => (
                <Card key={team.id} className="cursor-pointer hover:bg-accent" onClick={() => setSelectedTeam(team)}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{team.name}</h3>
                        <p className="text-sm text-muted-foreground">{team.description}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTeam(team);
                            setNewTeam({ name: team.name, description: team.description || "" });
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Are you sure you want to delete this team?")) {
                              deleteTeam.mutate(team.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>
                {selectedTeam ? `${selectedTeam.name} Members` : "Select a team"}
              </CardTitle>
              {selectedTeam && (
                <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <UserPlus className="mr-2 h-4 w-4" />
                      Invite
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite ActiPlanner to Team</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={inviteData.email}
                          onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                          placeholder="actiplanner@example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="role">Role</Label>
                        <Select
                          value={inviteData.role}
                          onValueChange={(value) => setInviteData({ ...inviteData, role: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="campaign_manager">Campaign Manager</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="collaborator">Collaborator</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={() => inviteUser.mutate({ ...inviteData, teamId: selectedTeam.id })}
                        disabled={!inviteData.email}
                        className="w-full"
                      >
                        Invite ActiPlanner
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedTeam ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers?.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>{member.profile?.email || "Unknown"}</TableCell>
                      <TableCell>{member.profile?.company_name || "-"}</TableCell>
                      <TableCell>
                        {member.role === "owner" ? (
                          <Badge>Owner</Badge>
                        ) : (
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              updateMemberRole.mutate({ roleId: member.id, newRole: value as AppRole })
                            }
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="campaign_manager">Campaign Manager</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="collaborator">Collaborator</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("Remove this member from the team?")) {
                              removeMember.mutate(member.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Select a team to view its members
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Team Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="edit-name">Team Name</Label>
              <Input
                id="edit-name"
                value={newTeam.name}
                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={newTeam.description}
                onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
              />
            </div>
            <Button
              onClick={() => selectedTeam && updateTeam.mutate({ ...newTeam, id: selectedTeam.id })}
              className="w-full"
            >
              Update Team
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </FeatureGate>
  );
}
