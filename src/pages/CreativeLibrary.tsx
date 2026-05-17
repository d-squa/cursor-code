// Creative Library Page - Main hub for creative management
import { useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderUp, FileSpreadsheet, LayoutGrid, Download, Wand2, Type, Layers, Loader2, LogOut, Settings, Bug, Lock, Cloud, Upload, FileImage, X } from 'lucide-react';
import { useCreatives } from '@/hooks/useCreatives';
import { CreativeGrid } from '@/components/creative/CreativeGrid';
import { FolderUpload } from '@/components/creative/FolderUpload';
import { SpreadsheetUpload } from '@/components/creative/SpreadsheetUpload';
import { CreativeEditor } from '@/components/creative/CreativeEditor';
import { TextAssetsTab } from '@/components/creative/TextAssetsTab';
import { AssignedCreativesView } from '@/components/creative/AssignedCreativesView';
import type { Creative, CreativeFilters, Platform } from '@/types/creative';
import { toast } from 'sonner';
import { generateSampleTaxonomyStructure } from '@/utils/creativeValidation';
import { supabase } from '@/integrations/supabase/client';
import { useSampleMode } from '@/contexts/SampleModeContext';
import { useAuth } from '@/hooks/useAuth';
import { BugReportDialog } from '@/components/BugReportDialog';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { FeatureGate } from '@/components/FeatureGate';
import { PlatformAssetUploader } from '@/components/creative/PlatformAssetUploader';
import { UnifiedAssetsLibrary } from '@/components/creative/UnifiedAssetsLibrary';
import { UnifiedPageAssetsLibrary } from '@/components/creative/UnifiedPageAssetsLibrary';

interface Campaign {
  id: string;
  name: string;
  status: string;
}

export default function CreativeLibrary() {
  const { user, signOut } = useAuth();
  const { isSampleMode } = useSampleMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = searchParams.get('tab') || 'library';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [filters, setFilters] = useState<CreativeFilters>({});
  const [editingCreative, setEditingCreative] = useState<Creative | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [bugDialogOpen, setBugDialogOpen] = useState(false);

  const shouldFetchCreatives = activeTab === 'library' || activeTab === 'folder' || activeTab === 'spreadsheet';
  const shouldFetchCampaigns = activeTab === 'assignments' || activeTab === 'text-assets' || activeTab === 'folder' || activeTab === 'platform-assets' || activeTab === 'page-assets';

  // Campaign selection shared for Assignments + Text Assets + Folder Upload
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  // Nonce to trigger TextAssetsTab refresh when assignments change
  const [textAssetsRefreshNonce, setTextAssetsRefreshNonce] = useState(0);
  
  // Folder upload specific state - separate from other tabs
  const [folderUploadCampaignId, setFolderUploadCampaignId] = useState('');
  const [folderUploadTiktokIdentityId, setFolderUploadTiktokIdentityId] = useState<string | undefined>();
  const [folderUploadAdAccounts, setFolderUploadAdAccounts] = useState<Array<{ platform: 'meta' | 'tiktok'; accountId: string }>>([]);
  
  // Platform assets tab state - now extracted from ActiPlan (persist via URL)
  const urlPlatformAssetsCampaignId = searchParams.get('platformAssetsCampaignId') || '';
  const [platformAssetsCampaignId, setPlatformAssetsCampaignIdInternal] = useState(urlPlatformAssetsCampaignId);
  const [platformAssetsAdAccounts, setPlatformAssetsAdAccounts] = useState<Array<{ platform: 'meta' | 'tiktok'; accountId: string }>>([]);
  const [showPlatformUploader, setShowPlatformUploader] = useState(false);
  const [platformUploaderPlatform, setPlatformUploaderPlatform] = useState<'tiktok' | 'meta'>('tiktok');
  
  // Page assets tab state - extracted from ActiPlan (persist via URL)
  const urlPageAssetsCampaignId = searchParams.get('pageAssetsCampaignId') || '';
  const [pageAssetsCampaignId, setPageAssetsCampaignIdInternal] = useState(urlPageAssetsCampaignId);
  const [pageAssetsConfigs, setPageAssetsConfigs] = useState<Array<{ 
    platform: 'meta' | 'tiktok';
    pageId?: string; 
    identityId?: string; 
    advertiserId?: string;
    pageName?: string;
  }>>([]);
  
  // Wrapper to persist platformAssetsCampaignId to URL
  const setPlatformAssetsCampaignId = useCallback((id: string) => {
    setPlatformAssetsCampaignIdInternal(id);
    const newParams = new URLSearchParams(searchParams);
    if (id) {
      newParams.set('platformAssetsCampaignId', id);
    } else {
      newParams.delete('platformAssetsCampaignId');
    }
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);
  
  // Wrapper to persist pageAssetsCampaignId to URL
  const setPageAssetsCampaignId = useCallback((id: string) => {
    setPageAssetsCampaignIdInternal(id);
    const newParams = new URLSearchParams(searchParams);
    if (id) {
      newParams.set('pageAssetsCampaignId', id);
    } else {
      newParams.delete('pageAssetsCampaignId');
    }
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  // Load campaigns only when needed (no auto-select)
  useEffect(() => {
    const loadCampaigns = async () => {
      if (!user?.id) return;
      if (!shouldFetchCampaigns) return;

      setIsLoadingCampaigns(true);
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('id, name, status')
          .eq('user_id', user.id)
          .eq('is_sample', isSampleMode)
          .order('updated_at', { ascending: false });

        if (error) throw error;
        setCampaigns(data || []);
      } catch (error) {
        console.error('Error loading campaigns:', error);
      } finally {
        setIsLoadingCampaigns(false);
      }
    };

    loadCampaigns();
  }, [user?.id, shouldFetchCampaigns, isSampleMode]);
  
  // Re-hydrate platform assets selection from URL on mount or when campaigns load
  useEffect(() => {
    if (urlPlatformAssetsCampaignId && campaigns.length > 0 && platformAssetsAdAccounts.length === 0) {
      // Need to re-fetch the campaign data to populate ad accounts
      handlePlatformAssetsCampaignSelect(urlPlatformAssetsCampaignId);
    }
  }, [urlPlatformAssetsCampaignId, campaigns.length]);
  
  // Re-hydrate page assets selection from URL on mount or when campaigns load
  useEffect(() => {
    if (urlPageAssetsCampaignId && campaigns.length > 0 && pageAssetsConfigs.length === 0) {
      // Need to re-fetch the campaign data to populate page configs
      handlePageAssetsCampaignSelect(urlPageAssetsCampaignId);
    }
  }, [urlPageAssetsCampaignId, campaigns.length]);

  // Sync tab changes with URL (do NOT carry over campaign selection)
  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value);
      setSelectedCampaignId('');

      const newParams = new URLSearchParams(searchParams);
      newParams.set('tab', value);
      newParams.delete('campaignId');
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // Handle campaign selection for assignments + text assets
  const handleCampaignSelect = useCallback(
    (campaignId: string) => {
      setSelectedCampaignId(campaignId);
      const newParams = new URLSearchParams(searchParams);
      newParams.set('campaignId', campaignId);
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // Handle campaign selection for folder uploads - extract TikTok identity from market_splits
  const handleFolderUploadCampaignSelect = useCallback(
    async (campaignId: string) => {
      setFolderUploadCampaignId(campaignId);
      setFolderUploadTiktokIdentityId(undefined);
      setFolderUploadAdAccounts([]);

      if (!campaignId) return;

      try {
        // Fetch campaign market_splits to get TikTok identity + ad accounts
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .select('market_splits')
          .eq('id', campaignId)
          .maybeSingle();

        if (error || !campaign) {
          console.error('Error loading campaign for folder upload:', error);
          return;
        }

        const marketSplits = ((campaign as any).market_splits || {}) as Record<string, any>;
        const adAccountsList: Array<{ platform: 'meta' | 'tiktok'; accountId: string }> = [];

        // Extract TikTok identity from the first market/phase that has one
        let tiktokIdentity: string | undefined;

        for (const [platformKey, markets] of Object.entries(marketSplits)) {
          if (!Array.isArray(markets)) continue;

          const isTikTok = platformKey.toLowerCase().includes('tiktok');
          const isMeta = platformKey.toLowerCase().includes('meta');

          for (const market of markets as any[]) {
            const externalAdAccountId =
              market?.adAccountId || market?.tiktokAdvertiserId || market?.advertiser_id;

            if (externalAdAccountId) {
              if (isTikTok) adAccountsList.push({ platform: 'tiktok', accountId: String(externalAdAccountId) });
              if (isMeta) adAccountsList.push({ platform: 'meta', accountId: String(externalAdAccountId) });
            }

            if (isTikTok && !tiktokIdentity) {
              const marketIdentity = market?.tiktokIdentityId || market?.tiktokIdentity;
              if (marketIdentity) tiktokIdentity = String(marketIdentity);

              const phases = Array.isArray(market?.phases) ? market.phases : [];
              for (const phase of phases) {
                const phaseIdentity = phase?.tiktokIdentityId || phase?.tiktokIdentity;
                if (!tiktokIdentity && phaseIdentity) tiktokIdentity = String(phaseIdentity);
              }
            }
          }
        }

        // Deduplicate accounts
        const dedupedAccounts = Array.from(
          new Map(adAccountsList.map((a) => [`${a.platform}:${a.accountId}`, a])).values()
        );

        setFolderUploadTiktokIdentityId(tiktokIdentity);
        setFolderUploadAdAccounts(dedupedAccounts);

        if (tiktokIdentity) {
          toast.success(`TikTok identity loaded from ActiPlan`);
        }
      } catch (err) {
        console.error('Error extracting campaign config for folder upload:', err);
      }
    },
    []
  );
  
  // Handle campaign selection for Platform Assets - extract ad accounts from market_splits
  const handlePlatformAssetsCampaignSelect = useCallback(
    async (campaignId: string) => {
      setPlatformAssetsCampaignId(campaignId);
      setPlatformAssetsAdAccounts([]);

      if (!campaignId) return;

      try {
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .select('market_splits')
          .eq('id', campaignId)
          .maybeSingle();

        if (error || !campaign) {
          console.error('Error loading campaign for platform assets:', error);
          return;
        }

        const marketSplits = ((campaign as any).market_splits || {}) as Record<string, any>;
        const adAccountsList: Array<{ platform: 'meta' | 'tiktok'; accountId: string }> = [];

        for (const [platformKey, markets] of Object.entries(marketSplits)) {
          if (!Array.isArray(markets)) continue;

          const platform = platformKey.toLowerCase().includes('tiktok')
            ? 'tiktok'
            : platformKey.toLowerCase().includes('meta')
              ? 'meta'
              : null;

          if (!platform) continue;

          for (const market of markets as any[]) {
            const externalAdAccountId =
              market?.adAccountId || market?.tiktokAdvertiserId || market?.advertiser_id;

            if (externalAdAccountId) {
              adAccountsList.push({ platform, accountId: String(externalAdAccountId) });
            }
          }
        }

        const deduped = Array.from(
          new Map(adAccountsList.map((a) => [`${a.platform}:${a.accountId}`, a])).values()
        );

        setPlatformAssetsAdAccounts(deduped);

        if (deduped.length > 0) {
          toast.success(`Found ${deduped.length} ad account(s) from ActiPlan`);
        }
      } catch (err) {
        console.error('Error extracting campaign config for platform assets:', err);
      }
    },
    [setPlatformAssetsCampaignId]
  );
  
  // Handle campaign selection for Page Assets - extract ALL page/identity configs from market_splits
  const handlePageAssetsCampaignSelect = useCallback(
    async (campaignId: string) => {
      setPageAssetsCampaignId(campaignId);
      setPageAssetsConfigs([]);

      if (!campaignId) return;

      try {
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .select('market_splits')
          .eq('id', campaignId)
          .maybeSingle();

        if (error || !campaign) {
          console.error('[PageAssets] Error loading campaign for page assets:', error);
          return;
        }

        const marketSplits = ((campaign as any).market_splits || {}) as Record<string, any>;
        console.log('[PageAssets] Loaded market_splits for campaign:', campaignId, JSON.stringify(marketSplits, null, 2));
        const configs: Array<{
          platform: 'meta' | 'tiktok';
          pageId?: string;
          identityId?: string;
          advertiserId?: string;
          pageName?: string;
        }> = [];

        for (const [platformKey, markets] of Object.entries(marketSplits)) {
          if (!Array.isArray(markets)) continue;

          const isMeta = platformKey.toLowerCase().includes('meta');
          const isTikTok = platformKey.toLowerCase().includes('tiktok');

          for (const market of markets as any[]) {
            const phases = Array.isArray(market?.phases) ? market.phases : [];

            if (isMeta) {
              const marketPageId = market?.pageId || market?.page;
              if (marketPageId && !configs.some((c) => c.platform === 'meta' && c.pageId === String(marketPageId))) {
                configs.push({
                  platform: 'meta',
                  pageId: String(marketPageId),
                  pageName: market?.pageName || market?.pageNameFromApi || market?.name,
                });
              }

              for (const phase of phases) {
                const phasePageId = phase?.pageId || phase?.page || phase?.metaPageId;
                if (phasePageId && !configs.some((c) => c.platform === 'meta' && c.pageId === String(phasePageId))) {
                  configs.push({
                    platform: 'meta',
                    pageId: String(phasePageId),
                    pageName: phase?.pageName || market?.pageName || market?.name,
                  });
                }
              }
            }

            if (isTikTok) {
              const advertiserId =
                market?.adAccountId || market?.tiktokAdvertiserId || market?.advertiser_id;

              const marketIdentity = market?.tiktokIdentityId || market?.tiktokIdentity;
              if (marketIdentity && !configs.some((c) => c.platform === 'tiktok' && c.identityId === String(marketIdentity))) {
                configs.push({
                  platform: 'tiktok',
                  identityId: String(marketIdentity),
                  advertiserId: advertiserId ? String(advertiserId) : undefined,
                  pageName: market?.tiktokIdentityName || market?.accountName || market?.name,
                });
              }

              for (const phase of phases) {
                const phaseIdentity = phase?.tiktokIdentityId || phase?.tiktokIdentity;
                if (phaseIdentity && !configs.some((c) => c.platform === 'tiktok' && c.identityId === String(phaseIdentity))) {
                  configs.push({
                    platform: 'tiktok',
                    identityId: String(phaseIdentity),
                    advertiserId: advertiserId ? String(advertiserId) : undefined,
                    pageName: phase?.tiktokIdentityName || market?.accountName || market?.name,
                  });
                }
              }
            }
          }
        }

        console.log('[PageAssets] Extracted configs:', configs);
        setPageAssetsConfigs(configs);

        if (configs.length > 0) {
          toast.success(`Found ${configs.length} page(s)/identity(s) from ActiPlan`);
        } else {
          console.warn('[PageAssets] No page/identity configs found in market_splits');
          toast.warning('No Facebook Pages or TikTok identities found in this ActiPlan');
        }
      } catch (err) {
        console.error('Error extracting campaign config for page assets:', err);
      }
    },
    [setPageAssetsCampaignId]
  );

  const {
    creatives,
    isLoading,
    createCreative,
    updateCreative,
    deleteCreative,
    bulkAction,
    isCreating,
    isUpdating,
  } = useCreatives(filters, { enabled: shouldFetchCreatives });

  // Handle folder upload complete
  const handleFolderUploadComplete = useCallback(
    async (newCreatives: Partial<Creative>[]) => {
      for (const creative of newCreatives) {
        await createCreative(creative as Creative & { name: string; platform: Platform });
      }
    },
    [createCreative]
  );

  // Handle spreadsheet upload complete
  const handleSpreadsheetUploadComplete = useCallback(
    async (newCreatives: Partial<Creative>[]) => {
      for (const creative of newCreatives) {
        await createCreative(creative as Creative & { name: string; platform: Platform });
      }
    },
    [createCreative]
  );

  // Handle edit
  const handleEdit = useCallback((creative: Creative) => {
    setEditingCreative(creative);
    setIsEditorOpen(true);
  }, []);

  // Handle save
  const handleSave = useCallback(
    async (updates: Partial<Creative>) => {
      if (editingCreative) {
        await updateCreative({ id: editingCreative.id, updates });
        setIsEditorOpen(false);
        setEditingCreative(null);
        toast.success('Creative updated');
      }
    },
    [editingCreative, updateCreative]
  );

  // Handle duplicate
  const handleDuplicate = useCallback(
    async (creative: Creative) => {
      await bulkAction({ type: 'duplicate', creativeIds: [creative.id] });
    },
    [bulkAction]
  );

  // Handle delete
  const handleDelete = useCallback(
    async (id: string) => {
      await deleteCreative(id);
    },
    [deleteCreative]
  );

  // Handle bulk actions
  const handleBulkAction = useCallback(
    async (action: string, ids: string[]) => {
      try {
        if (action === 'delete') {
          await bulkAction({ type: 'delete', creativeIds: ids });
        } else if (action === 'duplicate') {
          await bulkAction({ type: 'duplicate', creativeIds: ids });
        }
      } catch (error) {
        console.error('Bulk action failed:', error);
        // Error toast is already shown by bulkAction mutation
      }
    },
    [bulkAction]
  );

  // Download sample folder structure
  const handleDownloadSampleStructure = useCallback(() => {
    const structure = generateSampleTaxonomyStructure();
    const text = `ActiPlan Creative Folder Structure\n${'='.repeat(
      40
    )}\n\nCreate folders following this hierarchy:\nPlatform/Market/Phase/OptimizationGoal/CreativeType/\n\nExamples:\n${structure.join(
      '\n'
    )}\n\nNotes:\n- Platform: Meta, TikTok, Google, LinkedIn, Snapchat, Pinterest, X\n- Market: 2-letter country code (US, UK, DE, FR, etc.)\n- Phase: Awareness, Consideration, Conversion, Retention, Loyalty\n- OptimizationGoal: Platform-specific (REACH, CONVERSIONS, VIDEO_VIEWS, etc.)\n- CreativeType: image, video, carousel, dark_post, existing_post`;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'actiplan_folder_structure.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Sample structure downloaded');
  }, []);

  // Shared selection state for cumulative multi-select across tabs
  const [cumulativeSelection, setCumulativeSelection] = useState<{
    platformAssets: any[];
    pageAssets: any[];
  }>({ platformAssets: [], pageAssets: [] });

  const totalSelected = cumulativeSelection.platformAssets.length + cumulativeSelection.pageAssets.length;

  // Handle selection from Platform Assets - accumulate instead of navigate
  const handlePlatformAssetsSelection = useCallback((assets: any[]) => {
    setCumulativeSelection(prev => ({
      ...prev,
      platformAssets: assets,
    }));
  }, []);

  // Handle selection from Page Assets - accumulate instead of navigate  
  const handlePageAssetsSelection = useCallback((posts: any[]) => {
    setCumulativeSelection(prev => ({
      ...prev,
      pageAssets: posts,
    }));
  }, []);

  // Handle auto-mesh for all selected assets across tabs
  const handleMeshAllSelected = useCallback(() => {
    const campaignId = platformAssetsCampaignId || pageAssetsCampaignId;
    if (!campaignId) {
      toast.error('Please select an ActiPlan first');
      return;
    }
    
    // Combine platform assets and page assets
    // Platform assets have 'id', page assets have 'postId' 
    const platformIds = cumulativeSelection.platformAssets.map(a => `platform:${a.id}`);
    const pageIds = cumulativeSelection.pageAssets.map(p => `page:${p.postId}`);
    const allIds = [...platformIds, ...pageIds].join(',');
    
    toast.success(`${totalSelected} asset(s) selected for meshing`);
    navigate(`/app/creatives?campaignId=${campaignId}&selectedAssets=${allIds}`);
  }, [platformAssetsCampaignId, pageAssetsCampaignId, cumulativeSelection, totalSelected, navigate]);

  // Clear all selections
  const handleClearAllSelections = useCallback(() => {
    setCumulativeSelection({ platformAssets: [], pageAssets: [] });
  }, []);

  const renderActiPlanSelector = (options?: { rightSlot?: ReactNode }) => (
    <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30">
      <div className="flex-1">
        <label className="text-sm font-medium mb-1 block">Select ActiPlan</label>
        {isLoadingCampaigns ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading ActiPlans...
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ActiPlans found. Create one first.</p>
        ) : (
          <Select value={selectedCampaignId || undefined} onValueChange={handleCampaignSelect}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select an ActiPlan to load it" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  <div className="flex items-center gap-2">
                    <span>{campaign.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {campaign.status}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {options?.rightSlot}
    </div>
  );

  return (
    <FeatureGate feature="creative_library">
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="ActiPlan" className="h-10 w-auto" />
              <p className="text-xs text-muted-foreground hidden md:block">Cross-Platform Activation Manager</p>
            </div>
            <nav className="flex items-center gap-2">
              <button
                onClick={() => navigate("/app/overview")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Overview
              </button>
              <button
                onClick={() => navigate("/app/actiplans")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                ActiPlans
              </button>
              <button
                onClick={() => navigate("/app/insights")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Insights
              </button>
              <button
                onClick={() => navigate("/app/creatives")}
                className="px-4 py-2 text-sm font-medium text-primary border-b-2 border-primary transition-colors"
              >
                Creative Mesh
              </button>
              <WorkspaceSwitcher />
              <Button variant="ghost" size="icon" onClick={() => navigate("/app/settings")}>
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setBugDialogOpen(true)}>
                <Bug className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => signOut()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-6 px-4 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Creative Mesh</h1>
            <p className="text-muted-foreground">Weave your creative assets with ActiPlan structure and text layers</p>
          </div>
          <div className="flex items-center gap-2">
            {shouldFetchCreatives && <Badge variant="secondary">{creatives.length} creatives</Badge>}
            <Button variant="default" size="sm" onClick={() => navigate('/app/creatives')}>
              <Wand2 className="h-4 w-4 mr-2" />
              Start Matching
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadSampleStructure}>
              <Download className="h-4 w-4 mr-2" />
              Folder Guide
            </Button>
          </div>
        </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="library" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Library
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2">
            <Layers className="h-4 w-4" />
            Meshed Creatives
          </TabsTrigger>
          <TabsTrigger value="text-assets" className="gap-2">
            <Type className="h-4 w-4" />
            Creative Content
          </TabsTrigger>
          <TabsTrigger value="folder" className="gap-2">
            <FolderUp className="h-4 w-4" />
            Folder Upload
          </TabsTrigger>
          <TabsTrigger value="spreadsheet" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Spreadsheet
          </TabsTrigger>
          <TabsTrigger value="platform-assets" className="gap-2">
            <Cloud className="h-4 w-4" />
            Platform Assets
          </TabsTrigger>
          <TabsTrigger value="page-assets" className="gap-2">
            <FileImage className="h-4 w-4" />
            Page Assets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-6">
          <CreativeGrid
            creatives={creatives}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onBulkAction={handleBulkAction}
            filters={filters}
            onFiltersChange={setFilters}
            emptyMessage="No creatives yet. Upload via folder or spreadsheet."
          />
        </TabsContent>

        <TabsContent value="assignments" className="mt-6">
          <div className="space-y-4">
            {renderActiPlanSelector({
              rightSlot: selectedCampaignId ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate(`/app/creatives?campaignId=${selectedCampaignId}`)}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  Add More Creatives
                </Button>
              ) : null,
            })}

            {selectedCampaignId ? (
              <AssignedCreativesView 
                campaignId={selectedCampaignId}
                onAssignmentsDeleted={() => setTextAssetsRefreshNonce(n => n + 1)}
                onAssignmentsDuplicated={() => setTextAssetsRefreshNonce(n => n + 1)}
              />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="text-assets" className="mt-6">
          <div className="space-y-4">
            {renderActiPlanSelector({
              rightSlot: selectedCampaignId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/app/creatives?campaignId=${selectedCampaignId}`)}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  Open Mesh
                </Button>
              ) : null,
            })}

            {selectedCampaignId ? (
              <TextAssetsTab
                campaignId={selectedCampaignId}
                campaignName={selectedCampaign?.name}
                hideCampaignSelector
                refreshNonce={textAssetsRefreshNonce}
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                Select an ActiPlan to manage creative content, text assets, and video thumbnails.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="folder" className="mt-6">
          <div className="space-y-4">
            {/* ActiPlan selector for folder uploads */}
            <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">Select ActiPlan (Optional)</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select an ActiPlan to auto-populate TikTok identity and link creatives to the campaign.
                </p>
                {isLoadingCampaigns ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading ActiPlans...
                  </div>
                ) : (
                  <Select value={folderUploadCampaignId || undefined} onValueChange={handleFolderUploadCampaignSelect}>
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder="Select an ActiPlan (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          <div className="flex items-center gap-2">
                            <span>{campaign.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {campaign.status}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {folderUploadTiktokIdentityId && (
                <Badge variant="secondary" className="shrink-0">
                  TikTok Identity: {folderUploadTiktokIdentityId.slice(0, 8)}...
                </Badge>
              )}
            </div>
            
            <FolderUpload 
              onUploadComplete={handleFolderUploadComplete} 
              adAccounts={folderUploadAdAccounts} 
              isUploading={isCreating}
              campaignId={folderUploadCampaignId || undefined}
              tiktokIdentityId={folderUploadTiktokIdentityId}
            />
          </div>
        </TabsContent>

        <TabsContent value="spreadsheet" className="mt-6">
          <SpreadsheetUpload onUploadComplete={handleSpreadsheetUploadComplete} isUploading={isCreating} />
        </TabsContent>

        <TabsContent value="platform-assets" className="mt-6">
          <div className="space-y-6">
            {/* ActiPlan Selection */}
            <div className="flex flex-wrap items-center gap-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex-1 min-w-[250px]">
                <label className="text-sm font-medium mb-1 block">Select ActiPlan</label>
                {isLoadingCampaigns ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading ActiPlans...
                  </div>
                ) : campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No ActiPlans found. Create one first.</p>
                ) : (
                  <Select value={platformAssetsCampaignId || undefined} onValueChange={handlePlatformAssetsCampaignSelect}>
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder="Select an ActiPlan to load ad accounts" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          <div className="flex items-center gap-2">
                            <span>{campaign.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {campaign.status}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              
              {platformAssetsAdAccounts.length > 0 && (
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Upload to</label>
                    <Select 
                      value={platformUploaderPlatform} 
                      onValueChange={(v) => setPlatformUploaderPlatform(v as 'tiktok' | 'meta')}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {platformAssetsAdAccounts.some(a => a.platform === 'tiktok') && (
                          <SelectItem value="tiktok">TikTok</SelectItem>
                        )}
                        {platformAssetsAdAccounts.some(a => a.platform === 'meta') && (
                          <SelectItem value="meta">Meta</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPlatformUploader(!showPlatformUploader)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {showPlatformUploader ? 'Hide' : 'Upload'}
                  </Button>
                </div>
              )}
            </div>
            
            {/* Uploader (collapsible) */}
            {showPlatformUploader && platformAssetsAdAccounts.filter(a => a.platform === platformUploaderPlatform).length > 0 && (
              <div className="border rounded-lg p-4 bg-card">
                <h3 className="text-sm font-medium mb-4">Upload to {platformUploaderPlatform === 'tiktok' ? 'TikTok' : 'Meta'} Creative Library</h3>
                <PlatformAssetUploader
                  platform={platformUploaderPlatform}
                  advertiserId={platformAssetsAdAccounts.find(a => a.platform === platformUploaderPlatform)?.accountId || ''}
                  onUploadComplete={() => {
                    toast.success('Assets uploaded and synced');
                    setShowPlatformUploader(false);
                  }}
                />
              </div>
            )}
            
            {/* Unified Asset Library - shows ALL assets from ALL accounts */}
            {!platformAssetsCampaignId ? (
              <div className="text-sm text-muted-foreground">
                Select an ActiPlan above to load its connected ad accounts.
              </div>
            ) : platformAssetsAdAccounts.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                This ActiPlan doesn’t have any ad accounts configured yet. Open the ActiPlan and assign an ad account to at least one market.
              </div>
            ) : (
              <UnifiedAssetsLibrary 
                adAccounts={platformAssetsAdAccounts} 
                multiSelect={true}
                onSelectionChange={handlePlatformAssetsSelection}
                externalSelection={cumulativeSelection.platformAssets}
              />
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="page-assets" className="mt-6">
          <div className="space-y-6">
            {/* ActiPlan Selection */}
            <div className="flex flex-wrap items-center gap-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex-1 min-w-[250px]">
                <label className="text-sm font-medium mb-1 block">Select ActiPlan</label>
                {isLoadingCampaigns ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading ActiPlans...
                  </div>
                ) : campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No ActiPlans found. Create one first.</p>
                ) : (
                  <Select value={pageAssetsCampaignId || undefined} onValueChange={handlePageAssetsCampaignSelect}>
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder="Select an ActiPlan to load pages/identities" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          <div className="flex items-center gap-2">
                            <span>{campaign.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {campaign.status}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            
            {/* Unified Page Assets Library - shows ALL posts from ALL pages/identities */}
            {!pageAssetsCampaignId ? (
              <div className="text-sm text-muted-foreground">
                Select an ActiPlan above to load its connected pages/identities.
              </div>
            ) : pageAssetsConfigs.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                This ActiPlan doesn’t have any pages (Meta) or identities (TikTok) configured yet. Open the ActiPlan and set a Page/Identity on at least one market.
              </div>
            ) : (
              <UnifiedPageAssetsLibrary 
                pageConfigs={pageAssetsConfigs}
                multiSelect={true}
                onSelectionChange={handlePageAssetsSelection}
                externalSelection={cumulativeSelection.pageAssets}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
      
        {/* Floating cumulative selection bar */}
        {totalSelected > 0 && (activeTab === 'platform-assets' || activeTab === 'page-assets') && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="flex items-center gap-3 px-6 py-3 bg-card border rounded-full shadow-lg">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm">
                  {totalSelected} selected
                </Badge>
                {cumulativeSelection.platformAssets.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {cumulativeSelection.platformAssets.length} platform
                  </Badge>
                )}
                {cumulativeSelection.pageAssets.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {cumulativeSelection.pageAssets.length} page
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearAllSelections}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
              <Button size="sm" onClick={handleMeshAllSelected}>
                <Wand2 className="h-4 w-4 mr-2" />
                Match All
              </Button>
            </div>
          </div>
        )}

        {/* Editor Dialog */}
        <CreativeEditor
          creative={editingCreative}
          open={isEditorOpen}
          onOpenChange={setIsEditorOpen}
          onSave={handleSave}
          isSaving={isUpdating}
        />
      </div>

      <BugReportDialog open={bugDialogOpen} onOpenChange={setBugDialogOpen} />
    </div>
    </FeatureGate>
  );
}