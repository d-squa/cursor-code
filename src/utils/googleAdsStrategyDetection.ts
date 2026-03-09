/**
 * Google Ads Strategy Auto-Detection
 * 
 * Determines the appropriate campaign types and phases based on:
 * 1. Selected ad formats
 * 2. Selected bid strategy
 * 3. Audience segments (targeting or observation)
 * 4. Keywords
 * 
 * These signals map to the Google Ads campaign matrix to generate
 * the correct phases/campaigns for the media plan.
 */

import {
  GOOGLE_ADS_CAMPAIGN_MATRIX,
  type GoogleAdsCampaignType,
} from "./googleAdsCampaignMatrix";

// ============================================================================
// TYPES
// ============================================================================

export interface GoogleAdsAutoDetectInput {
  adFormats: string[];
  bidStrategy?: string;
  audienceSegments: string[]; // e.g. "Website visitors", "Customer segments", "YouTube users", "App users", "Custom combination", "Callers"
  keywords: string[];
  hasProductFeed?: boolean;
  hasApp?: boolean;
}

export interface GoogleAdsDetectedCampaign {
  campaignType: string;
  subtype?: string;
  phase: string; // Awareness, Consideration, Conversion
  optimizationGoal: string;
  bidStrategy: string;
  adFormats: string[];
  reason: string; // Human-readable explanation
  confidence: "high" | "medium" | "low";
}

export interface GoogleAdsStrategyPhase {
  id: string;
  name: string;
  funnelStage: string;
  durationPercent: number;
  budgetPercent: number;
  campaignType: string;
  campaignSubtype?: string;
  bidStrategy: string;
  adFormats: string[];
  audienceSegments: string[];
  supportsKeywords: boolean;
  networks: GoogleAdsCampaignType["networks"];
  features: GoogleAdsCampaignType["features"];
}

// ============================================================================
// AD FORMAT → CAMPAIGN TYPE SIGNALS
// ============================================================================

const AD_FORMAT_TO_CAMPAIGN_TYPE: Record<string, { campaignType: string; subtype?: string }[]> = {
  // Search formats
  "Responsive Search Ads": [{ campaignType: "Search" }],
  "Text Ads": [{ campaignType: "Search" }],
  // Display formats
  "Responsive Display Ads": [{ campaignType: "Display" }],
  "Uploaded Image Ads": [{ campaignType: "Display" }],
  "HTML5 Ads": [{ campaignType: "Display" }],
  // Video formats
  "In-stream Ads (Bumper, Skippable)": [
    { campaignType: "Video", subtype: "Efficient Reach" },
    { campaignType: "Video", subtype: "Video Views" },
  ],
  "Non-skippable In-stream Ads": [{ campaignType: "Video", subtype: "Non-skippable Reach" }],
  "In-feed Ads": [
    { campaignType: "Video", subtype: "Efficient Reach" },
    { campaignType: "Video", subtype: "Video Views" },
  ],
  "Shorts Ads": [
    { campaignType: "Video", subtype: "Efficient Reach" },
    { campaignType: "Video", subtype: "Target Frequency" },
  ],
  "Multi-format Ads (Skippable In-stream, Bumper, In-feed, Shorts)": [
    { campaignType: "Video", subtype: "Target Frequency" },
  ],
  "Audio Ads": [{ campaignType: "Video", subtype: "Audio Reach" }],
  "Bumper Ads": [
    { campaignType: "Video", subtype: "Non-skippable Reach" },
    { campaignType: "Video", subtype: "Target Frequency" },
  ],
  "Skippable In-stream Ads": [
    { campaignType: "Video", subtype: "Ad Sequence" },
    { campaignType: "Video", subtype: "Efficient Reach" },
  ],
  // Demand Gen formats
  "Single Image Ads": [{ campaignType: "Demand Gen" }],
  "Video Ads": [{ campaignType: "Demand Gen" }],
  "Carousel Ads": [{ campaignType: "Demand Gen" }],
  "Product Ads": [{ campaignType: "Demand Gen" }, { campaignType: "Shopping" }],
  // Shopping formats
  "Product Shopping Ads": [{ campaignType: "Shopping" }],
  "Showcase Shopping Ads": [{ campaignType: "Shopping" }],
  // PMax
  "Asset Groups (Auto-generated)": [{ campaignType: "Performance Max" }],
  // App
  "App Install Ads (Auto-generated)": [{ campaignType: "App Promotion", subtype: "App Installs" }],
  "App Engagement Ads (Auto-generated)": [{ campaignType: "App Promotion", subtype: "App Engagement" }],
  "App Pre-registration Ads (Auto-generated)": [{ campaignType: "App Promotion", subtype: "App Pre-registration" }],
};

// ============================================================================
// BID STRATEGY → CAMPAIGN TYPE AFFINITY
// ============================================================================

const BID_STRATEGY_AFFINITY: Record<string, string[]> = {
  "Target CPM": ["Video"],
  "Target CPV": ["Video"],
  "Target Impression Share": ["Search"],
  "Manual CPC": ["Search", "Shopping"],
  "Maximum CPC": ["Search", "Shopping", "Display", "Demand Gen"],
  "Maximize Clicks": ["Search", "Display", "Demand Gen", "Shopping"],
  "Maximize Conversions": ["Search", "Performance Max", "Display", "Demand Gen", "App Promotion"],
  "Maximize Conversion Value": ["Search", "Performance Max", "Display", "Demand Gen"],
  "Target CPA": ["Search", "Performance Max", "Display", "App Promotion", "Demand Gen"],
  "Target ROAS": ["Search", "Performance Max", "Shopping", "Demand Gen"],
  "Viewable Impressions": ["Display"],
  "CPM": ["Display"],
};

// ============================================================================
// AUDIENCE SEGMENT → CAMPAIGN TYPE AFFINITY
// ============================================================================

const AUDIENCE_SEGMENT_AFFINITY: Record<string, string[]> = {
  "Lookalikes": ["Demand Gen"],
  "Affinity": ["Display", "Video", "Demand Gen"],
  "In-market": ["Display", "Video", "Demand Gen", "Search"],
  "Detailed Demographics": ["Display", "Video", "Search", "Performance Max", "Demand Gen", "Shopping", "App Promotion"],
  "Your Data Segments": ["Display", "Video", "Search", "Performance Max", "Demand Gen", "Shopping", "App Promotion"],
};

// ============================================================================
// AUTO-DETECTION ENGINE
// ============================================================================

/**
 * Auto-detect Google Ads campaign types and generate phases
 * based on the user's selected ad formats, bid strategy, audience segments, and keywords.
 */
export function autoDetectGoogleAdsStrategy(input: GoogleAdsAutoDetectInput): GoogleAdsDetectedCampaign[] {
  const { adFormats, bidStrategy, audienceSegments, keywords, hasProductFeed, hasApp } = input;
  const detected: GoogleAdsDetectedCampaign[] = [];
  const addedTypes = new Set<string>();

  // Step 1: Score campaign types from ad formats
  const campaignTypeScores: Record<string, { score: number; subtypes: Set<string>; formats: string[] }> = {};

  for (const format of adFormats) {
    const mappings = AD_FORMAT_TO_CAMPAIGN_TYPE[format];
    if (!mappings) continue;

    for (const mapping of mappings) {
      const key = mapping.campaignType;
      if (!campaignTypeScores[key]) {
        campaignTypeScores[key] = { score: 0, subtypes: new Set(), formats: [] };
      }
      campaignTypeScores[key].score += 2; // Strong signal
      campaignTypeScores[key].formats.push(format);
      if (mapping.subtype) {
        campaignTypeScores[key].subtypes.add(mapping.subtype);
      }
    }
  }

  // Step 2: Boost from bid strategy
  if (bidStrategy) {
    const affineCampaigns = BID_STRATEGY_AFFINITY[bidStrategy] || [];
    for (const ct of affineCampaigns) {
      if (!campaignTypeScores[ct]) {
        campaignTypeScores[ct] = { score: 0, subtypes: new Set(), formats: [] };
      }
      campaignTypeScores[ct].score += 1;
    }
  }

  // Step 3: Boost from audience segments
  for (const segment of audienceSegments) {
    const affineCampaigns = AUDIENCE_SEGMENT_AFFINITY[segment] || [];
    for (const ct of affineCampaigns) {
      if (!campaignTypeScores[ct]) {
        campaignTypeScores[ct] = { score: 0, subtypes: new Set(), formats: [] };
      }
      campaignTypeScores[ct].score += 1;
    }
  }

  // Step 4: Keywords strongly indicate Search
  if (keywords.length > 0) {
    if (!campaignTypeScores["Search"]) {
      campaignTypeScores["Search"] = { score: 0, subtypes: new Set(), formats: [] };
    }
    campaignTypeScores["Search"].score += 3; // Keywords are the strongest Search signal
  }

  // Step 5: Product feed → Shopping / PMax
  if (hasProductFeed) {
    if (!campaignTypeScores["Shopping"]) {
      campaignTypeScores["Shopping"] = { score: 0, subtypes: new Set(), formats: [] };
    }
    campaignTypeScores["Shopping"].score += 2;
    if (!campaignTypeScores["Performance Max"]) {
      campaignTypeScores["Performance Max"] = { score: 0, subtypes: new Set(), formats: [] };
    }
    campaignTypeScores["Performance Max"].score += 1;
  }

  // Step 6: App → App Promotion
  if (hasApp) {
    if (!campaignTypeScores["App Promotion"]) {
      campaignTypeScores["App Promotion"] = { score: 0, subtypes: new Set(), formats: [] };
    }
    campaignTypeScores["App Promotion"].score += 3;
  }

  // Step 7: Sort by score and build detected campaigns
  const sorted = Object.entries(campaignTypeScores)
    .filter(([_, v]) => v.score > 0)
    .sort((a, b) => b[1].score - a[1].score);

  // Track whether Search has already been added — Search can only appear in ONE phase
  let searchAdded = false;

  for (const [campaignType, data] of sorted) {
    if (addedTypes.has(campaignType)) continue;

    // Enforce single-Search constraint
    if (campaignType === "Search" && searchAdded) continue;

    // Find best matching config from matrix
    const subtypeArr = [...data.subtypes];
    const subtype = subtypeArr.length > 0 ? subtypeArr[0] : undefined;
    const config = GOOGLE_ADS_CAMPAIGN_MATRIX.find(
      (c) => c.campaignType === campaignType && (subtype ? c.subtype === subtype : true)
    );

    if (!config) continue;

    // Pick bid strategy: user's selected if valid, otherwise first from config
    const effectiveBid =
      bidStrategy && config.bidStrategies.includes(bidStrategy)
        ? bidStrategy
        : config.bidStrategies[0];

    const confidence: "high" | "medium" | "low" =
      data.score >= 4 ? "high" : data.score >= 2 ? "medium" : "low";

    const reasons: string[] = [];
    if (data.formats.length > 0) reasons.push(`Ad formats: ${data.formats.slice(0, 2).join(", ")}`);
    if (bidStrategy && BID_STRATEGY_AFFINITY[bidStrategy]?.includes(campaignType)) {
      reasons.push(`Bid strategy: ${bidStrategy}`);
    }
    if (keywords.length > 0 && campaignType === "Search") {
      reasons.push(`${keywords.length} keyword(s)`);
    }
    if (audienceSegments.some((s) => AUDIENCE_SEGMENT_AFFINITY[s]?.includes(campaignType))) {
      reasons.push(`Audience segments match`);
    }

    detected.push({
      campaignType,
      subtype,
      phase: config.phase,
      optimizationGoal: config.optimizationGoal,
      bidStrategy: effectiveBid,
      adFormats: data.formats.length > 0 ? data.formats : config.adFormats,
      reason: reasons.join(" · "),
      confidence,
    });

    addedTypes.add(campaignType);
    if (campaignType === "Search") searchAdded = true;
  }

  // If keywords exist but Search wasn't added (e.g. scored too low), force-add it
  if (keywords.length > 0 && !searchAdded) {
    const searchConfig = GOOGLE_ADS_CAMPAIGN_MATRIX.find((c) => c.campaignType === "Search");
    if (searchConfig) {
      const effectiveBid =
        bidStrategy && searchConfig.bidStrategies.includes(bidStrategy)
          ? bidStrategy
          : searchConfig.bidStrategies[0];
      detected.push({
        campaignType: "Search",
        phase: searchConfig.phase,
        optimizationGoal: searchConfig.optimizationGoal,
        bidStrategy: effectiveBid,
        adFormats: ["Responsive Search Ads"],
        reason: `${keywords.length} keyword(s) require Search`,
        confidence: "high",
      });
    }
  }

  return detected;
}

// ============================================================================
// PHASE GENERATION
// ============================================================================

/**
 * Generate phases from detected campaigns for the media plan
 */
export function generateGoogleAdsPhases(
  detectedCampaigns: GoogleAdsDetectedCampaign[],
  startDate: string,
  endDate: string
): GoogleAdsStrategyPhase[] {
  if (detectedCampaigns.length === 0) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  // Sort by funnel phase order
  const phaseOrder: Record<string, number> = { Awareness: 0, Consideration: 1, Conversion: 2 };
  const sorted = [...detectedCampaigns].sort(
    (a, b) => (phaseOrder[a.phase] ?? 99) - (phaseOrder[b.phase] ?? 99)
  );

  // Distribute budget: Awareness 30%, Consideration 35%, Conversion 35%
  const budgetByPhase: Record<string, number> = { Awareness: 30, Consideration: 35, Conversion: 35 };

  // Count campaigns per phase for sub-distribution
  const phaseCounts: Record<string, number> = {};
  for (const c of sorted) {
    phaseCounts[c.phase] = (phaseCounts[c.phase] || 0) + 1;
  }

  // Distribute duration equally
  const durationPerCampaign = Math.floor(100 / sorted.length);

  return sorted.map((campaign, idx) => {
    const phaseBudget = budgetByPhase[campaign.phase] || 33;
    const campaignsInPhase = phaseCounts[campaign.phase] || 1;
    const budget = Math.round(phaseBudget / campaignsInPhase);

    const config = GOOGLE_ADS_CAMPAIGN_MATRIX.find(
      (c) =>
        c.campaignType === campaign.campaignType &&
        (campaign.subtype ? c.subtype === campaign.subtype : true)
    );

    return {
      id: `gads-phase-${idx}-${Date.now()}`,
      name: `${campaign.phase} — ${campaign.campaignType}${campaign.subtype ? ` (${campaign.subtype})` : ""}`,
      funnelStage: campaign.phase,
      durationPercent: idx === sorted.length - 1 ? 100 - durationPerCampaign * (sorted.length - 1) : durationPerCampaign,
      budgetPercent: budget,
      campaignType: campaign.campaignType,
      campaignSubtype: campaign.subtype,
      bidStrategy: campaign.bidStrategy,
      adFormats: campaign.adFormats,
      audienceSegments: config?.targeting.audienceSegments || [],
      supportsKeywords: config?.targeting.keywords ?? false,
      networks: config?.networks || {
        searchPartner: false,
        searchNetwork: false,
        displayNetwork: false,
        gmail: false,
        discover: false,
        youtube: false,
        googleTv: false,
        videoPartner: false,
      },
      features: config?.features || {
        conversionGoal: false,
        appPlatform: false,
        customerAcquisition: false,
        exclude: false,
        productFeed: false,
      },
    };
  });
}

/**
 * Get suggested campaign types when no signals are provided
 */
export function getDefaultGoogleAdsCampaigns(): GoogleAdsDetectedCampaign[] {
  return [
    {
      campaignType: "Search",
      phase: "Conversion",
      optimizationGoal: "Search",
      bidStrategy: "Maximize Conversions",
      adFormats: ["Responsive Search Ads"],
      reason: "Default: Search campaign for conversion-focused goals",
      confidence: "medium",
    },
    {
      campaignType: "Performance Max",
      phase: "Consideration",
      optimizationGoal: "Performance Max",
      bidStrategy: "Maximize Conversions",
      adFormats: ["Asset Groups (Auto-generated)"],
      reason: "Default: PMax for broad multi-channel reach",
      confidence: "medium",
    },
  ];
}
