// Taxonomy utility functions for generating standardized naming conventions

export type TaxonomyParamType = 'mixed' | 'number' | 'fixed' | 'options' | 'text';

export interface TaxonomyParam {
  id: string;
  key: string;
  label: string;
  type: TaxonomyParamType;
  value?: string;
  options?: string[];
  required?: boolean;
  system?: boolean; // System-generated params cannot be removed
  description?: string; // Tooltip description explaining the data source
}

export interface TaxonomyTemplate {
  entityType: 'campaign' | 'adset' | 'ad';
  params: TaxonomyParam[];
}

// Context data passed from ActiPlan for auto-generation
export interface TaxonomyContext {
  // Platform & Account
  platform?: string;
  adAccountId?: string;
  adAccountName?: string;
  // Activation Level (from MediaPlanEditor)
  activationName?: string;
  boNumber?: string;
  clientName?: string;
  teamName?: string;
  totalBudget?: number;
  // Campaign Level
  campaignName?: string;
  objective?: string;
  funnelStage?: string;
  // Market Level
  country?: string;
  market?: string;
  markets?: string[]; // Multiple markets for region detection
  region?: string; // Auto-detected region
  // Phase/AdSet Level
  optimizationGoal?: string;
  optimizationLocation?: string; // Where conversions happen: Website, App, OnAd, etc.
  conversionEvent?: string;
  bidStrategy?: string;
  billingEvent?: string;
  phaseBudget?: number;
  // Placements
  placementType?: string; // automatic/manual
  placements?: string[];
  publisherPlatforms?: string[];
  advantagePlusPlacements?: boolean;
  // Targeting
  audienceType?: string;
  targetingType?: string; // native, expand, similar, retargeting
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  devices?: string[];
  languages?: string[]; // Multiple languages for targeting
  positions?: Record<string, string[]>;
  location?: string;
  // Budget
  budgetType?: string;
  budget?: number;
  platformBudget?: number;
  // Creative/Ad Level
  adFormat?: string;
  creativeVariant?: string;
  copyVariant?: string;
  language?: string;
  // Dates
  startDate?: string;
  endDate?: string;
  // Search campaign params
  keywordStrategy?: string;
  matchType?: string;
  campaignType?: string;
}

// Value shortening mappings - comprehensive list
const VALUE_MAPPINGS: Record<string, Record<string, string>> = {
  // Platforms
  platform: {
    'meta': 'META',
    'tiktok': 'TT',
    'google': 'GADS',
    'linkedin': 'LI',
    'twitter': 'X',
    'snapchat': 'SNAP',
    'pinterest': 'PIN',
  },
  // Objectives - Meta
  objective: {
    'OUTCOME_AWARENESS': 'AWR',
    'OUTCOME_ENGAGEMENT': 'ENG',
    'OUTCOME_TRAFFIC': 'TRF',
    'OUTCOME_LEADS': 'LED',
    'OUTCOME_APP_PROMOTION': 'APP',
    'OUTCOME_SALES': 'SAL',
    // TikTok objectives
    'REACH': 'RCH',
    'VIDEO_VIEWS': 'VV',
    'TRAFFIC': 'TRF',
    'CONVERSIONS': 'CVN',
    'APP_INSTALLS': 'API',
    'LEAD_GENERATION': 'LDG',
    'PRODUCT_SALES': 'PSL',
    'WEB_CONVERSIONS': 'WCV',
    'ENGAGEMENT': 'ENG',
    'COMMUNITY_INTERACTION': 'CMI',
    'APP_PROMOTION': 'APP',
    'CATALOG_SALES': 'CAT',
  },
  // Optimization goals
  optimizationGoal: {
    'REACH': 'RCH',
    'IMPRESSIONS': 'IMP',
    'LINK_CLICKS': 'CLK',
    'LANDING_PAGE_VIEWS': 'LPV',
    'CONVERSIONS': 'CVN',
    'VALUE': 'VAL',
    'OFFSITE_CONVERSIONS': 'OCV',
    'APP_INSTALLS': 'API',
    'VIDEO_VIEWS': 'VV',
    'THRUPLAY': 'TPL',
    'ENGAGED_USERS': 'ENU',
    'CLICK': 'CLK',
    'CONVERT': 'CVT',
    'VIDEO_VIEW': 'VV',
    '6S_VIDEO_VIEW': '6SV',
    '15S_VIDEO_VIEW': '15SV',
    'FOCUSED_VIEW': 'FCV',
    'LEAD': 'LED',
    'FORM_SUBMIT': 'FRM',
    'PAGE_VIEW': 'PGV',
    'FOLLOW': 'FLW',
  },
  // Conversion events
  conversionEvent: {
    'Purchase': 'PUR',
    'AddToCart': 'ATC',
    'InitiateCheckout': 'ICO',
    'Lead': 'LED',
    'CompleteRegistration': 'REG',
    'ViewContent': 'VWC',
    'Search': 'SRC',
    'AddPaymentInfo': 'PAY',
    'ON_WEB_ORDER': 'PUR',
    'ON_WEB_ADD_TO_CART': 'ATC',
    'PAGE_VIEW': 'PGV',
    'COMPLETE_PAYMENT': 'PAY',
    'FORM_SUBMIT': 'FRM',
    'DOWNLOAD': 'DWN',
    'REGISTRATION': 'REG',
    'SUBSCRIBE': 'SUB',
    'ADD_TO_WISHLIST': 'WSH',
    'CONTACT': 'CNT',
  },
  // Countries/Markets
  country: {
    'US': 'US',
    'GB': 'UK',
    'UK': 'UK',
    'DE': 'DE',
    'FR': 'FR',
    'ES': 'ES',
    'IT': 'IT',
    'NL': 'NL',
    'BE': 'BE',
    'AT': 'AT',
    'CH': 'CH',
    'PT': 'PT',
    'PL': 'PL',
    'SE': 'SE',
    'NO': 'NO',
    'DK': 'DK',
    'FI': 'FI',
    'IE': 'IE',
    'AU': 'AU',
    'NZ': 'NZ',
    'CA': 'CA',
    'MX': 'MX',
    'BR': 'BR',
    'AR': 'AR',
    'JP': 'JP',
    'KR': 'KR',
    'CN': 'CN',
    'IN': 'IN',
    'SG': 'SG',
    'AE': 'AE',
    'SA': 'SA',
    'ZA': 'ZA',
  },
  // Regions (for multi-market grouping)
  region: {
    'MENA': 'MENA', // Middle East & North Africa
    'EMEA': 'EMEA', // Europe, Middle East & Africa
    'APAC': 'APAC', // Asia Pacific
    'LATAM': 'LATAM', // Latin America
    'NA': 'NA', // North America
    'EU': 'EU', // European Union
    'GCC': 'GCC', // Gulf Cooperation Council
    'DACH': 'DACH', // Germany, Austria, Switzerland
    'NORDICS': 'NRD', // Nordic countries
    'ANZ': 'ANZ', // Australia & New Zealand
    'SEA': 'SEA', // Southeast Asia
  },
  // Targeting types
  targetingType: {
    'native': 'NTV',
    'native_only': 'NTV',
    'expand': 'EXP',
    'expand_to_new': 'EXP',
    'similar': 'SIM',
    'new_but_similar': 'SIM',
    'retargeting': 'RTG',
    'broad': 'BRD',
    'lookalike': 'LAL',
    'custom': 'CUS',
  },
  // Devices
  device: {
    'mobile': 'MOB',
    'desktop': 'DSK',
    'tablet': 'TAB',
    'all': 'ALL',
  },
  // Placement types
  placementType: {
    'PLACEMENT_TYPE_AUTOMATIC': 'AUTO',
    'PLACEMENT_TYPE_NORMAL': 'MAN',
    'automatic': 'AUTO',
    'manual': 'MAN',
    'advantage_plus': 'AUTO',
  },
  // Publisher platforms
  publisherPlatform: {
    'facebook': 'FB',
    'instagram': 'IG',
    'audience_network': 'AN',
    'messenger': 'MSG',
    'threads': 'THR',
    'PLACEMENT_TIKTOK': 'TT',
    'PLACEMENT_GLOBAL_APP_BUNDLE': 'GAB',
    'PLACEMENT_PANGLE': 'PAN',
  },
  // Bid strategies
  bidStrategy: {
    'LOWEST_COST_WITHOUT_CAP': 'LC',
    'LOWEST_COST_WITH_BID_CAP': 'BC',
    'COST_CAP': 'CC',
    'LOWEST_COST': 'LC',
    'BID_TYPE_NO_BID': 'NB',
    'BID_TYPE_CUSTOM': 'CB',
    'BID_TYPE_MAX_CONVERSION': 'MC',
  },
  // Billing events
  billingEvent: {
    'IMPRESSIONS': 'CPM',
    'LINK_CLICKS': 'CPC',
    'APP_INSTALLS': 'CPI',
    'OCPM': 'OCPM',
    'CPC': 'CPC',
    'CPM': 'CPM',
    'CPV': 'CPV',
  },
  // Optimization locations / Conversion destinations
  optimizationLocation: {
    // Meta locations
    'WEBSITE': 'WEB',
    'APP': 'APP',
    'MESSAGING_APPS': 'MSG',
    'CALLS': 'CALL',
    'ON_AD': 'ONAD',
    'SHOP': 'SHOP',
    'INSTANT_FORM': 'FORM',
    'INSTAGRAM_PROFILE': 'IGPF',
    'FACEBOOK_PAGE': 'FBPG',
    // TikTok locations
    'Website': 'WEB',
    'App': 'APP',
    'Instant Messaging': 'MSG',
    'Instant Form': 'FORM',
    'TikTok Shop': 'SHOP',
    'TikTok Instant Page': 'TTIP',
    // Generic
    'on_ad': 'ONAD',
    'website': 'WEB',
    'app': 'APP',
    'messaging': 'MSG',
    'calls': 'CALL',
  },
  // Audience types
  audienceType: {
    'broad': 'BRD',
    'interest': 'INT',
    'lookalike': 'LAL',
    'retargeting': 'RTG',
    'custom': 'CUS',
    'saved': 'SAV',
  },
  // Funnel stages
  funnelStage: {
    'awareness': 'TOF',
    'consideration': 'MOF',
    'conversion': 'BOF',
    'retention': 'RET',
    'Awareness': 'TOF',
    'Consideration': 'MOF',
    'Conversion': 'BOF',
    'Retention': 'RET',
  },
  // Budget types
  budgetType: {
    'daily': 'DBD',
    'lifetime': 'LTB',
  },
  // Ad formats
  adFormat: {
    'image': 'IMG',
    'video': 'VID',
    'carousel': 'CAR',
    'collection': 'COL',
    'dynamic': 'DYN',
    'stories': 'STR',
    'reels': 'RLS',
  },
  // Gender
  gender: {
    'all': 'ALL',
    'male': 'M',
    'female': 'F',
    'All': 'ALL',
    'Male': 'M',
    'Female': 'F',
  },
};

// Region mapping for multi-market detection
const MARKET_TO_REGION: Record<string, string> = {
  // MENA - Middle East & North Africa
  'AE': 'MENA', 'SA': 'MENA', 'KW': 'MENA', 'QA': 'MENA', 'BH': 'MENA', 'OM': 'MENA',
  'EG': 'MENA', 'MA': 'MENA', 'TN': 'MENA', 'DZ': 'MENA', 'JO': 'MENA', 'LB': 'MENA',
  // GCC - Gulf Cooperation Council (subset of MENA)
  // EU - European Union
  'DE': 'EU', 'FR': 'EU', 'IT': 'EU', 'ES': 'EU', 'PT': 'EU', 'NL': 'EU', 'BE': 'EU',
  'AT': 'EU', 'PL': 'EU', 'SE': 'EU', 'DK': 'EU', 'FI': 'EU', 'IE': 'EU', 'GR': 'EU',
  'CZ': 'EU', 'HU': 'EU', 'RO': 'EU', 'BG': 'EU', 'SK': 'EU', 'HR': 'EU', 'SI': 'EU',
  // DACH
  // NA - North America
  'US': 'NA', 'CA': 'NA',
  // LATAM - Latin America
  'MX': 'LATAM', 'BR': 'LATAM', 'AR': 'LATAM', 'CL': 'LATAM', 'CO': 'LATAM', 'PE': 'LATAM',
  // APAC - Asia Pacific
  'JP': 'APAC', 'KR': 'APAC', 'CN': 'APAC', 'IN': 'APAC', 'SG': 'APAC', 'MY': 'APAC',
  'TH': 'APAC', 'VN': 'APAC', 'PH': 'APAC', 'ID': 'APAC', 'TW': 'APAC', 'HK': 'APAC',
  // ANZ - Australia & New Zealand
  'AU': 'ANZ', 'NZ': 'ANZ',
  // UK/GB
  'GB': 'EU', 'UK': 'EU',
  // Africa
  'ZA': 'EMEA', 'NG': 'EMEA', 'KE': 'EMEA',
};

// Detect region from multiple markets
export function detectRegionFromMarkets(markets: string[]): string | undefined {
  if (!markets || markets.length === 0) return undefined;
  if (markets.length === 1) return undefined; // Single market doesn't need region
  
  // Get regions for all markets
  const regions = markets.map(m => MARKET_TO_REGION[m.toUpperCase()]).filter(Boolean);
  
  // If all markets are in the same region, return that region
  const uniqueRegions = [...new Set(regions)];
  if (uniqueRegions.length === 1) {
    return uniqueRegions[0];
  }
  
  // Check for specific groupings
  const upperMarkets = markets.map(m => m.toUpperCase());
  
  // DACH check
  const dachCountries = ['DE', 'AT', 'CH'];
  if (upperMarkets.every(m => dachCountries.includes(m))) return 'DACH';
  
  // Nordics check
  const nordicCountries = ['SE', 'NO', 'DK', 'FI', 'IS'];
  if (upperMarkets.every(m => nordicCountries.includes(m))) return 'NORDICS';
  
  // GCC check
  const gccCountries = ['AE', 'SA', 'KW', 'QA', 'BH', 'OM'];
  if (upperMarkets.every(m => gccCountries.includes(m))) return 'GCC';
  
  // SEA check
  const seaCountries = ['SG', 'MY', 'TH', 'VN', 'PH', 'ID'];
  if (upperMarkets.every(m => seaCountries.includes(m))) return 'SEA';
  
  // If multiple regions, return the most common one or MULTI
  if (uniqueRegions.length > 1) return 'MULTI';
  
  return undefined;
}

// Format date for taxonomy (DDMM or MMDD format)
export function formatDateForTaxonomy(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}${month}`;
  } catch {
    return '';
  }
}

// Format budget for taxonomy (K format)
export function formatBudgetForTaxonomy(budget: number): string {
  if (!budget || budget === 0) return '';
  if (budget >= 1000000) {
    return `${Math.round(budget / 1000000)}M`;
  }
  if (budget >= 1000) {
    return `${Math.round(budget / 1000)}K`;
  }
  return Math.round(budget).toString();
}

// Shorten a value based on its category
export function shortenValue(category: string, value: string): string {
  if (!value) return '';
  
  const categoryMappings = VALUE_MAPPINGS[category];
  if (categoryMappings && categoryMappings[value]) {
    return categoryMappings[value];
  }
  
  // If no mapping exists, create a short version
  return createShortCode(value);
}

// Create a short code from any string
export function createShortCode(value: string): string {
  if (!value) return '';
  
  // Remove special characters and spaces
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '');
  
  // If it's already short (3 chars or less), return uppercase
  if (cleaned.length <= 3) {
    return cleaned.toUpperCase();
  }
  
  // Take first 3 consonants or first 3 letters
  const consonants = cleaned.replace(/[aeiouAEIOU]/g, '');
  if (consonants.length >= 3) {
    return consonants.substring(0, 3).toUpperCase();
  }
  
  return cleaned.substring(0, 3).toUpperCase();
}

// Auto-extract taxonomy values from ActiPlan context
export function extractTaxonomyValues(
  template: TaxonomyParam[],
  context: TaxonomyContext
): Record<string, string> {
  const values: Record<string, string> = {};
  
  for (const param of template) {
    let rawValue: string | undefined;
    
    // Map param id to context field and shorten
    switch (param.id) {
      case 'platform':
        rawValue = context.platform;
        values[param.id] = rawValue ? shortenValue('platform', rawValue) : '';
        break;
      case 'objective':
        rawValue = context.objective;
        values[param.id] = rawValue ? shortenValue('objective', rawValue) : '';
        break;
      case 'optimizationGoal':
        rawValue = context.optimizationGoal;
        values[param.id] = rawValue ? shortenValue('optimizationGoal', rawValue) : '';
        break;
      case 'optimizationLocation':
        rawValue = context.optimizationLocation;
        // If no location specified, default to ONAD (On Ad) for objectives that don't require conversion location
        values[param.id] = rawValue ? shortenValue('optimizationLocation', rawValue) : 'ONAD';
        break;
      case 'country':
      case 'market':
        rawValue = context.country || context.market;
        values[param.id] = rawValue ? shortenValue('country', rawValue) : '';
        break;
      case 'funnelStage':
        rawValue = context.funnelStage;
        values[param.id] = rawValue ? shortenValue('funnelStage', rawValue) : '';
        break;
      case 'conversionEvent':
        rawValue = context.conversionEvent;
        values[param.id] = rawValue ? shortenValue('conversionEvent', rawValue) : '';
        break;
      case 'bidStrategy':
        rawValue = context.bidStrategy;
        values[param.id] = rawValue ? shortenValue('bidStrategy', rawValue) : '';
        break;
      case 'billingEvent':
        rawValue = context.billingEvent;
        values[param.id] = rawValue ? shortenValue('billingEvent', rawValue) : '';
        break;
      case 'placementType':
      case 'placement':
        // Check for advantage plus placements first (Meta)
        if (context.advantagePlusPlacements === true) {
          values[param.id] = 'AUTO';
        } else if (context.placementType) {
          // TikTok placement type - check explicit value
          const ptLower = context.placementType.toLowerCase();
          if (ptLower === 'automatic' || ptLower.includes('automatic') || ptLower === 'placement_type_automatic') {
            values[param.id] = 'AUTO';
          } else {
            values[param.id] = 'MAN';
          }
        } else if (context.publisherPlatforms && context.publisherPlatforms.length > 0) {
          // If there are explicit publisher platforms selected, it's manual
          values[param.id] = 'MAN';
        } else if (context.placements && context.placements.length > 0) {
          // If there are explicit placements, it's manual
          values[param.id] = 'MAN';
        } else {
          // Default to AUTO if nothing specified
          values[param.id] = 'AUTO';
        }
        break;
      case 'audienceType':
        rawValue = context.audienceType;
        values[param.id] = rawValue ? shortenValue('audienceType', rawValue) : 'BRD';
        break;
      case 'budgetType':
        rawValue = context.budgetType;
        values[param.id] = rawValue ? shortenValue('budgetType', rawValue) : '';
        break;
      case 'adFormat':
        rawValue = context.adFormat;
        values[param.id] = rawValue ? shortenValue('adFormat', rawValue) : '';
        break;
      case 'gender':
        rawValue = context.gender;
        values[param.id] = rawValue ? shortenValue('gender', rawValue) : 'ALL';
        break;
      case 'boNumber':
        // Don't shorten BO number - use as-is
        rawValue = context.boNumber;
        values[param.id] = rawValue ? rawValue.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
        break;
      case 'teamName':
        // Don't shorten team name - use as-is (just clean special chars)
        rawValue = context.teamName;
        values[param.id] = rawValue ? rawValue.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
        break;
      case 'clientName':
        rawValue = context.clientName;
        values[param.id] = rawValue ? createShortCode(rawValue) : '';
        break;
      case 'campaignName':
        rawValue = context.campaignName;
        values[param.id] = rawValue ? createShortCode(rawValue) : '';
        break;
      case 'creativeVariant':
        rawValue = context.creativeVariant;
        values[param.id] = rawValue ? createShortCode(rawValue) : '';
        break;
      case 'copyVariant':
        rawValue = context.copyVariant;
        values[param.id] = rawValue ? createShortCode(rawValue) : '';
        break;
      case 'language':
        rawValue = context.language;
        values[param.id] = rawValue ? rawValue.toUpperCase().substring(0, 2) : '';
        break;
      case 'languages':
        // Handle multiple languages for adset level
        if (context.languages && Array.isArray(context.languages) && context.languages.length > 0) {
          // Take first 3 language codes abbreviated
          values[param.id] = context.languages.slice(0, 3).map((l: string) => l.substring(0, 2).toUpperCase()).join('');
        } else {
          values[param.id] = 'ALL';
        }
        break;
      case 'ageRange':
        if (context.ageMin !== undefined && context.ageMax !== undefined) {
          values[param.id] = `${context.ageMin}-${context.ageMax}`;
        } else if (context.ageMin !== undefined) {
          values[param.id] = `${context.ageMin}+`;
        } else if (context.ageMax !== undefined) {
          values[param.id] = `18-${context.ageMax}`;
        } else {
          // For broad targeting or when no age is set, show ALL
          values[param.id] = 'ALL';
        }
        break;
      case 'activationName':
        // Don't shorten activation name - use as-is (just clean special chars)
        rawValue = context.activationName;
        values[param.id] = rawValue ? rawValue.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
        break;
      case 'phaseBudget':
        // Use phaseBudget first, then platformBudget as fallback
        const budgetValue = context.phaseBudget ?? context.platformBudget ?? context.budget;
        values[param.id] = budgetValue ? formatBudgetForTaxonomy(budgetValue) : '';
        break;
      case 'platformBudget':
        values[param.id] = context.platformBudget ? formatBudgetForTaxonomy(context.platformBudget) : '';
        break;
      case 'totalBudget':
        values[param.id] = context.totalBudget ? formatBudgetForTaxonomy(context.totalBudget) : '';
        break;
      case 'startDate':
        values[param.id] = context.startDate ? formatDateForTaxonomy(context.startDate) : '';
        break;
      case 'endDate':
        values[param.id] = context.endDate ? formatDateForTaxonomy(context.endDate) : '';
        break;
      case 'keywordStrategy':
        rawValue = context.keywordStrategy;
        values[param.id] = rawValue ? rawValue.toUpperCase().substring(0, 5) : '';
        break;
      case 'matchType':
        rawValue = context.matchType;
        if (rawValue) {
          const mtMap: Record<string, string> = { 'BROAD': 'BRD', 'PHRASE': 'PHR', 'EXACT': 'EXT', 'BROAD_WORD': 'BWD' };
          values[param.id] = mtMap[rawValue.toUpperCase()] || rawValue.substring(0, 3).toUpperCase();
        } else {
          values[param.id] = '';
        }
        break;
      case 'campaignType':
        rawValue = context.campaignType;
        if (rawValue) {
          const ctMap: Record<string, string> = {
            'Search': 'SRC', 'Display': 'DSP', 'Performance Max': 'PMAX', 'Video': 'VID',
            'Demand Gen': 'DGEN', 'Shopping': 'SHOP', 'App Promotion': 'APP',
            'SEARCH': 'SRC', 'DISPLAY': 'DSP', 'PERFORMANCE_MAX': 'PMAX',
          };
          values[param.id] = ctMap[rawValue] || createShortCode(rawValue);
        } else {
          values[param.id] = '';
        }
        break;
      case 'targetingType':
        // Handle targeting type - could be a string like 'native', 'RTG', 'EXP', 'MIX', etc.
        rawValue = context.targetingType;
        if (rawValue) {
          // First check if it's already a code (NTV, RTG, EXP, MIX, BRD, etc.)
          const upperRaw = rawValue.toUpperCase();
          const validCodes = ['NTV', 'RTG', 'EXP', 'MIX', 'BRD', 'CA', 'LAL', 'CALAL', 'CUS', 'SIM'];
          if (validCodes.includes(upperRaw)) {
            values[param.id] = upperRaw;
          } else {
            // Map lowercase types to codes
            const typeToCode: Record<string, string> = {
              'native': 'NTV',
              'retargeting': 'RTG',
              'expand': 'EXP',
              'similar': 'EXP',
              'lookalike': 'EXP',
              'mix': 'MIX',
              'broad': 'BRD',
              // Legacy mappings for backward compatibility
              'ca': 'RTG',
              'lal': 'EXP',
              'calal': 'MIX',
              'custom': 'RTG',
            };
            values[param.id] = typeToCode[rawValue.toLowerCase()] || 'NTV';
          }
        } else {
          values[param.id] = 'NTV';
        }
        break;
      case 'devices':
        if (context.devices && context.devices.length > 0) {
          if (context.devices.length === 1) {
            values[param.id] = shortenValue('device', context.devices[0]);
          } else {
            values[param.id] = 'ALL';
          }
        } else {
          values[param.id] = 'ALL';
        }
        break;
      case 'location':
        rawValue = context.location || context.country || context.market;
        values[param.id] = rawValue ? shortenValue('country', rawValue) : '';
        break;
      case 'positions':
        // Format positions summary based on what types of positions are selected
        if (context.advantagePlusPlacements === true) {
          // Advantage+ = automatic
          values[param.id] = 'AUTO';
        } else if (context.positions && typeof context.positions === 'object') {
          // Flatten all position values to analyze types
          const allPositions: string[] = [];
          Object.values(context.positions).forEach(posArr => {
            if (Array.isArray(posArr)) {
              allPositions.push(...posArr);
            }
          });
          
          if (allPositions.length === 0) {
            values[param.id] = 'AUTO';
          } else {
            // More precise categorization based on actual Meta position values
            // Feed-type positions: feed, instant_article, marketplace, right_column, search, video_feeds, stream (IG feed), explore, explore_home, native_banner_interstitial, messenger_home
            const feedPositions = allPositions.filter(p => {
              const lower = p.toLowerCase();
              return lower === 'feed' || 
                     lower === 'instant_article' || 
                     lower === 'marketplace' ||
                     lower === 'right_column' ||
                     lower === 'search' ||
                     lower === 'video_feeds' ||
                     lower === 'stream' || // Instagram's main feed
                     lower === 'explore' ||
                     lower === 'explore_home' ||
                     lower === 'native_banner_interstitial' ||
                     lower === 'messenger_home' ||
                     lower === 'threads' ||
                     lower.includes('home');
            });
            
            // Story-type positions: story, stories, reels, sponsored_messages
            const storyPositions = allPositions.filter(p => {
              const lower = p.toLowerCase();
              return lower === 'story' || 
                     lower === 'stories' || 
                     lower === 'reels' ||
                     lower === 'sponsored_messages';
            });
            
            // In-stream-type positions: instream_video, rewarded_video
            const inStreamPositions = allPositions.filter(p => {
              const lower = p.toLowerCase();
              return lower === 'instream_video' || 
                     lower === 'rewarded_video' ||
                     lower.includes('instream');
            });
            
            // Determine what to show
            const hasFeed = feedPositions.length > 0;
            const hasStory = storyPositions.length > 0;
            const hasInStream = inStreamPositions.length > 0;
            
            const typeCount = [hasFeed, hasStory, hasInStream].filter(Boolean).length;
            
            if (typeCount === 0) {
              // Unrecognized positions, show MIX if multiple or abbreviate if single
              values[param.id] = allPositions.length > 1 ? 'MIX' : createShortCode(allPositions[0]);
            } else if (typeCount === 1) {
              // Only one type selected
              if (hasFeed) values[param.id] = 'FEED';
              else if (hasStory) values[param.id] = 'STORY';
              else if (hasInStream) values[param.id] = 'STREAM';
            } else {
              // Multiple types = MIX
              values[param.id] = 'MIX';
            }
          }
        } else {
          values[param.id] = 'AUTO';
        }
        break;
      default:
        // For fixed values, use the param's value
        if (param.type === 'fixed' && param.value) {
          values[param.id] = param.value;
        }
        break;
    }
  }
  
  return values;
}

// Generate default campaign taxonomy params
// Campaign: activation name, objective, market, phase budget, start date, end date, BO number, team name
export function getDefaultCampaignParams(platform: 'meta' | 'tiktok' | 'google'): TaxonomyParam[] {
  return [
    { id: 'activationName', key: 'ACT', label: 'Activation Name', type: 'text', system: true, required: true, description: 'Auto-filled from Activation Details → Name field. The main identifier for this campaign activation.' },
    { 
      id: 'objective', 
      key: 'OBJ', 
      label: 'Campaign Objective', 
      type: 'options', 
      options: platform === 'meta' 
        ? ['AWR', 'ENG', 'TRF', 'LED', 'APP', 'SAL']
        : platform === 'google'
        ? ['SAL', 'LED', 'TRF', 'AWR', 'APP', 'VV']
        : ['RCH', 'VV', 'TRF', 'CVN', 'API', 'LDG', 'PSL'],
      system: true, 
      required: true, 
      description: 'Auto-filled from Phase Config → Campaign Objective. AWR=Awareness, ENG=Engagement, TRF=Traffic, LED=Leads, APP=App Promotion, SAL=Sales, RCH=Reach, VV=Video Views, CVN=Conversions.' 
    },
    { id: 'country', key: 'MKT', label: 'Market', type: 'text', system: true, required: true, description: 'Auto-filled from Platform & Market Selection → Targeted Market (e.g., ES, MX, US). Country code for the market being targeted.' },
    { id: 'phaseBudget', key: 'BDG', label: 'Phase Budget', type: 'text', system: true, required: true, description: 'Auto-filled from Phase Config → Phase Budget allocation. Shows budget in K/M format (e.g., 10K, 1M).' },
    { id: 'startDate', key: 'STR', label: 'Start Date', type: 'text', system: true, required: true, description: 'Auto-filled from Phase Config → Start Date in DDMM format (e.g., 0412 = December 4th).' },
    { id: 'endDate', key: 'END', label: 'End Date', type: 'text', system: true, required: true, description: 'Auto-filled from Phase Config → End Date in DDMM format (e.g., 1812 = December 18th).' },
    { id: 'boNumber', key: 'BO', label: 'BO Number', type: 'text', system: true, required: true, description: 'Auto-filled from Activation Details → BO Number field. Business Order or Purchase Order reference number.' },
    { id: 'teamName', key: 'TEAM', label: 'Team', type: 'text', system: true, required: true, description: 'Auto-filled from Settings → Manage Your Team. The assigned team responsible for this campaign.' },
    // Search campaign parameters - optional, auto-enabled for Google Ads and TikTok
    ...(platform === 'google' || platform === 'tiktok' ? [
      { id: 'keywordStrategy', key: 'KWST', label: 'Keyword Strategy', type: 'options' as TaxonomyParamType, options: ['BRAND', 'GENER', 'COMPE'], system: true, required: false, description: 'Auto-filled for Search campaigns. BRAND=Brand, GENER=Generic, COMPE=Competition.' },
      { id: 'matchType', key: 'MT', label: 'Match Type', type: 'options' as TaxonomyParamType, options: ['BRD', 'PHR', 'EXT'], system: true, required: false, description: 'Auto-filled for Search campaigns. BRD=Broad, PHR=Phrase, EXT=Exact match type.' },
      { id: 'campaignType', key: 'CTYP', label: 'Campaign Type', type: 'options' as TaxonomyParamType, options: platform === 'google' ? ['SRC', 'DSP', 'PMAX', 'VID', 'DGEN', 'SHOP', 'APP'] : ['SRC', 'VID', 'APP'], system: true, required: false, description: 'Auto-filled from Phase Config → Campaign Type. SRC=Search, DSP=Display, PMAX=Performance Max, VID=Video, DGEN=Demand Gen.' },
    ] : []),
  ];
}

// Generate default ad set taxonomy params
// AdSet: optimization goal, budget type, age, gender, location, device, placements, positions, targeting type
export function getDefaultAdSetParams(platform: 'meta' | 'tiktok' | 'google'): TaxonomyParam[] {
  return [
    {
      id: 'optimizationGoal',
      key: 'OPT',
      label: 'Optimization Goal',
      type: 'options',
      options: platform === 'meta'
        ? ['RCH', 'IMP', 'CLK', 'LPV', 'CVN', 'VAL', 'VV']
        : platform === 'google'
        ? ['CVN', 'CLK', 'IMP', 'VV', 'VAL']
        : ['RCH', 'CLK', 'CVT', 'VV', '6SV', 'FCV'],
      system: true,
      required: true,
      description: 'Auto-filled from Phase Config → Optimization Goal. RCH=Reach, IMP=Impressions, CLK=Clicks, LPV=Landing Page Views, CVN=Conversions, VAL=Value, VV=Video Views.',
    },
    {
      id: 'optimizationLocation',
      key: 'LOC_T',
      label: 'Optimization Location',
      type: 'options',
      options: platform === 'meta'
        ? ['ONAD', 'WEB', 'APP', 'MSG', 'CALL', 'SHOP', 'FORM']
        : platform === 'google'
        ? ['WEB', 'APP', 'CALL']
        : ['ONAD', 'WEB', 'APP', 'MSG', 'FORM', 'SHOP', 'TTIP'],
      system: true,
      required: true,
      description: 'Auto-filled from Phase Config → Optimization Location. ONAD=On Ad (no destination), WEB=Website, APP=App, MSG=Messaging, CALL=Calls, SHOP=Shop, FORM=Instant Form.',
    },
    {
      id: 'budgetType',
      key: 'BTYP',
      label: 'Budget Type',
      type: 'options',
      options: ['DLY', 'LTB'],
      system: true,
      required: true,
      description: 'Auto-filled from Phase Config → Budget Type. LTB=Lifetime Budget (spend entire budget over campaign duration), DLY=Daily Budget (fixed daily spend cap).',
    },
    {
      id: 'ageRange',
      key: 'AGE',
      label: 'Age Range',
      type: 'text',
      system: true,
      required: true,
      description: 'Auto-filled from Targeting → Age Range (min + max combined). Example: 1865 means targeting ages 18-65. Uses phase override if active, otherwise inherited from campaign targeting.',
    },
    {
      id: 'gender',
      key: 'GND',
      label: 'Gender',
      type: 'options',
      options: ['ALL', 'M', 'F'],
      system: true,
      required: true,
      description: 'Auto-filled from Targeting → Gender selection. ALL=All genders, M=Male only, F=Female only. Uses phase override if active, otherwise inherited from campaign targeting.',
    },
    {
      id: 'location',
      key: 'LOC',
      label: 'Location',
      type: 'options',
      options: Object.values(VALUE_MAPPINGS.country),
      system: true,
      required: true,
      description: 'Auto-filled from Platform & Market Selection → Targeted Market. Country code of the market being targeted (e.g., ES, MX, US).',
    },
    {
      id: 'devices',
      key: 'DEV',
      label: 'Devices',
      type: 'options',
      options: ['ALL', 'MOB', 'DSK', 'TAB'],
      system: true,
      required: true,
      description: 'Auto-filled from Targeting → Device Types. ALL=All devices, MOB=Mobile only, DSK=Desktop only, TAB=Tablet only. Uses phase override if active.',
    },
    {
      id: 'placementType',
      key: 'PLC',
      label: 'Placements',
      type: 'options',
      options: platform === 'meta'
        ? ['AUTO', 'FB', 'IG', 'AN', 'MIX']
        : platform === 'google'
        ? ['SEARCH', 'DISPLAY', 'VIDEO', 'PMAX', 'SHOP']
        : ['AUTO', 'TT', 'GAB', 'PAN'],
      system: true,
      required: true,
      description: platform === 'meta'
        ? 'Auto-filled from Phase Config → Placement Type. AUTO=Advantage+ placements, FB=Facebook, IG=Instagram, AN=Audience Network, MIX=Multiple platforms.'
        : platform === 'google'
        ? 'Auto-filled from Phase Config → Campaign Type. SEARCH=Search, DISPLAY=Display, VIDEO=Video, PMAX=Performance Max, SHOP=Shopping.'
        : 'Auto-filled from Phase Config → Placement Type. AUTO=Automatic, TT=TikTok, GAB=Global App Bundle, PAN=Pangle.',
    },
    {
      id: 'positions',
      key: 'POS',
      label: 'Positions',
      type: 'options',
      options: platform === 'meta'
        ? ['AUTO', 'FEED', 'STORY', 'REEL', 'MIX']
        : platform === 'google'
        ? ['AUTO', 'SEARCH', 'DISPLAY', 'VIDEO']
        : ['AUTO', 'TT', 'GAB', 'PAN'],
      system: true,
      required: true,
      description: platform === 'meta'
        ? 'Auto-filled from Phase Config → Specific ad positions. FEED=Feed placements, STORY=Stories, REEL=Reels, MIX=Multiple positions.'
        : platform === 'google'
        ? 'Auto-filled from Phase Config → Google Ads network positions.'
        : 'Auto-filled from Phase Config → Specific TikTok positions.',
    },
    {
      id: 'targetingType',
      key: 'TGT',
      label: 'Targeting Type',
      type: 'options',
      options: ['NTV', 'EXP', 'SIM', 'RTG', 'BRD', 'LAL'],
      system: true,
      required: true,
      description: 'Auto-filled from Targeting → Expansion Strategy. NTV=Native (selected interests only), EXP=Expand (find new audiences), SIM=Similar, RTG=Retargeting, BRD=Broad, LAL=Lookalike.',
    },
    {
      id: 'languages',
      key: 'LNG',
      label: 'Languages',
      type: 'text',
      system: true,
      required: true,
      description: 'Auto-filled from Targeting → Languages. Shows abbreviated language codes (e.g., EN, ES, DE). Uses phase override if active.',
    },
  ];
}

// Generate default ad taxonomy params - aligned with content calendar spreadsheet columns
export function getDefaultAdParams(): TaxonomyParam[] {
  return [
    {
      id: 'postNumber',
      key: 'POST',
      label: 'Post Number',
      type: 'mixed',
      system: true,
      required: false,
      description: 'Auto-filled from Content Calendar → Post Number. Unique identifier for the post/creative within the campaign.',
    },
    {
      id: 'brandName',
      key: 'BRD',
      label: 'Brand/Product',
      type: 'text',
      system: false,
      required: false,
      description: 'Auto-filled from Content Calendar → Brand Name or Product Category. Identifies the brand or product being promoted.',
    },
    {
      id: 'adFormat',
      key: 'FMT',
      label: 'Ad Format',
      type: 'options',
      options: ['IMG', 'VID', 'CAR', 'COL', 'DYN', 'STR', 'RLS'],
      system: true,
      required: true,
      description: 'Auto-filled from Content Calendar → Format. IMG=Single Image, VID=Video, CAR=Carousel, COL=Collection, DYN=Dynamic, STR=Stories, RLS=Reels.',
    },
    {
      id: 'placement',
      key: 'PLC',
      label: 'Placement',
      type: 'options',
      options: ['FEED', 'STR', 'RLS', 'EXP', 'SRCH'],
      system: true,
      required: false,
      description: 'Auto-filled from Content Calendar → Placement. FEED=Feed, STR=Stories, RLS=Reels, EXP=Explore, SRCH=Search.',
    },
    {
      id: 'postType',
      key: 'TYP',
      label: 'Post Type',
      type: 'options',
      options: ['ORG', 'DRK', 'SPK', 'PAD'],
      system: true,
      required: false,
      description: 'Auto-filled from Content Calendar → Organic vs Dark. ORG=Organic Post, DRK=Dark Post, SPK=Spark Ad, PAD=Paid Ad.',
    },
    {
      id: 'creativeVariant',
      key: 'VAR',
      label: 'Creative Variant',
      type: 'mixed',
      system: true,
      required: true,
      description: 'Auto-filled from Creative Setup → Variant identifier. Used to distinguish different creative versions (A/B testing, etc.). e.g., A, B, C or 01, 02, 03.',
    },
    {
      id: 'copyVariant',
      key: 'CPY',
      label: 'Copy Variant',
      type: 'mixed',
      system: false,
      required: true,
      description: 'User-defined copy variant identifier. Use to track different ad copy versions for the same creative. e.g., V1, V2 or SHORT, LONG.',
    },
    {
      id: 'language',
      key: 'LNG',
      label: 'Language',
      type: 'options',
      options: ['EN', 'AR', 'ES', 'DE', 'FR', 'IT', 'PT', 'NL', 'TR', 'RU', 'ZH', 'JA', 'KO'],
      system: true,
      required: true,
      description: 'Auto-filled from Content Calendar → Language. Language code for the ad creative. EN=English, AR=Arabic, ES=Spanish, etc.',
    },
    {
      id: 'contentPillar',
      key: 'PLR',
      label: 'Content Pillar',
      type: 'text',
      system: false,
      required: false,
      description: 'Auto-filled from Content Calendar → Content Pillar/Theme. The strategic content category or theme.',
    },
    {
      id: 'priority',
      key: 'PRI',
      label: 'Priority',
      type: 'options',
      options: ['HI', 'MD', 'LO'],
      system: false,
      required: false,
      description: 'Auto-filled from Content Calendar → Priority. HI=High priority, MD=Medium priority, LO=Low priority.',
    },
  ];
}

// Value mappings for ad taxonomy fields (extending VALUE_MAPPINGS)
export const AD_TAXONOMY_MAPPINGS: Record<string, Record<string, string>> = {
  adFormat: {
    'image': 'IMG',
    'video': 'VID',
    'carousel': 'CAR',
    'collection': 'COL',
    'dynamic': 'DYN',
    'stories': 'STR',
    'reels': 'RLS',
    'Video - Feed': 'VID',
    'Video - Stories': 'STR',
    'Video - Reels': 'RLS',
    'Image/Carousel': 'CAR',
    'Single Image': 'IMG',
    'Static': 'IMG',
    'GIF': 'IMG',
  },
  placement: {
    'feed': 'FEED',
    'Feed': 'FEED',
    'stories': 'STR',
    'Stories': 'STR',
    'reels': 'RLS',
    'Reels': 'RLS',
    'explore': 'EXP',
    'Explore': 'EXP',
    'search': 'SRCH',
    'Search': 'SRCH',
  },
  postType: {
    'organic': 'ORG',
    'Organic': 'ORG',
    'dark': 'DRK',
    'Dark': 'DRK',
    'Dark Post': 'DRK',
    'spark': 'SPK',
    'Spark': 'SPK',
    'Spark Ad': 'SPK',
    'paid': 'PAD',
    'Paid': 'PAD',
    'Paid Ad': 'PAD',
  },
  priority: {
    'high': 'HI',
    'High': 'HI',
    'medium': 'MD',
    'Medium': 'MD',
    'low': 'LO',
    'Low': 'LO',
  },
  language: {
    'English': 'EN',
    'Arabic': 'AR',
    'Spanish': 'ES',
    'German': 'DE',
    'French': 'FR',
    'Italian': 'IT',
    'Portuguese': 'PT',
    'Dutch': 'NL',
    'Turkish': 'TR',
    'Russian': 'RU',
    'Chinese': 'ZH',
    'Japanese': 'JA',
    'Korean': 'KO',
    'EN': 'EN',
    'AR': 'AR',
    'EN/AR': 'ENAR',
    'AR/EN': 'ENAR',
  },
};

// Generate ad taxonomy name from creative data
export function generateAdTaxonomyName(
  creative: {
    postNumber?: string;
    brandName?: string;
    format?: string;
    placement?: string;
    postType?: string;
    creativeVariant?: string;
    copyVariant?: string;
    language?: string;
    contentPillar?: string;
    priority?: string;
    name?: string;
  },
  template?: TaxonomyParam[]
): string {
  const params = template || getDefaultAdParams();
  const parts: string[] = [];

  for (const param of params) {
    if (param.required === false && !param.system) continue;

    let value = '';
    switch (param.id) {
      case 'postNumber':
        value = creative.postNumber || '';
        break;
      case 'brandName':
        value = creative.brandName ? createShortCode(creative.brandName) : '';
        break;
      case 'adFormat':
        value = creative.format ? (AD_TAXONOMY_MAPPINGS.adFormat[creative.format] || createShortCode(creative.format)) : '';
        break;
      case 'placement':
        value = creative.placement ? (AD_TAXONOMY_MAPPINGS.placement[creative.placement] || createShortCode(creative.placement)) : '';
        break;
      case 'postType':
        value = creative.postType ? (AD_TAXONOMY_MAPPINGS.postType[creative.postType] || createShortCode(creative.postType)) : '';
        break;
      case 'creativeVariant':
        value = creative.creativeVariant || 'A';
        break;
      case 'copyVariant':
        value = creative.copyVariant || 'V1';
        break;
      case 'language':
        value = creative.language ? (AD_TAXONOMY_MAPPINGS.language[creative.language] || creative.language.toUpperCase().substring(0, 2)) : '';
        break;
      case 'contentPillar':
        value = creative.contentPillar ? createShortCode(creative.contentPillar) : '';
        break;
      case 'priority':
        value = creative.priority ? (AD_TAXONOMY_MAPPINGS.priority[creative.priority] || '') : '';
        break;
    }

    if (value) {
      parts.push(value);
    }
  }

  // Fallback to creative name if no taxonomy parts
  if (parts.length === 0 && creative.name) {
    return creative.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  }

  return parts.join('_');
}

// Validate taxonomy string
export function validateTaxonomyString(value: string): { valid: boolean; error?: string } {
  if (!value) {
    return { valid: true };
  }
  
  // Only underscores allowed as separators
  if (/[^a-zA-Z0-9_]/.test(value)) {
    return { 
      valid: false, 
      error: 'Only letters, numbers, and underscores are allowed' 
    };
  }
  
  // No spaces
  if (value.includes(' ')) {
    return { 
      valid: false, 
      error: 'Spaces are not allowed' 
    };
  }
  
  // No double underscores
  if (value.includes('__')) {
    return { 
      valid: false, 
      error: 'Double underscores are not allowed' 
    };
  }
  
  return { valid: true };
}

// Generate taxonomy string from template and values
export function generateTaxonomyString(
  template: TaxonomyParam[],
  values: Record<string, string>
): string {
  const parts: string[] = [];
  
  // Only include params that are required or have values
  for (const param of template) {
    if (param.required === false && !param.system) continue;
    
    const value = values[param.id] || param.value || '';
    if (value) {
      parts.push(value.toUpperCase());
    }
  }
  
  return parts.join('_');
}

// Generate taxonomy string automatically from context
export function generateAutoTaxonomy(
  template: TaxonomyParam[],
  context: TaxonomyContext
): string {
  const values = extractTaxonomyValues(template, context);
  return generateTaxonomyString(template, values);
}

// Preview taxonomy with example values
export function previewTaxonomy(template: TaxonomyParam[]): string {
  const exampleValues: Record<string, string> = {};
  
  for (const param of template) {
    if (param.required === false && !param.system) continue;
    
    if (param.value) {
      exampleValues[param.id] = param.value;
    } else if (param.options && param.options.length > 0) {
      exampleValues[param.id] = param.options[0];
    } else if (param.type === 'number') {
      exampleValues[param.id] = '001';
    } else {
      exampleValues[param.id] = param.key;
    }
  }
  
  return generateTaxonomyString(template, exampleValues);
}

// Get all available taxonomy parameters
export function getAllAvailableParams(): TaxonomyParam[] {
  return [
    { id: 'clientName', key: 'CLT', label: 'Client Name', type: 'text', system: false },
    { id: 'campaignName', key: 'CMP', label: 'Campaign Name', type: 'text', system: false },
    { id: 'boNumber', key: 'BO', label: 'BO Number', type: 'text', system: false },
    { id: 'teamName', key: 'TEAM', label: 'Team Name', type: 'text', system: false },
    { id: 'startDate', key: 'STR', label: 'Start Date', type: 'text', system: false },
    { id: 'endDate', key: 'END', label: 'End Date', type: 'text', system: false },
    { id: 'budget', key: 'BDG', label: 'Budget', type: 'number', system: false },
    { id: 'ageRange', key: 'AGE', label: 'Age Range', type: 'text', system: false },
    { id: 'gender', key: 'GND', label: 'Gender', type: 'options', options: ['ALL', 'M', 'F'], system: false },
    { id: 'deviceType', key: 'DEV', label: 'Device Type', type: 'options', options: ['ALL', 'MOB', 'DSK', 'TAB'], system: false },
    { id: 'billingEvent', key: 'BIL', label: 'Billing Event', type: 'options', options: ['CPM', 'CPC', 'OCPM', 'CPV'], system: false },
    { id: 'conversionEvent', key: 'EVT', label: 'Conversion Event', type: 'options', options: ['PUR', 'ATC', 'LED', 'REG', 'PGV'], system: false },
    { id: 'keywordStrategy', key: 'KWST', label: 'Keyword Strategy', type: 'options', options: ['BRAND', 'GENER', 'COMPE'], system: false },
    { id: 'matchType', key: 'MT', label: 'Match Type', type: 'options', options: ['BRD', 'PHR', 'EXT'], system: false },
    { id: 'campaignType', key: 'CTYP', label: 'Campaign Type', type: 'options', options: ['SRC', 'DSP', 'PMAX', 'VID', 'DGEN', 'SHOP', 'APP'], system: false },
  ];
}

// Get count of missing required values - ONLY counts custom (non-system) params that need user input
export function getMissingRequiredCount(
  template: TaxonomyParam[],
  values: Record<string, string>
): number {
  let count = 0;
  for (const param of template) {
    // Only count missing values for custom (non-system) params that are required
    // System params are auto-filled and should not count as "pending"
    if (!param.system && param.required !== false && !values[param.id] && !param.value) {
      count++;
    }
  }
  return count;
}

export const VALUE_MAPPING_CATEGORIES = VALUE_MAPPINGS;
