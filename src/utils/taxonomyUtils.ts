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

// Value shortening mappings
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
  // Objectives
  objective: {
    'OUTCOME_AWARENESS': 'AWR',
    'OUTCOME_ENGAGEMENT': 'ENG',
    'OUTCOME_TRAFFIC': 'TRF',
    'OUTCOME_LEADS': 'LED',
    'OUTCOME_APP_PROMOTION': 'APP',
    'OUTCOME_SALES': 'SAL',
    'REACH': 'RCH',
    'VIDEO_VIEWS': 'VV',
    'TRAFFIC': 'TRF',
    'CONVERSIONS': 'CVN',
    'APP_INSTALLS': 'API',
    'LEAD_GENERATION': 'LDG',
    'PRODUCT_SALES': 'PSL',
    'WEB_CONVERSIONS': 'WCV',
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
  },
  // Countries/Markets
  country: {
    'US': 'US',
    'GB': 'UK',
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
  // Placements
  placement: {
    'facebook': 'FB',
    'instagram': 'IG',
    'audience_network': 'AN',
    'messenger': 'MSG',
    'threads': 'THR',
    'PLACEMENT_TIKTOK': 'TT',
    'PLACEMENT_GLOBAL_APP_BUNDLE': 'GAB',
    'PLACEMENT_PANGLE': 'PAN',
    'automatic': 'AUTO',
    'manual': 'MAN',
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
  // Audience types
  audienceType: {
    'broad': 'BRD',
    'interest': 'INT',
    'lookalike': 'LAL',
    'retargeting': 'RTG',
    'custom': 'CUS',
  },
  // Funnel stages
  funnelStage: {
    'awareness': 'TOF',
    'consideration': 'MOF',
    'conversion': 'BOF',
    'retention': 'RET',
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
      id: 'boNumber',
      key: 'BO',
      label: 'BO Number',
      type: 'text',
      system: true,
      required: true,
    },
    {
      id: 'teamName',
      key: 'TEAM',
      label: 'Team Name',
      type: 'text',
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
      id: 'placement',
      key: 'PLC',
      label: 'Placement',
      type: 'options',
      options: platform === 'meta'
        ? ['AUTO', 'FB', 'IG', 'AN', 'MSG']
        : ['AUTO', 'TT', 'GAB', 'PAN'],
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
    {
      id: 'conversionEvent',
      key: 'EVT',
      label: 'Conversion Event',
      type: 'options',
      options: platform === 'meta'
        ? ['PUR', 'ATC', 'ICO', 'LED', 'REG', 'VWC']
        : ['PUR', 'ATC', 'PGV', 'PAY', 'FRM', 'REG'],
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
  
  for (const param of template) {
    const value = values[param.id] || param.value || '';
    if (value) {
      // Apply shortening based on param type
      let shortValue = value;
      
      if (param.type === 'options' || param.type === 'fixed') {
        // Use as-is if already short
        shortValue = value;
      } else if (param.type === 'text' || param.type === 'mixed') {
        // Create short code
        shortValue = createShortCode(value);
      } else if (param.type === 'number') {
        shortValue = value.toString();
      }
      
      parts.push(shortValue.toUpperCase());
    }
  }
  
  return parts.join('_');
}

// Preview taxonomy with example values
export function previewTaxonomy(template: TaxonomyParam[]): string {
  const exampleValues: Record<string, string> = {};
  
  for (const param of template) {
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
    { id: 'startDate', key: 'STR', label: 'Start Date', type: 'text', system: false },
    { id: 'endDate', key: 'END', label: 'End Date', type: 'text', system: false },
    { id: 'budget', key: 'BDG', label: 'Budget', type: 'number', system: false },
    { id: 'targetAge', key: 'AGE', label: 'Target Age', type: 'text', system: false },
    { id: 'targetGender', key: 'GND', label: 'Target Gender', type: 'options', options: ['ALL', 'M', 'F'], system: false },
    { id: 'deviceType', key: 'DEV', label: 'Device Type', type: 'options', options: ['ALL', 'MOB', 'DSK', 'TAB'], system: false },
    { id: 'customField1', key: 'CF1', label: 'Custom Field 1', type: 'text', system: false },
    { id: 'customField2', key: 'CF2', label: 'Custom Field 2', type: 'text', system: false },
    { id: 'customField3', key: 'CF3', label: 'Custom Field 3', type: 'text', system: false },
  ];
}

export const VALUE_MAPPING_CATEGORIES = VALUE_MAPPINGS;
