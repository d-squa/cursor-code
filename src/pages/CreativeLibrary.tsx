// Creative Library Page - Main hub for creative management
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FolderUp, FileSpreadsheet, LayoutGrid, Plus, Download, Wand2, Type } from 'lucide-react';
import { useCreatives } from '@/hooks/useCreatives';
import { CreativeGrid } from '@/components/creative/CreativeGrid';
import { FolderUpload } from '@/components/creative/FolderUpload';
import { SpreadsheetUpload } from '@/components/creative/SpreadsheetUpload';
import { CreativeEditor } from '@/components/creative/CreativeEditor';
import { CreativeMatchingDialog } from '@/components/creative/CreativeMatchingDialog';
import { TextAssetsTab } from '@/components/creative/TextAssetsTab';
import type { Creative, CreativeFilters, Platform } from '@/types/creative';
import { toast } from 'sonner';
import { generateSampleTaxonomyStructure } from '@/utils/creativeValidation';

export default function CreativeLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'library';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [filters, setFilters] = useState<CreativeFilters>({});
  const [editingCreative, setEditingCreative] = useState<Creative | null>(null);
  const [isMatchingDialogOpen, setIsMatchingDialogOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  // Sync tab changes with URL
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  }, [setSearchParams]);

  const {
    creatives,
    isLoading,
    createCreative,
    updateCreative,
    deleteCreative,
    bulkAction,
    uploadFile,
    isCreating,
    isUpdating,
  } = useCreatives(filters);

  // Handle folder upload complete
  const handleFolderUploadComplete = useCallback(async (newCreatives: Partial<Creative>[]) => {
    for (const creative of newCreatives) {
      await createCreative(creative as Creative & { name: string; platform: Platform });
    }
  }, [createCreative]);

  // Handle spreadsheet upload complete
  const handleSpreadsheetUploadComplete = useCallback(async (newCreatives: Partial<Creative>[]) => {
    for (const creative of newCreatives) {
      await createCreative(creative as Creative & { name: string; platform: Platform });
    }
  }, [createCreative]);

  // Handle edit
  const handleEdit = useCallback((creative: Creative) => {
    setEditingCreative(creative);
    setIsEditorOpen(true);
  }, []);

  // Handle save
  const handleSave = useCallback(async (updates: Partial<Creative>) => {
    if (editingCreative) {
      await updateCreative({ id: editingCreative.id, updates });
      setIsEditorOpen(false);
      setEditingCreative(null);
      toast.success('Creative updated');
    }
  }, [editingCreative, updateCreative]);

  // Handle duplicate
  const handleDuplicate = useCallback(async (creative: Creative) => {
    await bulkAction({ type: 'duplicate', creativeIds: [creative.id] });
  }, [bulkAction]);

  // Handle delete
  const handleDelete = useCallback(async (id: string) => {
    await deleteCreative(id);
  }, [deleteCreative]);

  // Handle bulk actions
  const handleBulkAction = useCallback(async (action: string, ids: string[]) => {
    if (action === 'delete') {
      await bulkAction({ type: 'delete', creativeIds: ids });
    } else if (action === 'duplicate') {
      await bulkAction({ type: 'duplicate', creativeIds: ids });
    }
  }, [bulkAction]);

  // Download sample folder structure
  const handleDownloadSampleStructure = useCallback(() => {
    const structure = generateSampleTaxonomyStructure();
    const text = `ActiPlan Creative Folder Structure\n${'='.repeat(40)}\n\nCreate folders following this hierarchy:\nPlatform/Market/Phase/OptimizationGoal/CreativeType/\n\nExamples:\n${structure.join('\n')}\n\nNotes:\n- Platform: Meta, TikTok, Google, LinkedIn, Snapchat, Pinterest, X\n- Market: 2-letter country code (US, UK, DE, FR, etc.)\n- Phase: Awareness, Consideration, Conversion, Retention, Loyalty\n- OptimizationGoal: Platform-specific (REACH, CONVERSIONS, VIDEO_VIEWS, etc.)\n- CreativeType: image, video, carousel, dark_post, existing_post`;
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'actiplan_folder_structure.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Sample structure downloaded');
  }, []);

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Creative Library</h1>
          <p className="text-muted-foreground">
            Manage and organize creatives for your campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{creatives.length} creatives</Badge>
          <Button variant="default" size="sm" onClick={() => setIsMatchingDialogOpen(true)}>
            <Wand2 className="h-4 w-4 mr-2" />
            Match to ActiPlan
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
          <TabsTrigger value="text-assets" className="gap-2">
            <Type className="h-4 w-4" />
            Text Assets
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

        <TabsContent value="text-assets" className="mt-6">
          <TextAssetsTab />
        </TabsContent>

        <TabsContent value="folder" className="mt-6">
          <FolderUpload
            onUploadComplete={handleFolderUploadComplete}
            onUploadFile={uploadFile}
            isUploading={isCreating}
          />
        </TabsContent>

        <TabsContent value="spreadsheet" className="mt-6">
          <SpreadsheetUpload
            onUploadComplete={handleSpreadsheetUploadComplete}
            isUploading={isCreating}
          />
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

      {/* Creative Matching Dialog */}
      <CreativeMatchingDialog
        open={isMatchingDialogOpen}
        onOpenChange={setIsMatchingDialogOpen}
      />
    </div>
  );
}
