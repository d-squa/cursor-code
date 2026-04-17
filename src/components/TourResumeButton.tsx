import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";

const TOUR_STORAGE_KEY = "actiplan_tour_completed";
const TOUR_ACTIVE_KEY = "actiplan_tour_active_step";

export function setTourActiveStep(step: number | null) {
  if (step === null) {
    localStorage.removeItem(TOUR_ACTIVE_KEY);
  } else {
    localStorage.setItem(TOUR_ACTIVE_KEY, String(step));
  }
  window.dispatchEvent(new Event("tour-step-change"));
}

export function getTourActiveStep(): number | null {
  const val = localStorage.getItem(TOUR_ACTIVE_KEY);
  return val !== null ? parseInt(val) : null;
}

interface TourResumeButtonProps {
  onResume: () => void;
}

export function TourResumeButton({ onResume }: TourResumeButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => {
      const completed = localStorage.getItem(TOUR_STORAGE_KEY);
      const activeStep = getTourActiveStep();
      setVisible(!completed && activeStep !== null);
    };
    check();
    window.addEventListener("tour-step-change", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("tour-step-change", check);
      window.removeEventListener("storage", check);
    };
  }, []);

  if (!visible) return null;

  return (
    <Button
      onClick={onResume}
      className="fixed bottom-24 right-6 z-50 shadow-lg gap-2 rounded-full px-5 py-3 animate-in fade-in slide-in-from-bottom-4"
      size="lg"
    >
      <GraduationCap className="h-4 w-4" />
      Continue Tour
    </Button>
  );
}
