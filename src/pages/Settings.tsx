import { useEffect, useMemo } from "react";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useSampleMode } from "@/contexts/SampleModeContext";
import { Feature, getRequiredTier } from "@/config/featureAccess";
import { TIER_DISPLAY_NAMES } from "@/config/subscriptionTiers";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import {
  Settings as SettingsIcon,
  Link as LinkIcon,
  Users,
  User,
  CreditCard,
  Receipt,
  ArrowLeft,
  Loader2,
  Plug,
  Lock,
  BarChart3,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Role requirements for menu items
type RoleRequirement = 'owner' | 'admin' | 'any';

interface SettingsMenuItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  feature?: Feature;
  roleRequirement?: RoleRequirement; // If not set, visible to all roles
}

const allSettingsMenuItems: SettingsMenuItem[] = [
  {
    title: "Account Settings",
    href: "/app/settings/account",
    icon: User,
    description: "Update your profile and password"
  },
  {
    title: "Plan Management",
    href: "/app/settings/plans",
    icon: CreditCard,
    description: "Manage your subscription plan",
    roleRequirement: 'owner' // Only owners can see this
  },
  {
    title: "Billing Management",
    href: "/app/settings/billing",
    icon: Receipt,
    description: "Manage payment methods and billing",
    roleRequirement: 'owner' // Only owners can see this
  },
  {
    title: "Users",
    href: "/app/settings/users",
    icon: Users,
    description: "Invite and manage users",
    feature: "user_management"
    // No roleRequirement - visible to all, data filtered by role in component
  },
  {
    title: "Manage Your Team",
    href: "/app/settings/teams",
    icon: Users,
    description: "Add and manage team members",
    feature: "team_management"
  },
  {
    title: "Platform Connections",
    href: "/app/settings/platforms",
    icon: Plug,
    description: "Connect and authenticate advertising platforms"
  },
  {
    title: "Manage Client Accounts",
    href: "/app/settings/accounts",
    icon: LinkIcon,
    description: "Manage client accounts, sync ad accounts, and configure defaults",
    feature: "client_management"
  },
  {
    title: "Operations Reports",
    href: "/app/settings/operations-reports",
    icon: BarChart3,
    description: "View operations analytics across all clients",
    feature: "operations_analytics"
  },
  {
    title: "Usage Monitoring",
    href: "/app/settings/usage",
    icon: Activity,
    description: "Track workspace usage, swaps, and limits",
    roleRequirement: 'admin' // Admins and owners can see this
  }
];

export default function Settings() {
  const { user, loading } = useAuth();
  const { isAdmin, isOwner, loading: roleLoading } = useRole();
  const { hasAccess: rawHasAccess, loading: featureLoading } = useFeatureAccess();
  const { isSampleMode } = useSampleMode();
  const navigate = useNavigate();
  const location = useLocation();

  // Sample Mode bypasses feature gates so users can explore everything during the tour
  const hasAccess = (feature: any) => isSampleMode || rawHasAccess(feature);

  // Filter menu items based on role and feature access
  const accessibleMenuItems = useMemo(() => {
    return allSettingsMenuItems.filter(item => {
      // Check role requirement
      if (item.roleRequirement === 'owner' && !isOwner) {
        return false;
      }
      if (item.roleRequirement === 'admin' && !isAdmin) {
        return false;
      }
      
      // Check feature access (for subscription-based features)
      if (item.feature && !hasAccess(item.feature)) {
        return false;
      }
      
      return true;
    });
  }, [hasAccess, isAdmin, isOwner]);

  // Get first accessible route
  const firstAccessibleRoute = useMemo(() => {
    return accessibleMenuItems[0]?.href || "/app/settings/account";
  }, [accessibleMenuItems]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    // Only redirect once everything is loaded and we're on the base route
    if (loading || featureLoading || roleLoading) return;
    
    if (location.pathname === "/app/settings") {
      navigate(firstAccessibleRoute, { replace: true });
    }
  }, [location.pathname, navigate, firstAccessibleRoute, loading, featureLoading, roleLoading]);

  if (loading || featureLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isActiveRoute = (href: string) => location.pathname === href;

  // Determine which items to show in sidebar (only accessible ones, no locked items for role-based restrictions)
  const visibleMenuItems = allSettingsMenuItems.filter(item => {
    // Check role requirement - if not met, hide completely
    if (item.roleRequirement === 'owner' && !isOwner) {
      return false;
    }
    if (item.roleRequirement === 'admin' && !isAdmin) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/app/overview")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
                <SettingsIcon className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Settings</h1>
                <p className="text-xs text-muted-foreground">Manage your account and preferences</p>
              </div>
            </div>

            <div className="ml-auto hidden sm:flex">
              <WorkspaceSwitcher />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <nav className="space-y-2 sticky top-24">
              <TooltipProvider>
                {visibleMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isActiveRoute(item.href);
                  const isLockedByFeature = item.feature && !hasAccess(item.feature);
                  const requiredTier = item.feature ? getRequiredTier(item.feature) : null;
                  
                  if (isLockedByFeature) {
                    return (
                      <Tooltip key={item.href} delayDuration={0}>
                        <TooltipTrigger asChild>
                          <button
                            className={cn(
                              "w-full flex items-start gap-3 p-4 rounded-lg transition-all",
                              "hover:bg-accent/50 text-left opacity-50 cursor-pointer"
                            )}
                          >
                            <Lock className="h-5 w-5 mt-0.5 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-foreground">
                                {item.title}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.description}
                              </p>
                            </div>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-background border border-border shadow-lg z-[100]">
                          <a 
                            href="/app/settings/plans"
                            onClick={(e) => {
                              e.preventDefault();
                              navigate('/app/settings/plans');
                            }}
                            className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                          >
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>
                              Upgrade to <span className="font-semibold text-primary">{requiredTier ? TIER_DISPLAY_NAMES[requiredTier] : 'higher plan'}</span> to unlock
                            </span>
                          </a>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  
                  return (
                    <button
                      key={item.href}
                      onClick={() => navigate(item.href)}
                      className={cn(
                        "w-full flex items-start gap-3 p-4 rounded-lg transition-all",
                        "hover:bg-accent/50 text-left",
                        isActive && "bg-primary/10 border-l-4 border-primary"
                      )}
                    >
                      <Icon className={cn(
                        "h-5 w-5 mt-0.5",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "font-medium text-sm",
                          isActive ? "text-primary" : "text-foreground"
                        )}>
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </TooltipProvider>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-3">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
