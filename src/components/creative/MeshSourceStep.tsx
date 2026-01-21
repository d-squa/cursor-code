// Step 2: Creative Source Selection
// Users can select from Upload (Meta only), Page Assets, and Ad Account Assets
// Mix and match is supported - all selections accumulate

import { useState, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Upload, 
  FileImage, 
  Cloud, 
  Wand2, 
  X, 
  FolderUp,
  Image as ImageIcon,
  Video,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SelectedAsset, CreativeSource } from '@/hooks/useCreativeMeshProgress';

// Ad account configuration passed from parent
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

interface MeshSourceStepProps {
  platform: 'meta' | 'tiktok';
  campaignId: string;
  adAccounts: AdAccountInfo[];
  pageConfigs: PageConfig[];
  selectedAssets: SelectedAsset[];
  onAddAsset: (asset: SelectedAsset) => void;
  onRemoveAsset: (assetId: string) => void;
  onClearAssets: () => void;
  onRunMesh: () => void;
  isProcessing?: boolean;
}

export function MeshSourceStep({
  platform,
  campaignId,
  adAccounts,
  pageConfigs,
  selectedAssets,
  onAddAsset,
  onRemoveAsset,
  onClearAssets,
  onRunMesh,
  isProcessing = false,
}: MeshSourceStepProps) {
  const [activeTab, setActiveTab] = useState<CreativeSource>(
    platform === 'meta' ? 'upload' : 'page_assets'
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);

  // Filter assets by current platform
  const platformAssets = useMemo(() => 
    selectedAssets.filter(a => a.platform === platform),
    [selectedAssets, platform]
  );

  // Get counts by source
  const assetCounts = useMemo(() => ({
    upload: platformAssets.filter(a => a.source === 'upload').length,
    page_assets: platformAssets.filter(a => a.source === 'page_assets').length,
    ad_account_assets: platformAssets.filter(a => a.source === 'ad_account_assets').length,
  }), [platformAssets]);

  // Available tabs depend on platform
  const availableTabs: Array<{ id: CreativeSource; label: string; icon: React.ReactNode }> = useMemo(() => {
    const tabs = [];
    
    // Upload only for Meta (TikTok API uploads don't work for ad delivery)
    if (platform === 'meta') {
      tabs.push({
        id: 'upload' as CreativeSource,
        label: 'Upload',
        icon: <Upload className="h-4 w-4" />,
      });
    }
    
    tabs.push({
      id: 'page_assets' as CreativeSource,
      label: 'Page Assets',
      icon: <FileImage className="h-4 w-4" />,
    });
    
    tabs.push({
      id: 'ad_account_assets' as CreativeSource,
      label: 'Ad Account Assets',
      icon: <Cloud className="h-4 w-4" />,
    });
    
    return tabs;
  }, [platform]);

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Create assets from files
    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const previewUrl = URL.createObjectURL(file);
      
      const asset: SelectedAsset = {
        id: `upload-${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        source: 'upload',
        platform,
        assetType: isVideo ? 'video' : 'image',
        thumbnailUrl: previewUrl,
        name: file.name,
      };
      
      onAddAsset(asset);
    }
    
    setUploadedFiles(prev => [...prev, ...files]);
    toast.success(`Added ${files.length} files`);
    
    // Reset input
    if (e.target) e.target.value = '';
  }, [platform, onAddAsset]);

  // Handle folder selection
  const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => 
      f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    
    if (files.length === 0) {
      toast.error('No image or video files found in folder');
      return;
    }

    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const previewUrl = URL.createObjectURL(file);
      
      const asset: SelectedAsset = {
        id: `upload-${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        source: 'upload',
        platform,
        assetType: isVideo ? 'video' : 'image',
        thumbnailUrl: previewUrl,
        name: file.name,
      };
      
      onAddAsset(asset);
    }
    
    setUploadedFiles(prev => [...prev, ...files]);
    toast.success(`Added ${files.length} files from folder`);
    
    if (e.target) e.target.value = '';
  }, [platform, onAddAsset]);

  const hasAssets = platformAssets.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Source Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CreativeSource)} className="flex-1 flex flex-col">
        <div className="px-6 border-b bg-background">
          <TabsList className="h-12">
            {availableTabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2 relative">
                {tab.icon}
                {tab.label}
                {assetCounts[tab.id] > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {assetCounts[tab.id]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Main content area */}
          <div className="flex-1 overflow-auto p-6">
            {/* Upload Tab (Meta only) */}
            {platform === 'meta' && (
              <TabsContent value="upload" className="mt-0 h-full">
                <Card className="h-full flex flex-col">
                  <CardHeader>
                    <CardTitle>Upload Creatives</CardTitle>
                    <CardDescription>
                      Upload images and videos directly for meshing
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      >
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="font-medium text-sm">Upload Files</p>
                        <p className="text-xs text-muted-foreground">Images & Videos</p>
                      </div>
                      <div 
                        onClick={() => folderInputRef.current?.click()}
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      >
                        <FolderUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="font-medium text-sm">Upload Folder</p>
                        <p className="text-xs text-muted-foreground">Structured by taxonomy</p>
                      </div>
                    </div>
                    <input 
                      ref={fileInputRef} 
                      type="file" 
                      multiple 
                      accept="image/*,video/*" 
                      onChange={handleFileSelect} 
                      className="hidden" 
                    />
                    <input 
                      ref={folderInputRef} 
                      type="file" 
                      {...{ webkitdirectory: '', directory: '' } as any} 
                      multiple 
                      onChange={handleFolderSelect} 
                      className="hidden" 
                    />
                    
                    {/* Show uploaded files preview */}
                    {assetCounts.upload > 0 && (
                      <div className="mt-4">
                        <div className="text-sm font-medium mb-2">
                          Uploaded ({assetCounts.upload})
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {platformAssets
                            .filter(a => a.source === 'upload')
                            .slice(0, 8)
                            .map(asset => (
                              <div 
                                key={asset.id} 
                                className="relative aspect-square rounded-lg overflow-hidden bg-muted"
                              >
                                {asset.thumbnailUrl && (
                                  <img 
                                    src={asset.thumbnailUrl} 
                                    alt={asset.name} 
                                    className="w-full h-full object-cover" 
                                  />
                                )}
                                <button
                                  onClick={() => onRemoveAsset(asset.id)}
                                  className="absolute top-1 right-1 p-1 rounded-full bg-background/80 hover:bg-background"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                                {asset.assetType === 'video' && (
                                  <div className="absolute bottom-1 left-1">
                                    <Video className="h-3 w-3 text-white drop-shadow" />
                                  </div>
                                )}
                              </div>
                            ))}
                          {assetCounts.upload > 8 && (
                            <div className="aspect-square rounded-lg bg-muted flex items-center justify-center text-sm text-muted-foreground">
                              +{assetCounts.upload - 8} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Page Assets Tab */}
            <TabsContent value="page_assets" className="mt-0 h-full">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Page Assets</CardTitle>
                  <CardDescription>
                    Select organic posts from your connected {platform === 'meta' ? 'Facebook/Instagram Pages' : 'TikTok accounts'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pageConfigs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No pages connected to this campaign. Configure platform identities in the ActiPlan.
                    </div>
                  ) : (
                    <PageAssetSelector
                      platform={platform}
                      pageConfigs={pageConfigs}
                      selectedAssets={platformAssets.filter(a => a.source === 'page_assets')}
                      onAddAsset={onAddAsset}
                      onRemoveAsset={onRemoveAsset}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Ad Account Assets Tab */}
            <TabsContent value="ad_account_assets" className="mt-0 h-full">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Ad Account Assets</CardTitle>
                  <CardDescription>
                    Select creatives from your {platform === 'meta' ? 'Meta' : 'TikTok'} ad account library
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {adAccounts.filter(a => a.platform === platform).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No ad account connected for {platform}. Configure in the ActiPlan.
                    </div>
                  ) : (
                    <AdAccountAssetSelector
                      platform={platform}
                      adAccounts={adAccounts.filter(a => a.platform === platform)}
                      selectedAssets={platformAssets.filter(a => a.source === 'ad_account_assets')}
                      onAddAsset={onAddAsset}
                      onRemoveAsset={onRemoveAsset}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          {/* Selected Assets Sidebar */}
          <div className="w-80 border-l bg-muted/30 flex flex-col">
            <div className="p-4 border-b bg-background">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Selected Assets</h3>
                {hasAssets && (
                  <Button variant="ghost" size="sm" onClick={onClearAssets}>
                    Clear All
                  </Button>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {platformAssets.length} assets ready for meshing
              </div>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              {platformAssets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Select assets from any source tab. You can mix and match.
                </div>
              ) : (
                <div className="space-y-2">
                  {platformAssets.map(asset => (
                    <div 
                      key={asset.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-background border"
                    >
                      <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                        {asset.thumbnailUrl ? (
                          <img 
                            src={asset.thumbnailUrl} 
                            alt={asset.name || 'Asset'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {asset.assetType === 'video' ? (
                              <Video className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {asset.name || asset.id.slice(0, 12)}
                        </p>
                        <Badge variant="outline" className="text-xs capitalize">
                          {asset.source.replace('_', ' ')}
                        </Badge>
                      </div>
                      <button
                        onClick={() => onRemoveAsset(asset.id)}
                        className="p-1 hover:bg-muted rounded"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Run Mesh Button */}
            <div className="p-4 border-t bg-background">
              <Button 
                className="w-full gap-2" 
                size="lg"
                disabled={!hasAssets || isProcessing}
                onClick={onRunMesh}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Auto-Mesh {hasAssets && `(${platformAssets.length})`}
              </Button>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

// Sub-component for Page Asset selection
function PageAssetSelector({
  platform,
  pageConfigs,
  selectedAssets,
  onAddAsset,
  onRemoveAsset,
}: {
  platform: 'meta' | 'tiktok';
  pageConfigs: PageConfig[];
  selectedAssets: SelectedAsset[];
  onAddAsset: (asset: SelectedAsset) => void;
  onRemoveAsset: (assetId: string) => void;
}) {
  // This will be populated with the UnifiedPageAssetsLibrary integration
  return (
    <div className="text-center py-8 text-muted-foreground">
      <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>Page assets will load here based on connected pages.</p>
      <p className="text-xs mt-2">
        {pageConfigs.length} page(s) configured
      </p>
    </div>
  );
}

// Sub-component for Ad Account Asset selection
function AdAccountAssetSelector({
  platform,
  adAccounts,
  selectedAssets,
  onAddAsset,
  onRemoveAsset,
}: {
  platform: 'meta' | 'tiktok';
  adAccounts: AdAccountInfo[];
  selectedAssets: SelectedAsset[];
  onAddAsset: (asset: SelectedAsset) => void;
  onRemoveAsset: (assetId: string) => void;
}) {
  // This will be populated with the UnifiedAssetsLibrary integration
  return (
    <div className="text-center py-8 text-muted-foreground">
      <Cloud className="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>Ad account assets will load here.</p>
      <p className="text-xs mt-2">
        {adAccounts.length} ad account(s) connected
      </p>
    </div>
  );
}
