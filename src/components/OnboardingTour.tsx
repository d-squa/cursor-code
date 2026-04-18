import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { setTourActiveStep } from "@/components/TourResumeButton";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Plug,
  Users,
  FileText,
  Image,
  Rocket,
  Settings,
  CheckCircle2,
  Sparkles,
  Loader2,
  GraduationCap,
  Lightbulb,
  BarChart3,
} from "lucide-react";
import { useTourDataContext } from "@/contexts/TourDataContext";

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  navigateTo?: string;
  tip?: string;
  seedsData?: boolean;
  isInteractive?: boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to ActiPlan! 🎉",
    description:
      "Let's take you on an interactive tour with sample data so you can explore the full platform. We'll load demo accounts and a sample campaign you can explore freely.",
    icon: <Sparkles className="h-6 w-6" />,
    tip: "Sample data is clearly labeled and can be hidden anytime from Settings.",
  },
  {
    title: "Loading your demo environment…",
    description:
      "We're setting up sample platform connections (Meta, TikTok, Google Ads) and a fully configured cross-platform campaign with 2 months of realistic performance data.",
    icon: <GraduationCap className="h-6 w-6" />,
    seedsData: true,
    tip: "This will only take a few seconds.",
  },
  {
    title: "Platform Connections",
    description:
      "Here you can see the demo accounts connected to Meta, TikTok, and Google Ads. In real usage, you'd connect your own ad accounts through OAuth to enable campaign syncing and pushing.",
    icon: <Plug className="h-6 w-6" />,
    navigateTo: "/settings/platforms",
    isInteractive: true,
    tip: "You can connect multiple ad accounts per platform.",
  },
  {
    title: "Your Sample ActiPlan",
    description:
      "This is a fully configured cross-platform campaign with 3 platforms, 2 markets, and 13 ad sets. You can explore the structure, view the forecast, and check the activity logs. The push and creative mesh features are disabled for sample data.",
    icon: <FileText className="h-6 w-6" />,
    navigateTo: "/actiplans",
    isInteractive: true,
    tip: "Click into the sample ActiPlan to explore targeting, budgets, and phases.",
  },
  {
    title: "Performance Overview",
    description:
      "Each ActiPlan card shows overall pacing (time vs spend), per-platform pacing, KPI status (under/on/over target), and aggregated activity stats — Changes, Pending requests, Optimizations and Notes — both at the ActiPlan level and split by platform.",
    icon: <Rocket className="h-6 w-6" />,
    navigateTo: "/overview",
    isInteractive: true,
    tip: "Hover the bars for tooltips, expand 'By Platform', and toggle Lifetime / Month / 7D for the activity stats.",
  },
  {
    title: "Performance Dashboard",
    description:
      "Click 'Check Performance' on any card — or use this step's deep link — to open the full performance dashboard for an ActiPlan: time-series charts, funnel analysis, market & platform comparison, and downloadable reports.",
    icon: <BarChart3 className="h-6 w-6" />,
    navigateTo: "/actiplans/:campaignId/report",
    isInteractive: true,
    tip: "Use the date range and breakdown filters at the top to slice the data.",
  },
  {
    title: "Insights & Recommendations",
    description:
      "AI-powered cross-platform analyses comparing time periods, breakdowns and platforms. We've pre-loaded a sample analysis — open the History tab to view its executive summary, per-platform highlights, recommendations and risks.",
    icon: <Lightbulb className="h-6 w-6" />,
    navigateTo: "/actiplans/:campaignId/insights",
    isInteractive: true,
    tip: "Open the History tab to load the pre-filled sample analysis.",
  },
  {
    title: "Set Up Your Clients",
    description:
      "Create client profiles with industry, markets, and business objectives. Then link ad accounts and configure default pixels, pages, and conversion events that auto-populate in new ActiPlans.",
    icon: <Users className="h-6 w-6" />,
    navigateTo: "/settings/accounts",
    tip: "Defaults save hours of repetitive configuration.",
  },
  {
    title: "Creative Mesh",
    description:
      "Upload or sync creative assets, then assign them to specific phases and ad sets. Creative Mesh handles format validation and platform-specific requirements automatically.",
    icon: <Image className="h-6 w-6" />,
    navigateTo: "/creatives",
    tip: "AI-powered creative matching can auto-assign assets based on format and objective.",
  },
  {
    title: "You're all set! 🚀",
    description:
      "You now know the key workflow. The sample data will remain visible so you can keep exploring. You can hide it anytime from Settings, or replay this tour.",
    icon: <CheckCircle2 className="h-6 w-6" />,
    navigateTo: "/overview",
  },
];

const TOUR_STORAGE_KEY = "actiplan_tour_completed";

export function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const navigate = useNavigate();
  const { seedTourData, isSeeded, seededCampaignId } = useTourDataContext();

  // Resolve a step's navigateTo, substituting :campaignId with the seeded ID.
  // If a step deep-links to a campaign but no campaign is seeded yet, fall back
  // to a sensible top-level route so we never navigate to a 404.
  const resolveNavigateTo = useCallback(
    (path: string | undefined): string | undefined => {
      if (!path) return path;
      if (!path.includes(":campaignId")) return path;
      if (seededCampaignId) return path.replace(":campaignId", seededCampaignId);
      if (path.endsWith("/insights")) return "/insights";
      if (path.endsWith("/report")) return "/overview";
      return "/actiplans";
    },
    [seededCampaignId]
  );

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Sync active step for TourResumeButton
  useEffect(() => {
    if (visible) {
      setTourActiveStep(currentStep);
    } else {
      setTourActiveStep(null);
    }
  }, [visible, currentStep]);

  // Allow resuming tour from TourResumeButton
  const resumeTour = useCallback(() => {
    setVisible(true);
  }, []);

  // Expose resume globally
  useEffect(() => {
    (window as any).__resumeOnboardingTour = resumeTour;
    return () => { delete (window as any).__resumeOnboardingTour; };
  }, [resumeTour]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(TOUR_STORAGE_KEY, new Date().toISOString());
    setTourActiveStep(null);
    setVisible(false);
  }, []);

  const handleNext = useCallback(async () => {
    const nextStep = currentStep + 1;
    if (nextStep >= TOUR_STEPS.length) {
      handleSkip();
      return;
    }

    const next = TOUR_STEPS[nextStep];

    // If next step seeds data, do it
    if (next.seedsData && !isSeeded) {
      setCurrentStep(nextStep);
      setSeeding(true);
      const newCampaignId = await seedTourData();
      setSeeding(false);
      const stepAfterSeed = nextStep + 1;
      if (stepAfterSeed < TOUR_STEPS.length) {
        const navStep = TOUR_STEPS[stepAfterSeed];
        if (navStep.navigateTo) {
          // Substitute fresh campaign ID immediately (context state may not be flushed yet)
          const resolved =
            navStep.navigateTo.includes(":campaignId") && newCampaignId
              ? navStep.navigateTo.replace(":campaignId", newCampaignId)
              : resolveNavigateTo(navStep.navigateTo);
          if (resolved) navigate(resolved);
        }
        setCurrentStep(stepAfterSeed);
      }
      return;
    }

    // If already seeded and this is the seed step, skip it
    if (next.seedsData && isSeeded) {
      const stepAfterSeed = nextStep + 1;
      if (stepAfterSeed < TOUR_STEPS.length) {
        const navStep = TOUR_STEPS[stepAfterSeed];
        const resolved = resolveNavigateTo(navStep.navigateTo);
        if (resolved) navigate(resolved);
        setCurrentStep(stepAfterSeed);
      }
      return;
    }

    const resolved = resolveNavigateTo(next.navigateTo);
    if (resolved) navigate(resolved);
    setCurrentStep(nextStep);
  }, [currentStep, isSeeded, seedTourData, navigate, handleSkip, resolveNavigateTo]);

  const handlePrev = useCallback(() => {
    let prev = currentStep - 1;
    if (prev >= 0 && TOUR_STEPS[prev].seedsData) prev--;
    if (prev < 0) prev = 0;
    const step = TOUR_STEPS[prev];
    const resolved = resolveNavigateTo(step.navigateTo);
    if (resolved) navigate(resolved);
    setCurrentStep(prev);
  }, [currentStep, navigate, resolveNavigateTo]);

  if (!visible) return null;

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] transition-opacity duration-300"
        onClick={step.seedsData ? undefined : handleSkip}
      />

      <div className="fixed inset-0 z-[61] flex items-end sm:items-center justify-center p-4 pointer-events-none">
        <Card className="pointer-events-auto w-full max-w-lg shadow-2xl border-primary/20 animate-in fade-in zoom-in-95 duration-300 mb-4 sm:mb-0">
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
              {!step.seedsData && (
                <Button variant="ghost" size="icon" onClick={handleSkip} className="h-8 w-8 -mt-1 -mr-2">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <Progress value={progress} className="h-1.5 mb-4" />

            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>

            {seeding && (
              <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 mb-4">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm text-primary font-medium">Setting up your demo environment…</p>
              </div>
            )}

            {step.tip && !seeding && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 mb-4">
                <p className="text-xs text-primary">
                  <span className="font-semibold">💡 Tip:</span> {step.tip}
                </p>
              </div>
            )}

            {step.isInteractive && (
              <div className="rounded-lg bg-accent/50 border border-accent px-3 py-2 mb-4">
                <p className="text-xs text-muted-foreground">
                  👆 <span className="font-medium">Feel free to explore this page</span> — click "Next" when you're ready to continue the tour.
                </p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-muted-foreground"
                disabled={seeding}
              >
                Skip tour
              </Button>
              <div className="flex items-center gap-2">
                {currentStep > 0 && !seeding && (
                  <Button variant="outline" size="sm" onClick={handlePrev} className="gap-1">
                    <ChevronLeft className="h-3 w-3" />
                    Back
                  </Button>
                )}
                <Button size="sm" onClick={handleNext} className="gap-1" disabled={seeding}>
                  {currentStep === TOUR_STEPS.length - 1 ? (
                    "Start Using ActiPlan"
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
