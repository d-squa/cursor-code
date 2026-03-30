// QC Checklist definitions per platform and entity type

export interface QCChecklistItem {
  key: string;
  label: string;
  description: string;
  category?: string;
}

export interface PlatformChecklist {
  campaign: QCChecklistItem[];
  adset: QCChecklistItem[];
  ad: QCChecklistItem[];
}

export type PlatformKey = "meta" | "tiktok" | "linkedin" | "google" | "x" | "snapchat";

// ─── META (Facebook & Instagram) ────────────────────────────────────────────

const META_CAMPAIGN: QCChecklistItem[] = [
  {
    key: "naming_taxonomy",
    label: "Campaign naming follows taxonomy",
    description: "Follow Meta taxonomy guide format",
  },
  {
    key: "bo_number",
    label: "BO number is added",
    description: "Enter in campaign label/tags or campaign name suffix",
  },
  {
    key: "special_ad_category",
    label: "Special Ad Category is correctly set",
    description: "If applicable (credit, housing, employment)",
  },
  {
    key: "objective",
    label: "Objective is correctly selected",
    description: "Lead Gen / Awareness / Traffic / Conversions",
  },
  { key: "cbo", label: "Campaign Budget Optimization (CBO)", description: "On or Off as per strategy" },
  { key: "budget_type", label: "Budget type and amount set", description: "Daily vs Lifetime; match media plan" },
  { key: "pacing", label: "Pacing reviewed", description: "Standard vs Accelerated" },
  { key: "dates", label: "Start and end dates correct", description: "Match media plan; verify time zone" },
  {
    key: "advantage_plus",
    label: "Advantage+ Campaign Setup",
    description: "Confirm if used and settings are correct",
  },
  { key: "spending_limit", label: "Campaign spending limit added", description: "Inline with BO amount" },
];

const META_ADSET: QCChecklistItem[] = [
  { key: "naming_taxonomy", label: "Ad set naming follows taxonomy", description: "Follow Meta ad set naming guide" },
  {
    key: "facebook_page",
    label: "Correct Facebook Page linked",
    description: "For accurate attribution and reporting",
  },
  {
    key: "optimization_goal",
    label: "Optimization goal matches campaign objective",
    description: "Verify conversion goal (Website Lead / Instant Forms)",
  },
  { key: "performance_goal", label: "Performance goal aligns with bid strategy", description: "Confirm alignment" },
  {
    key: "pixel_event",
    label: "Pixel and conversion event configured",
    description: "Ensure pixel and event are properly set",
  },
  {
    key: "schedule",
    label: "Schedule aligns with campaign timing",
    description: "Verify date/time and dayparting if applicable",
  },
  { key: "budget", label: "Budget correctly configured", description: "Daily vs Lifetime; matches plan" },
  { key: "audience", label: "Correct audience selected", description: "Interests/Lookalike/Remarketing as per plan" },
  {
    key: "location",
    label: "Location targeting accurate",
    description: "Country/City/Radius; exclude non-target countries",
  },
  { key: "demographics", label: "Age and gender targeting accurate", description: "Verify demographic filters" },
  { key: "language", label: "No language targeting", description: "Unless specifically required by strategy" },
  { key: "advantage_audience", label: "Advantage+ Audience option", description: "Enable only if part of strategy" },
  { key: "placement", label: "Placement selection", description: "Advantage+ placements unless manual required" },
  { key: "exclude_audience_network", label: "Exclude Audience Network", description: "Unless specifically required" },
  { key: "exclude_ig_explore", label: "Exclude IG Explore & Explore Home", description: "For destination campaigns" },
  {
    key: "retargeting_exclusion",
    label: "Retargeting audience excluded from prospecting",
    description: "If using retargeting, exclude from prospecting ad sets",
  },
];

const META_AD: QCChecklistItem[] = [
  { key: "naming_convention", label: "Ad naming follows convention", description: "AD1_IMG_CAR_PROMO_ARABIC format" },
  {
    key: "pages_selected",
    label: "Correct Facebook/Instagram pages selected",
    description: "Ensure proper attribution and branding",
  },
  { key: "safe_zones", label: "Creative follows safe zones", description: "Text not covered by logo, caption, or CTA" },
  { key: "creative_sizes", label: "Creative has all required sizes", description: "For all selected placements" },
  { key: "primary_text", label: "Primary text matches brief", description: "Approved copy, error-free" },
  { key: "headline", label: "Headline matches brief", description: "Approved copy, error-free" },
  { key: "description", label: "Description matches brief", description: "Approved copy, error-free" },
  {
    key: "creative_uploaded",
    label: "Correct creative (image/video) uploaded",
    description: "Final version, correctly formatted",
  },
  { key: "cta_button", label: "CTA button matches campaign objective", description: "Choose appropriate CTA" },
  { key: "url_utm", label: "URL and UTM parameters tested", description: "Test link; ensure UTMs are added" },
  {
    key: "destination_link",
    label: "Instant form or website link configured",
    description: "Check form or destination link",
  },
  {
    key: "language_match",
    label: "Language matches targeting and creative",
    description: "Ensure language consistency",
  },
  {
    key: "ad_previews",
    label: "Ad previews reviewed on all placements",
    description: "Use preview tool to confirm layout",
  },
  {
    key: "advantage_enhancements",
    label: "All Advantage+ creative enhancements OFF",
    description: "Except Relevant Comments",
  },
  {
    key: "text_asset_fit",
    label: "Text & asset fit across placements",
    description: "Adapts well across Feed, Stories, Reels",
  },
  { key: "post_type", label: "Page post or dark post set up", description: "As per requirement" },
  { key: "view_tags", label: "View tags added if required", description: "Check with planning team" },
];

// ─── TIKTOK ─────────────────────────────────────────────────────────────────

const TIKTOK_CAMPAIGN: QCChecklistItem[] = [
  { key: "naming_taxonomy", label: "Campaign naming follows taxonomy", description: "Follow TikTok taxonomy guide" },
  { key: "bo_number", label: "BO number is added", description: "Enter at end of campaign name" },
  {
    key: "objective",
    label: "Objective & conversion goal correctly selected",
    description: "Traffic, Conversions, Awareness; if Conversions, confirm TikTok event",
  },
  { key: "campaign_setup", label: "Confirm manual vs Smart+ campaign setup", description: "As per strategy" },
  {
    key: "budget_type",
    label: "Budget type and amount set",
    description: "Daily vs Lifetime; pacing standard vs accelerated",
  },
  { key: "dates", label: "Start and end dates match media plan", description: "Correct time zone" },
  { key: "pixel", label: "TikTok Pixel installed and verified", description: "Conversion event configured" },

  {
    key: "account_funded",
    label: "Account funded before launch",
    description: "Remind planners to add budget based on campaign budget",
  },
];

const TIKTOK_ADSET: QCChecklistItem[] = [
  {
    key: "naming_taxonomy",
    label: "Ad group naming follows taxonomy",
    description: "PRO_UAE_MIXEDPLACEMENT_Interest format",
  },
  {
    key: "optimization",
    label: "Optimization location, goal, and event checked",
    description: "Match campaign objective",
  },
  { key: "placement", label: "Manual placement selected", description: "Remove Pangle placement" },
  {
    key: "audience",
    label: "Audience targeting accurate",
    description: "Interest, Lookalike, Custom; demographics correct",
  },
  { key: "device", label: "Device targeting details checked", description: "As per strategy" },
  { key: "budget_duration", label: "Ad group budget and duration accurate", description: "Match media plan" },
  { key: "bid_strategy", label: "Bid strategy configured", description: "oCPC, CPC, oCPM" },
  { key: "schedule", label: "Ad group schedule and day-parting aligned", description: "With campaign timing" },
];

const TIKTOK_AD: QCChecklistItem[] = [
  { key: "naming_convention", label: "Ad naming follows convention", description: "AD1_VID_CARPROMO_EN format" },
  {
    key: "creative_specs",
    label: "Creative specs meet TikTok requirements",
    description: "Duration, aspect ratio, resolution",
  },
  { key: "profile_visibility", label: "Don't show on TikTok profile is checked", description: "As per best practice" },
  { key: "automate_creative", label: "Automate Creative is OFF", description: "Unless specifically required" },
  {
    key: "caption_text",
    label: "Caption text, hashtags, mentions match approved copy",
    description: "Error-free and aligned",
  },
  { key: "cta_button", label: "CTA button appropriate for objective", description: "Choose correctly" },
  {
    key: "interactive_addons",
    label: "Interactive add-ons added if required",
    description: "Display Card, Countdown Sticker",
  },
  { key: "url_utm", label: "Destination URL and UTM parameters tested", description: "Correct and functional" },
  { key: "form_landing", label: "Instant form or landing page tested", description: "If applicable" },
];

// ─── LINKEDIN ───────────────────────────────────────────────────────────────

const LINKEDIN_CAMPAIGN: QCChecklistItem[] = [
  { key: "naming_taxonomy", label: "Campaign naming follows taxonomy", description: "Follow LinkedIn taxonomy guide" },
  {
    key: "objective",
    label: "Objective & conversion goal correctly selected",
    description: "Website Visits, Lead Gen Form Opens, Video Views",
  },
  { key: "budget_type", label: "Budget type and amount set", description: "Daily vs Lifetime" },
  { key: "pacing", label: "Pacing is Standard or Accelerated", description: "As per strategy" },
  { key: "dates", label: "Start and end dates match media plan", description: "Correct time zone" },
  { key: "billing_code", label: "Billing code or IO number added", description: "For tracking" },
  { key: "insight_tag", label: "Insight Tag and conversion tracking installed", description: "Verified" },
  {
    key: "access_permissions",
    label: "Ad account access and permissions confirmed",
    description: "Proper access levels",
  },
];

const LINKEDIN_ADSET: QCChecklistItem[] = [
  { key: "naming_taxonomy", label: "Ad group naming follows taxonomy", description: "PRO_UAE_JOBTITLE_FUNC format" },
  { key: "auto_targeting", label: "Auto-Targeting used when required", description: "As per strategy" },
  {
    key: "audience_filters",
    label: "Audience targeting filters configured",
    description: "Location, Company, Job Title, Function, Seniority",
  },
  {
    key: "matched_audiences",
    label: "Matched Audiences added only when required",
    description: "Retargeting/lookalike",
  },
  {
    key: "audience_expansion",
    label: "Audience expansion toggled on only when required",
    description: "As per strategy",
  },
  {
    key: "bid_budget",
    label: "Bid type and budget correctly configured",
    description: "Automated vs Maximum Delivery",
  },
  { key: "ad_format", label: "Ad Format selected properly", description: "Single Image, Video, Carousel, Message Ad" },
  { key: "schedule", label: "Schedule and day-parting aligned", description: "With campaign timing" },
  {
    key: "remove_audience_network",
    label: "Remove Audience Network from placements",
    description: "Unless specifically required",
  },
  { key: "conversion_tracking", label: "Conversion tracking settings configured", description: "Verified" },
];

const LINKEDIN_AD: QCChecklistItem[] = [
  { key: "naming_convention", label: "Ad naming follows convention", description: "AD1_IMG_CAR_LIN format" },
  {
    key: "creative_specs",
    label: "Creative asset meets LinkedIn specs",
    description: "Dimensions, format, video length",
  },
  {
    key: "ad_copy",
    label: "Ad copy, headline, description match approved text",
    description: "Error-free and aligned",
  },
  { key: "cta_button", label: "CTA button appropriate for objective", description: "Learn More, Sign Up, etc." },
  { key: "url_utm", label: "Destination URL and UTM parameters tested", description: "Correct and functional" },
  { key: "lead_gen_form", label: "Lead Gen Form integration tested", description: "Fields configured if applicable" },
  { key: "preview", label: "Preview in Campaign Manager shows correct rendering", description: "Across placements" },
  { key: "messaging", label: "Sponsored Messaging settings configured", description: "For Message Ads" },
  {
    key: "dynamic_creative",
    label: "Dynamic creative/templates toggled only when required",
    description: "As per strategy",
  },
];

// ─── GOOGLE ADS ─────────────────────────────────────────────────────────────

const GOOGLE_CAMPAIGN: QCChecklistItem[] = [
  { key: "naming_taxonomy", label: "Campaign naming follows taxonomy", description: "Follow Google taxonomy guide" },
  { key: "booking_number", label: "Booking/Order number added", description: "For internal tracking" },
  {
    key: "goal_type",
    label: "Goal & campaign type correct",
    description: "Sales, Leads, Traffic, Brand Awareness; Search, Display, PMax, Shopping, Video",
  },
  {
    key: "budget_bidding",
    label: "Budget & bidding reviewed",
    description: "Daily/shared budget; Max Conversions, Target CPA/ROAS, Manual CPC",
  },
  { key: "dates", label: "Start and end dates correct", description: "Match media plan" },
  {
    key: "automated_features",
    label: "Automated features configured",
    description: "Smart Bidding, PMax asset groups, or manual settings",
  },
  {
    key: "policy_compliance",
    label: "Policy compliance & ad status checked",
    description: "Review Policy Center for disapprovals",
  },
  {
    key: "recommendations",
    label: "Recommendations tab reviewed",
    description: "Scan for critical/high-impact suggestions",
  },
  { key: "end_date", label: "End date selected", description: "For all campaigns and account budget" },
  { key: "conversion_goals", label: "Campaign Specific Conversion Goals Selected", description: "As per strategy" },
];

const GOOGLE_ADSET: QCChecklistItem[] = [
  {
    key: "naming_taxonomy",
    label: "Ad group naming follows taxonomy",
    description: "Follow Google ad group naming guide",
  },
  {
    key: "conversion_action",
    label: "Conversion action optimization",
    description: "Verify optimization for correct conversion (Lead, Purchase)",
  },
  { key: "parent_campaign", label: "Parent campaign alignment", description: "Under intended campaign type" },
  {
    key: "bid_settings",
    label: "Bidding & bid settings checked",
    description: "Default max CPC or portfolio bid strategy",
  },
  {
    key: "keywords_match",
    label: "Keywords & match types correct",
    description: "Exact, phrase, broad align with keyword theme",
  },
  {
    key: "negative_keywords",
    label: "Negative keywords applied",
    description: "Shared and ad-group-level negatives block irrelevant terms",
  },
  {
    key: "audience",
    label: "Audience targeting confirmed",
    description: "In-market, affinity, custom intent, remarketing lists",
  },
  {
    key: "ad_rotation",
    label: "Ad rotation & optimization reviewed",
    description: '"Optimize for best performing ads" vs "Rotate evenly"',
  },
  {
    key: "device_adjustments",
    label: "Device bid adjustments checked",
    description: "Mobile/desktop/tablet modifiers",
  },
  {
    key: "ad_schedule",
    label: "Ad schedule overrides verified",
    description: "If dayparting, hours/days align with plan",
  },
  { key: "policy_flags", label: "Recommendations & policy flags scanned", description: "Flag disapproved ads" },
];

const GOOGLE_AD: QCChecklistItem[] = [
  { key: "naming_taxonomy", label: "Ad naming follows taxonomy", description: "Use structured naming" },
  {
    key: "ad_format",
    label: "Ad format & type matches campaign",
    description: "RSA/ETA for Search; Image/HTML5 for Display; Video for YouTube",
  },
  {
    key: "headlines_count",
    label: "Headlines & descriptions count",
    description: "≥3 headlines & ≥2 descriptions per RSA",
  },
  {
    key: "character_limits",
    label: "Character limits respected",
    description: "Headlines ≤30 chars; Descriptions ≤90 chars",
  },
  {
    key: "headline_relevance",
    label: "Headline relevance (Search)",
    description: "Includes primary keyword in at least one headline",
  },
  { key: "description_cta", label: "Description & CTA clear", description: "Aligns with campaign objective" },
  { key: "final_url", label: "Final URL accuracy", description: "Correct landing page; test on desktop & mobile" },
  { key: "display_url", label: "Display URL & path fields correct", description: 'Each "path" ≤15 chars' },
  { key: "tracking_params", label: "Tracking & parameters present", description: "UTM tags or ValueTrack parameters" },
  {
    key: "ad_preview",
    label: "Ad preview QA performed",
    description: "Check formatting on all devices & partner networks",
  },
  { key: "policy_status", label: "Policy & approval status", description: "No disapprovals or warnings" },
  { key: "language", label: "Language consistency", description: "Matches campaign language setting" },
  {
    key: "asset_specs",
    label: "Asset specs meet requirements",
    description: "Images/videos meet size, format, file-size requirements",
  },
  {
    key: "pmax_assets",
    label: "Performance Max asset group",
    description: "Contains required assets (logos, headlines, descriptions, images, videos)",
  },
  { key: "demand_gen_video_off", label: "Demand Gen: video enhancements OFF", description: "For Demand Gen campaigns" },
  {
    key: "demand_gen_video_format",
    label: "Demand Gen: video format matches placement",
    description: "16:9 for in-feed; 9:16 for Shorts",
  },
  {
    key: "pmax_video_off",
    label: "PMax: Video Enhancement OFF",
    description: "Under campaign settings > Asset optimization",
  },
  {
    key: "pmax_url_exclusions",
    label: "PMax: URL exclusions applied",
    description: "For Text Customizations and URL Expansion",
  },
  { key: "ad_strength", label: "Check ad strength (RSA)", description: "Aim for Good or Excellent" },
  { key: "extensions", label: "Extensions configured", description: "Sitelinks, callouts, structured snippets, etc." },
  { key: "cta_button", label: "CTA button used", description: "Where applicable" },
  { key: "google_tag", label: "Google tag verified on landing page", description: "Before launch" },
];

// ─── X (TWITTER) ────────────────────────────────────────────────────────────

const X_CAMPAIGN: QCChecklistItem[] = [
  { key: "naming_taxonomy", label: "Campaign naming follows taxonomy", description: "Follow X taxonomy guide" },
  { key: "bo_number", label: "BO number is added", description: "At end of campaign name" },
  {
    key: "objective",
    label: "Objective & conversion goal correctly selected",
    description: "Website Clicks, Conversions, App Installs, Awareness",
  },
  { key: "cbo", label: "Campaign Budget Optimization (CBO)", description: "On or Off as needed" },
  { key: "budget_type", label: "Budget type and amount set", description: "Daily vs Total" },
  { key: "pacing", label: "Pacing is Standard or Accelerated", description: "As per strategy" },
  { key: "dates", label: "Start and end dates match media plan", description: "Correct time zone" },
  { key: "pixel", label: "Twitter Pixel or conversion tracking installed", description: "Verified" },
  { key: "funding", label: "Funding source confirmed with planners", description: "Always confirm" },
];

const X_ADSET: QCChecklistItem[] = [
  { key: "naming_taxonomy", label: "Ad group naming follows taxonomy", description: "PRO_UAE_INTEREST_ENGAGE format" },
  { key: "dynamic_creative", label: "Dynamic Creative is disabled", description: "Only on when required" },
  { key: "delivery_goal", label: "Delivery goal matches campaign objective", description: "As per strategy" },
  { key: "conversion_event", label: "Conversion event correctly selected", description: "For optimization" },
  { key: "bid_strategy", label: "Bid strategy and Pay By settings correctly configured", description: "As per plan" },
  { key: "placements", label: "Placements selected properly", description: "As per strategy" },
  { key: "device_targets", label: "Device targets and operating systems selected", description: "As per strategy" },
  {
    key: "premium_subscribers",
    label: "Premium subscribers targeted only when required",
    description: "As per strategy",
  },
  { key: "custom_audiences", label: "Custom audiences added only when required", description: "As per strategy" },
  {
    key: "targeting_features",
    label: "Targeting features configured properly",
    description: "Keywords, Follower Lookalikes, Interests, Movies & TV Shows, Conversation Topics",
  },
  { key: "retargeting", label: "Retargeting features configured properly", description: "Lists added correctly" },
  {
    key: "optimized_targeting",
    label: "Optimized Targeting toggled On only when part of strategy",
    description: "As per strategy",
  },
  {
    key: "exclusions",
    label: "Exclusions applied",
    description: "On ad account level (pre-configured for Events, VAD AO & Corporate)",
  },
];

const X_AD: QCChecklistItem[] = [
  { key: "naming_convention", label: "Ad naming follows convention", description: "AD1_TEXT_IMAGE_EN format" },
  { key: "tweet_copy", label: "Tweet copy matches approved text", description: "Error-free" },
  { key: "media_specs", label: "Media asset meets spec", description: "Image/video dimensions, format" },
  { key: "hashtags", label: "Hashtags and mentions reviewed", description: "For relevance" },
  { key: "cta_button", label: "CTA prompt or button configured correctly", description: "As per objective" },
  { key: "url_utm", label: "Destination URL and UTM parameters tested", description: "Correct and functional" },
  { key: "conversion_form", label: "Conversion event or Lead Gen card tested", description: "If applicable" },
  { key: "preview", label: "Preview in Ads Manager shows correct formatting", description: "No truncation" },
  { key: "engagement", label: "Engagement features configured if required", description: "Polls, Cards, Lead Gen" },
];

// ─── SNAPCHAT ───────────────────────────────────────────────────────────────

const SNAPCHAT_CAMPAIGN: QCChecklistItem[] = [
  { key: "naming_taxonomy", label: "Campaign naming follows taxonomy", description: "Follow Snapchat taxonomy guide" },
  { key: "bo_number", label: "BO number is added", description: "At end of campaign name" },
  { key: "objective", label: "Objective correctly selected", description: "As per strategy" },
  { key: "budget_type", label: "Budget type and amount set", description: "Daily vs Lifetime" },
  { key: "dates", label: "Start and end dates match media plan", description: "Correct time zone" },
  { key: "pixel", label: "Pixel or conversion tracking installed", description: "Verified" },
];

const SNAPCHAT_ADSET: QCChecklistItem[] = [
  { key: "naming_taxonomy", label: "Ad group naming follows taxonomy", description: "Follow naming guide" },
  { key: "city_targeting", label: "Special city targeting used", description: "Refer to Snap City Targeting sheet" },
  { key: "location", label: "Location targeting accurate", description: "As per plan" },
  { key: "audience", label: "Audience targeting configured", description: "Interests, demographics, custom audiences" },
  { key: "bid_strategy", label: "Bid strategy configured", description: "As per plan" },
  { key: "placements", label: "Placements selected properly", description: "As per strategy" },
  { key: "schedule", label: "Schedule and day-parting aligned", description: "With campaign timing" },
];

const SNAPCHAT_AD: QCChecklistItem[] = [
  { key: "naming_convention", label: "Ad naming follows convention", description: "Follow naming guide" },
  {
    key: "creative_specs",
    label: "Creative asset meets Snapchat specs",
    description: "Dimensions, format, video length",
  },
  { key: "ad_copy", label: "Ad copy matches approved text", description: "Error-free" },
  { key: "cta_button", label: "CTA button appropriate for objective", description: "Choose correctly" },
  { key: "url_utm", label: "Destination URL and UTM parameters tested", description: "Correct and functional" },
  { key: "impression_tags", label: "Remove box brackets from timestamp", description: "On Impression tags" },
  { key: "form_attachment", label: "Instant form or attachment tested", description: "If applicable" },
  { key: "preview", label: "Preview in Ads Manager shows correct rendering", description: "Across placements" },
];

// ─── CROSS-PLATFORM ─────────────────────────────────────────────────────────

export const CROSS_PLATFORM_CHECKLIST: QCChecklistItem[] = [
  // Pre-Launch
  {
    key: "xp_budget_plan",
    label: "Budget in BO and Plan checked",
    description: "Verify against media plan",
    category: "PRE-LAUNCH",
  },
  {
    key: "xp_preview_links",
    label: "Permalinks / Preview links checked and shared",
    description: "Ad preview and functionality; share with Comms Team",
    category: "PRE-LAUNCH",
  },
  {
    key: "xp_landing_tags",
    label: "Landing page checked for tags",
    description: "Ensure tags are working before launch",
    category: "PRE-LAUNCH",
  },
  {
    key: "xp_correct_pixels",
    label: "Correct pixels/tags used",
    description: "Verify correct pixels for each platform",
    category: "PRE-LAUNCH",
  },
  {
    key: "xp_detailed_qc",
    label: "Detailed QC performed before live",
    description: "Use checklist before launch",
    category: "PRE-LAUNCH",
  },
  // Tracking
  {
    key: "xp_utm_tested",
    label: "UTM parameters tested and correct",
    description: "Ensure UTMs are added and functional",
    category: "TRACKING",
  },
  {
    key: "xp_conversion_tracking",
    label: "Conversion tracking installed and verified",
    description: "Events configured correctly",
    category: "TRACKING",
  },
  {
    key: "xp_view_tags",
    label: "View tags added if required",
    description: "Check with planning team",
    category: "TRACKING",
  },
  {
    key: "xp_auto_tagging",
    label: "Auto-tagging enabled (where applicable)",
    description: "For Amplitude and other analytics",
    category: "TRACKING",
  },
  // Account
  {
    key: "xp_account_naming",
    label: "Ad account naming follows convention",
    description: "Publicis naming convention",
    category: "ACCOUNT",
  },
  {
    key: "xp_user_access",
    label: "User access rights reviewed",
    description: "Clients (view/read-only), planners (standard), Performics (admin)",
    category: "ACCOUNT",
  },
  {
    key: "xp_billing",
    label: "Billing profile correct",
    description: "Linked properly on MCC level",
    category: "ACCOUNT",
  },
  { key: "xp_dataroma", label: "New accounts linked to Dataroma", description: "Send to Ghadeer", category: "ACCOUNT" },
  {
    key: "xp_country_exclusions",
    label: "Country exclusions applied",
    description: "Exclude Austria, France, Italy, Spain, Türkiye, United Kingdom if not targeting",
    category: "ACCOUNT",
  },
  // Post-Launch
  {
    key: "xp_post_launch_check",
    label: "Campaigns checked after live",
    description: "Check for rejected ads, disapprovals, etc.",
    category: "POST-LAUNCH",
  },
  {
    key: "xp_performance_review",
    label: "Performance reviewed biweekly",
    description: "Inform planners of recommendations",
    category: "POST-LAUNCH",
  },
  {
    key: "xp_budget_pacing",
    label: "Budget pacing monitored",
    description: "Check at least twice a week",
    category: "POST-LAUNCH",
  },
  {
    key: "xp_daily_budget",
    label: "Campaign start with correct daily budget",
    description: "Not with small daily budget",
    category: "POST-LAUNCH",
  },
  {
    key: "xp_end_date",
    label: "End date added to all campaigns",
    description: "Including account budget",
    category: "POST-LAUNCH",
  },
  // Documentation
  {
    key: "xp_email_thread",
    label: "Important details in email thread",
    description: "Keep communication documented",
    category: "DOCUMENTATION",
  },
  {
    key: "xp_group_chats",
    label: "Group chats or emails for discussions",
    description: "Not informal channels",
    category: "DOCUMENTATION",
  },
  {
    key: "xp_campaign_tracker",
    label: "Campaign tracker updated",
    description: "Accurately and on time",
    category: "DOCUMENTATION",
  },
  {
    key: "xp_bo_documented",
    label: "BO number indicated in campaign tags/name",
    description: "For internal tracking",
    category: "DOCUMENTATION",
  },
];

// ─── PLATFORM MAP ───────────────────────────────────────────────────────────

export const DEFAULT_QC_CHECKLISTS: Record<PlatformKey, PlatformChecklist> = {
  meta: { campaign: META_CAMPAIGN, adset: META_ADSET, ad: META_AD },
  tiktok: { campaign: TIKTOK_CAMPAIGN, adset: TIKTOK_ADSET, ad: TIKTOK_AD },
  linkedin: { campaign: LINKEDIN_CAMPAIGN, adset: LINKEDIN_ADSET, ad: LINKEDIN_AD },
  google: { campaign: GOOGLE_CAMPAIGN, adset: GOOGLE_ADSET, ad: GOOGLE_AD },
  x: { campaign: X_CAMPAIGN, adset: X_ADSET, ad: X_AD },
  snapchat: { campaign: SNAPCHAT_CAMPAIGN, adset: SNAPCHAT_ADSET, ad: SNAPCHAT_AD },
};

/**
 * Get the checklist items for a given platform and entity type.
 * Includes cross-platform items appended at the end.
 */
export function getChecklistForEntity(
  platform: string,
  entityType: string,
  customItems?: QCChecklistItem[] | null,
): QCChecklistItem[] {
  if (customItems && customItems.length > 0) return customItems;

  const normalizedPlatform = normalizePlatform(platform);
  const normalizedType = normalizeEntityType(entityType);

  const platformChecklist = DEFAULT_QC_CHECKLISTS[normalizedPlatform];
  if (!platformChecklist) return CROSS_PLATFORM_CHECKLIST;

  const items = platformChecklist[normalizedType] || [];
  // Only add cross-platform items to campaign level to avoid duplication
  if (normalizedType === "campaign") {
    return [...items, ...CROSS_PLATFORM_CHECKLIST];
  }
  return items;
}

export function normalizePlatform(platform: string): PlatformKey {
  const p = platform.toLowerCase();
  if (p.includes("meta") || p.includes("facebook") || p.includes("instagram")) return "meta";
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("google")) return "google";
  if (p.includes("twitter") || p === "x") return "x";
  if (p.includes("snapchat") || p.includes("snap")) return "snapchat";
  return p as PlatformKey;
}

export function normalizeEntityType(entityType: string): "campaign" | "adset" | "ad" {
  const t = entityType.toLowerCase();
  if (t.includes("campaign")) return "campaign";
  if (t.includes("ad_set") || t.includes("adset") || t.includes("ad_group") || t.includes("adgroup")) return "adset";
  if (t === "ad" || t === "ads" || t.includes("creative")) return "ad";
  return "campaign";
}

export const PLATFORM_DISPLAY_NAMES: Record<PlatformKey, string> = {
  meta: "Meta (Facebook & Instagram)",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  google: "Google Ads",
  x: "X (Twitter)",
  snapchat: "Snapchat",
};
