import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCheck,
  AlertTriangle,
  DollarSign,
  Calendar,
  Target,
  Image,
  Settings,
  Type,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DspConfigChange } from "@/hooks/useDspConfigSync";
import { format } from "date-fns";

interface DspConfigChangesViewProps {
  changes: DspConfigChange[];
  unacknowledgedCount: number;
  syncing: boolean;
  lastSyncedAt: string | null;
  onSync: () => void;
  onAcknowledge: (changeId: string) => void;
  onAcknowledgeAll: () => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  budget: <DollarSign className="h-4 w-4" />,
  schedule: <Calendar className="h-4 w-4" />,
  targeting: <Target className="h-4 w-4" />,
  creative: <Image className="h-4 w-4" />,
  status: <Settings className="h-4 w-4" />,
  naming: <Type className="h-4 w-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  budget: "text-emerald-600",
  schedule: "text-blue-600",
  targeting: "text-purple-600",
  creative: "text-orange-600",
  status: "text-muted-foreground",
  naming: "text-muted-foreground",
};

function ChangeItem({
  change,
  onAcknowledge,
}: {
  change: DspConfigChange;
  onAcknowledge: (id: string) => void;
}) {
  const icon = CATEGORY_ICONS[change.change_category] || <Settings className="h-4 w-4" />;
  const color = CATEGORY_COLORS[change.change_category] || "text-muted-foreground";

  return (
    <div
      className={cn(
        "flex items-start gap-3 py-2 px-3 rounded-md text-sm",
        !change.is_acknowledged && "bg-amber-500/5 border border-amber-500/20",
        change.is_acknowledged && "opacity-60",
      )}
    >
      <div className={cn("mt-0.5 shrink-0", color)}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{change.field_label || change.field_name}</span>
          <Badge variant="outline" className="text-xs h-5">
            {change.entity_type}
          </Badge>
          {change.entity_name && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {change.entity_name}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono bg-muted px-1 rounded">{formatDisplayValue(change.dsp_value)}</span>
        </div>
      </div>
      {!change.is_acknowledged && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-7 text-xs"
          onClick={() => onAcknowledge(change.id)}
        >
          <Check className="h-3 w-3 mr-1" />
          Ack
        </Button>
      )}
      {change.is_acknowledged && (
        <span className="text-xs text-muted-foreground shrink-0">
          <CheckCheck className="h-3 w-3" />
        </span>
      )}
    </div>
  );
}

function formatDisplayValue(val: string | null): string {
  if (!val) return "—";
  // Try to make JSON more readable
  try {
    const parsed = JSON.parse(val);
    if (typeof parsed === "object") {
      return JSON.stringify(parsed, null, 1).substring(0, 100);
    }
    return String(parsed);
  } catch {
    // Truncate long values
    if (val.length > 80) return val.substring(0, 80) + "…";
    return val;
  }
}

export function DspConfigChangesView({
  changes,
  unacknowledgedCount,
  syncing,
  lastSyncedAt,
  onSync,
  onAcknowledge,
  onAcknowledgeAll,
}: DspConfigChangesViewProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  // Group changes by platform → entity
  const grouped = useMemo(() => {
    const filtered = showAcknowledged ? changes : changes.filter((c) => !c.is_acknowledged);
    const result: Record<string, Record<string, DspConfigChange[]>> = {};

    for (const change of filtered) {
      if (!result[change.platform]) result[change.platform] = {};
      const entityKey = `${change.entity_type}:${change.dsp_entity_id}:${change.entity_name || ""}`;
      if (!result[change.platform][entityKey]) result[change.platform][entityKey] = [];
      result[change.platform][entityKey].push(change);
    }

    return result;
  }, [changes, showAcknowledged]);

  const togglePlatform = (platform: string) => {
    setExpandedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const totalDisplayed = Object.values(grouped)
    .flatMap((entities) => Object.values(entities))
    .flat().length;

  if (changes.length === 0 && !syncing) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">DSP Config Sync</CardTitle>
            {unacknowledgedCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unacknowledgedCount} unacknowledged
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastSyncedAt && (
              <span className="text-xs text-muted-foreground">
                Last synced {format(new Date(lastSyncedAt), "HH:mm")}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={onSync} disabled={syncing}>
              {syncing ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              {syncing ? "Syncing..." : "Sync from DSP"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {unacknowledgedCount > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700 flex-1">
              {unacknowledgedCount} change(s) detected from DSP that differ from your ActiPlan configuration.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Acknowledge All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Acknowledge All DSP Changes</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark all {unacknowledgedCount} detected changes as acknowledged and log them in the
                    campaign history. The DSP values will be treated as the source of truth.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onAcknowledgeAll}>Acknowledge All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{totalDisplayed} changes displayed</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6"
            onClick={() => setShowAcknowledged(!showAcknowledged)}
          >
            {showAcknowledged ? "Hide acknowledged" : "Show acknowledged"}
          </Button>
        </div>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {Object.entries(grouped).map(([platform, entities]) => (
              <Collapsible
                key={platform}
                open={expandedPlatforms.has(platform)}
                onOpenChange={() => togglePlatform(platform)}
              >
                <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded hover:bg-muted/50 font-medium text-sm">
                  {expandedPlatforms.has(platform) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span>{platform}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {Object.values(entities).flat().length} fields
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-4 space-y-1">
                    {Object.entries(entities).map(([entityKey, entityChanges]) => {
                      const [entityType, , entityName] = entityKey.split(":");
                      return (
                        <div key={entityKey}>
                          <div className="text-xs font-medium text-muted-foreground py-1 px-2">
                            {entityType.toUpperCase()}: {entityName || "Unknown"}
                          </div>
                          <div className="space-y-1">
                            {entityChanges.map((change) => (
                              <ChangeItem key={change.id} change={change} onAcknowledge={onAcknowledge} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
