import type { DeliveryBucket } from '@/utils/assetCustomizationEngine';

export const ASSET_CUSTOMIZATION_VISIBLE_STATUSES = ['draft', 'compiled', 'pushed', 'error'];
export const ASSET_CUSTOMIZATION_PUSHABLE_STATUSES = ['draft', 'compiled'];

const DELIVERY_BUCKET_DB_MAP: Record<DeliveryBucket, string> = {
  square: 'square',
  fullscreen_vertical: 'vertical',
  horizontal: 'landscape',
  vertical: 'vertical',
  other: 'other',
};

export function toAssetCustomizationMemberBucket(bucket: DeliveryBucket | string | null | undefined) {
  if (!bucket) return 'other';

  if (bucket in DELIVERY_BUCKET_DB_MAP) {
    return DELIVERY_BUCKET_DB_MAP[bucket as DeliveryBucket];
  }

  return 'other';
}