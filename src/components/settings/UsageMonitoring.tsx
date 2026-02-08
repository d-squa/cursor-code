import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAdAccountLimits } from "@/hooks/useAdAccountLimits";
import { useSubscription } from "@/hooks/useSubscription";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeftRight, 
  Calendar, 
  Clock, 
  RefreshCw, 
  Users, 
  Zap,
  AlertTriangle,
  CheckCircle2,
  TrendingUp
} from "lucide-react";
import { formatDistanceToNow, format, startOfMonth, differenceInDays } from "date-fns";
import { 
  ACTIPLAN_DAILY_LIMITS, 
  AD_ACCOUNT_LIMITS, 
  SWAP_LIMITS,
  TEAM_MEMBER_LIMITS,
  TIER_DISPLAY_NAMES,
  SubscriptionTier
} from "@/config/subscriptionTiers";

interface SwapLog {
  id: string;
  user_id: string;
  team_id: string;
  platform: string;
  previous_account_id: string;
  new_account_id: string;
  swap_type: string;
  metadata: {
    previous_account_name?: string;
    swapped_at?: string;
  } | null;
  created_at: string;
  user_email?: string;
}

export default function UsageMonitoring() {
  const { activeWorkspaceId } = useWorkspace();
  const { tier } = useSubscription();
  const adAccountLimits = useAdAccountLimits(activeWorkspaceId);

  // Fetch swap logs for the team
  const { data: swapLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["swap-logs", activeWorkspaceId],
    enabled: !!activeWorkspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_account_swap_logs")
        .select("*")
        .eq("team_id", activeWorkspaceId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch user emails for display
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((log: any) => log.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", userIds);

        const emailMap = new Map(profiles?.map((p: any) => [p.id, p.email]) || []);
        return data.map((log: any) => ({
          ...log,
          user_email: emailMap.get(log.user_id) || "Unknown",
        })) as SwapLog[];
      }

      return data as SwapLog[];
    },
  });

  // Fetch team member count
  const { data: teamMemberCount } = useQuery({
    queryKey: ["team-member-count", activeWorkspaceId],
    enabled: !!activeWorkspaceId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("team_id", activeWorkspaceId);

      if (error) throw error;
      return count || 0;
    },
  });

  // Calculate days until swap reset
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysUntilReset = differenceInDays(nextMonth, now);

  const tierLimits = {
    actiplanDaily: ACTIPLAN_DAILY_LIMITS[tier as SubscriptionTier] ?? 1,
    adAccounts: AD_ACCOUNT_LIMITS[tier as SubscriptionTier] ?? 1,
    swaps: SWAP_LIMITS[tier as SubscriptionTier] ?? 1,
    teamMembers: TEAM_MEMBER_LIMITS[tier as SubscriptionTier] ?? { owners: 1, admins: 0, members: 0 },
  };

  const totalTeamMembersAllowed = 
    tierLimits.teamMembers.owners + 
    tierLimits.teamMembers.admins + 
    tierLimits.teamMembers.members;

  const renderUsageCard = (
    title: string,
    current: number,
    max: number,
    icon: React.ReactNode,
    description: string,
    resetInfo?: string
  ) => {
    const percentage = max === Infinity ? 0 : (current / max) * 100;
    const isAtLimit = current >= max && max !== Infinity;
    const isNearLimit = percentage >= 80 && !isAtLimit;

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {icon}
              {title}
            </CardTitle>
            {isAtLimit && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                At Limit
              </Badge>
            )}
            {isNearLimit && (
              <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600 dark:text-amber-400">
                Near Limit
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-lg">{current}</span>
              <span className="text-muted-foreground">
                / {max === Infinity ? "∞" : max}
              </span>
            </div>
            {max !== Infinity && (
              <Progress value={Math.min(percentage, 100)} className="h-2" />
            )}
            {resetInfo && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                {resetInfo}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Usage Monitoring
          </h2>
          <p className="text-sm text-muted-foreground">
            Track workspace usage and limits for your {TIER_DISPLAY_NAMES[tier as SubscriptionTier] || tier} plan
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          Resets in {daysUntilReset} days
        </Badge>
      </div>

      {/* Usage Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {renderUsageCard(
          "Meta Ad Accounts",
          adAccountLimits.meta.currentCount,
          adAccountLimits.meta.maxAllowed,
          <span className="text-blue-500">📘</span>,
          "Active Meta ad accounts in workspace"
        )}
        {renderUsageCard(
          "TikTok Ad Accounts",
          adAccountLimits.tiktok.currentCount,
          adAccountLimits.tiktok.maxAllowed,
          <span className="text-pink-500">🎵</span>,
          "Active TikTok ad accounts in workspace"
        )}
        {renderUsageCard(
          "Meta Swaps Used",
          adAccountLimits.meta.swapsUsed,
          adAccountLimits.meta.swapsAllowed,
          <ArrowLeftRight className="h-4 w-4 text-primary" />,
          "Account swaps this month",
          `Resets ${format(nextMonth, "MMM d")}`
        )}
        {renderUsageCard(
          "TikTok Swaps Used",
          adAccountLimits.tiktok.swapsUsed,
          adAccountLimits.tiktok.swapsAllowed,
          <ArrowLeftRight className="h-4 w-4 text-primary" />,
          "Account swaps this month",
          `Resets ${format(nextMonth, "MMM d")}`
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {renderUsageCard(
          "Team Members",
          teamMemberCount || 0,
          totalTeamMembersAllowed,
          <Users className="h-4 w-4" />,
          `${tierLimits.teamMembers.owners} owner, ${tierLimits.teamMembers.admins} admin(s), ${tierLimits.teamMembers.members} member(s)`
        )}
        {renderUsageCard(
          "Daily ActiPlans",
          0, // TODO: Track this if needed
          tierLimits.actiplanDaily,
          <Zap className="h-4 w-4 text-accent-foreground" />,
          "Campaign launches per day",
          "Resets daily at midnight UTC"
        )}
      </div>

      {/* Swap History */}
      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history">Swap History</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                Recent Ad Account Swaps
              </CardTitle>
              <CardDescription>
                Track who changed which ad accounts and when
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading swap history...
                </div>
              ) : swapLogs && swapLogs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Previous Account</TableHead>
                      <TableHead>New Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {swapLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">
                          {log.user_email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {log.platform}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.metadata?.previous_account_name || log.previous_account_id}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.new_account_id}
                        </TableCell>
                        <TableCell>
                          {log.swap_type === "swap" ? (
                            <Badge variant="secondary">
                              <ArrowLeftRight className="h-3 w-3 mr-1" />
                              Swap
                            </Badge>
                          ) : log.swap_type === "initial" ? (
                            <Badge variant="outline">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Initial
                            </Badge>
                          ) : (
                            <Badge variant="outline">{log.swap_type}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No swap history yet</p>
                  <p className="text-xs">
                    Swaps are logged when ad accounts are changed in this workspace
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Monthly Summary
              </CardTitle>
              <CardDescription>
                Overview of usage since {format(startOfMonth(now), "MMMM d, yyyy")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Meta Platform</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Accounts linked:</span>
                      <span>{adAccountLimits.meta.currentCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Swaps used:</span>
                      <span>{adAccountLimits.meta.swapsUsed} / {adAccountLimits.meta.swapsAllowed === Infinity ? "∞" : adAccountLimits.meta.swapsAllowed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Swaps remaining:</span>
                      <span className={adAccountLimits.meta.canSwap ? "text-primary" : "text-destructive"}>
                        {adAccountLimits.meta.swapsAllowed === Infinity 
                          ? "Unlimited" 
                          : Math.max(0, adAccountLimits.meta.swapsAllowed - adAccountLimits.meta.swapsUsed)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">TikTok Platform</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Accounts linked:</span>
                      <span>{adAccountLimits.tiktok.currentCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Swaps used:</span>
                      <span>{adAccountLimits.tiktok.swapsUsed} / {adAccountLimits.tiktok.swapsAllowed === Infinity ? "∞" : adAccountLimits.tiktok.swapsAllowed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Swaps remaining:</span>
                      <span className={adAccountLimits.tiktok.canSwap ? "text-primary" : "text-destructive"}>
                        {adAccountLimits.tiktok.swapsAllowed === Infinity 
                          ? "Unlimited" 
                          : Math.max(0, adAccountLimits.tiktok.swapsAllowed - adAccountLimits.tiktok.swapsUsed)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
