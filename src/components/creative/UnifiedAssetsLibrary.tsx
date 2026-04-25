// Unified Assets Library - Displays all platform assets from all connected ad accounts
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  RefreshCw,
  Search,
  Play,
  Image as ImageIcon,
  CheckCircle,
  Sparkles,
  Filter,
  Cloud,
  Wand2,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface PlatformAsset {
  id: string;
  platform: 'tiktok' | 'meta' | 'google';
  platform_asset_id: string;
  advertiser_id: string;
  asset_type: 'video' | 'image';
  asset_name: string | null;
  preview_url: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  aspect_ratio: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  approval_status: string | null;
  is_usable: boolean | null;
  spark_eligible: boolean | null;
  synced_at: string | null;
  created_at: string | null;
}

interface AdAccount {
  platform: 'meta' | 'tiktok' | 'google';
  accountId: string;
}

interface UnifiedAssetsLibraryProps {
  adAccounts: AdAccount[];
  onSelectAsset?: (asset: PlatformAsset) => void;
  selectedAssetId?: string;
  selectable?: boolean;
  /** Enable multi-select mode with auto-mesh capability */
  multiSelect?: boolean;
  /** Called when user wants to mesh selected assets */
  onMeshSelected?: (assets: PlatformAsset[]) => void;
  /** Called whenever selection changes (for cumulative selection across tabs) */
  onSelectionChange?: (assets: PlatformAsset[]) => void;
  /** Externally controlled selection (for cumulative selection persistence) */
  externalSelection?: PlatformAsset[];
}

const approvalStatusColors: Record<string, string> = {
  SUCCESS: 'bg-green-500/20 text-green-700 dark:text-green-400',
  APPROVED: 'bg-green-500/20 text-green-700 dark:text-green-400',
  PENDING: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  PROCESSING: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  REJECTED: 'bg-destructive/20 text-destructive',
  FAILED: 'bg-destructive/20 text-destructive',
};

export function UnifiedAssetsLibrary({
  adAccounts,
  onSelectAsset,
  selectedAssetId,
  selectable = false,
  multiSelect = false,
  onMeshSelected,
  onSelectionChange,
  externalSelection,
}: UnifiedAssetsLibraryProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'tiktok' | 'meta'>('all');
  const [assetTypeFilter, setAssetTypeFilter] = useState<'all' | 'video' | 'image'>('all');
  const [onlyUsable, setOnlyUsable] = useState(true);
  const [syncingAccounts, setSyncingAccounts] = useState<Set<string>>(new Set());
  
  // Use external selection if provided, otherwise manage locally
  const externalSelectionIds = useMemo(() => 
    new Set(externalSelection?.map(a => a.id) || []),
    [externalSelection]
  );
  const [internalSelectedAssets, setInternalSelectedAssets] = useState<Set<string>>(new Set());
  
  // Use external selection if provided
  const selectedAssets = externalSelection ? externalSelectionIds : internalSelectedAssets;
  const setSelectedAssets = externalSelection ? undefined : setInternalSelectedAssets;

  // Toggle asset selection in multi-select mode
  const toggleAssetSelection = (assetId: string) => {
    if (externalSelection && onSelectionChange) {
      // External mode: compute new selection and notify parent
      const isCurrentlySelected = externalSelectionIds.has(assetId);
      if (isCurrentlySelected) {
        // Remove from selection
        const newSelection = externalSelection.filter(a => a.id !== assetId);
        onSelectionChange(newSelection);
      } else {
        // Add to selection - find the asset in loaded data
        const assetToAdd = assets?.find(a => a.id === assetId);
        if (assetToAdd) {
          onSelectionChange([...externalSelection, assetToAdd]);
        }
      }
    } else if (setSelectedAssets) {
      // Internal mode
      setSelectedAssets(prev => {
        const next = new Set(prev);
        if (next.has(assetId)) {
          next.delete(assetId);
        } else {
          next.add(assetId);
        }
        if (onSelectionChange && assets) {
          const selectedObjects = assets.filter(a => next.has(a.id));
          setTimeout(() => onSelectionChange(selectedObjects), 0);
        }
        return next;
      });
    }
  };

  // Clear selection
  const clearSelection = () => {
    if (externalSelection && onSelectionChange) {
      onSelectionChange([]);
    } else if (setSelectedAssets) {
      setSelectedAssets(new Set());
      onSelectionChange?.([]);
    }
  };

  // Build query keys for all accounts
  const accountKeys = useMemo(() => 
    adAccounts.map(a => `${a.platform}:${a.accountId}`).sort().join(','),
    [adAccounts]
  );

  // Fetch assets from all ad accounts
  const { data: assets, isLoading, refetch } = useQuery({
    queryKey: ['unified-platform-assets', accountKeys],
    queryFn: async () => {
      if (adAccounts.length === 0) return [];
      
      // Build OR conditions for each account
      // Normalize accountId: strip 'act_' prefix for Meta accounts since DB stores numeric ID only
      const conditions = adAccounts.map(a => {
        const normalizedId = a.accountId.replace(/^act_/, '');
        return `and(platform.eq.${a.platform},advertiser_id.eq.${normalizedId})`;
      });
      
      const { data, error } = await supabase
        .from('creative_library_assets')
        .select('*')
        .or(conditions.join(','))
        .order('synced_at', { ascending: false });

      if (error) throw error;
      return data as PlatformAsset[];
    },
    enabled: adAccounts.length > 0,
  });

  // Sync all accounts
  const handleSyncAll = async () => {
    const accountsToSync = new Set(adAccounts.map(a => `${a.platform}:${a.accountId}`));
    setSyncingAccounts(accountsToSync);
    
    let successCount = 0;
    let totalSynced = 0;
    
    for (const account of adAccounts) {
      try {
        const isGoogle = account.platform === 'google';
        const fnName = isGoogle ? 'sync-google-ads-assets' : 'sync-creative-library';
        const fnBody = isGoogle
          ? { customerId: account.accountId }
          : { platform: account.platform, advertiserId: account.accountId };

        const { data, error } = await supabase.functions.invoke(fnName, { body: fnBody });
        if (!error && data?.success) {
          successCount++;
          totalSynced += data.syncedCount ?? data.synced ?? 0;
        } else if (error) {
          console.error(`Sync error for ${account.platform}:${account.accountId}`, error);
        }
      } catch (err) {
        console.error(`Error syncing ${account.platform}:${account.accountId}`, err);
      }
    }
    
    setSyncingAccounts(new Set());
    queryClient.invalidateQueries({ queryKey: ['unified-platform-assets'] });
    
    if (successCount > 0) {
      toast.success(`Synced ${totalSynced} assets from ${successCount} account(s)`);
    } else {
      toast.error('Failed to sync assets');
    }
  };

  // Filter assets
  const filteredAssets = useMemo(() => {
    return (assets || []).filter((asset) => {
      if (search && !asset.asset_name?.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (platformFilter !== 'all' && asset.platform !== platformFilter) {
        return false;
      }
      if (assetTypeFilter !== 'all' && asset.asset_type !== assetTypeFilter) {
        return false;
      }
      if (onlyUsable && !asset.is_usable) {
        return false;
      }
      return true;
    });
  }, [assets, search, platformFilter, assetTypeFilter, onlyUsable]);

  // Get selected asset objects (after assets query)
  const selectedAssetObjects = useMemo(() => {
    return (assets || []).filter(a => selectedAssets.has(a.id));
  }, [assets, selectedAssets]);

  // Handle mesh action
  const handleMeshSelected = () => {
    if (onMeshSelected && selectedAssetObjects.length > 0) {
      onMeshSelected(selectedAssetObjects);
      clearSelection();
    }
  };

  // Get unique platforms from accounts
  const availablePlatforms = useMemo(() => {
    const platforms = new Set(adAccounts.map(a => a.platform));
    return Array.from(platforms);
  }, [adAccounts]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const isSyncing = syncingAccounts.size > 0;

  if (adAccounts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Cloud className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Select an ActiPlan to load ad accounts</p>
        <p className="text-xs mt-1">Assets synced from TikTok/Meta Creative Libraries will appear here</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            Platform Assets
            <Badge variant="secondary">{assets?.length || 0} assets</Badge>
            {availablePlatforms.map(p => (
              <Badge key={p} variant="outline" className="text-xs capitalize">
                {p}
              </Badge>
            ))}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncAll}
            disabled={isSyncing}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isSyncing && 'animate-spin')} />
            Sync All ({adAccounts.length})
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Showing assets from {adAccounts.length} ad account(s)
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {availablePlatforms.length > 1 && (
            <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as any)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {availablePlatforms.includes('tiktok') && <SelectItem value="tiktok">TikTok</SelectItem>}
                {availablePlatforms.includes('meta') && <SelectItem value="meta">Meta</SelectItem>}
              </SelectContent>
            </Select>
          )}

          <Select value={assetTypeFilter} onValueChange={(v) => setAssetTypeFilter(v as any)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="video">Videos</SelectItem>
              <SelectItem value="image">Images</SelectItem>
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onlyUsable} onCheckedChange={(c) => setOnlyUsable(!!c)} />
            Usable only
          </label>
        </div>

        {/* Multi-select action bar - only show if not using parent-controlled selection */}
        {multiSelect && selectedAssets.size > 0 && !onSelectionChange && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selectedAssets.size} selected</Badge>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
            <Button size="sm" onClick={handleMeshSelected} disabled={!onMeshSelected}>
              <Wand2 className="h-4 w-4 mr-2" />
              Match Selected
            </Button>
          </div>
        )}

        {/* Asset Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No assets found</p>
            <p className="text-sm">Sync your Creative Libraries to see assets</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pr-4">
              {filteredAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  isSelected={multiSelect ? selectedAssets.has(asset.id) : selectedAssetId === asset.id}
                  onSelect={
                    multiSelect 
                      ? () => toggleAssetSelection(asset.id)
                      : selectable 
                        ? () => onSelectAsset?.(asset) 
                        : undefined
                  }
                  formatDuration={formatDuration}
                  formatFileSize={formatFileSize}
                  showCheckbox={multiSelect}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// Individual asset card
function AssetCard({
  asset,
  isSelected,
  onSelect,
  formatDuration,
  formatFileSize,
  showCheckbox = false,
}: {
  asset: PlatformAsset;
  isSelected: boolean;
  onSelect?: () => void;
  formatDuration: (s: number | null) => string | null;
  formatFileSize: (b: number | null) => string | null;
  showCheckbox?: boolean;
}) {
  const [imageError, setImageError] = useState(false);
  const thumbnailUrl = asset.thumbnail_url || asset.preview_url;
  const isVideo = asset.asset_type === 'video';
  const approvalClass = approvalStatusColors[asset.approval_status || ''] || 'bg-muted text-muted-foreground';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            className={cn(
              'overflow-hidden transition-all hover:shadow-lg',
              onSelect && 'cursor-pointer',
              isSelected && 'ring-2 ring-primary',
              !asset.is_usable && 'opacity-60'
            )}
            onClick={onSelect}
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-muted">
              {thumbnailUrl && !imageError ? (
                <>
                  <img
                    src={thumbnailUrl}
                    alt={asset.asset_name || 'Asset'}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                    loading="lazy"
                  />
                  {isVideo && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="h-8 w-8 text-white" fill="white" />
                    </div>
                  )}
                  {asset.duration_seconds && (
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                      {formatDuration(asset.duration_seconds)}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {isVideo ? (
                    <Play className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              )}

              {/* Platform badge */}
              <Badge 
                variant="secondary" 
                className={cn(
                  "absolute top-1 left-1 text-xs capitalize",
                  asset.platform === 'tiktok' ? 'bg-black text-white' : 'bg-blue-600 text-white'
                )}
              >
                {asset.platform}
              </Badge>

              {/* Spark eligible badge */}
              {asset.spark_eligible && (
                <Badge variant="secondary" className="absolute top-1 right-1 bg-purple-500/20 text-purple-700 text-xs gap-1">
                  <Sparkles className="h-3 w-3" />
                </Badge>
              )}

              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute bottom-1 left-1">
                  {showCheckbox ? (
                    <Checkbox checked className="h-5 w-5 data-[state=checked]:bg-primary" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-primary fill-primary-foreground" />
                  )}
                </div>
              )}
            </div>

            <CardContent className="p-2">
              <p className="text-xs font-medium truncate" title={asset.asset_name || 'Untitled'}>
                {asset.asset_name || 'Untitled'}
              </p>
              <div className="flex items-center justify-between mt-1">
                <Badge variant="secondary" className={cn('text-xs', approvalClass)}>
                  {asset.approval_status || 'Unknown'}
                </Badge>
                {asset.width && asset.height && (
                  <span className="text-xs text-muted-foreground">
                    {asset.width}×{asset.height}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[300px]">
          <div className="space-y-1 text-xs">
            <p><strong>Platform:</strong> {asset.platform}</p>
            <p><strong>ID:</strong> {asset.platform_asset_id}</p>
            <p><strong>Account:</strong> {asset.advertiser_id}</p>
            {asset.aspect_ratio && <p><strong>Aspect:</strong> {asset.aspect_ratio}</p>}
            {asset.file_size_bytes && <p><strong>Size:</strong> {formatFileSize(asset.file_size_bytes)}</p>}
            {asset.synced_at && <p><strong>Synced:</strong> {new Date(asset.synced_at).toLocaleString()}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
