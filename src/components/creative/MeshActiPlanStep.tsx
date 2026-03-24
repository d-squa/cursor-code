// Step 1: ActiPlan & Platform Selection
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Layers, ArrowRight, CheckCircle2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Campaign {
  id: string;
  name: string;
  status: string;
  platforms: string[];
}

interface MeshActiPlanStepProps {
  initialCampaignId?: string;
  onSelect: (campaignId: string, campaignName: string, platforms: string[]) => void;
  onPlatformSelect: (platform: 'meta' | 'tiktok' | 'google') => void;
  onJumpToContent?: (campaignId: string, campaignName: string, platform: 'meta' | 'tiktok' | 'google') => void;
  selectedCampaignId?: string;
  selectedPlatform?: 'meta' | 'tiktok' | 'google';
}

export function MeshActiPlanStep({
  initialCampaignId,
  onSelect,
  onPlatformSelect,
  selectedCampaignId,
  selectedPlatform,
}: MeshActiPlanStepProps) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [localCampaignId, setLocalCampaignId] = useState(selectedCampaignId || initialCampaignId || '');
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);

  // Load campaigns
  useEffect(() => {
    if (!user) return;

    const loadCampaigns = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, status, platforms')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        const parsed = data.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status || 'draft',
          platforms: Array.isArray(c.platforms) 
            ? c.platforms.map((p: any) => typeof p === 'string' ? p : p.id || p.name || 'unknown')
            : [],
        }));
        setCampaigns(parsed);

        // If initial campaign ID provided, auto-select it
        if (initialCampaignId) {
          const campaign = parsed.find(c => c.id === initialCampaignId);
          if (campaign) {
            setLocalCampaignId(campaign.id);
            handleCampaignChange(campaign.id, parsed);
          }
        }
      }
      setIsLoading(false);
    };

    loadCampaigns();
  }, [user, initialCampaignId]);

  const handleCampaignChange = (campaignId: string, campaignList = campaigns) => {
    setLocalCampaignId(campaignId);
    const campaign = campaignList.find(c => c.id === campaignId);
    if (!campaign) return;

    // Normalize platforms
    const normalizedPlatforms = campaign.platforms
      .map(p => {
        const lower = p.toLowerCase();
        if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'meta';
        if (lower.includes('tiktok')) return 'tiktok';
        if (lower.includes('google')) return 'google';
        return null;
      })
      .filter((p): p is 'meta' | 'tiktok' | 'google' => p !== null);

    const uniquePlatforms = [...new Set(normalizedPlatforms)];
    setAvailablePlatforms(uniquePlatforms);

    onSelect(campaign.id, campaign.name, campaign.platforms);

    // Auto-select if only one platform
    if (uniquePlatforms.length === 1) {
      onPlatformSelect(uniquePlatforms[0]);
    }
  };

  const selectedCampaign = campaigns.find(c => c.id === localCampaignId);
  const showPlatformSelector = localCampaignId && availablePlatforms.length > 1;
  const canProceed = localCampaignId && selectedPlatform;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      {/* ActiPlan Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Select ActiPlan
          </CardTitle>
          <CardDescription>
            Choose the campaign structure to mesh creatives against
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              No ActiPlans found. Create one first to use Creative Mesh.
            </div>
          ) : (
            <Select value={localCampaignId} onValueChange={(id) => handleCampaignChange(id)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an ActiPlan..." />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map(campaign => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    <div className="flex items-center gap-2">
                      <span>{campaign.name}</span>
                      <Badge variant="outline" className="text-xs">{campaign.status}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {selectedCampaign && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">{selectedCampaign.name}</p>
                <div className="flex gap-1 mt-1">
                  {availablePlatforms.map(p => (
                    <Badge key={p} variant="secondary" className="capitalize text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Selection (if multiple) */}
      {showPlatformSelector && (
        <Card>
          <CardHeader>
            <CardTitle>Select Platform</CardTitle>
            <CardDescription>
              Choose which platform's creatives you want to mesh
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {availablePlatforms.map(platform => (
                <button
                  key={platform}
                  onClick={() => onPlatformSelect(platform as 'meta' | 'tiktok' | 'google')}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    selectedPlatform === platform
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium capitalize">{platform}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {platform === 'meta' 
                      ? 'Facebook & Instagram' 
                      : 'TikTok Ads'}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Continue Button - Always show when campaign selected */}
      {localCampaignId && selectedPlatform && (
        <div className="flex justify-end">
          <Button size="lg" className="gap-2" onClick={() => onPlatformSelect(selectedPlatform)}>
            Continue to Creative Source
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
