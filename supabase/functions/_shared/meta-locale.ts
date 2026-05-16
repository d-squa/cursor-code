/** ISO / UI language codes → Meta targeting locale IDs (Reach & Frequency, ad sets). */
const ISO_TO_META_LOCALE: Record<string, number> = {
  en: 6,
  en_US: 6,
  en_GB: 24,
  es: 23,
  es_ES: 23,
  es_MX: 36,
  fr: 7,
  de: 5,
  it: 10,
  pt: 16,
  pt_BR: 31,
  nl: 13,
  pl: 15,
  sv: 20,
  no: 14,
  da: 3,
  fi: 4,
  ar: 28,
  ja: 11,
  ko: 12,
  hi: 45,
  ru: 17,
  tr: 27,
  vi: 25,
  th: 22,
  id: 44,
  ms: 41,
  cs: 2,
  hu: 9,
  ro: 32,
  el: 8,
  he: 29,
  uk: 26,
  zh_CN: 42,
  zh_TW: 21,
};

export function resolveMetaLocale(lang: string | number): number | null {
  if (typeof lang === "number" && Number.isFinite(lang)) return lang;
  const raw = String(lang ?? "").trim();
  if (!raw || raw.toLowerCase() === "all") return null;
  const asNum = parseInt(raw, 10);
  if (!Number.isNaN(asNum) && String(asNum) === raw) return asNum;
  return ISO_TO_META_LOCALE[raw] ?? ISO_TO_META_LOCALE[raw.toLowerCase()] ?? null;
}

export function resolveMetaLocales(languages: unknown): number[] {
  if (!Array.isArray(languages) || languages.length === 0 || languages.includes("all")) {
    return [];
  }
  const ids = new Set<number>();
  for (const lang of languages) {
    const id = resolveMetaLocale(lang as string | number);
    if (id !== null) ids.add(id);
  }
  return [...ids];
}
