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
        // Check for advantage plus placements first
        if (context.advantagePlusPlacements === true) {
          values[param.id] = 'AUTO';
        } else if (context.placementType) {
          values[param.id] = shortenValue('placementType', context.placementType);
        } else if (context.placements && context.placements.length > 0) {
          // Use first placement as indicator
          values[param.id] = 'MAN';
        } else if (context.publisherPlatforms && context.publisherPlatforms.length > 0) {
          // Multiple platforms = manual
          values[param.id] = context.publisherPlatforms.length > 1 ? 'MIX' : 
            shortenValue('publisherPlatform', context.publisherPlatforms[0]);
        } else {
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
        rawValue = context.boNumber;
        values[param.id] = rawValue ? createShortCode(rawValue) : '';
        break;
      case 'teamName':
        rawValue = context.teamName;
        values[param.id] = rawValue ? createShortCode(rawValue) : '';
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
      case 'ageRange':
        if (context.ageMin && context.ageMax) {
          values[param.id] = `${context.ageMin}${context.ageMax}`;
        }
        break;
      case 'activationName':
        rawValue = context.activationName;
        values[param.id] = rawValue ? createShortCode(rawValue) : '';
        break;
      case 'region':
        // Auto-detect region from markets if multiple
        if (context.region) {
          values[param.id] = shortenValue('region', context.region);
        } else if (context.markets && context.markets.length > 1) {
          const detectedRegion = detectRegionFromMarkets(context.markets);
          values[param.id] = detectedRegion ? shortenValue('region', detectedRegion) : '';
        } else {
          values[param.id] = '';
        }
        break;
      case 'phaseBudget':
        values[param.id] = context.phaseBudget ? formatBudgetForTaxonomy(context.phaseBudget) : '';
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
      case 'targetingType':
        rawValue = context.targetingType;
        values[param.id] = rawValue ? shortenValue('targetingType', rawValue) : '';
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
        // Format positions summary
        if (context.positions) {
          const posKeys = Object.keys(context.positions).filter(k => context.positions?.[k]?.length);
          if (posKeys.length === 0) {
            values[param.id] = 'AUTO';
          } else if (posKeys.length === 1) {
            values[param.id] = shortenValue('publisherPlatform', posKeys[0]);
          } else {
            values[param.id] = 'MIX';
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
// Campaign: activation name, market, placements, platform budget, start date, end date, BO number, team name
export function getDefaultCampaignParams(platform: 'meta' | 'tiktok'): TaxonomyParam[] {
  return [
    { id: 'activationName', key: 'ACT', label: 'Activation Name', type: 'text', system: true, required: true, description: 'From Activation Details → Activation Name field' },
    { id: 'country', key: 'MKT', label: 'Market', type: 'text', system: true, required: true, description: 'From Platform & Market Selection → Targeted Market' },
    { id: 'placementType', key: 'PLC', label: 'Placement', type: 'options', options: ['AUT', 'MAN'], system: true, required: true, description: 'From Phase Config → Placement Type (AUT=Automatic, MAN=Manual)' },
    { id: 'platformBudget', key: 'BDG', label: 'Platform Budget', type: 'text', system: true, required: true, description: 'From Platform & Market Selection → Platform Budget' },
    { id: 'startDate', key: 'STR', label: 'Start Date', type: 'text', system: true, required: true, description: 'From Phase Config → Start Date (DDMM format)' },
    { id: 'endDate', key: 'END', label: 'End Date', type: 'text', system: true, required: true, description: 'From Phase Config → End Date (DDMM format)' },
    { id: 'boNumber', key: 'BO', label: 'BO Number', type: 'text', system: true, required: true, description: 'From Activation Details → BO Number field' },
    { id: 'teamName', key: 'TEAM', label: 'Team', type: 'text', system: true, required: true, description: 'From Settings → Manage Your Team → Assigned Team' },
  ];
}

// Generate default ad set taxonomy params
// AdSet: optimization goal, total phase budget, budget type, age, gender, location, device, placements, positions, targeting type
export function getDefaultAdSetParams(platform: 'meta' | 'tiktok'): TaxonomyParam[] {
  return [
    {
      id: 'optimizationGoal',
      key: 'OPT',
      label: 'Optimization Goal',
      type: 'options',
      options: platform === 'meta'
        ? ['RCH', 'IMP', 'CLK', 'LPV', 'CVN', 'VAL', 'VV']
        : ['RCH', 'CLK', 'CVT', 'VV', '6SV', 'FCV'],
      system: true,
      required: true,
      description: 'From Phase Config → Optimization Goal (e.g., RCH=Reach, CNV=Conversions)',
    },
    {
      id: 'phaseBudget',
      key: 'BDG',
      label: 'Phase Budget',
      type: 'number',
      system: true,
      required: true,
      description: 'From Phase Config → Phase Budget allocation',
    },
    {
      id: 'budgetType',
      key: 'BTYP',
      label: 'Budget Type',
      type: 'options',
      options: ['DLY', 'LTB'],
      system: true,
      required: true,
      description: 'From Phase Config → Budget Type (LTB=Lifetime, DLY=Daily)',
    },
    {
      id: 'ageRange',
      key: 'AGE',
      label: 'Age Range',
      type: 'text',
      system: true,
      required: true,
      description: 'From Targeting → Age Range (e.g., 1865 = 18-65 years)',
    },
    {
      id: 'gender',
      key: 'GND',
      label: 'Gender',
      type: 'options',
      options: ['ALL', 'M', 'F'],
      system: true,
      required: true,
      description: 'From Targeting → Gender (ALL, M=Male, F=Female)',
    },
    {
      id: 'location',
      key: 'LOC',
      label: 'Location',
      type: 'options',
      options: Object.values(VALUE_MAPPINGS.country),
      system: true,
      required: true,
      description: 'From Platform & Market Selection → Targeted Market',
    },
    {
      id: 'devices',
      key: 'DEV',
      label: 'Devices',
      type: 'options',
      options: ['ALL', 'MOB', 'DSK', 'TAB'],
      system: true,
      required: false,
      description: 'From Targeting → Device Types (ALL, MOB=Mobile, DSK=Desktop)',
    },
    {
      id: 'placementType',
      key: 'PLC',
      label: 'Placements',
      type: 'options',
      options: platform === 'meta'
        ? ['AUTO', 'FB', 'IG', 'AN', 'MIX']
        : ['AUTO', 'TT', 'GAB', 'PAN'],
      system: true,
      required: false,
      description: 'From Phase Config → Placement Type',
    },
    {
      id: 'positions',
      key: 'POS',
      label: 'Positions',
      type: 'options',
      options: platform === 'meta'
        ? ['AUTO', 'FEED', 'STORY', 'REEL', 'MIX']
        : ['AUTO', 'TT', 'GAB', 'PAN'],
      system: true,
      required: false,
      description: 'From Phase Config → Specific placement positions',
    },
    {
      id: 'targetingType',
      key: 'TGT',
      label: 'Targeting Type',
      type: 'options',
      options: ['NTV', 'EXP', 'SIM', 'RTG', 'BRD', 'LAL'],
      system: true,
      required: false,
      description: 'From Targeting → Strategy (NAT=Native, EXP=Expand, SIM=Similar, RET=Retargeting)',
    },
  ];
}

// Generate default ad taxonomy params
export function getDefaultAdParams(): TaxonomyParam[] {
  return [
    {
      id: 'adFormat',
      key: 'FMT',
      label: 'Ad Format',
      type: 'options',
      options: ['IMG', 'VID', 'CAR', 'COL', 'DYN'],
      system: true,
      required: true,
      description: 'Auto-filled from Creative Setup → Ad format type (Image/Video/Carousel)',
    },
    {
      id: 'creativeVariant',
      key: 'VAR',
      label: 'Creative Variant',
      type: 'mixed',
      system: true,
      required: true,
      description: 'Auto-filled from Creative Setup → Variant identifier',
    },
    {
      id: 'copyVariant',
      key: 'CPY',
      label: 'Copy Variant',
      type: 'mixed',
      system: false,
      required: false,
      description: 'User-defined copy variant identifier (optional)',
    },
    {
      id: 'language',
      key: 'LNG',
      label: 'Language',
      type: 'options',
      options: ['EN', 'ES', 'DE', 'FR', 'IT', 'PT', 'NL'],
      system: false,
      required: false,
      description: 'User-defined language code for the ad creative (optional)',
    },
  ];
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
  ];
}

// Get count of missing required values
export function getMissingRequiredCount(
  template: TaxonomyParam[],
  values: Record<string, string>
): number {
  let count = 0;
  for (const param of template) {
    if ((param.required !== false || param.system) && !values[param.id] && !param.value) {
      count++;
    }
  }
  return count;
}

export const VALUE_MAPPING_CATEGORIES = VALUE_MAPPINGS;
