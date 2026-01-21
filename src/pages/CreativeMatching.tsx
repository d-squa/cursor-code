// Creative Mesh Page - Step-based workflow for matching creatives to campaign structures
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wand2, X, ArrowLeft, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreativeMatching, UICreativeMatch } from '@/hooks/useCreativeMatching';
import { useCreativeMeshProgress, MeshStep, SelectedAsset } from '@/hooks/useCreativeMeshProgress';
import { MeshStepIndicator } from '@/components/creative/MeshStepIndicator';
import { MeshActiPlanStep } from '@/components/creative/MeshActiPlanStep';
import { MeshSourceStep } from '@/components/creative/MeshSourceStep';
import { StructureCentricView } from '@/components/creative/StructureCentricView';
import { TextAssetsStep } from '@/components/creative/TextAssetsStep';
import { FeatureGate } from '@/components/FeatureGate';

interface AdAccountInfo {
  platform: 'meta' | 'tiktok';
  accountId: string;
}

interface PageConfig {
  platform: 'meta' | 'tiktok';
  pageId?: string;
  identityId?: string;
  advertiserId?: string;
  pageName?: string;
}

export default function CreativeMatching() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCampaignId = searchParams.get('campaignId') || undefined;

  // Mesh progress hook manages step state
  const {
    progress,
    isLoading: isLoadingProgress,
    currentStep,
    selectActiPlan,
    selectPlatform,
    addAsset,
    removeAsset,
    clearAssets,
    setMeshedCreativeIds,
    goToStep,
    reset,
  } = useCreativeMeshProgress(initialCampaignId);

  // Creative matching hook for the actual matching logic
  const {
    state: matchingState,
    stats,
    loadCampaignStructures,
    processFiles,
    addPlatformAssets,
    runMatching,
    acceptMatch,
    rejectMatch,
    clearRejection,
    clearAcceptedMatch,
    removeAsset: removeMatchingAsset,
    clearAll: clearMatching,
    saveMatches,
    skipTextAssets,
  } = useCreativeMatching(progress?.campaignId);

  // Campaign data for ad accounts and page configs
  const [campaignData, setCampaignData] = useState<{
    adAccounts: AdAccountInfo[];
    pageConfigs: PageConfig[];
    platforms: string[];
  }>({ adAccounts: [], pageConfigs: [], platforms: [] });

  // Load campaign data when ActiPlan is selected
  useEffect(() => {
    if (!progress?.campaignId) return;

    const loadCampaignData = async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('platforms, market_splits, budget_allocation')
        .eq('id', progress.campaignId)
        .single();

      if (error || !data) return;

      const adAccounts: AdAccountInfo[] = [];
      const pageConfigs: PageConfig[] = [];
      const platforms: string[] = [];

      // Extract platforms
      if (Array.isArray(data.platforms)) {
        data.platforms.forEach((p: any) => {
          const platformId = typeof p === 'string' ? p : p.id || p.name;
          if (platformId) platforms.push(platformId);
        });
      }

      // Extract ad accounts and page configs from market_splits
      // Structure: { "meta": [...markets], "tiktok": [...markets] }
      const marketSplits = data.market_splits as Record<string, any>;
      if (marketSplits && typeof marketSplits === 'object') {
        for (const [platformKey, markets] of Object.entries(marketSplits)) {
          if (!Array.isArray(markets)) continue;

          const isMeta = platformKey.toLowerCase().includes('meta') || 
                         platformKey.toLowerCase().includes('facebook') || 
                         platformKey.toLowerCase().includes('instagram');
          const isTikTok = platformKey.toLowerCase().includes('tiktok');

          for (const market of markets as any[]) {
            // Extract ad account ID (works for both Meta and TikTok)
            const adAccountId = market?.adAccountId || market?.tiktokAdvertiserId || market?.advertiser_id;
            
            if (adAccountId) {
              const platform = isTikTok ? 'tiktok' : 'meta';
              const exists = adAccounts.some(a => a.platform === platform && a.accountId === String(adAccountId));
              if (!exists) {
                adAccounts.push({ platform, accountId: String(adAccountId) });
              }
            }

            // Meta page extraction
            if (isMeta) {
              const pageId = market?.page || market?.pageId;
              if (pageId) {
                const exists = pageConfigs.some(p => p.platform === 'meta' && p.pageId === String(pageId));
                if (!exists) {
                  pageConfigs.push({ 
                    platform: 'meta', 
                    pageId: String(pageId), 
                    pageName: market?.pageName || market?.accountName || market?.name,
                  });
                }
              }

              // Also check phases for page IDs
              const phases = Array.isArray(market?.phases) ? market.phases : [];
              for (const phase of phases) {
                const phasePageId = phase?.pageId || phase?.page || phase?.metaPageId;
                if (phasePageId && !pageConfigs.some(p => p.platform === 'meta' && p.pageId === String(phasePageId))) {
                  pageConfigs.push({ 
                    platform: 'meta', 
                    pageId: String(phasePageId), 
                    pageName: phase?.pageName || market?.pageName,
                  });
                }
              }
            }

            // TikTok identity extraction
            if (isTikTok) {
              const identityId = market?.tiktokIdentityId || market?.tiktokIdentity;
              if (identityId) {
                const exists = pageConfigs.some(p => p.platform === 'tiktok' && p.identityId === String(identityId));
                if (!exists) {
                  pageConfigs.push({ 
                    platform: 'tiktok', 
                    identityId: String(identityId),
                    advertiserId: adAccountId ? String(adAccountId) : undefined,
                    pageName: market?.tiktokIdentityName || market?.accountName || market?.name,
                  });
                }
              }

              // Also check phases for TikTok identities
              const phases = Array.isArray(market?.phases) ? market.phases : [];
              for (const phase of phases) {
                const phaseIdentity = phase?.tiktokIdentityId || phase?.tiktokIdentity;
                if (phaseIdentity && !pageConfigs.some(p => p.platform === 'tiktok' && p.identityId === String(phaseIdentity))) {
                  pageConfigs.push({ 
                    platform: 'tiktok', 
                    identityId: String(phaseIdentity),
                    advertiserId: adAccountId ? String(adAccountId) : undefined,
                    pageName: phase?.tiktokIdentityName || market?.accountName,
                  });
                }
              }
            }
          }
        }
      }

      setCampaignData({ adAccounts, pageConfigs, platforms });
    };

    loadCampaignData();
  }, [progress?.campaignId]);

  // Handle running the mesh
  const handleRunMesh = useCallback(async () => {
    if (!progress?.campaignId) return;

    // Convert selected assets to matching format
    const assetsToMatch = progress.selectedAssets.map(asset => ({
      id: asset.id,
      platform: asset.platform,
      asset_type: asset.assetType,
      thumbnail_url: asset.thumbnailUrl,
      asset_name: asset.name,
      post_id: asset.postId,
      platform_asset_id: asset.platformAssetId,
      // Mark organic posts for special handling
      creative_type: asset.source === 'page_assets' ? 'existing_post' : undefined,
    }));

    // Add assets to matching engine
    addPlatformAssets(assetsToMatch);

    // Load structures and run matching
    const structures = await loadCampaignStructures(progress.campaignId);
    if (structures && structures.length > 0) {
      runMatching(structures);
      goToStep('mesh');
    } else {
      toast.error('No campaign structures found. Make sure the ActiPlan has phases configured.');
    }
  }, [progress, addPlatformAssets, loadCampaignStructures, runMatching, goToStep]);

  // Handle save matches
  const handleSaveMatches = useCallback(async () => {
    await saveMatches();
    // After saving, move to content step
    goToStep('content');
  }, [saveMatches, goToStep]);

  // Handle content step completion
  const handleContentComplete = useCallback(() => {
    if (progress?.campaignId) {
      navigate(`/actiplans/${progress.campaignId}/launch`);
    } else {
      navigate('/actiplans');
    }
  }, [progress?.campaignId, navigate]);

  // Handle close - go back to ActiPlans
  const handleClose = useCallback(() => {
    navigate('/actiplans');
  }, [navigate]);

  // Check if can navigate to a step
  const canNavigateToStep = useCallback((step: MeshStep): boolean => {
    if (!progress) return step === 'actiplan';
    
    switch (step) {
      case 'actiplan':
        return true;
      case 'source':
        return !!progress.campaignId && !!progress.platform;
      case 'mesh':
        return progress.selectedAssets.length > 0 || matchingState.results.length > 0;
      case 'content':
        return matchingState.savedAssignments && matchingState.savedAssignments.length > 0;
      default:
        return false;
    }
  }, [progress, matchingState.results.length, matchingState.savedAssignments]);

  // Handle step navigation
  const handleStepClick = useCallback((step: MeshStep) => {
    if (canNavigateToStep(step)) {
      goToStep(step);
    }
  }, [canNavigateToStep, goToStep]);

  if (isLoadingProgress) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <FeatureGate feature="creative_matching">
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
          <div className="flex items-center gap-3">
            <Wand2 className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Creative Mesh</h1>
            {progress?.campaignName && (
              <Badge variant="secondary">{progress.campaignName}</Badge>
            )}
            {progress?.platform && (
              <Badge variant="outline" className="capitalize">{progress.platform}</Badge>
            )}
          </div>
          <Button variant="ghost" onClick={handleClose}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>

        {/* Step Indicator */}
        <MeshStepIndicator 
          currentStep={currentStep}
          onStepClick={handleStepClick}
          canNavigate={canNavigateToStep}
        />

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {/* Step 1: ActiPlan & Platform Selection */}
          {currentStep === 'actiplan' && (
            <MeshActiPlanStep
              initialCampaignId={initialCampaignId}
              onSelect={(id, name, platforms) => {
                selectActiPlan(id, name, platforms);
              }}
              onPlatformSelect={(platform) => {
                selectPlatform(platform);
                goToStep('source');
              }}
              selectedCampaignId={progress?.campaignId}
              selectedPlatform={progress?.platform}
            />
          )}

          {/* Step 2: Creative Source Selection */}
          {currentStep === 'source' && progress && (
            <MeshSourceStep
              platform={progress.platform}
              campaignId={progress.campaignId}
              adAccounts={campaignData.adAccounts}
              pageConfigs={campaignData.pageConfigs}
              selectedAssets={progress.selectedAssets}
              onAddAsset={addAsset}
              onRemoveAsset={removeAsset}
              onClearAssets={clearAssets}
              onRunMesh={handleRunMesh}
              isProcessing={matchingState.isProcessing}
            />
          )}

          {/* Step 3: Auto-Mesh Review */}
          {currentStep === 'mesh' && (
            <div className="container mx-auto py-6 px-4 max-w-5xl">
              {/* Stats */}
              <div className="flex gap-4 text-sm border-b pb-3 mb-4">
                <div>
                  <span className="text-muted-foreground">Creatives:</span>{' '}
                  <span className="font-medium">{stats.totalAssets}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Matched:</span>{' '}
                  <span className="font-medium text-primary">{stats.matchedCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Accepted:</span>{' '}
                  <span className="font-medium text-primary">{stats.acceptedCount}</span>
                </div>
              </div>

              {/* Structure-centric view */}
              <StructureCentricView
                structureResults={matchingState.structureResults}
                unassignedAssets={matchingState.unassignedAssets}
                acceptedMatches={matchingState.acceptedMatches}
                saveProgress={matchingState.saveProgress}
                onAcceptAsset={(assetId, structure) => {
                  const structureResult = matchingState.structureResults.find(
                    r => r.structure.id === structure.id
                  );
                  const assignedAsset = structureResult?.assignedAssets.find(
                    a => a.asset.id === assetId
                  );

                  if (assignedAsset) {
                    const match: UICreativeMatch = {
                      structure,
                      confidenceScore: assignedAsset.confidenceScore,
                      reasoning: assignedAsset.reasoning,
                      compatibilityIssues: assignedAsset.issues,
                      hardConstraintsMet: true,
                    };
                    acceptMatch(assetId, match);
                  } else {
                    const match: UICreativeMatch = {
                      structure,
                      confidenceScore: 40,
                      reasoning: ['Manually applied by user'],
                      compatibilityIssues: [],
                      hardConstraintsMet: false,
                    };
                    acceptMatch(assetId, match);
                  }
                }}
                onRejectAsset={(assetId, structureId) => rejectMatch(assetId, structureId)}
              />

              {/* Actions */}
              <div className="flex items-center justify-between pt-6 border-t mt-6">
                <Button variant="outline" onClick={() => goToStep('source')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Sources
                </Button>
                <div className="flex gap-2">
                  {stats.acceptedCount > 0 && (
                    <Button onClick={handleSaveMatches} disabled={matchingState.isProcessing}>
                      {matchingState.isProcessing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save & Continue
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Creative Content (formerly Text Assets) */}
          {currentStep === 'content' && progress && (
            <div className="flex-1 overflow-hidden p-6">
              <TextAssetsStep
                campaignId={progress.campaignId}
                campaignName={progress.campaignName}
                savedAssignments={matchingState.savedAssignments}
                onComplete={handleContentComplete}
              />
            </div>
          )}
        </div>
      </div>
    </FeatureGate>
  );
}
