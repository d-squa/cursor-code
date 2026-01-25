// Platform Asset Library - View synced creative library assets from TikTok/Meta
import { useState, useCallback, useEffect } from 'react';
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
  XCircle,
  Clock,
  AlertTriangle,
  Sparkles,
  Filter,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface PlatformAsset {
  id: string;
  platform: 'tiktok' | 'meta';
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

interface PlatformAssetLibraryProps {
  platform: 'tiktok' | 'meta';
  advertiserId: string;
  onSelectAsset?: (asset: PlatformAsset) => void;
  selectedAssetId?: string;
  selectable?: boolean;
}

const approvalStatusColors: Record<string, string> = {
  SUCCESS: 'bg-green-500/20 text-green-700 dark:text-green-400',
  APPROVED: 'bg-green-500/20 text-green-700 dark:text-green-400',
  PENDING: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  PROCESSING: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  REJECTED: 'bg-destructive/20 text-destructive',
  FAILED: 'bg-destructive/20 text-destructive',
};

export function PlatformAssetLibrary({
  platform,
  advertiserId,
  onSelectAsset,
  selectedAssetId,
  selectable = false,
}: PlatformAssetLibraryProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState<'all' | 'video' | 'image'>('all');
  const [onlyUsable, setOnlyUsable] = useState(true);

  // Fetch account name for display
  const { data: accountName } = useQuery({
    queryKey: ['account-name', platform, advertiserId],
    queryFn: async (): Promise<string | null> => {
      if (platform === 'tiktok') {
        const { data } = await supabase
          .from('tiktok_ad_accounts')
          .select('account_name')
          .eq('advertiser_id', advertiserId)
          .maybeSingle();
        return data?.account_name || null;
      } else {
        const { data } = await supabase
          .from('meta_ad_accounts')
          .select('account_name')
          .eq('account_id', advertiserId)
          .maybeSingle();
        return data?.account_name || null;
      }
    },
    enabled: !!advertiserId,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // Fetch assets from creative_library_assets table
  const { data: assets, isLoading, refetch } = useQuery({
    queryKey: ['platform-assets', platform, advertiserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creative_library_assets')
        .select('*')
        .eq('platform', platform)
        .eq('advertiser_id', advertiserId)
        .order('synced_at', { ascending: false });

      if (error) throw error;
      return data as PlatformAsset[];
    },
    enabled: !!advertiserId,
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-creative-library', {
        body: { platform, advertiserId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Sync failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['platform-assets', platform, advertiserId] });
      toast.success(`Synced ${data.syncedCount || 0} assets from ${platform}`);
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error.message}`);
    },
  });

  // Filter assets
  const filteredAssets = (assets || []).filter((asset) => {
    if (search && !asset.asset_name?.toLowerCase().includes(search.toLowerCase())) {
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {platform === 'tiktok' ? 'TikTok' : 'Meta'} Creative Library
            <Badge variant="secondary">{assets?.length || 0} assets</Badge>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', syncMutation.isPending && 'animate-spin')} />
            Sync
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Showing assets from {accountName || `account ${advertiserId}`}
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

        {/* Asset Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No assets found</p>
            <p className="text-sm">Sync your {platform} Creative Library to see assets</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pr-4">
              {filteredAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  isSelected={selectedAssetId === asset.id}
                  onSelect={selectable ? () => onSelectAsset?.(asset) : undefined}
                  formatDuration={formatDuration}
                  formatFileSize={formatFileSize}
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
}: {
  asset: PlatformAsset;
  isSelected: boolean;
  onSelect?: () => void;
  formatDuration: (s: number | null) => string | null;
  formatFileSize: (b: number | null) => string | null;
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
              'overflow-hidden cursor-pointer transition-all hover:shadow-lg',
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

              {/* Spark eligible badge */}
              {asset.spark_eligible && (
                <div className="absolute top-1 left-1">
                  <Badge variant="secondary" className="bg-purple-500/20 text-purple-700 text-xs gap-1">
                    <Sparkles className="h-3 w-3" />
                    Spark
                  </Badge>
                </div>
              )}

              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-1 right-1">
                  <CheckCircle className="h-5 w-5 text-primary fill-primary-foreground" />
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
            <p><strong>ID:</strong> {asset.platform_asset_id}</p>
            {asset.aspect_ratio && <p><strong>Aspect:</strong> {asset.aspect_ratio}</p>}
            {asset.file_size_bytes && <p><strong>Size:</strong> {formatFileSize(asset.file_size_bytes)}</p>}
            {asset.synced_at && <p><strong>Synced:</strong> {new Date(asset.synced_at).toLocaleString()}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
