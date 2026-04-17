import React from 'react';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { Feature } from '@/config/featureAccess';
import { TIER_DISPLAY_NAMES } from '@/config/subscriptionTiers';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSampleMode } from '@/contexts/SampleModeContext';

interface FeatureGateProps {
  feature: Feature;
  children: React.ReactNode;
  // Optional: Custom fallback component when access is denied
  fallback?: React.ReactNode;
  // Optional: Show nothing instead of upgrade prompt
  hideIfNoAccess?: boolean;
  // Optional: Just check access without rendering fallback (for conditional rendering)
  renderIfNoAccess?: boolean;
}

export function FeatureGate({ 
  feature, 
  children, 
  fallback, 
  hideIfNoAccess = false,
  renderIfNoAccess = false 
}: FeatureGateProps) {
  const { hasAccess, getRequiredTierForFeature, loading } = useFeatureAccess();
  const { isSampleMode } = useSampleMode();
  const navigate = useNavigate();
  
  // Show nothing while loading
  if (loading) {
    return null;
  }
  
  // Sample Mode bypasses feature gates so all users can experience the tour
  const canAccess = isSampleMode || hasAccess(feature);
  
  if (canAccess) {
    return <>{children}</>;
  }
  
  // If renderIfNoAccess is true, render children anyway (for soft gating)
  if (renderIfNoAccess) {
    return <>{children}</>;
  }
  
  // Hide completely if requested
  if (hideIfNoAccess) {
    return null;
  }
  
  // Show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }
  
  // Default upgrade prompt
  const requiredTier = getRequiredTierForFeature(feature);
  
  return (
    <div className="flex flex-col items-center justify-center p-6 border border-dashed border-muted-foreground/30 rounded-lg bg-muted/20">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Lock className="h-5 w-5" />
        <span className="font-medium">Feature Locked</span>
      </div>
      <p className="text-sm text-muted-foreground text-center mb-4">
        This feature requires the <span className="font-semibold text-foreground">{TIER_DISPLAY_NAMES[requiredTier]}</span> plan or higher.
      </p>
      <Button 
        variant="default" 
        size="sm"
        onClick={() => navigate('/settings/plans')}
        className="gap-2"
      >
        <Sparkles className="h-4 w-4" />
        Upgrade Plan
      </Button>
    </div>
  );
}

// Hook-based access check for more granular control
export function useFeatureGate(feature: Feature) {
  const { hasAccess, getRequiredTierForFeature, tier, loading } = useFeatureAccess();
  
  return {
    hasAccess: hasAccess(feature),
    requiredTier: getRequiredTierForFeature(feature),
    currentTier: tier,
    loading,
  };
}
