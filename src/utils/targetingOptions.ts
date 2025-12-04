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

// Unified language options using ISO 639-1 codes
// These are platform-agnostic and will be mapped to platform-specific values in adapters
export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "es", label: "Spanish" },
  { value: "es_ES", label: "Spanish (Spain)" },
  { value: "es_MX", label: "Spanish (Mexico)" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "pt_BR", label: "Portuguese (Brazil)" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "sv", label: "Swedish" },
  { value: "no", label: "Norwegian" },
  { value: "da", label: "Danish" },
  { value: "fi", label: "Finnish" },
  { value: "ar", label: "Arabic" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh_CN", label: "Chinese (Simplified)" },
  { value: "zh_TW", label: "Chinese (Traditional)" },
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
