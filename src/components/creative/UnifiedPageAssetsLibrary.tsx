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
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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
}

export function UnifiedPageAssetsLibrary({
  pageConfigs,
  onSelectPost,
  selectedPostId,
  selectable = false,
}: UnifiedPageAssetsLibraryProps) {
  const [posts, setPosts] = useState<OrganicPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'meta' | 'tiktok'>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video' | 'carousel'>('all');

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
    
    for (const config of pageConfigs) {
      try {
        const { data, error } = await supabase.functions.invoke('fetch-organic-posts', {
          body: {
            platform: config.platform,
            pageId: config.platform === 'meta' ? config.pageId : undefined,
            identityId: config.platform === 'tiktok' ? config.identityId : undefined,
            advertiserId: config.advertiserId,
          }
        });
        
        if (!error && data?.posts) {
          // Add page name to each post for identification
          const postsWithSource = data.posts.map((p: OrganicPost) => ({
            ...p,
            pageName: config.pageName || (config.platform === 'meta' ? config.pageId : config.identityId),
          }));
          allPosts.push(...postsWithSource);
        }
      } catch (err) {
        console.error(`Error fetching posts for ${config.platform}:`, err);
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
    }
  };

  // Fetch on mount and when configs change
  useEffect(() => {
    if (pageConfigs.length > 0) {
      fetchAllPosts();
    }
  }, [JSON.stringify(pageConfigs)]);

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

        {/* Posts Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No posts found</p>
            <p className="text-sm">Organic posts from your pages will appear here</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pr-4">
              {filteredPosts.map((post, index) => (
                <PostCard
                  key={`${post.postId}-${index}`}
                  post={post}
                  isSelected={selectedPostId === post.postId}
                  onSelect={selectable ? () => handleSelect(post) : undefined}
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
