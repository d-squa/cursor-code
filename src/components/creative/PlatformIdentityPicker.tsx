// Platform Identity Picker - Select brand/creator identity for ad creation
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  RefreshCw,
  User,
  Building2,
  Star,
  AlertTriangle,
  CheckCircle,
  Shield,
  Lock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface PlatformIdentity {
  id: string;
  platform: 'tiktok' | 'meta';
  advertiser_id: string;
  identity_id: string;
  identity_type: string;
  display_name: string | null;
  profile_image_url: string | null;
  is_active: boolean | null;
  is_brand_owned: boolean | null;
  requires_authorization: boolean | null;
  synced_at: string | null;
}

interface PlatformIdentityPickerProps {
  platform: 'tiktok' | 'meta';
  advertiserId: string;
  selectedIdentityId?: string;
  onSelectIdentity: (identity: PlatformIdentity | null) => void;
  showSparkInfo?: boolean;
}

const identityTypeLabels: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  // TikTok identity types
  'TT_USER': { label: 'TikTok Account', icon: <User className="h-4 w-4" />, description: 'Brand TikTok profile' },
  'BC_AUTH_TT': { label: 'Business Center Auth', icon: <Building2 className="h-4 w-4" />, description: 'BC-authorized TikTok account' },
  'AUTH_CODE': { label: 'Creator Auth', icon: <Star className="h-4 w-4" />, description: 'Creator-authorized account' },
  'CUSTOMIZED_USER': { label: 'Custom Identity', icon: <User className="h-4 w-4" />, description: 'Custom display name' },
  // Meta identity types
  'PAGE': { label: 'Facebook Page', icon: <Building2 className="h-4 w-4" />, description: 'Facebook Page identity' },
  'INSTAGRAM': { label: 'Instagram Account', icon: <User className="h-4 w-4" />, description: 'Instagram account' },
};

export function PlatformIdentityPicker({
  platform,
  advertiserId,
  selectedIdentityId,
  onSelectIdentity,
  showSparkInfo = true,
}: PlatformIdentityPickerProps) {
  const queryClient = useQueryClient();

  // Fetch identities from platform_identities table
  const { data: identities, isLoading, refetch } = useQuery({
    queryKey: ['platform-identities', platform, advertiserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_identities')
        .select('*')
        .eq('platform', platform)
        .eq('advertiser_id', advertiserId)
        .eq('is_active', true)
        .order('is_brand_owned', { ascending: false });

      if (error) throw error;
      return data as PlatformIdentity[];
    },
    enabled: !!advertiserId,
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('resolve-platform-identities', {
        body: { platform, advertiserId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Sync failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['platform-identities', platform, advertiserId] });
      toast.success(`Found ${data.identities?.length || 0} identities`);
    },
    onError: (error) => {
      toast.error(`Failed to fetch identities: ${error.message}`);
    },
  });

  // Auto-select brand-owned identity if none selected
  useEffect(() => {
    if (!selectedIdentityId && identities?.length) {
      const brandOwned = identities.find((i) => i.is_brand_owned);
      if (brandOwned) {
        onSelectIdentity(brandOwned);
      }
    }
  }, [identities, selectedIdentityId, onSelectIdentity]);

  // Get selected identity object
  const selectedIdentity = identities?.find((i) => i.id === selectedIdentityId);

  // Separate brand-owned vs requires-auth identities
  const brandOwnedIdentities = (identities || []).filter((i) => i.is_brand_owned);
  const authRequiredIdentities = (identities || []).filter((i) => i.requires_authorization && !i.is_brand_owned);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Ad Identity</CardTitle>
            <CardDescription>
              Select whose profile the ad will run as
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', syncMutation.isPending && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : !identities?.length ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No identities found</AlertTitle>
            <AlertDescription>
              Click "Refresh" to fetch available identities from {platform === 'tiktok' ? 'TikTok Business Center' : 'Meta Business'}.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Brand-owned identities (recommended) */}
            {brandOwnedIdentities.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  Brand Profiles (Recommended)
                </div>
                <RadioGroup
                  value={selectedIdentityId || ''}
                  onValueChange={(value) => {
                    const identity = identities?.find((i) => i.id === value);
                    onSelectIdentity(identity || null);
                  }}
                >
                  {brandOwnedIdentities.map((identity) => (
                    <IdentityOption
                      key={identity.id}
                      identity={identity}
                      isSelected={selectedIdentityId === identity.id}
                    />
                  ))}
                </RadioGroup>
              </div>
            )}

            {/* Auth-required identities */}
            {authRequiredIdentities.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  Creator Accounts (Requires Authorization)
                </div>
                <RadioGroup
                  value={selectedIdentityId || ''}
                  onValueChange={(value) => {
                    const identity = identities?.find((i) => i.id === value);
                    onSelectIdentity(identity || null);
                  }}
                >
                  {authRequiredIdentities.map((identity) => (
                    <IdentityOption
                      key={identity.id}
                      identity={identity}
                      isSelected={selectedIdentityId === identity.id}
                    />
                  ))}
                </RadioGroup>
              </div>
            )}

            {/* Spark Ads info */}
            {showSparkInfo && platform === 'tiktok' && (
              <Alert className="bg-purple-500/10 border-purple-500/30">
                <Star className="h-4 w-4 text-purple-600" />
                <AlertTitle className="text-purple-700 dark:text-purple-400">Spark Ads</AlertTitle>
                <AlertDescription className="text-purple-600 dark:text-purple-300">
                  Spark Ads appear as organic content with engagement (likes, comments).
                  Non-Spark Ads are standard ads. Both use your brand identity.
                </AlertDescription>
              </Alert>
            )}

            {/* Selected identity summary */}
            {selectedIdentity && (
              <div className="pt-3 border-t">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedIdentity.profile_image_url || undefined} />
                    <AvatarFallback>
                      {selectedIdentity.display_name?.charAt(0) || 'A'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      Ads will run as: {selectedIdentity.display_name || 'Unknown'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedIdentity.is_brand_owned
                        ? 'Brand-owned profile - no creator authorization needed'
                        : 'Creator profile - may require authorization'}
                    </p>
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-600 ml-auto" />
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Individual identity option
function IdentityOption({
  identity,
  isSelected,
}: {
  identity: PlatformIdentity;
  isSelected: boolean;
}) {
  const typeInfo = identityTypeLabels[identity.identity_type] || {
    label: identity.identity_type,
    icon: <User className="h-4 w-4" />,
    description: 'Identity',
  };

  return (
    <Label
      htmlFor={identity.id}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
        isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
      )}
    >
      <RadioGroupItem value={identity.id} id={identity.id} />

      <Avatar className="h-10 w-10">
        <AvatarImage src={identity.profile_image_url || undefined} />
        <AvatarFallback className="bg-muted">
          {identity.display_name?.charAt(0) || typeInfo.icon}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {identity.display_name || 'Unnamed'}
          </span>
          {identity.is_brand_owned && (
            <Badge variant="secondary" className="bg-green-500/20 text-green-700 text-xs">
              Owned
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {typeInfo.icon}
          <span>{typeInfo.label}</span>
        </div>
      </div>
    </Label>
  );
}
