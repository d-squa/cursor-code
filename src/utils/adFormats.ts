// Platform ID to ad format platform name mapping
export const platformIdToAdFormatKey: Record<string, string> = {
  "meta": "Facebook (Meta)",
  "Meta": "Facebook (Meta)",
  "instagram": "Instagram (Meta)",
  "Instagram": "Instagram (Meta)",
  "google": "Google Ads",
  "Google Ads": "Google Ads",
  "google_search": "Google Ads — Search",
  "google_display": "Google Ads — Display",
  "google_video": "Google Ads — Video",
  "google_pmax": "Google Ads — Performance Max",
  "google_demand_gen": "Google Ads — Demand Gen",
  "google_shopping": "Google Ads — Shopping",
  "google_app": "Google Ads — App Promotion",
  "x": "X (formerly Twitter)",
  "twitter": "X (formerly Twitter)",
  "linkedin": "LinkedIn",
  "LinkedIn": "LinkedIn",
  "tiktok": "TikTok",
  "Tiktok": "TikTok",
  "TikTok": "TikTok",
  "snapchat": "Snapchat",
  "Snapchat": "Snapchat",
  "pinterest": "Pinterest",
  "Pinterest": "Pinterest",
};

// Platform ad formats mapping
export const platformAdFormats: Record<string, string[]> = {
  "Facebook (Meta)": [
    "Image ads",
    "Video ads",
    "Carousel ads",
    "Collection ads",
    "Instant Experience ads (formerly Canvas)",
    "Stories ads",
    "Lead ads",
    "Messenger ads",
    "Dynamic ads",
  ],
  "Instagram (Meta)": [
    "Image ads",
    "Video ads",
    "Carousel ads",
    "Stories ads",
    "Reels ads",
    "Collection ads",
    "Shopping tags",
  ],
  "X (formerly Twitter)": [
    "Promoted ads (text, image, video)",
    "Image ads",
    "Video ads",
    "Carousel ads",
    "Timeline Takeover",
    "Trend Takeover",
    "Amplify Pre-Roll",
    "Dynamic Product Ads (DPAs)",
  ],
  "LinkedIn": [
    "Sponsored Content (Single Image, Video, Carousel, Document)",
    "Sponsored Messaging (Message ads, Conversation ads)",
    "Dynamic ads (Follower ads, Spotlight ads)",
    "Text ads",
    "Lead Generation Forms",
  ],
  "TikTok": [
    "In-Feed ads",
    "TopView and Brand Takeover ads",
    "Branded Hashtag Challenge",
    "Spark ads",
    "Branded Effects",
    "Video Shopping ads",
  ],
  "Pinterest": [
    "Standard (Static Image) ads",
    "Video ads (Standard, Max. Width)",
    "Carousel ads",
    "Collection ads",
    "Idea ads",
    "Shopping ads",
  ],
  "Snapchat": [
    "Single Image or Video ads",
    "Commercials",
    "Story ads",
    "Collection ads",
    "AR Lenses",
    "Filters (including Geo-Filters)",
  ],
  "YouTube (Google)": [
    "Skippable In-Stream ads",
    "Non-Skippable In-Stream ads",
    "Bumper ads",
    "In-Feed video ads",
    "Outstream ads",
    "Masthead",
    "Text Ads",
  ],
  "Google Ads": [
    // Search
    "Responsive Search Ads",
    "Text Ads",
    // Display
    "Responsive Display Ads",
    "Uploaded Image Ads",
    "HTML5 Ads",
    // Video
    "In-stream Ads (Bumper, Skippable)",
    "Non-skippable In-stream Ads",
    "In-feed Ads",
    "Shorts Ads",
    "Audio Ads",
    // Demand Gen
    "Single Image Ads",
    "Video Ads",
    "Carousel Ads",
    "Product Ads",
    // Shopping
    "Product Shopping Ads",
    "Showcase Shopping Ads",
    // PMax
    "Asset Groups (Auto-generated)",
    // App
    "App Install Ads (Auto-generated)",
  ],
  "Google Ads — Search": [
    "Responsive Search Ads",
    "Text Ads",
  ],
  "Google Ads — Display": [
    "Responsive Display Ads",
    "Uploaded Image Ads",
    "HTML5 Ads",
  ],
  "Google Ads — Video": [
    "In-stream Ads (Bumper, Skippable)",
    "Non-skippable In-stream Ads",
    "In-feed Ads",
    "Shorts Ads",
    "Multi-format Ads (Skippable In-stream, Bumper, In-feed, Shorts)",
    "Audio Ads",
    "Bumper Ads",
    "Skippable In-stream Ads",
  ],
  "Google Ads — Performance Max": [
    "Asset Groups (Auto-generated)",
  ],
  "Google Ads — Demand Gen": [
    "Single Image Ads",
    "Video Ads",
    "Carousel Ads",
    "Product Ads",
  ],
  "Google Ads — Shopping": [
    "Product Shopping Ads",
    "Showcase Shopping Ads",
  ],
  "Google Ads — App Promotion": [
    "App Install Ads (Auto-generated)",
    "App Engagement Ads (Auto-generated)",
    "App Pre-registration Ads (Auto-generated)",
  ],
};

// Ad format to funnel stage and objective mapping
interface AdFormatMapping {
  funnelStage: 'Awareness' | 'Consideration' | 'Conversion' | 'Loyalty';
  objective: string;
}

export const adFormatMatrix: Record<string, Record<string, AdFormatMapping>> = {
  "Facebook (Meta)": {
    "Image ads": { funnelStage: "Awareness", objective: "Reach / Brand Awareness" },
    "Video ads": { funnelStage: "Awareness", objective: "Video Views / Reach" },
    "Carousel ads": { funnelStage: "Consideration", objective: "Traffic / Engagement" },
    "Collection ads": { funnelStage: "Consideration", objective: "Traffic / Product Discovery" },
    "Instant Experience ads (formerly Canvas)": { funnelStage: "Awareness", objective: "Immersive Branding / Storytelling" },
    "Stories ads": { funnelStage: "Awareness", objective: "Reach / Impressions" },
    "Lead ads": { funnelStage: "Conversion", objective: "Lead Generation" },
    "Messenger ads": { funnelStage: "Consideration", objective: "Engagement / Conversation" },
    "Dynamic ads": { funnelStage: "Conversion", objective: "Sales / Retargeting" },
  },
  "Instagram (Meta)": {
    "Image ads": { funnelStage: "Awareness", objective: "Reach / Brand Awareness" },
    "Video ads": { funnelStage: "Awareness", objective: "Video Views / Engagement" },
    "Carousel ads": { funnelStage: "Consideration", objective: "Engagement / Product Exploration" },
    "Stories ads": { funnelStage: "Awareness", objective: "Reach / Impressions" },
    "Reels ads": { funnelStage: "Awareness", objective: "Engagement / Discovery" },
    "Collection ads": { funnelStage: "Conversion", objective: "Purchases / Traffic" },
    "Shopping tags": { funnelStage: "Conversion", objective: "Product Sales / Catalog" },
  },
  "X (formerly Twitter)": {
    "Promoted ads (text, image, video)": { funnelStage: "Awareness", objective: "Reach / Engagement" },
    "Image ads": { funnelStage: "Awareness", objective: "Brand Awareness" },
    "Video ads": { funnelStage: "Awareness", objective: "Video Views" },
    "Carousel ads": { funnelStage: "Consideration", objective: "Engagement / Traffic" },
    "Timeline Takeover": { funnelStage: "Awareness", objective: "Mass Reach / Visibility" },
    "Trend Takeover": { funnelStage: "Awareness", objective: "Brand Awareness / Buzz" },
    "Amplify Pre-Roll": { funnelStage: "Awareness", objective: "Video Views / Brand Lift" },
    "Dynamic Product Ads (DPAs)": { funnelStage: "Conversion", objective: "Retargeting / Sales" },
  },
  "LinkedIn": {
    "Sponsored Content (Single Image, Video, Carousel, Document)": { funnelStage: "Awareness", objective: "Brand Awareness / Engagement" },
    "Sponsored Messaging (Message ads, Conversation ads)": { funnelStage: "Consideration", objective: "Engagement / Retention" },
    "Dynamic ads (Follower ads, Spotlight ads)": { funnelStage: "Awareness", objective: "Brand Awareness / Follows" },
    "Text ads": { funnelStage: "Consideration", objective: "Traffic / Awareness" },
    "Lead Generation Forms": { funnelStage: "Conversion", objective: "Lead Collection" },
  },
  "TikTok": {
    "In-Feed ads": { funnelStage: "Awareness", objective: "Reach / Engagement" },
    "TopView and Brand Takeover ads": { funnelStage: "Awareness", objective: "Mass Reach / Video Views" },
    "Branded Hashtag Challenge": { funnelStage: "Awareness", objective: "Engagement / UGC" },
    "Spark ads": { funnelStage: "Consideration", objective: "Engagement / Sales" },
    "Branded Effects": { funnelStage: "Awareness", objective: "Brand Interaction" },
    "Video Shopping ads": { funnelStage: "Conversion", objective: "Direct Sales" },
  },
  "Pinterest": {
    "Standard (Static Image) ads": { funnelStage: "Awareness", objective: "Reach / Discovery" },
    "Video ads (Standard, Max. Width)": { funnelStage: "Awareness", objective: "Views / Brand Recall" },
    "Carousel ads": { funnelStage: "Consideration", objective: "Product Discovery" },
    "Collection ads": { funnelStage: "Consideration", objective: "Traffic / Purchases" },
    "Idea ads": { funnelStage: "Awareness", objective: "Engagement / Inspiration" },
    "Shopping ads": { funnelStage: "Conversion", objective: "Sales / Retargeting" },
  },
  "Snapchat": {
    "Single Image or Video ads": { funnelStage: "Awareness", objective: "Reach / Impressions" },
    "Commercials": { funnelStage: "Awareness", objective: "Video Views / Brand Lift" },
    "Story ads": { funnelStage: "Consideration", objective: "Engagement / Traffic" },
    "Collection ads": { funnelStage: "Conversion", objective: "Product Sales / Retargeting" },
    "AR Lenses": { funnelStage: "Awareness", objective: "Interaction / Engagement" },
    "Filters (including Geo-Filters)": { funnelStage: "Awareness", objective: "Local Reach / Brand Engagement" },
  },
  "YouTube (Google)": {
    "Skippable In-Stream ads": { funnelStage: "Awareness", objective: "Views / Remarketing" },
    "Non-Skippable In-Stream ads": { funnelStage: "Awareness", objective: "Reach / Brand Recall" },
    "Bumper ads": { funnelStage: "Awareness", objective: "Short-Form Brand Recall" },
    "In-Feed video ads": { funnelStage: "Consideration", objective: "Engagement / Direct Response" },
    "Outstream ads": { funnelStage: "Awareness", objective: "Reach (Mobile)" },
    "Masthead": { funnelStage: "Awareness", objective: "Mass Reach / Product Launch" },
    "Text Ads": { funnelStage: "Conversion", objective: "Search-Based Action / Sales" },
  },
  "Google Ads": {
    "Responsive Search Ads": { funnelStage: "Conversion", objective: "Search-Based Conversions" },
    "Text Ads": { funnelStage: "Conversion", objective: "Search-Based Action / Sales" },
    "Responsive Display Ads": { funnelStage: "Awareness", objective: "Reach / Display" },
    "Uploaded Image Ads": { funnelStage: "Awareness", objective: "Display Awareness" },
    "HTML5 Ads": { funnelStage: "Awareness", objective: "Interactive Display" },
    "In-stream Ads (Bumper, Skippable)": { funnelStage: "Awareness", objective: "Video Reach" },
    "Non-skippable In-stream Ads": { funnelStage: "Awareness", objective: "Guaranteed Reach" },
    "In-feed Ads": { funnelStage: "Consideration", objective: "Engagement / Discovery" },
    "Shorts Ads": { funnelStage: "Awareness", objective: "Short-form Reach" },
    "Audio Ads": { funnelStage: "Awareness", objective: "Audio Reach" },
    "Single Image Ads": { funnelStage: "Consideration", objective: "Demand Gen Traffic" },
    "Video Ads": { funnelStage: "Consideration", objective: "Demand Gen Engagement" },
    "Carousel Ads": { funnelStage: "Consideration", objective: "Demand Gen Discovery" },
    "Product Ads": { funnelStage: "Conversion", objective: "Product Sales" },
    "Product Shopping Ads": { funnelStage: "Conversion", objective: "Shopping Sales" },
    "Showcase Shopping Ads": { funnelStage: "Consideration", objective: "Shopping Discovery" },
    "Asset Groups (Auto-generated)": { funnelStage: "Consideration", objective: "PMax Multi-Channel" },
    "App Install Ads (Auto-generated)": { funnelStage: "Consideration", objective: "App Installs" },
    "App Engagement Ads (Auto-generated)": { funnelStage: "Consideration", objective: "App Engagement" },
    "App Pre-registration Ads (Auto-generated)": { funnelStage: "Consideration", objective: "App Pre-registration" },
  },
};

// Get phases from selected ad formats
export const getPhasesFromAdFormats = (
  platformName: string,
  adFormats: string[]
): { name: string; funnelStage: string; objective: string }[] => {
  const platformMatrix = adFormatMatrix[platformName];
  if (!platformMatrix) return [];

  const stageGroups: Record<string, { objective: string; count: number }> = {};

  adFormats.forEach(format => {
    const mapping = platformMatrix[format];
    if (mapping) {
      const stage = mapping.funnelStage;
      if (!stageGroups[stage]) {
        stageGroups[stage] = { objective: mapping.objective, count: 0 };
      }
      stageGroups[stage].count++;
    }
  });

  return Object.entries(stageGroups).map(([stage, data]) => ({
    name: stage,
    funnelStage: stage,
    objective: data.objective,
  }));
};
