// Ad Configuration Form - Create ads using validated inputs from the new pipeline
import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Rocket,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  Loader2,
  Sparkles,
  Play,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PlatformAssetLibrary, PlatformAsset } from './PlatformAssetLibrary';
import { PlatformIdentityPicker, PlatformIdentity } from './PlatformIdentityPicker';

interface AdConfigurationFormProps {
  platform: 'tiktok' | 'meta';
  advertiserId: string;
  adgroupId: string;
  campaignId?: string;
  onSuccess?: (adId: string) => void;
  onCancel?: () => void;
}

// TikTok CTA options
const tiktokCtaOptions = [
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'GET_QUOTE', label: 'Get Quote' },
  { value: 'APPLY_NOW', label: 'Apply Now' },
  { value: 'BOOK_NOW', label: 'Book Now' },
  { value: 'ORDER_NOW', label: 'Order Now' },
  { value: 'WATCH_NOW', label: 'Watch Now' },
  { value: 'PLAY_GAME', label: 'Play Game' },
  { value: 'INSTALL_NOW', label: 'Install Now' },
];

interface ValidationResult {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

export function AdConfigurationForm({
  platform,
  advertiserId,
  adgroupId,
  campaignId,
  onSuccess,
  onCancel,
}: AdConfigurationFormProps) {
  // Form state
  const [adName, setAdName] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<PlatformAsset | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<PlatformIdentity | null>(null);
  const [isSparkAd, setIsSparkAd] = useState(false);
  const [landingPageUrl, setLandingPageUrl] = useState('');
  const [adText, setAdText] = useState('');
  const [callToAction, setCallToAction] = useState('LEARN_MORE');
  const [displayName, setDisplayName] = useState('');

  // Validation state
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-generate ad name from asset
  useEffect(() => {
    if (selectedAsset && !adName) {
      const baseName = selectedAsset.asset_name?.replace(/\.[^/.]+$/, '') || 'Untitled';
      setAdName(`${baseName}_${new Date().toISOString().slice(0, 10)}`);
    }
  }, [selectedAsset, adName]);

  // Validate configuration
  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAsset || !selectedIdentity) {
        return {
          isValid: false,
          errors: [
            ...(!selectedAsset ? [{ field: 'asset', message: 'Please select a creative asset' }] : []),
            ...(!selectedIdentity ? [{ field: 'identity', message: 'Please select an identity' }] : []),
          ],
          warnings: [],
        };
      }

      const { data, error } = await supabase.functions.invoke('validate-ad-config', {
        body: {
          platform,
          advertiserId,
          assetId: selectedAsset.platform_asset_id,
          assetType: selectedAsset.asset_type,
          identityId: selectedIdentity.identity_id,
          identityType: selectedIdentity.identity_type,
          isSparkAd,
          landingPageUrl,
        },
      });

      if (error) throw error;
      return data as ValidationResult;
    },
    onSuccess: (result) => {
      setValidation(result);
    },
    onError: (error) => {
      setValidation({
        isValid: false,
        errors: [{ field: 'general', message: error.message }],
        warnings: [],
      });
    },
  });

  // Execute ad creation
  const createAdMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAsset || !selectedIdentity) {
        throw new Error('Missing required fields');
      }

      const { data, error } = await supabase.functions.invoke('execute-ad-creation', {
        body: {
          platform,
          advertiserId,
          adgroupId,
          adName,
          assetId: selectedAsset.platform_asset_id,
          assetType: selectedAsset.asset_type,
          identityId: selectedIdentity.identity_id,
          identityType: selectedIdentity.identity_type,
          isSparkAd,
          landingPageUrl,
          adText,
          callToAction,
          displayName: displayName || undefined,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Ad creation failed');
      return data;
    },
    onSuccess: (data) => {
      toast.success('Ad created successfully');
      onSuccess?.(data.adId);
    },
    onError: (error) => {
      toast.error(`Failed to create ad: ${error.message}`);
    },
  });

  // Handle validate click
  const handleValidate = () => {
    validateMutation.mutate();
  };

  // Handle create ad
  const handleCreateAd = () => {
    if (!validation?.isValid) {
      toast.error('Please fix validation errors before creating the ad');
      return;
    }
    createAdMutation.mutate();
  };

  // Check if form is ready for validation
  const canValidate = !!selectedAsset && !!selectedIdentity;
  const canCreate = validation?.isValid && canValidate;

  return (
    <div className="space-y-6">
      {/* Step 1: Select Creative Asset */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">1</span>
            Select Creative Asset
          </CardTitle>
          <CardDescription>
            Choose a video or image from your {platform === 'tiktok' ? 'TikTok' : 'Meta'} Creative Library
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformAssetLibrary
            platform={platform}
            advertiserId={advertiserId}
            selectedAssetId={selectedAsset?.id}
            onSelectAsset={setSelectedAsset}
            selectable
          />

          {selectedAsset && (
            <div className="mt-4 p-3 rounded-lg bg-muted/50 flex items-center gap-3">
              {selectedAsset.asset_type === 'video' ? (
                <Play className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{selectedAsset.asset_name || 'Untitled'}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedAsset.asset_type} • {selectedAsset.width}×{selectedAsset.height}
                  {selectedAsset.duration_seconds && ` • ${selectedAsset.duration_seconds}s`}
                </p>
              </div>
              <Badge variant="secondary" className={cn(
                selectedAsset.approval_status === 'SUCCESS' ? 'bg-green-500/20 text-green-700' : ''
              )}>
                {selectedAsset.approval_status}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Select Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">2</span>
            Select Ad Identity
          </CardTitle>
          <CardDescription>
            Choose whose profile the ad will appear as
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformIdentityPicker
            platform={platform}
            advertiserId={advertiserId}
            selectedIdentityId={selectedIdentity?.id}
            onSelectIdentity={setSelectedIdentity}
          />
        </CardContent>
      </Card>

      {/* Step 3: Ad Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">3</span>
            Configure Ad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Ad Name */}
          <div className="space-y-2">
            <Label htmlFor="adName">Ad Name</Label>
            <Input
              id="adName"
              value={adName}
              onChange={(e) => setAdName(e.target.value)}
              placeholder="Enter ad name"
            />
          </div>

          {/* Spark Ad Toggle (TikTok only) */}
          {platform === 'tiktok' && (
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="font-medium">Spark Ad</p>
                  <p className="text-sm text-muted-foreground">
                    Enable organic-style engagement (likes, comments)
                  </p>
                </div>
              </div>
              <Switch
                checked={isSparkAd}
                onCheckedChange={setIsSparkAd}
                disabled={!selectedAsset?.spark_eligible}
              />
            </div>
          )}

          {/* Landing Page URL */}
          <div className="space-y-2">
            <Label htmlFor="landingPageUrl">Landing Page URL</Label>
            <Input
              id="landingPageUrl"
              type="url"
              value={landingPageUrl}
              onChange={(e) => setLandingPageUrl(e.target.value)}
              placeholder="https://example.com/landing-page"
            />
          </div>

          {/* CTA */}
          <div className="space-y-2">
            <Label htmlFor="cta">Call to Action</Label>
            <Select value={callToAction} onValueChange={setCallToAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tiktokCtaOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Advanced Options */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <ChevronDown className={cn('h-4 w-4 transition-transform', showAdvanced && 'rotate-180')} />
                Advanced Options
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-4">
              {/* Ad Text */}
              <div className="space-y-2">
                <Label htmlFor="adText">Ad Text (optional)</Label>
                <Textarea
                  id="adText"
                  value={adText}
                  onChange={(e) => setAdText(e.target.value)}
                  placeholder="Enter ad text..."
                  rows={3}
                />
              </div>

              {/* Custom Display Name */}
              <div className="space-y-2">
                <Label htmlFor="displayName">Custom Display Name (optional)</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Override identity display name"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Validation Results */}
      {validation && (
        <Card className={cn(
          validation.isValid ? 'border-green-500/50' : 'border-destructive/50'
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {validation.isValid ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Validation Passed
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  Validation Failed
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {validation.errors.map((err, i) => (
              <Alert key={i} variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{err.message}</AlertDescription>
              </Alert>
            ))}
            {validation.warnings.map((warn, i) => (
              <Alert key={i} className="py-2 bg-yellow-500/10 border-yellow-500/30">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-700">{warn.message}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleValidate}
            disabled={!canValidate || validateMutation.isPending}
          >
            {validateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Validate
          </Button>
          <Button
            onClick={handleCreateAd}
            disabled={!canCreate || createAdMutation.isPending}
          >
            {createAdMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Rocket className="h-4 w-4 mr-2" />
            Create Ad
          </Button>
        </div>
      </div>
    </div>
  );
}
