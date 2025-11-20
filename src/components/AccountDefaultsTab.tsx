import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { MARKET_OPTIONS } from "@/utils/markets";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface AdAccount {
  id: string;
  account_id: string;
  account_name: string;
  default_pixel_id?: string | null;
  default_page_id?: string | null;
  default_instagram_account_id?: string | null;
  default_catalog_id?: string | null;
  default_product_set_id?: string | null;
  default_conversion_event?: string | null;
  default_conversion_budget_type?: string | null;
  default_non_conversion_budget_type?: string | null;
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
}

interface Props {
  clientId: string;
  userId: string;
}

const BUDGET_TYPE_OPTIONS = [
  { value: "daily", label: "Daily Budget" },
  { value: "lifetime", label: "Lifetime Budget" },
];

export default function AccountDefaultsTab({ clientId, userId }: Props) {
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [pixels, setPixels] = useState<MetaResource[]>([]);
  const [pages, setPages] = useState<MetaResource[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<MetaResource[]>([]);
  const [catalogs, setCatalogs] = useState<MetaResource[]>([]);
  const [productSets, setProductSets] = useState<MetaResource[]>([]);
  const [conversionEvents, setConversionEvents] = useState<MetaResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [localDefaults, setLocalDefaults] = useState<Record<string, Partial<AdAccount>>>({});

  useEffect(() => {
    if (clientId && userId) {
      loadData();
    }
  }, [clientId, userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load ad accounts for this client
      const { data: accountsData, error: accountsError } = await supabase
        .from("meta_ad_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("client_id", clientId);

      if (accountsError) throw accountsError;
      
      // Type cast and set accounts
      const typedAccounts = (accountsData || []).map(acc => ({
        ...acc,
        main_markets: Array.isArray(acc.main_markets) ? acc.main_markets as string[] : []
      }));
      setAdAccounts(typedAccounts);

      // Initialize local defaults
      const defaults: Record<string, Partial<AdAccount>> = {};
      typedAccounts.forEach((acc) => {
        defaults[acc.id] = {
          default_pixel_id: acc.default_pixel_id,
          default_page_id: acc.default_page_id,
          default_instagram_account_id: acc.default_instagram_account_id,
          default_catalog_id: acc.default_catalog_id,
          default_product_set_id: acc.default_product_set_id,
          default_conversion_event: acc.default_conversion_event,
          default_conversion_budget_type: acc.default_conversion_budget_type,
          default_non_conversion_budget_type: acc.default_non_conversion_budget_type,
          main_markets: acc.main_markets,
        };
      });
      setLocalDefaults(defaults);

      // Load all available resources
      const [pixelsRes, pagesRes, igRes, catalogsRes, productSetsRes, eventsRes] = await Promise.all([
        supabase.from("meta_pixels").select("id, ad_account_id, pixel_id, pixel_name").eq("user_id", userId),
        supabase.from("meta_pages").select("id, page_id, page_name").eq("user_id", userId),
        supabase.from("meta_instagram_accounts").select("id, instagram_account_id, username").eq("user_id", userId),
        supabase.from("meta_catalogs").select("id, catalog_id, catalog_name").eq("user_id", userId),
        supabase.from("meta_product_sets").select("id, catalog_id, product_set_id, product_set_name").eq("user_id", userId),
        supabase.from("meta_conversion_events").select("id, pixel_id, event_name").eq("user_id", userId),
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
      const { error } = await supabase
        .from("meta_ad_accounts")
        .update(updates)
        .eq("id", accountId);

      if (error) throw error;
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

  const marketOptions = MARKET_OPTIONS.map(m => ({ value: m.value, label: m.label }));

  return (
    <div className="space-y-4">
      <Accordion type="single" collapsible className="space-y-4">
        {adAccounts.map((account) => {
          const defaults = localDefaults[account.id] || {};
          const accountPixels = pixels.filter(p => p.ad_account_id === account.account_id);
          const selectedCatalog = defaults.default_catalog_id;
          const catalogProductSets = productSets.filter(ps => ps.catalog_id === selectedCatalog);
          const selectedPixel = defaults.default_pixel_id;
          const pixelEvents = conversionEvents.filter(e => e.pixel_id === selectedPixel);

          return (
            <AccordionItem key={account.id} value={account.id}>
              <Card>
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="text-left">
                      <p className="font-semibold">{account.account_name}</p>
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
                        options={marketOptions}
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
                            {accountPixels.map((pixel) => (
                              <SelectItem key={pixel.id} value={pixel.pixel_id || ""}>
                                {pixel.pixel_name}
                              </SelectItem>
                            ))}
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
                            {pages.map((page) => (
                              <SelectItem key={page.id} value={page.page_id || ""}>
                                {page.page_name}
                              </SelectItem>
                            ))}
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
                            {instagramAccounts.map((ig) => (
                              <SelectItem key={ig.id} value={ig.instagram_account_id || ""}>
                                @{ig.username}
                              </SelectItem>
                            ))}
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
                            // Reset product set when catalog changes
                            updateDefault(account.id, "default_product_set_id", null);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select catalog" />
                          </SelectTrigger>
                          <SelectContent>
                            {catalogs.map((catalog) => (
                              <SelectItem key={catalog.id} value={catalog.catalog_id || ""}>
                                {catalog.catalog_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Product Set */}
                      <div className="space-y-2">
                        <Label>Default Product Set</Label>
                        <Select
                          value={defaults.default_product_set_id || undefined}
                          onValueChange={(value) => updateDefault(account.id, "default_product_set_id", value)}
                          disabled={!defaults.default_catalog_id}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select product set" />
                          </SelectTrigger>
                          <SelectContent>
                            {catalogProductSets.map((ps) => (
                              <SelectItem key={ps.id} value={ps.product_set_id || ""}>
                                {ps.product_set_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

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
                    </div>

                    <div className="flex justify-end pt-4">
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
