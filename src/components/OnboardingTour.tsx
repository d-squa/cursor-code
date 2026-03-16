import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Plug,
  Users,
  FileText,
  Image,
  Rocket,
  LayoutDashboard,
  Settings,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: { label: string; path: string };
  tip?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to ActiPlan! 🎉",
    description:
      "Let's walk you through the key steps to get your cross-platform activation manager up and running. This will only take a minute.",
    icon: <Sparkles className="h-6 w-6" />,
    tip: "You can skip this tour at any time and revisit it from Settings.",
  },
  {
    title: "Step 1: Connect your ad platforms",
    description:
      "Connect Meta, TikTok, Google Ads, or Snapchat to enable automated syncing, audience targeting, and campaign pushes directly from ActiPlan.",
    icon: <Plug className="h-6 w-6" />,
    action: { label: "Go to Platform Connections", path: "/platform-connections" },
    tip: "You can connect multiple accounts per platform.",
  },
  {
    title: "Step 2: Set up your clients",
    description:
      "Create client profiles with their industry, markets, and business objectives. Then link ad accounts to each client under Manage Accounts.",
    icon: <Users className="h-6 w-6" />,
    action: { label: "Manage Clients", path: "/clients" },
    tip: "Clients help organize ad accounts and set targeting defaults.",
  },
  {
    title: "Step 3: Configure account defaults",
    description:
      "For each linked ad account, set default pixels, pages, conversion events, budget types, merchant centers, and URL parameters. These auto-populate when creating ActiPlans.",
    icon: <Settings className="h-6 w-6" />,
    action: { label: "Go to Clients → Defaults Tab", path: "/clients" },
    tip: "Defaults save hours of repetitive configuration.",
  },
  {
    title: "Step 4: Create your first ActiPlan",
    description:
      "Build a full cross-platform media plan with the blueprint-driven workflow. Select clients, platforms, markets, phases, and budgets — then forecast performance.",
    icon: <FileText className="h-6 w-6" />,
    action: { label: "Create New ActiPlan", path: "/app?new=true" },
    tip: "ActiPlans support Meta, TikTok, Google Ads, and Snapchat simultaneously.",
  },
  {
    title: "Step 5: Assign creatives via Creative Mesh",
    description:
      "Upload or sync creative assets, then assign them to specific phases and ad sets. Creative Mesh handles format validation and platform-specific requirements.",
    icon: <Image className="h-6 w-6" />,
    action: { label: "Open Creative Mesh", path: "/creatives" },
    tip: "You can also use AI-powered creative matching to auto-assign assets.",
  },
  {
    title: "Step 6: Push to DSP & monitor",
    description:
      "Once your ActiPlan is ready, push campaigns directly to ad platforms. Track launch status, pacing, and performance from the Overview dashboard.",
    icon: <Rocket className="h-6 w-6" />,
    action: { label: "View Overview", path: "/overview" },
    tip: "Performance insights refresh automatically via connected platforms.",
  },
  {
    title: "You're all set! 🚀",
    description:
      "You now know the key workflow. Start by connecting a platform and creating your first client. If you need help, check the Settings page or report a bug anytime.",
    icon: <CheckCircle2 className="h-6 w-6" />,
    action: { label: "Start using ActiPlan", path: "/overview" },
  },
];

const TOUR_STORAGE_KEY = "actiplan_tour_completed";

export function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      // Small delay so the page renders first
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSkip = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, new Date().toISOString());
    setVisible(false);
  };

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleSkip();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const handleAction = (path: string) => {
    handleSkip();
    navigate(path);
  };

  if (!visible) return null;

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] transition-opacity duration-300"
        onClick={handleSkip}
      />

      {/* Tour Card */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <Card className="pointer-events-auto w-full max-w-lg shadow-2xl border-primary/20 animate-in fade-in zoom-in-95 duration-300">
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary">
                  {step.icon}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {currentStep + 1} of {TOUR_STEPS.length}
                  </p>
                  <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleSkip} className="h-8 w-8 -mt-1 -mr-2">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Progress */}
            <Progress value={progress} className="h-1.5 mb-4" />

            {/* Body */}
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>

            {step.tip && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 mb-4">
                <p className="text-xs text-primary">
                  <span className="font-semibold">💡 Tip:</span> {step.tip}
                </p>
              </div>
            )}

            {/* Action button */}
            {step.action && currentStep > 0 && currentStep < TOUR_STEPS.length - 1 && (
              <Button
                variant="outline"
                size="sm"
                className="mb-4 gap-2"
                onClick={() => handleAction(step.action!.path)}
              >
                {step.action.label}
                <ChevronRight className="h-3 w-3" />
              </Button>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                Skip tour
              </Button>
              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <Button variant="outline" size="sm" onClick={handlePrev} className="gap-1">
                    <ChevronLeft className="h-3 w-3" />
                    Back
                  </Button>
                )}
                <Button size="sm" onClick={handleNext} className="gap-1">
                  {currentStep === TOUR_STEPS.length - 1 ? (
                    "Get Started"
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** Utility to reset the tour (e.g. from Settings) */
export function resetOnboardingTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}
