// Auto-detect targeting type based on user's targeting selections

interface TargetingItem {
  id: string;
  name: string;
  type?: string;
  category?: string;
  platforms?: string[];
}

interface SelectedAudience {
  id: string;
  name: string;
  type: string;
  source: string;
  subtype?: string;
}

interface TargetingConfigShape {
  // Old format (TargetingConfig)
  selectedItems?: TargetingItem[];
  targetingExpansion?: boolean;
  customAudiences?: string[];
  lookalikeAudiences?: string[];
  retargetingAudiences?: string[];
  websiteAudience?: string; // Retargeting audiences as comma-separated string
  lookalikeAudience?: string; // Lookalike audiences as comma-separated string
  interests?: string; // Interest targeting as comma-separated string
  
  // New format (BasicTargetingConfig)
  metaInterests?: TargetingItem[];
  metaBehaviors?: TargetingItem[];
  metaDemographics?: TargetingItem[];
  tiktokInterests?: TargetingItem[];
  tiktokBehaviors?: TargetingItem[];
  tiktokDemographics?: TargetingItem[];
  
  // Audience expansion toggles
  useRetargeting?: boolean;
  useLookalike?: boolean;
  useCustomAudience?: boolean;
  expandToNew?: boolean;
  
  // Direct arrays for custom/lookalike/retargeting audience IDs
  retargetingAudienceIds?: string[];
  lookalikeAudienceIds?: string[];
  customAudienceIds?: string[];
}

/**
 * Auto-detects the targeting type based on the user's targeting selections
 * Returns the appropriate taxonomy code
 * 
 * Logic (with audiences from PhaseAudienceSelector):
 * - If useBroadTargeting is ON -> BRD
 * - If multiple different audience types selected -> MIX
 * - If retargeting audiences selected -> RTG
 * - If lookalike/similar audiences selected -> EXP
 * - If interests/behaviors/demographics selected (native) -> NTV
 * - If no targeting at all -> NTV (inherited from preset)
 */
export function detectTargetingType(targeting?: unknown, audiences?: SelectedAudience[]): string {
  // Check if broad targeting is explicitly enabled
  if (targeting && typeof targeting === 'object' && (targeting as any).useBroadTargeting === true) {
    return 'BRD';
  }
  
  // Check audiences from PhaseAudienceSelector
  const hasRetargetingAudience = audiences?.some(a => 
    a.type === 'retargeting' || 
    a.source === 'retargeting' ||
    a.subtype?.toLowerCase().includes('custom') ||
    a.subtype?.toLowerCase().includes('website') ||
    a.subtype?.toLowerCase().includes('engagement') ||
    a.subtype?.toLowerCase().includes('video') ||
    a.subtype?.toLowerCase().includes('app')
  ) || false;
  
  const hasLookalikeAudience = audiences?.some(a => 
    a.type === 'lookalike' || 
    a.type === 'similar' ||
    a.source === 'lookalike' ||
    a.subtype?.toLowerCase().includes('lookalike') ||
    a.subtype?.toLowerCase().includes('similar')
  ) || false;
  
  // Check for MIX - multiple different types selected
  if (hasRetargetingAudience && hasLookalikeAudience) {
    return 'MIX';
  }
  
  // Single audience type
  if (hasRetargetingAudience) {
    return 'RTG';
  }
  
  if (hasLookalikeAudience) {
    return 'EXP';
  }
  
  // If no audiences, check the targeting config
  if (!targeting || typeof targeting !== 'object') return 'NTV';
  
  const config = targeting as TargetingConfigShape;

  // Check for retargeting audiences in config
  const hasRetargeting = 
    (config.retargetingAudiences && config.retargetingAudiences.length > 0) ||
    (config.retargetingAudienceIds && config.retargetingAudienceIds.length > 0) ||
    (config.websiteAudience && config.websiteAudience.trim().length > 0) ||
    config.useRetargeting === true;
  
  // Check for lookalike audiences in config
  const hasLookalike = 
    (config.lookalikeAudiences && config.lookalikeAudiences.length > 0) ||
    (config.lookalikeAudienceIds && config.lookalikeAudienceIds.length > 0) ||
    (config.lookalikeAudience && config.lookalikeAudience.trim().length > 0) ||
    config.useLookalike === true;

  // Check for custom audiences
  const hasCustomAudience = 
    (config.customAudiences && config.customAudiences.length > 0) ||
    (config.customAudienceIds && config.customAudienceIds.length > 0) ||
    config.useCustomAudience === true;

  // If both retargeting/custom AND lookalike -> MIX (combined audience strategy)
  if ((hasRetargeting || hasCustomAudience) && hasLookalike) {
    return 'MIX';
  }
  
  // If retargeting or custom audiences selected -> RTG
  if (hasRetargeting || hasCustomAudience) {
    return 'RTG';
  }

  // If lookalike audiences selected -> EXP
  if (hasLookalike) {
    return 'EXP';
  }

  // Check if targeting expansion is enabled (Expand to New)
  if (config.targetingExpansion === true || config.expandToNew === true) {
    return 'EXP';
  }

  // Check for native interest/behavior/demographic targeting (BasicTargetingConfig format)
  const hasMetaTargeting = 
    (config.metaInterests && config.metaInterests.length > 0) ||
    (config.metaBehaviors && config.metaBehaviors.length > 0) ||
    (config.metaDemographics && config.metaDemographics.length > 0);
    
  const hasTiktokTargeting = 
    (config.tiktokInterests && config.tiktokInterests.length > 0) ||
    (config.tiktokBehaviors && config.tiktokBehaviors.length > 0) ||
    (config.tiktokDemographics && config.tiktokDemographics.length > 0);

  // Check for native interest targeting (old format - interests as comma-separated string)
  const hasInterestString = config.interests && config.interests.trim().length > 0;

  // Check selected items for audience type indicators (legacy format)
  if (config.selectedItems && config.selectedItems.length > 0) {
    const itemTypes = config.selectedItems.map(item => item.type?.toLowerCase() || '');
    const itemCategories = config.selectedItems.map(item => item.category?.toLowerCase() || '');
    const itemNames = config.selectedItems.map(item => item.name?.toLowerCase() || '');

    // Check for lookalike indicators
    const hasLookalikeItems = itemTypes.some(t => t.includes('lookalike')) ||
      itemCategories.some(c => c.includes('lookalike')) ||
      itemNames.some(n => n.includes('lookalike') || n.includes('similar audience'));

    // Check for retargeting indicators
    const hasRetargetingItems = itemTypes.some(t => 
      t.includes('retarget') || t.includes('remarketing') || t.includes('custom_audience')
    ) ||
      itemCategories.some(c => 
        c.includes('retarget') || c.includes('remarketing') || c.includes('website visitors') ||
        c.includes('engagement') || c.includes('video viewers') || c.includes('app users')
      ) ||
      itemNames.some(n => 
        n.includes('retarget') || n.includes('remarketing') || n.includes('website visitor') ||
        n.includes('past purchaser') || n.includes('cart abandoner') || n.includes('engaged user')
      );

    // If both types found -> MIX
    if (hasLookalikeItems && hasRetargetingItems) return 'MIX';
    if (hasLookalikeItems) return 'EXP';
    if (hasRetargetingItems) return 'RTG';

    // Check for similar/expand indicators
    const hasSimilar = itemTypes.some(t => t.includes('similar') || t.includes('expand')) ||
      itemCategories.some(c => c.includes('similar') || c.includes('expand'));
    if (hasSimilar) return 'EXP';

    // If has interest/behavior targeting, it's native targeting
    const hasInterests = itemTypes.some(t => 
      t.includes('interest') || t.includes('behavior') || t.includes('demographic')
    );
    if (hasInterests) return 'NTV';
  }

  // If any native targeting is set (interests, behaviors, demographics), it's native
  if (hasMetaTargeting || hasTiktokTargeting || hasInterestString) {
    return 'NTV';
  }

  // Default to native (inherited from preset)
  return 'NTV';
}

/**
 * Get the taxonomy code for a targeting type
 */
export function getTargetingTypeCode(targetingType: string): string {
  const codes: Record<string, string> = {
    'native': 'NTV',
    'expand': 'EXP',
    'ca': 'CA',
    'lal': 'LAL',
    'calal': 'CALAL',
    'broad': 'BRD',
    // Legacy codes for backward compatibility
    'retargeting': 'CA',
    'lookalike': 'LAL',
    'custom': 'CA',
    'similar': 'EXP',
  };
  return codes[targetingType] || 'NTV';
}
