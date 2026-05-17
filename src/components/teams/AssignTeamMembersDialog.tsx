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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import type { Enums } from "@/integrations/supabase/types";

type AppRole = Enums<"app_role">;

type AssignRow = {
  member: SubscriptionMember;
  selected: boolean;
  role: AppRole | "";
};

type AssignTeamMembersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  teamName: string;
  billingWorkspaceId: string | null;
  existingMemberUserIds: string[];
  onAssigned: () => void;
};

export function AssignTeamMembersDialog({
  open,
  onOpenChange,
  teamId,
  teamName,
  billingWorkspaceId,
  existingMemberUserIds,
  onAssigned,
}: AssignTeamMembersDialogProps) {
  const [rows, setRows] = useState<AssignRow[]>([]);
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

  useEffect(() => {
    if (!open) {
      setRows([]);
      return;
    }
    setRows(
      availableMembers.map((member) => ({
        member,
        selected: false,
        role: "",
      })),
    );
  }, [open, availableMembers]);

  const selectedRows = rows.filter((r) => r.selected);
  const allSelectedHaveRoles =
    selectedRows.length > 0 && selectedRows.every((r) => r.role && TEAM_ASSIGNABLE_ROLES.includes(r.role as AppRole));
  const canSubmit = allSelectedHaveRoles && !submitting;

  const toggleSelected = (userId: string, selected: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r.member.id === userId
          ? {
              ...r,
              selected,
              role: selected ? r.role : "",
            }
          : r,
      ),
    );
  };

  const setRole = (userId: string, role: AppRole) => {
    setRows((prev) => prev.map((r) => (r.member.id === userId ? { ...r, role } : r)));
  };

  const handleAssign = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const payload = selectedRows.map((r) => ({
        user_id: r.member.id,
        team_id: teamId,
        role: r.role as AppRole,
      }));

      const { error } = await supabase.from("user_roles").insert(payload);
      if (error) {
        if (error.code === "23505") {
          throw new Error("One or more users are already on this team.");
        }
        throw error;
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
          <DialogTitle>Assign team members</DialogTitle>
          <DialogDescription>
            Choose users from your subscription roster and set their role on{" "}
            <span className="font-medium text-foreground">{teamName}</span>. This does not send email
            invitations — it adds existing subscription users to the team.
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
            yet. Invite users under Settings → Subscription Users, then assign them here.
          </p>
        ) : (
          <ScrollArea className="max-h-[min(360px,50vh)] pr-3">
            <div className="space-y-3">
              {rows.map((row) => (
                <div
                  key={row.member.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <Checkbox
                      id={`assign-${row.member.id}`}
                      checked={row.selected}
                      onCheckedChange={(checked) => toggleSelected(row.member.id, checked === true)}
                    />
                    <label htmlFor={`assign-${row.member.id}`} className="min-w-0 cursor-pointer space-y-0.5">
                      <p className="text-sm font-medium truncate">{row.member.email}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.member.company_name || "—"}
                        {row.member.team_names.length > 0 && (
                          <> · Teams: {row.member.team_names.join(", ")}</>
                        )}
                      </p>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        Subscription: {formatSubscriptionRoleLabel(row.member.subscription_role)}
                      </Badge>
                    </label>
                  </div>
                  {row.selected && (
                    <div className="sm:w-44 shrink-0 space-y-1">
                      <Label className="text-xs">Team role</Label>
                      <Select
                        value={row.role || undefined}
                        onValueChange={(value) => setRole(row.member.id, value as AppRole)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {TEAM_ASSIGNABLE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {formatSubscriptionRoleLabel(role)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
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
              `Assign${selectedRows.length > 0 ? ` (${selectedRows.length})` : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
