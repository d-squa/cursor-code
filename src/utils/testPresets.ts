import { PlatformWithMarkets } from "@/types/mediaplan";
import { format } from "date-fns";

interface PresetWithMeta {
  platforms: PlatformWithMarkets[];
  startDate: string;
  endDate: string;
  totalBudget: number;
}

// R&F-specific preset for Meta Italy with proper placements
export const getRFTestPreset = (): PresetWithMeta => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() + 1);
  const end = new Date(today);
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() + 1);

  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(end, "yyyy-MM-dd"),
    totalBudget: 2000,
    platforms: [
      {
        id: "meta",
        name: "Meta",
        enabled: true,
        budgetPercentage: 100,
        markets: [
          {
            id: "meta-it",
            name: "Italy",
            budgetPercentage: 100,
            accountName: "account-1",
            page: "1757934224274443",
            pixel: "pixel-1",
            countries: ["IT"],
            ageMin: 18,
            ageMax: 65,
            publisherPlatforms: ["audience_network"],
            positions: {
              audience_network: ["native_banner_interstitial", "instream_video"],
            },
            adFormats: ["Video ads"],
            phases: [],
          },
        ],
      },
    ],
  };
};

// Multi-platform test preset to exercise auto-detect across platforms/markets
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
        budgetPercentage: 50,
        accountName: "account-1",
        page: "page-1",
        pixel: "pixel-1",
        catalog: "catalog-1",
        adFormats: ["Dynamic ads", "Carousel ads"],
        phases: [],
      },
      {
        id: "meta-uk",
        name: "United Kingdom",
        budgetPercentage: 30,
        accountName: "account-2",
        page: "page-2",
        pixel: "pixel-2",
        // No catalog on purpose
        adFormats: ["Lead ads", "Stories ads"],
        phases: [],
      },
      {
        id: "meta-ca",
        name: "Canada",
        budgetPercentage: 20,
        accountName: "account-1",
        page: "page-1",
        // No pixel/catalog on purpose
        adFormats: ["Video ads"],
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
        accountName: "account-1",
        // Video formats without pixel/catalog to test awareness focus
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
        accountName: "account-1",
        adFormats: [
          "Lead Generation Forms",
          "Sponsored Content (Single Image, Video, Carousel, Document)",
        ],
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
        accountName: "account-2",
        // Pixel present to test conversion focus
        pixel: "pixel-1",
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
        accountName: "account-1",
        pixel: "pixel-2",
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
        accountName: "account-2",
        // Catalog requires pixel - both present to test purchase focus
        pixel: "pixel-1",
        catalog: "catalog-2",
        adFormats: ["Shopping ads", "Carousel ads"],
        phases: [],
      },
    ],
  },
];
