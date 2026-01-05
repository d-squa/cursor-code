// Creative Library Page - Main hub for creative management
import { useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderUp, FileSpreadsheet, LayoutGrid, Download, Wand2, Type, Layers, Loader2, LogOut, Settings, Bug } from 'lucide-react';
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
  const shouldFetchCampaigns = activeTab === 'assignments' || activeTab === 'text-assets';

  // Campaign selection shared for Assignments + Text Assets
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  // Nonce to trigger TextAssetsTab refresh when assignments change
  const [textAssetsRefreshNonce, setTextAssetsRefreshNonce] = useState(0);

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
            Text Layer
          </TabsTrigger>
          <TabsTrigger value="folder" className="gap-2">
            <FolderUp className="h-4 w-4" />
            Folder Upload
          </TabsTrigger>
          <TabsTrigger value="spreadsheet" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Spreadsheet
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
                Select an ActiPlan to load and edit its text assets.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="folder" className="mt-6">
          <FolderUpload onUploadComplete={handleFolderUploadComplete} adAccounts={[]} isUploading={isCreating} />
        </TabsContent>

        <TabsContent value="spreadsheet" className="mt-6">
          <SpreadsheetUpload onUploadComplete={handleSpreadsheetUploadComplete} isUploading={isCreating} />
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
  );
}