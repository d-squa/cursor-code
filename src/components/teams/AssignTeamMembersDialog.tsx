import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchSubscriptionMembers,
  formatSubscriptionRoleLabel,
  TEAM_ASSIGNABLE_ROLES,
  type SubscriptionMember,
} from "@/utils/subscriptionRoster";
import { formatTeamRoleLabel } from "@/utils/campaignPermissions";
import { SelectedRoleHint, TeamRoleSelectItems } from "@/components/roles/RoleSelectItems";
import type { Enums } from "@/integrations/supabase/types";

type AppRole = Enums<"app_role">;

type AssignTeamMembersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  teamName: string;
  billingWorkspaceId: string | null;
  existingMemberUserIds: string[];
  onAssigned: () => void;
};

function memberOptionLabel(member: SubscriptionMember): string {
  const company = member.company_name?.trim();
  const teams =
    member.team_names.length > 0 ? ` · ${member.team_names.join(", ")}` : "";
  return company ? `${member.email} (${company})${teams}` : `${member.email}${teams}`;
}

export function AssignTeamMembersDialog({
  open,
  onOpenChange,
  teamId,
  teamName,
  billingWorkspaceId,
  existingMemberUserIds,
  onAssigned,
}: AssignTeamMembersDialogProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [rolesByUserId, setRolesByUserId] = useState<Record<string, AppRole | "">>({});
  const [submitting, setSubmitting] = useState(false);

  const existingSet = useMemo(() => new Set(existingMemberUserIds), [existingMemberUserIds]);

  const { data: subscriptionMembers = [], isLoading, isError, error } = useQuery({
    queryKey: ["subscription-members-for-assign", billingWorkspaceId],
    enabled: open && !!billingWorkspaceId,
    queryFn: () => fetchSubscriptionMembers(billingWorkspaceId!),
  });

  const availableMembers = useMemo(
    () => subscriptionMembers.filter((m) => !existingSet.has(m.id)),
    [subscriptionMembers, existingSet],
  );

  const membersById = useMemo(
    () => new Map(availableMembers.map((m) => [m.id, m])),
    [availableMembers],
  );

  const multiSelectOptions = useMemo(
    () =>
      availableMembers.map((m) => ({
        value: m.id,
        label: memberOptionLabel(m),
      })),
    [availableMembers],
  );

  useEffect(() => {
    if (!open) {
      setSelectedUserIds([]);
      setRolesByUserId({});
    }
  }, [open]);

  useEffect(() => {
    setRolesByUserId((prev) => {
      const next: Record<string, AppRole | ""> = {};
      selectedUserIds.forEach((id) => {
        next[id] = prev[id] ?? "";
      });
      return next;
    });
  }, [selectedUserIds]);

  const selectedMembers = selectedUserIds
    .map((id) => membersById.get(id))
    .filter((m): m is SubscriptionMember => !!m);

  const allSelectedHaveRoles =
    selectedUserIds.length > 0 &&
    selectedUserIds.every(
      (id) => rolesByUserId[id] && TEAM_ASSIGNABLE_ROLES.includes(rolesByUserId[id] as AppRole),
    );
  const canSubmit = allSelectedHaveRoles && !submitting;

  const setRole = (userId: string, role: AppRole) => {
    setRolesByUserId((prev) => ({ ...prev, [userId]: role }));
  };

  const handleAssign = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const payload = selectedUserIds.map((user_id) => ({
        user_id,
        team_id: teamId,
        role: rolesByUserId[user_id] as AppRole,
      }));

      const { error: insertError } = await supabase.from("user_roles").insert(payload);
      if (insertError) {
        if (insertError.code === "23505") {
          throw new Error("One or more users are already on this team.");
        }
        throw insertError;
      }

      toast.success(
        `Assigned ${payload.length} member${payload.length === 1 ? "" : "s"} to ${teamName}`,
      );
      onAssigned();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to assign team members";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add team members</DialogTitle>
          <DialogDescription className="space-y-2">
            <span>
              Select users from your subscription roster and set their <span className="font-medium">team role</span> on{" "}
              <span className="font-medium text-foreground">{teamName}</span>. Users must already exist under Settings →
              Subscription Users.
            </span>
            <span className="block text-xs">
              <span className="font-medium text-foreground">Subscription</span> = account access.{" "}
              <span className="font-medium text-foreground">Team role</span> = what they can do on this team&apos;s
              ActiPlans (build, QC, view-only).
            </span>
          </DialogDescription>
        </DialogHeader>

        {!billingWorkspaceId ? (
          <p className="text-sm text-muted-foreground py-4">
            This team is not linked to a billing subscription. Add users under Settings → Subscription
            Users first, or open a workspace that has subscription billing enabled.
          </p>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading subscription users…
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive py-4">
            {(error as Error)?.message ?? "Could not load subscription users."}
          </p>
        ) : availableMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Everyone on this subscription is already on {teamName}, or there are no subscription users
            yet. Add users under Settings → Subscription Users, then assign them here.
          </p>
        ) : (
          <div className="space-y-4">
            <AssignFormBody
              multiSelectOptions={multiSelectOptions}
              selectedUserIds={selectedUserIds}
              onSelectedUserIdsChange={setSelectedUserIds}
              selectedMembers={selectedMembers}
              rolesByUserId={rolesByUserId}
              onRoleChange={setRole}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!canSubmit || !billingWorkspaceId}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning…
              </>
            ) : (
              `Assign${selectedUserIds.length > 0 ? ` (${selectedUserIds.length})` : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignFormBody({
  multiSelectOptions,
  selectedUserIds,
  onSelectedUserIdsChange,
  selectedMembers,
  rolesByUserId,
  onRoleChange,
}: {
  multiSelectOptions: { value: string; label: string }[];
  selectedUserIds: string[];
  onSelectedUserIdsChange: (ids: string[]) => void;
  selectedMembers: SubscriptionMember[];
  rolesByUserId: Record<string, AppRole | "">;
  onRoleChange: (userId: string, role: AppRole) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Subscription users</Label>
        <MultiSelect
          options={multiSelectOptions}
          value={selectedUserIds}
          onChange={onSelectedUserIdsChange}
          placeholder="Select subscription users…"
          emptyText="No subscription users available"
        />
        <p className="text-xs text-muted-foreground">
          Search and pick from everyone on this subscription who is not already on the team.
        </p>
      </div>

      {selectedMembers.length > 0 && (
        <RoleAssignmentList
          members={selectedMembers}
          rolesByUserId={rolesByUserId}
          onRoleChange={onRoleChange}
        />
      )}
    </>
  );
}

function RoleAssignmentList({
  members,
  rolesByUserId,
  onRoleChange,
}: {
  members: SubscriptionMember[];
  rolesByUserId: Record<string, AppRole | "">;
  onRoleChange: (userId: string, role: AppRole) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <Label className="text-xs text-muted-foreground">Team role for each user</Label>
      {members.map((member) => (
        <div
          key={member.id}
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <MemberSummary member={member} />
          <TeamRoleSelect
            memberId={member.id}
            value={rolesByUserId[member.id]}
            onRoleChange={onRoleChange}
          />
        </div>
      ))}
    </div>
  );
}

function MemberSummary({ member }: { member: SubscriptionMember }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium truncate">{member.email}</p>
      <Badge variant="outline" className="mt-1 text-[10px] font-normal">
        Subscription: {formatSubscriptionRoleLabel(member.subscription_role)}
      </Badge>
    </div>
  );
}

function TeamRoleSelect({
  memberId,
  value,
  onRoleChange,
}: {
  memberId: string;
  value: AppRole | "";
  onRoleChange: (userId: string, role: AppRole) => void;
}) {
  return (
    <div className="sm:w-[min(100%,280px)] shrink-0">
      <Select
        value={value || undefined}
        onValueChange={(role) => onRoleChange(memberId, role as AppRole)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Team role" />
        </SelectTrigger>
        <SelectContent className="max-w-[min(100vw-2rem,380px)]">
          <TeamRoleSelectItems roles={TEAM_ASSIGNABLE_ROLES} />
        </SelectContent>
      </Select>
      <SelectedRoleHint role={value || undefined} scope="team" />
    </div>
  );
}
