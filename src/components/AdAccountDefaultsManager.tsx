import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import ClientSelectionDialog from "./ClientSelectionDialog";

interface AdAccount {
  id: string;
  account_id: string;
  account_name: string;
  client_id?: string;
  default_pixel_id?: string;
  default_page_id?: string;
  default_instagram_account_id?: string;
  default_catalog_id?: string;
  default_product_set_id?: string;
  default_conversion_event?: string;
  default_conversion_budget_type?: string;
  default_non_conversion_budget_type?: string;
}

interface MetaResource {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  connectedPlatformId: string | null;
}

export default function AdAccountDefaultsManager({ open, onOpenChange, userId, connectedPlatformId }: Props) {
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [clients, setClients] = useState<MetaResource[]>([]);
  const [pixels, setPixels] = useState<MetaResource[]>([]);
  const [pages, setPages] = useState<MetaResource[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<MetaResource[]>([]);
  const [catalogs, setCatalogs] = useState<MetaResource[]>([]);
  const [productSets, setProductSets] = useState<MetaResource[]>([]);
  const [conversionEvents, setConversionEvents] = useState<MetaResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [localDefaults, setLocalDefaults] = useState<Record<string, Partial<AdAccount>>>({});
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (open && userId && connectedPlatformId) {
      loadData();
    }
  }, [open, userId, connectedPlatformId]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (!connectedPlatformId) return;

      const { data: linkedAccounts, error: linkedError } = await supabase
        .from("platform_accounts")
        .select("account_id")
        .eq("connected_platform_id", connectedPlatformId);

      if (linkedError) throw linkedError;
      
      const linkedAccountIds = linkedAccounts?.map(a => a.account_id) || [];

      const { data: accountsData, error: accountsError } = await supabase
        .from("meta_ad_accounts")
        .select("*")
        .eq("user_id", userId)
        .in("account_id", linkedAccountIds);

      if (accountsError) throw accountsError;
      setAdAccounts(accountsData || []);

      const defaults: Record<string, Partial<AdAccount>> = {};
      accountsData?.forEach((acc) => {
        defaults[acc.id] = {
          client_id: acc.client_id,
          default_pixel_id: acc.default_pixel_id,
          default_page_id: acc.default_page_id,
          default_instagram_account_id: acc.default_instagram_account_id,
          default_catalog_id: acc.default_catalog_id,
          default_product_set_id: acc.default_product_set_id,
          default_conversion_event: acc.default_conversion_event,
          default_conversion_budget_type: acc.default_conversion_budget_type,
          default_non_conversion_budget_type: acc.default_non_conversion_budget_type,
        };
      });
      setLocalDefaults(defaults);

      const [clientsRes, pixelsRes, pagesRes, igRes, catalogsRes, productSetsRes, eventsRes] = await Promise.all([
        supabase.from("clients").select("*").eq("user_id", userId),
        supabase.from("meta_pixels").select("pixel_id, pixel_name, ad_account_id").eq("user_id", userId),
        supabase.from("meta_pages_safe").select("page_id, page_name").eq("user_id", userId),
        supabase.from("meta_instagram_accounts").select("instagram_account_id, username").eq("user_id", userId),
        supabase.from("meta_catalogs").select("catalog_id, catalog_name").eq("user_id", userId),
        supabase.from("meta_product_sets").select("product_set_id, product_set_name, catalog_id").eq("user_id", userId),
        supabase.from("meta_conversion_events").select("event_name, pixel_id").eq("user_id", userId),
      ]);

      setClients((clientsRes.data || []).map((c) => ({ id: c.id, name: c.name })));
      setPixels((pixelsRes.data || []).map((p) => ({ id: p.pixel_id, name: p.pixel_name })));
      setPages((pagesRes.data || []).map((p) => ({ id: p.page_id, name: p.page_name })));
      setInstagramAccounts((igRes.data || []).map((ig) => ({ id: ig.instagram_account_id, name: ig.username })));
      setCatalogs((catalogsRes.data || []).map((c) => ({ id: c.catalog_id, name: c.catalog_name })));
      setProductSets((productSetsRes.data || []).map((ps) => ({ id: ps.product_set_id, name: ps.product_set_name })));
      
      const uniqueEvents = Array.from(new Set((eventsRes.data || []).map((e) => e.event_name)));
      setConversionEvents(uniqueEvents.map((name) => ({ id: name, name })));
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error("Failed to load ad account resources");
    } finally {
      setLoading(false);
    }
  };

  const updateDefault = (accountId: string, field: keyof AdAccount, value: string) => {
    setLocalDefaults((prev) => ({
      ...prev,
      [accountId]: {
        ...prev[accountId],
        [field]: value || undefined,
      },
    }));
  };

  const handleClientSelected = (clientId: string) => {
    if (currentAccountId) {
      updateDefault(currentAccountId, "client_id", clientId);
      loadData(); // Reload to get updated client list
    }
  };

  const handleUnlink = async (accountId: string) => {
    setUnlinking(accountId);
    try {
      if (!connectedPlatformId) return;

      const { error: unlinkError } = await supabase
        .from("platform_accounts")
        .delete()
        .eq("connected_platform_id", connectedPlatformId)
        .eq("account_id", accountId);

      if (unlinkError) throw unlinkError;

      const { error: clearError } = await supabase
        .from("meta_ad_accounts")
        .update({
          client_id: null,
          default_pixel_id: null,
          default_page_id: null,
          default_instagram_account_id: null,
          default_catalog_id: null,
          default_product_set_id: null,
          default_conversion_event: null,
        })
        .eq("account_id", accountId)
        .eq("user_id", userId);

      if (clearError) console.error("Error clearing defaults:", clearError);

      toast.success("Ad account unlinked successfully");
      await loadData();
    } catch (error: any) {
      console.error("Error unlinking account:", error);
      toast.error("Failed to unlink ad account");
    } finally {
      setUnlinking(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = Object.entries(localDefaults).map(([accountId, defaults]) => ({
        id: accountId,
        ...defaults,
      }));

      const missingClient = updates.find(u => !u.client_id);
      if (missingClient) {
        const account = adAccounts.find(a => a.id === missingClient.id);
        toast.error(`Please select a client for ${account?.account_name || 'all ad accounts'}`);
        setSaving(false);
        return;
      }

      for (const update of updates) {
        const { error } = await supabase
          .from("meta_ad_accounts")
          .update({
            client_id: update.client_id,
            default_pixel_id: update.default_pixel_id ?? null,
            default_page_id: update.default_page_id ?? null,
            default_instagram_account_id: update.default_instagram_account_id ?? null,
            default_catalog_id: update.default_catalog_id ?? null,
            default_product_set_id: update.default_product_set_id ?? null,
            default_conversion_event: update.default_conversion_event ?? null,
            default_conversion_budget_type: update.default_conversion_budget_type ?? null,
            default_non_conversion_budget_type: update.default_non_conversion_budget_type ?? null,
          })
          .eq("id", update.id);

        if (error) throw error;
      }

      toast.success("Default resources saved successfully");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving defaults:", error);
      toast.error("Failed to save default resources");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Set Default Resources per Ad Account</DialogTitle>
            <DialogDescription>
              Configure client and default resources for each ad account.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : adAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No ad accounts found. Please sync your Meta resources first.
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[50vh] pr-4">
                <div className="space-y-6">
                  {adAccounts.map((account) => {
                    const selectedClient = clients.find(c => c.id === localDefaults[account.id]?.client_id);
                    
                    return (
                      <div key={account.id} className="p-4 border rounded-lg space-y-4 bg-card">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-semibold text-lg">{account.account_name}</div>
                            <div className="text-xs text-muted-foreground">{account.account_id}</div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnlink(account.account_id)}
                            disabled={unlinking === account.account_id}
                            className="text-destructive hover:text-destructive"
                          >
                            {unlinking === account.account_id ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Unlinking...
                              </>
                            ) : (
                              "Unlink"
                            )}
                          </Button>
                        </div>

                        <div className="space-y-4">
                          <div className="flex gap-2">
                            <div className="flex-1 space-y-2">
                              <Label>
                                Client <span className="text-destructive">*</span>
                              </Label>
                              <Select
                                value={localDefaults[account.id]?.client_id || ""}
                                onValueChange={(val) => updateDefault(account.id, "client_id", val)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select client" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  {clients.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="pt-8">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  setCurrentAccountId(account.id);
                                  setClientDialogOpen(true);
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor={`pixel-${account.id}`}>Default Pixel</Label>
                              <Select
                                value={localDefaults[account.id]?.default_pixel_id || ""}
                                onValueChange={(val) => updateDefault(account.id, "default_pixel_id", val)}
                              >
                                <SelectTrigger id={`pixel-${account.id}`}>
                                  <SelectValue placeholder="Select pixel" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  {pixels.map((pixel) => (
                                    <SelectItem key={pixel.id} value={pixel.id}>
                                      {pixel.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`page-${account.id}`}>Default Page</Label>
                              <Select
                                value={localDefaults[account.id]?.default_page_id || ""}
                                onValueChange={(val) => updateDefault(account.id, "default_page_id", val)}
                              >
                                <SelectTrigger id={`page-${account.id}`}>
                                  <SelectValue placeholder="Select page" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  {pages.map((page) => (
                                    <SelectItem key={page.id} value={page.id}>
                                      {page.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`instagram-${account.id}`}>Default Instagram Account</Label>
                              <Select
                                value={localDefaults[account.id]?.default_instagram_account_id || ""}
                                onValueChange={(val) => updateDefault(account.id, "default_instagram_account_id", val)}
                              >
                                <SelectTrigger id={`instagram-${account.id}`}>
                                  <SelectValue placeholder="Select Instagram account" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  {instagramAccounts.map((ig) => (
                                    <SelectItem key={ig.id} value={ig.id}>
                                      {ig.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`catalog-${account.id}`}>Default Catalog</Label>
                              <Select
                                value={localDefaults[account.id]?.default_catalog_id || ""}
                                onValueChange={(val) => updateDefault(account.id, "default_catalog_id", val)}
                              >
                                <SelectTrigger id={`catalog-${account.id}`}>
                                  <SelectValue placeholder="Select catalog" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  {catalogs.map((catalog) => (
                                    <SelectItem key={catalog.id} value={catalog.id}>
                                      {catalog.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`product-set-${account.id}`}>Default Product Set</Label>
                              <Select
                                value={localDefaults[account.id]?.default_product_set_id || ""}
                                onValueChange={(val) => updateDefault(account.id, "default_product_set_id", val)}
                              >
                                <SelectTrigger id={`product-set-${account.id}`}>
                                  <SelectValue placeholder="Select product set" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  {productSets.map((productSet) => (
                                    <SelectItem key={productSet.id} value={productSet.id}>
                                      {productSet.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`conversion-event-${account.id}`}>Default Conversion Event</Label>
                              <Select
                                value={localDefaults[account.id]?.default_conversion_event || ""}
                                onValueChange={(val) => updateDefault(account.id, "default_conversion_event", val)}
                              >
                                <SelectTrigger id={`conversion-event-${account.id}`}>
                                  <SelectValue placeholder="Select conversion event" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  {conversionEvents.map((event) => (
                                    <SelectItem key={event.id} value={event.id}>
                                      {event.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`conversion-budget-${account.id}`}>Conversion Campaign Budget Type</Label>
                              <Select
                                value={localDefaults[account.id]?.default_conversion_budget_type || ""}
                                onValueChange={(val) => updateDefault(account.id, "default_conversion_budget_type", val)}
                              >
                                <SelectTrigger id={`conversion-budget-${account.id}`}>
                                  <SelectValue placeholder="Select budget type" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  <SelectItem value="daily">Daily Budget</SelectItem>
                                  <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`non-conversion-budget-${account.id}`}>Non-Conversion Campaign Budget Type</Label>
                              <Select
                                value={localDefaults[account.id]?.default_non_conversion_budget_type || ""}
                                onValueChange={(val) => updateDefault(account.id, "default_non_conversion_budget_type", val)}
                              >
                                <SelectTrigger id={`non-conversion-budget-${account.id}`}>
                                  <SelectValue placeholder="Select budget type" />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50">
                                  <SelectItem value="daily">Daily Budget</SelectItem>
                                  <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Defaults"
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ClientSelectionDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        onClientSelected={handleClientSelected}
        userId={userId}
      />
    </>
  );
}
