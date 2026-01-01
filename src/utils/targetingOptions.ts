// Unified targeting options for cross-platform use
// These are the canonical values stored at the client level
// Platform-specific adapters handle conversion when sending to APIs

export const DEVICE_OPTIONS = [
  { value: "mobile", label: "Mobile" },
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tablet" },
];

export const GENDER_OPTIONS = [
  { value: "all", label: "All Genders" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export const AGE_OPTIONS = [
  { value: "13", label: "13" },
  { value: "18", label: "18" },
  { value: "21", label: "21" },
  { value: "25", label: "25" },
  { value: "30", label: "30" },
  { value: "35", label: "35" },
  { value: "40", label: "40" },
  { value: "45", label: "45" },
  { value: "50", label: "50" },
  { value: "55", label: "55" },
  { value: "60", label: "60" },
  { value: "65", label: "65+" },
];

// Unified language options - base languages available on all platforms
// Regional variants are labeled with their platform availability
export const LANGUAGE_OPTIONS = [
  // Base languages (available on all platforms)
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "sv", label: "Swedish" },
  { value: "no", label: "Norwegian" },
  { value: "da", label: "Danish" },
  { value: "fi", label: "Finnish" },
  { value: "ar", label: "Arabic" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "hi", label: "Hindi" },
  { value: "ru", label: "Russian" },
  { value: "tr", label: "Turkish" },
  { value: "vi", label: "Vietnamese" },
  { value: "th", label: "Thai" },
  { value: "id", label: "Indonesian" },
  { value: "ms", label: "Malay" },
  { value: "cs", label: "Czech" },
  { value: "hu", label: "Hungarian" },
  { value: "ro", label: "Romanian" },
  { value: "el", label: "Greek" },
  { value: "he", label: "Hebrew" },
  { value: "uk", label: "Ukrainian" },
  // Regional variants (Meta-specific - will map to base for TikTok)
  { value: "en_US", label: "English (US) — Meta only" },
  { value: "en_GB", label: "English (UK) — Meta only" },
  { value: "es_ES", label: "Spanish (Spain) — Meta only" },
  { value: "es_MX", label: "Spanish (Mexico) — Meta only" },
  { value: "pt_BR", label: "Portuguese (Brazil) — Meta only" },
  { value: "zh_CN", label: "Chinese (Simplified)" },
  { value: "zh_TW", label: "Chinese (Traditional)" },
];

// Platform-specific language mappings for API calls
export const META_LANGUAGE_MAPPING: Record<string, number> = {
  "en": 6, // English (US) default
  "en_US": 6,
  "en_GB": 24,
  "es": 10,
  "es_ES": 10,
  "es_MX": 10,
  "fr": 7,
  "de": 5,
  "it": 16,
  "pt": 15,
  "pt_BR": 15,
  "nl": 20,
  "pl": 28,
  "sv": 27,
  "no": 30,
  "da": 3,
  "fi": 8,
  "ar": 1,
  "ja": 14,
  "ko": 19,
  "zh_CN": 25,
  "zh_TW": 26,
  "hi": 13,
  "ru": 22,
  "tr": 29,
  "vi": 51,
  "th": 32,
  "id": 62,
  "ms": 61,
  "cs": 4,
  "hu": 12,
  "ro": 21,
  "el": 9,
  "he": 11,
  "uk": 50,
};

// TikTok uses ISO codes directly
export const TIKTOK_LANGUAGE_MAPPING: Record<string, string> = {
  "en": "en",
  "en_US": "en",
  "en_GB": "en",
  "es": "es",
  "es_ES": "es",
  "es_MX": "es",
  "fr": "fr",
  "de": "de",
  "it": "it",
  "pt": "pt",
  "pt_BR": "pt",
  "nl": "nl",
  "pl": "pl",
  "sv": "sv",
  "no": "no",
  "da": "da",
  "fi": "fi",
  "ar": "ar",
  "ja": "ja",
  "ko": "ko",
  "zh_CN": "zh-Hans",
  "zh_TW": "zh-Hant",
  "hi": "hi",
  "ru": "ru",
  "tr": "tr",
  "vi": "vi",
  "th": "th",
  "id": "id",
  "ms": "ms",
  "cs": "cs",
  "hu": "hu",
  "ro": "ro",
  "el": "el",
  "he": "he",
  "uk": "uk",
};

// Platform-specific gender mappings
export const META_GENDER_MAPPING: Record<string, number[]> = {
  "all": [],
  "male": [1],
  "female": [2],
};

export const TIKTOK_GENDER_MAPPING: Record<string, string> = {
  "all": "GENDER_UNLIMITED",
  "male": "GENDER_MALE",
  "female": "GENDER_FEMALE",
};

// Helper functions for converting to platform-specific values
export function convertLanguagesToMeta(languages: string[]): number[] {
  return languages
    .map(lang => META_LANGUAGE_MAPPING[lang])
    .filter((id): id is number => id !== undefined);
}

export function convertLanguagesToTikTok(languages: string[]): string[] {
  return languages
    .map(lang => TIKTOK_LANGUAGE_MAPPING[lang])
    .filter((code): code is string => code !== undefined);
}

export function convertGenderToMeta(gender: string): number[] {
  return META_GENDER_MAPPING[gender] || [];
}

export function convertGenderToTikTok(gender: string): string {
  return TIKTOK_GENDER_MAPPING[gender] || "GENDER_UNLIMITED";
}

// Get language label by value
export function getLanguageLabel(value: string): string {
  const option = LANGUAGE_OPTIONS.find(opt => opt.value === value);
  return option?.label || value;
}

// Reverse mapping: Meta language ID to ISO code
export const META_LANGUAGE_ID_TO_ISO: Record<number, string> = {
  1: "ar",
  3: "da",
  4: "cs",
  5: "de",
  6: "en",
  7: "fr",
  8: "fi",
  9: "el",
  10: "es",
  11: "he",
  12: "hu",
  13: "hi",
  14: "ja",
  15: "pt",
  16: "it",
  19: "ko",
  20: "nl",
  21: "ro",
  22: "ru",
  24: "en_GB",
  25: "zh_CN",
  26: "zh_TW",
  27: "sv",
  28: "pl",
  29: "tr",
  30: "no",
  32: "th",
  50: "uk",
  51: "vi",
  61: "ms",
  62: "id",
};

// Convert stored language values to ISO codes (handles both old numeric IDs and new ISO codes)
export function normalizeLanguageValues(values: (string | number)[]): string[] {
  console.log("🔍 [normalizeLanguageValues] Input:", values);
  
  const result = values.map(val => {
    // If it's already a valid ISO code in our options, keep it
    if (typeof val === 'string' && LANGUAGE_OPTIONS.some(opt => opt.value === val)) {
      console.log(`  ✅ "${val}" is valid ISO code`);
      return val;
    }
    // Try to convert numeric ID to ISO
    const numericVal = typeof val === 'string' ? parseInt(val, 10) : val;
    if (!isNaN(numericVal) && META_LANGUAGE_ID_TO_ISO[numericVal]) {
      const isoCode = META_LANGUAGE_ID_TO_ISO[numericVal];
      console.log(`  🔄 Converted numeric ID ${numericVal} to ISO "${isoCode}"`);
      return isoCode;
    }
    // Return as string if we can't convert
    console.log(`  ⚠️ Could not normalize "${val}" (type: ${typeof val})`);
    return String(val);
  }).filter((val): val is string => typeof val === 'string');
  
  console.log("🔍 [normalizeLanguageValues] Output:", result);
  return result;
}
