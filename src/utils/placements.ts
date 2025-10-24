// Platform + AdFormat -> Placements mapping
export const placementsByPlatformAndFormat: Record<string, Record<string, string[]>> = {
  "Facebook (Meta)": {
    "Image ads": ["Feed", "Right Column", "Marketplace", "Stories"],
    "Video ads": ["Feed", "In-Stream", "Stories", "Reels"],
    "Carousel ads": ["Feed", "Stories"],
    "Collection ads": ["Feed", "Shop"],
    "Instant Experience ads (formerly Canvas)": ["Feed"],
    "Stories ads": ["Stories"],
    "Lead ads": ["Feed"],
    "Messenger ads": ["Messenger"],
    "Dynamic ads": ["Feed", "Marketplace"],
  },
  "Instagram (Meta)": {
    "Image ads": ["Feed", "Stories", "Explore", "Reels"],
    "Video ads": ["Feed", "Stories", "Explore", "Reels"],
    "Carousel ads": ["Feed", "Stories"],
    "Stories ads": ["Stories"],
    "Reels ads": ["Reels"],
    "Collection ads": ["Feed", "Explore"],
    "Shopping tags": ["Shop", "Explore"],
  },
  "X (formerly Twitter)": {
    "Promoted ads (text, image, video)": ["Home Timeline", "Profiles", "Search Results"],
    "Image ads": ["Home Timeline", "Profiles", "Search Results"],
    "Video ads": ["Home Timeline", "Profiles", "Search Results"],
    "Carousel ads": ["Home Timeline", "Profiles"],
    "Timeline Takeover": ["Timeline Takeover"],
    "Trend Takeover": ["Trends"],
    "Amplify Pre-Roll": ["Pre-Roll"],
    "Dynamic Product Ads (DPAs)": ["Home Timeline"],
  },
  "LinkedIn": {
    "Sponsored Content (Single Image, Video, Carousel, Document)": ["Feed"],
    "Sponsored Messaging (Message ads, Conversation ads)": ["Inbox"],
    "Dynamic ads (Follower ads, Spotlight ads)": ["Right Rail"],
    "Text ads": ["Top of Page"],
    "Lead Generation Forms": ["Feed"],
  },
  "TikTok": {
    "In-Feed ads": ["For You"],
    "TopView and Brand Takeover ads": ["TopView", "Brand Takeover"],
    "Branded Hashtag Challenge": ["Hashtag Challenge"],
    "Spark ads": ["In-Feed"],
    "Branded Effects": ["Branded Effects"],
    "Video Shopping ads": ["Shopping"],
  },
  "Pinterest": {
    "Standard (Static Image) ads": ["Home Feed", "Related Pins"],
    "Video ads (Standard, Max. Width)": ["Home Feed"],
    "Carousel ads": ["Home Feed"],
    "Collection ads": ["Home Feed"],
    "Idea ads": ["Idea Pins"],
    "Shopping ads": ["Shop"],
  },
  "Snapchat": {
    "Single Image or Video ads": ["Stories", "Discover"],
    "Commercials": ["Commercials"],
    "Story ads": ["Discover"],
    "Collection ads": ["Discover"],
    "AR Lenses": ["Lenses"],
    "Filters (including Geo-Filters)": ["Filters"],
  },
  "YouTube (Google)": {
    "Skippable In-Stream ads": ["YouTube Videos", "Partner Sites"],
    "Non-Skippable In-Stream ads": ["YouTube Videos", "Partner Sites"],
    "Bumper ads": ["YouTube Videos", "Partner Sites"],
    "In-Feed video ads": ["YouTube Search", "Watch Next", "Home Feed"],
    "Outstream ads": ["Partner Sites"],
    "Masthead": ["YouTube Home"],
    "Text Ads": ["YouTube Search"],
  },
};

export const getPlacementsForSelection = (platformName: string, adFormats: string[]): string[] => {
  const platformMap = placementsByPlatformAndFormat[platformName];
  if (!platformMap) return [];
  const set = new Set<string>();
  adFormats.forEach((f) => {
    const arr = platformMap[f];
    arr?.forEach((p) => set.add(p));
  });
  return Array.from(set).sort();
};
