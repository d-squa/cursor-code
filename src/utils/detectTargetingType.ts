// Auto-detect targeting type based on user's targeting selections

interface TargetingItem {
  id: string;
  name: string;
  type?: string;
  category?: string;
  platforms?: string[];
}

interface TargetingConfigShape {
  selectedItems?: TargetingItem[];
  targetingExpansion?: boolean;
  customAudiences?: string[];
  lookalikeAudiences?: string[];
  retargetingAudiences?: string[];
}

/**
 * Auto-detects the targeting type based on the user's targeting selections
 * Returns the appropriate taxonomy code
 */
export function detectTargetingType(targeting?: unknown): string {
  if (!targeting || typeof targeting !== 'object') return 'native';
  
  const config = targeting as TargetingConfigShape;

  // Check for lookalike audiences first (highest priority)
  if (config.lookalikeAudiences && config.lookalikeAudiences.length > 0) {
    return 'lookalike';
  }

  // Check for retargeting audiences
  if (config.retargetingAudiences && config.retargetingAudiences.length > 0) {
    return 'retargeting';
  }

  // Check for custom audiences
  if (config.customAudiences && config.customAudiences.length > 0) {
    return 'custom';
  }

  // Check if targeting expansion is enabled (Expand to New)
  if (config.targetingExpansion === true) {
    return 'expand';
  }

  // Check selected items for audience type indicators
  if (config.selectedItems && config.selectedItems.length > 0) {
    const itemTypes = config.selectedItems.map(item => item.type?.toLowerCase() || '');
    const itemCategories = config.selectedItems.map(item => item.category?.toLowerCase() || '');
    const itemNames = config.selectedItems.map(item => item.name?.toLowerCase() || '');

    // Check for lookalike indicators
    const hasLookalike = itemTypes.some(t => t.includes('lookalike')) ||
      itemCategories.some(c => c.includes('lookalike')) ||
      itemNames.some(n => n.includes('lookalike') || n.includes('similar audience'));
    if (hasLookalike) return 'lookalike';

    // Check for retargeting indicators
    const hasRetargeting = itemTypes.some(t => 
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
    if (hasRetargeting) return 'retargeting';

    // Check for similar/expand indicators
    const hasSimilar = itemTypes.some(t => t.includes('similar') || t.includes('expand')) ||
      itemCategories.some(c => c.includes('similar') || c.includes('expand'));
    if (hasSimilar) return 'similar';

    // If has interest/behavior targeting, it's native targeting
    const hasInterests = itemTypes.some(t => 
      t.includes('interest') || t.includes('behavior') || t.includes('demographic')
    );
    if (hasInterests) return 'native';
  }

  // Check if no targeting at all (broad)
  const hasNoDetailedTargeting = !config.selectedItems || config.selectedItems.length === 0;
  if (hasNoDetailedTargeting && !config.targetingExpansion) {
    return 'broad';
  }

  // Default to native if nothing else matches
  return 'native';
}

/**
 * Get the taxonomy code for a targeting type
 */
export function getTargetingTypeCode(targetingType: string): string {
  const codes: Record<string, string> = {
    'native': 'NTV',
    'expand': 'EXP',
    'similar': 'SIM',
    'retargeting': 'RTG',
    'broad': 'BRD',
    'lookalike': 'LAL',
    'custom': 'CUS',
  };
  return codes[targetingType] || 'NTV';
}
