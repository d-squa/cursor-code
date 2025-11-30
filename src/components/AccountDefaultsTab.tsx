import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { MARKET_OPTIONS, TIKTOK_MARKET_OPTIONS } from "@/utils/markets";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
  main_markets?: string[] | null;
}

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [localDefaults, setLocalDefaults] = useState<Record<string, Partial<AdAccount>>>({});
  const [fetchedClientMarkets, setFetchedClientMarkets] = useState<string[]>([]);

  useEffect(() => {
    if (clientId && userId) {
      loadData();
    }
  }, [clientId, userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch client markets if not provided as prop
      if (!clientMarkets) {
        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .select("markets")
          .eq("id", clientId)
          .single();

        if (clientError) throw clientError;
        setFetchedClientMarkets(Array.isArray(clientData.markets) ? clientData.markets as string[] : []);
      }

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
          default_identity_id: acc.platform === 'tiktok' ? acc.default_identity_id || null : null,
          default_billing_event: acc.platform === 'tiktok' ? acc.default_billing_event || 'OCPM' : null,
          default_optimization_event: acc.platform === 'tiktok' ? acc.default_optimization_event || 'ON_WEB_ORDER' : null,
          default_landing_page_url: acc.platform === 'tiktok' ? acc.default_landing_page_url || null : null,
          main_markets: acc.main_markets,
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
      const [pixelsRes, pagesRes, igRes, catalogsRes, productSetsRes, eventsRes, tiktokPixelsRes, tiktokIdentitiesRes, tiktokCatalogsRes, tiktokProductSetsRes] = await Promise.all([
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
      setTiktokPixels(tiktokPixelsRes.data || []);
      setTiktokIdentities(tiktokIdentitiesRes.data || []);
      setTiktokCatalogs(tiktokCatalogsRes.data || []);
      setTiktokProductSets(tiktokProductSetsRes.data || []);
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error("Failed to load account defaults");
    } finally {
      setLoading(false);
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
        'main_markets'
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
        'main_markets'
      ];
      
      const validFields = platform === 'tiktok' ? tiktokFields : metaFields;
      
      // Filter to only valid fields for this platform
      const updateData: Record<string, any> = {};
      validFields.forEach(field => {
        if (field in updates) {
          updateData[field] = updates[field as keyof typeof updates];
        }
      });
      
      console.log(`[AccountDefaultsTab] Saving ${platform} account ${accountId} defaults:`, updateData);
      
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


  const updateDefault = (accountId: string, field: keyof AdAccount, value: any) => {
    setLocalDefaults((prev) => ({
      ...prev,
      [accountId]: {
        ...prev[accountId],
        [field]: value,
      },
    }));
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
    <div className="space-y-4">
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
                        </>
                      )}

                      {/* TikTok-specific fields */}
                      {account.platform === 'tiktok' && (
                        <>
                          {/* TikTok Pixel */}
                          <div className="space-y-2">
                            <Label>Default TikTok Pixel</Label>
                            {(() => {
                              const pixelValue = defaults.default_pixel_id || undefined;
                              console.log(`[TikTok Pixel Select] Account ${account.account_name}:`, {
                                selectedValue: pixelValue,
                                availablePixels: tiktokPixels.map(p => ({ id: p.pixel_id, name: p.pixel_name })),
                                hasMatch: tiktokPixels.some(p => p.pixel_id === pixelValue)
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
                                {tiktokPixels.length === 0 ? (
                                  <SelectItem value="none" disabled>No pixels available</SelectItem>
                                ) : (
                                  tiktokPixels.map((pixel) => (
                                    <SelectItem key={pixel.id} value={pixel.pixel_id}>
                                      {pixel.pixel_name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* TikTok Identity */}
                          <div className="space-y-2">
                            <Label>Default TikTok Identity</Label>
                            {(() => {
                              const identityValue = defaults.default_identity_id || undefined;
                              console.log(`[TikTok Identity Select] Account ${account.account_name}:`, {
                                selectedValue: identityValue,
                                availableIdentities: tiktokIdentities.map(i => ({ id: i.identity_id, name: i.identity_name })),
                                hasMatch: tiktokIdentities.some(i => i.identity_id === identityValue)
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
                                {tiktokIdentities.length === 0 ? (
                                  <SelectItem value="none" disabled>No identities available</SelectItem>
                                ) : (
                                  tiktokIdentities.map((identity) => (
                                    <SelectItem key={identity.id} value={identity.identity_id}>
                                      {identity.identity_name}
                                    </SelectItem>
                                  ))
                                )}
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
                              const catalogValue = defaults.default_catalog_id || undefined;
                              console.log(`[TikTok Catalog Select] Account ${account.account_name}:`, {
                                selectedValue: catalogValue,
                                availableCatalogs: tiktokCatalogs.map(c => ({ id: c.catalog_id, name: c.catalog_name })),
                                hasMatch: tiktokCatalogs.some(c => c.catalog_id === catalogValue)
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
                                {tiktokCatalogs.length === 0 ? (
                                  <SelectItem value="none" disabled>No catalogs available</SelectItem>
                                ) : (
                                  tiktokCatalogs.map((catalog) => (
                                    <SelectItem key={catalog.id} value={catalog.catalog_id}>
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
                        </>
                      )}
                    </div>

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
