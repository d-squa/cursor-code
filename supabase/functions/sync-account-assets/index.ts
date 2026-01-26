import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { accountId, platform } = await req.json();

    if (!accountId) {
      throw new Error("Account ID is required");
    }

    if (platform !== "meta") {
      throw new Error("Only Meta account asset sync is currently supported");
    }

    console.log(`[SYNC-ACCOUNT-ASSETS] Starting asset sync for Meta account ${accountId}, user ${user.id}`);

    // Get user's active Meta platform connection
    const { data: platformData, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (platformError || !platformData) {
      console.error("[SYNC-ACCOUNT-ASSETS] Platform lookup error:", platformError);
      throw new Error("No active Meta platform connection found");
    }

    // Get access token from Vault (with fallback to database column)
    const accessToken = await getAccessToken(supabase, platformData.id, platformData.access_token);
    
    if (!accessToken) {
      throw new Error("Failed to retrieve access token");
    }

    // Fetch account details including business ID
    const accountResponse = await fetch(
      `https://graph.facebook.com/v21.0/${accountId}?fields=id,name,business&access_token=${accessToken}`
    );
    
    if (!accountResponse.ok) {
      const errorData = await accountResponse.json();
      console.error("[SYNC-ACCOUNT-ASSETS] Account fetch error:", errorData);
      throw new Error(`Failed to fetch account: ${errorData.error?.message || 'Unknown error'}`);
    }

    const accountData = await accountResponse.json();
    const businessId = accountData.business?.id;
    
    console.log(`[SYNC-ACCOUNT-ASSETS] Account ${accountId} belongs to business ${businessId || 'N/A'}`);

    const syncResults = {
      pixels: 0,
      pages: 0,
      instagramAccounts: 0,
      catalogs: 0,
      productSets: 0,
      conversionEvents: 0,
    };

    // 1. Fetch and sync pixels
    try {
      console.log(`[SYNC-ACCOUNT-ASSETS] Fetching pixels for ${accountId}...`);
      const pixelsResponse = await fetch(
        `https://graph.facebook.com/v21.0/${accountId}/adspixels?fields=id,name&limit=100&access_token=${accessToken}`
      );
      const pixelsData = await pixelsResponse.json();
      
      if (pixelsData?.data && pixelsData.data.length > 0) {
        const pixelsToInsert = pixelsData.data.map((pixel: any) => ({
          user_id: user.id,
          ad_account_id: accountData.id,
          pixel_id: pixel.id,
          pixel_name: pixel.name,
          synced_at: new Date().toISOString(),
        }));

        // Upsert pixels
        const pixelIds = pixelsToInsert.map((p: any) => p.pixel_id);
        await supabase
          .from("meta_pixels")
          .delete()
          .eq("user_id", user.id)
          .in("pixel_id", pixelIds);
        
        const { error: pixelsError } = await supabase.from("meta_pixels").insert(pixelsToInsert);
        if (pixelsError) {
          console.error("[SYNC-ACCOUNT-ASSETS] Error inserting pixels:", pixelsError);
        } else {
          syncResults.pixels = pixelsToInsert.length;
          console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.pixels} pixels`);
        }

        // Sync conversion events for each pixel
        for (const pixel of pixelsToInsert) {
          const standardEvents = [
            'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
            'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead', 'CompleteRegistration'
          ];

          const eventsToInsert = standardEvents.map(eventName => ({
            user_id: user.id,
            pixel_id: pixel.pixel_id,
            event_name: eventName,
            event_type: 'standard',
            synced_at: new Date().toISOString(),
          }));

          // Fetch custom conversions
          try {
            const customConversionsResponse = await fetch(
              `https://graph.facebook.com/v21.0/${accountId}/customconversions?fields=name&limit=100&access_token=${accessToken}`
            );
            const customConversionsData = await customConversionsResponse.json();

            if (customConversionsData?.data) {
              customConversionsData.data.forEach((customConversion: any) => {
                eventsToInsert.push({
                  user_id: user.id,
                  pixel_id: pixel.pixel_id,
                  event_name: customConversion.name,
                  event_type: 'custom',
                  synced_at: new Date().toISOString(),
                });
              });
            }
          } catch (error) {
            console.error(`[SYNC-ACCOUNT-ASSETS] Error fetching custom conversions:`, error);
          }

          // Upsert events
          await supabase
            .from("meta_conversion_events")
            .delete()
            .eq("user_id", user.id)
            .eq("pixel_id", pixel.pixel_id);
          
          const { error: eventsError } = await supabase.from("meta_conversion_events").insert(eventsToInsert);
          if (!eventsError) {
            syncResults.conversionEvents += eventsToInsert.length;
          }
        }
        console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.conversionEvents} conversion events`);
      }
    } catch (error) {
      console.error("[SYNC-ACCOUNT-ASSETS] Error fetching pixels:", error);
    }

    // 2. Fetch pages and Instagram accounts from business
    if (businessId) {
      try {
        console.log(`[SYNC-ACCOUNT-ASSETS] Fetching pages from business ${businessId}...`);
        const [ownedPagesResponse, clientPagesResponse] = await Promise.all([
          fetch(`https://graph.facebook.com/v21.0/${businessId}/owned_pages?fields=id,name,instagram_business_account{id,username}&limit=100&access_token=${accessToken}`),
          fetch(`https://graph.facebook.com/v21.0/${businessId}/client_pages?fields=id,name,instagram_business_account{id,username}&limit=100&access_token=${accessToken}`),
        ]);

        const ownedPagesData = await ownedPagesResponse.json();
        const clientPagesData = await clientPagesResponse.json();

        const allPagesData = [
          ...(ownedPagesData?.data || []),
          ...(clientPagesData?.data || []),
        ];

        if (allPagesData.length > 0) {
          const pagesToInsert = allPagesData.map((page: any) => ({
            user_id: user.id,
            page_id: page.id,
            page_name: page.name,
            synced_at: new Date().toISOString(),
          }));

          const instagramToInsert: any[] = [];
          allPagesData.forEach((page: any) => {
            if (page.instagram_business_account) {
              instagramToInsert.push({
                user_id: user.id,
                instagram_account_id: page.instagram_business_account.id,
                username: page.instagram_business_account.username || page.name,
                synced_at: new Date().toISOString(),
              });
            }
          });

          // Upsert pages
          const pageIds = pagesToInsert.map((p: any) => p.page_id);
          await supabase
            .from("meta_pages")
            .delete()
            .eq("user_id", user.id)
            .in("page_id", pageIds);
          
          const { error: pagesError } = await supabase.from("meta_pages").insert(pagesToInsert);
          if (!pagesError) {
            syncResults.pages = pagesToInsert.length;
            console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.pages} pages`);
          }

          // Upsert Instagram accounts
          if (instagramToInsert.length > 0) {
            const igIds = instagramToInsert.map((ig: any) => ig.instagram_account_id);
            await supabase
              .from("meta_instagram_accounts")
              .delete()
              .eq("user_id", user.id)
              .in("instagram_account_id", igIds);
            
            const { error: igError } = await supabase.from("meta_instagram_accounts").insert(instagramToInsert);
            if (!igError) {
              syncResults.instagramAccounts = instagramToInsert.length;
              console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.instagramAccounts} Instagram accounts`);
            }
          }
        }
      } catch (error) {
        console.error("[SYNC-ACCOUNT-ASSETS] Error fetching pages:", error);
      }

      // 3. Fetch catalogs from business
      try {
        console.log(`[SYNC-ACCOUNT-ASSETS] Fetching catalogs from business ${businessId}...`);
        const [ownedCatalogsResponse, clientCatalogsResponse] = await Promise.all([
          fetch(`https://graph.facebook.com/v21.0/${businessId}/owned_product_catalogs?fields=id,name&limit=100&access_token=${accessToken}`),
          fetch(`https://graph.facebook.com/v21.0/${businessId}/client_product_catalogs?fields=id,name&limit=100&access_token=${accessToken}`),
        ]);

        const ownedCatalogsData = await ownedCatalogsResponse.json();
        const clientCatalogsData = await clientCatalogsResponse.json();

        const allCatalogsData = [
          ...(ownedCatalogsData?.data || []),
          ...(clientCatalogsData?.data || []),
        ];

        if (allCatalogsData.length > 0) {
          const catalogsToInsert = allCatalogsData.map((catalog: any) => ({
            user_id: user.id,
            catalog_id: catalog.id,
            catalog_name: catalog.name,
            synced_at: new Date().toISOString(),
          }));

          // Upsert catalogs
          const catalogIds = catalogsToInsert.map((c: any) => c.catalog_id);
          await supabase
            .from("meta_catalogs")
            .delete()
            .eq("user_id", user.id)
            .in("catalog_id", catalogIds);
          
          const { error: catalogsError } = await supabase.from("meta_catalogs").insert(catalogsToInsert);
          if (!catalogsError) {
            syncResults.catalogs = catalogsToInsert.length;
            console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.catalogs} catalogs`);
          }

          // Fetch product sets for each catalog
          for (const catalog of allCatalogsData) {
            try {
              const productSetsResponse = await fetch(
                `https://graph.facebook.com/v21.0/${catalog.id}/product_sets?fields=id,name&limit=100&access_token=${accessToken}`
              );
              const productSetsData = await productSetsResponse.json();

              if (productSetsData?.data && productSetsData.data.length > 0) {
                const productSetsToInsert = productSetsData.data.map((productSet: any) => ({
                  user_id: user.id,
                  catalog_id: catalog.id,
                  product_set_id: productSet.id,
                  product_set_name: productSet.name,
                  synced_at: new Date().toISOString(),
                }));

                const productSetIds = productSetsToInsert.map((ps: any) => ps.product_set_id);
                await supabase
                  .from("meta_product_sets")
                  .delete()
                  .eq("user_id", user.id)
                  .in("product_set_id", productSetIds);
                
                const { error: psError } = await supabase.from("meta_product_sets").insert(productSetsToInsert);
                if (!psError) {
                  syncResults.productSets += productSetsToInsert.length;
                }
              }
            } catch (error) {
              console.error(`[SYNC-ACCOUNT-ASSETS] Error fetching product sets for catalog ${catalog.id}:`, error);
            }
          }
          console.log(`[SYNC-ACCOUNT-ASSETS] Synced ${syncResults.productSets} product sets`);
        }
      } catch (error) {
        console.error("[SYNC-ACCOUNT-ASSETS] Error fetching catalogs:", error);
      }
    } else {
      console.log(`[SYNC-ACCOUNT-ASSETS] No business ID found for account ${accountId}, skipping pages/catalogs`);
    }

    console.log(`[SYNC-ACCOUNT-ASSETS] ✓ Asset sync complete for ${accountId}:`, syncResults);

    return new Response(
      JSON.stringify({
        success: true,
        accountId,
        syncResults,
        message: `Synced ${syncResults.pixels} pixels, ${syncResults.pages} pages, ${syncResults.instagramAccounts} Instagram accounts, ${syncResults.catalogs} catalogs, ${syncResults.productSets} product sets, ${syncResults.conversionEvents} conversion events`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[SYNC-ACCOUNT-ASSETS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
