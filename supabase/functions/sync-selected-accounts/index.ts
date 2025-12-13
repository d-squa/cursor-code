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

    // Get access token from Vault (with fallback to database column)
    const accessToken = await getAccessToken(supabase, platformId, platform.access_token);
    
    if (!accessToken) {
      throw new Error("Failed to retrieve access token for platform");
    }
    
    console.log(`Access token retrieved successfully for platform ${platformId}`);

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

      // Update connected_platforms with the first selected advertiser ID as default ad_account_id
      if (selectedAccountIds.length > 0) {
        const defaultAdAccountId = selectedAccountIds[0];
        const defaultAccount = selectedAccounts.find((acc: any) => acc.advertiser_id === defaultAdAccountId);
        
        const { error: updateError } = await supabase
          .from("connected_platforms")
          .update({
            ad_account_id: defaultAdAccountId,
            ad_account_name: defaultAccount?.name || `Advertiser ${defaultAdAccountId}`,
          })
          .eq("id", platformId)
          .eq("user_id", user.id);
        
        if (updateError) {
          console.error("Error updating connected_platforms with ad_account_id:", updateError);
        } else {
          console.log(`Updated connected_platforms with default ad_account_id: ${defaultAdAccountId}`);
        }
      }

      // Now sync TikTok resources (pixels, identities, catalogs) for each selected account
      const allTiktokPixels: any[] = [];
      const allTiktokIdentities: any[] = [];
      const allTiktokCatalogs: any[] = [];
      
      // Get bc_ids from the accounts metadata stored in connected_platforms
      const bcIds = new Set<string>();
      const advertiserToBcMap = new Map<string, string>();
      
      // Extract bc_ids from platform metadata
      const platformMetadata = platform.metadata as any;
      console.log('Platform metadata:', JSON.stringify(platformMetadata, null, 2));
      
      if (platformMetadata?.accounts) {
        console.log(`Checking ${platformMetadata.accounts.length} accounts for bc_ids`);
        for (const account of platformMetadata.accounts) {
          console.log(`Account ${account.advertiser_id} has bc_id: ${account.bc_id}`);
          if (selectedAccountIds.includes(account.advertiser_id) && account.bc_id) {
            bcIds.add(account.bc_id);
            advertiserToBcMap.set(account.advertiser_id, account.bc_id);
          }
        }
      } else {
        console.log('No accounts found in platform metadata');
      }
      
      console.log(`Found ${bcIds.size} unique Business Centers for ${selectedAccountIds.length} advertisers`);
      console.log('BC IDs:', Array.from(bcIds));
      console.log('Advertiser to BC mapping:', Object.fromEntries(advertiserToBcMap));
      
      const baseUrl = 'https://business-api.tiktok.com/open_api/v1.3';
      
      // Fetch BC-level assets for each business center
      for (const bcId of bcIds) {
        try {
          console.log(`Fetching Business Center assets for BC: ${bcId}`);
          
          // Fetch TikTok Identities (BC-level asset - use TT_ACCOUNT not IDENTITY)
          try {
            const identitiesResponse = await fetch(
              `${baseUrl}/bc/asset/get/?bc_id=${bcId}&asset_type=TT_ACCOUNT`,
              {
                headers: {
                  'Access-Token': accessToken,
                  'Content-Type': 'application/json',
                },
              }
            );
            
            if (identitiesResponse.ok) {
              const contentType = identitiesResponse.headers.get('content-type');
              if (contentType?.includes('application/json')) {
                const identitiesData = await identitiesResponse.json();
                console.log(`BC ${bcId} TT_ACCOUNT response:`, identitiesData);
                
                if (identitiesData.code === 0 && identitiesData.data?.list) {
                  // Associate identities with all advertisers in this BC
                  const advertisersInBc = selectedAccountIds.filter(
                    id => advertiserToBcMap.get(id) === bcId
                  );
                  
                  identitiesData.data.list.forEach((identity: any) => {
                    advertisersInBc.forEach((advertiserId: string) => {
                      allTiktokIdentities.push({
                        user_id: user.id,
                        advertiser_id: advertiserId,
                        identity_id: identity.asset_id,
                        identity_name: identity.asset_name || `TikTok Account ${identity.asset_id}`,
                        identity_type: identity.asset_type || 'TT_ACCOUNT',
                      });
                    });
                  });
                  console.log(`Found ${identitiesData.data.list.length} TT_ACCOUNT identities for BC ${bcId}`);
                }
              }
            } else {
              console.log(`BC TT_ACCOUNT fetch returned ${identitiesResponse.status} for BC ${bcId}`);
            }
          } catch (error) {
            console.error(`Error fetching BC TT_ACCOUNT identities for ${bcId}:`, error);
          }

          // Fetch TikTok Catalogs (BC-level asset)
          try {
            const catalogsResponse = await fetch(
              `${baseUrl}/bc/asset/get/?bc_id=${bcId}&asset_type=CATALOG`,
              {
                headers: {
                  'Access-Token': accessToken,
                  'Content-Type': 'application/json',
                },
              }
            );
            
            if (catalogsResponse.ok) {
              const contentType = catalogsResponse.headers.get('content-type');
              if (contentType?.includes('application/json')) {
                const catalogsData = await catalogsResponse.json();
                console.log(`BC ${bcId} catalogs response:`, catalogsData);
                
                if (catalogsData.code === 0 && catalogsData.data?.list) {
                  // Associate catalogs with all advertisers in this BC
                  const advertisersInBc = selectedAccountIds.filter(
                    id => advertiserToBcMap.get(id) === bcId
                  );
                  
                  catalogsData.data.list.forEach((catalog: any) => {
                    advertisersInBc.forEach((advertiserId: string) => {
                      allTiktokCatalogs.push({
                        user_id: user.id,
                        advertiser_id: advertiserId,
                        catalog_id: catalog.asset_id || catalog.catalog_id || catalog.id,
                        catalog_name: catalog.asset_name || catalog.name || catalog.catalog_name || `Catalog ${catalog.asset_id || catalog.catalog_id || catalog.id}`,
                      });
                    });
                  });
                  console.log(`Found ${catalogsData.data.list.length} catalogs for BC ${bcId}`);
                }
              }
            } else {
              console.log(`BC catalogs fetch returned ${catalogsResponse.status} for BC ${bcId}`);
            }
          } catch (error) {
            console.error(`Error fetching BC catalogs for ${bcId}:`, error);
          }
        } catch (error) {
          console.error(`Error fetching BC assets for ${bcId}:`, error);
        }
      }
      
      // Fetch advertiser-level pixels for each advertiser
      for (const advertiserId of selectedAccountIds) {
        try {
          console.log(`Fetching advertiser-level pixels for: ${advertiserId}`);
          
          const pixelsResponse = await fetch(
            `${baseUrl}/pixel/list/?advertiser_id=${advertiserId}`,
            {
              headers: {
                'Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (pixelsResponse.ok) {
            const contentType = pixelsResponse.headers.get('content-type');
            if (contentType?.includes('application/json')) {
              const pixelsData = await pixelsResponse.json();
              console.log(`Advertiser ${advertiserId} pixels response:`, pixelsData);
              
              if (pixelsData.code === 0 && pixelsData.data?.pixels) {
                pixelsData.data.pixels.forEach((pixel: any) => {
                  allTiktokPixels.push({
                    user_id: user.id,
                    advertiser_id: advertiserId,
                    pixel_id: pixel.pixel_id,
                    pixel_name: pixel.pixel_name || pixel.pixel_id,
                  });
                });
                console.log(`Found ${pixelsData.data.pixels.length} pixels for advertiser ${advertiserId}`);
              }
            }
          } else {
            console.log(`Pixels fetch returned ${pixelsResponse.status} for advertiser ${advertiserId}`);
          }
        } catch (error) {
          console.error(`Error fetching pixels for ${advertiserId}:`, error);
        }
      }

      // Sync TikTok pixels using upsert
      if (allTiktokPixels.length > 0) {
        const { error: pixelsError } = await supabase
          .from("tiktok_pixels")
          .upsert(allTiktokPixels, { onConflict: 'pixel_id,advertiser_id' });
        if (pixelsError) {
          console.error("Error upserting TikTok pixels:", pixelsError);
        }
      }

      // Sync TikTok identities using upsert
      if (allTiktokIdentities.length > 0) {
        const { error: identitiesError } = await supabase
          .from("tiktok_identities")
          .upsert(allTiktokIdentities, { onConflict: 'identity_id,advertiser_id' });
        if (identitiesError) {
          console.error("Error upserting TikTok identities:", identitiesError);
        }
      }

      // Sync TikTok catalogs using upsert
      if (allTiktokCatalogs.length > 0) {
        const { error: catalogsError } = await supabase
          .from("tiktok_catalogs")
          .upsert(allTiktokCatalogs, { onConflict: 'catalog_id,advertiser_id' });
        if (catalogsError) {
          console.error("Error upserting TikTok catalogs:", catalogsError);
        }
      }

      // Fetch TikTok Product Sets (catalog-level DPA assets)
      const allTiktokProductSets: any[] = [];
      for (const account of selectedAccounts) {
        try {
          const advertiserId = account.advertiser_id;
          const bcId = account.bc_id;
          
          if (!bcId) {
            console.log(`Skipping product sets for advertiser ${advertiserId} - no Business Center ID (STATUS_SELF_SERVICE_UNAUDITED account)`);
            continue;
          }
          
          console.log(`Fetching product sets for advertiser ${advertiserId}...`);
          
          // First get catalogs for this advertiser from BC
          const catalogsResponse = await fetch(
            `${baseUrl}/bc/asset/get/?bc_id=${bcId}&asset_type=CATALOG`,
            {
              headers: {
                'Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            }
          );
          
          const catalogsData = await catalogsResponse.json();
          if (catalogsData.code === 0 && catalogsData.data?.list) {
            const catalogIds = catalogsData.data.list.map((cat: any) => cat.asset_id || cat.catalog_id);
            console.log(`Found ${catalogIds.length} catalogs for advertiser ${advertiserId}`);
            
            // Fetch product sets for each catalog using DPA endpoint
            for (const catalogId of catalogIds) {
              const productSetsResponse = await fetch(
                `${baseUrl}/dpa/assets/get/?advertiser_id=${advertiserId}&catalog_id=${catalogId}&asset_type=PRODUCT_SET`,
                {
                  headers: {
                    'Access-Token': accessToken,
                    'Content-Type': 'application/json',
                  },
                }
              );

              const productSetsData = await productSetsResponse.json();
              console.log(`Product sets response for advertiser ${advertiserId}, catalog ${catalogId}:`, productSetsData);

              if (productSetsData.code === 0 && productSetsData.data?.list) {
                productSetsData.data.list.forEach((productSet: any) => {
                  allTiktokProductSets.push({
                    user_id: user.id,
                    advertiser_id: advertiserId,
                    catalog_id: catalogId,
                    product_set_id: productSet.asset_id || productSet.product_set_id,
                    product_set_name: productSet.asset_name || productSet.name || `Product Set ${productSet.asset_id}`,
                    synced_at: new Date().toISOString(),
                  });
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching product sets for account ${account.advertiser_id}:`, error);
        }
      }

      // Sync TikTok product sets
      if (allTiktokProductSets.length > 0) {
        const productSetIdsToSync = allTiktokProductSets.map(ps => ps.product_set_id);
        await supabase
          .from("tiktok_product_sets")
          .delete()
          .eq("user_id", user.id)
          .in("product_set_id", productSetIdsToSync);
        
        const { error: productSetsError } = await supabase.from("tiktok_product_sets").insert(allTiktokProductSets);
        if (productSetsError) {
          console.error("Error inserting TikTok product sets:", productSetsError);
        }
      }

      console.log(`TikTok resources synced: ${allTiktokPixels.length} pixels, ${allTiktokIdentities.length} identities, ${allTiktokCatalogs.length} catalogs, ${allTiktokProductSets.length} product sets`);

      return new Response(
        JSON.stringify({
          success: true,
          syncedCount: accountsToInsert.length,
          platform: "tiktok",
          resources: {
            pixels: allTiktokPixels.length,
            identities: allTiktokIdentities.length,
            catalogs: allTiktokCatalogs.length,
            productSets: allTiktokProductSets.length,
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
