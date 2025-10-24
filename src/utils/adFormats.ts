export const platformAdFormats: Record<string, string[]> = {
  meta: [
    "Image ads",
    "Video ads",
    "Carousel ads",
    "Collection ads",
    "Instant Experience ads",
    "Stories ads",
    "Lead ads",
    "Messenger ads",
    "Dynamic ads",
  ],
  instagram: [
    "Image ads",
    "Video ads",
    "Carousel ads",
    "Stories ads",
    "Reels ads",
    "Collection ads",
    "Shopping tags",
  ],
  x: [
    "Promoted ads",
    "Image ads",
    "Video ads",
    "Carousel ads",
    "Timeline Takeover",
    "Trend Takeover",
    "Amplify Pre-Roll",
    "Dynamic Product Ads",
  ],
  linkedin: [
    "Sponsored Content (Single Image)",
    "Sponsored Content (Video)",
    "Sponsored Content (Carousel)",
    "Sponsored Content (Document)",
    "Sponsored Messaging (Message ads)",
    "Sponsored Messaging (Conversation ads)",
    "Dynamic ads (Follower ads)",
    "Dynamic ads (Spotlight ads)",
    "Text ads",
    "Lead Generation Forms",
  ],
  tiktok: [
    "In-Feed ads",
    "TopView ads",
    "Brand Takeover ads",
    "Branded Hashtag Challenge",
    "Spark ads",
    "Branded Effects",
    "Video Shopping ads",
  ],
  pinterest: [
    "Standard (Static Image) ads",
    "Video ads (Standard)",
    "Video ads (Max Width)",
    "Carousel ads",
    "Collection ads",
    "Idea ads",
    "Shopping ads",
  ],
  snapchat: [
    "Single Image ads",
    "Video ads",
    "Commercials",
    "Story ads",
    "Collection ads",
    "AR Lenses",
    "Filters",
    "Geo-Filters",
  ],
  google: [
    "Skippable In-Stream ads",
    "Non-Skippable In-Stream ads",
    "Bumper ads",
    "In-Feed video ads",
    "Outstream ads",
    "Masthead",
    "Search ads",
    "Display ads",
    "Shopping ads",
  ],
};

export const getObjectiveForAssetTypes = (
  platformId: string,
  assetTypes: string[],
  stage: string,
  focus: string
): string => {
  const hasVideo = assetTypes.some(type => 
    type.toLowerCase().includes("video") || type.toLowerCase().includes("reels")
  );
  
  const hasStatic = assetTypes.some(type => 
    type.toLowerCase().includes("image") || type.toLowerCase().includes("static")
  );

  const objectives: Record<string, Record<string, Record<string, string>>> = {
    meta: {
      awareness: { 
        default: "Brand Awareness",
        video: "Video Views",
      },
      consideration: { 
        default: "Traffic",
        video: "Video Views",
        purchase: "Traffic",
        leads: "Lead Generation",
        "app-installs": "App Installs",
      },
      conversion: { 
        default: "Conversions",
        purchase: "Conversions",
        leads: "Lead Generation",
        "app-installs": "App Installs",
      },
      loyalty: { 
        default: "Engagement",
        purchase: "Conversions",
      },
    },
    google: {
      awareness: { 
        default: "Display",
        video: "Video",
      },
      consideration: { 
        default: "Search",
        video: "Video",
        "app-installs": "App",
      },
      conversion: { 
        default: "Performance Max",
        purchase: "Shopping",
        leads: "Search",
        "app-installs": "App",
      },
      loyalty: { 
        default: "Performance Max",
      },
    },
    tiktok: {
      awareness: {
        default: "Reach",
        video: "Video Views",
      },
      consideration: {
        default: "Traffic",
        video: "Video Views",
      },
      conversion: {
        default: "Conversions",
      },
      loyalty: {
        default: "Community Interaction",
      },
    },
    linkedin: {
      awareness: {
        default: "Brand Awareness",
        video: "Video Views",
      },
      consideration: {
        default: "Website Visits",
        video: "Video Views",
      },
      conversion: {
        default: "Conversions",
        leads: "Lead Generation",
      },
      loyalty: {
        default: "Engagement",
      },
    },
  };

  const stageObjectives = objectives[platformId]?.[stage];
  if (!stageObjectives) return "";

  // If video assets, prioritize video objective
  if (hasVideo && stageObjectives.video) {
    return stageObjectives.video;
  }

  // Otherwise use focus-specific or default
  return stageObjectives[focus] || stageObjectives.default || "";
};
