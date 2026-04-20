import React from 'react';
import { Lock } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { Feature } from '@/config/featureAccess';
import { TIER_DISPLAY_NAMES } from '@/config/subscriptionTiers';
import { useNavigate, Link } from 'react-router-dom';

interface LockedDropdownMenuItemProps {
  feature: Feature;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

/**
 * A dropdown menu item that shows as locked when the user doesn't have access to the feature.
 * Shows a lock icon and displays an upgrade tooltip on hover with a link to the plans page.
 */
export function LockedDropdownMenuItem({ feature, children, icon }: LockedDropdownMenuItemProps) {
  const { hasAccess, getRequiredTierForFeature } = useFeatureAccess();
  const navigate = useNavigate();
  
  const canAccess = hasAccess(feature);
  const requiredTier = getRequiredTierForFeature(feature);
  
  if (canAccess) {
    // This component should only be used for locked items
    // If user has access, the parent should render the normal item instead
    return null;
  }
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <DropdownMenuItem
            aria-disabled
            className="opacity-50 cursor-pointer"
            onSelect={() => {
              navigate('/app/settings/plans');
            }}
          >
            <Lock className="w-4 h-4 mr-2" />
            {children}
          </DropdownMenuItem>
        </TooltipTrigger>
        <TooltipContent 
          side="left" 
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
