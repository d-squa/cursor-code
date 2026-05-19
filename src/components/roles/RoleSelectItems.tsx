import { SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getSubscriptionRoleUiOption,
  getTeamRoleUiOption,
  type RoleUiOption,
} from "@/utils/campaignPermissions";

function RoleOptionContent({ option }: { option: RoleUiOption }) {
  return (
    <div className="flex flex-col gap-0.5 py-0.5 text-left">
      <span className="font-medium leading-snug">{option.label}</span>
      <span className="text-xs font-normal leading-snug text-muted-foreground whitespace-normal">
        {option.description}
      </span>
    </div>
  );
}

type RoleSelectItemsProps = {
  roles: readonly string[];
  resolveOption: (role: string) => RoleUiOption | undefined;
  className?: string;
};

function RoleSelectItems({ roles, resolveOption, className }: RoleSelectItemsProps) {
  return (
    <>
      {roles.map((role) => {
        const option = resolveOption(role);
        if (!option) return null;
        return (
          <SelectItem
            key={role}
            value={role}
            textValue={option.label}
            className={cn("items-start py-2.5 [&>span]:w-full", className)}
          >
            <RoleOptionContent option={option} />
          </SelectItem>
        );
      })}
    </>
  );
}

export function TeamRoleSelectItems({
  roles,
  className,
}: {
  roles: readonly string[];
  className?: string;
}) {
  return <RoleSelectItems roles={roles} resolveOption={getTeamRoleUiOption} className={className} />;
}

export function SubscriptionRoleSelectItems({
  roles,
  className,
}: {
  roles: readonly string[];
  className?: string;
}) {
  return (
    <RoleSelectItems roles={roles} resolveOption={getSubscriptionRoleUiOption} className={className} />
  );
}

export function SelectedRoleHint({
  role,
  scope,
}: {
  role: string | null | undefined;
  scope: "team" | "subscription";
}) {
  if (!role) return null;
  const option =
    scope === "team" ? getTeamRoleUiOption(role) : getSubscriptionRoleUiOption(role);
  if (!option) return null;

  return (
    <p className="text-xs leading-relaxed text-muted-foreground mt-1.5">
      <span className="font-medium text-foreground">{option.label}:</span> {option.description}
    </p>
  );
}
