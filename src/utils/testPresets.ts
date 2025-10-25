import { PlatformWithMarkets } from "@/types/mediaplan";

// Pre-filled test presets to exercise auto-detect across platforms/markets
export const getTestPresets = (): PlatformWithMarkets[] => [
  {
    id: "meta",
    name: "Meta",
    enabled: true,
    budgetPercentage: 35,
    markets: [
      {
        id: "meta-us",
        name: "United States",
        budgetPercentage: 60,
        accountName: "Meta US Account",
        page: "Meta US Page",
        pixel: "pixel-1",
        catalog: "catalog-us",
        adFormats: ["Dynamic ads", "Carousel ads"],
        phases: [],
      },
      {
        id: "meta-uk",
        name: "United Kingdom",
        budgetPercentage: 40,
        accountName: "Meta UK Account",
        page: "Meta UK Page",
        pixel: "pixel-uk",
        // No catalog on purpose
        adFormats: ["Lead ads", "Stories ads"],
        phases: [],
      },
    ],
  },
  {
    id: "google",
    name: "Google Ads",
    enabled: true,
    budgetPercentage: 20,
    markets: [
      {
        id: "google-us",
        name: "United States",
        budgetPercentage: 100,
        accountName: "Google US Account",
        // Pixel/Catalog are N/A but we set pixel to test conversions fallback
        pixel: "ga4-us",
        adFormats: ["Skippable In-Stream ads", "In-Feed video ads"],
        phases: [],
      },
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    enabled: true,
    budgetPercentage: 15,
    markets: [
      {
        id: "li-de",
        name: "Germany",
        budgetPercentage: 100,
        accountName: "LinkedIn DACH",
        adFormats: ["Lead Generation Forms", "Sponsored Content (Single Image, Video, Carousel, Document)"],
        phases: [],
      },
    ],
  },
  {
    id: "tiktok",
    name: "TikTok",
    enabled: true,
    budgetPercentage: 10,
    markets: [
      {
        id: "tt-fr",
        name: "France",
        budgetPercentage: 100,
        accountName: "TikTok FR",
        // Shopping indicates purchase focus
        adFormats: ["Video Shopping ads", "In-Feed ads"],
        phases: [],
      },
    ],
  },
  {
    id: "snapchat",
    name: "Snapchat",
    enabled: true,
    budgetPercentage: 10,
    markets: [
      {
        id: "sc-es",
        name: "Spain",
        budgetPercentage: 100,
        accountName: "Snapchat ES",
        pixel: "snap-pixel-es",
        adFormats: ["Collection ads", "Story ads"],
        phases: [],
      },
    ],
  },
  {
    id: "pinterest",
    name: "Pinterest",
    enabled: true,
    budgetPercentage: 10,
    markets: [
      {
        id: "pin-it",
        name: "Italy",
        budgetPercentage: 100,
        accountName: "Pinterest IT",
        // Shopping indicates purchase focus
        adFormats: ["Shopping ads", "Carousel ads"],
        phases: [],
      },
    ],
  },
];
