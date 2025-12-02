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
  // Campaign Level
  campaignName?: string;
  boNumber?: string;
  clientName?: string;
  teamName?: string;
  objective?: string;
  funnelStage?: string;
  // Market Level
  country?: string;
  market?: string;
  // Phase/AdSet Level
  optimizationGoal?: string;
  conversionEvent?: string;
  bidStrategy?: string;
  billingEvent?: string;
  // Placements
  placementType?: string; // automatic/manual
  placements?: string[];
  publisherPlatforms?: string[];
  advantagePlusPlacements?: boolean;
  // Targeting
  audienceType?: string;
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  // Budget
  budgetType?: string;
  budget?: number;
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
export function getDefaultCampaignParams(platform: 'meta' | 'tiktok'): TaxonomyParam[] {
  return [
    {
      id: 'platform',
      key: 'PLAT',
      label: 'Platform',
      type: 'fixed',
      value: platform === 'meta' ? 'META' : 'TT',
      system: true,
      required: true,
    },
    {
      id: 'objective',
      key: 'OBJ',
      label: 'Objective',
      type: 'options',
      options: platform === 'meta' 
        ? ['AWR', 'ENG', 'TRF', 'LED', 'APP', 'SAL']
        : ['RCH', 'TRF', 'VV', 'CVN', 'LDG', 'PSL'],
      system: true,
      required: true,
    },
    {
      id: 'country',
      key: 'MKT',
      label: 'Market/Country',
      type: 'options',
      options: Object.values(VALUE_MAPPINGS.country),
      system: true,
      required: true,
    },
    {
      id: 'funnelStage',
      key: 'FNL',
      label: 'Funnel Stage',
      type: 'options',
      options: ['TOF', 'MOF', 'BOF', 'RET'],
      system: false,
      required: false,
    },
  ];
}

// Generate default ad set taxonomy params
export function getDefaultAdSetParams(platform: 'meta' | 'tiktok'): TaxonomyParam[] {
  return [
    {
      id: 'audienceType',
      key: 'AUD',
      label: 'Audience Type',
      type: 'options',
      options: ['BRD', 'INT', 'LAL', 'RTG', 'CUS'],
      system: true,
      required: true,
    },
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
    },
    {
      id: 'placementType',
      key: 'PLC',
      label: 'Placement',
      type: 'options',
      options: platform === 'meta'
        ? ['AUTO', 'FB', 'IG', 'AN', 'MIX']
        : ['AUTO', 'TT', 'GAB', 'PAN', 'MAN'],
      system: true,
      required: false,
    },
    {
      id: 'bidStrategy',
      key: 'BID',
      label: 'Bid Strategy',
      type: 'options',
      options: platform === 'meta'
        ? ['LC', 'BC', 'CC']
        : ['LC', 'CB', 'MC', 'NB'],
      system: false,
      required: false,
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
    },
    {
      id: 'creativeVariant',
      key: 'VAR',
      label: 'Creative Variant',
      type: 'mixed',
      system: true,
      required: true,
    },
    {
      id: 'copyVariant',
      key: 'CPY',
      label: 'Copy Variant',
      type: 'mixed',
      system: false,
      required: false,
    },
    {
      id: 'language',
      key: 'LNG',
      label: 'Language',
      type: 'options',
      options: ['EN', 'ES', 'DE', 'FR', 'IT', 'PT', 'NL'],
      system: false,
      required: false,
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
