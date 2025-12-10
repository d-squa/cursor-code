import { useMemo } from 'react';
import { useSubscription } from './useSubscription';
import { getTierFromProductId, SubscriptionTier, ACTIPLAN_DAILY_LIMITS, TEAM_MEMBER_LIMITS, TIER_DISPLAY_NAMES } from '@/config/subscriptionTiers';
import { Feature, hasFeatureAccess, getRequiredTier } from '@/config/featureAccess';

interface FeatureAccessResult {
  // User's current tier
  tier: SubscriptionTier;
  tierDisplayName: string;
  
  // Subscription status
  isSubscribed: boolean;
  isOnTrial: boolean;
  loading: boolean;
  
  // Feature access checking
  hasAccess: (feature: Feature) => boolean;
  getRequiredTierForFeature: (feature: Feature) => SubscriptionTier;
  
  // Limits
  actiplanDailyLimit: number;
  teamMemberLimits: { owners: number; admins: number; members: number };
  
  // Helper for upgrade prompts
  canUpgradeTo: (targetTier: SubscriptionTier) => boolean;
}

export function useFeatureAccess(): FeatureAccessResult {
  const { subscription, loading, isSubscribed, isOnTrial } = useSubscription();
  
  const tier = useMemo(() => {
    if (!subscription?.subscribed) {
      // If on trial, treat as trial tier
      if (subscription?.onTrial) {
        return getTierFromProductId(subscription.productId);
      }
      return 'trial';
    }
    return getTierFromProductId(subscription.productId);
  }, [subscription]);
  
  const hasAccess = useMemo(() => {
    return (feature: Feature) => hasFeatureAccess(tier, feature);
  }, [tier]);
  
  const getRequiredTierForFeature = useMemo(() => {
    return (feature: Feature) => getRequiredTier(feature);
  }, []);
  
  const canUpgradeTo = useMemo(() => {
    return (targetTier: SubscriptionTier) => {
      const tierOrder: SubscriptionTier[] = ['trial', 'basic', 'freelancer', 'enterprise', 'agency'];
      return tierOrder.indexOf(targetTier) > tierOrder.indexOf(tier);
    };
  }, [tier]);
  
  return {
    tier,
    tierDisplayName: TIER_DISPLAY_NAMES[tier],
    isSubscribed,
    isOnTrial,
    loading,
    hasAccess,
    getRequiredTierForFeature,
    actiplanDailyLimit: ACTIPLAN_DAILY_LIMITS[tier],
    teamMemberLimits: TEAM_MEMBER_LIMITS[tier],
    canUpgradeTo,
  };
}
