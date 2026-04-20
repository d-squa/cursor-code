// Creative Mesh Page - Step-based workflow for matching creatives to campaign structures
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wand2, X, ArrowLeft, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCreativeMatching, UICreativeMatch } from '@/hooks/useCreativeMatching';
import { useCreativeMeshProgress, MeshStep, SelectedAsset } from '@/hooks/useCreativeMeshProgress';
import { MeshStepIndicator } from '@/components/creative/MeshStepIndicator';
import { MeshActiPlanStep } from '@/components/creative/MeshActiPlanStep';
import { MeshSourceStep } from '@/components/creative/MeshSourceStep';
import { StructureCentricView } from '@/components/creative/StructureCentricView';
import { TextAssetsStep } from '@/components/creative/TextAssetsStep';
import { FeatureGate } from '@/components/FeatureGate';

interface AdAccountInfo {
  platform: 'meta' | 'tiktok' | 'google';
  accountId: string;
}

interface PageConfig {
  platform: 'meta' | 'tiktok' | 'google';
  pageId?: string;
  identityId?: string;
  advertiserId?: string;
  pageName?: string;
}

export default function CreativeMatching() {
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
    loadExistingAssignments,
  } = useCreativeMatching(progress?.campaignId, progress?.platform);

  // Load existing assignments when campaign is loaded (for duplicated ActiPlans)
  useEffect(() => {
    if (progress?.campaignId && !matchingState.savedAssignments?.length) {
      loadExistingAssignments(progress.campaignId);
    }
  }, [progress?.campaignId, loadExistingAssignments, matchingState.savedAssignments?.length]);

  // When entering the mesh step, always reload fresh structures from DB
  // This ensures ad set splits and other structural changes are reflected
  useEffect(() => {
    if (currentStep === 'mesh' && progress?.campaignId && matchingState.assets.length > 0) {
      const refreshStructures = async () => {
        const freshStructures = await loadCampaignStructures(progress.campaignId);
        if (freshStructures && freshStructures.length > 0) {
          runMatching(freshStructures);
        }
      };
      refreshStructures();
    }
    // Only trigger when entering the mesh step, not on every state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, progress?.campaignId]);

  // Campaign data for ad accounts and page configs
  const [campaignData, setCampaignData] = useState<{
    adAccounts: AdAccountInfo[];
    pageConfigs: PageConfig[];
    platforms: string[];
    googleCampaignTypes: string[];
  }>({ adAccounts: [], pageConfigs: [], platforms: [], googleCampaignTypes: [] });

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
      const googleCampaignTypes: string[] = [];

      if (marketSplits && typeof marketSplits === 'object') {
        for (const [platformKey, markets] of Object.entries(marketSplits)) {
          if (!Array.isArray(markets)) continue;

          const isMeta = platformKey.toLowerCase().includes('meta') || 
                         platformKey.toLowerCase().includes('facebook') || 
                         platformKey.toLowerCase().includes('instagram');
          const isTikTok = platformKey.toLowerCase().includes('tiktok');
          const isGoogle = platformKey.toLowerCase().includes('google');

          for (const market of markets as any[]) {
            // Extract ad account ID (works for Meta, TikTok, and Google)
            const adAccountId = market?.adAccountId || market?.tiktokAdvertiserId || market?.advertiser_id || market?.googleCustomerId;
            
            if (adAccountId) {
              const platform = isTikTok ? 'tiktok' : isGoogle ? 'google' : 'meta';
              const normalizedId = String(adAccountId).replace(/^act_/, '');
              const exists = adAccounts.some(a => a.platform === platform && a.accountId === normalizedId);
              if (!exists) {
                adAccounts.push({ platform, accountId: normalizedId });
              }
            }

            // Extract Google campaign types from phases
            if (isGoogle) {
              const phases = Array.isArray(market?.phases) ? market.phases : [];
              for (const phase of phases) {
                const gct = phase?.googleCampaignType;
                if (gct && !googleCampaignTypes.includes(gct)) {
                  googleCampaignTypes.push(gct);
                }
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
                    pageName: market?.pageName || undefined,
                  });
                }
              }

              const phases = Array.isArray(market?.phases) ? market.phases : [];
              for (const phase of phases) {
                const phasePageId = phase?.pageId || phase?.page || phase?.metaPageId;
                if (phasePageId && !pageConfigs.some(p => p.platform === 'meta' && p.pageId === String(phasePageId))) {
                  pageConfigs.push({ 
                    platform: 'meta', 
                    pageId: String(phasePageId), 
                    pageName: phase?.pageName || market?.pageName || undefined,
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
                    pageName: market?.tiktokIdentityName || undefined,
                  });
                }
              }

              const phases = Array.isArray(market?.phases) ? market.phases : [];
              for (const phase of phases) {
                const phaseIdentity = phase?.tiktokIdentityId || phase?.tiktokIdentity;
                if (phaseIdentity && !pageConfigs.some(p => p.platform === 'tiktok' && p.identityId === String(phaseIdentity))) {
                  pageConfigs.push({ 
                    platform: 'tiktok', 
                    identityId: String(phaseIdentity),
                    advertiserId: adAccountId ? String(adAccountId) : undefined,
                    pageName: phase?.tiktokIdentityName || market?.tiktokIdentityName || undefined,
                  });
                }
              }
            }
          }
        }
      }

      setCampaignData({ adAccounts, pageConfigs, platforms, googleCampaignTypes });
    };

    loadCampaignData();
  }, [progress?.campaignId]);

  // Handle running the mesh
  const handleRunMesh = useCallback(async () => {
    if (!progress?.campaignId) return;

    // Separate uploads (need processFiles) from platform assets (use addPlatformAssets)
    const uploads: File[] = [];
    const platformAssets: any[] = [];

    for (const asset of progress.selectedAssets) {
      const anyAsset = asset as any;
      const source = String(anyAsset.source ?? '');
      const postId = asset.postId ?? anyAsset.post_id ?? anyAsset.external_post_id ?? anyAsset.postID;
      const pageId = anyAsset.pageId ?? anyAsset.page_id ?? anyAsset.external_page_id;
      const pageName = anyAsset.pageName ?? anyAsset.page_name ?? anyAsset.external_account_name;
      const message = anyAsset.message ?? anyAsset.caption ?? anyAsset.organicMessage;
      const permalink = anyAsset.permalink ?? anyAsset.url;
      const isOrganic =
        source === 'page_assets' ||
        source === 'page' ||
        source === 'organic' ||
        Boolean(postId);

      // Handle uploads separately - they need the File object for processFiles
      if (source === 'upload' && anyAsset.file instanceof File) {
        uploads.push(anyAsset.file);
      } else {
        // Platform assets and organic posts
        platformAssets.push({
          id: asset.id,
          platform: asset.platform,
          asset_type: asset.assetType,
          thumbnail_url: asset.thumbnailUrl,
          asset_name: asset.name,
          mediaType: anyAsset.mediaType,
          platform_asset_id: asset.platformAssetId,
          postId,
          pageId,
          pageName,
          message,
          permalink,
          creative_type: isOrganic ? 'existing_post' : undefined,
          // Pass source network for matching algorithm (FB vs IG organic posts)
          sourceNetwork: anyAsset.sourceNetwork,
          // Pass dimensions for format validation
          width: typeof anyAsset.width === 'number' ? anyAsset.width : undefined,
          height: typeof anyAsset.height === 'number' ? anyAsset.height : undefined,
        });
      }
    }

    // Process uploads first (if any)
    if (uploads.length > 0) {
      await processFiles(uploads);
    }

    // Add platform assets
    if (platformAssets.length > 0) {
      addPlatformAssets(platformAssets);
    }

    // Load structures and run matching
    const structures = await loadCampaignStructures(progress.campaignId);
    if (structures && structures.length > 0) {
      runMatching(structures);
      goToStep('mesh');
    } else {
      toast.error('No campaign structures found. Make sure the ActiPlan has phases configured.');
    }
  }, [progress, processFiles, addPlatformAssets, loadCampaignStructures, runMatching, goToStep]);

  // Handle save matches — advance directly to text assets
  const handleSaveMatches = useCallback(async () => {
    const ok = await saveMatches();
    if (ok) {
      goToStep('content');
    }
  }, [goToStep, saveMatches]);

  // Handle content step completion
  const handleContentComplete = useCallback(() => {
    if (progress?.campaignId) {
      navigate(`/app/actiplans/${progress.campaignId}/launch`);
    } else {
      navigate('/app/actiplans');
    }
  }, [progress?.campaignId, navigate]);

  // Handle "Saved & Select More Creatives" - go back to step 2 (source) to add more assets
  const handleSaveAndSelectMore = useCallback(() => {
    // Clear matching UI state but keep already-selected assets so the user can add more on top
    clearMatching();
    goToStep('source');
  }, [clearMatching, goToStep]);

  // Handle close - go back to ActiPlans
  const handleClose = useCallback(() => {
    navigate('/app/actiplans');
  }, [navigate]);

  // Check if can navigate to a step
  const canNavigateToStep = useCallback((step: MeshStep): boolean => {
    if (!progress) return step === 'actiplan';
    
    const hasExistingAssignments = matchingState.savedAssignments && matchingState.savedAssignments.length > 0;
    
    switch (step) {
      case 'actiplan':
        return true;
      case 'source':
        return !!progress.campaignId && !!progress.platform;
      case 'mesh':
        // Allow access if: selecting new assets, have matching results, OR have existing assignments
        return progress.selectedAssets.length > 0 || matchingState.results.length > 0 || hasExistingAssignments;
      case 'content':
        return hasExistingAssignments;
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
              onJumpToContent={(id, name, platform) => {
                selectActiPlan(id, name, [platform]);
                selectPlatform(platform);
                // Load existing assignments then jump to content
                loadExistingAssignments(id).then(() => {
                  goToStep('content');
                });
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
              googleCampaignTypes={campaignData.googleCampaignTypes}
            />
          )}

          {/* Step 3: Match Creatives Review */}
          {currentStep === 'mesh' && (
            <div className="h-full overflow-auto">
              <div className="w-full min-w-[1200px] py-6 px-6">
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
            </div>
          )}

          {/* Step 4: Creative Content (formerly Text Assets) */}
          {currentStep === 'content' && progress && (
            <div className="flex-1 overflow-hidden p-6">
              <TextAssetsStep
                campaignId={progress.campaignId}
                campaignName={progress.campaignName}
                savedAssignments={matchingState.savedAssignments}
                campaignStructures={matchingState.structures}
                onComplete={handleContentComplete}
                onSaveAndSelectMore={handleSaveAndSelectMore}
              />
            </div>
          )}
        </div>
      </div>
    </FeatureGate>
  );
}
