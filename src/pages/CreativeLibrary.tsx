// Creative Library Page - Main hub for creative management
import { useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderUp, FileSpreadsheet, LayoutGrid, Download, Wand2, Type, Layers, Loader2, LogOut, Settings, Bug, Lock, Cloud, Upload, FileImage } from 'lucide-react';
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
  
  // Platform assets tab state - now extracted from ActiPlan
  const [platformAssetsCampaignId, setPlatformAssetsCampaignId] = useState('');
  const [platformAssetsAdAccounts, setPlatformAssetsAdAccounts] = useState<Array<{ platform: 'meta' | 'tiktok'; accountId: string }>>([]);
  const [showPlatformUploader, setShowPlatformUploader] = useState(false);
  const [platformUploaderPlatform, setPlatformUploaderPlatform] = useState<'tiktok' | 'meta'>('tiktok');
  
  // Page assets tab state - extracted from ActiPlan (supports multiple pages/identities)
  const [pageAssetsCampaignId, setPageAssetsCampaignId] = useState('');
  const [pageAssetsConfigs, setPageAssetsConfigs] = useState<Array<{ 
    platform: 'meta' | 'tiktok';
    pageId?: string; 
    identityId?: string; 
    advertiserId?: string;
    pageName?: string;
  }>>([]);

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
  }, [user?.id, shouldFetchCampaigns]);

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

  // Handle campaign selection for folder uploads - extract TikTok identity from budget_allocation
  const handleFolderUploadCampaignSelect = useCallback(
    async (campaignId: string) => {
      setFolderUploadCampaignId(campaignId);
      setFolderUploadTiktokIdentityId(undefined);
      setFolderUploadAdAccounts([]);
      
      if (!campaignId) return;
      
      try {
        // Fetch campaign budget_allocation to get TikTok identity
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .select('budget_allocation, platforms')
          .eq('id', campaignId)
          .single();
        
        if (error || !campaign) {
          console.error('Error loading campaign for folder upload:', error);
          return;
        }
        
        const budgetAllocation = campaign.budget_allocation as Record<string, any> || {};
        const adAccountsList: Array<{ platform: 'meta' | 'tiktok'; accountId: string }> = [];
        
        // Extract TikTok identity from the first market/phase that has one
        let tiktokIdentity: string | undefined;
        
        for (const [platformKey, platformConfig] of Object.entries(budgetAllocation)) {
          if (!platformConfig || typeof platformConfig !== 'object') continue;
          
          const markets = (platformConfig as any).markets || [];
          for (const market of markets) {
            // Check for ad account
            if (market.adAccountId) {
              if (platformKey.toLowerCase().includes('tiktok')) {
                adAccountsList.push({ platform: 'tiktok', accountId: market.adAccountId });
              } else if (platformKey.toLowerCase().includes('meta')) {
                adAccountsList.push({ platform: 'meta', accountId: market.adAccountId });
              }
            }
            
            // Look for TikTok identity in market or phases
            if (platformKey.toLowerCase().includes('tiktok')) {
              if (market.tiktokIdentityId && !tiktokIdentity) {
                tiktokIdentity = market.tiktokIdentityId;
              }
              
              const phases = market.phases || [];
              for (const phase of phases) {
                if (phase.tiktokIdentityId && !tiktokIdentity) {
                  tiktokIdentity = phase.tiktokIdentityId;
                }
              }
            }
          }
        }
        
        setFolderUploadTiktokIdentityId(tiktokIdentity);
        setFolderUploadAdAccounts(adAccountsList);
        
        if (tiktokIdentity) {
          toast.success(`TikTok identity loaded from ActiPlan`);
        }
      } catch (err) {
        console.error('Error extracting campaign config for folder upload:', err);
      }
    },
    []
  );
  
  // Handle campaign selection for Platform Assets - extract ad accounts
  const handlePlatformAssetsCampaignSelect = useCallback(
    async (campaignId: string) => {
      setPlatformAssetsCampaignId(campaignId);
      setPlatformAssetsAdAccounts([]);
      
      if (!campaignId) return;
      
      try {
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .select('budget_allocation, platforms')
          .eq('id', campaignId)
          .single();
        
        if (error || !campaign) {
          console.error('Error loading campaign for platform assets:', error);
          return;
        }
        
        const budgetAllocation = campaign.budget_allocation as Record<string, any> || {};
        const adAccountsList: Array<{ platform: 'meta' | 'tiktok'; accountId: string }> = [];
        
        for (const [platformKey, platformConfig] of Object.entries(budgetAllocation)) {
          if (!platformConfig || typeof platformConfig !== 'object') continue;
          
          const markets = (platformConfig as any).markets || [];
          for (const market of markets) {
            if (market.adAccountId) {
              const platform = platformKey.toLowerCase().includes('tiktok') ? 'tiktok' : 
                              platformKey.toLowerCase().includes('meta') ? 'meta' : null;
              if (platform && !adAccountsList.some(a => a.accountId === market.adAccountId && a.platform === platform)) {
                adAccountsList.push({ platform, accountId: market.adAccountId });
              }
            }
          }
        }
        
        setPlatformAssetsAdAccounts(adAccountsList);
        
        if (adAccountsList.length > 0) {
          toast.success(`Found ${adAccountsList.length} ad account(s) from ActiPlan`);
        }
      } catch (err) {
        console.error('Error extracting campaign config for platform assets:', err);
      }
    },
    []
  );
  
  // Handle campaign selection for Page Assets - extract ALL page/identity configs
  const handlePageAssetsCampaignSelect = useCallback(
    async (campaignId: string) => {
      setPageAssetsCampaignId(campaignId);
      setPageAssetsConfigs([]);
      
      if (!campaignId) return;
      
      try {
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .select('budget_allocation, platforms')
          .eq('id', campaignId)
          .single();
        
        if (error || !campaign) {
          console.error('Error loading campaign for page assets:', error);
          return;
        }
        
        const budgetAllocation = campaign.budget_allocation as Record<string, any> || {};
        const configs: Array<{ 
          platform: 'meta' | 'tiktok';
          pageId?: string; 
          identityId?: string; 
          advertiserId?: string;
          pageName?: string;
        }> = [];
        
        for (const [platformKey, platformConfig] of Object.entries(budgetAllocation)) {
          if (!platformConfig || typeof platformConfig !== 'object') continue;
          
          const markets = (platformConfig as any).markets || [];
          for (const market of markets) {
            // Extract Meta page IDs
            if (platformKey.toLowerCase().includes('meta')) {
              if (market.pageId && !configs.some(c => c.platform === 'meta' && c.pageId === market.pageId)) {
                configs.push({ platform: 'meta', pageId: market.pageId, pageName: market.pageName });
              }
              const phases = market.phases || [];
              for (const phase of phases) {
                if (phase.pageId && !configs.some(c => c.platform === 'meta' && c.pageId === phase.pageId)) {
                  configs.push({ platform: 'meta', pageId: phase.pageId, pageName: phase.pageName });
                }
              }
            }
            
            // Extract TikTok identity IDs
            if (platformKey.toLowerCase().includes('tiktok')) {
              const advertiserId = market.adAccountId;
              if (market.tiktokIdentityId && !configs.some(c => c.platform === 'tiktok' && c.identityId === market.tiktokIdentityId)) {
                configs.push({ 
                  platform: 'tiktok', 
                  identityId: market.tiktokIdentityId, 
                  advertiserId,
                  pageName: market.tiktokIdentityName 
                });
              }
              const phases = market.phases || [];
              for (const phase of phases) {
                if (phase.tiktokIdentityId && !configs.some(c => c.platform === 'tiktok' && c.identityId === phase.tiktokIdentityId)) {
                  configs.push({ 
                    platform: 'tiktok', 
                    identityId: phase.tiktokIdentityId, 
                    advertiserId,
                    pageName: phase.tiktokIdentityName 
                  });
                }
              }
            }
          }
        }
        
        setPageAssetsConfigs(configs);
        
        if (configs.length > 0) {
          toast.success(`Found ${configs.length} page(s)/identity(s) from ActiPlan`);
        }
      } catch (err) {
        console.error('Error extracting campaign config for page assets:', err);
      }
    },
    []
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
                onClick={() => navigate("/overview")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Overview
              </button>
              <button
                onClick={() => navigate("/actiplans")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                ActiPlans
              </button>
              <button
                onClick={() => navigate("/insights")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Insights
              </button>
              <button
                onClick={() => navigate("/creatives")}
                className="px-4 py-2 text-sm font-medium text-primary border-b-2 border-primary transition-colors"
              >
                Creative Mesh
              </button>
              <WorkspaceSwitcher />
              <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
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
            <Button variant="default" size="sm" onClick={() => navigate('/creatives/match')}>
              <Wand2 className="h-4 w-4 mr-2" />
              Auto-Mesh
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
                  onClick={() => navigate(`/creatives/match?campaignId=${selectedCampaignId}`)}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  Auto-Mesh More
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
                  onClick={() => navigate(`/creatives/match?campaignId=${selectedCampaignId}`)}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  Open Auto-Mesh
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
            <UnifiedAssetsLibrary adAccounts={platformAssetsAdAccounts} />
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
            <UnifiedPageAssetsLibrary pageConfigs={pageAssetsConfigs} />
          </div>
        </TabsContent>
      </Tabs>

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