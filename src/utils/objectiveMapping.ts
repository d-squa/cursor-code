// Auto-map generic objectives to platform-specific equivalents

export const mapObjectiveToPlatform = (
  genericObjective: string,
  platformId: string
): string => {
  const mappings: Record<string, Record<string, string>> = {
    "Brand Awareness": {
      meta: "Brand Awareness",
      google: "Display",
      linkedin: "Brand Awareness",
      tiktok: "Reach",
      snapchat: "Awareness",
      pinterest: "Brand Awareness",
    },
    "Video Views": {
      meta: "Video Views",
      google: "Video",
      linkedin: "Video Views",
      tiktok: "Video Views",
      snapchat: "Consideration",
      pinterest: "Video Views",
    },
    "Lead Generation": {
      meta: "Lead Generation",
      google: "Search",
      linkedin: "Lead Generation",
      tiktok: "Lead Generation",
      snapchat: "Conversions",
      pinterest: "Conversions",
    },
    "Conversions": {
      meta: "Conversions",
      google: "Performance Max",
      linkedin: "Conversions",
      tiktok: "Conversions",
      snapchat: "Conversions",
      pinterest: "Conversions",
    },
    "Traffic": {
      meta: "Traffic",
      google: "Search",
      linkedin: "Website Visits",
      tiktok: "Traffic",
      snapchat: "Consideration",
      pinterest: "Consideration",
    },
    "App Installs": {
      meta: "App Installs",
      google: "App",
      linkedin: "Conversions",
      tiktok: "App Installs",
      snapchat: "Conversions",
      pinterest: "Conversions",
    },
    "Engagement": {
      meta: "Engagement",
      google: "Display",
      linkedin: "Engagement",
      tiktok: "Community Interaction",
      snapchat: "Consideration",
      pinterest: "Consideration",
    },
  };

  return mappings[genericObjective]?.[platformId] || genericObjective;
};

export const mapOptimizationGoalToPlatform = (
  genericGoal: string,
  platformId: string
): string => {
  const mappings: Record<string, Record<string, string>> = {
    "Impressions": {
      meta: "Impressions",
      google: "Impressions",
      linkedin: "Impressions",
      tiktok: "Reach",
      snapchat: "Impressions",
      pinterest: "Awareness",
    },
    "Clicks": {
      meta: "Link Clicks",
      google: "Clicks",
      linkedin: "Clicks",
      tiktok: "Click",
      snapchat: "Swipes",
      pinterest: "Consideration",
    },
    "Conversions": {
      meta: "Conversions",
      google: "Conversions",
      linkedin: "Conversions",
      tiktok: "Conversion",
      snapchat: "Pixel Purchases",
      pinterest: "Conversions",
    },
  };

  return mappings[genericGoal]?.[platformId] || genericGoal;
};
