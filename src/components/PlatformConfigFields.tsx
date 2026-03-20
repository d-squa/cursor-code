import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface PlatformConfigFieldsProps {
  platformName: string;
  accountName?: string;
  accountId?: string;
  page?: string;
  pixel?: string;
  catalog?: string;
  productSet?: string;
  conversionEvent?: string;
  instagramAccount?: string;
  onUpdate: (field: string, value: string) => void;
  userId?: string;
  selectedAdAccountId?: string;
}

interface Resource {
  id: string;
  pixel_id?: string;
  pixel_name?: string;
  page_id?: string;
  page_name?: string;
  catalog_id?: string;
  catalog_name?: string;
  product_set_id?: string;
  product_set_name?: string;
  event_name?: string;
  instagram_account_id?: string;
  username?: string;
  identity_id?: string;
  identity_name?: string;
}

export function PlatformConfigFields({
  platformName,
  accountName,
  accountId,
  page,
  pixel,
  catalog,
  productSet,
  conversionEvent,
  instagramAccount,
  onUpdate,
  userId,
  selectedAdAccountId,
}: PlatformConfigFieldsProps) {
  const [loading, setLoading] = useState(false);
  const [pixels, setPixels] = useState<Resource[]>([]);
  const [pages, setPages] = useState<Resource[]>([]);
  const [catalogs, setCatalogs] = useState<Resource[]>([]);
  const [productSets, setProductSets] = useState<Resource[]>([]);
  const [conversionEvents, setConversionEvents] = useState<Resource[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<Resource[]>([]);
  const [tiktokPixels, setTiktokPixels] = useState<Resource[]>([]);
  const [tiktokIdentities, setTiktokIdentities] = useState<Resource[]>([]);
  const [tiktokCatalogs, setTiktokCatalogs] = useState<Resource[]>([]);
  const [tiktokProductSets, setTiktokProductSets] = useState<Resource[]>([]);
  const [googleMerchantCenters, setGoogleMerchantCenters] = useState<Array<{ id: string; merchantCenterId: string; merchantCenterName: string }>>([]);
  const [googleFeedLabels, setGoogleFeedLabels] = useState<Array<{ label: string; country: string }>>([]);
  const [googleAccount, setGoogleAccount] = useState<{ merchant_center_id?: string; feed_label?: string } | null>(null);

  useEffect(() => {
    if (userId && platformName.toLowerCase() === 'meta') {
      loadMetaResources();
    } else if (userId && platformName.toLowerCase() === 'tiktok' && selectedAdAccountId) {
      loadTiktokResources();
    } else if (userId && (platformName.toLowerCase() === 'google' || platformName.toLowerCase() === 'google_ads') && selectedAdAccountId) {
      loadGoogleAdsResources();
    }
  }, [userId, platformName, selectedAdAccountId]);

  const loadMetaResources = async () => {
    setLoading(true);
    try {
      const [pixelsRes, pagesRes, catalogsRes, productSetsRes, eventsRes, igRes] = await Promise.all([
        supabase.from("meta_pixels").select("*").eq("user_id", userId!),
        supabase.from("meta_pages").select("*").eq("user_id", userId!),
        supabase.from("meta_catalogs").select("*").eq("user_id", userId!),
        supabase.from("meta_product_sets").select("*").eq("user_id", userId!),
        supabase.from("meta_conversion_events").select("*").eq("user_id", userId!),
        supabase.from("meta_instagram_accounts").select("*").eq("user_id", userId!),
      ]);

      // Deduplicate resources by a key field
      const dedupeBy = <T,>(arr: T[], getKey: (item: T) => string): T[] => {
        const seen = new Set<string>();
        return arr.filter(item => {
          const key = getKey(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      setPixels(dedupeBy(pixelsRes.data || [], (p: any) => p.pixel_id || p.id));
      setPages(dedupeBy(pagesRes.data || [], (p: any) => p.page_id || p.id));
      setCatalogs(dedupeBy(catalogsRes.data || [], (c: any) => c.catalog_id || c.id));
      setProductSets(dedupeBy(productSetsRes.data || [], (ps: any) => ps.product_set_id || ps.id));
      setConversionEvents(dedupeBy(eventsRes.data || [], (e: any) => e.event_name || e.id));
      setInstagramAccounts(dedupeBy(igRes.data || [], (ig: any) => ig.instagram_account_id || ig.id));
    } catch (error) {
      console.error("Error loading Meta resources:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTiktokResources = async () => {
    setLoading(true);
    try {
      const [pixelsRes, identitiesRes, catalogsRes, productSetsRes] = await Promise.all([
        supabase.from("tiktok_pixels").select("*").eq("user_id", userId!).eq("advertiser_id", selectedAdAccountId!),
        supabase.from("tiktok_identities").select("*").eq("user_id", userId!).eq("advertiser_id", selectedAdAccountId!),
        supabase.from("tiktok_catalogs").select("*").eq("user_id", userId!).eq("advertiser_id", selectedAdAccountId!),
        supabase.from("tiktok_product_sets").select("*").eq("user_id", userId!).eq("advertiser_id", selectedAdAccountId!),
      ]);

      setTiktokPixels((pixelsRes.data || []).map(p => ({
        id: p.pixel_id,
        pixel_id: p.pixel_id,
        pixel_name: p.pixel_name,
      })));

      setTiktokIdentities((identitiesRes.data || []).map(i => ({
        id: i.identity_id,
        identity_id: i.identity_id,
        identity_name: i.identity_name,
      })));

      setTiktokCatalogs((catalogsRes.data || []).map(c => ({
        id: c.catalog_id,
        catalog_id: c.catalog_id,
        catalog_name: c.catalog_name,
      })));

      setTiktokProductSets((productSetsRes.data || []).map(ps => ({
        id: ps.product_set_id,
        product_set_id: ps.product_set_id,
        product_set_name: ps.product_set_name,
        catalog_id: ps.catalog_id,
      })));
      
      console.log("PlatformConfigFields - TikTok resources loaded:", {
        pixels: pixelsRes.data?.length || 0,
        identities: identitiesRes.data?.length || 0,
        catalogs: catalogsRes.data?.length || 0,
        productSets: productSetsRes.data?.length || 0,
        selectedAdAccountId
      });
    } catch (error) {
      console.error("Error loading TikTok resources:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadGoogleAdsResources = async () => {
    setLoading(true);
    try {
      // Fetch defaults from DB
      const { data, error } = await supabase
        .from("google_ad_accounts")
        .select("default_merchant_center_id, default_feed_label, customer_id")
        .eq("user_id", userId!)
        .eq("account_id", selectedAdAccountId!)
        .maybeSingle();

      if (error) throw error;
      setGoogleAccount(data ? { merchant_center_id: data.default_merchant_center_id || '', feed_label: data.default_feed_label || '' } : null);

      // Fetch Merchant Center links from Google Ads API
      if (data?.customer_id) {
        const { data: mcData, error: mcError } = await supabase.functions.invoke("fetch-google-merchant-centers", {
          body: { customerId: data.customer_id },
        });
        if (!mcError && mcData) {
          setGoogleMerchantCenters(mcData.merchantCenters || []);
          setGoogleFeedLabels(mcData.feedLabels || []);
        }
      }
    } catch (error) {
      console.error("Error loading Google Ads resources:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter product sets by selected catalog
  const filteredProductSets = productSets.filter(ps => ps.catalog_id === catalog);
  const filteredTiktokProductSets = tiktokProductSets.filter(ps => ps.catalog_id === catalog);
  
  // Filter conversion events by selected pixel
  const filteredConversionEvents = conversionEvents.filter(e => e.pixel_id === pixel);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Platform Resources</CardTitle>
        <CardDescription className="text-sm">Select default resources for {platformName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {platformName.toLowerCase() === 'meta' && (
          <>
            <div className="space-y-2">
              <Label>Default Pixel</Label>
              <Select value={pixel || "__none__"} onValueChange={(value) => onUpdate("pixel", value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pixel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {pixels.map((p) => (
                    <SelectItem key={p.id} value={p.pixel_id || ""}>
                      {p.pixel_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default Page</Label>
              <Select value={page || "__none__"} onValueChange={(value) => onUpdate("page", value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select page" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {pages.map((p) => (
                    <SelectItem key={p.id} value={p.page_id || ""}>
                      {p.page_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default Instagram Account</Label>
              <Select value={instagramAccount || "__none__"} onValueChange={(value) => onUpdate("instagramAccount", value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Instagram account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {instagramAccounts.map((ig) => (
                    <SelectItem key={ig.id} value={ig.instagram_account_id || ""}>
                      {ig.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default Catalog</Label>
              <Select value={catalog || "__none__"} onValueChange={(value) => {
                onUpdate("catalog", value === "__none__" ? "" : value);
                onUpdate("productSet", ""); // Reset product set when catalog changes
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select catalog" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {catalogs.map((c) => (
                    <SelectItem key={c.id} value={c.catalog_id || ""}>
                      {c.catalog_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default Product Set</Label>
              <Select 
                value={productSet || undefined} 
                onValueChange={(value) => onUpdate("productSet", value)}
                disabled={!catalog}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product set" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProductSets.map((ps) => (
                    <SelectItem key={ps.id} value={ps.product_set_id || ""}>
                      {ps.product_set_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default Conversion Event</Label>
              <Select 
                value={conversionEvent || undefined} 
                onValueChange={(value) => onUpdate("conversionEvent", value)}
                disabled={!pixel}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select conversion event" />
                </SelectTrigger>
                <SelectContent>
                  {filteredConversionEvents.map((e) => (
                    <SelectItem key={e.id} value={e.event_name || ""}>
                      {e.event_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {platformName.toLowerCase() === 'tiktok' && (
          <>
            <div className="space-y-2">
              <Label>Default TikTok Pixel</Label>
              <Select value={pixel || undefined} onValueChange={(value) => onUpdate("pixel", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select TikTok pixel" />
                </SelectTrigger>
                <SelectContent>
                  {tiktokPixels.length === 0 ? (
                    <SelectItem value="none" disabled>No pixels available</SelectItem>
                  ) : (
                    tiktokPixels.map((p) => (
                      <SelectItem key={p.id} value={p.pixel_id || ""}>
                        {p.pixel_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default TikTok Identity</Label>
              <Select value={instagramAccount || undefined} onValueChange={(value) => onUpdate("instagramAccount", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select TikTok identity" />
                </SelectTrigger>
                <SelectContent>
                  {tiktokIdentities.length === 0 ? (
                    <SelectItem value="none" disabled>No identities available</SelectItem>
                  ) : (
                    tiktokIdentities.map((i) => (
                      <SelectItem key={i.id} value={i.identity_id || ""}>
                        {i.identity_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default TikTok Catalog</Label>
              <Select value={catalog || undefined} onValueChange={(value) => {
                onUpdate("catalog", value);
                onUpdate("productSet", ""); // Reset product set when catalog changes
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select TikTok catalog" />
                </SelectTrigger>
                <SelectContent>
                  {tiktokCatalogs.length === 0 ? (
                    <SelectItem value="none" disabled>No catalogs available</SelectItem>
                  ) : (
                    tiktokCatalogs.map((c) => (
                      <SelectItem key={c.id} value={c.catalog_id || ""}>
                        {c.catalog_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default TikTok Product Set</Label>
              <Select 
                value={productSet || undefined} 
                onValueChange={(value) => onUpdate("productSet", value)}
                disabled={!catalog}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product set" />
                </SelectTrigger>
                <SelectContent>
                  {filteredTiktokProductSets.length === 0 ? (
                    <SelectItem value="none" disabled>
                      {catalog ? "No product sets available" : "Select a catalog first"}
                    </SelectItem>
                  ) : (
                    filteredTiktokProductSets.map((ps) => (
                      <SelectItem key={ps.id} value={ps.product_set_id || ""}>
                        {ps.product_set_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {(platformName.toLowerCase() === 'google' || platformName.toLowerCase() === 'google_ads') && (
          <>
            <div className="space-y-2">
              <Label>Merchant Center ID (Product Feed)</Label>
              <Select
                value={googleAccount?.merchant_center_id || undefined}
                onValueChange={(value) => onUpdate("merchantCenterId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Merchant Center" />
                </SelectTrigger>
                <SelectContent>
                  {googleMerchantCenters.length === 0 ? (
                    <SelectItem value="none" disabled>No Merchant Centers linked</SelectItem>
                  ) : (
                    googleMerchantCenters.map((mc) => (
                      <SelectItem key={mc.id} value={mc.merchantCenterId}>
                        {mc.merchantCenterName} ({mc.merchantCenterId})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Link your Google Merchant Center to enable product feeds for Shopping & PMax campaigns
              </p>
            </div>

            <div className="space-y-2">
              <Label>Feed Label</Label>
              <Select
                value={googleAccount?.feed_label || undefined}
                onValueChange={(value) => onUpdate("feedLabel", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select feed label" />
                </SelectTrigger>
                <SelectContent>
                  {googleFeedLabels.length === 0 ? (
                    <SelectItem value="none" disabled>No feed labels found</SelectItem>
                  ) : (
                    googleFeedLabels.map((fl) => (
                      <SelectItem key={fl.label} value={fl.label}>
                        {fl.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
