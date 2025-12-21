import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher({ className }: { className?: string }) {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, loading } = useWorkspace();

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <div className="h-9 w-[220px] rounded-md border bg-background/50" />
      </div>
    );
  }

  if (workspaces.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Select value={activeWorkspaceId ?? ""} onValueChange={setActiveWorkspaceId}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Select workspace" />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
