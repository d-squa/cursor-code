import React from 'react';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { SubscriptionTier, TIER_DISPLAY_NAMES } from '@/config/subscriptionTiers';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UpgradeBannerProps {
  targetTier: SubscriptionTier;
  message?: string;
  onDismiss?: () => void;
  showDismiss?: boolean;
}

export function UpgradeBanner({ 
  targetTier, 
  message,
  onDismiss,
  showDismiss = false 
}: UpgradeBannerProps) {
  const { tier, canUpgradeTo } = useFeatureAccess();
  const navigate = useNavigate();
  
  // Don't show if user already has this tier or higher
  if (!canUpgradeTo(targetTier)) {
    return null;
  }
  
  const defaultMessage = `Upgrade to ${TIER_DISPLAY_NAMES[targetTier]} to unlock more features`;
  
  return (
    <div className="relative flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-full">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-medium text-foreground">
            {message || defaultMessage}
          </p>
          <p className="text-sm text-muted-foreground">
            You're currently on the {TIER_DISPLAY_NAMES[tier]} plan
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button 
          variant="default" 
          size="sm"
          onClick={() => navigate('/app/settings/plans')}
        >
          Upgrade Now
        </Button>
        
        {showDismiss && onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
