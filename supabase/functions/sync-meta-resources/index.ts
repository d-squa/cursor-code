import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

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
      .select("*")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .single();

    if (platformError || !metaPlatform) {
      console.log("No active Meta platform found");
      return new Response(
        JSON.stringify({ error: "No active Meta platform connection found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const accessToken = metaPlatform.access_token;
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
      let adAccountsUrl = businessManagerId
        ? `https://graph.facebook.com/v21.0/${businessManagerId}/owned_ad_accounts?fields=id,name,account_status,currency&limit=100&access_token=${accessToken}`
        : `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${accessToken}`;
      
      const adAccountsResponse = await fetch(adAccountsUrl);
      const adAccountsData = await adAccountsResponse.json();

      if (adAccountsData.data && adAccountsData.data.length > 0) {
        const accountsToInsert = adAccountsData.data.map((acc: any) => ({
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
          console.log(`Synced ${syncResults.adAccounts} ad accounts`);
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
        const { error: pagesError } = await supabase.from("meta_pages").insert(pagesToInsert);
        
        if (!pagesError) {
          syncResults.pages = pagesToInsert.length;
          console.log(`Synced ${syncResults.pages} pages`);
        }

        // Extract Instagram accounts
        const instagramAccounts = pagesData.data
          .filter((page: any) => page.instagram_business_account)
          .map((page: any) => ({
            user_id: user.id,
            instagram_account_id: page.instagram_business_account.id,
            username: page.instagram_business_account.username,
          }));

        if (instagramAccounts.length > 0) {
          await supabase.from("meta_instagram_accounts").delete().eq("user_id", user.id);
          const { error: igError } = await supabase.from("meta_instagram_accounts").insert(instagramAccounts);
          
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
      const { data: adAccounts } = await supabase
        .from("meta_ad_accounts")
        .select("account_id")
        .eq("user_id", user.id);

      const allCatalogs: any[] = [];
      const allProductSets: any[] = [];

      if (adAccounts && adAccounts.length > 0) {
        for (const account of adAccounts) {
          try {
            // Fetch catalogs from ad account
            const catalogsResponse = await fetch(
              `https://graph.facebook.com/v21.0/${account.account_id}/product_catalogs?fields=id,name&limit=100&access_token=${accessToken}`
            );
            const catalogsData = await catalogsResponse.json();

            if (catalogsData.data) {
              catalogsData.data.forEach((catalog: any) => {
                // Avoid duplicates
                if (!allCatalogs.find(c => c.catalog_id === catalog.id)) {
                  allCatalogs.push({
                    user_id: user.id,
                    catalog_id: catalog.id,
                    catalog_name: catalog.name,
                  });
                }
              });

              // Fetch product sets for each catalog
              for (const catalog of catalogsData.data) {
                try {
                  const productSetsResponse = await fetch(
                    `https://graph.facebook.com/v21.0/${catalog.id}/product_sets?fields=id,name&limit=100&access_token=${accessToken}`
                  );
                  const productSetsData = await productSetsResponse.json();

                  if (productSetsData.data) {
                    productSetsData.data.forEach((productSet: any) => {
                      allProductSets.push({
                        user_id: user.id,
                        catalog_id: catalog.id,
                        product_set_id: productSet.id,
                        product_set_name: productSet.name,
                      });
                    });
                  }
                } catch (error) {
                  console.error(`Error fetching product sets for catalog ${catalog.id}:`, error);
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching catalogs for account ${account.account_id}:`, error);
          }
        }
      }

      // Try business endpoint as fallback
      try {
        const catalogsResponse = await fetch(
          `https://graph.facebook.com/v21.0/me/businesses?fields=owned_product_catalogs{id,name}&access_token=${accessToken}`
        );
        const catalogsData = await catalogsResponse.json();

        if (catalogsData.data) {
          catalogsData.data.forEach((business: any) => {
            if (business.owned_product_catalogs?.data) {
              business.owned_product_catalogs.data.forEach((catalog: any) => {
                if (!allCatalogs.find(c => c.catalog_id === catalog.id)) {
                  allCatalogs.push({
                    user_id: user.id,
                    catalog_id: catalog.id,
                    catalog_name: catalog.name,
                  });
                }
              });
            }
          });
        }
      } catch (error) {
        console.log("Business endpoint not accessible, using ad account catalogs only");
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

    // 5. Sync Conversion Events (for each pixel)
    try {
      const { data: pixels } = await supabase
        .from("meta_pixels")
        .select("pixel_id")
        .eq("user_id", user.id);

      if (pixels && pixels.length > 0) {
        const allEvents: any[] = [];

        // Add standard events
        const standardEvents = [
          "PageView", "ViewContent", "Search", "AddToCart", "AddToWishlist",
          "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration"
        ];

        for (const pixel of pixels) {
          // Add standard events
          standardEvents.forEach(eventName => {
            allEvents.push({
              user_id: user.id,
              pixel_id: pixel.pixel_id,
              event_name: eventName,
              event_type: "standard",
            });
          });

          // Fetch custom events
          try {
            const eventsResponse = await fetch(
              `https://graph.facebook.com/v21.0/${pixel.pixel_id}?fields=id,name&access_token=${accessToken}`
            );
            const eventsData = await eventsResponse.json();

            // Note: Custom events are typically managed via Events Manager
            // This is a placeholder for custom event fetching
          } catch (error) {
            console.error(`Error fetching events for pixel ${pixel.pixel_id}:`, error);
          }
        }

        if (allEvents.length > 0) {
          await supabase.from("meta_conversion_events").delete().eq("user_id", user.id);
          const { error: eventsError } = await supabase.from("meta_conversion_events").insert(allEvents);
          
          if (!eventsError) {
            syncResults.conversionEvents = allEvents.length;
            console.log(`Synced ${syncResults.conversionEvents} conversion events`);
          }
        }
      }
    } catch (error) {
      console.error("Error syncing conversion events:", error);
    }

    console.log("Sync completed:", syncResults);

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
