import React from 'react';
import { Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { Feature } from '@/config/featureAccess';
import { TIER_DISPLAY_NAMES } from '@/config/subscriptionTiers';
import { useNavigate } from 'react-router-dom';

interface LockedFeatureButtonProps {
  feature: Feature;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps a button to show it as disabled with an upgrade tooltip when the user
 * doesn't have access to the feature. The button remains visible but completely
 * disabled, and hovering shows an upgrade prompt.
 */
export function LockedFeatureButton({ feature, children, className }: LockedFeatureButtonProps) {
  const { hasAccess, getRequiredTierForFeature } = useFeatureAccess();
  const navigate = useNavigate();
  
  const canAccess = hasAccess(feature);
  
  if (canAccess) {
    return <>{children}</>;
  }
  
  const requiredTier = getRequiredTierForFeature(feature);
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span 
            className={`inline-flex cursor-pointer ${className || ''}`}
            onClick={() => navigate('/settings/plans')}
          >
            <span className="opacity-50 pointer-events-none">
              {children}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="flex items-center gap-2 bg-background border border-border shadow-lg"
        >
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm">
            Upgrade to <span className="font-semibold text-primary">{TIER_DISPLAY_NAMES[requiredTier]}</span> to unlock
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
