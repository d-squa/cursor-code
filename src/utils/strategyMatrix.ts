/**
 * Centralized strategy matrix for Meta and TikTok platforms.
 * Each strategy has a Base and an Advantage+/Smart variant with full phase definitions.
 */

export interface StrategyPhase {
  name: string;
  funnelStage: string;
  durationPercent: number;
  recommendedDurationDays: [number, number] | "always-on" | "ongoing";
  budgetPercent: number;
  objective: string;
  optimizationGoal: string;
  optimizationLocation: string;
  billingType: string;
  audienceTypes: string;
  adFormats: string;
  automationFeatures: string;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  variant: "base" | "advantage+" | "smart";
  platform: "meta" | "tiktok" | "google";
  phases: StrategyPhase[];
}

export interface StrategyGroup {
  id: string;
  name: string;
  platform: "meta" | "tiktok" | "google";
  variants: StrategyDefinition[];
}

// ─── META STRATEGIES ──────────────────────────────────────────────

const META_REVENUE_ACCELERATION_BASE: StrategyDefinition = {
  id: "meta-revenue-acceleration-base",
  name: "Revenue Acceleration Engine",
  variant: "base",
  platform: "meta",
  phases: [
    {
      name: "TOF - Demand Capture",
      funnelStage: "TOF",
      durationPercent: 50,
      recommendedDurationDays: [30, 60],
      budgetPercent: 50,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Broad + LAL + Interests",
      adFormats: "UGC Video + Collection + Carousel",
      automationFeatures: "Manual Structure + CBO",
    },
    {
      name: "MOF - Intent Amplification",
      funnelStage: "MOF",
      durationPercent: 30,
      recommendedDurationDays: [14, 30],
      budgetPercent: 30,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Website Visitors + Engagers",
      adFormats: "Product Demo + Testimonials",
      automationFeatures: "Manual Retargeting",
    },
    {
      name: "BOF - Conversion Recovery",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [7, 14],
      budgetPercent: 20,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "ATC 1-7d + IC 1-14d",
      adFormats: "DPA + Offer Creatives",
      automationFeatures: "Manual DPA",
    },
  ],
};

const META_REVENUE_ACCELERATION_ADVANTAGE: StrategyDefinition = {
  id: "meta-revenue-acceleration-advantage",
  name: "Revenue Acceleration Engine",
  variant: "advantage+",
  platform: "meta",
  phases: [
    {
      name: "TOF - Demand Capture",
      funnelStage: "TOF",
      durationPercent: 50,
      recommendedDurationDays: [30, 60],
      budgetPercent: 60,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Advantage+ Broad Expansion",
      adFormats: "UGC + Collection + Carousel",
      automationFeatures: "Advantage+ Shopping Campaign",
    },
    {
      name: "MOF - Intent Amplification",
      funnelStage: "MOF",
      durationPercent: 30,
      recommendedDurationDays: [14, 30],
      budgetPercent: 25,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Advantage Custom Expansion Pool",
      adFormats: "Dynamic + Demo Assets",
      automationFeatures: "Advantage+ Audience + Dynamic Creative",
    },
    {
      name: "BOF - Conversion Recovery",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [7, 14],
      budgetPercent: 15,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Dynamic Retargeting Pool",
      adFormats: "DPA + Offer",
      automationFeatures: "Advantage+ Catalog Ads",
    },
  ],
};

const META_SAAS_GROWTH_BASE: StrategyDefinition = {
  id: "meta-saas-growth-base",
  name: "SaaS Growth Loop",
  variant: "base",
  platform: "meta",
  phases: [
    {
      name: "TOF - Category Education",
      funnelStage: "TOF",
      durationPercent: 50,
      recommendedDurationDays: [30, 60],
      budgetPercent: 50,
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "THRUPLAY",
      optimizationLocation: "Website / On-platform",
      billingType: "Impressions",
      audienceTypes: "Broad + Job Titles + LAL",
      adFormats: "Thought Leadership Video",
      automationFeatures: "Manual Optimization",
    },
    {
      name: "MOF - Trial Acquisition",
      funnelStage: "MOF",
      durationPercent: 30,
      recommendedDurationDays: [14, 30],
      budgetPercent: 30,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Website Visitors 30-60d",
      adFormats: "Feature Walkthrough",
      automationFeatures: "Manual Conversions",
    },
    {
      name: "BOF - Revenue Activation",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [7, 14],
      budgetPercent: 20,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Trial Users + Pricing Visitors",
      adFormats: "ROI Ads",
      automationFeatures: "Manual BOF",
    },
  ],
};

const META_SAAS_GROWTH_ADVANTAGE: StrategyDefinition = {
  id: "meta-saas-growth-advantage",
  name: "SaaS Growth Loop",
  variant: "advantage+",
  platform: "meta",
  phases: [
    {
      name: "TOF - Category Education",
      funnelStage: "TOF",
      durationPercent: 50,
      recommendedDurationDays: [30, 60],
      budgetPercent: 55,
      objective: "OUTCOME_TRAFFIC",
      optimizationGoal: "LANDING_PAGE_VIEWS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Advantage+ Broad SaaS Signals",
      adFormats: "Thought Leadership + Demo",
      automationFeatures: "Advantage+ Audience",
    },
    {
      name: "MOF - Trial Acquisition",
      funnelStage: "MOF",
      durationPercent: 30,
      recommendedDurationDays: [14, 30],
      budgetPercent: 30,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Algorithmic Expansion",
      adFormats: "Feature + Demo Assets",
      automationFeatures: "Advantage+ Audience + Placements",
    },
    {
      name: "BOF - Revenue Activation",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [7, 14],
      budgetPercent: 15,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Trial + High Intent Signals",
      adFormats: "ROI + Case Study",
      automationFeatures: "Automated Creative Optimization",
    },
  ],
};

const META_APP_GROWTH_BASE: StrategyDefinition = {
  id: "meta-app-growth-base",
  name: "App Growth Engine",
  variant: "base",
  platform: "meta",
  phases: [
    {
      name: "TOF - Install Expansion",
      funnelStage: "TOF",
      durationPercent: 50,
      recommendedDurationDays: [30, 60],
      budgetPercent: 60,
      objective: "OUTCOME_APP_PROMOTION",
      optimizationGoal: "APP_INSTALLS",
      optimizationLocation: "App",
      billingType: "Impressions",
      audienceTypes: "Broad + LAL Installers",
      adFormats: "Vertical Video + Playable",
      automationFeatures: "Manual AEO",
    },
    {
      name: "MOF - Activation Optimization",
      funnelStage: "MOF",
      durationPercent: 30,
      recommendedDurationDays: [14, 30],
      budgetPercent: 25,
      objective: "OUTCOME_APP_PROMOTION",
      optimizationGoal: "APP_EVENTS",
      optimizationLocation: "App",
      billingType: "Impressions",
      audienceTypes: "Recent Installers",
      adFormats: "Feature Demo",
      automationFeatures: "Manual Event Optimization",
    },
    {
      name: "BOF - Revenue Scaling",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [7, 21],
      budgetPercent: 15,
      objective: "OUTCOME_APP_PROMOTION",
      optimizationGoal: "VALUE",
      optimizationLocation: "App",
      billingType: "Impressions",
      audienceTypes: "High Value Users",
      adFormats: "Offer Creatives",
      automationFeatures: "Manual Value Optimization",
    },
  ],
};

const META_APP_GROWTH_ADVANTAGE: StrategyDefinition = {
  id: "meta-app-growth-advantage",
  name: "App Growth Engine",
  variant: "advantage+",
  platform: "meta",
  phases: [
    {
      name: "TOF - Install Expansion",
      funnelStage: "TOF",
      durationPercent: 50,
      recommendedDurationDays: [30, 60],
      budgetPercent: 70,
      objective: "OUTCOME_APP_PROMOTION",
      optimizationGoal: "APP_INSTALLS",
      optimizationLocation: "App",
      billingType: "Impressions",
      audienceTypes: "Full Algorithmic Broad",
      adFormats: "Vertical + Playable",
      automationFeatures: "Advantage+ App Campaign",
    },
    {
      name: "MOF - Activation Optimization",
      funnelStage: "MOF",
      durationPercent: 30,
      recommendedDurationDays: [14, 30],
      budgetPercent: 20,
      objective: "OUTCOME_APP_PROMOTION",
      optimizationGoal: "APP_EVENTS",
      optimizationLocation: "App",
      billingType: "Impressions",
      audienceTypes: "Algorithmic Expansion",
      adFormats: "Feature Demo",
      automationFeatures: "Automated Event Optimization",
    },
    {
      name: "BOF - Revenue Scaling",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [7, 21],
      budgetPercent: 10,
      objective: "OUTCOME_APP_PROMOTION",
      optimizationGoal: "APP_EVENTS",
      optimizationLocation: "App",
      billingType: "Impressions",
      audienceTypes: "High Value Signals",
      adFormats: "Offer Creatives",
      automationFeatures: "Value Optimization Automation",
    },
  ],
};

const META_PERFORMANCE_DOMINATION_BASE: StrategyDefinition = {
  id: "meta-performance-domination-base",
  name: "Performance Domination Model",
  variant: "base",
  platform: "meta",
  phases: [
    {
      name: "Broad Conversion Engine",
      funnelStage: "TOF",
      durationPercent: 60,
      recommendedDurationDays: "always-on",
      budgetPercent: 70,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Broad + 1-3% LAL",
      adFormats: "Best Creatives",
      automationFeatures: "Manual CBO Scaling",
    },
    {
      name: "High Intent Retargeting",
      funnelStage: "BOF",
      durationPercent: 25,
      recommendedDurationDays: [7, 21],
      budgetPercent: 20,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "ATC + IC Visitors",
      adFormats: "Offer Overlays",
      automationFeatures: "Manual Retargeting",
    },
    {
      name: "Creative Testing Lab",
      funnelStage: "TOF",
      durationPercent: 15,
      recommendedDurationDays: "ongoing",
      budgetPercent: 10,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Broad Testing Audience",
      adFormats: "New Hooks",
      automationFeatures: "Manual Testing Structure",
    },
  ],
};

const META_PERFORMANCE_DOMINATION_ADVANTAGE: StrategyDefinition = {
  id: "meta-performance-domination-advantage",
  name: "Performance Domination Model",
  variant: "advantage+",
  platform: "meta",
  phases: [
    {
      name: "Broad Conversion Engine",
      funnelStage: "TOF",
      durationPercent: 70,
      recommendedDurationDays: "always-on",
      budgetPercent: 75,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Advantage+ Broad",
      adFormats: "Top Creatives",
      automationFeatures: "Advantage+ Shopping Campaign",
    },
    {
      name: "High Intent Retargeting",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [7, 21],
      budgetPercent: 15,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Expanded Retargeting Pool",
      adFormats: "Dynamic Offers",
      automationFeatures: "Advantage+ Audience Expansion",
    },
    {
      name: "Creative Testing Lab",
      funnelStage: "TOF",
      durationPercent: 10,
      recommendedDurationDays: "ongoing",
      budgetPercent: 10,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Algorithmic Testing Pool",
      adFormats: "Creative Variations",
      automationFeatures: "Dynamic Creative Optimization",
    },
  ],
};

const META_QUALIFIED_LEAD_BASE: StrategyDefinition = {
  id: "meta-qualified-lead-base",
  name: "Qualified Lead Machine",
  variant: "base",
  platform: "meta",
  phases: [
    {
      name: "TOF - Awareness & Education",
      funnelStage: "TOF",
      durationPercent: 40,
      recommendedDurationDays: [30, 60],
      budgetPercent: 35,
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "THRUPLAY",
      optimizationLocation: "On-platform",
      billingType: "Impressions",
      audienceTypes: "Broad + Interests + LAL",
      adFormats: "Video + Educational Content",
      automationFeatures: "Manual Awareness",
    },
    {
      name: "MOF - Lead Acquisition",
      funnelStage: "MOF",
      durationPercent: 40,
      recommendedDurationDays: [14, 30],
      budgetPercent: 40,
      objective: "OUTCOME_LEADS",
      optimizationGoal: "LEAD_GENERATION",
      optimizationLocation: "Instant Forms",
      billingType: "Impressions",
      audienceTypes: "Video Viewers + Visitors",
      adFormats: "Case Studies",
      automationFeatures: "Manual Lead Gen",
    },
    {
      name: "BOF - Lead Nurture",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [7, 14],
      budgetPercent: 25,
      objective: "OUTCOME_LEADS",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Form Openers + Partial Submits",
      adFormats: "Testimonials + Urgency",
      automationFeatures: "Manual Retargeting",
    },
  ],
};

const META_QUALIFIED_LEAD_ADVANTAGE: StrategyDefinition = {
  id: "meta-qualified-lead-advantage",
  name: "Qualified Lead Machine",
  variant: "advantage+",
  platform: "meta",
  phases: [
    {
      name: "TOF - Awareness & Education",
      funnelStage: "TOF",
      durationPercent: 40,
      recommendedDurationDays: [30, 60],
      budgetPercent: 35,
      objective: "OUTCOME_TRAFFIC",
      optimizationGoal: "LANDING_PAGE_VIEWS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Advantage+ Broad",
      adFormats: "Video + Educational Content",
      automationFeatures: "Advantage+ Audience",
    },
    {
      name: "MOF - Lead Acquisition",
      funnelStage: "MOF",
      durationPercent: 40,
      recommendedDurationDays: [14, 30],
      budgetPercent: 40,
      objective: "OUTCOME_LEADS",
      optimizationGoal: "LEAD_GENERATION",
      optimizationLocation: "Instant Forms",
      billingType: "Impressions",
      audienceTypes: "Advantage+ Audience Broad",
      adFormats: "Video + Instant Form",
      automationFeatures: "Advantage+ Audience + Automated Placements",
    },
    {
      name: "BOF - Lead Nurture",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [7, 14],
      budgetPercent: 25,
      objective: "OUTCOME_LEADS",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Expanded Retargeting Pool",
      adFormats: "Testimonials + Urgency",
      automationFeatures: "Advantage+ Audience Expansion",
    },
  ],
};

const META_CONVERSATION_BASE: StrategyDefinition = {
  id: "meta-conversation-base",
  name: "Conversation Conversion Machine",
  variant: "base",
  platform: "meta",
  phases: [
    {
      name: "TOF - Awareness & Engagement",
      funnelStage: "TOF",
      durationPercent: 35,
      recommendedDurationDays: [30, 60],
      budgetPercent: 30,
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "POST_ENGAGEMENT",
      optimizationLocation: "On-platform",
      billingType: "Impressions",
      audienceTypes: "Broad + Interests",
      adFormats: "Video + Engagement Ads",
      automationFeatures: "Manual Engagement",
    },
    {
      name: "MOF - Message Acquisition",
      funnelStage: "MOF",
      durationPercent: 40,
      recommendedDurationDays: [14, 30],
      budgetPercent: 40,
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      optimizationLocation: "Messaging Apps",
      billingType: "Impressions",
      audienceTypes: "Engaged Users",
      adFormats: "Offer Ads",
      automationFeatures: "Manual Messaging Campaign",
    },
    {
      name: "BOF - Conversion Close",
      funnelStage: "BOF",
      durationPercent: 25,
      recommendedDurationDays: [7, 14],
      budgetPercent: 30,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Message Responders",
      adFormats: "Offer + Urgency",
      automationFeatures: "Manual Retargeting",
    },
  ],
};

const META_CONVERSATION_ADVANTAGE: StrategyDefinition = {
  id: "meta-conversation-advantage",
  name: "Conversation Conversion Machine",
  variant: "advantage+",
  platform: "meta",
  phases: [
    {
      name: "TOF - Awareness & Engagement",
      funnelStage: "TOF",
      durationPercent: 35,
      recommendedDurationDays: [30, 60],
      budgetPercent: 30,
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "POST_ENGAGEMENT",
      optimizationLocation: "On-platform",
      billingType: "Impressions",
      audienceTypes: "Advantage+ Broad",
      adFormats: "Video + Engagement Ads",
      automationFeatures: "Advantage+ Audience",
    },
    {
      name: "MOF - Message Acquisition",
      funnelStage: "MOF",
      durationPercent: 40,
      recommendedDurationDays: [14, 30],
      budgetPercent: 40,
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      optimizationLocation: "Messaging Apps",
      billingType: "Impressions",
      audienceTypes: "Advantage+ Audience Broad",
      adFormats: "Video + Offer Ads",
      automationFeatures: "Advantage+ Audience + Automated Placements",
    },
    {
      name: "BOF - Conversion Close",
      funnelStage: "BOF",
      durationPercent: 25,
      recommendedDurationDays: [7, 14],
      budgetPercent: 30,
      objective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      optimizationLocation: "Website",
      billingType: "Impressions",
      audienceTypes: "Expanded Retargeting Pool",
      adFormats: "Offer + Urgency",
      automationFeatures: "Advantage+ Audience Expansion",
    },
  ],
};

const META_AWARENESS_VISIBILITY_BASE: StrategyDefinition = {
  id: "meta-awareness-visibility-base",
  name: "Awareness & Visibility Maximizer",
  variant: "base",
  platform: "meta",
  phases: [
    {
      name: "TOF - Mass Reach Expansion",
      funnelStage: "TOF",
      durationPercent: 60,
      recommendedDurationDays: [45, 90],
      budgetPercent: 65,
      objective: "OUTCOME_AWARENESS",
      optimizationGoal: "REACH",
      optimizationLocation: "On-platform",
      billingType: "Impressions",
      audienceTypes: "Broad + Wide LAL (5-10%)",
      adFormats: "Brand Film + Short Video + Static",
      automationFeatures: "Manual Reach + Frequency Control",
    },
    {
      name: "MOF - Attention Depth Amplification",
      funnelStage: "MOF",
      durationPercent: 25,
      recommendedDurationDays: [30, 60],
      budgetPercent: 25,
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "THRUPLAY",
      optimizationLocation: "On-platform",
      billingType: "Impressions",
      audienceTypes: "Video Viewers 25-50% + Engagers",
      adFormats: "Explainer Video + Story Ads",
      automationFeatures: "Manual Video Optimization",
    },
    {
      name: "BOF - Branded Recall Reinforcement",
      funnelStage: "BOF",
      durationPercent: 15,
      recommendedDurationDays: [14, 30],
      budgetPercent: 10,
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "POST_ENGAGEMENT",
      optimizationLocation: "Website / On-platform",
      billingType: "Impressions",
      audienceTypes: "Video Viewers 75% + Page Engagers",
      adFormats: "Short Reminder Ads + Testimonials",
      automationFeatures: "Manual Retargeting",
    },
  ],
};

const META_AWARENESS_VISIBILITY_ADVANTAGE: StrategyDefinition = {
  id: "meta-awareness-visibility-advantage",
  name: "Awareness & Visibility Maximizer",
  variant: "advantage+",
  platform: "meta",
  phases: [
    {
      name: "TOF - Algorithmic Reach Domination",
      funnelStage: "TOF",
      durationPercent: 65,
      recommendedDurationDays: [45, 90],
      budgetPercent: 70,
      objective: "OUTCOME_AWARENESS",
      optimizationGoal: "REACH",
      optimizationLocation: "On-platform",
      billingType: "Impressions",
      audienceTypes: "Advantage+ Broad Audience",
      adFormats: "Brand Film + Multiple Creative Variants",
      automationFeatures: "Advantage+ Audience + Advantage Placements + Dynamic Creative",
    },
    {
      name: "MOF - Automated Attention Scaling",
      funnelStage: "MOF",
      durationPercent: 25,
      recommendedDurationDays: [30, 60],
      budgetPercent: 20,
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "THRUPLAY",
      optimizationLocation: "On-platform",
      billingType: "Impressions",
      audienceTypes: "Algorithmic Engagement Signals",
      adFormats: "Explainer + Hook Variations",
      automationFeatures: "Advantage+ Audience Expansion + Automated Creative Optimization",
    },
    {
      name: "BOF - Intelligent Recall Boost",
      funnelStage: "BOF",
      durationPercent: 10,
      recommendedDurationDays: [14, 30],
      budgetPercent: 10,
      objective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "POST_ENGAGEMENT",
      optimizationLocation: "On-platform / Website",
      billingType: "Impressions",
      audienceTypes: "Expanded Engagement Pool",
      adFormats: "Reminder + Social Proof Ads",
      automationFeatures: "Advantage Placements + Dynamic Creative",
    },
  ],
};

// ─── TIKTOK STRATEGIES ────────────────────────────────────────────

const TIKTOK_REVENUE_ACCELERATOR_BASE: StrategyDefinition = {
  id: "tiktok-revenue-accelerator-base",
  name: "TikTok Revenue Accelerator",
  variant: "base",
  platform: "tiktok",
  phases: [
    {
      name: "TOF - Scale Acquisition",
      funnelStage: "TOF",
      durationPercent: 50,
      recommendedDurationDays: [30, 60],
      budgetPercent: 60,
      objective: "PRODUCT_SALES",
      optimizationGoal: "CONVERT",
      optimizationLocation: "Website/TikTok Shop",
      billingType: "oCPM",
      audienceTypes: "Broad + Interests",
      adFormats: "In-Feed + Spark Ads",
      automationFeatures: "Manual Sales Campaign",
    },
    {
      name: "MOF - Engagement Retargeting",
      funnelStage: "MOF",
      durationPercent: 30,
      recommendedDurationDays: [14, 30],
      budgetPercent: 25,
      objective: "PRODUCT_SALES",
      optimizationGoal: "CONVERT",
      optimizationLocation: "Website",
      billingType: "oCPM",
      audienceTypes: "Video Viewers + Engagers",
      adFormats: "UGC + Spark Ads",
      automationFeatures: "Manual Retargeting",
    },
    {
      name: "BOF - High Intent Conversion",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [7, 14],
      budgetPercent: 15,
      objective: "PRODUCT_SALES",
      optimizationGoal: "CONVERT",
      optimizationLocation: "Website/Shop",
      billingType: "oCPM",
      audienceTypes: "ATC 7-14d",
      adFormats: "Offer UGC + LIVE",
      automationFeatures: "Manual Catalog",
    },
  ],
};

const TIKTOK_REVENUE_ACCELERATOR_SMART: StrategyDefinition = {
  id: "tiktok-revenue-accelerator-smart",
  name: "TikTok Revenue Accelerator",
  variant: "smart",
  platform: "tiktok",
  phases: [
    {
      name: "TOF - Smart Scale Acquisition",
      funnelStage: "TOF",
      durationPercent: 60,
      recommendedDurationDays: [30, 60],
      budgetPercent: 70,
      objective: "PRODUCT_SALES",
      optimizationGoal: "CONVERT",
      optimizationLocation: "Website/Shop",
      billingType: "oCPM",
      audienceTypes: "Full Automation Enabled",
      adFormats: "In-Feed + Spark + Video Shopping",
      automationFeatures: "Smart Performance Campaign",
    },
    {
      name: "MOF - Algorithmic Mid Funnel",
      funnelStage: "MOF",
      durationPercent: 25,
      recommendedDurationDays: [14, 30],
      budgetPercent: 20,
      objective: "PRODUCT_SALES",
      optimizationGoal: "CONVERT",
      optimizationLocation: "Website",
      billingType: "oCPM",
      audienceTypes: "Auto Signal Expansion",
      adFormats: "UGC Variations",
      automationFeatures: "Smart Optimization",
    },
    {
      name: "BOF - Smart Conversion Capture",
      funnelStage: "BOF",
      durationPercent: 15,
      recommendedDurationDays: [7, 14],
      budgetPercent: 10,
      objective: "PRODUCT_SALES",
      optimizationGoal: "CONVERT",
      optimizationLocation: "Website/Shop",
      billingType: "oCPM",
      audienceTypes: "High Intent Signals",
      adFormats: "Offer UGC",
      automationFeatures: "Automated Creative Optimization",
    },
  ],
};

const TIKTOK_APP_GROWTH_BASE: StrategyDefinition = {
  id: "tiktok-app-growth-base",
  name: "TikTok App Growth Model",
  variant: "base",
  platform: "tiktok",
  phases: [
    {
      name: "TOF - Install Scale",
      funnelStage: "TOF",
      durationPercent: 60,
      recommendedDurationDays: [30, 60],
      budgetPercent: 60,
      objective: "APP_PROMOTION",
      optimizationGoal: "APP_INSTALL",
      optimizationLocation: "App Store",
      billingType: "oCPM",
      audienceTypes: "Broad + LAL",
      adFormats: "In-Feed + Spark",
      automationFeatures: "Manual App Campaign",
    },
    {
      name: "MOF - Engagement & Activation",
      funnelStage: "MOF",
      durationPercent: 25,
      recommendedDurationDays: [14, 30],
      budgetPercent: 25,
      objective: "APP_PROMOTION",
      optimizationGoal: "APP_EVENT",
      optimizationLocation: "App",
      billingType: "oCPM",
      audienceTypes: "Recent Installers",
      adFormats: "Feature Demo + Spark",
      automationFeatures: "Manual Event Optimization",
    },
    {
      name: "BOF - Revenue & Retention",
      funnelStage: "BOF",
      durationPercent: 15,
      recommendedDurationDays: [7, 14],
      budgetPercent: 15,
      objective: "APP_PROMOTION",
      optimizationGoal: "VALUE",
      optimizationLocation: "App",
      billingType: "oCPM",
      audienceTypes: "High Value Users",
      adFormats: "Offer + Reward UGC",
      automationFeatures: "Manual Value Optimization",
    },
  ],
};

const TIKTOK_APP_GROWTH_SMART: StrategyDefinition = {
  id: "tiktok-app-growth-smart",
  name: "TikTok App Growth Model",
  variant: "smart",
  platform: "tiktok",
  phases: [
    {
      name: "TOF - Install Scale",
      funnelStage: "TOF",
      durationPercent: 60,
      recommendedDurationDays: [30, 60],
      budgetPercent: 70,
      objective: "APP_PROMOTION",
      optimizationGoal: "APP_INSTALL",
      optimizationLocation: "App Store",
      billingType: "oCPM",
      audienceTypes: "Full Automation Enabled",
      adFormats: "In-Feed + Spark",
      automationFeatures: "Smart Performance Campaign (App)",
    },
    {
      name: "MOF - Engagement & Activation",
      funnelStage: "MOF",
      durationPercent: 25,
      recommendedDurationDays: [14, 30],
      budgetPercent: 20,
      objective: "APP_PROMOTION",
      optimizationGoal: "APP_EVENT",
      optimizationLocation: "App",
      billingType: "oCPM",
      audienceTypes: "Algorithmic Expansion",
      adFormats: "Feature Demo + Spark",
      automationFeatures: "Automated Event Optimization",
    },
    {
      name: "BOF - Revenue & Retention",
      funnelStage: "BOF",
      durationPercent: 15,
      recommendedDurationDays: [7, 14],
      budgetPercent: 10,
      objective: "APP_PROMOTION",
      optimizationGoal: "VALUE",
      optimizationLocation: "App",
      billingType: "oCPM",
      audienceTypes: "High Value Signals",
      adFormats: "Offer + Reward UGC",
      automationFeatures: "Value Optimization Automation",
    },
  ],
};

const TIKTOK_LEAD_ENGINE_BASE: StrategyDefinition = {
  id: "tiktok-lead-engine-base",
  name: "TikTok Lead Engine",
  variant: "base",
  platform: "tiktok",
  phases: [
    {
      name: "TOF - Awareness & Education",
      funnelStage: "TOF",
      durationPercent: 40,
      recommendedDurationDays: [30, 60],
      budgetPercent: 35,
      objective: "VIDEO_VIEWS",
      optimizationGoal: "VIDEO_VIEW",
      optimizationLocation: "On-platform",
      billingType: "oCPM",
      audienceTypes: "Broad + Interests",
      adFormats: "In-Feed + Spark Ads",
      automationFeatures: "Manual Video Campaign",
    },
    {
      name: "MOF - Lead Capture",
      funnelStage: "MOF",
      durationPercent: 35,
      recommendedDurationDays: [14, 30],
      budgetPercent: 35,
      objective: "LEAD_GENERATION",
      optimizationGoal: "FORM",
      optimizationLocation: "Instant Form",
      billingType: "oCPM",
      audienceTypes: "Video Viewers",
      adFormats: "In-Feed + Instant Form",
      automationFeatures: "Manual Lead Gen",
    },
    {
      name: "BOF - Lead Nurture",
      funnelStage: "BOF",
      durationPercent: 25,
      recommendedDurationDays: [7, 14],
      budgetPercent: 30,
      objective: "LEAD_GENERATION",
      optimizationGoal: "FORM",
      optimizationLocation: "Instant Form",
      billingType: "oCPM",
      audienceTypes: "Form Openers + Engagers",
      adFormats: "UGC + Testimonials",
      automationFeatures: "Manual Retargeting",
    },
  ],
};

const TIKTOK_LEAD_ENGINE_SMART: StrategyDefinition = {
  id: "tiktok-lead-engine-smart",
  name: "TikTok Lead Engine",
  variant: "smart",
  platform: "tiktok",
  phases: [
    {
      name: "TOF - Awareness & Education",
      funnelStage: "TOF",
      durationPercent: 40,
      recommendedDurationDays: [30, 60],
      budgetPercent: 35,
      objective: "VIDEO_VIEWS",
      optimizationGoal: "VIDEO_VIEW",
      optimizationLocation: "On-platform",
      billingType: "oCPM",
      audienceTypes: "Algorithmic Broad",
      adFormats: "In-Feed + Spark Ads",
      automationFeatures: "Smart Optimization",
    },
    {
      name: "MOF - Lead Capture",
      funnelStage: "MOF",
      durationPercent: 35,
      recommendedDurationDays: [14, 30],
      budgetPercent: 35,
      objective: "LEAD_GENERATION",
      optimizationGoal: "FORM",
      optimizationLocation: "Instant Form",
      billingType: "oCPM",
      audienceTypes: "Broad with Expansion",
      adFormats: "In-Feed + Instant Form",
      automationFeatures: "Smart Optimization + Automated Creative Optimization",
    },
    {
      name: "BOF - Lead Nurture",
      funnelStage: "BOF",
      durationPercent: 25,
      recommendedDurationDays: [7, 14],
      budgetPercent: 30,
      objective: "LEAD_GENERATION",
      optimizationGoal: "FORM",
      optimizationLocation: "Instant Form",
      billingType: "oCPM",
      audienceTypes: "Auto Signal Expansion",
      adFormats: "UGC + Testimonials",
      automationFeatures: "Automated Creative Optimization",
    },
  ],
};

const TIKTOK_AWARENESS_BASE: StrategyDefinition = {
  id: "tiktok-awareness-base",
  name: "TikTok Awareness Domination",
  variant: "base",
  platform: "tiktok",
  phases: [
    {
      name: "TOF - Premium Reach",
      funnelStage: "TOF",
      durationPercent: 70,
      recommendedDurationDays: [45, 90],
      budgetPercent: 75,
      objective: "REACH",
      optimizationGoal: "REACH",
      optimizationLocation: "On-platform",
      billingType: "oCPM",
      audienceTypes: "Broad National",
      adFormats: "TopView + In-Feed",
      automationFeatures: "Manual Reach",
    },
    {
      name: "MOF - Engagement Amplification",
      funnelStage: "MOF",
      durationPercent: 30,
      recommendedDurationDays: [14, 30],
      budgetPercent: 25,
      objective: "COMMUNITY_INTERACTION",
      optimizationGoal: "PROFILE_VISIT",
      optimizationLocation: "On-platform",
      billingType: "oCPM",
      audienceTypes: "Video Viewers + Engagers",
      adFormats: "Spark + In-Feed",
      automationFeatures: "Manual Community Campaign",
    },
  ],
};

const TIKTOK_AWARENESS_SMART: StrategyDefinition = {
  id: "tiktok-awareness-smart",
  name: "TikTok Awareness Domination",
  variant: "smart",
  platform: "tiktok",
  phases: [
    {
      name: "TOF - Premium Reach",
      funnelStage: "TOF",
      durationPercent: 70,
      recommendedDurationDays: [45, 90],
      budgetPercent: 80,
      objective: "REACH",
      optimizationGoal: "REACH",
      optimizationLocation: "On-platform",
      billingType: "oCPM",
      audienceTypes: "Algorithmic Broad Expansion",
      adFormats: "TopView + Spark + In-Feed",
      automationFeatures: "Smart Optimization + Automated Creative Optimization",
    },
    {
      name: "MOF - Engagement Amplification",
      funnelStage: "MOF",
      durationPercent: 30,
      recommendedDurationDays: [14, 30],
      budgetPercent: 20,
      objective: "COMMUNITY_INTERACTION",
      optimizationGoal: "PROFILE_VISIT",
      optimizationLocation: "On-platform",
      billingType: "oCPM",
      audienceTypes: "Algorithmic Expansion",
      adFormats: "Spark + In-Feed",
      automationFeatures: "Automated Creative Optimization",
    },
  ],
};

// ─── TIKTOK SEARCH KEYWORDS STRATEGY ──────────────────────────

const TIKTOK_SEARCH_KEYWORDS_BASE: StrategyDefinition = {
  id: "tiktok-search-keywords-base",
  name: "TikTok Search Keywords",
  variant: "base",
  platform: "tiktok",
  phases: [
    {
      name: "Search — Keyword Conversion",
      funnelStage: "BOF",
      durationPercent: 60,
      recommendedDurationDays: [30, 90],
      budgetPercent: 60,
      objective: "CONVERSIONS",
      optimizationGoal: "CONVERT",
      optimizationLocation: "Website",
      billingType: "oCPM",
      audienceTypes: "Search Keywords",
      adFormats: "Search Ads",
      automationFeatures: "Keyword Targeting",
    },
    {
      name: "MOF - Engagement Retargeting",
      funnelStage: "MOF",
      durationPercent: 40,
      recommendedDurationDays: [14, 60],
      budgetPercent: 40,
      objective: "CONVERSIONS",
      optimizationGoal: "CONVERT",
      optimizationLocation: "Website",
      billingType: "oCPM",
      audienceTypes: "Video Viewers + Engagers",
      adFormats: "In-Feed + Spark Ads",
      automationFeatures: "Manual Retargeting",
    },
  ],
};
// ─── STRATEGY GROUPS (for UI dropdown) ─────────────────────────

export const META_STRATEGY_GROUPS: StrategyGroup[] = [
  {
    id: "meta-revenue-acceleration",
    name: "Revenue Acceleration Engine",
    platform: "meta",
    variants: [META_REVENUE_ACCELERATION_BASE, META_REVENUE_ACCELERATION_ADVANTAGE],
  },
  {
    id: "meta-saas-growth",
    name: "SaaS Growth Loop",
    platform: "meta",
    variants: [META_SAAS_GROWTH_BASE, META_SAAS_GROWTH_ADVANTAGE],
  },
  {
    id: "meta-app-growth",
    name: "App Growth Engine",
    platform: "meta",
    variants: [META_APP_GROWTH_BASE, META_APP_GROWTH_ADVANTAGE],
  },
  {
    id: "meta-performance-domination",
    name: "Performance Domination Model",
    platform: "meta",
    variants: [META_PERFORMANCE_DOMINATION_BASE, META_PERFORMANCE_DOMINATION_ADVANTAGE],
  },
  {
    id: "meta-qualified-lead",
    name: "Qualified Lead Machine",
    platform: "meta",
    variants: [META_QUALIFIED_LEAD_BASE, META_QUALIFIED_LEAD_ADVANTAGE],
  },
  {
    id: "meta-conversation",
    name: "Conversation Conversion Machine",
    platform: "meta",
    variants: [META_CONVERSATION_BASE, META_CONVERSATION_ADVANTAGE],
  },
  {
    id: "meta-awareness-visibility",
    name: "Awareness & Visibility Maximizer",
    platform: "meta",
    variants: [META_AWARENESS_VISIBILITY_BASE, META_AWARENESS_VISIBILITY_ADVANTAGE],
  },
];

export const TIKTOK_STRATEGY_GROUPS: StrategyGroup[] = [
  {
    id: "tiktok-revenue-accelerator",
    name: "TikTok Revenue Accelerator",
    platform: "tiktok",
    variants: [TIKTOK_REVENUE_ACCELERATOR_BASE, TIKTOK_REVENUE_ACCELERATOR_SMART],
  },
  {
    id: "tiktok-app-growth",
    name: "TikTok App Growth Model",
    platform: "tiktok",
    variants: [TIKTOK_APP_GROWTH_BASE, TIKTOK_APP_GROWTH_SMART],
  },
  {
    id: "tiktok-lead-engine",
    name: "TikTok Lead Engine",
    platform: "tiktok",
    variants: [TIKTOK_LEAD_ENGINE_BASE, TIKTOK_LEAD_ENGINE_SMART],
  },
  {
    id: "tiktok-awareness",
    name: "TikTok Awareness Domination",
    platform: "tiktok",
    variants: [TIKTOK_AWARENESS_BASE, TIKTOK_AWARENESS_SMART],
  },
  {
    id: "tiktok-search-keywords",
    name: "TikTok Search Keywords",
    platform: "tiktok",
    variants: [TIKTOK_SEARCH_KEYWORDS_BASE],
  },
];

/**
 * Get all strategy groups for a platform
 */
export function getStrategyGroupsForPlatform(platform: string): StrategyGroup[] {
  const p = platform.toLowerCase();
  if (p.includes("tiktok")) return TIKTOK_STRATEGY_GROUPS;
  if (p.includes("google")) return GOOGLE_ADS_STRATEGY_GROUPS;
  return META_STRATEGY_GROUPS;
}

// ─── GOOGLE ADS STRATEGIES ──────────────────────────────────────────

const GOOGLE_ADS_SEARCH_CONVERSIONS: StrategyDefinition = {
  id: "google-search-conversions-base",
  name: "Search Conversions",
  variant: "base",
  platform: "google",
  phases: [
    {
      name: "Search — Conversion Capture",
      funnelStage: "BOF",
      durationPercent: 60,
      recommendedDurationDays: [30, 90],
      budgetPercent: 60,
      objective: "CONVERSION_SEARCH",
      optimizationGoal: "MAXIMIZE_CONVERSIONS",
      optimizationLocation: "Search Network",
      billingType: "CPC",
      audienceTypes: "In-market + Your Data Segments",
      adFormats: "Responsive Search Ads",
      automationFeatures: "Smart Bidding",
    },
    {
      name: "Display — Retargeting",
      funnelStage: "MOF",
      durationPercent: 40,
      recommendedDurationDays: [14, 60],
      budgetPercent: 40,
      objective: "AWARENESS_DISPLAY",
      optimizationGoal: "MAXIMIZE_CONVERSIONS",
      optimizationLocation: "Display Network",
      billingType: "CPC",
      audienceTypes: "Your Data Segments + In-market",
      adFormats: "Responsive Display Ads",
      automationFeatures: "Optimized Targeting",
    },
  ],
};

const GOOGLE_ADS_PMAX_FULL_FUNNEL: StrategyDefinition = {
  id: "google-pmax-full-funnel-base",
  name: "Performance Max Full Funnel",
  variant: "base",
  platform: "google",
  phases: [
    {
      name: "PMax — Multi-Channel",
      funnelStage: "TOF-BOF",
      durationPercent: 70,
      recommendedDurationDays: [30, 90],
      budgetPercent: 70,
      objective: "CONSIDERATION_PMAX",
      optimizationGoal: "MAXIMIZE_CONVERSIONS",
      optimizationLocation: "All Channels",
      billingType: "Auto",
      audienceTypes: "Broad + Affinity + In-market + Your Data",
      adFormats: "Asset Groups (Auto-generated)",
      automationFeatures: "Google AI Optimization",
    },
    {
      name: "Search — Intent Capture",
      funnelStage: "BOF",
      durationPercent: 30,
      recommendedDurationDays: [30, 90],
      budgetPercent: 30,
      objective: "CONVERSION_SEARCH",
      optimizationGoal: "MAXIMIZE_CONVERSIONS",
      optimizationLocation: "Search Network",
      billingType: "CPC",
      audienceTypes: "In-market + Keywords",
      adFormats: "Responsive Search Ads",
      automationFeatures: "Smart Bidding",
    },
  ],
};

const GOOGLE_ADS_VIDEO_AWARENESS: StrategyDefinition = {
  id: "google-video-awareness-base",
  name: "Video Awareness",
  variant: "base",
  platform: "google",
  phases: [
    {
      name: "Video — Efficient Reach",
      funnelStage: "TOF",
      durationPercent: 50,
      recommendedDurationDays: [14, 30],
      budgetPercent: 50,
      objective: "AWARENESS_VIDEO_EFFICIENT_REACH",
      optimizationGoal: "TARGET_CPM",
      optimizationLocation: "YouTube",
      billingType: "CPM",
      audienceTypes: "Affinity + In-market",
      adFormats: "In-stream + In-feed + Shorts",
      automationFeatures: "Standard",
    },
    {
      name: "Demand Gen — Consideration",
      funnelStage: "MOF",
      durationPercent: 30,
      recommendedDurationDays: [14, 30],
      budgetPercent: 30,
      objective: "CONSIDERATION_DEMAND_GEN",
      optimizationGoal: "MAXIMIZE_CLICKS",
      optimizationLocation: "YouTube + Gmail + Discover",
      billingType: "CPC",
      audienceTypes: "Affinity + In-market + Lookalikes",
      adFormats: "Image + Video + Carousel",
      automationFeatures: "Optimized Targeting",
    },
    {
      name: "Search — Conversion",
      funnelStage: "BOF",
      durationPercent: 20,
      recommendedDurationDays: [14, 30],
      budgetPercent: 20,
      objective: "CONVERSION_SEARCH",
      optimizationGoal: "MAXIMIZE_CONVERSIONS",
      optimizationLocation: "Search Network",
      billingType: "CPC",
      audienceTypes: "In-market + Your Data Segments",
      adFormats: "Responsive Search Ads",
      automationFeatures: "Smart Bidding",
    },
  ],
};

const GOOGLE_ADS_SHOPPING: StrategyDefinition = {
  id: "google-shopping-base",
  name: "Shopping & Product Sales",
  variant: "base",
  platform: "google",
  phases: [
    {
      name: "Shopping — Product Listing",
      funnelStage: "BOF",
      durationPercent: 50,
      recommendedDurationDays: [30, 90],
      budgetPercent: 50,
      objective: "CONVERSION_SHOPPING",
      optimizationGoal: "TARGET_ROAS",
      optimizationLocation: "Search + Shopping",
      billingType: "CPC",
      audienceTypes: "In-market + Your Data Segments",
      adFormats: "Product Shopping Ads",
      automationFeatures: "Smart Bidding",
    },
    {
      name: "PMax — Product Discovery",
      funnelStage: "TOF-MOF",
      durationPercent: 50,
      recommendedDurationDays: [30, 90],
      budgetPercent: 50,
      objective: "CONSIDERATION_PMAX",
      optimizationGoal: "MAXIMIZE_CONVERSION_VALUE",
      optimizationLocation: "All Channels",
      billingType: "Auto",
      audienceTypes: "Broad + Affinity + In-market",
      adFormats: "Asset Groups + Product Feed",
      automationFeatures: "Google AI Optimization",
    },
  ],
};

const GOOGLE_ADS_APP_GROWTH: StrategyDefinition = {
  id: "google-app-growth-base",
  name: "App Growth",
  variant: "base",
  platform: "google",
  phases: [
    {
      name: "App — Install Acquisition",
      funnelStage: "TOF",
      durationPercent: 60,
      recommendedDurationDays: [30, 60],
      budgetPercent: 60,
      objective: "CONSIDERATION_APP_INSTALLS",
      optimizationGoal: "TARGET_CPA",
      optimizationLocation: "All Channels",
      billingType: "CPI",
      audienceTypes: "Affinity + In-market",
      adFormats: "App Install Ads",
      automationFeatures: "Google AI Optimization",
    },
    {
      name: "App — Engagement",
      funnelStage: "MOF",
      durationPercent: 40,
      recommendedDurationDays: [30, 60],
      budgetPercent: 40,
      objective: "CONSIDERATION_APP_ENGAGEMENT",
      optimizationGoal: "TARGET_CPA",
      optimizationLocation: "All Channels",
      billingType: "CPA",
      audienceTypes: "Your Data Segments",
      adFormats: "App Engagement Ads",
      automationFeatures: "Google AI Optimization",
    },
  ],
};

const GOOGLE_ADS_DEMAND_GEN: StrategyDefinition = {
  id: "google-demand-gen-base",
  name: "Demand Gen & Discovery",
  variant: "base",
  platform: "google",
  phases: [
    {
      name: "Demand Gen — Awareness",
      funnelStage: "TOF",
      durationPercent: 40,
      recommendedDurationDays: [14, 30],
      budgetPercent: 40,
      objective: "CONSIDERATION_DEMAND_GEN",
      optimizationGoal: "MAXIMIZE_CLICKS",
      optimizationLocation: "YouTube + Gmail + Discover",
      billingType: "CPC",
      audienceTypes: "Affinity + In-market + Lookalikes",
      adFormats: "Image + Video + Carousel",
      automationFeatures: "Optimized Targeting",
    },
    {
      name: "Demand Gen — Conversion",
      funnelStage: "MOF",
      durationPercent: 35,
      recommendedDurationDays: [14, 30],
      budgetPercent: 35,
      objective: "CONSIDERATION_DEMAND_GEN",
      optimizationGoal: "MAXIMIZE_CONVERSIONS",
      optimizationLocation: "YouTube + Gmail + Discover",
      billingType: "CPA",
      audienceTypes: "In-market + Your Data Segments + Lookalikes",
      adFormats: "Image + Video + Carousel",
      automationFeatures: "Optimized Targeting + Smart Bidding",
    },
    {
      name: "Search — Bottom Funnel",
      funnelStage: "BOF",
      durationPercent: 25,
      recommendedDurationDays: [14, 30],
      budgetPercent: 25,
      objective: "CONVERSION_SEARCH",
      optimizationGoal: "MAXIMIZE_CONVERSIONS",
      optimizationLocation: "Search Network",
      billingType: "CPC",
      audienceTypes: "In-market + Keywords",
      adFormats: "Responsive Search Ads",
      automationFeatures: "Smart Bidding",
    },
  ],
};

const GOOGLE_ADS_STRATEGY_GROUPS: StrategyGroup[] = [
  {
    id: "google-search-conversions",
    name: "Search Conversions",
    platform: "google",
    variants: [GOOGLE_ADS_SEARCH_CONVERSIONS],
  },
  {
    id: "google-pmax-full-funnel",
    name: "Performance Max Full Funnel",
    platform: "google",
    variants: [GOOGLE_ADS_PMAX_FULL_FUNNEL],
  },
  {
    id: "google-video-awareness",
    name: "Video Awareness",
    platform: "google",
    variants: [GOOGLE_ADS_VIDEO_AWARENESS],
  },
  {
    id: "google-shopping",
    name: "Shopping & Product Sales",
    platform: "google",
    variants: [GOOGLE_ADS_SHOPPING],
  },
  {
    id: "google-app-growth",
    name: "App Growth",
    platform: "google",
    variants: [GOOGLE_ADS_APP_GROWTH],
  },
  {
    id: "google-demand-gen",
    name: "Demand Gen & Discovery",
    platform: "google",
    variants: [GOOGLE_ADS_DEMAND_GEN],
  },
];

/**
 * Find a strategy definition by ID
 */
export function getStrategyById(strategyId: string): StrategyDefinition | undefined {
  const allStrategies = [
    ...META_STRATEGY_GROUPS.flatMap(g => g.variants),
    ...TIKTOK_STRATEGY_GROUPS.flatMap(g => g.variants),
    ...GOOGLE_ADS_STRATEGY_GROUPS.flatMap(g => g.variants),
  ];
  return allStrategies.find(s => s.id === strategyId);
}

/**
 * Get variant label
 */
export function getVariantLabel(variant: "base" | "advantage+" | "smart"): string {
  switch (variant) {
    case "base": return "Base";
    case "advantage+": return "Advantage+";
    case "smart": return "Smart Performance";
  }
}

/**
 * Get recommended duration warning text if campaign is too short
 */
export function getDurationWarning(
  phase: StrategyPhase,
  actualDays: number
): string | null {
  if (phase.recommendedDurationDays === "always-on" || phase.recommendedDurationDays === "ongoing") {
    return null;
  }
  const [minDays] = phase.recommendedDurationDays;
  if (actualDays < minDays) {
    return `Recommended: ${phase.recommendedDurationDays[0]}-${phase.recommendedDurationDays[1]} days (current: ${actualDays} days)`;
  }
  return null;
}

/**
 * Generate phases from a strategy definition with actual campaign dates
 */
export function generatePhasesFromStrategy(
  strategy: StrategyDefinition,
  startDate: string,
  endDate: string
): Array<{
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetPercentage: number;
  objective: string;
  optimizationGoal: string;
  destination: string;
  funnelStage: string;
  audienceTypes: string;
  adFormats: string;
  automationFeatures: string;
  billingType: string;
  recommendedDurationDays: [number, number] | "always-on" | "ongoing";
  useBroadTargeting: boolean;
  overrideTargeting: boolean | undefined;
  // Advantage+/Smart+ auto-configuration
  metaAdvantagePlusCampaign?: boolean;
  metaAdvantagePlusAudience?: boolean;
  metaAdvantagePlusCreative?: boolean;
  tiktokSmartPlusEnabled?: boolean;
  tiktokSmartCreativeEnabled?: boolean;
  tiktokAutoTargetingEnabled?: boolean;
}> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  // Determine if this is an Advantage+/Smart variant
  const isAdvantagePlus = strategy.variant === "advantage+";
  const isSmart = strategy.variant === "smart";

  return strategy.phases.map((phase, index) => {
    // Determine if this is a Search phase (Google or TikTok)
    const isGoogleSearch = strategy.platform === "google" && phase.objective === "CONVERSION_SEARCH";
    const isTikTokSearch = strategy.platform === "tiktok" && phase.adFormats.toLowerCase().includes("search");
    const isSearchPhase = isGoogleSearch || isTikTokSearch;

    // Search phases are always-on: span the entire actiplan duration
    let phaseStart: Date;
    let phaseEnd: Date;

    if (isSearchPhase) {
      phaseStart = new Date(start);
      phaseEnd = new Date(end);
    } else {
      // Calculate cumulative duration offset for non-search phases
      const prevDuration = strategy.phases
        .slice(0, index)
        .reduce((sum, p) => sum + p.durationPercent, 0);
      const phaseStartDay = Math.round((prevDuration / 100) * totalDays);
      const phaseEndDay = index === strategy.phases.length - 1
        ? totalDays
        : Math.round(((prevDuration + phase.durationPercent) / 100) * totalDays);

      phaseStart = new Date(start);
      phaseStart.setDate(phaseStart.getDate() + phaseStartDay);
      phaseEnd = new Date(start);
      phaseEnd.setDate(phaseEnd.getDate() + phaseEndDay);
    }

    // Determine broad targeting from audience types
    const audienceLower = phase.audienceTypes.toLowerCase();
    const useBroadTargeting = audienceLower.includes("broad") && 
      !audienceLower.includes("visitor") && 
      !audienceLower.includes("retarget") &&
      !audienceLower.includes("engager");

    // Auto-set Advantage+/Smart+ flags based on strategy variant
    const result: any = {
      id: `phase-${index}-${Date.now()}`,
      name: phase.name,
      startDate: phaseStart.toISOString().split("T")[0],
      endDate: phaseEnd.toISOString().split("T")[0],
      budgetPercentage: phase.budgetPercent,
      objective: phase.objective,
      optimizationGoal: phase.optimizationGoal,
      destination: phase.optimizationLocation,
      funnelStage: phase.funnelStage,
      audienceTypes: phase.audienceTypes,
      adFormats: phase.adFormats,
      automationFeatures: phase.automationFeatures,
      billingType: phase.billingType,
      recommendedDurationDays: phase.recommendedDurationDays,
      useBroadTargeting,
      overrideTargeting: useBroadTargeting ? false : undefined,
    };

    // Google Ads: auto-set googleCampaignType from objective
    if (strategy.platform === "google") {
      const objToType: Record<string, string> = {
        CONVERSION_SEARCH: "Search",
        AWARENESS_DISPLAY: "Display",
        CONSIDERATION_PMAX: "Performance Max",
        AWARENESS_VIDEO_EFFICIENT_REACH: "Video",
        CONSIDERATION_DEMAND_GEN: "Demand Gen",
        CONVERSION_SHOPPING: "Shopping",
        CONSIDERATION_APP_INSTALLS: "App Promotion",
      };
      if (objToType[phase.objective]) {
        result.googleCampaignType = objToType[phase.objective];
      }
    }

    // Meta Advantage+ variant auto-configuration
    if (strategy.platform === "meta" && isAdvantagePlus) {
      result.metaAdvantagePlusCampaign = phase.objective === "OUTCOME_SALES";
      result.metaAdvantagePlusAudience = true;
      result.metaAdvantagePlusCreative = true;
    }

    // TikTok: mark Search keyword phases
    if (strategy.platform === "tiktok") {
      if (phase.adFormats.toLowerCase().includes("search")) {
        result.tiktokCampaignType = "Search";
      }
      // Smart variant auto-configuration
      if (isSmart) {
        result.tiktokSmartPlusEnabled = true;
        result.tiktokSmartCreativeEnabled = true;
        result.tiktokAutoTargetingEnabled = true;
      }
    }

    return result;
  });
}
