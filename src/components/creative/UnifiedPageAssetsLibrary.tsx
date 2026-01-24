// Unified Page Assets Library - Displays organic posts from all connected pages/identities
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  RefreshCw,
  Search,
  Image as ImageIcon,
  Video,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  FileImage,
  Wand2,
  X,
  Link2,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';

interface OrganicPost {
  id: string;
  platform: 'meta' | 'tiktok';
  postId: string;
  pageId?: string;
  identityId?: string;
  pageName?: string;
  message?: string;
  caption?: string;
  thumbnailUrl?: string;
  mediaType?: 'image' | 'video' | 'carousel';
  createdTime?: string;
  permalink?: string;
  isSparkEligible?: boolean;
}

interface PageConfig {
  platform: 'meta' | 'tiktok';
  pageId?: string;
  identityId?: string;
  advertiserId?: string;
  pageName?: string;
}

interface UnifiedPageAssetsLibraryProps {
  pageConfigs: PageConfig[];
  onSelectPost?: (post: OrganicPost) => void;
  selectedPostId?: string;
  selectable?: boolean;
  /** Enable multi-select mode with auto-mesh capability */
  multiSelect?: boolean;
  /** Called when user wants to mesh selected posts */
  onMeshSelected?: (posts: OrganicPost[]) => void;
  /** Called whenever selection changes (for cumulative selection across tabs) */
  onSelectionChange?: (posts: OrganicPost[]) => void;
  /** Externally controlled selection (for cumulative selection persistence) */
  externalSelection?: OrganicPost[];
}

export function UnifiedPageAssetsLibrary({
  pageConfigs,
  onSelectPost,
  selectedPostId,
  selectable = false,
  multiSelect = false,
  onMeshSelected,
  onSelectionChange,
  externalSelection,
}: UnifiedPageAssetsLibraryProps) {
  const [posts, setPosts] = useState<OrganicPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'meta' | 'tiktok'>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video' | 'carousel'>('all');
  
  // Import by URL state
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  
  // Use external selection if provided, otherwise manage locally
  const externalSelectionIds = useMemo(() => 
    new Set(externalSelection?.map(p => p.postId) || []),
    [externalSelection]
  );
  const [internalSelectedPosts, setInternalSelectedPosts] = useState<Set<string>>(new Set());
  
  // Use external selection if provided
  const selectedPosts = externalSelection ? externalSelectionIds : internalSelectedPosts;
  const setSelectedPosts = externalSelection ? undefined : setInternalSelectedPosts;

  // Toggle post selection in multi-select mode
  const togglePostSelection = (postId: string) => {
    if (externalSelection && onSelectionChange) {
      // External mode: compute new selection and notify parent
      const isCurrentlySelected = externalSelectionIds.has(postId);
      if (isCurrentlySelected) {
        // Remove from selection
        const newSelection = externalSelection.filter(p => p.postId !== postId);
        onSelectionChange(newSelection);
      } else {
        // Add to selection - find the post in loaded data
        const postToAdd = posts.find(p => p.postId === postId);
        if (postToAdd) {
          onSelectionChange([...externalSelection, postToAdd]);
        }
      }
    } else if (setSelectedPosts) {
      // Internal mode
      setSelectedPosts(prev => {
        const next = new Set(prev);
        if (next.has(postId)) {
          next.delete(postId);
        } else {
          next.add(postId);
        }
        if (onSelectionChange) {
          const selectedObjects = posts.filter(p => next.has(p.postId));
          setTimeout(() => onSelectionChange(selectedObjects), 0);
        }
        return next;
      });
    }
  };

  // Get selected post objects
  const selectedPostObjects = useMemo(() => {
    return posts.filter(p => selectedPosts.has(p.postId));
  }, [posts, selectedPosts]);

  // Clear selection
  const clearSelection = () => {
    if (externalSelection && onSelectionChange) {
      onSelectionChange([]);
    } else if (setSelectedPosts) {
      setSelectedPosts(new Set());
      onSelectionChange?.([]);
    }
  };

  // Handle mesh action
  const handleMeshSelected = () => {
    if (onMeshSelected && selectedPostObjects.length > 0) {
      onMeshSelected(selectedPostObjects);
      clearSelection();
    }
  };

  // Get unique platforms from configs
  const availablePlatforms = useMemo(() => {
    const platforms = new Set(pageConfigs.map(c => c.platform));
    return Array.from(platforms);
  }, [pageConfigs]);

  // Fetch posts from all configured pages/identities
  const fetchAllPosts = async () => {
    if (pageConfigs.length === 0) return;
    
    setIsLoading(true);
    setPosts([]);
    
    const allPosts: OrganicPost[] = [];
    let fetchErrors: string[] = [];
    
    console.log('[UnifiedPageAssetsLibrary] Fetching posts from configs:', pageConfigs);
    
    for (const config of pageConfigs) {
      try {
        console.log('[UnifiedPageAssetsLibrary] Fetching for config:', config);
        const { data, error } = await supabase.functions.invoke('fetch-organic-posts', {
          body: {
            platform: config.platform,
            pageId: config.platform === 'meta' ? config.pageId : undefined,
            identityId: config.platform === 'tiktok' ? config.identityId : undefined,
            advertiserId: config.advertiserId,
          }
        });
        
        console.log('[UnifiedPageAssetsLibrary] Response:', { data, error, postsCount: data?.posts?.length || 0 });
        
        if (error) {
          console.error(`[UnifiedPageAssetsLibrary] Error fetching posts for ${config.platform}:`, error);
          fetchErrors.push(`${config.platform}: ${error.message || 'Unknown error'}`);
          continue;
        }
        
        if (data?.error) {
          console.warn(`[UnifiedPageAssetsLibrary] API returned error for ${config.platform}:`, data.error);
          fetchErrors.push(`${config.platform}: ${data.error}`);
          continue;
        }
        
        if (data?.posts && Array.isArray(data.posts)) {
          // Add page name to each post for identification
          const postsWithSource = data.posts.map((p: OrganicPost) => ({
            ...p,
            pageName: config.pageName || (config.platform === 'meta' ? config.pageId : config.identityId),
          }));
          allPosts.push(...postsWithSource);
        }
      } catch (err) {
        console.error(`[UnifiedPageAssetsLibrary] Exception fetching posts for ${config.platform}:`, err);
        fetchErrors.push(`${config.platform}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    
    // Sort by created time
    allPosts.sort((a, b) => {
      const dateA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
      const dateB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
      return dateB - dateA;
    });
    
    setPosts(allPosts);
    setIsLoading(false);
    
    if (allPosts.length > 0) {
      toast.success(`Loaded ${allPosts.length} posts from ${pageConfigs.length} source(s)`);
    } else if (fetchErrors.length > 0) {
      toast.error(`Failed to load posts: ${fetchErrors[0]}`);
    }
  };

  // Fetch on mount and when configs change
  useEffect(() => {
    if (pageConfigs.length > 0) {
      fetchAllPosts();
    }
  }, [JSON.stringify(pageConfigs)]);

  // Import a single post by URL/ID (fallback when listing API doesn't work)
  const handleImportByUrl = async () => {
    if (!importUrl.trim()) return;
    
    // Extract video ID from URL or use as-is if numeric
    const videoIdMatch = importUrl.match(/video\/(\d+)/) || importUrl.match(/^(\d+)$/);
    if (!videoIdMatch) {
      toast.error('Please enter a valid TikTok video URL or ID');
      return;
    }
    const videoId = videoIdMatch[1];
    
    // Find a TikTok config to use for the lookup
    const tiktokConfig = pageConfigs.find(c => c.platform === 'tiktok' && c.advertiserId);
    if (!tiktokConfig) {
      toast.error('No TikTok advertiser configured');
      return;
    }
    
    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-organic-posts', {
        body: {
          platform: 'tiktok',
          advertiserId: tiktokConfig.advertiserId,
          identityId: tiktokConfig.identityId,
          postIdOrUrl: videoId,
        }
      });
      
      if (error) throw error;
      
      if (data?.posts?.length > 0) {
        const newPost: OrganicPost = {
          ...data.posts[0],
          pageName: tiktokConfig.pageName || tiktokConfig.identityId,
        };
        // Add to existing posts (deduplicate)
        setPosts(prev => {
          const exists = prev.some(p => p.postId === newPost.postId);
          if (exists) {
            toast.info('This video is already in the list');
            return prev;
          }
          toast.success('Video imported successfully');
          return [newPost, ...prev];
        });
        setImportUrl('');
      } else {
        toast.error('Video not found or not accessible');
      }
    } catch (err) {
      console.error('[UnifiedPageAssetsLibrary] Import error:', err);
      toast.error('Failed to import video');
    } finally {
      setIsImporting(false);
    }
  };

  // Filter posts
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch = 
          post.message?.toLowerCase().includes(searchLower) ||
          post.caption?.toLowerCase().includes(searchLower) ||
          post.postId.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      if (platformFilter !== 'all' && post.platform !== platformFilter) {
        return false;
      }
      if (mediaTypeFilter !== 'all' && post.mediaType !== mediaTypeFilter) {
        return false;
      }
      return true;
    });
  }, [posts, search, platformFilter, mediaTypeFilter]);

  const handleSelect = (post: OrganicPost) => {
    if (selectable && onSelectPost) {
      onSelectPost(post);
    }
  };

  if (pageConfigs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Select an ActiPlan to load page/identity</p>
        <p className="text-xs mt-1">Browse organic posts from Facebook Pages or TikTok accounts</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            Page Assets
            <Badge variant="secondary">{posts.length} posts</Badge>
            {availablePlatforms.map(p => (
              <Badge key={p} variant="outline" className="text-xs capitalize">
                {p === 'meta' ? 'Facebook/Instagram' : 'TikTok'}
              </Badge>
            ))}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAllPosts}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Showing organic posts from {pageConfigs.length} page(s)/identity(s)
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search posts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {availablePlatforms.length > 1 && (
            <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as any)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {availablePlatforms.includes('meta') && <SelectItem value="meta">Facebook/IG</SelectItem>}
                {availablePlatforms.includes('tiktok') && <SelectItem value="tiktok">TikTok</SelectItem>}
              </SelectContent>
            </Select>
          )}

          <Select value={mediaTypeFilter} onValueChange={(v) => setMediaTypeFilter(v as any)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="video">Videos</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="carousel">Carousels</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Multi-select action bar - only show if not using parent-controlled selection */}
        {multiSelect && selectedPosts.size > 0 && !onSelectionChange && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selectedPosts.size} selected</Badge>
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

        {/* Posts Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground space-y-4">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No posts found</p>
            <p className="text-sm">Organic posts from your pages will appear here</p>
            
            {/* Import by URL fallback for TikTok */}
            {pageConfigs.some(c => c.platform === 'tiktok') && (
              <div className="mt-6 max-w-md mx-auto">
                <p className="text-xs text-muted-foreground mb-2">
                  Can't see your videos? Import by URL instead:
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Paste TikTok video URL or ID..."
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      className="pl-9"
                      onKeyDown={(e) => e.key === 'Enter' && handleImportByUrl()}
                    />
                  </div>
                  <Button
                    onClick={handleImportByUrl}
                    disabled={isImporting || !importUrl.trim()}
                    size="sm"
                  >
                    {isImporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Import'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pr-4">
              {filteredPosts.map((post, index) => (
                <PostCard
                  key={`${post.postId}-${index}`}
                  post={post}
                  isSelected={multiSelect ? selectedPosts.has(post.postId) : selectedPostId === post.postId}
                  onSelect={
                    multiSelect 
                      ? () => togglePostSelection(post.postId)
                      : selectable 
                        ? () => handleSelect(post)
                        : undefined
                  }
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function PostCard({
  post,
  isSelected,
  onSelect,
}: {
  post: OrganicPost;
  isSelected: boolean;
  onSelect?: () => void;
}) {
  const caption = post.message || post.caption || '';
  const truncatedCaption = caption.length > 60 ? caption.slice(0, 60) + '...' : caption;
  const isVideo = post.mediaType === 'video';

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all hover:shadow-lg',
        onSelect && 'cursor-pointer',
        isSelected && 'ring-2 ring-primary'
      )}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted">
        {post.thumbnailUrl ? (
          <img
            src={post.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isVideo ? (
              <Video className="h-8 w-8 text-muted-foreground" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Platform badge */}
        <Badge 
          variant="secondary" 
          className={cn(
            "absolute top-1 left-1 text-xs",
            post.platform === 'tiktok' ? 'bg-black text-white' : 'bg-blue-600 text-white'
          )}
        >
          {post.platform === 'meta' ? 'FB/IG' : 'TikTok'}
        </Badge>

        {/* Media type badge */}
        <Badge variant="secondary" className="absolute top-1 right-1 text-xs bg-black/60 text-white">
          {post.mediaType === 'video' ? 'Video' : post.mediaType === 'carousel' ? 'Carousel' : 'Image'}
        </Badge>

        {/* Spark eligible badge */}
        {post.isSparkEligible && (
          <Badge className="absolute bottom-1 left-1 text-xs bg-purple-600">
            <Sparkles className="h-3 w-3" />
          </Badge>
        )}

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute bottom-1 right-1">
            <CheckCircle2 className="h-5 w-5 text-primary fill-primary-foreground" />
          </div>
        )}
      </div>

      <CardContent className="p-2">
        <p className="text-xs line-clamp-2" title={caption}>
          {truncatedCaption || <span className="text-muted-foreground italic">No caption</span>}
        </p>
        <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
          <span className="truncate max-w-[80px]" title={post.pageName}>
            {post.pageName?.slice(0, 10) || ''}
          </span>
          <div className="flex items-center gap-1">
            {post.createdTime && (
              <span>{format(new Date(post.createdTime), 'MMM d')}</span>
            )}
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
