import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, UserPlus } from "lucide-react";
import { AssignTeamMembersDialog } from "@/components/teams/AssignTeamMembersDialog";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { FeatureGate } from "@/components/FeatureGate";
import { getMaxTeamsForTier } from "@/config/subscriptionTiers";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { formatTeamRoleLabel } from "@/utils/campaignPermissions";
import { TeamRoleSelectItems } from "@/components/roles/RoleSelectItems";

type Team = Tables<"teams">;
type AppRole = Enums<"app_role">;

function parseRpcInt(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "boolean") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (Array.isArray(v)) return v.length === 0 ? 0 : parseRpcInt(v[0]);
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if ("count" in o) return parseRpcInt(o.count);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const ROLE_PRIORITY = [
  "owner",
  "admin",
  "campaign_manager",
  "collaborator",
  "member",
  "viewer",
] as const;

function strongestAppRole(roles: Set<string>): string {
  for (const p of ROLE_PRIORITY) {
    if (roles.has(p)) return p;
  }
  return "member";
}

function formatRoleLabel(role: string): string {
  return formatTeamRoleLabel(role);
}

export default function Teams() {
  const { user } = useAuth();
  const { activeWorkspaceId, activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const billingWorkspaceId = activeWorkspace?.workspace_id ?? null;
  const { tier } = useSubscription();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [newTeam, setNewTeam] = useState({ name: "", description: "" });
  const [teamRoleChangeConfirm, setTeamRoleChangeConfirm] = useState<{
    targetUserId: string;
    email: string;
    fromRole: string;
    toRole: AppRole;
  } | null>(null);

  /** Same semantics as User Management: billing owner or strongest role owner/admin across workspace teams. */
  const { data: myTeamRole, isPending: myTeamRolePending } = useQuery({
    queryKey: [
      "user-mgmt-my-role",
      user?.id,
      activeWorkspaceId,
      billingWorkspaceId,
      activeWorkspace?.owner_id,
    ],
    enabled: !!user?.id && !!activeWorkspaceId,
    queryFn: async () => {
      if (!user?.id || !activeWorkspaceId) return null;

      if (billingWorkspaceId) {
        const { data: ws, error: wsErr } = await supabase
          .from("workspaces")
          .select("owner_id")
          .eq("id", billingWorkspaceId)
          .maybeSingle();
        if (wsErr) throw wsErr;
        if (ws?.owner_id === user.id) return "owner";

        const { data: wsTeams, error: teamsErr } = await supabase
          .from("teams")
          .select("id")
          .eq("workspace_id", billingWorkspaceId);
        if (teamsErr) throw teamsErr;
        const teamIds = (wsTeams ?? []).map((t: { id: string }) => t.id).filter(Boolean);
        if (teamIds.length === 0) return "member";

        const { data: roleRows, error: rolesErr } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .in("team_id", teamIds);
        if (rolesErr) throw rolesErr;
        const set = new Set<string>();
        (roleRows ?? []).forEach((r: { role?: string }) => {
          if (r.role) set.add(r.role);
        });
        return strongestAppRole(set);
      }

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

  const canManageWorkspaceTeams =
    !myTeamRolePending && (myTeamRole === "owner" || myTeamRole === "admin");

  // Fetch teams (scope to billing workspace when present so roster matches subscription container)
  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", billingWorkspaceId],
    queryFn: async () => {
      let q = supabase.from("teams").select("*").order("created_at", { ascending: false });
      if (billingWorkspaceId) {
        q = q.eq("workspace_id", billingWorkspaceId);
      }
      const { data, error } = await q;

      if (error) throw error;
      return data as Team[];
    },
  });

  useEffect(() => {
    if (!teams?.length) return;
    if (selectedTeam && teams.some((t) => t.id === selectedTeam.id)) return;
    setSelectedTeam(teams[0]);
  }, [teams, selectedTeam]);

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
      if (!user?.id) throw new Error("Not authenticated");
      if (myTeamRolePending) throw new Error("Still loading workspace permissions");
      if (myTeamRole !== "owner" && myTeamRole !== "admin") {
        throw new Error("Only workspace owners and admins can create teams");
      }
      const maxTeams = getMaxTeamsForTier(tier);

      let billingWsId = billingWorkspaceId;
      if (!billingWsId) {
        const { data: ws, error: wsError } = await supabase
          .from("workspaces")
          .select("id")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (wsError) throw wsError;
        billingWsId = ws?.id ?? null;
      }

      if (!billingWsId) {
        throw new Error(
          "No billing workspace found. Complete onboarding or refresh the page.",
        );
      }

      const { count, error: countError } = await supabase
        .from("teams")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", billingWsId);

      if (countError) throw countError;
      if ((count ?? 0) >= maxTeams) {
        throw new Error(
          `Your plan allows up to ${maxTeams} team(s) in your workspace. Upgrade to add more.`,
        );
      }

      const { data, error } = await supabase
        .from("teams")
        .insert([
          {
            ...team,
            owner_id: user?.id,
            workspace_id: billingWsId,
            is_default: false,
          },
        ])
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
      if (myTeamRolePending) throw new Error("Still loading workspace permissions");
      if (myTeamRole !== "owner" && myTeamRole !== "admin") {
        throw new Error("Only workspace owners and admins can edit teams");
      }
      const target = teams?.find((t) => t.id === team.id) ?? selectedTeam;
      if (!target) throw new Error("Team not found");
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
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update team");
    },
  });

  // Delete team mutation
  const deleteTeam = useMutation({
    mutationFn: async (teamId: string) => {
      if (myTeamRolePending) throw new Error("Still loading workspace permissions");
      if (myTeamRole !== "owner" && myTeamRole !== "admin") {
        throw new Error("Only workspace owners and admins can delete teams");
      }
      const target = teams?.find((t) => t.id === teamId) ?? selectedTeam;
      if (!target) throw new Error("Team not found");
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
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete team");
    },
  });

  const existingMemberUserIds = useMemo(() => {
    const ids = new Set<string>();
    (teamMembers ?? []).forEach((m) => {
      if (m.user_id) ids.add(m.user_id);
    });
    if (selectedTeam?.owner_id) ids.add(selectedTeam.owner_id);
    return [...ids];
  }, [teamMembers, selectedTeam?.owner_id]);

  // Remove team member (RPC â€” direct DELETE is often blocked by RLS for billing owners without a row on this team)
  const removeMember = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!selectedTeam?.id) throw new Error("No team selected");
      if (myTeamRolePending) throw new Error("Still loading workspace permissions");
      if (myTeamRole !== "owner" && myTeamRole !== "admin") {
        throw new Error("Only workspace owners and admins can remove team members");
      }
      if (targetUserId === user?.id) {
        throw new Error("You cannot remove yourself from the team here.");
      }
      if (selectedTeam.owner_id === targetUserId) {
        throw new Error("Transfer team ownership before removing the team owner.");
      }

      const { data: removed, error } = await supabase.rpc("remove_team_member_from_team", {
        p_target_user_id: targetUserId,
        p_team_id: selectedTeam.id,
      });

      if (error) throw error;
      const n = parseRpcInt(removed);
      if (n < 1) {
        throw new Error("No membership was removed. They may not be on this team, or you may lack permission.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Member removed successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove member");
    },
  });

  // Update member role (RPC â€” direct UPDATE is often blocked by RLS)
  const updateMemberRole = useMutation({
    mutationFn: async (data: { targetUserId: string; newRole: AppRole }) => {
      if (!selectedTeam?.id) throw new Error("No team selected");
      if (myTeamRolePending) throw new Error("Still loading workspace permissions");
      if (myTeamRole !== "owner" && myTeamRole !== "admin") {
        throw new Error("Only workspace owners and admins can change member roles");
      }
      if (data.targetUserId === user?.id) {
        throw new Error("You cannot change your own role here.");
      }
      if (selectedTeam.owner_id === data.targetUserId) {
        throw new Error("Transfer team ownership before changing the team owner role.");
      }

      const { data: updated, error } = await supabase.rpc("update_team_member_role", {
        p_team_id: selectedTeam.id,
        p_target_user_id: data.targetUserId,
        p_new_role: data.newRole,
      });

      if (error) throw error;
      const n = parseRpcInt(updated);
      if (n < 1) {
        throw new Error("Role was not updated. They may have no role row on this team, or you may lack permission.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      setTeamRoleChangeConfirm(null);
      toast.success("Role updated successfully");
    },
    onError: (error: Error) => {
      setTeamRoleChangeConfirm(null);
      toast.error(error.message || "Failed to update role");
    },
  });

  if (workspaceLoading || teamsLoading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <FeatureGate feature="team_management">
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Teams Management</h1>
        {canManageWorkspaceTeams ? (
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Team
            </Button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined}>
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
        ) : null}
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <div className="flex flex-wrap items-end gap-2 min-w-0">
          <div className="flex-1 min-w-[12rem] max-w-md space-y-1.5">
            <Label htmlFor="team-picker" className="text-sm text-muted-foreground">
              Team
            </Label>
            <Select
              value={selectedTeam?.id ?? ""}
              onValueChange={(teamId) => {
                const team = teams?.find((t) => t.id === teamId);
                if (team) setSelectedTeam(team);
              }}
              disabled={!teams?.length}
            >
              <SelectTrigger id="team-picker" className="w-full">
                <SelectValue placeholder={teams?.length ? "Select a team" : "No teams yet"} />
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
          {selectedTeam && canManageWorkspaceTeams ? (
            <div className="flex shrink-0 gap-1 pb-0.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label="Edit team"
                onClick={() => {
                  setNewTeam({ name: selectedTeam.name, description: selectedTeam.description || "" });
                  setIsEditDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label="Delete team"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this team?")) {
                    deleteTeam.mutate(selectedTeam.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>

        <Card className="min-w-0 w-full">
          <CardHeader className="py-3 px-4 space-y-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base truncate min-w-0">Members</CardTitle>
              {selectedTeam && (
                <>
                  <Button
                    size="sm"
                    disabled={!canManageWorkspaceTeams}
                    onClick={() => setIsAssignDialogOpen(true)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Assign member
                  </Button>
                  <AssignTeamMembersDialog
                    open={isAssignDialogOpen}
                    onOpenChange={setIsAssignDialogOpen}
                    teamId={selectedTeam.id}
                    teamName={selectedTeam.name}
                    billingWorkspaceId={billingWorkspaceId}
                    existingMemberUserIds={existingMemberUserIds}
                    onAssigned={() => {
                      queryClient.invalidateQueries({ queryKey: ["team-members"] });
                    }}
                  />
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 min-w-0">
            {selectedTeam ? (
              <div className="overflow-x-auto -mx-1 px-1">
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
                        ) : !canManageWorkspaceTeams ? (
                          <Badge variant="outline">{formatRoleLabel(String(member.role ?? ""))}</Badge>
                        ) : (
                          <Select
                            value={member.role}
                            onValueChange={(value) => {
                              if (value === member.role) return;
                              setTeamRoleChangeConfirm({
                                targetUserId: member.user_id,
                                email: member.profile?.email ?? member.user_id,
                                fromRole: String(member.role),
                                toRole: value as AppRole,
                              });
                            }}
                          >
                            <SelectTrigger className="h-9 w-[min(100%,11rem)] min-w-0 justify-between gap-1 py-1.5 text-left text-sm [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:line-clamp-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-w-[min(100vw-2rem,380px)]">
                              <TeamRoleSelectItems
                                roles={[
                                  "admin",
                                  "campaign_manager",
                                  "member",
                                  "collaborator",
                                  "viewer",
                                ]}
                              />
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!canManageWorkspaceTeams || member.role === "owner"}
                          onClick={() => {
                            if (confirm("Remove this member from the team?")) {
                              removeMember.mutate(member.user_id);
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
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Select a team to view its members
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={!!teamRoleChangeConfirm}
        onOpenChange={(open) => !open && setTeamRoleChangeConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change team role?</AlertDialogTitle>
            <AlertDialogDescription>
              Change role for <strong className="text-foreground">{teamRoleChangeConfirm?.email}</strong> from{" "}
              <strong className="text-foreground">
                {teamRoleChangeConfirm ? formatRoleLabel(teamRoleChangeConfirm.fromRole) : ""}
              </strong>{" "}
              to{" "}
              <strong className="text-foreground">
                {teamRoleChangeConfirm ? formatRoleLabel(teamRoleChangeConfirm.toRole) : ""}
              </strong>
              ? This updates their role on <strong className="text-foreground">{selectedTeam?.name}</strong> only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                const snap = teamRoleChangeConfirm;
                if (!snap) return;
                updateMemberRole.mutate({
                  targetUserId: snap.targetUserId,
                  newRole: snap.toRole,
                });
              }}
            >
              Change role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Team Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent aria-describedby={undefined}>
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
