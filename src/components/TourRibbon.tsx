import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { setTourActiveStep } from "@/components/TourResumeButton";
import {
  X,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Plug,
  Users,
  FileText,
  Image,
  Rocket,
  CheckCircle2,
  Sparkles,
  Loader2,
  GraduationCap,
} from "lucide-react";
import { useTourDataContext } from "@/contexts/TourDataContext";

interface TourStep {
  title: string;
  shortDesc: string;
  description: string;
  icon: React.ReactNode;
  navigateTo?: string;
  tip?: string;
  seedsData?: boolean;
  isInteractive?: boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to ActiPlan",
    shortDesc: "Take an interactive tour with sample data.",
    description:
      "We'll load D-squad — a sample client — plus dummy ad accounts and a fully configured Q4 Holiday Campaign 2025 so you can explore the full platform safely.",
    icon: <Sparkles className="h-4 w-4" />,
    tip: "Sample data is read-only and clearly labeled. You can hide it anytime.",
  },
  {
    title: "Loading demo environment…",
    shortDesc: "Setting up sample accounts, client and campaign.",
    description:
      "Seeding sample Meta / TikTok / Google Ads connections, the D-squad client with defaults, and the Q4 Holiday Campaign 2025 with budgets, targeting, keywords, optimization goals and a pre-loaded forecast.",
    icon: <GraduationCap className="h-4 w-4" />,
    seedsData: true,
    tip: "This only takes a few seconds.",
  },
  {
    title: "Platform Connections",
    shortDesc: "Sample ad accounts on Meta, TikTok and Google Ads.",
    description:
      "These dummy accounts are linked for the tour. In real usage you'd connect your own ad accounts via OAuth. Buttons are disabled while Sample Mode is on.",
    icon: <Plug className="h-4 w-4" />,
    navigateTo: "/settings/platforms",
    isInteractive: true,
    tip: "You can connect multiple ad accounts per platform in real usage.",
  },
  {
    title: "Clients & Defaults",
    shortDesc: "D-squad is the sample client used throughout the tour.",
    description:
      "D-squad has industry, markets, default targeting, pixels, pages and conversion events configured — these auto-populate in new ActiPlans to save hours of repetitive setup.",
    icon: <Users className="h-4 w-4" />,
    navigateTo: "/settings/accounts",
    isInteractive: true,
    tip: "Defaults flow into every new ActiPlan automatically.",
  },
  {
    title: "Q4 Holiday Campaign 2025",
    shortDesc: "Sample ActiPlan with full structure and forecast.",
    description:
      "A complete cross-platform plan: 3 platforms, 3 markets, budget split, basic targeting, interests, keywords, optimization goals per phase, full schedule, and a pre-loaded forecast. Open it to explore.",
    icon: <FileText className="h-4 w-4" />,
    navigateTo: "/actiplans",
    isInteractive: true,
    tip: "Click into the sample ActiPlan to view targeting, budgets and forecast.",
  },
  {
    title: "Performance Dashboard",
    shortDesc: "Pacing, performance and cross-platform insights.",
    description:
      "Two months of realistic synthetic performance data. Try filtering by platform and date range. All data is sample and read-only.",
    icon: <Rocket className="h-4 w-4" />,
    navigateTo: "/actiplans/3d42526c-4aa3-416d-ae8c-0e84bc129c1b/report",
    isInteractive: true,
    tip: "Switch platforms and date ranges to see how the dashboard reacts.",
  },
  {
    title: "Creative Mesh",
    shortDesc: "Assigned creatives for the sample ActiPlan.",
    description:
      "Sample creatives are pre-assigned across phases and ad sets so you can see how Creative Mesh validates formats and platform-specific requirements.",
    icon: <Image className="h-4 w-4" />,
    navigateTo: "/creatives",
    isInteractive: true,
    tip: "AI-powered matching can auto-assign assets in real usage.",
  },
  {
    title: "Insights & Recommendations",
    shortDesc: "AI-powered insights and optimization suggestions.",
    description:
      "Review automated insights and actionable recommendations generated from your campaign performance. Sample data is used so you can explore the full experience.",
    icon: <CheckCircle2 className="h-4 w-4" />,
    navigateTo: "/insights",
  },
];

const TOUR_STORAGE_KEY = "actiplan_tour_completed";

export function TourRibbon() {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { seedTourData, isSeeded } = useTourDataContext();

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  // Sync active step for TourResumeButton
  useEffect(() => {
    if (visible) setTourActiveStep(currentStep);
    else setTourActiveStep(null);
  }, [visible, currentStep]);

  const resumeTour = useCallback(() => {
    console.log("[TourRibbon] resumeTour called");
    const saved = localStorage.getItem("actiplan_tour_active_step");
    if (saved !== null) {
      const n = parseInt(saved);
      if (!isNaN(n) && n >= 0 && n < TOUR_STEPS.length) setCurrentStep(n);
    }
    setVisible(true);
  }, []);

  // Expose resume both as a global and via custom event (for cross-tree calls)
  useEffect(() => {
    console.log("[TourRibbon] mounted, registering resume handler");
    (window as any).__resumeOnboardingTour = resumeTour;
    const handler = () => resumeTour();
    window.addEventListener("tour-resume", handler);
    return () => {
      delete (window as any).__resumeOnboardingTour;
      window.removeEventListener("tour-resume", handler);
    };
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

    if (next.seedsData && !isSeeded) {
      setCurrentStep(nextStep);
      setSeeding(true);
      await seedTourData();
      setSeeding(false);
      const stepAfterSeed = nextStep + 1;
      if (stepAfterSeed < TOUR_STEPS.length) {
        const navStep = TOUR_STEPS[stepAfterSeed];
        if (navStep.navigateTo) navigate(navStep.navigateTo);
        setCurrentStep(stepAfterSeed);
      }
      return;
    }

    if (next.seedsData && isSeeded) {
      const stepAfterSeed = nextStep + 1;
      if (stepAfterSeed < TOUR_STEPS.length) {
        const navStep = TOUR_STEPS[stepAfterSeed];
        if (navStep.navigateTo) navigate(navStep.navigateTo);
        setCurrentStep(stepAfterSeed);
      }
      return;
    }

    if (next.navigateTo) navigate(next.navigateTo);
    setCurrentStep(nextStep);
  }, [currentStep, isSeeded, seedTourData, navigate, handleSkip]);

  const handlePrev = useCallback(() => {
    let prev = currentStep - 1;
    if (prev >= 0 && TOUR_STEPS[prev].seedsData) prev--;
    if (prev < 0) prev = 0;
    const step = TOUR_STEPS[prev];
    if (step.navigateTo) navigate(step.navigateTo);
    setCurrentStep(prev);
  }, [currentStep, navigate]);

  if (!visible) return null;

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <div className="relative z-[60] border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm animate-in slide-in-from-top-2">
      {/* Slim bar */}
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {step.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Step {currentStep + 1}/{TOUR_STEPS.length}
            </span>
            <span className="text-sm font-semibold text-foreground truncate">
              {step.title}
            </span>
            <span className="hidden md:inline text-sm text-muted-foreground truncate">
              — {step.shortDesc}
            </span>
          </div>
          <Progress value={progress} className="h-1 mt-1" />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((e) => !e)}
            className="h-8 px-2 text-xs gap-1"
          >
            Details
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          {currentStep > 0 && !seeding && (
            <Button variant="outline" size="sm" onClick={handlePrev} className="h-8 gap-1">
              <ChevronLeft className="h-3 w-3" />
              Back
            </Button>
          )}
          <Button size="sm" onClick={handleNext} className="h-8 gap-1" disabled={seeding}>
            {seeding ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading…
              </>
            ) : currentStep === TOUR_STEPS.length - 1 ? (
              "Finish"
            ) : (
              <>
                Next
                <ChevronRight className="h-3 w-3" />
              </>
            )}
          </Button>
          {!step.seedsData && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              className="h-8 w-8 text-muted-foreground"
              title="Skip tour"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="border-t border-border/50 bg-muted/30 px-4 py-3 animate-in fade-in slide-in-from-top-1">
          <p className="text-sm text-foreground leading-relaxed">{step.description}</p>
          {step.tip && (
            <p className="mt-2 text-xs text-primary">
              <span className="font-semibold">💡 Tip:</span> {step.tip}
            </p>
          )}
          {step.isInteractive && (
            <p className="mt-1 text-xs text-muted-foreground">
              👆 Feel free to click around — Sample Mode prevents any changes from being saved.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function resetOnboardingTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}
