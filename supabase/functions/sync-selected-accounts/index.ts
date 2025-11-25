import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { selectedAccountIds, platformId } = await req.json();

    if (!Array.isArray(selectedAccountIds) || selectedAccountIds.length === 0) {
      throw new Error("No accounts selected");
    }

    if (!platformId) {
      throw new Error("Platform ID is required");
    }

    console.log(`Syncing ${selectedAccountIds.length} selected accounts for user ${user.id} from platform ${platformId}`);

    // Get the platform connection
    const { data: platform, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, platform_type, access_token, metadata")
      .eq("id", platformId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (platformError || !platform) {
      console.error("Platform lookup error:", platformError);
      throw new Error("Platform connection not found or inactive");
    }

    console.log(`Platform type: ${platform.platform_type}`);

    if (platform.platform_type === "tiktok") {
      // Handle TikTok account syncing
      const accountsToInsert: any[] = [];
      const advertiserIds = platform.metadata?.advertiser_ids || [];
      const accountsInfo = platform.metadata?.accounts || [];

      // Filter selected accounts
      const selectedAccounts = accountsInfo.filter((acc: any) => 
        selectedAccountIds.includes(acc.advertiser_id)
      );

      if (selectedAccounts.length === 0) {
        throw new Error("No matching TikTok accounts found");
      }

      // Prepare TikTok ad accounts for insertion
      selectedAccounts.forEach((account: any) => {
        accountsToInsert.push({
          user_id: user.id,
          account_id: account.advertiser_id,
          account_name: account.name,
          advertiser_id: account.advertiser_id,
          account_status: account.status,
          currency: account.currency,
          timezone: account.timezone,
          synced_at: new Date().toISOString(),
        });
      });

      // Delete existing TikTok accounts that we're about to sync (to update them)
      await supabase
        .from("tiktok_ad_accounts")
        .delete()
        .eq("user_id", user.id)
        .in("advertiser_id", selectedAccountIds);
      
      const { error: insertError } = await supabase
        .from("tiktok_ad_accounts")
        .insert(accountsToInsert);
      
      if (insertError) {
        console.error("TikTok insert error:", insertError);
        throw new Error("Failed to save selected TikTok accounts");
      }

      console.log(`Successfully synced ${accountsToInsert.length} TikTok advertiser accounts`);

      // Now sync TikTok resources (pixels, identities, catalogs) for each selected account
      const allTiktokPixels: any[] = [];
      const allTiktokIdentities: any[] = [];
      const allTiktokCatalogs: any[] = [];
      
      for (const advertiserId of selectedAccountIds) {
        try {
          console.log(`Fetching TikTok resources for advertiser: ${advertiserId}`);
          
          const baseUrl = 'https://business-api.tiktok.com/open_api/v1.3';
          
          // Fetch pixels
          try {
            const pixelsResponse = await fetch(
              `${baseUrl}/pixel/list/?advertiser_id=${advertiserId}`,
              {
                headers: {
                  'Access-Token': platform.access_token!,
                  'Content-Type': 'application/json',
                },
              }
            );
            const pixelsData = await pixelsResponse.json();
            
            if (pixelsData.code === 0 && pixelsData.data?.pixels) {
              pixelsData.data.pixels.forEach((pixel: any) => {
                allTiktokPixels.push({
                  user_id: user.id,
                  advertiser_id: advertiserId,
                  pixel_id: pixel.pixel_id,
                  pixel_name: pixel.pixel_name || pixel.pixel_id,
                });
              });
            }
          } catch (error) {
            console.error(`Error fetching TikTok pixels for ${advertiserId}:`, error);
          }

          // Fetch identities
          try {
            const identitiesResponse = await fetch(
              `${baseUrl}/identity/video/get/?advertiser_id=${advertiserId}`,
              {
                headers: {
                  'Access-Token': platform.access_token!,
                  'Content-Type': 'application/json',
                },
              }
            );
            const identitiesData = await identitiesResponse.json();
            
            if (identitiesData.code === 0 && identitiesData.data?.list) {
              identitiesData.data.list.forEach((identity: any) => {
                allTiktokIdentities.push({
                  user_id: user.id,
                  advertiser_id: advertiserId,
                  identity_id: identity.identity_id,
                  identity_name: identity.display_name || identity.identity_id,
                  identity_type: identity.identity_type,
                });
              });
            }
          } catch (error) {
            console.error(`Error fetching TikTok identities for ${advertiserId}:`, error);
          }

          // Fetch catalogs
          try {
            const catalogsResponse = await fetch(
              `${baseUrl}/catalog/list/?advertiser_id=${advertiserId}`,
              {
                headers: {
                  'Access-Token': platform.access_token!,
                  'Content-Type': 'application/json',
                },
              }
            );
            const catalogsData = await catalogsResponse.json();
            
            if (catalogsData.code === 0 && catalogsData.data?.catalogs) {
              catalogsData.data.catalogs.forEach((catalog: any) => {
                allTiktokCatalogs.push({
                  user_id: user.id,
                  advertiser_id: advertiserId,
                  catalog_id: catalog.catalog_id,
                  catalog_name: catalog.catalog_name || catalog.catalog_id,
                });
              });
            }
          } catch (error) {
            console.error(`Error fetching TikTok catalogs for ${advertiserId}:`, error);
          }
        } catch (error) {
          console.error(`Error syncing TikTok resources for ${advertiserId}:`, error);
        }
      }

      // Sync TikTok pixels
      if (allTiktokPixels.length > 0) {
        const pixelIdsToSync = allTiktokPixels.map(p => p.pixel_id);
        await supabase
          .from("tiktok_pixels")
          .delete()
          .eq("user_id", user.id)
          .in("pixel_id", pixelIdsToSync);
        
        const { error: pixelsError } = await supabase.from("tiktok_pixels").insert(allTiktokPixels);
        if (pixelsError) {
          console.error("Error inserting TikTok pixels:", pixelsError);
        }
      }

      // Sync TikTok identities
      if (allTiktokIdentities.length > 0) {
        const identityIdsToSync = allTiktokIdentities.map(i => i.identity_id);
        await supabase
          .from("tiktok_identities")
          .delete()
          .eq("user_id", user.id)
          .in("identity_id", identityIdsToSync);
        
        const { error: identitiesError } = await supabase.from("tiktok_identities").insert(allTiktokIdentities);
        if (identitiesError) {
          console.error("Error inserting TikTok identities:", identitiesError);
        }
      }

      // Sync TikTok catalogs
      if (allTiktokCatalogs.length > 0) {
        const catalogIdsToSync = allTiktokCatalogs.map(c => c.catalog_id);
        await supabase
          .from("tiktok_catalogs")
          .delete()
          .eq("user_id", user.id)
          .in("catalog_id", catalogIdsToSync);
        
        const { error: catalogsError } = await supabase.from("tiktok_catalogs").insert(allTiktokCatalogs);
        if (catalogsError) {
          console.error("Error inserting TikTok catalogs:", catalogsError);
        }
      }

      console.log(`TikTok resources synced: ${allTiktokPixels.length} pixels, ${allTiktokIdentities.length} identities, ${allTiktokCatalogs.length} catalogs`);

      return new Response(
        JSON.stringify({
          success: true,
          syncedCount: accountsToInsert.length,
          platform: "tiktok",
          resources: {
            pixels: allTiktokPixels.length,
            identities: allTiktokIdentities.length,
            catalogs: allTiktokCatalogs.length,
          }
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle Meta account syncing
    if (platform.platform_type !== "meta") {
      throw new Error("Unsupported platform type");
    }

    const accessToken = platform.access_token;
    const accountsToInsert: any[] = [];
    const allPixels: any[] = [];
    const allPages: any[] = [];
    const allInstagramAccounts: any[] = [];
    const allCatalogs: any[] = [];
    const allProductSets: any[] = [];
    const allConversionEvents: any[] = [];

    // Fetch details for each selected account
    for (const accountId of selectedAccountIds) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${accountId}?fields=id,name,account_status,currency,business&access_token=${accessToken}`
        );
        
        if (!response.ok) {
          console.error(`Failed to fetch account ${accountId}`);
          continue;
        }

        const accountData = await response.json();
        
        accountsToInsert.push({
          user_id: user.id,
          account_id: accountData.id,
          account_name: accountData.name,
          account_status: accountData.account_status,
          currency: accountData.currency,
        });

        // Fetch pixels for this account
        try {
          const pixelsResponse = await fetch(
            `https://graph.facebook.com/v21.0/${accountId}/adspixels?fields=id,name&access_token=${accessToken}`
          );
          const pixelsData = await pixelsResponse.json();
          if (pixelsData?.data) {
            pixelsData.data.forEach((pixel: any) => {
              allPixels.push({
                user_id: user.id,
                ad_account_id: accountData.id,
                pixel_id: pixel.id,
                pixel_name: pixel.name,
              });
            });
          }
        } catch (error) {
          console.error(`Error fetching pixels for ${accountId}:`, error);
        }

        // Fetch audiences (custom audiences)
        try {
          const audiencesResponse = await fetch(
            `https://graph.facebook.com/v21.0/${accountId}/customaudiences?fields=id,name,subtype&access_token=${accessToken}`
          );
          const audiencesData = await audiencesResponse.json();
          // Note: We don't have a table for audiences yet, but we're fetching them for future use
        } catch (error) {
          console.error(`Error fetching audiences for ${accountId}:`, error);
        }

        const businessId = accountData.business?.id;
        if (businessId) {
          // Fetch pages from business
          try {
            const [ownedPagesResponse, clientPagesResponse] = await Promise.all([
              fetch(`https://graph.facebook.com/v21.0/${businessId}/owned_pages?fields=id,name,instagram_business_account&access_token=${accessToken}`),
              fetch(`https://graph.facebook.com/v21.0/${businessId}/client_pages?fields=id,name,instagram_business_account&access_token=${accessToken}`),
            ]);

            const ownedPagesData = await ownedPagesResponse.json();
            const clientPagesData = await clientPagesResponse.json();

            const allPagesData = [
              ...(ownedPagesData?.data || []),
              ...(clientPagesData?.data || []),
            ];

            allPagesData.forEach((page: any) => {
              allPages.push({
                user_id: user.id,
                page_id: page.id,
                page_name: page.name,
              });

              // Extract Instagram accounts from pages
              if (page.instagram_business_account) {
                allInstagramAccounts.push({
                  user_id: user.id,
                  instagram_account_id: page.instagram_business_account.id,
                  username: page.instagram_business_account.username || page.name,
                });
              }
            });
          } catch (error) {
            console.error(`Error fetching pages for business ${businessId}:`, error);
          }

          // Fetch catalogs from business
          try {
            const [ownedCatalogsResponse, clientCatalogsResponse] = await Promise.all([
              fetch(`https://graph.facebook.com/v21.0/${businessId}/owned_product_catalogs?fields=id,name&access_token=${accessToken}`),
              fetch(`https://graph.facebook.com/v21.0/${businessId}/client_product_catalogs?fields=id,name&access_token=${accessToken}`),
            ]);

            const ownedCatalogsData = await ownedCatalogsResponse.json();
            const clientCatalogsData = await clientCatalogsResponse.json();

            const allCatalogsData = [
              ...(ownedCatalogsData?.data || []),
              ...(clientCatalogsData?.data || []),
            ];

            for (const catalog of allCatalogsData) {
              allCatalogs.push({
                user_id: user.id,
                catalog_id: catalog.id,
                catalog_name: catalog.name,
              });

              // Fetch product sets for each catalog
              try {
                const productSetsResponse = await fetch(
                  `https://graph.facebook.com/v21.0/${catalog.id}/product_sets?fields=id,name&access_token=${accessToken}`
                );
                const productSetsData = await productSetsResponse.json();

                if (productSetsData?.data) {
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
          } catch (error) {
            console.error(`Error fetching catalogs for business ${businessId}:`, error);
          }
        }

        // Fetch conversion events for pixels
        for (const pixel of allPixels.filter(p => p.ad_account_id === accountData.id)) {
          // Add standard events
          const standardEvents = [
            'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
            'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead', 'CompleteRegistration'
          ];

          standardEvents.forEach(eventName => {
            allConversionEvents.push({
              user_id: user.id,
              pixel_id: pixel.pixel_id,
              event_name: eventName,
              event_type: 'standard',
            });
          });

          // Fetch custom conversions
          try {
            const customConversionsResponse = await fetch(
              `https://graph.facebook.com/v21.0/${accountId}/customconversions?fields=name&access_token=${accessToken}`
            );
            const customConversionsData = await customConversionsResponse.json();

            if (customConversionsData?.data) {
              customConversionsData.data.forEach((customConversion: any) => {
                allConversionEvents.push({
                  user_id: user.id,
                  pixel_id: pixel.pixel_id,
                  event_name: customConversion.name,
                  event_type: 'custom',
                });
              });
            }
          } catch (error) {
            console.error(`Error fetching custom conversions for account ${accountId}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error fetching account ${accountId}:`, error);
      }
    }

    if (accountsToInsert.length === 0) {
      throw new Error("Failed to fetch any selected accounts");
    }

    // Delete only the accounts we're about to insert (to update them), keep others
    const accountIdsToSync = accountsToInsert.map(acc => acc.account_id);
    await supabase
      .from("meta_ad_accounts")
      .delete()
      .eq("user_id", user.id)
      .in("account_id", accountIdsToSync);
    
    const { error: insertError } = await supabase.from("meta_ad_accounts").insert(accountsToInsert);
    
    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Failed to save selected accounts");
    }

    // Sync pixels
    if (allPixels.length > 0) {
      const pixelIdsToSync = allPixels.map(p => p.pixel_id);
      await supabase
        .from("meta_pixels")
        .delete()
        .eq("user_id", user.id)
        .in("pixel_id", pixelIdsToSync);
      
      const { error: pixelsError } = await supabase.from("meta_pixels").insert(allPixels);
      if (pixelsError) {
        console.error("Error inserting pixels:", pixelsError);
      }
    }

    // Sync pages
    if (allPages.length > 0) {
      const pageIdsToSync = allPages.map(p => p.page_id);
      await supabase
        .from("meta_pages")
        .delete()
        .eq("user_id", user.id)
        .in("page_id", pageIdsToSync);
      
      const { error: pagesError } = await supabase.from("meta_pages").insert(allPages);
      if (pagesError) {
        console.error("Error inserting pages:", pagesError);
      }
    }

    // Sync Instagram accounts
    if (allInstagramAccounts.length > 0) {
      const igIdsToSync = allInstagramAccounts.map(ig => ig.instagram_account_id);
      await supabase
        .from("meta_instagram_accounts")
        .delete()
        .eq("user_id", user.id)
        .in("instagram_account_id", igIdsToSync);
      
      const { error: igError } = await supabase.from("meta_instagram_accounts").insert(allInstagramAccounts);
      if (igError) {
        console.error("Error inserting Instagram accounts:", igError);
      }
    }

    // Sync catalogs
    if (allCatalogs.length > 0) {
      const catalogIdsToSync = allCatalogs.map(c => c.catalog_id);
      await supabase
        .from("meta_catalogs")
        .delete()
        .eq("user_id", user.id)
        .in("catalog_id", catalogIdsToSync);
      
      const { error: catalogsError } = await supabase.from("meta_catalogs").insert(allCatalogs);
      if (catalogsError) {
        console.error("Error inserting catalogs:", catalogsError);
      }
    }

    // Sync product sets
    if (allProductSets.length > 0) {
      const productSetIdsToSync = allProductSets.map(ps => ps.product_set_id);
      await supabase
        .from("meta_product_sets")
        .delete()
        .eq("user_id", user.id)
        .in("product_set_id", productSetIdsToSync);
      
      const { error: productSetsError } = await supabase.from("meta_product_sets").insert(allProductSets);
      if (productSetsError) {
        console.error("Error inserting product sets:", productSetsError);
      }
    }

    // Sync conversion events
    if (allConversionEvents.length > 0) {
      // For conversion events, we need to delete by pixel_id and event_name combination
      const pixelIds = [...new Set(allConversionEvents.map(e => e.pixel_id))];
      await supabase
        .from("meta_conversion_events")
        .delete()
        .eq("user_id", user.id)
        .in("pixel_id", pixelIds);
      
      const { error: eventsError } = await supabase.from("meta_conversion_events").insert(allConversionEvents);
      if (eventsError) {
        console.error("Error inserting conversion events:", eventsError);
      }
    }

    console.log(`Successfully synced ${accountsToInsert.length} accounts with all resources`);
    console.log(`Synced: ${allPixels.length} pixels, ${allPages.length} pages, ${allInstagramAccounts.length} IG accounts, ${allCatalogs.length} catalogs, ${allProductSets.length} product sets, ${allConversionEvents.length} conversion events`);

    return new Response(
      JSON.stringify({
        success: true,
        syncedCount: accountsToInsert.length,
        resources: {
          pixels: allPixels.length,
          pages: allPages.length,
          instagramAccounts: allInstagramAccounts.length,
          catalogs: allCatalogs.length,
          productSets: allProductSets.length,
          conversionEvents: allConversionEvents.length,
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Sync selected accounts error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
