// Page Assets Library - Browse organic posts from Facebook Pages / TikTok identities
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RefreshCw,
  Search,
  Image as ImageIcon,
  Video,
  Sparkles,
  ExternalLink,
  CheckCircle2,
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
  message?: string;
  caption?: string;
  thumbnailUrl?: string;
  mediaType?: 'image' | 'video' | 'carousel';
  createdTime?: string;
  permalink?: string;
  isSparkEligible?: boolean;
}

interface PageOption {
  id: string;
  name: string;
  category?: string;
}

interface IdentityOption {
  identity_id: string;
  identity_type: string;
  display_name: string;
  profile_image?: string;
  can_use_spark_ad?: boolean;
}

interface PageAssetsLibraryProps {
  platform: 'tiktok' | 'meta';
  advertiserId?: string;
  /** Pre-selected page ID from ActiPlan */
  defaultPageId?: string;
  /** Pre-selected TikTok identity ID from ActiPlan */
  defaultIdentityId?: string;
  onSelectPost?: (post: OrganicPost) => void;
  selectedPostId?: string;
  selectable?: boolean;
}

export function PageAssetsLibrary({
  platform,
  advertiserId,
  defaultPageId,
  defaultIdentityId,
  onSelectPost,
  selectedPostId,
  selectable = false,
}: PageAssetsLibraryProps) {
  const [pages, setPages] = useState<PageOption[]>([]);
  const [identities, setIdentities] = useState<IdentityOption[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>(defaultPageId || '');
  const [selectedIdentityId, setSelectedIdentityId] = useState<string>(defaultIdentityId || '');
  const [posts, setPosts] = useState<OrganicPost[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [search, setSearch] = useState('');

  // Set defaults when props change
  useEffect(() => {
    if (defaultPageId && platform === 'meta') {
      setSelectedPageId(defaultPageId);
    }
    if (defaultIdentityId && platform === 'tiktok') {
      setSelectedIdentityId(defaultIdentityId);
    }
  }, [defaultPageId, defaultIdentityId, platform]);

  // Fetch pages/identities on mount
  useEffect(() => {
    if (platform === 'meta') {
      fetchMetaPages();
    } else if (advertiserId) {
      fetchTikTokIdentities();
    }
  }, [platform, advertiserId]);

  // Fetch posts when page/identity is selected
  useEffect(() => {
    if (platform === 'meta' && selectedPageId) {
      fetchPosts();
    } else if (platform === 'tiktok' && selectedIdentityId && advertiserId) {
      fetchPosts();
    }
  }, [selectedPageId, selectedIdentityId, platform, advertiserId]);

  const fetchMetaPages = async () => {
    setIsLoadingPages(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-pages');
      if (error) throw error;
      setPages(data?.pages || []);
      // Auto-select if defaultPageId matches or select first
      const pagesData = data?.pages || [];
      if (pagesData.length > 0) {
        if (defaultPageId && pagesData.some((p: PageOption) => p.id === defaultPageId)) {
          setSelectedPageId(defaultPageId);
        } else if (!selectedPageId) {
          setSelectedPageId(pagesData[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching pages:', err);
    } finally {
      setIsLoadingPages(false);
    }
  };

  const fetchTikTokIdentities = async () => {
    if (!advertiserId) return;
    setIsLoadingPages(true);
    try {
      const { data, error } = await supabase.functions.invoke('resolve-platform-identities', {
        body: { platform: 'tiktok', advertiserId }
      });
      if (error) throw error;
      const sparkIdentities = (data?.identities || []).filter((i: IdentityOption) => i.can_use_spark_ad);
      setIdentities(sparkIdentities);
      // Auto-select if defaultIdentityId matches or select first
      if (sparkIdentities.length > 0) {
        if (defaultIdentityId && sparkIdentities.some((i: IdentityOption) => i.identity_id === defaultIdentityId)) {
          setSelectedIdentityId(defaultIdentityId);
        } else if (!selectedIdentityId) {
          setSelectedIdentityId(sparkIdentities[0].identity_id);
        }
      }
    } catch (err) {
      console.error('Error fetching identities:', err);
    } finally {
      setIsLoadingPages(false);
    }
  };

  const fetchPosts = async () => {
    setIsLoadingPosts(true);
    setPosts([]);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-organic-posts', {
        body: {
          platform,
          pageId: platform === 'meta' ? selectedPageId : undefined,
          identityId: platform === 'tiktok' ? selectedIdentityId : undefined,
          advertiserId,
        }
      });
      if (error) throw error;
      setPosts(data?.posts || []);
    } catch (err) {
      console.error('Error fetching posts:', err);
      toast.error('Failed to load posts');
    } finally {
      setIsLoadingPosts(false);
    }
  };

  // Filter posts by search
  const filteredPosts = posts.filter((post) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      post.message?.toLowerCase().includes(searchLower) ||
      post.caption?.toLowerCase().includes(searchLower) ||
      post.postId.toLowerCase().includes(searchLower)
    );
  });

  const handleSelect = (post: OrganicPost) => {
    if (selectable && onSelectPost) {
      onSelectPost(post);
    }
  };

  const platformLabel = platform === 'meta' ? 'Facebook/Instagram' : 'TikTok';
  const selectedSource = platform === 'meta' 
    ? pages.find(p => p.id === selectedPageId)
    : identities.find(i => i.identity_id === selectedIdentityId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {platformLabel} Page Assets
            <Badge variant="secondary">{posts.length} posts</Badge>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPosts}
            disabled={isLoadingPosts || (platform === 'meta' ? !selectedPageId : !selectedIdentityId)}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoadingPosts && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Source selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            {isLoadingPages ? (
              <Skeleton className="h-10 w-full" />
            ) : platform === 'meta' ? (
              <Select value={selectedPageId} onValueChange={setSelectedPageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a page..." />
                </SelectTrigger>
                <SelectContent>
                  {pages.map((page) => (
                    <SelectItem key={page.id} value={page.id}>
                      {page.name}
                      {page.category && <span className="text-muted-foreground ml-2">({page.category})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={selectedIdentityId} onValueChange={setSelectedIdentityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a TikTok account..." />
                </SelectTrigger>
                <SelectContent>
                  {identities.map((identity) => (
                    <SelectItem key={identity.identity_id} value={identity.identity_id}>
                      <div className="flex items-center gap-2">
                        {identity.profile_image && (
                          <img src={identity.profile_image} alt="" className="h-5 w-5 rounded-full" />
                        )}
                        {identity.display_name || identity.identity_id}
                        <Badge variant="outline" className="text-xs">{identity.identity_type}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search posts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Posts Grid */}
        {isLoadingPosts ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No posts found</p>
            <p className="text-sm">
              {platform === 'meta'
                ? 'Select a page to view its promotable posts'
                : 'Select a TikTok account to view authorized Spark Ad posts'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pr-4">
              {filteredPosts.map((post) => (
                <PostCard
                  key={post.id}
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

        {/* Media type badge */}
        <Badge variant="secondary" className="absolute top-1 left-1 text-xs">
          {post.mediaType === 'video' ? 'Video' : post.mediaType === 'carousel' ? 'Carousel' : 'Image'}
        </Badge>

        {/* Spark eligible badge */}
        {post.isSparkEligible && (
          <Badge className="absolute top-1 right-1 text-xs bg-purple-600">
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
      </CardContent>
    </Card>
  );
}
