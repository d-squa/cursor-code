import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken, storePageToken } from "../_shared/vault-helper.ts";

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

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    console.log("Starting sync for user:", user.id);

    // Get active Meta platform connection
    const { data: metaPlatform, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, business_manager_id")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .maybeSingle();

    if (platformError) {
      console.error("Platform query error:", platformError);
      return new Response(
        JSON.stringify({ error: "Failed to query platform connection" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (!metaPlatform) {
      console.log("No active Meta platform found for user:", user.id);
      // Check if any platforms exist at all
      const { data: allPlatforms } = await supabase
        .from("connected_platforms")
        .select("id, is_active, created_at")
        .eq("user_id", user.id)
        .eq("platform_type", "meta")
        .order("created_at", { ascending: false })
        .limit(5);
      
      console.log("All Meta platforms for user:", JSON.stringify(allPlatforms));
      
      return new Response(
        JSON.stringify({ error: "No active Meta platform connection found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    console.log("Found active Meta platform:", metaPlatform.id);

    // Get access token from Vault
    const accessToken = await getAccessToken(supabase, metaPlatform.id);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Platform access token not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }
    
    const businessManagerId = metaPlatform.business_manager_id;
    let syncResults = {
      adAccounts: 0,
      pages: 0,
      pixels: 0,
      catalogs: 0,
      productSets: 0,
      instagramAccounts: 0,
      conversionEvents: 0,
    };

    // 1. Sync Ad Accounts
    try {
      const allAdAccounts: any[] = [];
      
      if (businessManagerId) {
        // Fetch owned ad accounts
        const ownedUrl = `https://graph.facebook.com/v21.0/${businessManagerId}/owned_ad_accounts?fields=id,name,account_status,currency&limit=100&access_token=${accessToken}`;
        const ownedResponse = await fetch(ownedUrl);
        const ownedData = await ownedResponse.json();
        
        if (ownedData.data) {
          allAdAccounts.push(...ownedData.data);
          console.log(`Found ${ownedData.data.length} owned ad accounts`);
        }
        
        // Fetch client ad accounts (shared with business manager)
        const clientUrl = `https://graph.facebook.com/v21.0/${businessManagerId}/client_ad_accounts?fields=id,name,account_status,currency&limit=100&access_token=${accessToken}`;
        const clientResponse = await fetch(clientUrl);
        const clientData = await clientResponse.json();
        
        if (clientData.data) {
          allAdAccounts.push(...clientData.data);
          console.log(`Found ${clientData.data.length} client ad accounts`);
        }
      } else {
        // Fallback to user's ad accounts
        const meUrl = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${accessToken}`;
        const meResponse = await fetch(meUrl);
        const meData = await meResponse.json();
        
        if (meData.data) {
          allAdAccounts.push(...meData.data);
        }
      }

      if (allAdAccounts.length > 0) {
        const accountsToInsert = allAdAccounts.map((acc: any) => ({
          user_id: user.id,
          account_id: acc.id,
          account_name: acc.name,
          account_status: acc.account_status,
          currency: acc.currency,
        }));

        await supabase.from("meta_ad_accounts").delete().eq("user_id", user.id);
        const { error: insertError } = await supabase.from("meta_ad_accounts").insert(accountsToInsert);
        
        if (!insertError) {
          syncResults.adAccounts = accountsToInsert.length;
          console.log(`Synced ${syncResults.adAccounts} ad accounts total`);

          // Link ad accounts to the connected platform
          if (metaPlatform?.id) {
            console.log(`Linking ${accountsToInsert.length} ad accounts to platform ${metaPlatform.id}`);
            
            const platformAccountsToInsert = accountsToInsert.map((acc: any) => ({
              connected_platform_id: metaPlatform.id,
              account_id: acc.account_id,
              account_name: acc.account_name,
              account_type: "ad_account",
            }));

            // Delete existing links for this platform first
            await supabase
              .from("platform_accounts")
              .delete()
              .eq("connected_platform_id", metaPlatform.id);

            const { error: linkError } = await supabase
              .from("platform_accounts")
              .insert(platformAccountsToInsert);
            
            if (linkError) {
              console.error("Error linking ad accounts to platform:", linkError);
            } else {
              console.log(`Successfully linked ${platformAccountsToInsert.length} ad accounts to platform`);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error syncing ad accounts:", error);
    }

    // 2. Sync Pages and Instagram Accounts
    try {
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,category,access_token,instagram_business_account{id,username,name}&limit=100&access_token=${accessToken}`
      );
      const pagesData = await pagesResponse.json();

      if (pagesData.data && pagesData.data.length > 0) {
        const pagesToInsert = pagesData.data.map((page: any) => ({
          user_id: user.id,
          page_id: page.id,
          page_name: page.name,
          category: page.category,
          access_token: page.access_token,
        }));

        await supabase.from("meta_pages").delete().eq("user_id", user.id);
        const { error: pagesError } = await supabase.from("meta_pages").upsert(pagesToInsert, {
          onConflict: "user_id,page_id",
        });

        if (!pagesError) {
          syncResults.pages = pagesToInsert.length;
          console.log(`Synced ${syncResults.pages} pages`);
        }

        // Extract Instagram accounts (dedupe: multiple pages can reference the same IG account)
        const instagramAccountsRaw = pagesData.data
          .filter((page: any) => page.instagram_business_account)
          .map((page: any) => ({
            user_id: user.id,
            instagram_account_id: String(page.instagram_business_account.id),
            username: page.instagram_business_account.username || page.name || "Instagram",
            synced_at: new Date().toISOString(),
          }));
        const instagramAccounts = [
          ...new Map(instagramAccountsRaw.map((r) => [r.instagram_account_id, r])).values(),
        ];

        if (instagramAccounts.length > 0) {
          await supabase.from("meta_instagram_accounts").delete().eq("user_id", user.id);
          const { error: igError } = await supabase.from("meta_instagram_accounts").upsert(instagramAccounts, {
            onConflict: "user_id,instagram_account_id",
          });

          if (!igError) {
            syncResults.instagramAccounts = instagramAccounts.length;
            console.log(`Synced ${syncResults.instagramAccounts} Instagram accounts`);
          }
        }
      }
    } catch (error) {
      console.error("Error syncing pages:", error);
    }

    // 3. Sync Pixels (for each ad account)
    try {
      const { data: adAccounts } = await supabase
        .from("meta_ad_accounts")
        .select("account_id")
        .eq("user_id", user.id);

      if (adAccounts && adAccounts.length > 0) {
        const allPixels: any[] = [];

        for (const account of adAccounts) {
          try {
            const pixelsResponse = await fetch(
              `https://graph.facebook.com/v21.0/${account.account_id}/adspixels?fields=id,name&limit=100&access_token=${accessToken}`
            );
            const pixelsData = await pixelsResponse.json();

            if (pixelsData.data) {
              pixelsData.data.forEach((pixel: any) => {
                allPixels.push({
                  user_id: user.id,
                  ad_account_id: account.account_id,
                  pixel_id: pixel.id,
                  pixel_name: pixel.name,
                });
              });
            }
          } catch (error) {
            console.error(`Error fetching pixels for account ${account.account_id}:`, error);
          }
        }

        if (allPixels.length > 0) {
          await supabase.from("meta_pixels").delete().eq("user_id", user.id);
          const { error: pixelsError } = await supabase.from("meta_pixels").insert(allPixels);
          
          if (!pixelsError) {
            syncResults.pixels = allPixels.length;
            console.log(`Synced ${syncResults.pixels} pixels`);
          }
        }
      }
    } catch (error) {
      console.error("Error syncing pixels:", error);
    }

    // 4. Sync Catalogs
    try {
      const allCatalogs: any[] = [];
      const allProductSets: any[] = [];

      // Prefer fetching from the selected Business Manager if available
      if (businessManagerId) {
        console.log(`Fetching catalogs for business manager ${businessManagerId}`);
        try {
          // Try owned catalogs
          for (const edge of ["owned_product_catalogs", "client_product_catalogs", "product_catalogs"]) {
            try {
              const url = `https://graph.facebook.com/v21.0/${businessManagerId}/${edge}?fields=id,name&limit=100&access_token=${accessToken}`;
              const resp = await fetch(url);
              const json = await resp.json();
              if (json?.error) {
                console.error(`Error fetching ${edge} for BM ${businessManagerId}:`, json.error);
              }
              if (Array.isArray(json?.data)) {
                console.log(`Found ${json.data.length} catalogs via ${edge}`);
                json.data.forEach((catalog: any) => {
                  if (!allCatalogs.find(c => c.catalog_id === catalog.id)) {
                    allCatalogs.push({
                      user_id: user.id,
                      catalog_id: catalog.id,
                      catalog_name: catalog.name,
                    });
                  }
                });
              }
            } catch (e) {
              console.error(`Exception fetching ${edge} for BM ${businessManagerId}:`, e);
            }
          }
        } catch (e) {
          console.error("Failed BM-specific catalog fetch:", e);
        }
      }

      // Fallback: Fetch all accessible businesses and their catalogs
      if (allCatalogs.length === 0) {
        const businessesResp = await fetch(
          `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${accessToken}`
        );
        const businessesData = await businessesResp.json();
        console.log(`Found ${businessesData?.data?.length || 0} accessible businesses`);

        if (Array.isArray(businessesData?.data) && businessesData.data.length > 0) {
          for (const biz of businessesData.data) {
            console.log(`Fetching catalogs for business ${biz.id} (${biz.name})`);
            for (const edge of ["owned_product_catalogs", "client_product_catalogs", "product_catalogs"]) {
              try {
                const catalogsResp = await fetch(
                  `https://graph.facebook.com/v21.0/${biz.id}/${edge}?fields=id,name&limit=100&access_token=${accessToken}`
                );
                const catalogsData = await catalogsResp.json();
                if (catalogsData?.error) {
                  console.error(`Error fetching ${edge} for business ${biz.id}:`, catalogsData.error);
                } else if (Array.isArray(catalogsData?.data)) {
                  console.log(`Found ${catalogsData.data.length} catalogs via ${edge} for business ${biz.id}`);
                  catalogsData.data.forEach((catalog: any) => {
                    if (!allCatalogs.find(c => c.catalog_id === catalog.id)) {
                      allCatalogs.push({
                        user_id: user.id,
                        catalog_id: catalog.id,
                        catalog_name: catalog.name,
                      });
                    }
                  });
                }
              } catch (err) {
                console.error(`Error fetching ${edge} for business ${biz.id}:`, err);
              }
            }
          }
        }
      }

      // Also try fetching catalogs from ad accounts if still no catalogs found
      if (allCatalogs.length === 0) {
        console.log('No catalogs found from businesses, trying user ad accounts...');
        const { data: userAdAccounts } = await supabase
          .from("meta_ad_accounts")
          .select("account_id")
          .eq("user_id", user.id);
        if (userAdAccounts && userAdAccounts.length > 0) {
          for (const adAccount of userAdAccounts) {
            try {
              const catalogsResp = await fetch(
                `https://graph.facebook.com/v21.0/${adAccount.account_id}/product_catalogs?fields=id,name&limit=100&access_token=${accessToken}`
              );
              const catalogsData = await catalogsResp.json();
              if (Array.isArray(catalogsData?.data)) {
                console.log(`Found ${catalogsData.data.length} catalogs for ad account ${adAccount.account_id}`);
                catalogsData.data.forEach((catalog: any) => {
                  if (!allCatalogs.find(c => c.catalog_id === catalog.id)) {
                    allCatalogs.push({
                      user_id: user.id,
                      catalog_id: catalog.id,
                      catalog_name: catalog.name,
                    });
                  }
                });
              }
            } catch (err) {
              console.error(`Error fetching catalogs for ad account ${adAccount.account_id}:`, err);
            }
          }
        }
      }

      // Fetch product sets for all catalogs found
      if (allCatalogs.length > 0) {
        console.log(`Fetching product sets for ${allCatalogs.length} catalogs`);
        for (const catalog of allCatalogs) {
          try {
            const productSetsResponse = await fetch(
              `https://graph.facebook.com/v21.0/${catalog.catalog_id}/product_sets?fields=id,name&limit=100&access_token=${accessToken}`
            );
            const productSetsData = await productSetsResponse.json();
            if (Array.isArray(productSetsData?.data)) {
              console.log(`Found ${productSetsData.data.length} product sets for catalog ${catalog.catalog_id}`);
              productSetsData.data.forEach((productSet: any) => {
                allProductSets.push({
                  user_id: user.id,
                  catalog_id: catalog.catalog_id,
                  product_set_id: productSet.id,
                  product_set_name: productSet.name,
                });
              });
            }
          } catch (err) {
            console.error(`Error fetching product sets for catalog ${catalog.catalog_id}:`, err);
          }
        }
      }

      if (allCatalogs.length > 0) {
        await supabase.from("meta_catalogs").delete().eq("user_id", user.id);
        const { error: catalogsError } = await supabase.from("meta_catalogs").insert(allCatalogs);
        if (!catalogsError) {
          syncResults.catalogs = allCatalogs.length;
          console.log(`Synced ${syncResults.catalogs} catalogs`);
        }
      }

      if (allProductSets.length > 0) {
        await supabase.from("meta_product_sets").delete().eq("user_id", user.id);
        const { error: productSetsError } = await supabase.from("meta_product_sets").insert(allProductSets);
        if (!productSetsError) {
          syncResults.productSets = allProductSets.length;
          console.log(`Synced ${syncResults.productSets} product sets`);
        }
      }
    } catch (error) {
      console.error("Error syncing catalogs and product sets:", error);
    }

    // 5. Sync Conversion Events (standard + custom conversions)
    try {
      const { data: pixels } = await supabase
        .from("meta_pixels")
        .select("pixel_id")
        .eq("user_id", user.id);
      
      const { data: adAccounts } = await supabase
        .from("meta_ad_accounts")
        .select("account_id")
        .eq("user_id", user.id);

      const allEvents: any[] = [];

      // Add standard events for each pixel
      const standardEvents = [
        "PageView", "ViewContent", "Search", "AddToCart", "AddToWishlist",
        "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration"
      ];

      if (pixels && pixels.length > 0) {
        for (const pixel of pixels) {
          standardEvents.forEach(eventName => {
            allEvents.push({
              user_id: user.id,
              pixel_id: pixel.pixel_id,
              event_name: eventName,
              event_type: "standard",
            });
          });
        }
      }

      // Fetch custom conversions from ad accounts
      if (adAccounts && adAccounts.length > 0) {
        for (const account of adAccounts) {
          try {
            const customConversionsResponse = await fetch(
              `https://graph.facebook.com/v21.0/${account.account_id}/customconversions?fields=id,name,pixel{id}&limit=100&access_token=${accessToken}`
            );
            const customConversionsData = await customConversionsResponse.json();

            if (customConversionsData.data) {
              customConversionsData.data.forEach((conversion: any) => {
                // Only add if we have a pixel ID for this conversion
                const pixelId = conversion.pixel?.id;
                if (pixelId) {
                  allEvents.push({
                    user_id: user.id,
                    pixel_id: pixelId,
                    event_name: conversion.name,
                    event_type: "custom",
                  });
                }
              });
              console.log(`Found ${customConversionsData.data.length} custom conversions for account ${account.account_id}`);
            }
          } catch (error) {
            console.error(`Error fetching custom conversions for account ${account.account_id}:`, error);
          }
        }
      }

      if (allEvents.length > 0) {
        await supabase.from("meta_conversion_events").delete().eq("user_id", user.id);
        const { error: eventsError } = await supabase.from("meta_conversion_events").insert(allEvents);
        
        if (!eventsError) {
          syncResults.conversionEvents = allEvents.length;
          console.log(`Synced ${syncResults.conversionEvents} conversion events (standard + custom)`);
        }
      }
    } catch (error) {
      console.error("Error syncing conversion events:", error);
    }

    console.log("Sync completed:", syncResults);

    // Trigger benchmark sync in background
    try {
      const benchmarkUrl = `${supabaseUrl}/functions/v1/sync-campaign-benchmarks`;
      fetch(benchmarkUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authHeader.replace("Bearer ", "")}`,
          "Content-Type": "application/json"
        }
      }).catch(err => console.error("Background benchmark sync error:", err));
      console.log("Benchmark sync triggered in background");
    } catch (error) {
      console.error("Error triggering benchmark sync:", error);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: syncResults,
        message: "Meta resources synced successfully"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
