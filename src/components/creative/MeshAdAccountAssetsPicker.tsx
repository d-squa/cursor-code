// Ad Account Assets Picker for Mesh Step 2
// Wraps UnifiedAssetsLibrary with cumulative selection wiring

import { useMemo } from 'react';
import { UnifiedAssetsLibrary, PlatformAsset } from '@/components/creative/UnifiedAssetsLibrary';
import type { SelectedAsset } from '@/hooks/useCreativeMeshProgress';

interface AdAccountInfo {
  platform: 'meta' | 'tiktok' | 'google';
  accountId: string;
}

interface MeshAdAccountAssetsPickerProps {
  adAccounts: AdAccountInfo[];
  selectedAssets: SelectedAsset[];
  onAddAsset: (asset: SelectedAsset) => void;
  onRemoveAsset: (assetId: string) => void;
}

export function MeshAdAccountAssetsPicker({
  adAccounts,
  selectedAssets,
  onAddAsset,
  onRemoveAsset,
}: MeshAdAccountAssetsPickerProps) {
  // Convert SelectedAsset[] to PlatformAsset[] for external selection
  const externalSelection = useMemo<PlatformAsset[]>(
    () =>
      selectedAssets
        .filter((a) => a.source === 'ad_account_assets' && !!a.platformAssetId)
        .map((a) => ({
          id: a.id,
          platform: a.platform as 'tiktok' | 'meta',
          platform_asset_id: a.platformAssetId || '',
          advertiser_id: '',
          asset_type: a.assetType as 'video' | 'image',
          asset_name: a.name || null,
          preview_url: a.thumbnailUrl || null,
          thumbnail_url: a.thumbnailUrl || null,
          width: null,
          height: null,
          aspect_ratio: null,
          duration_seconds: null,
          file_size_bytes: null,
          approval_status: null,
          is_usable: true,
          spark_eligible: null,
          synced_at: null,
          created_at: null,
        })),
    [selectedAssets]
  );

  const handleSelectionChange = (assets: PlatformAsset[]) => {
    const nextAssetIds = new Set(assets.map((a) => a.id));

    // Remove deselected
    for (const asset of selectedAssets) {
      if (asset.source === 'ad_account_assets' && !nextAssetIds.has(asset.id)) {
        onRemoveAsset(asset.id);
      }
    }

    // Add newly selected
    for (const platformAsset of assets) {
      const exists = selectedAssets.some((a) => a.id === platformAsset.id);
      if (exists) continue;

      onAddAsset({
        id: platformAsset.id,
        source: 'ad_account_assets',
        platform: platformAsset.platform,
        assetType: platformAsset.asset_type,
        thumbnailUrl: platformAsset.thumbnail_url || platformAsset.preview_url || undefined,
        name: platformAsset.asset_name || undefined,
        platformAssetId: platformAsset.platform_asset_id,
      });
    }
  };

  return (
    <UnifiedAssetsLibrary
      adAccounts={adAccounts}
      multiSelect
      externalSelection={externalSelection}
      onSelectionChange={handleSelectionChange}
    />
  );
}
