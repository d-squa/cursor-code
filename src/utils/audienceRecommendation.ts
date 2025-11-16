/**
 * Audience Recommendation Engine
 * Rule-based algorithm to recommend audiences based on user input and strategy focus
 */

import { 
  AudienceMatrixEntry, 
  AudiencePhase, 
  AudienceStrategy,
  getPhasesForStrategyFocus,
  getEntriesForPhase,
  getEntriesByStrategy 
} from "./audienceMatrix";

export interface UserIntent {
  description?: string;
  strategyFocus?: string;
  platform?: string;
}

export interface AvailableAudiences {
  customAudiences?: Array<{
    id: string;
    name: string;
    subtype: string; // website, customer_list, app_activity, etc.
  }>;
  lookalikeAudiences?: Array<{
    id: string;
    name: string;
    sourceAudienceId: string;
  }>;
  savedAudiences?: Array<{
    id: string;
    name: string;
  }>;
}

export interface AudienceRecommendation {
  category: "Retargeting" | "Lookalikes" | "New Acquisition" | "Saved Audiences";
  items: Array<{
    source: string;
    type: string;
    description: string;
    available: boolean;
    audienceId?: string;
    audienceName?: string;
    setupInstructions?: string;
  }>;
  justification: string;
}

/**
 * Parse user description to extract intent keywords
 */
export function parseUserIntent(description: string): {
  keywords: string[];
  detectedPhases: AudiencePhase[];
  detectedStrategies: AudienceStrategy[];
} {
  const text = description.toLowerCase();
  const keywords: string[] = [];
  const detectedPhases: AudiencePhase[] = [];
  const detectedStrategies: AudienceStrategy[] = [];

  // Retargeting keywords
  const retargetKeywords = [
    "retarget", "re-target", "return", "comeback", "previous", "visited",
    "engaged", "interacted", "viewed", "abandoned", "cart", "existing"
  ];
  
  // Expansion keywords
  const expandKeywords = [
    "new", "expand", "grow", "reach", "acquisition", "acquire", "find",
    "similar", "lookalike", "look-alike", "cold", "prospecting"
  ];

  // Phase-specific keywords
  const conversionKeywords = ["purchase", "buy", "convert", "sale", "checkout", "transaction"];
  const considerationKeywords = ["consider", "engage", "interact", "video", "content", "lead"];
  const awarenessKeywords = ["aware", "discover", "brand", "reach", "impression", "new audience"];

  // Source-specific keywords
  const sourceKeywords = {
    website: ["website", "site", "web", "pixel"],
    app: ["app", "mobile app", "application"],
    catalog: ["catalog", "catalogue", "product", "shopping"],
    customer: ["customer", "crm", "list", "email"],
    page: ["page", "facebook page", "fb page"],
    instagram: ["instagram", "ig", "insta"],
    video: ["video", "watch", "view"],
    lookalike: ["lookalike", "look-alike", "similar", "twin"]
  };

  // Extract keywords
  for (const keyword of retargetKeywords) {
    if (text.includes(keyword)) {
      keywords.push(keyword);
      detectedStrategies.push("Retarget");
    }
  }

  for (const keyword of expandKeywords) {
    if (text.includes(keyword)) {
      keywords.push(keyword);
      detectedStrategies.push("Expand");
    }
  }

  // Detect phases
  if (conversionKeywords.some(kw => text.includes(kw))) {
    detectedPhases.push("Conversion");
  }
  if (considerationKeywords.some(kw => text.includes(kw))) {
    detectedPhases.push("Consideration");
  }
  if (awarenessKeywords.some(kw => text.includes(kw))) {
    detectedPhases.push("Awareness");
  }

  // Detect sources
  for (const [source, sourceKws] of Object.entries(sourceKeywords)) {
    if (sourceKws.some(kw => text.includes(kw))) {
      keywords.push(source);
    }
  }

  // Remove duplicates
  const uniquePhases = Array.from(new Set(detectedPhases));
  const uniqueStrategies = Array.from(new Set(detectedStrategies));

  return {
    keywords,
    detectedPhases: uniquePhases,
    detectedStrategies: uniqueStrategies
  };
}

/**
 * Generate audience recommendations based on user intent and available data
 */
export function generateAudienceRecommendations(
  userIntent: UserIntent,
  availableAudiences: AvailableAudiences
): AudienceRecommendation[] {
  const recommendations: AudienceRecommendation[] = [];
  const { strategyFocus = "conversions", platform = "Meta", description = "" } = userIntent;

  // Parse user description if provided
  const parsedIntent = description ? parseUserIntent(description) : null;

  // Determine which phases to focus on
  let targetPhases: AudiencePhase[];
  if (parsedIntent && parsedIntent.detectedPhases.length > 0) {
    targetPhases = parsedIntent.detectedPhases;
  } else {
    targetPhases = getPhasesForStrategyFocus(strategyFocus);
  }

  // Determine strategies to prioritize
  let targetStrategies: AudienceStrategy[];
  if (parsedIntent && parsedIntent.detectedStrategies.length > 0) {
    targetStrategies = parsedIntent.detectedStrategies;
  } else {
    // Default priority: Retarget > Expand
    targetStrategies = ["Retarget", "Expand"];
  }

  // 1. RETARGETING RECOMMENDATIONS
  if (targetStrategies.includes("Retarget")) {
    const retargetingEntries = getEntriesByStrategy("Retarget", platform);
    const retargetingItems = retargetingEntries
      .filter(entry => targetPhases.includes(entry.phase))
      .map(entry => {
        // Check if this audience type is available
        const available = checkAudienceAvailability(entry, availableAudiences, parsedIntent?.keywords);
        return {
          source: entry.source,
          type: entry.type,
          description: entry.description || "",
          available: available.exists,
          audienceId: available.audienceId,
          audienceName: available.audienceName,
          setupInstructions: available.exists ? undefined : getSetupInstructions(entry.source)
        };
      });

    if (retargetingItems.length > 0) {
      recommendations.push({
        category: "Retargeting",
        items: retargetingItems,
        justification: description 
          ? `Based on "${description}", retargeting past visitors and engagers is recommended.`
          : `Retargeting is recommended for ${strategyFocus} campaigns to convert warm audiences.`
      });
    }
  }

  // 2. LOOKALIKE RECOMMENDATIONS
  if (targetStrategies.includes("Expand") && targetPhases.includes("Consideration")) {
    const lookalikeItems = (availableAudiences.lookalikeAudiences || []).map(la => ({
      source: "Lookalikes",
      type: "Lookalike Audience",
      description: `Find users similar to: ${la.name}`,
      available: true,
      audienceId: la.id,
      audienceName: la.name
    }));

    if (lookalikeItems.length > 0) {
      recommendations.push({
        category: "Lookalikes",
        items: lookalikeItems,
        justification: "Lookalike audiences help you expand reach to users similar to your best customers."
      });
    } else {
      // Suggest creating lookalikes if custom audiences exist
      if ((availableAudiences.customAudiences || []).length > 0) {
        recommendations.push({
          category: "Lookalikes",
          items: [{
            source: "Lookalikes",
            type: "Lookalike Audience",
            description: "Create lookalike audiences from your custom audiences",
            available: false,
            setupInstructions: getSetupInstructions("Lookalikes")
          }],
          justification: "Consider creating lookalike audiences to expand your reach effectively."
        });
      }
    }
  }

  // 3. NEW ACQUISITION RECOMMENDATIONS
  if (targetStrategies.includes("Expand") && targetPhases.includes("Awareness")) {
    const awarenessEntries = getEntriesForPhase("Awareness", platform);
    const acquisitionItems = awarenessEntries
      .filter(entry => entry.source === "Native Audience")
      .map(entry => ({
        source: entry.features || "Native Audience",
        type: entry.type,
        description: entry.description || "",
        available: true, // Native audiences are always available
      }));

    if (acquisitionItems.length > 0) {
      recommendations.push({
        category: "New Acquisition",
        items: acquisitionItems,
        justification: description
          ? `Based on "${description}", expanding to new cold audiences is recommended.`
          : "Target new users through interests, demographics, and behaviors to grow awareness."
      });
    }
  }

  // 4. SAVED AUDIENCES RECOMMENDATIONS
  if ((availableAudiences.savedAudiences || []).length > 0) {
    const savedItems = availableAudiences.savedAudiences!.map(sa => ({
      source: "Saved Audience",
      type: "Saved Audience",
      description: `Pre-configured audience: ${sa.name}`,
      available: true,
      audienceId: sa.id,
      audienceName: sa.name
    }));

    recommendations.push({
      category: "Saved Audiences",
      items: savedItems,
      justification: "Use your saved audiences to quickly apply proven targeting configurations."
    });
  }

  return recommendations;
}

/**
 * Check if a specific audience type is available in the account
 */
function checkAudienceAvailability(
  entry: AudienceMatrixEntry,
  available: AvailableAudiences,
  keywords?: string[]
): { exists: boolean; audienceId?: string; audienceName?: string } {
  if (entry.type !== "Custom Audience") {
    return { exists: false };
  }

  const customAudiences = available.customAudiences || [];
  
  // Map entry source to Meta subtype
  const sourceToSubtype: Record<string, string[]> = {
    "Website": ["website", "pixel"],
    "App Activity": ["app_activity", "mobile_app"],
    "Customer List": ["customer_list", "contact_list"],
    "Catalog": ["catalog", "dynamic_ad"],
    "Facebook Page": ["page", "engagement"],
    "Instagram Account": ["instagram", "ig_business"],
    "Video": ["video", "engagement"],
    "Events": ["event", "offline_event"],
    "Lead Form": ["lead_gen", "form"],
    "Shopping": ["shopping", "product"],
    "Offline Activity": ["offline", "store_visit"]
  };

  const subtypes = sourceToSubtype[entry.source] || [];
  
  // Check if any custom audience matches
  for (const audience of customAudiences) {
    const audienceSubtype = audience.subtype.toLowerCase();
    const audienceName = audience.name.toLowerCase();
    
    // Match by subtype
    if (subtypes.some(st => audienceSubtype.includes(st))) {
      return { exists: true, audienceId: audience.id, audienceName: audience.name };
    }
    
    // Match by keywords in name if provided
    if (keywords && keywords.some(kw => audienceName.includes(kw))) {
      return { exists: true, audienceId: audience.id, audienceName: audience.name };
    }
  }

  return { exists: false };
}

/**
 * Get setup instructions for creating an audience
 */
function getSetupInstructions(source: string): string {
  const instructions: Record<string, string> = {
    "Website": "To create a Website Custom Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → Website. Install the Meta Pixel on your website first.",
    "App Activity": "To create an App Activity Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → App Activity. Ensure the Meta SDK is integrated in your app.",
    "Customer List": "To create a Customer List Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → Customer List. Upload a CSV file with customer emails or phone numbers.",
    "Lookalikes": "To create a Lookalike Audience: Go to Meta Ads Manager → Audiences → Create Audience → Lookalike Audience. Select a source audience (minimum 100 people) and choose your target country.",
    "Catalog": "To create a Catalog Audience: First set up a Product Catalog in Meta Commerce Manager, then create a Custom Audience based on product interactions.",
    "Facebook Page": "To create a Page Engagement Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → Facebook Page → People who engaged with your Page.",
    "Instagram Account": "To create an Instagram Engagement Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → Instagram Business Account → People who engaged with your profile.",
    "Video": "To create a Video Engagement Audience: Go to Meta Ads Manager → Audiences → Create Audience → Custom Audience → Video → People who watched your videos.",
    "Default": "To create this audience type, go to Meta Ads Manager → Audiences → Create Audience and follow the setup wizard."
  };

  return instructions[source] || instructions["Default"];
}
