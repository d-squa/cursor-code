// Meta Placement Presets - predefined placement configurations for common ad format scenarios

export type MetaPlacementPreset = 
  | 'automatic' 
  | 'stories' 
  | 'in_feed' 
  | 'in_feed_carousel' 
  | 'story_carousel' 
  | 'custom';

export interface PlacementPresetConfig {
  id: MetaPlacementPreset;
  label: string;
  description: string;
  icon: string; // Lucide icon name
  publisherPlatforms: string[];
  positions: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  };
  // For taxonomy and creative matching
  taxonomyHint?: string;
  isCarousel?: boolean;
  isStory?: boolean;
}

// All story placements across publishers
const STORY_POSITIONS = {
  facebook: ['story'],
  instagram: ['story'],
  messenger: ['story'],
};

// All non-story placements across publishers (in-feed)
const FEED_POSITIONS = {
  facebook: ['feed', 'instant_article', 'instream_video', 'marketplace', 'right_column', 'search', 'video_feeds'],
  instagram: ['stream', 'explore', 'explore_home', 'reels'],
  audience_network: ['native_banner_interstitial', 'instream_video', 'rewarded_video'],
  messenger: ['messenger_home', 'sponsored_messages'],
  threads: ['threads'],
};

// All positions for automatic placements
const ALL_POSITIONS = {
  facebook: ['feed', 'instant_article', 'instream_video', 'marketplace', 'right_column', 'search', 'video_feeds', 'story'],
  instagram: ['stream', 'story', 'explore', 'explore_home', 'reels'],
  audience_network: ['native_banner_interstitial', 'instream_video', 'rewarded_video'],
  messenger: ['messenger_home', 'sponsored_messages', 'story'],
  threads: ['threads'],
};

export const META_PLACEMENT_PRESETS: PlacementPresetConfig[] = [
  {
    id: 'automatic',
    label: 'Automatic',
    description: 'All placements - let Meta optimize delivery',
    icon: 'Sparkles',
    publisherPlatforms: ['facebook', 'instagram', 'audience_network', 'messenger', 'threads'],
    positions: ALL_POSITIONS,
    taxonomyHint: 'AUTO',
  },
  {
    id: 'stories',
    label: 'Stories',
    description: 'Stories across all platforms',
    icon: 'Smartphone',
    publisherPlatforms: ['facebook', 'instagram', 'messenger'],
    positions: STORY_POSITIONS,
    taxonomyHint: 'STORY',
    isStory: true,
  },
  {
    id: 'in_feed',
    label: 'In-Feed',
    description: 'Feed placements excluding stories',
    icon: 'LayoutList',
    publisherPlatforms: ['facebook', 'instagram', 'audience_network', 'messenger', 'threads'],
    positions: FEED_POSITIONS,
    taxonomyHint: 'FEED',
  },
  {
    id: 'in_feed_carousel',
    label: 'Carousel (Feed)',
    description: 'In-feed carousel ads',
    icon: 'GalleryHorizontal',
    publisherPlatforms: ['facebook', 'instagram', 'audience_network', 'messenger', 'threads'],
    positions: FEED_POSITIONS,
    taxonomyHint: 'FEED_CAR',
    isCarousel: true,
  },
  {
    id: 'story_carousel',
    label: 'Carousel (Stories)',
    description: 'Story carousel ads',
    icon: 'GalleryVertical',
    publisherPlatforms: ['facebook', 'instagram', 'messenger'],
    positions: STORY_POSITIONS,
    taxonomyHint: 'STORY_CAR',
    isCarousel: true,
    isStory: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Manually select placements',
    icon: 'Settings2',
    publisherPlatforms: [],
    positions: {},
    taxonomyHint: 'CUSTOM',
  },
];

// Helper to get preset config by ID
export function getPlacementPreset(presetId: MetaPlacementPreset): PlacementPresetConfig | undefined {
  return META_PLACEMENT_PRESETS.find(p => p.id === presetId);
}

// Helper to detect current preset from positions
export function detectPlacementPreset(
  publisherPlatforms: string[],
  positions: Record<string, string[]>,
  advantagePlusPlacements?: boolean
): MetaPlacementPreset {
  // If Advantage+ is enabled, it's automatic
  if (advantagePlusPlacements === true) {
    return 'automatic';
  }
  
  // If no publishers selected, it's custom
  if (!publisherPlatforms || publisherPlatforms.length === 0) {
    return 'custom';
  }
  
  // Check if all positions match story positions
  const hasOnlyStories = publisherPlatforms.every(pub => {
    const pubPositions = positions[pub] || [];
    const storyPos = STORY_POSITIONS[pub as keyof typeof STORY_POSITIONS];
    if (!storyPos) return pubPositions.length === 0;
    return pubPositions.length === storyPos.length && 
           pubPositions.every(p => storyPos.includes(p));
  });
  
  // Check if all positions match feed positions (no stories)
  const hasOnlyFeed = publisherPlatforms.every(pub => {
    const pubPositions = positions[pub] || [];
    const feedPos = FEED_POSITIONS[pub as keyof typeof FEED_POSITIONS];
    if (!feedPos) return pubPositions.length === 0;
    return pubPositions.every(p => feedPos.includes(p)) && 
           !pubPositions.includes('story');
  });
  
  if (hasOnlyStories && publisherPlatforms.some(p => 
    ['facebook', 'instagram', 'messenger'].includes(p)
  )) {
    return 'stories';
  }
  
  if (hasOnlyFeed) {
    return 'in_feed';
  }
  
  return 'custom';
}

// Apply a preset to get publishers and positions
export function applyPlacementPreset(presetId: MetaPlacementPreset): {
  publisherPlatforms: string[];
  positions: Record<string, string[]>;
  advantagePlusPlacements: boolean;
} {
  const preset = getPlacementPreset(presetId);
  
  if (!preset || presetId === 'custom') {
    return {
      publisherPlatforms: ['facebook', 'instagram', 'audience_network', 'messenger', 'threads'],
      positions: ALL_POSITIONS,
      advantagePlusPlacements: false,
    };
  }
  
  if (presetId === 'automatic') {
    return {
      publisherPlatforms: preset.publisherPlatforms,
      positions: preset.positions,
      advantagePlusPlacements: true,
    };
  }
  
  return {
    publisherPlatforms: preset.publisherPlatforms,
    positions: preset.positions,
    advantagePlusPlacements: false,
  };
}
