/**
 * Cross-Platform Targeting Mapper
 * Validates and maps targeting parameters between Meta and TikTok
 */

export interface TargetingParameter {
  id: string;
  name: string;
  audienceSize?: number;
  platform: 'meta' | 'tiktok';
  originalId?: string; // For mapping equivalent parameters
}

export interface ValidationResult {
  isValid: boolean;
  mappedValue?: TargetingParameter;
  fallbackValue?: TargetingParameter;
  message?: string;
}

// Age range mapping
export const AGE_RANGE_MAPPING = {
  meta: { min: 13, max: 65 },
  tiktok: { min: 18, max: 55 }
};

// Gender mapping
export const GENDER_MAPPING: Record<string, { meta: string; tiktok: string }> = {
  all: { meta: '0', tiktok: 'GENDER_UNLIMITED' },
  male: { meta: '1', tiktok: 'GENDER_MALE' },
  female: { meta: '2', tiktok: 'GENDER_FEMALE' }
};

// Device mapping
export const DEVICE_MAPPING: Record<string, { meta: string; tiktok: string }> = {
  mobile: { meta: 'mobile', tiktok: 'MOBILE' },
  desktop: { meta: 'desktop', tiktok: 'PC' },
  tablet: { meta: 'tablet', tiktok: 'MOBILE' } // TikTok doesn't differentiate tablet
};

// Operating system mapping
export const OS_MAPPING: Record<string, { meta: string; tiktok: string }> = {
  ios: { meta: 'iOS', tiktok: 'IOS' },
  android: { meta: 'Android', tiktok: 'ANDROID' },
  windows: { meta: 'Windows', tiktok: 'PC' },
  macos: { meta: 'Mac OS X', tiktok: 'PC' },
  linux: { meta: 'Linux', tiktok: 'PC' }
};

/**
 * Validate and map age range across platforms
 */
export function validateAge(
  age: number,
  platform: 'meta' | 'tiktok'
): ValidationResult {
  const range = AGE_RANGE_MAPPING[platform];
  
  if (age < range.min) {
    return {
      isValid: false,
      message: `${platform} minimum age is ${range.min}`,
      fallbackValue: {
        id: range.min.toString(),
        name: range.min.toString(),
        platform
      }
    };
  }
  
  if (age > range.max) {
    return {
      isValid: false,
      message: `${platform} maximum age is ${range.max}+`,
      fallbackValue: {
        id: range.max.toString(),
        name: `${range.max}+`,
        platform
      }
    };
  }
  
  return {
    isValid: true,
    mappedValue: {
      id: age.toString(),
      name: age.toString(),
      platform
    }
  };
}

/**
 * Map gender between platforms
 */
export function mapGender(
  genderId: string,
  targetPlatform: 'meta' | 'tiktok'
): ValidationResult {
  // Find the gender key from either platform's ID
  const genderKey = Object.keys(GENDER_MAPPING).find(
    key => GENDER_MAPPING[key].meta === genderId || GENDER_MAPPING[key].tiktok === genderId
  );
  
  if (!genderKey) {
    return {
      isValid: false,
      message: `Unknown gender ID: ${genderId}`,
      fallbackValue: {
        id: GENDER_MAPPING.all[targetPlatform],
        name: 'All',
        platform: targetPlatform
      }
    };
  }
  
  return {
    isValid: true,
    mappedValue: {
      id: GENDER_MAPPING[genderKey][targetPlatform],
      name: genderKey.charAt(0).toUpperCase() + genderKey.slice(1),
      platform: targetPlatform
    }
  };
}

/**
 * Map device between platforms
 */
export function mapDevice(
  deviceId: string,
  targetPlatform: 'meta' | 'tiktok'
): ValidationResult {
  const deviceKey = Object.keys(DEVICE_MAPPING).find(
    key => DEVICE_MAPPING[key].meta === deviceId || DEVICE_MAPPING[key].tiktok === deviceId
  );
  
  if (!deviceKey) {
    return {
      isValid: false,
      message: `Unknown device: ${deviceId}`,
      fallbackValue: {
        id: DEVICE_MAPPING.mobile[targetPlatform],
        name: 'Mobile',
        platform: targetPlatform
      }
    };
  }
  
  return {
    isValid: true,
    mappedValue: {
      id: DEVICE_MAPPING[deviceKey][targetPlatform],
      name: deviceKey.charAt(0).toUpperCase() + deviceKey.slice(1),
      platform: targetPlatform
    }
  };
}

/**
 * Map operating system between platforms
 */
export function mapOS(
  osId: string,
  targetPlatform: 'meta' | 'tiktok'
): ValidationResult {
  const osKey = Object.keys(OS_MAPPING).find(
    key => OS_MAPPING[key].meta.toLowerCase() === osId.toLowerCase() || 
          OS_MAPPING[key].tiktok.toLowerCase() === osId.toLowerCase()
  );
  
  if (!osKey) {
    return {
      isValid: false,
      message: `Unknown OS: ${osId}`,
      fallbackValue: {
        id: OS_MAPPING.android[targetPlatform],
        name: 'Android',
        platform: targetPlatform
      }
    };
  }
  
  return {
    isValid: true,
    mappedValue: {
      id: OS_MAPPING[osKey][targetPlatform],
      name: osKey === 'ios' ? 'iOS' : osKey === 'macos' ? 'Mac OS X' : osKey.charAt(0).toUpperCase() + osKey.slice(1),
      platform: targetPlatform
    }
  };
}

/**
 * Find matching interest/behavior/demographic across platforms using similarity scoring
 */
export function findCrossPlatformMatch(
  sourceParam: TargetingParameter,
  targetOptions: TargetingParameter[]
): TargetingParameter | null {
  if (targetOptions.length === 0) return null;
  
  const sourceName = sourceParam.name.toLowerCase();
  
  // Score each option by similarity
  const scored = targetOptions.map(option => {
    const targetName = option.name.toLowerCase();
    
    // Exact match
    if (sourceName === targetName) return { option, score: 100 };
    
    // Contains match
    if (sourceName.includes(targetName) || targetName.includes(sourceName)) {
      return { option, score: 80 };
    }
    
    // Word overlap
    const sourceWords = sourceName.split(/\s+/);
    const targetWords = targetName.split(/\s+/);
    const commonWords = sourceWords.filter(w => targetWords.includes(w));
    const overlapScore = (commonWords.length / Math.max(sourceWords.length, targetWords.length)) * 60;
    
    return { option, score: overlapScore };
  });
  
  // Sort by score and return best match if score > 50
  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 50 ? scored[0].option : null;
}

/**
 * Batch validate targeting parameters across platforms
 */
export interface CrossPlatformValidation {
  meta: {
    age?: { min: number; max: number };
    genders?: string[];
    devices?: string[];
    os?: string[];
    languages?: string[];
    interests?: TargetingParameter[];
    behaviors?: TargetingParameter[];
    demographics?: TargetingParameter[];
  };
  tiktok: {
    age?: { min: number; max: number };
    genders?: string[];
    devices?: string[];
    os?: string[];
    languages?: string[];
    interests?: TargetingParameter[];
    behaviors?: TargetingParameter[];
    demographics?: TargetingParameter[];
  };
  warnings: string[];
}

export function validateCrossPlatform(
  targeting: {
    minAge?: number;
    maxAge?: number;
    genders?: string[];
    devices?: string[];
    os?: string[];
    languages?: string[];
    interests?: TargetingParameter[];
    behaviors?: TargetingParameter[];
    demographics?: TargetingParameter[];
  }
): CrossPlatformValidation {
  const result: CrossPlatformValidation = {
    meta: {},
    tiktok: {},
    warnings: []
  };
  
  // Validate ages
  if (targeting.minAge !== undefined) {
    const metaMin = validateAge(targeting.minAge, 'meta');
    const tiktokMin = validateAge(targeting.minAge, 'tiktok');
    
    result.meta.age = { min: parseInt(metaMin.mappedValue?.id || metaMin.fallbackValue!.id), max: 65 };
    result.tiktok.age = { min: parseInt(tiktokMin.mappedValue?.id || tiktokMin.fallbackValue!.id), max: 55 };
    
    if (!metaMin.isValid) result.warnings.push(`Meta: ${metaMin.message}`);
    if (!tiktokMin.isValid) result.warnings.push(`TikTok: ${tiktokMin.message}`);
  }
  
  if (targeting.maxAge !== undefined) {
    const metaMax = validateAge(targeting.maxAge, 'meta');
    const tiktokMax = validateAge(targeting.maxAge, 'tiktok');
    
    if (result.meta.age) result.meta.age.max = parseInt(metaMax.mappedValue?.id || metaMax.fallbackValue!.id);
    else result.meta.age = { min: 13, max: parseInt(metaMax.mappedValue?.id || metaMax.fallbackValue!.id) };
    
    if (result.tiktok.age) result.tiktok.age.max = parseInt(tiktokMax.mappedValue?.id || tiktokMax.fallbackValue!.id);
    else result.tiktok.age = { min: 18, max: parseInt(tiktokMax.mappedValue?.id || tiktokMax.fallbackValue!.id) };
    
    if (!metaMax.isValid) result.warnings.push(`Meta: ${metaMax.message}`);
    if (!tiktokMax.isValid) result.warnings.push(`TikTok: ${tiktokMax.message}`);
  }
  
  // Map genders
  if (targeting.genders && targeting.genders.length > 0) {
    result.meta.genders = [];
    result.tiktok.genders = [];
    
    targeting.genders.forEach(g => {
      const metaGender = mapGender(g, 'meta');
      const tiktokGender = mapGender(g, 'tiktok');
      
      if (metaGender.mappedValue) result.meta.genders!.push(metaGender.mappedValue.id);
      if (tiktokGender.mappedValue) result.tiktok.genders!.push(tiktokGender.mappedValue.id);
    });
  }
  
  // Map devices
  if (targeting.devices && targeting.devices.length > 0) {
    result.meta.devices = [];
    result.tiktok.devices = [];
    
    targeting.devices.forEach(d => {
      const metaDevice = mapDevice(d, 'meta');
      const tiktokDevice = mapDevice(d, 'tiktok');
      
      if (metaDevice.mappedValue) result.meta.devices!.push(metaDevice.mappedValue.id);
      if (tiktokDevice.mappedValue) result.tiktok.devices!.push(tiktokDevice.mappedValue.id);
    });
  }
  
  // Map OS
  if (targeting.os && targeting.os.length > 0) {
    result.meta.os = [];
    result.tiktok.os = [];
    
    targeting.os.forEach(o => {
      const metaOS = mapOS(o, 'meta');
      const tiktokOS = mapOS(o, 'tiktok');
      
      if (metaOS.mappedValue) result.meta.os!.push(metaOS.mappedValue.id);
      if (tiktokOS.mappedValue) result.tiktok.os!.push(tiktokOS.mappedValue.id);
    });
  }
  
  // Pass through interests/behaviors/demographics (to be validated via API)
  if (targeting.interests) {
    result.meta.interests = targeting.interests.filter(i => i.platform === 'meta');
    result.tiktok.interests = targeting.interests.filter(i => i.platform === 'tiktok');
  }
  
  if (targeting.behaviors) {
    result.meta.behaviors = targeting.behaviors.filter(b => b.platform === 'meta');
    result.tiktok.behaviors = targeting.behaviors.filter(b => b.platform === 'tiktok');
  }
  
  if (targeting.demographics) {
    result.meta.demographics = targeting.demographics.filter(d => d.platform === 'meta');
    result.tiktok.demographics = targeting.demographics.filter(d => d.platform === 'tiktok');
  }
  
  return result;
}
