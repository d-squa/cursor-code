import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Link2, Image, Video, Loader2, CheckCircle2, ExternalLink, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

interface OrganicPostSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: 'meta' | 'tiktok';
  advertiserId?: string;
  onSelect: (post: OrganicPost) => void;
}

export function OrganicPostSelector({
  open,
  onOpenChange,
  platform,
  advertiserId,
  onSelect,
}: OrganicPostSelectorProps) {
  const [activeTab, setActiveTab] = useState<'browse' | 'search'>('browse');
  const [pages, setPages] = useState<PageOption[]>([]);
  const [identities, setIdentities] = useState<IdentityOption[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [selectedIdentityId, setSelectedIdentityId] = useState<string>('');
  const [posts, setPosts] = useState<OrganicPost[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<OrganicPost | null>(null);

  // Fetch pages/identities when dialog opens
  useEffect(() => {
    if (open) {
      if (platform === 'meta') {
        fetchMetaPages();
      } else {
        fetchTikTokIdentities();
      }
    }
  }, [open, platform]);

  // Fetch posts when page/identity is selected
  useEffect(() => {
    if (platform === 'meta' && selectedPageId) {
      fetchPosts();
    } else if (platform === 'tiktok' && selectedIdentityId) {
      fetchPosts();
    }
  }, [selectedPageId, selectedIdentityId, platform]);

  const fetchMetaPages = async () => {
    setIsLoadingPages(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-pages');
      if (error) throw error;
      setPages(data?.pages || []);
      if (data?.pages?.length > 0) {
        setSelectedPageId(data.pages[0].id);
      }
    } catch (err) {
      console.error('Error fetching pages:', err);
      toast.error('Failed to load Facebook pages');
    } finally {
      setIsLoadingPages(false);
    }
  };

  const fetchTikTokIdentities = async () => {
    setIsLoadingPages(true);
    try {
      const { data, error } = await supabase.functions.invoke('resolve-platform-identities', {
        body: { platform: 'tiktok', advertiserId }
      });
      if (error) throw error;
      const sparkIdentities = (data?.identities || []).filter((i: IdentityOption) => i.can_use_spark_ad);
      setIdentities(sparkIdentities);
      if (sparkIdentities.length > 0) {
        setSelectedIdentityId(sparkIdentities[0].identity_id);
      }
    } catch (err) {
      console.error('Error fetching identities:', err);
      toast.error('Failed to load TikTok identities');
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

  const handleSearch = async () => {
    if (!searchInput.trim()) return;
    
    setIsSearching(true);
    setSearchResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-organic-posts', {
        body: {
          platform,
          postIdOrUrl: searchInput.trim(),
          advertiserId,
        }
      });
      if (error) throw error;
      if (data?.posts?.length > 0) {
        setSearchResult(data.posts[0]);
      } else {
        toast.error('Post not found. Please check the ID or URL.');
      }
    } catch (err) {
      console.error('Error searching post:', err);
      toast.error('Failed to find post');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPost = (post: OrganicPost) => {
    onSelect(post);
    onOpenChange(false);
  };

  const platformLabel = platform === 'meta' ? 'Facebook/Instagram' : 'TikTok';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Select {platformLabel} Post
          </DialogTitle>
          <DialogDescription>
            Choose an existing organic post to use as an ad
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'browse' | 'search')} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="browse" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Browse Posts
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Search by ID/URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="flex-1 flex flex-col overflow-hidden mt-4 space-y-4">
            {/* Page/Identity selector */}
            <div className="space-y-2">
              <Label>{platform === 'meta' ? 'Select Page' : 'Select TikTok Account'}</Label>
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

            {/* Posts list */}
            <ScrollArea className="flex-1 min-h-0">
              {isLoadingPosts ? (
                <div className="grid grid-cols-2 gap-3 p-1">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-40 rounded-lg" />
                  ))}
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Image className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No posts found</p>
                  <p className="text-sm mt-1">
                    {platform === 'meta' 
                      ? 'Select a page to view its promotable posts'
                      : 'Select a TikTok account to view authorized posts'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-1">
                  {posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onSelect={() => handleSelectPost(post)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="search" className="flex-1 flex flex-col mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Post ID or URL</Label>
              <div className="flex gap-2">
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={platform === 'meta' 
                    ? "e.g. 123456789 or https://facebook.com/page/posts/123..."
                    : "e.g. 7123456789 or https://tiktok.com/@user/video/123..."
                  }
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={isSearching || !searchInput.trim()}>
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {platform === 'meta' 
                  ? 'Paste a Facebook/Instagram post URL or enter the post ID directly'
                  : 'Paste a TikTok video URL or enter the video ID directly'}
              </p>
            </div>

            {searchResult && (
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Post Found
                </h4>
                <PostCard
                  post={searchResult}
                  onSelect={() => handleSelectPost(searchResult)}
                  showSelectButton
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface PostCardProps {
  post: OrganicPost;
  onSelect: () => void;
  showSelectButton?: boolean;
}

function PostCard({ post, onSelect, showSelectButton = false }: PostCardProps) {
  const caption = post.message || post.caption || '';
  const truncatedCaption = caption.length > 80 ? caption.slice(0, 80) + '...' : caption;

  return (
    <div
      className="group border rounded-lg overflow-hidden hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer"
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-muted relative">
        {post.thumbnailUrl ? (
          <img
            src={post.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {post.mediaType === 'video' ? (
              <Video className="h-8 w-8 text-muted-foreground" />
            ) : (
              <Image className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
        )}
        
        {/* Media type badge */}
        <Badge
          variant="secondary"
          className="absolute top-2 left-2 text-xs"
        >
          {post.mediaType === 'video' ? 'Video' : post.mediaType === 'carousel' ? 'Carousel' : 'Image'}
        </Badge>

        {/* Spark eligible badge for TikTok */}
        {post.isSparkEligible && (
          <Badge className="absolute top-2 right-2 text-xs bg-purple-600">
            <Sparkles className="h-3 w-3 mr-1" />
            Spark
          </Badge>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button size="sm" variant="secondary">
            Select Post
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-1">
        <p className="text-sm line-clamp-2">
          {truncatedCaption || <span className="text-muted-foreground italic">No caption</span>}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>ID: {post.postId.slice(0, 12)}...</span>
          {post.createdTime && (
            <span>{format(new Date(post.createdTime), 'MMM d, yyyy')}</span>
          )}
        </div>
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            View original <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {showSelectButton && (
        <div className="p-3 pt-0">
          <Button className="w-full" size="sm" onClick={onSelect}>
            Use This Post
          </Button>
        </div>
      )}
    </div>
  );
}
