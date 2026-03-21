import { useMemo } from 'react';
import { UnifiedPageAssetsLibrary } from '@/components/creative/UnifiedPageAssetsLibrary';
import type { SelectedAsset } from '@/hooks/useCreativeMeshProgress';

type OrganicPost = {
  platform: 'meta' | 'tiktok' | 'google';
  postId: string;
  thumbnailUrl?: string;
  mediaType?: 'image' | 'video' | 'carousel';
  message?: string;
  caption?: string;
  createdTime?: string;
  permalink?: string;
  isSparkEligible?: boolean;
  width?: number;
  height?: number;
};

type PageConfig = {
  platform: 'meta' | 'tiktok' | 'google';
  pageId?: string;
  identityId?: string;
  advertiserId?: string;
  pageName?: string;
};

export function MeshPageAssetsPicker({
  platform,
  pageConfigs,
  selectedAssets,
  onAddAsset,
  onRemoveAsset,
}: {
  platform: 'meta' | 'tiktok' | 'google';
  pageConfigs: PageConfig[];
  selectedAssets: SelectedAsset[];
  onAddAsset: (asset: SelectedAsset) => void;
  onRemoveAsset: (assetId: string) => void;
}) {
  const externalSelection = useMemo<OrganicPost[]>(
    () =>
      selectedAssets
        .filter((a) => !!a.postId)
        .map((a) => ({
          platform,
          postId: a.postId!,
        })),
    [selectedAssets, platform]
  );

  const handleSelectionChange = (posts: OrganicPost[]) => {
    const nextPostIds = new Set(posts.map((p) => p.postId));

    // Remove deselected
    for (const asset of selectedAssets) {
      if (asset.postId && !nextPostIds.has(asset.postId)) {
        onRemoveAsset(asset.id);
      }
    }

    // Add newly selected
    for (const post of posts) {
      const exists = selectedAssets.some((a) => a.postId === post.postId);
      if (exists) continue;

      const mediaType = post.mediaType;
      const assetType: 'image' | 'video' = mediaType === 'video' ? 'video' : 'image';
      const name = post.message || post.caption || post.postId;

      // Determine source network from post data
      const sourceNetwork = (post as any).sourceNetwork as 'facebook' | 'instagram' | undefined;

      onAddAsset({
        id: `page:${post.platform}:${post.postId}`,
        source: 'page_assets',
        platform: post.platform,
        assetType,
        thumbnailUrl: post.thumbnailUrl,
        name,
        postId: post.postId,
        // Pass source network for matching algorithm
        sourceNetwork,
      } as any);
    }
  };

  return (
    <UnifiedPageAssetsLibrary
      pageConfigs={pageConfigs}
      multiSelect
      externalSelection={externalSelection as any}
      onSelectionChange={handleSelectionChange as any}
    />
  );
}
