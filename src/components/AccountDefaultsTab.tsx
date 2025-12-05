import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, Phone } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { MARKET_OPTIONS, TIKTOK_MARKET_OPTIONS } from "@/utils/markets";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import AccountTaxonomySection from "./AccountTaxonomySection";
import MetaAppSearch from "./MetaAppSearch";
import ConversionLocationsSection from "./ConversionLocationsSection";
import { 
  META_APP_STORES, 
  META_MESSAGING_MODES, 
  TIKTOK_MESSAGING_APPS,
  TIKTOK_OPTIMIZATION_LOCATIONS 
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

interface AdAccount {
  id: string;
  account_id: string;
  account_name: string;
  advertiser_id?: string;
  platform: 'meta' | 'tiktok';
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
}

import { DEVICE_OPTIONS, LANGUAGE_OPTIONS, GENDER_OPTIONS, AGE_OPTIONS, normalizeLanguageValues } from "@/utils/targetingOptions";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [localDefaults, setLocalDefaults] = useState<Record<string, Partial<AdAccount>>>({});
  const [fetchedClientMarkets, setFetchedClientMarkets] = useState<string[]>([]);
  const [clientTargeting, setClientTargeting] = useState<ClientTargetingDefaults>({
    default_age_min: 18,
    default_age_max: 65,
    default_gender: 'all',
    default_devices: [],
    default_languages: [],
  });
  const [savingClientDefaults, setSavingClientDefaults] = useState(false);

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
        setFetchedClientMarkets(Array.isArray(clientData.markets) ? clientData.markets as string[] : []);
      }
      
      // Set client-level targeting defaults
      // Normalize language values to handle legacy numeric IDs
      const normalizedLanguages = Array.isArray(clientData.default_languages) 
        ? normalizeLanguageValues(clientData.default_languages as (string | number)[])
        : [];
      
      setClientTargeting({
        default_age_min: clientData.default_age_min ?? 18,
        default_age_max: clientData.default_age_max ?? 65,
        default_gender: clientData.default_gender || 'all',
        default_devices: Array.isArray(clientData.default_devices) ? clientData.default_devices as string[] : [],
        default_languages: normalizedLanguages,
      });

      // Load Meta ad accounts for this client
      const { data: metaAccountsData, error: metaAccountsError } = await supabase
        .from("meta_ad_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("client_id", clientId);

      if (metaAccountsError) throw metaAccountsError;
      
      // Load TikTok ad accounts for this client
      const { data: tiktokAccountsData, error: tiktokAccountsError } = await supabase
        .from("tiktok_ad_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("client_id", clientId);

      if (tiktokAccountsError) throw tiktokAccountsError;

      console.log("Meta accounts loaded:", metaAccountsData?.length || 0);
      console.log("TikTok accounts loaded:", tiktokAccountsData?.length || 0);
      
      // Combine and type cast accounts
      const metaAccounts = (metaAccountsData || []).map(acc => ({
        ...acc,
        platform: 'meta' as const,
        main_markets: Array.isArray(acc.main_markets) ? acc.main_markets as string[] : [],
        default_conversion_budget_type: acc.default_conversion_budget_type || null,
        default_non_conversion_budget_type: acc.default_non_conversion_budget_type || null,
        default_bid_strategy: acc.default_bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
        default_publisher_platforms: Array.isArray((acc as any).default_publisher_platforms) 
          ? (acc as any).default_publisher_platforms as string[] 
          : ['facebook', 'instagram', 'audience_network'],
        default_positions: (acc as any).default_positions || {},
        default_advantage_plus_placements: (acc as any).default_advantage_plus_placements ?? true,
        default_devices: Array.isArray((acc as any).default_devices) ? (acc as any).default_devices as string[] : [],
        default_languages: Array.isArray((acc as any).default_languages) 
          ? normalizeLanguageValues((acc as any).default_languages as (string | number)[])
          : [],
        default_age_min: (acc as any).default_age_min ?? 18,
        default_age_max: (acc as any).default_age_max ?? 65,
        default_gender: (acc as any).default_gender || 'all',
      }));

      const tiktokAccounts = (tiktokAccountsData || []).map(acc => ({
        ...acc,
        platform: 'tiktok' as const,
        advertiser_id: acc.advertiser_id,
        main_markets: Array.isArray(acc.main_markets) ? acc.main_markets as string[] : [],
        // Ensure all TikTok-specific defaults are properly mapped
        default_pixel_id: acc.default_pixel_id || null,
        default_identity_id: acc.default_identity_id || null,
        default_catalog_id: acc.default_catalog_id || null,
        default_product_set_id: acc.default_product_set_id || null,
        default_conversion_budget_type: acc.default_conversion_budget_type || null,
        default_non_conversion_budget_type: acc.default_non_conversion_budget_type || null,
        default_billing_event: acc.default_billing_event || 'OCPM',
        default_optimization_event: acc.default_optimization_event || 'ON_WEB_ORDER',
        default_landing_page_url: acc.default_landing_page_url || null,
        default_bid_strategy: acc.default_bid_strategy || 'LOWEST_COST',
        default_placement_type: (acc as any).default_placement_type || 'PLACEMENT_TYPE_AUTOMATIC',
        default_placements: Array.isArray((acc as any).default_placements) ? (acc as any).default_placements as string[] : ['PLACEMENT_TIKTOK', 'PLACEMENT_GLOBAL_APP_BUNDLE', 'PLACEMENT_PANGLE'],
        default_devices: Array.isArray((acc as any).default_devices) ? (acc as any).default_devices as string[] : [],
        default_languages: Array.isArray((acc as any).default_languages) 
          ? normalizeLanguageValues((acc as any).default_languages as (string | number)[])
          : [],
        default_age_min: (acc as any).default_age_min ?? 18,
        default_age_max: (acc as any).default_age_max ?? 65,
        default_gender: (acc as any).default_gender || 'all',
      }));

      console.log("[AccountDefaultsTab] TikTok accounts loaded from database:", tiktokAccounts.map(acc => ({
        id: acc.id,
        name: acc.account_name,
        pixel_id: acc.default_pixel_id,
        identity_id: acc.default_identity_id,
        catalog_id: acc.default_catalog_id,
        product_set_id: acc.default_product_set_id,
        conversion_budget: acc.default_conversion_budget_type,
        non_conversion_budget: acc.default_non_conversion_budget_type,
        billing_event: acc.default_billing_event,
        main_markets: acc.main_markets
      })));

      const allAccounts = [...metaAccounts, ...tiktokAccounts];
      setAdAccounts(allAccounts);

      // Initialize local defaults
      const defaults: Record<string, Partial<AdAccount>> = {};
      allAccounts.forEach((acc) => {
        defaults[acc.id] = {
          platform: acc.platform,
          default_pixel_id: acc.default_pixel_id || null,
          default_page_id: acc.platform === 'meta' ? acc.default_page_id || null : null,
          default_instagram_account_id: acc.platform === 'meta' ? acc.default_instagram_account_id || null : null,
          default_catalog_id: acc.default_catalog_id || null,
          default_product_set_id: acc.default_product_set_id || null,
          default_conversion_event: acc.platform === 'meta' ? acc.default_conversion_event || null : null,
          default_conversion_budget_type: acc.default_conversion_budget_type || null,
          default_non_conversion_budget_type: acc.default_non_conversion_budget_type || null,
          default_bid_strategy: acc.default_bid_strategy || (acc.platform === 'meta' ? 'LOWEST_COST_WITHOUT_CAP' : 'LOWEST_COST'),
          default_bid_amount: (acc as any).default_bid_amount || null,
          default_identity_id: acc.platform === 'tiktok' ? acc.default_identity_id || null : null,
          // Billing event for both platforms
          default_billing_event: acc.platform === 'tiktok' 
            ? acc.default_billing_event || 'OCPM' 
            : (acc as any).default_billing_event || 'IMPRESSIONS',
          default_optimization_event: acc.platform === 'tiktok' ? acc.default_optimization_event || 'ON_WEB_ORDER' : null,
          // Landing page URL for both platforms
          default_landing_page_url: (acc as any).default_landing_page_url || null,
          // Optimization location for both platforms
          default_optimization_location: (acc as any).default_optimization_location || (acc.platform === 'meta' ? 'WEBSITE' : null),
          default_app_name: acc.platform === 'tiktok' ? (acc as any).default_app_name || null : null,
          default_app_id: (acc as any).default_app_id || null,
          default_frequency_schedule: acc.platform === 'tiktok' ? (acc as any).default_frequency_schedule || null : null,
          // Attribution windows for both platforms
          default_click_window: (acc as any).default_click_window || (acc.platform === 'meta' ? 7 : null),
          default_view_window: (acc as any).default_view_window || (acc.platform === 'meta' ? 1 : null),
          default_placement_type: acc.platform === 'tiktok' ? (acc as any).default_placement_type || 'PLACEMENT_TYPE_AUTOMATIC' : null,
          default_placements: acc.platform === 'tiktok' ? (acc as any).default_placements || ['PLACEMENT_TIKTOK', 'PLACEMENT_GLOBAL_APP_BUNDLE', 'PLACEMENT_PANGLE'] : null,
          // Meta-specific placements
          default_publisher_platforms: acc.platform === 'meta' ? (acc as any).default_publisher_platforms || ['facebook', 'instagram', 'audience_network'] : null,
          default_positions: acc.platform === 'meta' ? (acc as any).default_positions || {} : null,
          default_advantage_plus_placements: acc.platform === 'meta' ? (acc as any).default_advantage_plus_placements ?? true : null,
          main_markets: acc.main_markets,
          // Targeting defaults
          default_devices: (acc as any).default_devices || [],
          default_languages: Array.isArray((acc as any).default_languages) 
            ? normalizeLanguageValues((acc as any).default_languages as (string | number)[])
            : [],
          default_age_min: (acc as any).default_age_min ?? 18,
          default_age_max: (acc as any).default_age_max ?? 65,
          default_gender: (acc as any).default_gender || 'all',
          // Meta messaging/destination fields
          default_app_store: acc.platform === 'meta' ? (acc as any).default_app_store || null : null,
          default_messaging_mode: acc.platform === 'meta' ? (acc as any).default_messaging_mode || null : null,
          default_messenger_enabled: acc.platform === 'meta' ? (acc as any).default_messenger_enabled || false : null,
          default_instagram_dm_enabled: acc.platform === 'meta' ? (acc as any).default_instagram_dm_enabled || false : null,
          default_whatsapp_enabled: acc.platform === 'meta' ? (acc as any).default_whatsapp_enabled || false : null,
          default_whatsapp_number: (acc as any).default_whatsapp_number || null,
          // TikTok messaging fields
          default_messaging_app: acc.platform === 'tiktok' ? (acc as any).default_messaging_app || null : null,
          default_facebook_page_id: acc.platform === 'tiktok' ? (acc as any).default_facebook_page_id || null : null,
          default_message_event_set: acc.platform === 'tiktok' ? (acc as any).default_message_event_set || null : null,
          default_zalo_account_id: acc.platform === 'tiktok' ? (acc as any).default_zalo_account_id || null : null,
          default_line_business_id: acc.platform === 'tiktok' ? (acc as any).default_line_business_id || null : null,
        };
      });
      
      console.log("Local defaults initialized:", Object.entries(defaults).map(([id, def]) => ({
        id,
        platform: def.platform,
        pixel_id: def.default_pixel_id,
        identity_id: def.default_identity_id,
        catalog_id: def.default_catalog_id,
        product_set_id: def.default_product_set_id,
        conversion_budget: def.default_conversion_budget_type,
        non_conversion_budget: def.default_non_conversion_budget_type,
        billing_event: def.default_billing_event
      })));
      
      console.log("[AccountDefaultsTab] RAW localDefaults state:", defaults);
      
      setLocalDefaults(defaults);

      // Load all available resources
      const [pixelsRes, pagesRes, igRes, catalogsRes, productSetsRes, eventsRes, tiktokPixelsRes, tiktokIdentitiesRes, tiktokCatalogsRes, tiktokProductSetsRes, tiktokAppsRes] = await Promise.all([
        supabase.from("meta_pixels").select("id, ad_account_id, pixel_id, pixel_name").eq("user_id", userId),
        supabase.from("meta_pages").select("id, page_id, page_name").eq("user_id", userId),
        supabase.from("meta_instagram_accounts").select("id, instagram_account_id, username").eq("user_id", userId),
        supabase.from("meta_catalogs").select("id, catalog_id, catalog_name").eq("user_id", userId),
        supabase.from("meta_product_sets").select("id, catalog_id, product_set_id, product_set_name").eq("user_id", userId),
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

      setPixels(pixelsRes.data || []);
      setPages(pagesRes.data || []);
      setInstagramAccounts(igRes.data || []);
      setCatalogs(catalogsRes.data || []);
      setProductSets(productSetsRes.data || []);
      setConversionEvents(eventsRes.data || []);
      console.log("TikTok Pixels loaded:", tiktokPixelsRes.data?.length || 0, tiktokPixelsRes.data);
      console.log("TikTok Identities loaded:", tiktokIdentitiesRes.data?.length || 0, tiktokIdentitiesRes.data);
      console.log("TikTok Catalogs loaded:", tiktokCatalogsRes.data?.length || 0, tiktokCatalogsRes.data);
      console.log("TikTok Product Sets loaded:", tiktokProductSetsRes.data?.length || 0, tiktokProductSetsRes.data);
      console.log("TikTok Apps loaded:", tiktokAppsRes.data?.length || 0, tiktokAppsRes.data);
      setTiktokPixels(tiktokPixelsRes.data || []);
      setTiktokIdentities(tiktokIdentitiesRes.data || []);
      setTiktokCatalogs(tiktokCatalogsRes.data || []);
      setTiktokProductSets(tiktokProductSetsRes.data || []);
      setTiktokApps(tiktokAppsRes.data || []);
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error("Failed to load account defaults");
    } finally {
      setLoading(false);
    }
  };

  // Fetch TikTok events for an advertiser
  const fetchTiktokEvents = async (advertiserId: string, pixelId?: string) => {
    if (tiktokEvents[advertiserId]) return; // Already fetched
    
    setLoadingTiktokEvents(advertiserId);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-tiktok-events', {
        body: { advertiserId, pixelId }
      });
      
      if (error) throw error;
      
      if (data?.events) {
        setTiktokEvents(prev => ({
          ...prev,
          [advertiserId]: data.events
        }));
      }
    } catch (error) {
      console.error('Error fetching TikTok events:', error);
      // Set fallback events
      setTiktokEvents(prev => ({
        ...prev,
        [advertiserId]: [
          { id: "SubmitForm", name: "Submit Form" },
          { id: "CompletePayment", name: "Complete Payment" },
          { id: "PlaceAnOrder", name: "Place an Order" },
          { id: "Contact", name: "Contact" },
        ]
      }));
    } finally {
      setLoadingTiktokEvents(null);
    }
  };

  const handleSave = async (accountId: string) => {
    setSaving(accountId);
    try {
      const updates = localDefaults[accountId];
      const account = adAccounts.find(acc => acc.id === accountId);
      if (!account) {
        toast.error("Account not found");
        return;
      }
      
      // Debug: Log full updates object
      console.log(`[AccountDefaultsTab] Full updates object for ${account.account_name}:`, updates);
      console.log(`[AccountDefaultsTab] Pixel value in updates:`, updates?.default_pixel_id);
      
      const platform = account.platform;
      const tableName = platform === 'tiktok' ? 'tiktok_ad_accounts' : 'meta_ad_accounts';
      
      // Platform-specific field mapping
      const metaFields = [
        'default_pixel_id',
        'default_page_id',
        'default_instagram_account_id',
        'default_catalog_id',
        'default_product_set_id',
        'default_conversion_event',
        'default_conversion_budget_type',
        'default_non_conversion_budget_type',
        'default_bid_strategy',
        'default_billing_event',
        'default_landing_page_url',
        'default_optimization_location',
        'default_click_window',
        'default_view_window',
        'default_publisher_platforms',
        'default_positions',
        'default_advantage_plus_placements',
        'main_markets',
        'default_devices',
        'default_languages',
        'default_age_min',
        'default_age_max',
        'default_gender',
        // Meta destination-specific fields
        'default_app_store',
        'default_app_id',
        'default_whatsapp_number',
        'default_messaging_mode',
        'default_messenger_enabled',
        'default_instagram_dm_enabled',
        'default_whatsapp_enabled',
      ];
      
      const tiktokFields = [
        'default_pixel_id',
        'default_identity_id',
        'default_catalog_id',
        'default_product_set_id',
        'default_conversion_budget_type',
        'default_non_conversion_budget_type',
        'default_billing_event',
        'default_optimization_event',
        'default_landing_page_url',
        'default_bid_strategy',
        'default_bid_amount',
        'default_optimization_location',
        'default_app_name',
        'default_app_id',
        'default_frequency_enabled',
        'default_frequency_schedule',
        'default_click_window',
        'default_view_window',
        'default_event_count_enabled',
        'default_smart_plus_enabled',
        'default_search_enabled',
        'default_placement_type',
        'default_placements',
        'main_markets',
        'default_devices',
        'default_languages',
        'default_age_min',
        'default_age_max',
        'default_gender',
        // TikTok destination-specific fields
        'default_messaging_app',
        'default_facebook_page_id',
        'default_message_event_set',
        'default_whatsapp_number',
        'default_zalo_account_id',
        'default_line_business_id',
      ];
      
      const validFields = platform === 'tiktok' ? tiktokFields : metaFields;
      
      // Filter to only valid fields for this platform
      const updateData: Record<string, any> = {};
      validFields.forEach(field => {
        // Use hasOwnProperty to check if field exists (including null values)
        if (updates && Object.prototype.hasOwnProperty.call(updates, field)) {
          updateData[field] = updates[field as keyof typeof updates];
        }
      });
      
      // Ensure pixel is explicitly included for TikTok if it exists in updates
      if (platform === 'tiktok' && updates?.default_pixel_id !== undefined) {
        updateData.default_pixel_id = updates.default_pixel_id;
        console.log(`[AccountDefaultsTab] Explicitly setting TikTok pixel:`, updates.default_pixel_id);
      }
      
      console.log(`[AccountDefaultsTab] Saving ${platform} account ${accountId} defaults:`, updateData);
      console.log(`[AccountDefaultsTab] Update data keys:`, Object.keys(updateData));
      
      const { error, data } = await supabase
        .from(tableName)
        .update(updateData)
        .eq("id", accountId)
        .select();

      if (error) {
        console.error(`[AccountDefaultsTab] Save error for ${platform}:`, error);
        throw error;
      }
      
      console.log(`[AccountDefaultsTab] Successfully saved ${platform} defaults:`, data);
      
      // Verify the data was actually written by fetching it back
      const { data: verifyData, error: verifyError } = await supabase
        .from(tableName)
        .select('*')
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

  if (adAccounts.length === 0) {
    return (
      <Card className="p-8">
        <p className="text-muted-foreground text-center">
          No ad accounts synced for this client. Sync accounts in the Account Sync tab.
        </p>
      </Card>
    );
  }

  // Filter market options to only show markets defined for this client
  const activeClientMarkets = clientMarkets || fetchedClientMarkets;
  
  // For TikTok accounts, filter out US from available markets
  const getMarketOptions = (platform: 'meta' | 'tiktok') => {
    const baseOptions = platform === 'tiktok' ? TIKTOK_MARKET_OPTIONS : MARKET_OPTIONS;
    return baseOptions
      .filter(m => activeClientMarkets.includes(m.value))
      .map(m => ({ value: m.value, label: m.label }));
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
            <Button
              onClick={handleSaveClientTargeting}
              disabled={savingClientDefaults}
              size="sm"
            >
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
                onValueChange={(value) => setClientTargeting(prev => ({ ...prev, default_age_min: parseInt(value) }))}
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
                onValueChange={(value) => setClientTargeting(prev => ({ ...prev, default_age_max: parseInt(value) }))}
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
                onValueChange={(value) => setClientTargeting(prev => ({ ...prev, default_gender: value }))}
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
                onChange={(devices) => setClientTargeting(prev => ({ ...prev, default_devices: devices }))}
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
                onChange={(languages) => setClientTargeting(prev => ({ ...prev, default_languages: languages }))}
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
            defaults: defaults
          });
          const selectedCatalog = defaults.default_catalog_id;
          const catalogProductSets = productSets.filter(ps => ps.catalog_id === selectedCatalog);
          const selectedPixel = defaults.default_pixel_id;
          const pixelEvents = conversionEvents.filter(e => e.pixel_id === selectedPixel);

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
                          {account.platform === 'tiktok' ? 'TikTok' : 'Meta'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">ID: {account.account_id}</p>
                    </div>
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
                      {account.platform === 'meta' && (
                        <>
                          {/* Pixel */}
                          <div className="space-y-2">
                            <Label>Default Pixel</Label>
                            <Select
                              value={defaults.default_pixel_id || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_pixel_id", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select pixel" />
                              </SelectTrigger>
                              <SelectContent>
                                {pixels.length === 0 ? (
                                  <SelectItem value="none" disabled>No pixels available</SelectItem>
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
                              value={defaults.default_page_id || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_page_id", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select page" />
                              </SelectTrigger>
                              <SelectContent>
                                {pages.length === 0 ? (
                                  <SelectItem value="none" disabled>No pages available</SelectItem>
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
                              value={defaults.default_instagram_account_id || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_instagram_account_id", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select Instagram account" />
                              </SelectTrigger>
                              <SelectContent>
                                {instagramAccounts.length === 0 ? (
                                  <SelectItem value="none" disabled>No Instagram accounts available</SelectItem>
                                ) : (
                                  instagramAccounts.map((ig) => (
                                    <SelectItem key={ig.id} value={ig.instagram_account_id || ""}>
                                      @{ig.username}
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
                              value={defaults.default_catalog_id || undefined}
                              onValueChange={(value) => {
                                updateDefault(account.id, "default_catalog_id", value);
                                updateDefault(account.id, "default_product_set_id", null);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select catalog" />
                              </SelectTrigger>
                              <SelectContent>
                                {catalogs.length === 0 ? (
                                  <SelectItem value="none" disabled>No catalogs available</SelectItem>
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
                                    <SelectItem value="none" disabled>No product sets available</SelectItem>
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
                              disabled={!defaults.default_pixel_id}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select conversion event" />
                              </SelectTrigger>
                              <SelectContent>
                                {pixelEvents.map((event) => (
                                  <SelectItem key={event.id} value={event.event_name || ""}>
                                    {event.event_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Conversion Budget Type */}
                          <div className="space-y-2">
                            <Label>Conversion Budget Type</Label>
                            <Select
                              value={defaults.default_conversion_budget_type || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_conversion_budget_type", value)}
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
                              onValueChange={(value) => updateDefault(account.id, "default_non_conversion_budget_type", value)}
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

                          {/* Conversion Locations Section */}
                          <div className="space-y-2 md:col-span-2">
                            <Label className="text-base font-medium">Conversion Locations</Label>
                            <p className="text-xs text-muted-foreground mb-4">
                              Configure destination locations. When a campaign objective requires a specific location, it will auto-fill from here.
                            </p>
                            <ConversionLocationsSection
                              platform="meta"
                              accountId={account.id}
                              metaAdAccountId={account.account_id}
                              configuredLocations={extractMetaLocations(defaults)}
                              onSaveLocation={async (locationType, data) => {
                                const updates = metaLocationToDefaults(locationType, data);
                                for (const [key, value] of Object.entries(updates)) {
                                  await updateDefault(account.id, key as any, value);
                                }
                              }}
                              onDeleteLocation={async (locationType) => {
                                const fieldsToClear = getMetaLocationClearFields(locationType);
                                for (const field of fieldsToClear) {
                                  await updateDefault(account.id, field as any, null);
                                }
                              }}
                              pages={pages.filter(p => p.page_id).map(p => ({ page_id: p.page_id!, page_name: p.page_name! }))}
                              instagramAccounts={instagramAccounts.filter(i => i.instagram_account_id).map(i => ({ instagram_account_id: i.instagram_account_id!, username: i.username! }))}
                              saving={saving}
                            />
                          </div>

                          {/* Attribution Windows */}
                          <div className="space-y-2">
                            <Label>Click-Through Window (days)</Label>
                            <Select
                              value={String(defaults.default_click_window || 7)}
                              onValueChange={(value) => updateDefault(account.id, "default_click_window", parseInt(value))}
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
                            <p className="text-xs text-muted-foreground">
                              Attribution window for clicks
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label>View-Through Window (days)</Label>
                            <Select
                              value={String(defaults.default_view_window || 1)}
                              onValueChange={(value) => updateDefault(account.id, "default_view_window", parseInt(value))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select view window" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 day</SelectItem>
                                <SelectItem value="7">7 days</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Attribution window for views
                            </p>
                          </div>

                          {/* Advantage+ Placements Toggle */}
                          <div className="space-y-3 md:col-span-2">
                            <Label>Placement Strategy</Label>
                            <div className="space-y-2">
                              <div 
                                className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                                  (defaults as any).default_advantage_plus_placements !== false 
                                    ? 'bg-primary/10 border-primary' 
                                    : 'bg-background hover:bg-accent/50'
                                }`}
                                onClick={() => updateDefault(account.id, "default_advantage_plus_placements", true)}
                              >
                                <div className="flex items-center h-5 mt-0.5">
                                  <input 
                                    type="radio" 
                                    checked={(defaults as any).default_advantage_plus_placements !== false}
                                    onChange={() => updateDefault(account.id, "default_advantage_plus_placements", true)}
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
                                    ? 'bg-primary/10 border-primary' 
                                    : 'bg-background hover:bg-accent/50'
                                }`}
                                onClick={() => updateDefault(account.id, "default_advantage_plus_placements", false)}
                              >
                                <div className="flex items-center h-5 mt-0.5">
                                  <input 
                                    type="radio" 
                                    checked={(defaults as any).default_advantage_plus_placements === false}
                                    onChange={() => updateDefault(account.id, "default_advantage_plus_placements", false)}
                                    className="h-4 w-4"
                                  />
                                </div>
                                <div className="flex-1">
                                  <Label className="cursor-pointer font-medium">
                                    Manual placements
                                  </Label>
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
                                  value={defaults.default_publisher_platforms || ['facebook', 'instagram', 'audience_network']}
                                  onChange={(platforms) => {
                                    updateDefault(account.id, "default_publisher_platforms", platforms);
                                    // Update positions to remove unselected platforms
                                    const currentPositions = defaults.default_positions || {};
                                    const updatedPositions: Record<string, string[]> = {};
                                    platforms.forEach((p: string) => {
                                      if (currentPositions[p as keyof typeof currentPositions]) {
                                        updatedPositions[p] = currentPositions[p as keyof typeof currentPositions] as string[];
                                      }
                                    });
                                    updateDefault(account.id, "default_positions", updatedPositions);
                                  }}
                                  placeholder="Select publisher platforms"
                                  emptyText="No platforms selected"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Where your ads will be shown
                                </p>
                              </div>

                              {/* Placements for each publisher */}
                              {(defaults.default_publisher_platforms || ['facebook', 'instagram', 'audience_network']).includes('facebook') && (
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
                                        facebook: placements
                                      });
                                    }}
                                    placeholder="All placements (automatic)"
                                    emptyText="No placements selected"
                                  />
                                </div>
                              )}

                              {(defaults.default_publisher_platforms || ['facebook', 'instagram', 'audience_network']).includes('instagram') && (
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
                                        instagram: placements
                                      });
                                    }}
                                    placeholder="All placements (automatic)"
                                    emptyText="No placements selected"
                                  />
                                </div>
                              )}

                              {(defaults.default_publisher_platforms || ['facebook', 'instagram', 'audience_network']).includes('audience_network') && (
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
                                        audience_network: placements
                                      });
                                    }}
                                    placeholder="All placements (automatic)"
                                    emptyText="No placements selected"
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}

                      {/* TikTok-specific fields */}
                      {account.platform === 'tiktok' && (
                        <>
                          {/* TikTok Pixel */}
                          <div className="space-y-2">
                            <Label>Default TikTok Pixel</Label>
                            {(() => {
                              const accountPixels = tiktokPixels.filter(p => p.advertiser_id === account.advertiser_id);
                              const pixelValue = defaults.default_pixel_id || undefined;
                              console.log(`[TikTok Pixel Select] Account ${account.account_name} (${account.advertiser_id}):`, {
                                selectedValue: pixelValue,
                                availablePixels: accountPixels.map(p => ({ id: p.pixel_id, name: p.pixel_name })),
                                hasMatch: accountPixels.some(p => p.pixel_id === pixelValue),
                                allPixels: tiktokPixels.length,
                                filteredPixels: accountPixels.length
                              });
                              return null;
                            })()}
                            <Select
                              key={`pixel-${account.id}-${defaults.default_pixel_id || 'empty'}`}
                              value={defaults.default_pixel_id || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_pixel_id", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select TikTok pixel" />
                              </SelectTrigger>
                              <SelectContent>
                                {(() => {
                                  const accountPixels = tiktokPixels.filter(p => p.advertiser_id === account.advertiser_id);
                                  return accountPixels.length === 0 ? (
                                    <SelectItem value="none" disabled>No pixels available for this advertiser</SelectItem>
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
                              const accountIdentities = tiktokIdentities.filter(i => i.advertiser_id === account.advertiser_id);
                              const identityValue = defaults.default_identity_id || undefined;
                              console.log(`[TikTok Identity Select] Account ${account.account_name} (${account.advertiser_id}):`, {
                                selectedValue: identityValue,
                                availableIdentities: accountIdentities.map(i => ({ id: i.identity_id, name: i.identity_name })),
                                hasMatch: accountIdentities.some(i => i.identity_id === identityValue),
                                allIdentities: tiktokIdentities.length,
                                filteredIdentities: accountIdentities.length
                              });
                              return null;
                            })()}
                            <Select
                              key={`identity-${account.id}-${defaults.default_identity_id || 'empty'}`}
                              value={defaults.default_identity_id || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_identity_id", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select TikTok identity" />
                              </SelectTrigger>
                              <SelectContent>
                                {(() => {
                                  const accountIdentities = tiktokIdentities.filter(i => i.advertiser_id === account.advertiser_id);
                                  return accountIdentities.length === 0 ? (
                                    <SelectItem value="none" disabled>No identities available for this advertiser</SelectItem>
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
                              TikTok accounts must be shared as "assets" in your Business Center (not just linked). Go to Business Center → Assets → Add Asset → TikTok Account.
                            </p>
                          </div>

                          {/* TikTok Catalog */}
                          <div className="space-y-2">
                            <Label>Default TikTok Catalog</Label>
                            {(() => {
                              const accountCatalogs = tiktokCatalogs.filter(c => c.advertiser_id === account.advertiser_id);
                              const catalogValue = defaults.default_catalog_id || undefined;
                              console.log(`[TikTok Catalog Select] Account ${account.account_name} (${account.advertiser_id}):`, {
                                selectedValue: catalogValue,
                                availableCatalogs: accountCatalogs.map(c => ({ id: c.catalog_id, name: c.catalog_name })),
                                hasMatch: accountCatalogs.some(c => c.catalog_id === catalogValue),
                                allCatalogs: tiktokCatalogs.length,
                                filteredCatalogs: accountCatalogs.length
                              });
                              return null;
                            })()}
                            <Select
                              key={`catalog-${account.id}-${defaults.default_catalog_id || 'empty'}`}
                              value={defaults.default_catalog_id || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_catalog_id", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select TikTok catalog" />
                              </SelectTrigger>
                              <SelectContent>
                                {(() => {
                                  const accountCatalogs = tiktokCatalogs.filter(c => c.advertiser_id === account.advertiser_id);
                                  return accountCatalogs.length === 0 ? (
                                    <SelectItem value="none" disabled>No catalogs available for this advertiser</SelectItem>
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
                                key={`product-set-${account.id}-${defaults.default_product_set_id || 'empty'}`}
                                value={defaults.default_product_set_id || undefined}
                                onValueChange={(value) => updateDefault(account.id, "default_product_set_id", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select product set" />
                                </SelectTrigger>
                                <SelectContent>
                                  {tiktokProductSets
                                    .filter(ps => ps.catalog_id === defaults.default_catalog_id && ps.advertiser_id === account.advertiser_id)
                                    .map((ps) => (
                                      <SelectItem key={ps.product_set_id} value={ps.product_set_id}>
                                        {ps.product_set_name}
                                      </SelectItem>
                                    ))}
                                  {tiktokProductSets.filter(ps => ps.catalog_id === defaults.default_catalog_id && ps.advertiser_id === account.advertiser_id).length === 0 && (
                                    <SelectItem value="none" disabled>No product sets available</SelectItem>
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
                              key={`conv-budget-${account.id}-${defaults.default_conversion_budget_type || 'empty'}`}
                              value={defaults.default_conversion_budget_type || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_conversion_budget_type", value)}
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
                              key={`non-conv-budget-${account.id}-${defaults.default_non_conversion_budget_type || 'empty'}`}
                              value={defaults.default_non_conversion_budget_type || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_non_conversion_budget_type", value)}
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
                              key={`billing-event-${account.id}-${defaults.default_billing_event || 'empty'}`}
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
                              Maximum Delivery maximizes conversions within budget. Cost Cap targets a specific cost per result (bid amount set on phase level).
                            </p>
                          </div>

                          {/* TikTok Optimization Event */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Optimization Event
                            </Label>
                            <Select
                              key={`optimization-event-${account.id}-${defaults.default_optimization_event || 'empty'}`}
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
                              Conversion event to optimize for. Requires at least 90 days of historical data on the selected pixel.
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
                                  updateDefault(account.id, "default_placements", ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"]);
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
                                value={defaults.default_placements || ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"]}
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
                              Configure destination locations. When a campaign objective requires a specific location, it will auto-fill from here.
                            </p>
                            <ConversionLocationsSection
                              platform="tiktok"
                              accountId={account.id}
                              configuredLocations={extractTiktokLocations(defaults)}
                              onSaveLocation={async (locationType, data) => {
                                const updates = tiktokLocationToDefaults(locationType, data);
                                for (const [key, value] of Object.entries(updates)) {
                                  await updateDefault(account.id, key as any, value);
                                }
                              }}
                              onDeleteLocation={async (locationType) => {
                                const fieldsToClear = getTiktokLocationClearFields(locationType);
                                for (const field of fieldsToClear) {
                                  await updateDefault(account.id, field as any, null);
                                }
                              }}
                              tiktokApps={tiktokApps.filter(app => app.advertiser_id === account.advertiser_id)}
                              tiktokEvents={tiktokEvents[account.advertiser_id] || []}
                              saving={saving}
                            />
                          </div>

                          {/* Attribution Windows */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              Click-Through Window (days)
                            </Label>
                            <Select
                              value={defaults.default_click_window?.toString() || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_click_window", parseInt(value))}
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
                              Attribution window for clicks
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">TikTok</span>
                              View-Through Window (days)
                            </Label>
                            <Select
                              value={defaults.default_view_window?.toString() || undefined}
                              onValueChange={(value) => updateDefault(account.id, "default_view_window", parseInt(value))}
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
                              Attribution window for views
                            </p>
                          </div>

                        </>
                      )}
                    </div>

                    {/* Naming Taxonomy Section */}
                    <Separator className="my-6" />
                    <AccountTaxonomySection
                      adAccountId={account.id}
                      platform={account.platform}
                      userId={userId}
                    />

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        onClick={() => handleSave(account.id)}
                        disabled={saving === account.id}
                      >
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
    </div>
  );
}
