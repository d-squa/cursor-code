// Step 2: Creative Source Selection
// Users can select from Upload, Page Assets, Ad Account Assets, and YouTube Links (Google)
// Mix and match is supported - all selections accumulate

import { useState, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Upload, 
  FileImage, 
  Cloud, 
  Wand2, 
  X, 
  FolderUp,
  Image as ImageIcon,
  Video,
  Loader2,
  Youtube,
  Link2,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { SelectedAsset, CreativeSource } from '@/hooks/useCreativeMeshProgress';
import { MeshPageAssetsPicker } from '@/components/creative/MeshPageAssetsPicker';
import { MeshAdAccountAssetsPicker } from '@/components/creative/MeshAdAccountAssetsPicker';
import { CreativeProcessingOptionsDialog, type ProcessingOptions } from '@/components/creative/CreativeProcessingOptionsDialog';
import type { DetectableAsset } from '@/utils/creativeProcessingDetection';

// Ad account configuration passed from parent
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

// Google Ads campaign type → allowed media types
const GOOGLE_CAMPAIGN_ALLOWED_MEDIA: Record<string, { image: boolean; video: boolean; youtube: boolean; label: string }> = {
  'Search': { image: false, video: false, youtube: false, label: 'Search campaigns are text-only — no image or video creatives' },
  'Shopping': { image: false, video: false, youtube: false, label: 'Shopping campaigns use product feed — no image or video creatives' },
  'Display': { image: true, video: false, youtube: false, label: 'Display campaigns accept images only' },
  'Video': { image: false, video: true, youtube: true, label: 'Video campaigns accept videos only' },
  'Performance Max': { image: true, video: true, youtube: true, label: 'Performance Max accepts images and videos' },
  'Demand Gen': { image: true, video: true, youtube: true, label: 'Demand Gen accepts images and videos' },
  'App Promotion': { image: true, video: true, youtube: true, label: 'App Promotion accepts images and videos' },
};

function getGoogleAllowedMedia(campaignTypes: string[]): { image: boolean; video: boolean; youtube: boolean; textOnly: boolean; restrictions: string[] } {
  if (campaignTypes.length === 0) return { image: true, video: true, youtube: true, textOnly: false, restrictions: [] };
  
  let allowImage = false;
  let allowVideo = false;
  let allowYoutube = false;
  const restrictions: string[] = [];

  for (const ct of campaignTypes) {
    const config = GOOGLE_CAMPAIGN_ALLOWED_MEDIA[ct];
    if (config) {
      if (config.image) allowImage = true;
      if (config.video) allowVideo = true;
      if (config.youtube) allowYoutube = true;
      restrictions.push(`${ct}: ${config.label}`);
    } else {
      // Unknown campaign type — allow everything
      allowImage = true;
      allowVideo = true;
      allowYoutube = true;
    }
  }

  const textOnly = !allowImage && !allowVideo;
  return { image: allowImage, video: allowVideo, youtube: allowYoutube, textOnly, restrictions };
}

interface MeshSourceStepProps {
  platform: 'meta' | 'tiktok' | 'google';
  campaignId: string;
  adAccounts: AdAccountInfo[];
  pageConfigs: PageConfig[];
  selectedAssets: SelectedAsset[];
  onAddAsset: (asset: SelectedAsset) => void;
  onRemoveAsset: (assetId: string) => void;
  onClearAssets: () => void;
  onRunMesh: (processingOptions?: ProcessingOptions) => void;
  isProcessing?: boolean;
  googleCampaignTypes?: string[];
}

export function MeshSourceStep({
  platform,
  adAccounts,
  pageConfigs,
  selectedAssets,
  onAddAsset,
  onRemoveAsset,
  onClearAssets,
  onRunMesh,
  isProcessing = false,
  googleCampaignTypes = [],
}: MeshSourceStepProps) {
  // Compute allowed media for Google
  const googleMedia = useMemo(() => 
    platform === 'google' ? getGoogleAllowedMedia(googleCampaignTypes) : null,
    [platform, googleCampaignTypes]
  );
  // If Google and text-only, redirect default tab
  const isGoogleTextOnly = googleMedia?.textOnly ?? false;
  const defaultTab = isGoogleTextOnly ? 'upload' : (platform === 'google' ? 'upload' : (platform === 'meta' ? 'upload' : 'page_assets'));
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [showProcessingOptions, setShowProcessingOptions] = useState(false);

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

  // YouTube video count
  const youtubeCount = platformAssets.filter(a => 
    a.source === 'ad_account_assets' && a.platformAssetId?.startsWith('yt:')
  ).length;

  // Available tabs depend on platform
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: string; label: string; icon: React.ReactNode; disabled?: boolean }> = [];
    
    // For Google text-only campaigns (Search, Shopping), no media tabs
    if (isGoogleTextOnly) {
      return tabs; // Empty — will show text-only message instead
    }

    // Upload for Meta and Google (TikTok API uploads don't work for ad delivery)
    if (platform === 'meta' || platform === 'google') {
      tabs.push({
        id: 'upload',
        label: 'Upload',
        icon: <Upload className="h-4 w-4" />,
      });
    }
    
    // Page Assets only for Meta and TikTok (Google doesn't have page assets)
    if (platform !== 'google') {
      tabs.push({
        id: 'page_assets',
        label: 'Page Assets',
        icon: <FileImage className="h-4 w-4" />,
      });
    }
    
    tabs.push({
      id: 'ad_account_assets',
      label: 'Ad Account Assets',
      icon: <Cloud className="h-4 w-4" />,
    });

    // YouTube Video tab for Google only (if video is allowed)
    if (platform === 'google' && googleMedia?.youtube) {
      tabs.push({
        id: 'youtube_video',
        label: 'YouTube Video',
        icon: <Youtube className="h-4 w-4" />,
      });
    }
    
    return tabs;
  }, [platform, isGoogleTextOnly, googleMedia]);

  // Handle file selection
  // Compute allowed file accept string for Google
  const fileAcceptString = useMemo(() => {
    if (!googleMedia) return 'image/*,video/*';
    if (googleMedia.image && googleMedia.video) return 'image/*,video/*';
    if (googleMedia.image) return 'image/*';
    if (googleMedia.video) return 'video/*';
    return 'image/*,video/*';
  }, [googleMedia]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let skipped = 0;
    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      
      // Validate against Google campaign type restrictions
      if (googleMedia) {
        if (isVideo && !googleMedia.video) {
          toast.error(`Video files not allowed: ${googleCampaignTypes.join(', ')} campaigns don't support video creatives`);
          skipped++;
          continue;
        }
        if (!isVideo && !googleMedia.image) {
          toast.error(`Image files not allowed: ${googleCampaignTypes.join(', ')} campaigns don't support image creatives`);
          skipped++;
          continue;
        }
      }

      const previewUrl = URL.createObjectURL(file);
      
      const asset: SelectedAsset = {
        id: `upload-${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        source: 'upload',
        platform,
        assetType: isVideo ? 'video' : 'image',
        thumbnailUrl: previewUrl,
        name: file.name,
        file,
      };
      
      onAddAsset(asset);
    }
    
    const added = files.length - skipped;
    if (added > 0) toast.success(`Added ${added} files`);
    if (e.target) e.target.value = '';
  }, [platform, onAddAsset]);

  // Handle folder selection
  const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    let files = Array.from(e.target.files || []).filter(f => 
      f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    
    // Filter by Google campaign type restrictions
    if (googleMedia) {
      files = files.filter(f => {
        const isVideo = f.type.startsWith('video/');
        if (isVideo && !googleMedia.video) return false;
        if (!isVideo && !googleMedia.image) return false;
        return true;
      });
    }

    if (files.length === 0) {
      const reason = googleMedia ? ` compatible with ${googleCampaignTypes.join(', ')} campaigns` : '';
      toast.error(`No valid media files found${reason}`);
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
        file,
      };
      
      onAddAsset(asset);
    }
    
    toast.success(`Added ${files.length} files from folder`);
    if (e.target) e.target.value = '';
  }, [platform, onAddAsset, googleMedia, googleCampaignTypes]);

  // Handle YouTube video link
  const handleAddYoutubeVideo = useCallback(() => {
    if (!youtubeUrl.trim()) return;

    setYoutubeLoading(true);
    
    // Extract YouTube video ID from various URL formats
    let videoId: string | null = null;
    try {
      const url = new URL(youtubeUrl.trim());
      if (url.hostname.includes('youtube.com')) {
        videoId = url.searchParams.get('v');
      } else if (url.hostname === 'youtu.be') {
        videoId = url.pathname.slice(1);
      }
    } catch {
      // Try as raw video ID
      if (/^[a-zA-Z0-9_-]{11}$/.test(youtubeUrl.trim())) {
        videoId = youtubeUrl.trim();
      }
    }

    if (!videoId) {
      toast.error('Invalid YouTube URL. Please provide a valid YouTube video link.');
      setYoutubeLoading(false);
      return;
    }

    // Check if already added
    const exists = platformAssets.some(a => a.platformAssetId === `yt:${videoId}`);
    if (exists) {
      toast.info('This YouTube video is already added.');
      setYoutubeLoading(false);
      return;
    }

    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    const asset: SelectedAsset = {
      id: `youtube-${videoId}-${Date.now()}`,
      source: 'ad_account_assets',
      platform: 'google',
      assetType: 'video',
      thumbnailUrl,
      name: `YouTube: ${videoId}`,
      platformAssetId: `yt:${videoId}`,
    };

    onAddAsset(asset);
    setYoutubeUrl('');
    setYoutubeLoading(false);
    toast.success('YouTube video added');
  }, [youtubeUrl, platformAssets, onAddAsset]);

  const hasAssets = platformAssets.length > 0;

  // Convert selected assets to DetectableAsset format for processing detection
  const detectableAssets: DetectableAsset[] = useMemo(() => 
    platformAssets.map(a => ({
      id: a.id,
      name: a.name || a.id,
      filePath: a.name,
      folderPath: a.name ? a.name.split('/').slice(0, -1).join('/') : '/',
      assetType: a.assetType,
      width: a.width,
      height: a.height,
      aspectRatio: a.width && a.height ? `${a.width}:${a.height}` : undefined,
    })),
    [platformAssets]
  );

  // Handle Run Matching button — open processing options dialog
  const handleRunMatchingClick = useCallback(() => {
    if (!hasAssets) return;
    setShowProcessingOptions(true);
  }, [hasAssets]);

  // Handle confirm from processing options dialog
  const handleProcessingConfirm = useCallback((options: ProcessingOptions) => {
    setShowProcessingOptions(false);
    onRunMesh(options);
  }, [onRunMesh]);

  // Determine upload description based on allowed media
  const uploadDescription = useMemo(() => {
    if (!googleMedia) return platform === 'google' ? 'Upload images and videos to your Google Ads asset library' : 'Upload images and videos directly for meshing';
    if (googleMedia.image && googleMedia.video) return 'Upload images and videos to your Google Ads asset library';
    if (googleMedia.image) return 'Upload images to your Google Ads asset library (videos not supported for current campaign types)';
    if (googleMedia.video) return 'Upload videos to your Google Ads asset library (images not supported for current campaign types)';
    return 'Upload creatives';
  }, [platform, googleMedia]);

  const uploadFileTypeLabel = useMemo(() => {
    if (!googleMedia) return 'Images & Videos';
    if (googleMedia.image && googleMedia.video) return 'Images & Videos';
    if (googleMedia.image) return 'Images Only';
    if (googleMedia.video) return 'Videos Only';
    return 'Images & Videos';
  }, [googleMedia]);

  return (
    <div className="flex flex-col h-full">
      {/* Google text-only campaign banner */}
      {isGoogleTextOnly && (
        <div className="mx-6 mt-4 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/50">
              <FileImage className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-sm text-amber-800 dark:text-amber-200">Text-Only Campaign Types Detected</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Your campaign includes only {googleCampaignTypes.join(' & ')} campaign types, which rely on text assets rather than image/video creatives. 
                You can skip this step and proceed directly to text assets.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2"
                onClick={onRunMesh}
              >
                Skip to Text Assets →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Source Tabs */}
      {!isGoogleTextOnly && (
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-6 border-b bg-background">
          <TabsList className="h-12">
            {availableTabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2 relative">
                {tab.icon}
                {tab.label}
                {tab.id === 'youtube_video' && youtubeCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {youtubeCount}
                  </Badge>
                )}
                {tab.id !== 'youtube_video' && (assetCounts as any)[tab.id] > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {(assetCounts as any)[tab.id]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Main content area */}
          <div className="flex-1 overflow-auto p-6">
            {/* Google media restriction info */}
            {platform === 'google' && googleMedia && !(googleMedia.image && googleMedia.video) && (
              <div className="mb-4 p-3 rounded-md border border-muted bg-muted/30 text-xs text-muted-foreground">
                <strong>Format restrictions:</strong> Based on your campaign types ({googleCampaignTypes.join(', ')}), 
                {googleMedia.image && !googleMedia.video && ' only image uploads are accepted.'}
                {!googleMedia.image && googleMedia.video && ' only video uploads are accepted.'}
              </div>
            )}

            {/* Upload Tab (Meta and Google) */}
            {(platform === 'meta' || platform === 'google') && (
              <TabsContent value="upload" className="mt-0 h-full">
                <Card className="h-full flex flex-col">
                  <CardHeader>
                    <CardTitle>Upload Creatives</CardTitle>
                    <CardDescription>{uploadDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      >
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="font-medium text-sm">Upload Files</p>
                        <p className="text-xs text-muted-foreground">{uploadFileTypeLabel}</p>
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
                      accept={fileAcceptString} 
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

            {/* Page Assets Tab (Meta and TikTok only) */}
            {platform !== 'google' && (
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
                      <MeshPageAssetsPicker
                        platform={platform}
                        pageConfigs={pageConfigs.filter(c => c.platform === platform)}
                        selectedAssets={platformAssets.filter(a => a.source === 'page_assets')}
                        onAddAsset={onAddAsset}
                        onRemoveAsset={onRemoveAsset}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Ad Account Assets Tab */}
            <TabsContent value="ad_account_assets" className="mt-0 h-full">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Ad Account Assets</CardTitle>
                  <CardDescription>
                    Select creatives from your {platform === 'meta' ? 'Meta' : platform === 'google' ? 'Google Ads' : 'TikTok'} ad account library
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {adAccounts.filter(a => a.platform === platform).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No ad account connected for {platform}. Configure in the ActiPlan.
                    </div>
                  ) : (
                    <MeshAdAccountAssetsPicker
                      adAccounts={adAccounts.filter(a => a.platform === platform)}
                      selectedAssets={platformAssets.filter(a => a.source === 'ad_account_assets')}
                      onAddAsset={onAddAsset}
                      onRemoveAsset={onRemoveAsset}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* YouTube Video Tab (Google only) */}
            {platform === 'google' && (
              <TabsContent value="youtube_video" className="mt-0 h-full">
                <Card className="h-full flex flex-col">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Youtube className="h-5 w-5 text-red-600" />
                      YouTube Video
                    </CardTitle>
                    <CardDescription>
                      Add a YouTube video by pasting its URL. The video must be uploaded to your YouTube channel and linked to your Google Ads account.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm">YouTube Video URL</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={youtubeUrl}
                          onChange={(e) => setYoutubeUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddYoutubeVideo();
                          }}
                          className="flex-1"
                        />
                        <Button
                          onClick={handleAddYoutubeVideo}
                          disabled={!youtubeUrl.trim() || youtubeLoading}
                        >
                          {youtubeLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Link2 className="h-4 w-4" />
                          )}
                          Add
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Supports youtube.com, youtu.be URLs, or raw video IDs
                      </p>
                    </div>

                    {/* Show added YouTube videos */}
                    {youtubeCount > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Added YouTube Videos ({youtubeCount})</div>
                        <div className="grid grid-cols-2 gap-3">
                          {platformAssets
                            .filter(a => a.platformAssetId?.startsWith('yt:'))
                            .map(asset => {
                              const videoId = asset.platformAssetId?.replace('yt:', '');
                              return (
                                <div key={asset.id} className="relative rounded-lg overflow-hidden bg-muted border">
                                  <div className="aspect-video relative">
                                    {asset.thumbnailUrl && (
                                      <img 
                                        src={asset.thumbnailUrl} 
                                        alt={asset.name || 'YouTube video'}
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="bg-red-600 rounded-full p-2">
                                        <Video className="h-4 w-4 text-white" />
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => onRemoveAsset(asset.id)}
                                      className="absolute top-1 right-1 p-1 rounded-full bg-background/80 hover:bg-background"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                  <div className="p-2">
                                    <p className="text-xs font-medium truncate">{videoId}</p>
                                    <div className="flex items-center gap-1 mt-1">
                                      <CheckCircle className="h-3 w-3 text-green-600" />
                                      <span className="text-[10px] text-muted-foreground">Ready</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </div>

          {/* Selected Assets Sidebar */}
          <div className="w-80 border-l bg-muted/30 flex flex-col max-h-full">
            {/* Sticky header with Run Matching button */}
            <div className="p-4 border-b bg-background space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Selected ({platformAssets.length})</h3>
                {hasAssets && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearAssets}>
                    Clear All
                  </Button>
                )}
              </div>
              <Button 
                className="w-full gap-2" 
                size="default"
                disabled={!hasAssets || isProcessing}
                onClick={handleRunMatchingClick}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Run Matching {hasAssets && `(${platformAssets.length})`}
              </Button>
            </div>
            
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-3">
                {platformAssets.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    Select assets from any source tab.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {platformAssets.map(asset => (
                      <div 
                        key={asset.id}
                        className="relative group rounded-md overflow-hidden bg-muted border aspect-square"
                      >
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
                        {asset.assetType === 'video' && (
                          <div className="absolute bottom-0.5 left-0.5">
                            <Video className="h-3 w-3 text-white drop-shadow-md" />
                          </div>
                        )}
                        <button
                          onClick={() => onRemoveAsset(asset.id)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </Tabs>
      )}

      {/* Creative Processing Options Dialog */}
      <CreativeProcessingOptionsDialog
        open={showProcessingOptions}
        onOpenChange={setShowProcessingOptions}
        assets={detectableAssets}
        platform={platform}
        googleCampaignType={googleCampaignTypes?.[0]}
        onConfirm={handleProcessingConfirm}
        isProcessing={isProcessing}
      />
    </div>
  );
}
