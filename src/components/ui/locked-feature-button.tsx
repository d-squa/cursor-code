import React from 'react';
import { Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { Feature } from '@/config/featureAccess';
import { TIER_DISPLAY_NAMES } from '@/config/subscriptionTiers';
import { Link } from 'react-router-dom';
import { useSampleMode } from '@/contexts/SampleModeContext';

interface LockedFeatureButtonProps {
  feature: Feature;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps a button to show it as disabled with a lock icon and an upgrade tooltip 
 * when the user doesn't have access to the feature. The tooltip contains a 
 * hyperlink to the plans page.
 *
 * In Sample Mode, the gate is bypassed visually so tour users can browse
 * locked features. Mutations remain blocked by `guardWrite`.
 */
export function LockedFeatureButton({ feature, children, className }: LockedFeatureButtonProps) {
  const { hasAccess, getRequiredTierForFeature } = useFeatureAccess();
  const { isSampleMode } = useSampleMode();

  const canAccess = isSampleMode || hasAccess(feature);

  if (canAccess) {
    return <>{children}</>;
  }

  const requiredTier = getRequiredTierForFeature(feature);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span className={`inline-flex ${className || ''}`}>
            <span className="opacity-50 pointer-events-none flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {children}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-background border border-border shadow-lg z-[100]"
        >
          <Link
            to="/app/settings/plans"
            className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
          >
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>
              Upgrade to <span className="font-semibold text-primary">{TIER_DISPLAY_NAMES[requiredTier]}</span> to unlock
            </span>
          </Link>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
