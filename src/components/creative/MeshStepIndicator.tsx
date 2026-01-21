// Step indicator for Creative Mesh workflow
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MeshStep } from '@/hooks/useCreativeMeshProgress';

interface Step {
  id: MeshStep;
  label: string;
}

const STEPS: Step[] = [
  { id: 'actiplan', label: 'ActiPlan' },
  { id: 'source', label: 'Creative Source' },
  { id: 'mesh', label: 'Auto-Mesh' },
  { id: 'content', label: 'Creative Content' },
];

interface MeshStepIndicatorProps {
  currentStep: MeshStep;
  onStepClick?: (step: MeshStep) => void;
  canNavigate?: (step: MeshStep) => boolean;
}

export function MeshStepIndicator({ 
  currentStep, 
  onStepClick,
  canNavigate = () => true,
}: MeshStepIndicatorProps) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="flex items-center justify-center gap-2 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = step.id === currentStep;
        const isClickable = onStepClick && canNavigate(step.id);

        return (
          <div key={step.id} className="flex items-center">
            {index > 0 && (
              <div 
                className={cn(
                  "w-8 h-0.5 mx-1",
                  isCompleted ? "bg-primary" : "bg-muted"
                )} 
              />
            )}
            <button
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                isCompleted && "text-primary",
                isCurrent && "bg-primary text-primary-foreground",
                !isCompleted && !isCurrent && "text-muted-foreground",
                isClickable && !isCurrent && "hover:bg-muted cursor-pointer",
                !isClickable && "cursor-default"
              )}
            >
              <span 
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-xs",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent && "bg-primary-foreground text-primary",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
