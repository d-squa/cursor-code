import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, Phone, ChevronDown, Sparkles, Link2, RefreshCw } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { MARKET_OPTIONS, TIKTOK_MARKET_OPTIONS } from "@/utils/markets";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import AccountTaxonomySection from "./AccountTaxonomySection";
import MetaAppSearch from "./MetaAppSearch";
import ConversionLocationsSection from "./ConversionLocationsSection";
import {
  getGoogleAdsCampaignTypes,
  getGoogleAdsSubtypes,
  getGoogleAdsCampaignConfig,
} from "@/utils/googleAdsCampaignMatrix";
import {
  META_APP_STORES,
  META_MESSAGING_MODES,
  TIKTOK_MESSAGING_APPS,
  TIKTOK_OPTIMIZATION_LOCATIONS,
} from "@/utils/destinationOptions";
import {
  extractMetaLocations,
  extractTiktokLocations,
  metaLocationToDefaults,
  tiktokLocationToDefaults,
  getMetaLocationClearFields,
  getTiktokLocationClearFields,
  ConversionLocationData,
} from "@/utils/conversionLocationUtils";

interface GoogleAdAccountDefaults {
  id: string;
  account_id: string;
  account_name: string;
  customer_id: string;
  default_landing_page_url?: string | null;
  default_bid_strategy?: string | null;
  default_target_cpa?: number | null;
  default_target_roas?: number | null;
  default_max_cpc_bid?: number | null;
  default_conversion_budget_type?: string | null;
  default_non_conversion_budget_type?: string | null;
  default_merchant_center_id?: string | null;
  default_feed_label?: string | null;
  main_markets?: string[] | null;
  default_utm_mode?: string | null;
  default_url_parameters?: string | null;
  default_placements?: string[] | null;
  // New campaign configuration defaults
  default_campaign_objective?: string | null;
  default_campaign_type?: string | null;
  default_campaign_subtype?: string | null;
  default_location_targeting?: string | null;
  default_search_partner?: boolean | null;
  default_display_network?: boolean | null;
  default_customer_acquisition?: string | null;
  default_optimized_targeting?: boolean | null;
  default_inventory_type?: string | null;
  default_ai_max?: boolean | null;
  default_ai_max_options?: string[] | null;
  default_brand_guidelines?: boolean | null;
  default_business_name?: string | null;
}

interface AdAccount {
  id: string;
  account_id: string;
  account_name: string;
  advertiser_id?: string;
  platform: "meta" | "tiktok";
  default_pixel_id?: string | null;
  default_page_id?: string | null;
  default_instagram_account_id?: string | null;
  default_catalog_id?: string | null;
  default_product_set_id?: string | null;
  default_conversion_event?: string | null;
  default_conversion_budget_type?: string | null;
  default_non_conversion_budget_type?: string | null;
  default_identity_id?: string | null;
  default_billing_event?: string | null;
  default_conversion_count?: string | null;
  default_optimization_event?: string | null;
  default_landing_page_url?: string | null;
  default_bid_strategy?: string | null;
  default_bid_amount?: number | null;
  default_optimization_location?: string | null;
  default_app_name?: string | null;
  default_app_id?: string | null;
  default_frequency_schedule?: number | null;
  default_click_window?: number | null;
  default_view_window?: number | null;
  default_placement_type?: string | null;
  default_placements?: string[] | null;
  // Meta-specific placements
  default_publisher_platforms?: string[] | null;
  default_positions?: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  } | null;
  default_advantage_plus_placements?: boolean | null;
  main_markets?: string[] | null;
  // Targeting defaults
  default_devices?: string[] | null;
  default_languages?: string[] | null;
  default_age_min?: number | null;
  default_age_max?: number | null;
  default_gender?: string | null;
  // Meta destination-specific fields
  default_app_store?: string | null;
  default_whatsapp_number?: string | null;
  default_messaging_mode?: string | null;
  default_messenger_enabled?: boolean | null;
  default_instagram_dm_enabled?: boolean | null;
  default_whatsapp_enabled?: boolean | null;
  // TikTok destination-specific fields
  default_messaging_app?: string | null;
  default_facebook_page_id?: string | null;
  default_message_event_set?: string | null;
  default_zalo_account_id?: string | null;
  default_line_business_id?: string | null;
  // Advantage+ Creative Enhancements (Meta)
  advantage_plus_video_touchups?: boolean | null;
  advantage_plus_text_improvements?: boolean | null;
  advantage_plus_product_tags?: boolean | null;
  advantage_plus_video_effects?: boolean | null;
  advantage_plus_relevant_comments?: boolean | null;
  advantage_plus_enhance_cta?: boolean | null;
  advantage_plus_reveal_details?: boolean | null;
  advantage_plus_show_spotlights?: boolean | null;
  advantage_plus_optimize_text_per_person?: boolean | null;
  advantage_plus_sitelinks?: boolean | null;
  advantage_plus_products?: boolean | null;
  // Advantage+ Campaign-level defaults (Meta)
  default_advantage_plus_campaign?: boolean | null;
  default_advantage_plus_audience?: boolean | null;
  default_advantage_plus_creative?: boolean | null;
  // UTM Parameters
  default_utm_mode?: string | null;
  default_url_parameters?: string | null;
}

import {
  DEVICE_OPTIONS,
  LANGUAGE_OPTIONS,
  GENDER_OPTIONS,
  AGE_OPTIONS,
  normalizeLanguageValues,
} from "@/utils/targetingOptions";

interface MetaResource {
  id: string;
  pixel_id?: string;
  pixel_name?: string;
  page_id?: string;
  page_name?: string;
  instagram_account_id?: string;
  username?: string;
  catalog_id?: string;
  catalog_name?: string;
  product_set_id?: string;
  product_set_name?: string;
  event_name?: string;
  ad_account_id?: string;
  default_landing_page_url?: string;
  default_bid_strategy?: string;
}

interface Props {
  clientId: string;
  userId: string;
  clientMarkets?: string[];
}

const BUDGET_TYPE_OPTIONS = [
  { value: "daily", label: "Daily Budget" },
  { value: "lifetime", label: "Lifetime Budget" },
];

const BILLING_EVENT_OPTIONS = [
  { value: "OCPM", label: "OCPM (Optimized Cost Per Mille)" },
  { value: "CPC", label: "CPC (Cost Per Click)" },
  { value: "CPV", label: "CPV (Cost Per View)" },
];

const TIKTOK_OPTIMIZATION_EVENT_OPTIONS = [
  { value: "ON_WEB_ORDER", label: "Web Order (Purchase)" },
  { value: "ON_WEB_ADD_TO_CART", label: "Add to Cart" },
  { value: "PAGE_VIEW", label: "Page View" },
  { value: "ON_WEB_CART_PAGE_BROWSE", label: "Cart Page Browse" },
  { value: "ON_WEB_DETAIL_PAGE_BROWSE", label: "Detail Page Browse" },
  { value: "COMPLETE_PAYMENT", label: "Complete Payment" },
  { value: "FORM_SUBMIT", label: "Form Submit" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "REGISTRATION", label: "Registration" },
  { value: "SUBSCRIBE", label: "Subscribe" },
];

// Cross-platform targeting defaults stored at client level
interface ClientTargetingDefaults {
  default_age_min: number;
  default_age_max: number;
  default_gender: string;
  default_devices: string[];
  default_languages: string[];
}

export default function AccountDefaultsTab({ clientId, userId, clientMarkets }: Props) {
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [googleAdAccounts, setGoogleAdAccounts] = useState<GoogleAdAccountDefaults[]>([]);
  const [googleLocalDefaults, setGoogleLocalDefaults] = useState<Record<string, Partial<GoogleAdAccountDefaults>>>({});
  const [googleMerchantCenters, setGoogleMerchantCenters] = useState<Record<string, Array<{ id: string; merchantCenterId: string; merchantCenterName: string }>>>({});
  const [googleFeedLabels, setGoogleFeedLabels] = useState<Record<string, Array<{ label: string; country: string }>>>({});
  const [loadingGoogleMC, setLoadingGoogleMC] = useState<Record<string, boolean>>({});
  const [pixels, setPixels] = useState<MetaResource[]>([]);
  const [pages, setPages] = useState<MetaResource[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<MetaResource[]>([]);
  const [catalogs, setCatalogs] = useState<MetaResource[]>([]);
  const [productSets, setProductSets] = useState<MetaResource[]>([]);
  const [conversionEvents, setConversionEvents] = useState<MetaResource[]>([]);
  const [tiktokPixels, setTiktokPixels] = useState<any[]>([]);
  const [tiktokIdentities, setTiktokIdentities] = useState<any[]>([]);
  const [tiktokCatalogs, setTiktokCatalogs] = useState<any[]>([]);
  const [tiktokProductSets, setTiktokProductSets] = useState<any[]>([]);
  const [tiktokApps, setTiktokApps] = useState<any[]>([]);
  const [tiktokEvents, setTiktokEvents] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [loadingTiktokEvents, setLoadingTiktokEvents] = useState<string | null>(null);
  const [metaConversionEvents, setMetaConversionEvents] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [loadingMetaEvents, setLoadingMetaEvents] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [localDefaults, setLocalDefaults] = useState<Record<string, Partial<AdAccount>>>({});
  const [fetchedClientMarkets, setFetchedClientMarkets] = useState<string[]>([]);
  const [clientTargeting, setClientTargeting] = useState<ClientTargetingDefaults>({
    default_age_min: 18,
    default_age_max: 65,
    default_gender: "all",
    default_devices: [],
    default_languages: [],
  });
  const [savingClientDefaults, setSavingClientDefaults] = useState(false);
  const [savingGoogleDefaults, setSavingGoogleDefaults] = useState<string | null>(null);
  const [syncingAssets, setSyncingAssets] = useState<string | null>(null);

  const fetchGoogleMerchantCenters = async (customerId: string, accountId: string) => {
    setLoadingGoogleMC(prev => ({ ...prev, [accountId]: true }));
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("fetch-google-merchant-centers", {
        body: { customerId },
        headers: { Authorization: `Bearer ${session?.session?.access_token}` },
      });
      if (!error && data) {
        setGoogleMerchantCenters(prev => ({ ...prev, [accountId]: data.merchantCenters || [] }));
        setGoogleFeedLabels(prev => ({ ...prev, [accountId]: data.feedLabels || [] }));
      }
    } catch (err) {
      console.error("Failed to fetch merchant centers:", err);
    } finally {
      setLoadingGoogleMC(prev => ({ ...prev, [accountId]: false }));
    }
  };

  useEffect(() => {
    if (clientId && userId) {
      loadData();
    }
  }, [clientId, userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch client data including markets and targeting defaults
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("markets, default_age_min, default_age_max, default_gender, default_devices, default_languages")
        .eq("id", clientId)
        .single();

      if (clientError) throw clientError;

      if (!clientMarkets) {
        setFetchedClientMarkets(Array.isArray(clientData.markets) ? (clientData.markets as string[]) : []);
      }

      // Set client-level targeting defaults
      // Normalize language values to handle legacy numeric IDs
      const normalizedLanguages = Array.isArray(clientData.default_languages)
        ? normalizeLanguageValues(clientData.default_languages as (string | number)[])
        : [];

      setClientTargeting({
        default_age_min: clientData.default_age_min ?? 18,
        default_age_max: clientData.default_age_max ?? 65,
        default_gender: clientData.default_gender || "all",
        default_devices: Array.isArray(clientData.default_devices) ? (clientData.default_devices as string[]) : [],
        default_languages: normalizedLanguages,
      });

      // Load Meta ad accounts for this client
      // RLS handles access control - users can see their own accounts or accounts linked to team clients
      const { data: metaAccountsData, error: metaAccountsError } = await supabase
        .from("meta_ad_accounts")
        .select("*")
        .eq("client_id", clientId);

      if (metaAccountsError) throw metaAccountsError;

      // Load TikTok ad accounts for this client
      const { data: tiktokAccountsData, error: tiktokAccountsError } = await supabase
        .from("tiktok_ad_accounts")
        .select("*")
        .eq("client_id", clientId);

      if (tiktokAccountsError) throw tiktokAccountsError;

      console.log("Meta accounts loaded:", metaAccountsData?.length || 0);
      console.log("TikTok accounts loaded:", tiktokAccountsData?.length || 0);

      // Combine and type cast accounts
      const metaAccounts = (metaAccountsData || []).map((acc) => ({
        ...acc,
        platform: "meta" as const,
        main_markets: Array.isArray(acc.main_markets) ? (acc.main_markets as string[]) : [],
        default_conversion_budget_type: acc.default_conversion_budget_type || null,
        default_non_conversion_budget_type: acc.default_non_conversion_budget_type || null,
        default_bid_strategy: acc.default_bid_strategy || "LOWEST_COST_WITHOUT_CAP",
        default_publisher_platforms: Array.isArray((acc as any).default_publisher_platforms)
          ? ((acc as any).default_publisher_platforms as string[])
          : ["facebook", "instagram", "audience_network"],
        default_positions: (acc as any).default_positions || {},
        default_advantage_plus_placements: (acc as any).default_advantage_plus_placements ?? true,
        default_devices: Array.isArray((acc as any).default_devices) ? ((acc as any).default_devices as string[]) : [],
        default_languages: Array.isArray((acc as any).default_languages)
          ? normalizeLanguageValues((acc as any).default_languages as (string | number)[])
          : [],
        default_age_min: (acc as any).default_age_min ?? 18,
        default_age_max: (acc as any).default_age_max ?? 65,
        default_gender: (acc as any).default_gender || "all",
      }));

      const tiktokAccounts = (tiktokAccountsData || []).map((acc) => ({
        ...acc,
        platform: "tiktok" as const,
        advertiser_id: acc.advertiser_id,
        main_markets: Array.isArray(acc.main_markets) ? (acc.main_markets as string[]) : [],
        // Ensure all TikTok-specific defaults are properly mapped
        default_pixel_id: acc.default_pixel_id || null,
        default_identity_id: acc.default_identity_id || null,
        default_catalog_id: acc.default_catalog_id || null,
        default_product_set_id: acc.default_product_set_id || null,
        default_conversion_budget_type: acc.default_conversion_budget_type || null,
        default_non_conversion_budget_type: acc.default_non_conversion_budget_type || null,
        default_billing_event: acc.default_billing_event || "OCPM",
        default_optimization_event: acc.default_optimization_event || "ON_WEB_ORDER",
        default_landing_page_url: acc.default_landing_page_url || null,
        default_bid_strategy: acc.default_bid_strategy || "LOWEST_COST",
        default_placement_type: (acc as any).default_placement_type || "PLACEMENT_TYPE_AUTOMATIC",
        default_placements: Array.isArray((acc as any).default_placements)
          ? ((acc as any).default_placements as string[])
          : ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"],
        default_devices: Array.isArray((acc as any).default_devices) ? ((acc as any).default_devices as string[]) : [],
        default_languages: Array.isArray((acc as any).default_languages)
          ? normalizeLanguageValues((acc as any).default_languages as (string | number)[])
          : [],
        default_age_min: (acc as any).default_age_min ?? 18,
        default_age_max: (acc as any).default_age_max ?? 65,
        default_gender: (acc as any).default_gender || "all",
      }));

      console.log(
        "[AccountDefaultsTab] TikTok accounts loaded from database:",
        tiktokAccounts.map((acc) => ({
          id: acc.id,
          name: acc.account_name,
          pixel_id: acc.default_pixel_id,
          identity_id: acc.default_identity_id,
          catalog_id: acc.default_catalog_id,
          product_set_id: acc.default_product_set_id,
          conversion_budget: acc.default_conversion_budget_type,
          non_conversion_budget: acc.default_non_conversion_budget_type,
          billing_event: acc.default_billing_event,
          main_markets: acc.main_markets,
        })),
      );

      // Load Google Ads accounts for this client
      const { data: googleAccountsData, error: googleAccountsError } = await supabase
        .from("google_ad_accounts")
        .select("id, account_id, account_name, customer_id, default_landing_page_url, default_bid_strategy, default_target_cpa, default_target_roas, default_max_cpc_bid, default_conversion_budget_type, default_non_conversion_budget_type, default_merchant_center_id, default_feed_label, main_markets, default_utm_mode, default_url_parameters, default_placements, default_campaign_objective, default_campaign_type, default_campaign_subtype, default_location_targeting, default_search_partner, default_display_network, default_customer_acquisition, default_optimized_targeting, default_inventory_type, default_ai_max, default_ai_max_options, default_brand_guidelines, default_business_name")
        .eq("client_id", clientId);

      if (googleAccountsError) throw googleAccountsError;

      const googleAccounts: GoogleAdAccountDefaults[] = (googleAccountsData || []).map((acc: any) => ({
        ...acc,
        main_markets: Array.isArray(acc.main_markets) ? acc.main_markets : [],
      }));
      setGoogleAdAccounts(googleAccounts);

      // Auto-fetch merchant centers for each Google account
      googleAccounts.forEach((acc) => {
        if (acc.customer_id) {
          fetchGoogleMerchantCenters(acc.customer_id, acc.id);
        }
      });

      // Initialize Google local defaults
      const gDefaults: Record<string, Partial<GoogleAdAccountDefaults>> = {};
      googleAccounts.forEach((acc) => {
        gDefaults[acc.id] = {
          default_landing_page_url: acc.default_landing_page_url || null,
          default_bid_strategy: acc.default_bid_strategy || null,
          default_target_cpa: acc.default_target_cpa || null,
          default_target_roas: acc.default_target_roas || null,
          default_max_cpc_bid: acc.default_max_cpc_bid || null,
          default_conversion_budget_type: acc.default_conversion_budget_type || null,
          default_non_conversion_budget_type: acc.default_non_conversion_budget_type || null,
          default_merchant_center_id: acc.default_merchant_center_id || null,
          default_feed_label: acc.default_feed_label || null,
          main_markets: acc.main_markets || [],
          default_utm_mode: acc.default_utm_mode || null,
          default_url_parameters: acc.default_url_parameters || null,
          default_placements: Array.isArray((acc as any).default_placements) ? (acc as any).default_placements : [],
          // New campaign configuration defaults
          default_campaign_objective: (acc as any).default_campaign_objective || null,
          default_campaign_type: (acc as any).default_campaign_type || null,
          default_campaign_subtype: (acc as any).default_campaign_subtype || null,
          default_location_targeting: (acc as any).default_location_targeting || 'PRESENCE_OR_INTEREST',
          default_search_partner: (acc as any).default_search_partner ?? false,
          default_display_network: (acc as any).default_display_network ?? false,
          default_customer_acquisition: (acc as any).default_customer_acquisition || 'Everyone',
          default_optimized_targeting: (acc as any).default_optimized_targeting ?? true,
          default_inventory_type: (acc as any).default_inventory_type || null,
          default_ai_max: (acc as any).default_ai_max ?? false,
          default_ai_max_options: Array.isArray((acc as any).default_ai_max_options) ? (acc as any).default_ai_max_options : [],
          default_brand_guidelines: (acc as any).default_brand_guidelines ?? false,
          default_business_name: (acc as any).default_business_name || null,
        };
      });
      setGoogleLocalDefaults(gDefaults);

      const allAccounts = [...metaAccounts, ...tiktokAccounts];
      setAdAccounts(allAccounts);

      // Initialize local defaults
      const defaults: Record<string, Partial<AdAccount>> = {};
      allAccounts.forEach((acc) => {
        defaults[acc.id] = {
          platform: acc.platform,
          default_pixel_id: acc.default_pixel_id || null,
          default_page_id: acc.platform === "meta" ? acc.default_page_id || null : null,
          default_instagram_account_id: acc.platform === "meta" ? acc.default_instagram_account_id || null : null,
          default_catalog_id: acc.default_catalog_id || null,
          default_product_set_id: acc.default_product_set_id || null,
          default_conversion_event: acc.platform === "meta" ? acc.default_conversion_event || null : null,
          default_conversion_budget_type: acc.default_conversion_budget_type || null,
          default_non_conversion_budget_type: acc.default_non_conversion_budget_type || null,
          default_bid_strategy:
            acc.default_bid_strategy || (acc.platform === "meta" ? "LOWEST_COST_WITHOUT_CAP" : "LOWEST_COST"),
          default_bid_amount: (acc as any).default_bid_amount || null,
          default_identity_id: acc.platform === "tiktok" ? acc.default_identity_id || null : null,
          // Billing event for both platforms
          default_billing_event:
            acc.platform === "tiktok"
              ? acc.default_billing_event || "OCPM"
              : (acc as any).default_billing_event || "IMPRESSIONS",
          default_optimization_event:
            acc.platform === "tiktok" ? acc.default_optimization_event || "ON_WEB_ORDER" : null,
          default_conversion_count: (acc as any).default_conversion_count || "all_conversions",
          // Landing page URL for both platforms
          default_landing_page_url: (acc as any).default_landing_page_url || null,
          // Optimization location for both platforms
          default_optimization_location:
            (acc as any).default_optimization_location || (acc.platform === "meta" ? "WEBSITE" : null),
          default_app_name: acc.platform === "tiktok" ? (acc as any).default_app_name || null : null,
          default_app_id: (acc as any).default_app_id || null,
          default_frequency_schedule:
            acc.platform === "tiktok" ? (acc as any).default_frequency_schedule || null : null,
          // Attribution windows for both platforms
          default_click_window: (acc as any).default_click_window || (acc.platform === "meta" ? 7 : null),
          default_view_window: (acc as any).default_view_window || (acc.platform === "meta" ? 1 : null),
          default_placement_type:
            acc.platform === "tiktok" ? (acc as any).default_placement_type || "PLACEMENT_TYPE_AUTOMATIC" : null,
          default_placements:
            acc.platform === "tiktok"
              ? (acc as any).default_placements || [
                  "PLACEMENT_TIKTOK",
                  "PLACEMENT_GLOBAL_APP_BUNDLE",
                  "PLACEMENT_PANGLE",
                ]
              : null,
          // Meta-specific placements
          default_publisher_platforms:
            acc.platform === "meta"
              ? (acc as any).default_publisher_platforms || ["facebook", "instagram", "audience_network"]
              : null,
          default_positions: acc.platform === "meta" ? (acc as any).default_positions || {} : null,
          default_advantage_plus_placements:
            acc.platform === "meta" ? ((acc as any).default_advantage_plus_placements ?? true) : null,
          main_markets: acc.main_markets,
          // Targeting defaults
          default_devices: (acc as any).default_devices || [],
          default_languages: Array.isArray((acc as any).default_languages)
            ? normalizeLanguageValues((acc as any).default_languages as (string | number)[])
            : [],
          default_age_min: (acc as any).default_age_min ?? 18,
          default_age_max: (acc as any).default_age_max ?? 65,
          default_gender: (acc as any).default_gender || "all",
          // Meta messaging/destination fields
          default_app_store: acc.platform === "meta" ? (acc as any).default_app_store || null : null,
          default_messaging_mode: acc.platform === "meta" ? (acc as any).default_messaging_mode || null : null,
          default_messenger_enabled: acc.platform === "meta" ? (acc as any).default_messenger_enabled || false : null,
          default_instagram_dm_enabled:
            acc.platform === "meta" ? (acc as any).default_instagram_dm_enabled || false : null,
          default_whatsapp_enabled: acc.platform === "meta" ? (acc as any).default_whatsapp_enabled || false : null,
          default_whatsapp_number: (acc as any).default_whatsapp_number || null,
          // TikTok messaging fields
          default_messaging_app: acc.platform === "tiktok" ? (acc as any).default_messaging_app || null : null,
          default_facebook_page_id: acc.platform === "tiktok" ? (acc as any).default_facebook_page_id || null : null,
          default_message_event_set: acc.platform === "tiktok" ? (acc as any).default_message_event_set || null : null,
          default_zalo_account_id: acc.platform === "tiktok" ? (acc as any).default_zalo_account_id || null : null,
          default_line_business_id: acc.platform === "tiktok" ? (acc as any).default_line_business_id || null : null,
          // Advantage+ Creative Enhancements (Meta)
          advantage_plus_video_touchups: acc.platform === "meta" ? (acc as any).advantage_plus_video_touchups ?? false : null,
          advantage_plus_text_improvements: acc.platform === "meta" ? (acc as any).advantage_plus_text_improvements ?? false : null,
          advantage_plus_product_tags: acc.platform === "meta" ? (acc as any).advantage_plus_product_tags ?? false : null,
          advantage_plus_video_effects: acc.platform === "meta" ? (acc as any).advantage_plus_video_effects ?? false : null,
          advantage_plus_relevant_comments: acc.platform === "meta" ? (acc as any).advantage_plus_relevant_comments ?? false : null,
          advantage_plus_enhance_cta: acc.platform === "meta" ? (acc as any).advantage_plus_enhance_cta ?? false : null,
          advantage_plus_reveal_details: acc.platform === "meta" ? (acc as any).advantage_plus_reveal_details ?? false : null,
          advantage_plus_show_spotlights: acc.platform === "meta" ? (acc as any).advantage_plus_show_spotlights ?? false : null,
          advantage_plus_optimize_text_per_person: acc.platform === "meta" ? (acc as any).advantage_plus_optimize_text_per_person ?? false : null,
          advantage_plus_sitelinks: acc.platform === "meta" ? (acc as any).advantage_plus_sitelinks ?? false : null,
          advantage_plus_products: acc.platform === "meta" ? (acc as any).advantage_plus_products ?? false : null,
          // Advantage+ Campaign-level defaults (Meta)
          default_advantage_plus_campaign: acc.platform === "meta" ? (acc as any).default_advantage_plus_campaign ?? false : null,
          default_advantage_plus_audience: acc.platform === "meta" ? (acc as any).default_advantage_plus_audience ?? false : null,
          default_advantage_plus_creative: acc.platform === "meta" ? (acc as any).default_advantage_plus_creative ?? false : null,
          // UTM Parameters
          default_utm_mode: (acc as any).default_utm_mode || "auto",
          default_url_parameters: (acc as any).default_url_parameters || null,
        };
      });

      console.log(
        "Local defaults initialized:",
        Object.entries(defaults).map(([id, def]) => ({
          id,
          platform: def.platform,
          pixel_id: def.default_pixel_id,
          identity_id: def.default_identity_id,
          catalog_id: def.default_catalog_id,
          product_set_id: def.default_product_set_id,
          conversion_budget: def.default_conversion_budget_type,
          non_conversion_budget: def.default_non_conversion_budget_type,
          billing_event: def.default_billing_event,
        })),
      );

      console.log("[AccountDefaultsTab] RAW localDefaults state:", defaults);

      setLocalDefaults(defaults);

      // Load all available resources
      const [
        pixelsRes,
        pagesRes,
        igRes,
        catalogsRes,
        productSetsRes,
        eventsRes,
        tiktokPixelsRes,
        tiktokIdentitiesRes,
        tiktokCatalogsRes,
        tiktokProductSetsRes,
        tiktokAppsRes,
      ] = await Promise.all([
        supabase.from("meta_pixels").select("id, ad_account_id, pixel_id, pixel_name").eq("user_id", userId),
        supabase.from("meta_pages").select("id, page_id, page_name").eq("user_id", userId),
        supabase.from("meta_instagram_accounts").select("id, instagram_account_id, username").eq("user_id", userId),
        supabase.from("meta_catalogs").select("id, catalog_id, catalog_name").eq("user_id", userId),
        supabase
          .from("meta_product_sets")
          .select("id, catalog_id, product_set_id, product_set_name")
          .eq("user_id", userId),
        supabase.from("meta_conversion_events").select("id, pixel_id, event_name").eq("user_id", userId),
        supabase.from("tiktok_pixels").select("*").eq("user_id", userId),
        supabase.from("tiktok_identities").select("*").eq("user_id", userId),
        supabase.from("tiktok_catalogs").select("*").eq("user_id", userId),
        supabase.from("tiktok_product_sets").select("*").eq("user_id", userId),
        supabase.from("tiktok_apps").select("*").eq("user_id", userId),
      ]);

      if (pixelsRes.error) throw pixelsRes.error;
      if (pagesRes.error) throw pagesRes.error;
      if (igRes.error) throw igRes.error;
      if (catalogsRes.error) throw catalogsRes.error;
      if (productSetsRes.error) throw productSetsRes.error;
      if (eventsRes.error) throw eventsRes.error;

      // Helper to deduplicate by a unique key field
      const deduplicateBy = <T extends Record<string, any>>(arr: T[], keyField: string): T[] => {
        const seen = new Set<string>();
        return arr.filter((item) => {
          const key = item[keyField];
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      // Deduplicate all resources by their unique ID fields
      setPixels(deduplicateBy(pixelsRes.data || [], "pixel_id"));
      setPages(deduplicateBy(pagesRes.data || [], "page_id"));
      setInstagramAccounts(deduplicateBy(igRes.data || [], "instagram_account_id"));
      setCatalogs(deduplicateBy(catalogsRes.data || [], "catalog_id"));
      setProductSets(deduplicateBy(productSetsRes.data || [], "product_set_id"));
      setConversionEvents(deduplicateBy(eventsRes.data || [], "event_name"));
      console.log("TikTok Pixels loaded:", tiktokPixelsRes.data?.length || 0, tiktokPixelsRes.data);
      console.log("TikTok Identities loaded:", tiktokIdentitiesRes.data?.length || 0, tiktokIdentitiesRes.data);
      console.log("TikTok Catalogs loaded:", tiktokCatalogsRes.data?.length || 0, tiktokCatalogsRes.data);
      console.log("TikTok Product Sets loaded:", tiktokProductSetsRes.data?.length || 0, tiktokProductSetsRes.data);
      console.log("TikTok Apps loaded:", tiktokAppsRes.data?.length || 0, tiktokAppsRes.data);
      setTiktokPixels(deduplicateBy(tiktokPixelsRes.data || [], "pixel_id"));
      setTiktokIdentities(deduplicateBy(tiktokIdentitiesRes.data || [], "identity_id"));
      setTiktokCatalogs(deduplicateBy(tiktokCatalogsRes.data || [], "catalog_id"));
      setTiktokProductSets(deduplicateBy(tiktokProductSetsRes.data || [], "product_set_id"));
      setTiktokApps(deduplicateBy(tiktokAppsRes.data || [], "app_id"));
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error("Failed to load account defaults");
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch Meta conversion events for accounts that already have a pixel selected
  useEffect(() => {
    if (loading) return;
    adAccounts.forEach((account) => {
      if (account.platform === "meta") {
        const defaults = localDefaults[account.id];
        const pixelId = defaults?.default_pixel_id;
        if (pixelId && !metaConversionEvents[pixelId]) {
          fetchMetaConversionEvents(pixelId);
        }
      }
    });
  }, [loading, adAccounts, localDefaults]);

  // Fetch Meta conversion events for a pixel via edge function
  const fetchMetaConversionEvents = async (pixelId: string) => {
    if (metaConversionEvents[pixelId]) return; // Already fetched

    setLoadingMetaEvents(pixelId);
    try {
      const { data, error } = await supabase.functions.invoke("meta-conversion-events", {
        body: { pixelId },
      });

      if (error) throw error;

      if (data?.events) {
        setMetaConversionEvents((prev) => ({
          ...prev,
          [pixelId]: data.events,
        }));
      }
    } catch (error) {
      console.error("Error fetching Meta conversion events:", error);
      // Set standard fallback events
      setMetaConversionEvents((prev) => ({
        ...prev,
        [pixelId]: [
          { id: "Purchase", name: "Purchase" },
          { id: "Lead", name: "Lead" },
          { id: "CompleteRegistration", name: "Complete Registration" },
          { id: "AddToCart", name: "Add to Cart" },
          { id: "InitiateCheckout", name: "Initiate Checkout" },
          { id: "AddPaymentInfo", name: "Add Payment Info" },
          { id: "ViewContent", name: "View Content" },
          { id: "Search", name: "Search" },
          { id: "Contact", name: "Contact" },
          { id: "Schedule", name: "Schedule" },
          { id: "SubmitApplication", name: "Submit Application" },
          { id: "Subscribe", name: "Subscribe" },
        ],
      }));
    } finally {
      setLoadingMetaEvents(null);
    }
  };

  // Fetch TikTok events for an advertiser
  const fetchTiktokEvents = async (advertiserId: string, pixelId?: string) => {
    if (tiktokEvents[advertiserId]) return; // Already fetched

    setLoadingTiktokEvents(advertiserId);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-tiktok-events", {
        body: { advertiserId, pixelId },
      });

      if (error) throw error;

      if (data?.events) {
        setTiktokEvents((prev) => ({
          ...prev,
          [advertiserId]: data.events,
        }));
      }
    } catch (error) {
      console.error("Error fetching TikTok events:", error);
      // Set fallback events
      setTiktokEvents((prev) => ({
        ...prev,
        [advertiserId]: [
          { id: "SubmitForm", name: "Submit Form" },
          { id: "CompletePayment", name: "Complete Payment" },
          { id: "PlaceAnOrder", name: "Place an Order" },
          { id: "Contact", name: "Contact" },
        ],
      }));
    } finally {
      setLoadingTiktokEvents(null);
    }
  };

  const handleSave = async (accountId: string) => {
    setSaving(accountId);
    try {
      const updates = localDefaults[accountId];
      const account = adAccounts.find((acc) => acc.id === accountId);
      if (!account) {
        toast.error("Account not found");
        return;
      }

      // Debug: Log full updates object
      console.log(`[AccountDefaultsTab] Full updates object for ${account.account_name}:`, updates);
      console.log(`[AccountDefaultsTab] Pixel value in updates:`, updates?.default_pixel_id);

      const platform = account.platform;
      const tableName = platform === "tiktok" ? "tiktok_ad_accounts" : "meta_ad_accounts";

      // Platform-specific field mapping
      const metaFields = [
        "default_pixel_id",
        "default_page_id",
        "default_instagram_account_id",
        "default_catalog_id",
        "default_product_set_id",
        "default_conversion_event",
        "default_conversion_budget_type",
        "default_non_conversion_budget_type",
        "default_bid_strategy",
        "default_bid_amount",
        "default_billing_event",
        "default_conversion_count",
        "default_landing_page_url",
        "default_optimization_location",
        "default_click_window",
        "default_view_window",
        "default_publisher_platforms",
        "default_positions",
        "default_advantage_plus_placements",
        "main_markets",
        "default_devices",
        "default_languages",
        "default_age_min",
        "default_age_max",
        "default_gender",
        // Meta destination-specific fields
        "default_app_store",
        "default_app_id",
        "default_whatsapp_number",
        "default_messaging_mode",
        "default_messenger_enabled",
        "default_instagram_dm_enabled",
        "default_whatsapp_enabled",
        // Advantage+ Creative Enhancements
        "advantage_plus_video_touchups",
        "advantage_plus_text_improvements",
        "advantage_plus_product_tags",
        "advantage_plus_video_effects",
        "advantage_plus_relevant_comments",
        "advantage_plus_enhance_cta",
        "advantage_plus_reveal_details",
        "advantage_plus_show_spotlights",
        "advantage_plus_optimize_text_per_person",
        "advantage_plus_sitelinks",
        "advantage_plus_products",
        // Advantage+ Campaign-level defaults
        "default_advantage_plus_campaign",
        "default_advantage_plus_audience",
        "default_advantage_plus_creative",
        // UTM Parameters
        "default_utm_mode",
        "default_url_parameters",
      ];

      const tiktokFields = [
        "default_pixel_id",
        "default_identity_id",
        "default_catalog_id",
        "default_product_set_id",
        "default_conversion_budget_type",
        "default_non_conversion_budget_type",
        "default_billing_event",
        "default_conversion_count",
        "default_optimization_event",
        "default_landing_page_url",
        "default_bid_strategy",
        "default_bid_amount",
        "default_optimization_location",
        "default_app_name",
        "default_app_id",
        "default_frequency_schedule",
        "default_click_window",
        "default_view_window",
        "default_event_count_enabled",
        "default_placement_type",
        "default_placements",
        "main_markets",
        "default_devices",
        "default_languages",
        "default_age_min",
        "default_age_max",
        "default_gender",
        // TikTok destination-specific fields
        "default_messaging_app",
        "default_facebook_page_id",
        "default_message_event_set",
        "default_whatsapp_number",
        "default_zalo_account_id",
        "default_line_business_id",
        // UTM Parameters
        "default_utm_mode",
        "default_url_parameters",
      ];

      const validFields = platform === "tiktok" ? tiktokFields : metaFields;

      // Filter to only valid fields for this platform
      const updateData: Record<string, any> = {};
      validFields.forEach((field) => {
        // Use hasOwnProperty to check if field exists (including null values)
        if (updates && Object.prototype.hasOwnProperty.call(updates, field)) {
          updateData[field] = updates[field as keyof typeof updates];
        }
      });

      // Ensure pixel is explicitly included for TikTok if it exists in updates
      if (platform === "tiktok" && updates?.default_pixel_id !== undefined) {
        updateData.default_pixel_id = updates.default_pixel_id;
        console.log(`[AccountDefaultsTab] Explicitly setting TikTok pixel:`, updates.default_pixel_id);
      }

      console.log(`[AccountDefaultsTab] Saving ${platform} account ${accountId} defaults:`, updateData);
      console.log(`[AccountDefaultsTab] Update data keys:`, Object.keys(updateData));

      const { error, data } = await supabase.from(tableName).update(updateData).eq("id", accountId).select();

      if (error) {
        console.error(`[AccountDefaultsTab] Save error for ${platform}:`, error);
        throw error;
      }

      console.log(`[AccountDefaultsTab] Successfully saved ${platform} defaults:`, data);

      // Verify the data was actually written by fetching it back
      const { data: verifyData, error: verifyError } = await supabase
        .from(tableName)
        .select("*")
        .eq("id", accountId)
        .single();

      if (verifyError) {
        console.error(`[AccountDefaultsTab] Verification error:`, verifyError);
      } else {
        console.log(`[AccountDefaultsTab] Verification - data in database after save:`, verifyData);
        console.log(`[AccountDefaultsTab] Verification - pixel value:`, verifyData?.default_pixel_id);
      }

      toast.success("Defaults saved successfully");

      // Reload to get fresh data
      await loadData();
    } catch (error: any) {
      console.error("Error saving defaults:", error);
      toast.error("Failed to save defaults");
    } finally {
      setSaving(null);
    }
  };

  // Save cross-platform targeting defaults to clients table
  const handleSaveClientTargeting = async () => {
    setSavingClientDefaults(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          default_age_min: clientTargeting.default_age_min,
          default_age_max: clientTargeting.default_age_max,
          default_gender: clientTargeting.default_gender,
          default_devices: clientTargeting.default_devices,
          default_languages: clientTargeting.default_languages,
        })
        .eq("id", clientId);

      if (error) throw error;
      toast.success("Cross-platform defaults saved");
    } catch (error: any) {
      console.error("Error saving client targeting defaults:", error);
      toast.error("Failed to save cross-platform defaults");
    } finally {
      setSavingClientDefaults(false);
    }
  };

  // Sync assets for a single Meta ad account
  const handleSyncAccountAssets = async (account: AdAccount) => {
    if (account.platform !== "meta") {
      toast.info("Asset sync is only available for Meta accounts");
      return;
    }

    setSyncingAssets(account.id);
    try {
      const { data, error } = await supabase.functions.invoke("sync-account-assets", {
        body: {
          accountId: account.account_id,
          platform: "meta",
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message || "Assets synced successfully");
        // Reload data to show new assets
        await loadData();
      } else {
        throw new Error(data?.error || "Sync failed");
      }
    } catch (error: any) {
      console.error("Error syncing account assets:", error);
      toast.error(error.message || "Failed to sync assets");
    } finally {
      setSyncingAssets(null);
    }
  };

  const updateGoogleDefault = (accountId: string, field: keyof GoogleAdAccountDefaults, value: any) => {
    setGoogleLocalDefaults((prev) => ({
      ...prev,
      [accountId]: {
        ...prev[accountId],
        [field]: value,
      },
    }));
  };

  const handleSaveGoogleDefaults = async (accountId: string) => {
    setSavingGoogleDefaults(accountId);
    try {
      const updates = googleLocalDefaults[accountId];
      if (!updates) return;

      const validFields = [
        "default_landing_page_url",
        "default_bid_strategy",
        "default_target_cpa",
        "default_target_roas",
        "default_max_cpc_bid",
        "default_conversion_budget_type",
        "default_non_conversion_budget_type",
        "default_merchant_center_id",
        "default_feed_label",
        "main_markets",
        "default_utm_mode",
        "default_url_parameters",
        "default_placements",
        // New campaign configuration defaults
        "default_campaign_objective",
        "default_campaign_type",
        "default_campaign_subtype",
        "default_location_targeting",
        "default_search_partner",
        "default_display_network",
        "default_customer_acquisition",
        "default_optimized_targeting",
        "default_inventory_type",
        "default_ai_max",
        "default_ai_max_options",
        "default_brand_guidelines",
        "default_business_name",
      ];

      const updateData: Record<string, any> = {};
      validFields.forEach((field) => {
        if (updates && Object.prototype.hasOwnProperty.call(updates, field)) {
          updateData[field] = (updates as any)[field];
        }
      });

      const { error } = await supabase
        .from("google_ad_accounts")
        .update(updateData)
        .eq("id", accountId);

      if (error) throw error;

      toast.success("Google Ads defaults saved successfully");
      await loadData();
    } catch (error: any) {
      console.error("Error saving Google Ads defaults:", error);
      toast.error("Failed to save Google Ads defaults");
    } finally {
      setSavingGoogleDefaults(null);
    }
  };

  const updateDefault = (accountId: string, field: keyof AdAccount, value: any) => {
    console.log(`[AccountDefaultsTab] updateDefault called:`, { accountId, field, value });
    setLocalDefaults((prev) => {
      const updated = {
        ...prev,
        [accountId]: {
          ...prev[accountId],
          [field]: value,
        },
      };
      console.log(`[AccountDefaultsTab] Updated localDefaults for ${accountId}:`, updated[accountId]);
      return updated;
    });
  };

  if (loading) {
    return (
      <Card className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </Card>
    );
  }

  if (adAccounts.length === 0 && googleAdAccounts.length === 0) {
    return (
      <Card className="p-8">
        <p className="text-muted-foreground text-center">
          No ad accounts synced for this client. Sync accounts in{" "}
          <Link to="/app/settings/platforms" className="text-primary hover:underline">
            Platform Connections
          </Link>
          .
        </p>
      </Card>
    );
  }

  // Filter market options to only show markets defined for this client
  const activeClientMarkets = clientMarkets || fetchedClientMarkets;

  // For TikTok accounts, filter out US from available markets
  const getMarketOptions = (platform: "meta" | "tiktok") => {
    const baseOptions = platform === "tiktok" ? TIKTOK_MARKET_OPTIONS : MARKET_OPTIONS;
    return baseOptions
      .filter((m) => activeClientMarkets.includes(m.value))
      .map((m) => ({ value: m.value, label: m.label }));
  };

  return (
    <div className="space-y-6">
      {/* Cross-platform defaults - applies to all accounts */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Cross-Platform Defaults</h3>
              <p className="text-sm text-muted-foreground">
                These targeting defaults apply to all ad accounts across all platforms
              </p>
            </div>
            <Button onClick={handleSaveClientTargeting} disabled={savingClientDefaults} size="sm">
              {savingClientDefaults ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Defaults
            </Button>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Age Min */}
            <div className="space-y-2">
              <Label>Age Min</Label>
              <Select
                value={String(clientTargeting.default_age_min)}
                onValueChange={(value) => setClientTargeting((prev) => ({ ...prev, default_age_min: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Min age" />
                </SelectTrigger>
                <SelectContent>
                  {AGE_OPTIONS.map((age) => (
                    <SelectItem key={age.value} value={age.value}>
                      {age.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Age Max */}
            <div className="space-y-2">
              <Label>Age Max</Label>
              <Select
                value={String(clientTargeting.default_age_max)}
                onValueChange={(value) => setClientTargeting((prev) => ({ ...prev, default_age_max: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Max age" />
                </SelectTrigger>
                <SelectContent>
                  {AGE_OPTIONS.map((age) => (
                    <SelectItem key={age.value} value={age.value}>
                      {age.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={clientTargeting.default_gender}
                onValueChange={(value) => setClientTargeting((prev) => ({ ...prev, default_gender: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((gender) => (
                    <SelectItem key={gender.value} value={gender.value}>
                      {gender.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Devices */}
            <div className="space-y-2">
              <Label>Devices</Label>
              <MultiSelect
                options={DEVICE_OPTIONS}
                value={clientTargeting.default_devices}
                onChange={(devices) => setClientTargeting((prev) => ({ ...prev, default_devices: devices }))}
                placeholder="All devices"
                emptyText="All devices"
              />
            </div>

            {/* Languages */}
            <div className="space-y-2">
              <Label>Languages</Label>
              <MultiSelect
                options={LANGUAGE_OPTIONS}
                value={clientTargeting.default_languages}
                onChange={(languages) => setClientTargeting((prev) => ({ ...prev, default_languages: languages }))}
                placeholder="All languages"
                emptyText="All languages"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Platform-specific account defaults */}
      <Accordion type="single" collapsible className="space-y-4">
        {adAccounts.map((account) => {
          const defaults = localDefaults[account.id] || {};
          console.log(`[AccountDefaultsTab] Rendering account ${account.account_name}:`, {
            accountId: account.id,
            platform: account.platform,
            hasDefaults: Object.keys(defaults).length > 0,
            defaults: defaults,
          });
          const selectedCatalog = defaults.default_catalog_id;
          const catalogProductSets = productSets.filter((ps) => ps.catalog_id === selectedCatalog);
          const selectedPixel = defaults.default_pixel_id;
          const pixelEvents = selectedPixel && metaConversionEvents[selectedPixel]
            ? metaConversionEvents[selectedPixel]
            : conversionEvents.filter((e) => e.pixel_id === selectedPixel);

          // Remove ad_account_id filter to show all available resources
          const accountPixels = pixels;
          const accountPages = pages;
          const accountCatalogs = catalogs;
          const accountInstagramAccounts = instagramAccounts;

          return (
            <AccordionItem key={account.id} value={account.id}>
              <Card>
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{account.account_name}</p>
                        <Badge variant="outline" className="text-xs">
                          {account.platform === "tiktok" ? "TikTok" : "Meta"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">ID: {account.account_id}</p>
                    </div>
                    {account.platform === "meta" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSyncAccountAssets(account);
                              }}
                              disabled={syncingAssets === account.id}
                              className="mr-2"
                            >
                              {syncingAssets === account.id ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                              )}
                              Sync Assets
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Sync pixels, pages, catalogs, Instagram accounts</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="px-6 pb-6 space-y-6">
                    {/* Main Markets */}
                    <div className="space-y-2">
                      <Label>Assigned Markets</Label>
                      <MultiSelect
                        options={getMarketOptions(account.platform)}
                        value={defaults.main_markets || []}
                        onChange={(markets) => updateDefault(account.id, "main_markets", markets)}
                        placeholder="Select markets for this ad account"
                        emptyText="No markets assigned"
                      />
                      <p className="text-xs text-muted-foreground">
                        Which client markets this ad account should target
                      </p>
                    </div>

                    <Separator className="my-4" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Meta-specific fields */}
                      {account.platform === "meta" && (
                        <>
                          {/* Pixel */}
                          <div className="space-y-2">
                            <Label>Default Pixel</Label>
                            <Select
                              value={defaults.default_pixel_id || "__none__"}
                              onValueChange={(value) => {
                                const nextValue = value === "__none__" ? null : value;
                                updateDefault(account.id, "default_pixel_id", nextValue);
                                updateDefault(account.id, "default_conversion_event", null);
                                if (nextValue) fetchMetaConversionEvents(nextValue);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select pixel" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {pixels.length === 0 ? (
                                  <SelectItem value="none" disabled>
                                    No pixels available
                                  </SelectItem>
                                ) : (
                                  pixels.map((pixel) => (
                                    <SelectItem key={pixel.id} value={pixel.pixel_id || ""}>
                                      {pixel.pixel_name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Page */}
                          <div className="space-y-2">
                            <Label>Default Page</Label>
                            <Select
                              value={defaults.default_page_id || "__none__"}
                              onValueChange={(value) => updateDefault(account.id, "default_page_id", value === "__none__" ? null : value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select page" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {pages.length === 0 ? (
                                  <SelectItem value="none" disabled>
                                    No pages available
                                  </SelectItem>
                                ) : (
                                  pages.map((page) => (
                                    <SelectItem key={page.id} value={page.page_id || ""}>
                                      {page.page_name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Instagram Account */}
                          <div className="space-y-2">
                            <Label>Default Instagram Account</Label>
                            <Select
                              value={defaults.default_instagram_account_id || "__none__"}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_instagram_account_id", value === "__none__" ? null : value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select Instagram account" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {instagramAccounts.length === 0 ? (
                                  <SelectItem value="none" disabled>
                                    No Instagram accounts available
                                  </SelectItem>
                                ) : (
                                  instagramAccounts.map((ig) => (
                                    <SelectItem key={ig.id} value={ig.instagram_account_id || ""}>
                                      {ig.username}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Catalog */}
                          <div className="space-y-2">
                            <Label>Default Catalog</Label>
                            <Select
                              value={defaults.default_catalog_id || "__none__"}
                              onValueChange={(value) => {
                                const nextValue = value === "__none__" ? null : value;
                                updateDefault(account.id, "default_catalog_id", nextValue);
                                updateDefault(account.id, "default_product_set_id", null);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select catalog" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {catalogs.length === 0 ? (
                                  <SelectItem value="none" disabled>
                                    No catalogs available
                                  </SelectItem>
                                ) : (
                                  catalogs.map((catalog) => (
                                    <SelectItem key={catalog.id} value={catalog.catalog_id || ""}>
                                      {catalog.catalog_name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Product Set - Only show when catalog is selected */}
                          {defaults.default_catalog_id && (
                            <div className="space-y-2">
                              <Label>Default Product Set</Label>
                              <Select
                                value={defaults.default_product_set_id || undefined}
                                onValueChange={(value) => updateDefault(account.id, "default_product_set_id", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select product set" />
                                </SelectTrigger>
                                <SelectContent>
                                  {catalogProductSets.length === 0 ? (
                                    <SelectItem value="none" disabled>
                                      No product sets available
                                    </SelectItem>
                                  ) : (
                                    catalogProductSets.map((ps) => (
                                      <SelectItem key={ps.id} value={ps.product_set_id || ""}>
                                        {ps.product_set_name}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {/* Conversion Event */}
                          <div className="space-y-2">
                            <Label>Default Conversion Event</Label>
                            <Select
                              value={defaults.default_conversion_event || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_conversion_event", value)}
                              disabled={!defaults.default_pixel_id || loadingMetaEvents === selectedPixel}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={loadingMetaEvents === selectedPixel ? "Loading events..." : "Select conversion event"} />
                              </SelectTrigger>
                              <SelectContent>
                                {pixelEvents.length === 0 ? (
                                  <SelectItem value="none" disabled>
                                    {loadingMetaEvents === selectedPixel ? "Loading..." : "No events available"}
                                  </SelectItem>
                                ) : (
                                  pixelEvents.map((event: any) => (
                                    <SelectItem key={event.id} value={event.id || event.event_name || ""}>
                                      {event.name || event.event_name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Conversion Budget Type */}
                          <div className="space-y-2">
                            <Label>Conversion Budget Type</Label>
                            <Select
                              value={defaults.default_conversion_budget_type || undefined}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_conversion_budget_type", value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select budget type" />
                              </SelectTrigger>
                              <SelectContent>
                                {BUDGET_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Non-Conversion Budget Type */}
                          <div className="space-y-2">
                            <Label>Non-Conversion Budget Type</Label>
                            <Select
                              value={defaults.default_non_conversion_budget_type || undefined}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_non_conversion_budget_type", value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select budget type" />
                              </SelectTrigger>
                              <SelectContent>
                                {BUDGET_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Advantage+ Shopping Campaign */}
                          <div className="space-y-2">
                            <Label>Advantage+ Shopping Campaign</Label>
                            <Select
                              value={(defaults as any).default_advantage_plus_campaign ? "true" : "false"}
                              onValueChange={(value) => updateDefault(account.id, "default_advantage_plus_campaign" as any, value === "true")}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="false">Manual Campaign</SelectItem>
                                <SelectItem value="true">Advantage+ Shopping Campaign</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Advantage+ Audience */}
                          <div className="space-y-2">
                            <Label>Advantage+ Audience</Label>
                            <Select
                              value={(defaults as any).default_advantage_plus_audience ? "true" : "false"}
                              onValueChange={(value) => updateDefault(account.id, "default_advantage_plus_audience" as any, value === "true")}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="false">Manual Audience</SelectItem>
                                <SelectItem value="true">Advantage+ Audience</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Advantage+ Creative */}
                          <div className="space-y-2">
                            <Label>Advantage+ Creative</Label>
                            <Select
                              value={(defaults as any).default_advantage_plus_creative ? "true" : "false"}
                              onValueChange={(value) => updateDefault(account.id, "default_advantage_plus_creative" as any, value === "true")}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="false">Standard Creative</SelectItem>
                                <SelectItem value="true">Advantage+ Creative</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Bid Strategy */}
                          <div className="space-y-2">
                            <Label>Default Bid Strategy</Label>
                            <Select
                              value={defaults.default_bid_strategy || "LOWEST_COST_WITHOUT_CAP"}
                              onValueChange={(value) => updateDefault(account.id, "default_bid_strategy", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select bid strategy" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LOWEST_COST_WITHOUT_CAP">Lowest Cost (Automatic)</SelectItem>
                                <SelectItem value="LOWEST_COST_WITH_BID_CAP">Lowest Cost with Bid Cap</SelectItem>
                                <SelectItem value="COST_CAP">Cost Cap</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Billing Event */}
                          <div className="space-y-2">
                            <Label>Default Billing Event</Label>
                            <Select
                              value={defaults.default_billing_event || "IMPRESSIONS"}
                              onValueChange={(value) => updateDefault(account.id, "default_billing_event", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select billing event" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="IMPRESSIONS">Impressions (CPM)</SelectItem>
                                <SelectItem value="LINK_CLICKS">Link Clicks (CPC)</SelectItem>
                                <SelectItem value="POST_ENGAGEMENT">Post Engagement</SelectItem>
                                <SelectItem value="THRUPLAY">ThruPlay (Video)</SelectItem>
                                <SelectItem value="PAGE_LIKES">Page Likes</SelectItem>
                                <SelectItem value="APP_INSTALLS">App Installs</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Conversion Count */}
                          <div className="space-y-2">
                            <Label>Conversion Count</Label>
                            <Select
                              value={defaults.default_conversion_count || "all_conversions"}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_conversion_count", value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select conversion count" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all_conversions">All Conversions (Every Event)</SelectItem>
                                <SelectItem value="one_per_click">One Per Click</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Count all conversion events or just one per click
                            </p>
                          </div>

                          {/* Conversion Locations Section */}
                          <div className="space-y-2 md:col-span-2">
                            <Label className="text-base font-medium">Conversion Locations</Label>
                            <p className="text-xs text-muted-foreground mb-4">
                              Configure destination locations. When a campaign objective requires a specific location,
                              it will auto-fill from here.
                            </p>
                            <ConversionLocationsSection
                              platform="meta"
                              accountId={account.id}
                              metaAdAccountId={account.account_id}
                              configuredLocations={extractMetaLocations(defaults)}
                              onSaveLocation={async (locationType, data) => {
                                const updates = metaLocationToDefaults(locationType, data);
                                // Also set the optimization location to this type
                                await updateDefault(account.id, "default_optimization_location" as any, locationType);
                                for (const [key, value] of Object.entries(updates)) {
                                  await updateDefault(account.id, key as any, value);
                                }
                              }}
                              onDeleteLocation={async (locationType) => {
                                const fieldsToClear = getMetaLocationClearFields(locationType);
                                for (const field of fieldsToClear) {
                                  await updateDefault(account.id, field as any, null);
                                }
                                // Clear optimization location if it matches the deleted type
                                if (defaults.default_optimization_location === locationType) {
                                  await updateDefault(account.id, "default_optimization_location" as any, null);
                                }
                              }}
                              pages={pages
                                .filter((p) => p.page_id)
                                .map((p) => ({ page_id: p.page_id!, page_name: p.page_name! }))}
                              instagramAccounts={instagramAccounts
                                .filter((i) => i.instagram_account_id)
                                .map((i) => ({ instagram_account_id: i.instagram_account_id!, username: i.username! }))}
                              saving={saving}
                            />
                          </div>

                          {/* Attribution Windows */}
                          <div className="space-y-2">
                            <Label>Click-Through Window (days)</Label>
                            <Select
                              value={String(defaults.default_click_window || 7)}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_click_window", parseInt(value))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select click window" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 day</SelectItem>
                                <SelectItem value="7">7 days</SelectItem>
                                <SelectItem value="28">28 days</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Attribution window for clicks</p>
                          </div>

                          <div className="space-y-2">
                            <Label>View-Through Window (days)</Label>
                            <Select
                              value={String(defaults.default_view_window || 1)}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_view_window", parseInt(value))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select view window" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 day</SelectItem>
                                <SelectItem value="7">7 days</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Attribution window for views</p>
                          </div>

                          {/* Advantage+ Placements Toggle */}
                          <div className="space-y-3 md:col-span-2">
                            <Label>Placement Strategy</Label>
                            <div className="space-y-2">
                              <div
                                className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                                  (defaults as any).default_advantage_plus_placements !== false
                                    ? "bg-primary/10 border-primary"
                                    : "bg-background hover:bg-accent/50"
                                }`}
                                onClick={() => updateDefault(account.id, "default_advantage_plus_placements", true)}
                              >
                                <div className="flex items-center h-5 mt-0.5">
                                  <input
                                    type="radio"
                                    checked={(defaults as any).default_advantage_plus_placements !== false}
                                    onChange={() =>
                                      updateDefault(account.id, "default_advantage_plus_placements", true)
                                    }
                                    className="h-4 w-4"
                                  />
                                </div>
                                <div className="flex-1">
                                  <Label className="flex items-center gap-2 cursor-pointer font-medium">
                                    <span className="text-primary">✨</span>
                                    Advantage+ placements (recommended)
                                  </Label>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Meta automatically optimizes placements for maximum performance
                                  </p>
                                </div>
                              </div>
                              <div
                                className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                                  (defaults as any).default_advantage_plus_placements === false
                                    ? "bg-primary/10 border-primary"
                                    : "bg-background hover:bg-accent/50"
                                }`}
                                onClick={() => updateDefault(account.id, "default_advantage_plus_placements", false)}
                              >
                                <div className="flex items-center h-5 mt-0.5">
                                  <input
                                    type="radio"
                                    checked={(defaults as any).default_advantage_plus_placements === false}
                                    onChange={() =>
                                      updateDefault(account.id, "default_advantage_plus_placements", false)
                                    }
                                    className="h-4 w-4"
                                  />
                                </div>
                                <div className="flex-1">
                                  <Label className="cursor-pointer font-medium">Manual placements</Label>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Choose specific platforms and placements
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Manual Placement Configuration - only shown when manual mode */}
                          {(defaults as any).default_advantage_plus_placements === false && (
                            <>
                              {/* Publisher Platforms */}
                              <div className="space-y-2 md:col-span-2">
                                <Label>Default Publisher Platforms</Label>
                                <MultiSelect
                                  options={[
                                    { value: "facebook", label: "Facebook" },
                                    { value: "instagram", label: "Instagram" },
                                    { value: "audience_network", label: "Audience Network" },
                                    { value: "messenger", label: "Messenger" },
                                    { value: "threads", label: "Threads" },
                                  ]}
                                  value={
                                    defaults.default_publisher_platforms || [
                                      "facebook",
                                      "instagram",
                                      "audience_network",
                                    ]
                                  }
                                  onChange={(platforms) => {
                                    updateDefault(account.id, "default_publisher_platforms", platforms);
                                    // Update positions to remove unselected platforms
                                    const currentPositions = defaults.default_positions || {};
                                    const updatedPositions: Record<string, string[]> = {};
                                    platforms.forEach((p: string) => {
                                      if (currentPositions[p as keyof typeof currentPositions]) {
                                        updatedPositions[p] = currentPositions[
                                          p as keyof typeof currentPositions
                                        ] as string[];
                                      }
                                    });
                                    updateDefault(account.id, "default_positions", updatedPositions);
                                  }}
                                  placeholder="Select publisher platforms"
                                  emptyText="No platforms selected"
                                />
                                <p className="text-xs text-muted-foreground">Where your ads will be shown</p>
                              </div>

                              {/* Placements for each publisher */}
                              {(
                                defaults.default_publisher_platforms || ["facebook", "instagram", "audience_network"]
                              ).includes("facebook") && (
                                <div className="space-y-2">
                                  <Label>Facebook Placements</Label>
                                  <MultiSelect
                                    options={[
                                      { value: "feed", label: "Feed" },
                                      { value: "instant_article", label: "Instant Article" },
                                      { value: "instream_video", label: "In-stream Video" },
                                      { value: "marketplace", label: "Marketplace" },
                                      { value: "search", label: "Search" },
                                      { value: "video_feeds", label: "Video Feeds" },
                                      { value: "story", label: "Story" },
                                    ]}
                                    value={(defaults.default_positions as any)?.facebook || []}
                                    onChange={(placements) => {
                                      const currentPositions = defaults.default_positions || {};
                                      updateDefault(account.id, "default_positions", {
                                        ...currentPositions,
                                        facebook: placements,
                                      });
                                    }}
                                    placeholder="All placements (automatic)"
                                    emptyText="No placements selected"
                                  />
                                </div>
                              )}

                              {(
                                defaults.default_publisher_platforms || ["facebook", "instagram", "audience_network"]
                              ).includes("instagram") && (
                                <div className="space-y-2">
                                  <Label>Instagram Placements</Label>
                                  <MultiSelect
                                    options={[
                                      { value: "stream", label: "Feed" },
                                      { value: "story", label: "Story" },
                                      { value: "explore", label: "Explore" },
                                      { value: "explore_home", label: "Explore Home" },
                                      { value: "reels", label: "Reels" },
                                    ]}
                                    value={(defaults.default_positions as any)?.instagram || []}
                                    onChange={(placements) => {
                                      const currentPositions = defaults.default_positions || {};
                                      updateDefault(account.id, "default_positions", {
                                        ...currentPositions,
                                        instagram: placements,
                                      });
                                    }}
                                    placeholder="All placements (automatic)"
                                    emptyText="No placements selected"
                                  />
                                </div>
                              )}

                              {(
                                defaults.default_publisher_platforms || ["facebook", "instagram", "audience_network"]
                              ).includes("audience_network") && (
                                <div className="space-y-2">
                                  <Label>Audience Network Placements</Label>
                                  <MultiSelect
                                    options={[
                                      { value: "classic", label: "Native, Banner, Interstitial" },
                                      { value: "instream_video", label: "In-stream Video" },
                                      { value: "rewarded_video", label: "Rewarded Video" },
                                    ]}
                                    value={(defaults.default_positions as any)?.audience_network || []}
                                    onChange={(placements) => {
                                      const currentPositions = defaults.default_positions || {};
                                      updateDefault(account.id, "default_positions", {
                                        ...currentPositions,
                                        audience_network: placements,
                                      });
                                    }}
                                    placeholder="All placements (automatic)"
                                    emptyText="No placements selected"
                                  />
                                </div>
                              )}
                            </>
                          )}

                          {/* Advantage+ Creative Enhancements Section */}
                          <div className="md:col-span-2">
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 text-left">
                                <Sparkles className="h-4 w-4 text-primary" />
                                <span className="font-medium">Advantage+ Creative Enhancements</span>
                                <ChevronDown className="h-4 w-4 ml-auto transition-transform duration-200 group-data-[state=open]:rotate-180" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-4 pt-4">
                                <p className="text-sm text-muted-foreground mb-4">
                                  Enable AI-powered creative enhancements to improve ad performance
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Video touch-ups</Label>
                                      <p className="text-xs text-muted-foreground">Automatically enhance video quality</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_video_touchups ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_video_touchups" as any, checked)}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Text improvements</Label>
                                      <p className="text-xs text-muted-foreground">Optimize ad copy for performance</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_text_improvements ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_text_improvements" as any, checked)}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Add product tags</Label>
                                      <p className="text-xs text-muted-foreground">Auto-add product tags to ads</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_product_tags ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_product_tags" as any, checked)}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Add video effects</Label>
                                      <p className="text-xs text-muted-foreground">Enhance videos with effects</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_video_effects ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_video_effects" as any, checked)}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Relevant comments</Label>
                                      <p className="text-xs text-muted-foreground">Show relevant comments on ads</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_relevant_comments ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_relevant_comments" as any, checked)}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Enhance CTA</Label>
                                      <p className="text-xs text-muted-foreground">Optimize call-to-action buttons</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_enhance_cta ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_enhance_cta" as any, checked)}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Reveal details overtime</Label>
                                      <p className="text-xs text-muted-foreground">Progressive disclosure of ad details</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_reveal_details ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_reveal_details" as any, checked)}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Show spotlights</Label>
                                      <p className="text-xs text-muted-foreground">Highlight key product features</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_show_spotlights ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_show_spotlights" as any, checked)}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Optimize text per person</Label>
                                      <p className="text-xs text-muted-foreground">Personalize text for each viewer</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_optimize_text_per_person ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_optimize_text_per_person" as any, checked)}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Sitelinks</Label>
                                      <p className="text-xs text-muted-foreground">Add additional links to ads</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_sitelinks ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_sitelinks" as any, checked)}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="space-y-0.5">
                                      <Label className="text-sm font-medium">Products</Label>
                                      <p className="text-xs text-muted-foreground">Show relevant products from catalog</p>
                                    </div>
                                    <Switch
                                      checked={(defaults as any).advantage_plus_products ?? false}
                                      onCheckedChange={(checked) => updateDefault(account.id, "advantage_plus_products" as any, checked)}
                                    />
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </div>

                        </>
                      )}

                      {/* TikTok-specific fields */}
                      {account.platform === "tiktok" && (
                        <>
                          {/* TikTok Pixel */}
                          <div className="space-y-2">
                            <Label>Default TikTok Pixel</Label>
                            {(() => {
                              const accountPixels = tiktokPixels.filter(
                                (p) => p.advertiser_id === account.advertiser_id,
                              );
                              const pixelValue = defaults.default_pixel_id || undefined;
                              console.log(
                                `[TikTok Pixel Select] Account ${account.account_name} (${account.advertiser_id}):`,
                                {
                                  selectedValue: pixelValue,
                                  availablePixels: accountPixels.map((p) => ({ id: p.pixel_id, name: p.pixel_name })),
                                  hasMatch: accountPixels.some((p) => p.pixel_id === pixelValue),
                                  allPixels: tiktokPixels.length,
                                  filteredPixels: accountPixels.length,
                                },
                              );
                              return null;
                            })()}
                            <Select
                              key={`pixel-${account.id}-${defaults.default_pixel_id || "empty"}`}
                              value={defaults.default_pixel_id || "__none__"}
                              onValueChange={(value) => updateDefault(account.id, "default_pixel_id", value === "__none__" ? null : value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select TikTok pixel" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {(() => {
                                  const accountPixels = tiktokPixels.filter(
                                    (p) => p.advertiser_id === account.advertiser_id,
                                  );
                                  return accountPixels.length === 0 ? (
                                    <SelectItem value="none" disabled>
                                      No pixels available for this advertiser
                                    </SelectItem>
                                  ) : (
                                    accountPixels.map((pixel) => (
                                      <SelectItem key={pixel.id} value={pixel.pixel_id}>
                                        {pixel.pixel_name}
                                      </SelectItem>
                                    ))
                                  );
                                })()}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* TikTok Identity */}
                          <div className="space-y-2">
                            <Label>Default TikTok Identity</Label>
                            {(() => {
                              const accountIdentities = tiktokIdentities.filter(
                                (i) => i.advertiser_id === account.advertiser_id,
                              );
                              const identityValue = defaults.default_identity_id || undefined;
                              console.log(
                                `[TikTok Identity Select] Account ${account.account_name} (${account.advertiser_id}):`,
                                {
                                  selectedValue: identityValue,
                                  availableIdentities: accountIdentities.map((i) => ({
                                    id: i.identity_id,
                                    name: i.identity_name,
                                  })),
                                  hasMatch: accountIdentities.some((i) => i.identity_id === identityValue),
                                  allIdentities: tiktokIdentities.length,
                                  filteredIdentities: accountIdentities.length,
                                },
                              );
                              return null;
                            })()}
                            <Select
                              key={`identity-${account.id}-${defaults.default_identity_id || "empty"}`}
                              value={defaults.default_identity_id || "__none__"}
                              onValueChange={(value) => updateDefault(account.id, "default_identity_id", value === "__none__" ? null : value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select TikTok identity" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {(() => {
                                  const accountIdentities = tiktokIdentities.filter(
                                    (i) => i.advertiser_id === account.advertiser_id,
                                  );
                                  return accountIdentities.length === 0 ? (
                                    <SelectItem value="none" disabled>
                                      No identities available for this advertiser
                                    </SelectItem>
                                  ) : (
                                    accountIdentities.map((identity) => (
                                      <SelectItem key={identity.id} value={identity.identity_id}>
                                        {identity.identity_name}
                                      </SelectItem>
                                    ))
                                  );
                                })()}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              TikTok accounts must be shared as "assets" in your Business Center (not just linked). Go
                              to Business Center → Assets → Add Asset → TikTok Account.
                            </p>
                          </div>

                          {/* TikTok Catalog */}
                          <div className="space-y-2">
                            <Label>Default TikTok Catalog</Label>
                            {(() => {
                              const accountCatalogs = tiktokCatalogs.filter(
                                (c) => c.advertiser_id === account.advertiser_id,
                              );
                              const catalogValue = defaults.default_catalog_id || undefined;
                              console.log(
                                `[TikTok Catalog Select] Account ${account.account_name} (${account.advertiser_id}):`,
                                {
                                  selectedValue: catalogValue,
                                  availableCatalogs: accountCatalogs.map((c) => ({
                                    id: c.catalog_id,
                                    name: c.catalog_name,
                                  })),
                                  hasMatch: accountCatalogs.some((c) => c.catalog_id === catalogValue),
                                  allCatalogs: tiktokCatalogs.length,
                                  filteredCatalogs: accountCatalogs.length,
                                },
                              );
                              return null;
                            })()}
                            <Select
                              key={`catalog-${account.id}-${defaults.default_catalog_id || "empty"}`}
                              value={defaults.default_catalog_id || "__none__"}
                              onValueChange={(value) => {
                                const nextValue = value === "__none__" ? null : value;
                                updateDefault(account.id, "default_catalog_id", nextValue);
                                if (!nextValue) updateDefault(account.id, "default_product_set_id", null);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select TikTok catalog" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {(() => {
                                  const accountCatalogs = tiktokCatalogs.filter(
                                    (c) => c.advertiser_id === account.advertiser_id,
                                  );
                                  return accountCatalogs.length === 0 ? (
                                    <SelectItem value="none" disabled>
                                      No catalogs available for this advertiser
                                    </SelectItem>
                                  ) : (
                                    accountCatalogs.map((catalog) => (
                                      <SelectItem key={catalog.id} value={catalog.catalog_id}>
                                        {catalog.catalog_name}
                                      </SelectItem>
                                    ))
                                  );
                                })()}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Product Set - Only show when catalog is selected */}
                          {defaults.default_catalog_id && (
                            <div className="space-y-2">
                              <Label>Default Product Set</Label>
                              <Select
                                key={`product-set-${account.id}-${defaults.default_product_set_id || "empty"}`}
                                value={defaults.default_product_set_id || undefined}
                                onValueChange={(value) => updateDefault(account.id, "default_product_set_id", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select product set" />
                                </SelectTrigger>
                                <SelectContent>
                                  {tiktokProductSets
                                    .filter(
                                      (ps) =>
                                        ps.catalog_id === defaults.default_catalog_id &&
                                        ps.advertiser_id === account.advertiser_id,
                                    )
                                    .map((ps) => (
                                      <SelectItem key={ps.product_set_id} value={ps.product_set_id}>
                                        {ps.product_set_name}
                                      </SelectItem>
                                    ))}
                                  {tiktokProductSets.filter(
                                    (ps) =>
                                      ps.catalog_id === defaults.default_catalog_id &&
                                      ps.advertiser_id === account.advertiser_id,
                                  ).length === 0 && (
                                    <SelectItem value="none" disabled>
                                      No product sets available
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {/* TikTok Conversion Budget Type */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Conversion Budget Type
                            </Label>
                            <Select
                              key={`conv-budget-${account.id}-${defaults.default_conversion_budget_type || "empty"}`}
                              value={defaults.default_conversion_budget_type || undefined}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_conversion_budget_type", value)
                              }
                            >
                              <SelectTrigger className="border-black/20 dark:border-white/20">
                                <SelectValue placeholder="Select budget type" />
                              </SelectTrigger>
                              <SelectContent>
                                {BUDGET_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* TikTok Non-Conversion Budget Type */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Non-Conversion Budget Type
                            </Label>
                            <Select
                              key={`non-conv-budget-${account.id}-${defaults.default_non_conversion_budget_type || "empty"}`}
                              value={defaults.default_non_conversion_budget_type || undefined}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_non_conversion_budget_type", value)
                              }
                            >
                              <SelectTrigger className="border-black/20 dark:border-white/20">
                                <SelectValue placeholder="Select budget type" />
                              </SelectTrigger>
                              <SelectContent>
                                {BUDGET_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* TikTok Billing Event */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Billing Event
                            </Label>
                            <Select
                              key={`billing-event-${account.id}-${defaults.default_billing_event || "empty"}`}
                              value={defaults.default_billing_event || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_billing_event", value)}
                            >
                              <SelectTrigger className="border-black/20 dark:border-white/20">
                                <SelectValue placeholder="Select billing event" />
                              </SelectTrigger>
                              <SelectContent>
                                {BILLING_EVENT_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Choose OCPM for most objectives. Some objectives like TRAFFIC only support CPC.
                            </p>
                          </div>

                          {/* TikTok Bid Strategy */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Default Bid Strategy
                            </Label>
                            <Select
                              value={defaults.default_bid_strategy || "LOWEST_COST"}
                              onValueChange={(value) => updateDefault(account.id, "default_bid_strategy", value)}
                            >
                              <SelectTrigger className="border-black/20 dark:border-white/20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LOWEST_COST">Maximum Delivery (No bid required)</SelectItem>
                                <SelectItem value="COST_CAP">Cost Cap (Requires bid amount on phase level)</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Maximum Delivery maximizes conversions within budget. Cost Cap targets a specific cost per
                              result (bid amount set on phase level).
                            </p>
                          </div>

                          {/* TikTok Click-Through Window */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Click-Through Window (days)
                            </Label>
                            <Select
                              value={String(defaults.default_click_window || 7)}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_click_window", parseInt(value))
                              }
                            >
                              <SelectTrigger className="border-black/20 dark:border-white/20">
                                <SelectValue placeholder="Select click window" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="7">7 days</SelectItem>
                                <SelectItem value="28">28 days</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Attribution window for click-through conversions
                            </p>
                          </div>

                          {/* TikTok View-Through Window */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              View-Through Window (days)
                            </Label>
                            <Select
                              value={String(defaults.default_view_window || 1)}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_view_window", parseInt(value))
                              }
                            >
                              <SelectTrigger className="border-black/20 dark:border-white/20">
                                <SelectValue placeholder="Select view window" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 day</SelectItem>
                                <SelectItem value="7">7 days</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Attribution window for view-through conversions
                            </p>
                          </div>

                          {/* TikTok Optimization Event */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Optimization Event
                            </Label>
                            <Select
                              key={`optimization-event-${account.id}-${defaults.default_optimization_event || "empty"}`}
                              value={defaults.default_optimization_event || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_optimization_event", value)}
                            >
                              <SelectTrigger className="border-black/20 dark:border-white/20">
                                <SelectValue placeholder="Select optimization event" />
                              </SelectTrigger>
                              <SelectContent>
                                {TIKTOK_OPTIMIZATION_EVENT_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Conversion event to optimize for. Requires at least 90 days of historical data on the
                              selected pixel.
                            </p>
                          </div>

                          {/* TikTok Landing Page URL */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Landing Page URL
                            </Label>
                            <Input
                              type="url"
                              placeholder="https://example.com"
                              value={defaults.default_landing_page_url || ""}
                              onChange={(e) => updateDefault(account.id, "default_landing_page_url", e.target.value)}
                              className="border-black/20 dark:border-white/20"
                            />
                            <p className="text-xs text-muted-foreground">
                              Required for conversion campaigns. Where users land after clicking your ad.
                            </p>
                          </div>

                          {/* TikTok Placement Type */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Placement Type
                            </Label>
                            <Select
                              value={defaults.default_placement_type || "PLACEMENT_TYPE_AUTOMATIC"}
                              onValueChange={(value) => {
                                updateDefault(account.id, "default_placement_type", value);
                                // Select all placements when switching to automatic
                                if (value === "PLACEMENT_TYPE_AUTOMATIC") {
                                  updateDefault(account.id, "default_placements", [
                                    "PLACEMENT_TIKTOK",
                                    "PLACEMENT_GLOBAL_APP_BUNDLE",
                                    "PLACEMENT_PANGLE",
                                  ]);
                                }
                              }}
                            >
                              <SelectTrigger className="border-black/20 dark:border-white/20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PLACEMENT_TYPE_AUTOMATIC">Automatic Placement</SelectItem>
                                <SelectItem value="PLACEMENT_TYPE_NORMAL">Manual Placement</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Automatic lets TikTok optimize placements. Manual lets you select specific positions.
                            </p>
                          </div>

                          {/* TikTok Manual Placements - Only show when manual placement is selected */}
                          {defaults.default_placement_type === "PLACEMENT_TYPE_NORMAL" && (
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2">
                                <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                                Placements
                              </Label>
                              <MultiSelect
                                options={[
                                  { value: "PLACEMENT_TIKTOK", label: "TikTok" },
                                  { value: "PLACEMENT_GLOBAL_APP_BUNDLE", label: "Global App Bundle" },
                                  { value: "PLACEMENT_PANGLE", label: "Pangle" },
                                ]}
                                value={
                                  defaults.default_placements || [
                                    "PLACEMENT_TIKTOK",
                                    "PLACEMENT_GLOBAL_APP_BUNDLE",
                                    "PLACEMENT_PANGLE",
                                  ]
                                }
                                onChange={(placements) => updateDefault(account.id, "default_placements", placements)}
                                placeholder="Select placements"
                                emptyText="No placements selected"
                              />
                              <p className="text-xs text-muted-foreground">
                                TikTok: Main feed. Global App Bundle: Partner apps. Pangle: Audience network.
                              </p>
                            </div>
                          )}

                          {/* Conversion Locations Section */}
                          <div className="space-y-2 md:col-span-2">
                            <Label className="text-base font-medium flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Conversion Locations
                            </Label>
                            <p className="text-xs text-muted-foreground mb-4">
                              Configure destination locations. When a campaign objective requires a specific location,
                              it will auto-fill from here.
                            </p>
                            <ConversionLocationsSection
                              platform="tiktok"
                              accountId={account.id}
                              configuredLocations={extractTiktokLocations(defaults)}
                              onSaveLocation={async (locationType, data) => {
                                const updates = tiktokLocationToDefaults(locationType, data);
                                // Also set the optimization location to this type
                                await updateDefault(account.id, "default_optimization_location" as any, locationType);
                                for (const [key, value] of Object.entries(updates)) {
                                  await updateDefault(account.id, key as any, value);
                                }
                              }}
                              onDeleteLocation={async (locationType) => {
                                const fieldsToClear = getTiktokLocationClearFields(locationType);
                                for (const field of fieldsToClear) {
                                  await updateDefault(account.id, field as any, null);
                                }
                                // Clear optimization location if it matches the deleted type
                                if (defaults.default_optimization_location === locationType) {
                                  await updateDefault(account.id, "default_optimization_location" as any, null);
                                }
                              }}
                              tiktokApps={tiktokApps.filter((app) => app.advertiser_id === account.advertiser_id)}
                              tiktokEvents={tiktokEvents[account.advertiser_id] || []}
                              saving={saving}
                            />
                          </div>

                          {/* TikTok Conversion Count */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Conversion Count
                            </Label>
                            <Select
                              value={defaults.default_conversion_count || "all_conversions"}
                              onValueChange={(value) =>
                                updateDefault(account.id, "default_conversion_count", value)
                              }
                            >
                              <SelectTrigger className="border-black/20 dark:border-white/20">
                                <SelectValue placeholder="Select conversion count" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all_conversions">All Conversions (Every Event)</SelectItem>
                                <SelectItem value="one_per_click">One Per Click</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Count all conversion events or just one per click
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* URL Parameters Section - Shared across all platforms */}
                    <Separator className="my-6" />
                    <div className="space-y-4">
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 text-left">
                          <Link2 className="h-4 w-4 text-primary" />
                          <span className="font-medium">URL Parameters</span>
                          <ChevronDown className="h-4 w-4 ml-auto transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-4 pt-4">
                          <p className="text-sm text-muted-foreground mb-4">
                            Configure how tracking parameters are added to your destination URLs
                          </p>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>URL Parameters Template</Label>
                              <Select
                                value={((localDefaults[account.id] as any)?.default_utm_mode === 'meta_dynamic' ? 'platform_dynamic' : (localDefaults[account.id] as any)?.default_utm_mode) || "none"}
                                onValueChange={(value) => {
                                  updateDefault(account.id, "default_utm_mode" as any, value);
                                  const platformSource = account.platform === 'tiktok' ? 'tiktok' : 'meta';
                                  if (value === "platform_dynamic") {
                                    if (account.platform === 'meta') {
                                      updateDefault(account.id, "default_url_parameters" as any, "utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{adset.name}}&utm_term={{ad.name}}");
                                    } else if (account.platform === 'tiktok') {
                                      updateDefault(account.id, "default_url_parameters" as any, "utm_source=tiktok&utm_medium=paid&utm_campaign=__CAMPAIGN_NAME__&utm_content=__AID_NAME__&utm_term=__CID_NAME__");
                                    }
                                  } else if (value === "basic") {
                                    updateDefault(account.id, "default_url_parameters" as any, `utm_source=${platformSource}&utm_medium=cpc&utm_campaign={{campaign.name}}`);
                                  } else if (value === "advanced") {
                                    updateDefault(account.id, "default_url_parameters" as any, `utm_source=${platformSource}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{adset.name}}&utm_term={{ad.name}}&utm_id={{campaign.id}}`);
                                  } else if (value === "none") {
                                    updateDefault(account.id, "default_url_parameters" as any, null);
                                  }
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select URL parameters template" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No URL Parameters</SelectItem>
                                  <SelectItem value="platform_dynamic">{account.platform === 'meta' ? 'Meta' : 'TikTok'} Dynamic Parameters</SelectItem>
                                  <SelectItem value="basic">Basic UTM (Source, Medium, Campaign)</SelectItem>
                                  <SelectItem value="advanced">Advanced UTM (Full Tracking)</SelectItem>
                                  <SelectItem value="custom">Custom Parameters</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">
                                Choose a preset template or define custom parameters for tracking.
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label>URL Parameters Value</Label>
                              <Input
                                placeholder={account.platform === 'tiktok' 
                                  ? "utm_source=tiktok&utm_medium=paid&utm_campaign=__CAMPAIGN_NAME__"
                                  : "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}"
                                }
                                value={(localDefaults[account.id] as any)?.default_url_parameters || ""}
                                onChange={(e) => {
                                  updateDefault(account.id, "default_url_parameters" as any, e.target.value);
                                  if ((localDefaults[account.id] as any)?.default_utm_mode !== "custom") {
                                    updateDefault(account.id, "default_utm_mode" as any, "custom");
                                  }
                                }}
                                disabled={(localDefaults[account.id] as any)?.default_utm_mode === "none"}
                              />
                              <p className="text-xs text-muted-foreground">
                                {account.platform === 'tiktok'
                                  ? 'Parameters without leading "?". Use __CAMPAIGN_NAME__, __AID_NAME__, __CID_NAME__ for TikTok dynamic macros.'
                                  : 'Parameters without leading "?". Use {{campaign.name}}, {{adset.name}}, {{ad.name}}, {{site_source_name}} for dynamic values.'
                                }
                              </p>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>

                    {/* Naming Taxonomy Section */}
                    <Separator className="my-6" />
                    <AccountTaxonomySection adAccountId={account.id} platform={account.platform} userId={userId} />

                    <div className="flex justify-end gap-2 pt-4">
                      <Button onClick={() => handleSave(account.id)} disabled={saving === account.id}>
                        {saving === account.id ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Defaults
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </Card>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Google Ads account defaults */}
      {googleAdAccounts.length === 0 && adAccounts.length >= 0 && (
        <Card className="p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No Google Ads accounts linked to this client yet.
          </p>
          <p className="text-xs text-muted-foreground">
            Go to <Link to="/app/settings/platforms" className="text-primary underline hover:no-underline">Platform Connections</Link> to sync and link your Google Ads accounts to this client.
          </p>
        </Card>
      )}
      {googleAdAccounts.length > 0 && (
        <Accordion type="single" collapsible className="space-y-4">
          {googleAdAccounts.map((gAccount) => {
            const gDefaults = googleLocalDefaults[gAccount.id] || {};
            return (
              <AccordionItem key={gAccount.id} value={gAccount.id}>
                <Card>
                  <AccordionTrigger className="px-6 py-4 hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{gAccount.account_name}</p>
                          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200">
                            Google Ads
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">ID: {gAccount.customer_id}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="px-6 pb-6 space-y-6">
                      {/* Assigned Markets */}
                      <div className="space-y-2">
                        <Label>Assigned Markets</Label>
                        <MultiSelect
                          options={MARKET_OPTIONS
                            .filter((m) => (clientMarkets || fetchedClientMarkets).includes(m.value))
                            .map((m) => ({ value: m.value, label: m.label }))}
                          value={(gDefaults.main_markets as string[]) || []}
                          onChange={(markets) => updateGoogleDefault(gAccount.id, "main_markets", markets)}
                          placeholder="Select markets for this ad account"
                          emptyText="No markets assigned"
                        />
                        <p className="text-xs text-muted-foreground">
                          Which client markets this ad account should target
                        </p>
                      </div>

                      <Separator className="my-4" />

                      {/* Campaign Configuration Defaults */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Campaign Objective */}
                        <div className="space-y-2">
                          <Label>Default Campaign Objective</Label>
                          <Select
                            value={(gDefaults as any).default_campaign_objective || undefined}
                            onValueChange={(value) => updateGoogleDefault(gAccount.id, "default_campaign_objective" as any, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select objective" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SALES">Sales</SelectItem>
                              <SelectItem value="LEADS">Leads</SelectItem>
                              <SelectItem value="WEBSITE_TRAFFIC">Website Traffic</SelectItem>
                              <SelectItem value="APP_PROMOTION">App Promotion</SelectItem>
                              <SelectItem value="AWARENESS_CONSIDERATION">Awareness & Consideration</SelectItem>
                              <SelectItem value="LOCAL_STORE">Local Store Visits</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Campaign Type */}
                        <div className="space-y-2">
                          <Label>Default Campaign Type</Label>
                          <Select
                            value={(gDefaults as any).default_campaign_type || undefined}
                            onValueChange={(value) => {
                              updateGoogleDefault(gAccount.id, "default_campaign_type" as any, value);
                              updateGoogleDefault(gAccount.id, "default_campaign_subtype" as any, null);
                              // Auto-set bid strategy from campaign type
                              const config = getGoogleAdsCampaignConfig(value);
                              if (config?.bidStrategies?.length && !gDefaults.default_bid_strategy) {
                                updateGoogleDefault(gAccount.id, "default_bid_strategy", config.bidStrategies[0]);
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select campaign type" />
                            </SelectTrigger>
                            <SelectContent>
                              {getGoogleAdsCampaignTypes().map((type) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Campaign Subtype - dependent on type */}
                        {(gDefaults as any).default_campaign_type && getGoogleAdsSubtypes((gDefaults as any).default_campaign_type).length > 0 && (
                          <div className="space-y-2">
                            <Label>Default Campaign Subtype</Label>
                            <Select
                              value={(gDefaults as any).default_campaign_subtype || undefined}
                              onValueChange={(value) => updateGoogleDefault(gAccount.id, "default_campaign_subtype" as any, value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select subtype" />
                              </SelectTrigger>
                              <SelectContent>
                                {getGoogleAdsSubtypes((gDefaults as any).default_campaign_type).map((st) => (
                                  <SelectItem key={st} value={st}>{st}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Location Targeting */}
                        <div className="space-y-2">
                          <Label>Default Location Targeting</Label>
                          <Select
                            value={(gDefaults as any).default_location_targeting || 'PRESENCE_OR_INTEREST'}
                            onValueChange={(value) => updateGoogleDefault(gAccount.id, "default_location_targeting" as any, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PRESENCE_OR_INTEREST">Presence or Interest (Recommended)</SelectItem>
                              <SelectItem value="PRESENCE">Presence Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Customer Acquisition */}
                        <div className="space-y-2">
                          <Label>Default Customer Acquisition</Label>
                          <Select
                            value={(gDefaults as any).default_customer_acquisition || 'Everyone'}
                            onValueChange={(value) => updateGoogleDefault(gAccount.id, "default_customer_acquisition" as any, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Everyone">Everyone</SelectItem>
                              <SelectItem value="New Customers Only">New Customers Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Inventory Type */}
                        <div className="space-y-2">
                          <Label>Default Inventory Type</Label>
                          <Select
                            value={(gDefaults as any).default_inventory_type || undefined}
                            onValueChange={(value) => updateGoogleDefault(gAccount.id, "default_inventory_type" as any, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select inventory type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Expanded">Expanded Inventory</SelectItem>
                              <SelectItem value="Standard">Standard Inventory</SelectItem>
                              <SelectItem value="Limited">Limited Inventory</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">For Video campaigns - controls where ads appear</p>
                        </div>
                      </div>

                      {/* Network & Targeting Toggles */}
                      <div className="space-y-3 mt-4">
                        <Label className="text-sm font-medium">Networks & Targeting</Label>
                        <div className="flex flex-wrap gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={(gDefaults as any).default_search_partner ?? false}
                              onCheckedChange={(v) => updateGoogleDefault(gAccount.id, "default_search_partner" as any, v)}
                              className="h-4 w-7"
                            />
                            <Label className="text-sm">Search Partners</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={(gDefaults as any).default_display_network ?? false}
                              onCheckedChange={(v) => updateGoogleDefault(gAccount.id, "default_display_network" as any, v)}
                              className="h-4 w-7"
                            />
                            <Label className="text-sm">Display Network</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={(gDefaults as any).default_optimized_targeting ?? true}
                              onCheckedChange={(v) => updateGoogleDefault(gAccount.id, "default_optimized_targeting" as any, v)}
                              className="h-4 w-7"
                            />
                            <Label className="text-sm">Optimized Targeting</Label>
                          </div>
                        </div>
                      </div>

                      {/* AI Features */}
                      <div className="space-y-3 mt-4">
                        <Label className="text-sm font-medium">AI Features</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={(gDefaults as any).default_ai_max ?? false}
                            onCheckedChange={(v) => {
                              updateGoogleDefault(gAccount.id, "default_ai_max" as any, v);
                              if (!v) updateGoogleDefault(gAccount.id, "default_ai_max_options" as any, []);
                            }}
                            className="h-4 w-7"
                          />
                          <Label className="text-sm">AI Maximization</Label>
                        </div>
                        {(gDefaults as any).default_ai_max && (
                          <div className="flex flex-wrap gap-3 ml-6">
                            {["Text customization", "Final URL expansion"].map((opt) => {
                              const currentOptions = Array.isArray((gDefaults as any).default_ai_max_options) ? (gDefaults as any).default_ai_max_options : [];
                              const isChecked = currentOptions.includes(opt);
                              return (
                                <div key={opt} className="flex items-center gap-1.5">
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      updateGoogleDefault(
                                        gAccount.id,
                                        "default_ai_max_options" as any,
                                        checked ? [...currentOptions, opt] : currentOptions.filter((o: string) => o !== opt)
                                      );
                                    }}
                                  />
                                  <label className="text-sm">{opt}</label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Brand Guidelines (PMax) */}
                      <div className="space-y-3 mt-4">
                        <Label className="text-sm font-medium">Brand Guidelines (Performance Max)</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={(gDefaults as any).default_brand_guidelines ?? false}
                            onCheckedChange={(v) => {
                              updateGoogleDefault(gAccount.id, "default_brand_guidelines" as any, v);
                              if (!v) updateGoogleDefault(gAccount.id, "default_business_name" as any, null);
                            }}
                            className="h-4 w-7"
                          />
                          <Label className="text-sm">Brand Guidelines</Label>
                        </div>
                        {(gDefaults as any).default_brand_guidelines && (
                          <div className="ml-6 space-y-2">
                            <Label className="text-sm">Business Name</Label>
                            <Input
                              placeholder="Your business name"
                              value={(gDefaults as any).default_business_name || ""}
                              onChange={(e) => updateGoogleDefault(gAccount.id, "default_business_name" as any, e.target.value || null)}
                            />
                            <p className="text-xs text-muted-foreground">
                              Required for PMax campaigns with Brand Guidelines. A logo asset must also be linked in your Google Ads account.
                            </p>
                          </div>
                        )}
                      </div>

                      <Separator className="my-4" />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Landing Page URL */}
                        <div className="space-y-2 md:col-span-2">
                          <Label>Default Landing Page URL</Label>
                          <Input
                            type="url"
                            placeholder="https://example.com/landing"
                            value={gDefaults.default_landing_page_url || ""}
                            onChange={(e) => updateGoogleDefault(gAccount.id, "default_landing_page_url", e.target.value || null)}
                          />
                          <p className="text-xs text-muted-foreground">
                            This URL will be used as the default for all Google Ads phases
                          </p>
                        </div>

                        {/* Bid Strategy */}
                        <div className="space-y-2">
                          <Label>Default Bid Strategy</Label>
                          <Select
                            value={gDefaults.default_bid_strategy || undefined}
                            onValueChange={(value) => updateGoogleDefault(gAccount.id, "default_bid_strategy", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select bid strategy" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Maximize Conversions">Maximize Conversions</SelectItem>
                              <SelectItem value="Maximize Conversion Value">Maximize Conversion Value</SelectItem>
                              <SelectItem value="Maximize Clicks">Maximize Clicks</SelectItem>
                              <SelectItem value="Target CPA">Target CPA</SelectItem>
                              <SelectItem value="Target ROAS">Target ROAS</SelectItem>
                              <SelectItem value="Target Impression Share">Target Impression Share</SelectItem>
                              <SelectItem value="Manual CPC">Manual CPC</SelectItem>
                              <SelectItem value="Maximum CPV">Maximum CPV</SelectItem>
                              <SelectItem value="Target CPM">Target CPM</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Target CPA */}
                        {(gDefaults.default_bid_strategy === "Target CPA" || gDefaults.default_bid_strategy === "TARGET_CPA") && (
                          <div className="space-y-2">
                            <Label>Default Target CPA ($)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="10.00"
                              value={gDefaults.default_target_cpa || ""}
                              onChange={(e) => updateGoogleDefault(gAccount.id, "default_target_cpa", parseFloat(e.target.value) || null)}
                            />
                          </div>
                        )}

                        {/* Target ROAS */}
                        {(gDefaults.default_bid_strategy === "Target ROAS" || gDefaults.default_bid_strategy === "TARGET_ROAS") && (
                          <div className="space-y-2">
                            <Label>Default Target ROAS (%)</Label>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              placeholder="200"
                              value={gDefaults.default_target_roas || ""}
                              onChange={(e) => updateGoogleDefault(gAccount.id, "default_target_roas", parseFloat(e.target.value) || null)}
                            />
                          </div>
                        )}

                        {/* Max CPC Bid */}
                        {(gDefaults.default_bid_strategy === "Manual CPC" || gDefaults.default_bid_strategy === "Maximum CPC") && (
                          <div className="space-y-2">
                            <Label>Default Max CPC ($)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="2.00"
                              value={gDefaults.default_max_cpc_bid || ""}
                              onChange={(e) => updateGoogleDefault(gAccount.id, "default_max_cpc_bid", parseFloat(e.target.value) || null)}
                            />
                          </div>
                        )}

                        {/* Conversion Budget Type */}
                        <div className="space-y-2">
                          <Label>Conversion Budget Type</Label>
                          <Select
                            value={gDefaults.default_conversion_budget_type || undefined}
                            onValueChange={(value) => updateGoogleDefault(gAccount.id, "default_conversion_budget_type", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select budget type" />
                            </SelectTrigger>
                            <SelectContent>
                              {BUDGET_TYPE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Non-Conversion Budget Type */}
                        <div className="space-y-2">
                          <Label>Non-Conversion Budget Type</Label>
                          <Select
                            value={gDefaults.default_non_conversion_budget_type || undefined}
                            onValueChange={(value) => updateGoogleDefault(gAccount.id, "default_non_conversion_budget_type", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select budget type" />
                            </SelectTrigger>
                            <SelectContent>
                              {BUDGET_TYPE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Separator className="my-4" />

                      {/* Merchant Center & Feed Label */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Default Merchant Center ID</Label>
                          {loadingGoogleMC[gAccount.id] ? (
                            <div className="flex items-center gap-2 h-10">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-xs text-muted-foreground">Loading merchant centers...</span>
                            </div>
                          ) : (googleMerchantCenters[gAccount.id] || []).length > 0 ? (
                            <Select
                              value={gDefaults.default_merchant_center_id || undefined}
                              onValueChange={(v) => updateGoogleDefault(gAccount.id, "default_merchant_center_id", v === "__clear__" ? null : v)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select Merchant Center" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__clear__">None</SelectItem>
                                {(googleMerchantCenters[gAccount.id] || []).map((mc) => (
                                  <SelectItem key={mc.id} value={mc.merchantCenterId}>
                                    {mc.merchantCenterName} ({mc.merchantCenterId})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="space-y-2">
                              <Input
                                placeholder="e.g. 123456789"
                                value={gDefaults.default_merchant_center_id || ""}
                                onChange={(e) => updateGoogleDefault(gAccount.id, "default_merchant_center_id", e.target.value || null)}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fetchGoogleMerchantCenters(gAccount.customer_id, gAccount.id)}
                                className="gap-1"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Fetch from API
                              </Button>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Link your Google Merchant Center for Shopping & PMax campaigns
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Default Feed Label</Label>
                          {loadingGoogleMC[gAccount.id] ? (
                            <div className="flex items-center gap-2 h-10">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-xs text-muted-foreground">Loading feed labels...</span>
                            </div>
                          ) : (googleFeedLabels[gAccount.id] || []).length > 0 ? (
                            <Select
                              value={gDefaults.default_feed_label || undefined}
                              onValueChange={(v) => updateGoogleDefault(gAccount.id, "default_feed_label", v === "__clear__" ? null : v)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select Feed Label" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__clear__">None</SelectItem>
                                {(googleFeedLabels[gAccount.id] || []).map((fl) => (
                                  <SelectItem key={fl.label} value={fl.label}>
                                    {fl.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="space-y-2">
                              <Input
                                placeholder="e.g. US or online"
                                value={gDefaults.default_feed_label || ""}
                                onChange={(e) => updateGoogleDefault(gAccount.id, "default_feed_label", e.target.value || null)}
                              />
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Feed label used to filter product feeds by country/region
                          </p>
                        </div>
                      </div>

                      {/* Default Placements */}
                      <Separator className="my-4" />
                      <div className="space-y-2">
                        <Label>Default Placements</Label>
                        <p className="text-xs text-muted-foreground">
                          Select default placements for Display and Video campaign types
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {["Websites", "YouTube Channels", "YouTube Videos", "Apps", "App Categories"].map((placement) => {
                            const currentPlacements = (gDefaults as any).default_placements || [];
                            const isChecked = Array.isArray(currentPlacements) && currentPlacements.includes(placement);
                            return (
                              <div key={placement} className="flex items-center gap-1.5">
                                <Checkbox
                                  id={`gads-def-placement-${gAccount.id}-${placement}`}
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    const current = Array.isArray(currentPlacements) ? currentPlacements : [];
                                    updateGoogleDefault(
                                      gAccount.id,
                                      "default_placements" as any,
                                      checked
                                        ? [...current, placement]
                                        : current.filter((p: string) => p !== placement)
                                    );
                                  }}
                                />
                                <label htmlFor={`gads-def-placement-${gAccount.id}-${placement}`} className="text-sm">
                                  {placement}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* URL Parameters Section */}
                      <Separator className="my-4" />
                      <div className="space-y-4">
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 text-left">
                            <Link2 className="h-4 w-4 text-primary" />
                            <span className="font-medium">URL Parameters</span>
                            <ChevronDown className="h-4 w-4 ml-auto transition-transform duration-200 group-data-[state=open]:rotate-180" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-4 pt-4">
                            <p className="text-sm text-muted-foreground mb-4">
                              Configure how tracking parameters are added to your destination URLs
                            </p>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label>URL Parameters Template</Label>
                                <Select
                                  value={(gDefaults as any).default_utm_mode || "none"}
                                  onValueChange={(value) => {
                                    updateGoogleDefault(gAccount.id, "default_utm_mode" as any, value);
                                    if (value === "platform_dynamic") {
                                      updateGoogleDefault(gAccount.id, "default_url_parameters" as any, "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}&utm_term={keyword}");
                                    } else if (value === "basic") {
                                      updateGoogleDefault(gAccount.id, "default_url_parameters" as any, "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}");
                                    } else if (value === "advanced") {
                                      updateGoogleDefault(gAccount.id, "default_url_parameters" as any, "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}&utm_term={keyword}&gclid={gclid}");
                                    } else if (value === "none") {
                                      updateGoogleDefault(gAccount.id, "default_url_parameters" as any, null);
                                    }
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select URL parameters template" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">No URL Parameters</SelectItem>
                                    <SelectItem value="platform_dynamic">Google Ads Dynamic Parameters</SelectItem>
                                    <SelectItem value="basic">Basic UTM (Source, Medium, Campaign)</SelectItem>
                                    <SelectItem value="advanced">Advanced UTM (Full Tracking)</SelectItem>
                                    <SelectItem value="custom">Custom Parameters</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>URL Parameters Value</Label>
                                <Input
                                  placeholder="utm_source=google&utm_medium=cpc&utm_campaign={campaignid}"
                                  value={(gDefaults as any).default_url_parameters || ""}
                                  onChange={(e) => {
                                    updateGoogleDefault(gAccount.id, "default_url_parameters" as any, e.target.value);
                                    if ((gDefaults as any).default_utm_mode !== "custom") {
                                      updateGoogleDefault(gAccount.id, "default_utm_mode" as any, "custom");
                                    }
                                  }}
                                  disabled={(gDefaults as any).default_utm_mode === "none"}
                                />
                                <p className="text-xs text-muted-foreground">
                                  {'Parameters without leading "?". Use {campaignid}, {adgroupid}, {keyword}, {gclid} for Google Ads dynamic values.'}
                                </p>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>

                      {/* Naming Taxonomy Section */}
                      <Separator className="my-6" />
                      <AccountTaxonomySection adAccountId={gAccount.id} platform="google" userId={userId} />

                      <div className="flex justify-end gap-2 pt-4">
                        <Button onClick={() => handleSaveGoogleDefaults(gAccount.id)} disabled={savingGoogleDefaults === gAccount.id}>
                          {savingGoogleDefaults === gAccount.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Save Defaults
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
