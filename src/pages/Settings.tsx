import { useEffect } from "react";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { 
  Settings as SettingsIcon, 
  Link as LinkIcon, 
  Users, 
  User, 
  CreditCard, 
  Receipt,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

const settingsMenuItems = [
  {
    title: "Users",
    href: "/settings/users",
    icon: Users,
    description: "Invite and manage users"
  },
  {
    title: "Manage Your Team",
    href: "/settings/teams",
    icon: Users,
    description: "Add and manage team members"
  },
  {
    title: "Connect Platforms",
    href: "/settings/platforms",
    icon: LinkIcon,
    description: "Manage your advertising platform connections"
  },
  {
    title: "Account Settings",
    href: "/settings/account",
    icon: User,
    description: "Update your profile and password"
  },
  {
    title: "Plan Management",
    href: "/settings/plans",
    icon: CreditCard,
    description: "Manage your subscription plan"
  },
  {
    title: "Billing Management",
    href: "/settings/billing",
    icon: Receipt,
    description: "Manage payment methods and billing"
  }
];

export default function Settings() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    // Redirect to first settings page if on base /settings route
    if (location.pathname === "/settings") {
      navigate("/settings/users");
    }
  }, [location.pathname, navigate]);

  if (loading) {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/")}
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
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <nav className="space-y-2 sticky top-24">
              {settingsMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = isActiveRoute(item.href);
                
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
