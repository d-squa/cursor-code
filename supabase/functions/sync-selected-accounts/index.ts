import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Subscription tier limits for swaps per month per platform
const SWAP_LIMITS: Record<string, number> = {
  trial: 1,
  basic: 1,
  freelancer: 3,
  enterprise: 3,
  agency: 6,
};

// Ad account limits per tier per platform
const AD_ACCOUNT_LIMITS: Record<string, number> = {
  trial: 1,
  basic: 1,
  freelancer: 3,
  enterprise: 150,
  agency: 300,
};

// Helper to get user's subscription tier and billing anchor - queries Stripe directly for accuracy
async function getUserSubscriptionInfo(supabase: any, userId: string, teamId: string): Promise<{ tier: string; billingAnchor: string | null }> {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.log('[TIER] No STRIPE_SECRET_KEY, defaulting to trial');
      return { tier: 'trial', billingAnchor: null };
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Get the team to determine if we should use team owner's subscription
    const { data: team } = await supabase
      .from('teams')
      .select('id, owner_id')
      .eq('id', teamId)
      .single();

    // Determine which user's subscription to check (team owner or the user)
    const subscriptionUserId = team?.owner_id || userId;
    console.log(`[TIER] Checking subscription for user ${subscriptionUserId} (team owner: ${team?.owner_id === subscriptionUserId})`);

    // Get the billing customer mapping
    const { data: billingCustomer } = await supabase
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', subscriptionUserId)
      .single();

    if (!billingCustomer?.stripe_customer_id) {
      console.log('[TIER] No billing customer mapping found, returning trial');
      return { tier: 'trial', billingAnchor: null };
    }

    // Get active subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: billingCustomer.stripe_customer_id,
      status: 'all',
      limit: 10,
    });

    // Find active or trialing subscription
    const activeSub = subscriptions.data.find(
      (s: { status: string }) => s.status === "active" || s.status === "trialing"
    );

    if (!activeSub) {
      console.log('[TIER] No active subscription found, returning trial');
      return { tier: 'trial', billingAnchor: null };
    }

    // Extract billing anchor date from subscription
    const subAny = activeSub as any;
    let billingAnchor: string | null = null;
    
    // Try different sources for the billing period start
    let periodStart = subAny.current_period_start;
    if (!periodStart && activeSub.items?.data?.[0]) {
      periodStart = (activeSub.items.data[0] as any).current_period_start;
    }
    if (!periodStart && subAny.billing_cycle_anchor) {
      periodStart = subAny.billing_cycle_anchor;
    }
    if (!periodStart && subAny.start_date) {
      periodStart = subAny.start_date;
    }
    
    if (periodStart && typeof periodStart === 'number') {
      billingAnchor = new Date(periodStart * 1000).toISOString();
    }

    const priceId = activeSub.items?.data?.[0]?.price?.id;
    if (!priceId) {
      console.log('[TIER] No price ID found in subscription, returning trial');
      return { tier: 'trial', billingAnchor };
    }

    // Map price IDs to tiers
    const priceToTier: Record<string, string> = {
      // Current USD-standardized prices
      'price_1SydZ7KrTGU4P754jqI2guPI': 'basic',      // basic monthly
      'price_1SydZEKrTGU4P754aNJHK8pc': 'basic',      // basic yearly
      'price_1SydVjKrTGU4P754mZJJWvAq': 'freelancer', // freelancer monthly
      'price_1SydVuKrTGU4P754zRmad5iJ': 'freelancer', // freelancer yearly
      'price_1SydW1KrTGU4P754aeyvSJP8': 'enterprise', // enterprise monthly
      'price_1SydW3KrTGU4P754G3iA7VZM': 'enterprise', // enterprise yearly
      'price_1SydW5KrTGU4P754vsPg9hWw': 'agency',     // agency monthly
      'price_1SydW8KrTGU4P754AEitLX2A': 'agency',     // agency yearly
      // Legacy prices
      'price_1ScnObKrTGU4P754AAJ9Q5NU': 'basic',      // legacy basic monthly
      'price_1ScnL9KrTGU4P754QirsF0Sd': 'basic',      // legacy basic yearly
      'price_1SyblZKrTGU4P754e0GfARV4': 'freelancer', // legacy freelancer monthly
      'price_1SyblbKrTGU4P754Otu9dcxm': 'freelancer', // legacy freelancer yearly
      'price_1SyblcKrTGU4P754HYOgkuIQ': 'enterprise', // legacy enterprise monthly
      'price_1SybldKrTGU4P754EBnjjPos': 'enterprise', // legacy enterprise yearly
      'price_1SyblfKrTGU4P754gwTKmrsC': 'agency',     // legacy agency monthly
      'price_1SyblfKrTGU4P754PtKbziMk': 'agency',     // legacy agency yearly
      'price_1ScnOeKrTGU4P75446dvndr3': 'agency',     // legacy agency monthly v1
    };

    const tier = priceToTier[priceId] || 'trial';
    console.log(`[TIER] Found subscription with price ${priceId}, tier: ${tier}, billingAnchor: ${billingAnchor}`);
    return { tier, billingAnchor };
  } catch (error) {
    console.error('[TIER] Error getting user subscription info:', error);
    return { tier: 'trial', billingAnchor: null };
  }
}

// Helper to detect and log swaps
// Returns { allowed: boolean, swapsNeeded: number, error?: string }
async function detectAndLogSwaps(
  supabase: any,
  userId: string,
  teamId: string,
  platform: 'meta' | 'tiktok',
  newAccountIds: string[],
  existingAccounts: Array<{ account_id: string; account_name: string }>
): Promise<{ allowed: boolean; swapsNeeded: number; error?: string }> {
  const existingIds = new Set(existingAccounts.map(a => a.account_id));
  const newIds = new Set(newAccountIds);
  
  // Find accounts being removed (were in existing, not in new)
  const removedIds = [...existingIds].filter(id => !newIds.has(id));
  // Find accounts being added (in new, not in existing)
  const addedIds = [...newIds].filter(id => !existingIds.has(id));
  
  console.log(`[SWAP-DETECTION] Platform: ${platform}, Team: ${teamId}`);
  console.log(`[SWAP-DETECTION] Existing: ${existingAccounts.length}, New selection: ${newAccountIds.length}`);
  console.log(`[SWAP-DETECTION] Removed: ${removedIds.length}, Added: ${addedIds.length}`);
  
  // A swap occurs when accounts are removed AND replaced with different accounts
  // The number of swaps = min(removed, added) because each swap is a remove+add pair
  const swapsNeeded = Math.min(removedIds.length, addedIds.length);
  
  if (swapsNeeded === 0) {
    console.log('[SWAP-DETECTION] No swaps needed');
    return { allowed: true, swapsNeeded: 0 };
  }
  
  // Get user's tier and billing anchor, then check swap limit
  const { tier, billingAnchor } = await getUserSubscriptionInfo(supabase, userId, teamId);
  const maxSwaps = SWAP_LIMITS[tier] ?? 1;
  
  // Count swaps already used this billing period for this team
  const { data: swapsThisPeriod, error: countError } = await supabase
    .rpc('count_swaps_in_billing_period', { 
      _user_id: userId, 
      _platform: platform, 
      _team_id: teamId,
      _billing_anchor_date: billingAnchor
    });
  
  if (countError) {
    console.error('[SWAP-DETECTION] Error counting swaps:', countError);
    return { allowed: false, swapsNeeded, error: 'Failed to check swap limits' };
  }
  
  const usedSwaps = swapsThisPeriod ?? 0;
  const remainingSwaps = maxSwaps - usedSwaps;
  
  console.log(`[SWAP-DETECTION] Tier: ${tier}, Max swaps: ${maxSwaps}, Used: ${usedSwaps}, Remaining: ${remainingSwaps}, Needed: ${swapsNeeded}, BillingAnchor: ${billingAnchor}`);
  
  if (swapsNeeded > remainingSwaps) {
    return { 
      allowed: false, 
      swapsNeeded,
      error: `This change requires ${swapsNeeded} swap(s), but you only have ${remainingSwaps} remaining this billing period. Upgrade your plan for more swaps.`
    };
  }
  
  // Log each swap
  const swapsToLog = [];
  for (let i = 0; i < swapsNeeded; i++) {
    const removedId = removedIds[i];
    const addedId = addedIds[i];
    const removedAccount = existingAccounts.find(a => a.account_id === removedId);
    
    swapsToLog.push({
      user_id: userId,
      team_id: teamId,
      platform,
      previous_account_id: removedId,
      new_account_id: addedId,
      swap_type: 'swap',
      metadata: {
        previous_account_name: removedAccount?.account_name || removedId,
        swapped_at: new Date().toISOString(),
      }
    });
  }
  
  if (swapsToLog.length > 0) {
    const { error: insertError } = await supabase
      .from('ad_account_swap_logs')
      .insert(swapsToLog);
    
    if (insertError) {
      console.error('[SWAP-DETECTION] Error logging swaps:', insertError);
      // Don't block the sync, just log the error
    } else {
      console.log(`[SWAP-DETECTION] Logged ${swapsToLog.length} swap(s)`);
    }
  }
  
  return { allowed: true, swapsNeeded };
}

// Helper to update sync progress
async function updateSyncProgress(
  supabase: any,
  platformId: string,
  status: string,
  currentStep: number,
  totalSteps: number,
  assetType?: string,
  assetName?: string,
  processedCounts?: any,
  errorMessage?: string
) {
  const syncProgress: any = {
    status,
    platform: 'meta',
    totalSteps,
    currentStep,
    currentAssetType: assetType,
    currentAssetName: assetName,
    processedCounts,
  };
  
  if (status === 'syncing' && currentStep === 1) {
    syncProgress.startedAt = new Date().toISOString();
  }
  if (status === 'completed') {
    syncProgress.completedAt = new Date().toISOString();
  }
  if (errorMessage) {
    syncProgress.errorMessage = errorMessage;
  }

  // First get current metadata to preserve accounts
  const { data: current } = await supabase
    .from('connected_platforms')
    .select('metadata')
    .eq('id', platformId)
    .single();
  
  const existingMetadata = current?.metadata || {};
  
  await supabase
    .from('connected_platforms')
    .update({
      metadata: {
        ...existingMetadata,
        sync_progress: syncProgress,
      },
    })
    .eq('id', platformId);
}

// Background sync function for Meta accounts
async function syncMetaAccountsInBackground(
  supabase: any,
  userId: string,
  teamId: string,
  platformId: string,
  selectedAccountIds: string[],
  accessToken: string
) {
  const selectedIds = selectedAccountIds.map((id: any) => String(id));
  const totalAccounts = selectedIds.length;
  
  // For large syncs (>100 accounts), use lightweight mode (skip nested resources)
  const isLargeSync = totalAccounts > 100;
  const totalSteps = totalAccounts + 6;
  let currentStep = 0;
  
  console.log(`[SYNC-META] Starting sync for ${totalAccounts} accounts (${isLargeSync ? 'LIGHTWEIGHT' : 'FULL'} mode)`);

  const processedCounts = {
    adAccounts: 0,
    pixels: 0,
    pages: 0,
    instagramAccounts: 0,
    catalogs: 0,
    productSets: 0,
    conversionEvents: 0,
  };

  try {
    await updateSyncProgress(
      supabase, 
      platformId, 
      'syncing', 
      1, 
      totalSteps, 
      'ad_accounts', 
      isLargeSync ? `Fast sync mode: ${totalAccounts} accounts` : 'Fetching account details...'
    );

    const accountsToInsert: any[] = [];
    const allPixels: any[] = [];
    const allPages: any[] = [];
    const allInstagramAccounts: any[] = [];
    const allCatalogs: any[] = [];
    const allProductSets: any[] = [];
    const allConversionEvents: any[] = [];

    // Use smaller batches for large syncs to avoid timeout
    const BATCH_SIZE = isLargeSync ? 25 : 10;
    const startTime = Date.now();
    const MAX_EXECUTION_TIME = 120000; // 120 seconds safety margin
    
    for (let i = 0; i < selectedIds.length; i += BATCH_SIZE) {
      // Check if we're approaching timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_EXECUTION_TIME) {
        console.log(`[SYNC-META] Timeout protection triggered at ${i} accounts after ${elapsedTime}ms`);
        throw new Error(`Partial sync completed: ${i}/${totalAccounts} accounts. Please reconnect to continue.`);
      }
      
      const batch = selectedIds.slice(i, i + BATCH_SIZE);
      console.log(`[SYNC-META] Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(totalAccounts/BATCH_SIZE)}: accounts ${i+1}-${Math.min(i+BATCH_SIZE, totalAccounts)}`);
      
      // Process batch in parallel
      await Promise.all(batch.map(async (accountId) => {
        try {
          const response = await fetch(
            `https://graph.facebook.com/v21.0/${accountId}?fields=id,name,account_status,currency,business&access_token=${accessToken}`
          );
          
          if (!response.ok) {
            console.error(`Failed to fetch account ${accountId}`);
            return;
          }

          const accountData = await response.json();
          
          accountsToInsert.push({
            user_id: userId,
            team_id: teamId, // Workspace scoping
            platform_id: platformId, // Connection scoping
            account_id: accountData.id,
            account_name: accountData.name,
            account_status: accountData.account_status,
            currency: accountData.currency,
          });

          // Only fetch nested resources in FULL mode (small syncs)
          if (!isLargeSync) {
            // Fetch pixels for this account
            try {
              const pixelsResponse = await fetch(
                `https://graph.facebook.com/v21.0/${accountId}/adspixels?fields=id,name&access_token=${accessToken}`
              );
              const pixelsData = await pixelsResponse.json();
              if (pixelsData?.data) {
                pixelsData.data.forEach((pixel: any) => {
                  allPixels.push({
                    user_id: userId,
                    ad_account_id: accountData.id,
                    pixel_id: pixel.id,
                    pixel_name: pixel.name,
                  });
                });
              }
            } catch (error) {
              console.error(`Error fetching pixels for ${accountId}:`, error);
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
                    user_id: userId,
                    page_id: page.id,
                    page_name: page.name,
                  });

                  // Extract Instagram accounts from pages
                  if (page.instagram_business_account) {
                    allInstagramAccounts.push({
                      user_id: userId,
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
                    user_id: userId,
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
                          user_id: userId,
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

            // Fetch conversion events for pixels (only in FULL mode)
            for (const pixel of allPixels.filter(p => p.ad_account_id === accountData.id)) {
              // Add standard events
              const standardEvents = [
                'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
                'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead', 'CompleteRegistration'
              ];

              standardEvents.forEach(eventName => {
                allConversionEvents.push({
                  user_id: userId,
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
                      user_id: userId,
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
          } else {
            // LIGHTWEIGHT mode: Only sync ad accounts, skip nested resources
            console.log(`[SYNC-META] Skipping nested resources for account ${accountId} (lightweight mode)`);
          }
        } catch (error) {
          console.error(`[SYNC-META] Error fetching account ${accountId}:`, error);
        }
      }));

      // Update progress after each batch
      currentStep = Math.min(i + BATCH_SIZE, totalAccounts);
      const progressMessage = isLargeSync 
        ? `Fast sync: ${currentStep}/${totalAccounts} accounts (${Math.round(currentStep/totalAccounts*100)}%)`
        : `Processed ${currentStep}/${totalAccounts} accounts...`;
      
      await updateSyncProgress(
        supabase, 
        platformId, 
        'syncing', 
        currentStep, 
        totalSteps, 
        'ad_accounts', 
        progressMessage,
        processedCounts
      );
      
      console.log(`[SYNC-META] Batch complete. Progress: ${currentStep}/${totalAccounts}. Time elapsed: ${Math.round((Date.now() - startTime)/1000)}s`);
    }

    if (accountsToInsert.length === 0) {
      throw new Error("Failed to fetch any selected accounts");
    }

    // Save to database
    console.log(`[SYNC-META] Fetching complete. Saving ${accountsToInsert.length} accounts to database...`);
    processedCounts.adAccounts = accountsToInsert.length;
    currentStep = totalAccounts + 1;
    await updateSyncProgress(supabase, platformId, 'syncing', currentStep, totalSteps, 'ad_accounts', 'Saving ad accounts...', processedCounts);

    // Replace only accounts from THIS connection (not all team accounts)
    await supabase
      .from("meta_ad_accounts")
      .delete()
      .eq("team_id", teamId)
      .eq("platform_id", platformId);
    
    const { error: insertError } = await supabase.from("meta_ad_accounts").insert(accountsToInsert);
    
    if (insertError) {
      console.error("[SYNC-META] Upsert error:", insertError);
      throw new Error("Failed to save selected accounts");
    }

    // Only save nested resources if we fetched them (FULL mode)
    if (!isLargeSync) {
      // Sync pixels
      currentStep++;
      processedCounts.pixels = allPixels.length;
      await updateSyncProgress(supabase, platformId, 'syncing', currentStep, totalSteps, 'pixels', `Saving ${allPixels.length} pixels...`, processedCounts);
      
      if (allPixels.length > 0) {
        const pixelIdsToSync = allPixels.map(p => p.pixel_id);
        await supabase
          .from("meta_pixels")
          .delete()
          .eq("user_id", userId)
          .in("pixel_id", pixelIdsToSync);
        
        const { error: pixelsError } = await supabase.from("meta_pixels").insert(allPixels);
        if (pixelsError) {
          console.error("[SYNC-META] Error inserting pixels:", pixelsError);
        }
      }

      // Sync pages
      currentStep++;
      processedCounts.pages = allPages.length;
      await updateSyncProgress(supabase, platformId, 'syncing', currentStep, totalSteps, 'pages', `Saving ${allPages.length} pages...`, processedCounts);
      
      if (allPages.length > 0) {
        const pageIdsToSync = allPages.map(p => p.page_id);
        await supabase
          .from("meta_pages")
          .delete()
          .eq("user_id", userId)
          .in("page_id", pageIdsToSync);
        
        const { error: pagesError } = await supabase.from("meta_pages").insert(allPages);
        if (pagesError) {
          console.error("[SYNC-META] Error inserting pages:", pagesError);
        }
      }

      // Sync Instagram accounts
      currentStep++;
      processedCounts.instagramAccounts = allInstagramAccounts.length;
      await updateSyncProgress(supabase, platformId, 'syncing', currentStep, totalSteps, 'instagram_accounts', `Saving ${allInstagramAccounts.length} Instagram accounts...`, processedCounts);
      
      if (allInstagramAccounts.length > 0) {
        const igIdsToSync = allInstagramAccounts.map(ig => ig.instagram_account_id);
        await supabase
          .from("meta_instagram_accounts")
          .delete()
          .eq("user_id", userId)
          .in("instagram_account_id", igIdsToSync);
        
        const { error: igError } = await supabase.from("meta_instagram_accounts").insert(allInstagramAccounts);
        if (igError) {
          console.error("[SYNC-META] Error inserting Instagram accounts:", igError);
        }
      }

      // Sync catalogs
      currentStep++;
      processedCounts.catalogs = allCatalogs.length;
      await updateSyncProgress(supabase, platformId, 'syncing', currentStep, totalSteps, 'catalogs', `Saving ${allCatalogs.length} catalogs...`, processedCounts);
      
      if (allCatalogs.length > 0) {
        const catalogIdsToSync = allCatalogs.map(c => c.catalog_id);
        await supabase
          .from("meta_catalogs")
          .delete()
          .eq("user_id", userId)
          .in("catalog_id", catalogIdsToSync);
        
        const { error: catalogsError } = await supabase.from("meta_catalogs").insert(allCatalogs);
        if (catalogsError) {
          console.error("[SYNC-META] Error inserting catalogs:", catalogsError);
        }
      }

      // Sync product sets
      processedCounts.productSets = allProductSets.length;
      if (allProductSets.length > 0) {
        const productSetIdsToSync = allProductSets.map(ps => ps.product_set_id);
        await supabase
          .from("meta_product_sets")
          .delete()
          .eq("user_id", userId)
          .in("product_set_id", productSetIdsToSync);
        
        const { error: productSetsError } = await supabase.from("meta_product_sets").insert(allProductSets);
        if (productSetsError) {
          console.error("[SYNC-META] Error inserting product sets:", productSetsError);
        }
      }

      // Sync conversion events
      currentStep++;
      processedCounts.conversionEvents = allConversionEvents.length;
      await updateSyncProgress(supabase, platformId, 'syncing', currentStep, totalSteps, 'conversion_events', `Saving ${allConversionEvents.length} conversion events...`, processedCounts);
      
      if (allConversionEvents.length > 0) {
        const pixelIds = [...new Set(allConversionEvents.map(e => e.pixel_id))];
        await supabase
          .from("meta_conversion_events")
          .delete()
          .eq("user_id", userId)
          .in("pixel_id", pixelIds);
        
        const { error: eventsError } = await supabase.from("meta_conversion_events").insert(allConversionEvents);
        if (eventsError) {
          console.error("[SYNC-META] Error inserting conversion events:", eventsError);
        }
      }

      console.log(`[SYNC-META] ✓ Full sync complete: ${accountsToInsert.length} accounts with all resources`);
      console.log(`[SYNC-META] Resources synced: ${allPixels.length} pixels, ${allPages.length} pages, ${allInstagramAccounts.length} IG accounts, ${allCatalogs.length} catalogs, ${allProductSets.length} product sets, ${allConversionEvents.length} conversion events`);
    } else {
      console.log(`[SYNC-META] ✓ Lightweight sync complete: ${accountsToInsert.length} accounts (nested resources skipped for performance)`);
    }

    // Mark as completed
    const finalMessage = isLargeSync 
      ? `${accountsToInsert.length} accounts synced. Use "Sync Assets" in Client Management to load pixels, pages, catalogs for specific accounts.`
      : `${accountsToInsert.length} accounts synced with all resources`;
    
    await updateSyncProgress(supabase, platformId, 'completed', totalSteps, totalSteps, undefined, finalMessage, processedCounts);
    
  } catch (error: any) {
    console.error("[SYNC-META] Background sync error:", error);
    const errorMsg = error.message.includes('Partial sync') 
      ? error.message 
      : `Sync failed: ${error.message}`;
    await updateSyncProgress(supabase, platformId, 'error', 0, 0, undefined, undefined, undefined, errorMsg);
  }
}

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

    const { selectedAccountIds, platformId, teamId } = await req.json();

    if (!Array.isArray(selectedAccountIds) || selectedAccountIds.length === 0) {
      throw new Error("No accounts selected");
    }

    const selectedIds = selectedAccountIds.map((id: any) => String(id));

    if (!platformId) {
      throw new Error("Platform ID is required");
    }

    if (!teamId) {
      throw new Error("Team ID (workspace) is required for workspace-scoped ad accounts");
    }

    console.log(`Syncing ${selectedAccountIds.length} selected accounts for user ${user.id} from platform ${platformId} in team ${teamId}`);

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
      // Handle TikTok account syncing (synchronous - typically fewer accounts)
      
      // SWAP DETECTION: Get existing TikTok accounts for this connection only
      const { data: existingTiktokAccounts, error: existingError } = await supabase
        .from('tiktok_ad_accounts')
        .select('account_id, account_name')
        .eq('team_id', teamId)
        .eq('platform_id', platformId);
      
      if (existingError) {
        console.error('Error fetching existing TikTok accounts:', existingError);
      }
      
      // Check and log swaps
      const swapResult = await detectAndLogSwaps(
        supabase,
        user.id,
        teamId,
        'tiktok',
        selectedIds,
        existingTiktokAccounts || []
      );
      
      if (!swapResult.allowed) {
        return new Response(
          JSON.stringify({ 
            error: swapResult.error,
            swapLimitExceeded: true,
            swapsNeeded: swapResult.swapsNeeded
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      const accountsToInsert: any[] = [];
      const advertiserIds = platform.metadata?.advertiser_ids || [];
      const accountsInfo = platform.metadata?.accounts || [];

      // Filter selected accounts
      const selectedAccounts = accountsInfo.filter((acc: any) =>
        selectedIds.includes(String(acc.advertiser_id))
      );

      if (selectedAccounts.length === 0) {
        throw new Error("No matching TikTok accounts found");
      }

      // Prepare TikTok ad accounts for insertion with team_id
      selectedAccounts.forEach((account: any) => {
        const advertiserIdStr = String(account.advertiser_id);
        accountsToInsert.push({
          user_id: user.id,
          team_id: teamId, // Workspace scoping
          platform_id: platformId, // Connection scoping
          account_id: advertiserIdStr,
          account_name: account.name,
          advertiser_id: advertiserIdStr,
          account_status: account.status,
          currency: account.currency,
          timezone: account.timezone,
          synced_at: new Date().toISOString(),
        });
      });

      // Replace only accounts from THIS connection (not all team accounts)
      await supabase
        .from("tiktok_ad_accounts")
        .delete()
        .eq("team_id", teamId)
        .eq("platform_id", platformId);
      
      const { error: insertError } = await supabase
        .from("tiktok_ad_accounts")
        .upsert(accountsToInsert, { onConflict: 'user_id,advertiser_id' });
      
      if (insertError) {
        console.error("TikTok upsert error:", insertError);
        throw new Error("Failed to save selected TikTok accounts");
      }

      console.log(`Successfully synced ${accountsToInsert.length} TikTok advertiser accounts`);

      // Update connected_platforms with the first selected advertiser ID as default ad_account_id
      if (selectedIds.length > 0) {
        const defaultAdAccountId = selectedIds[0];
        const defaultAccount = selectedAccounts.find((acc: any) => String(acc.advertiser_id) === defaultAdAccountId);
        
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
      const bcIdentitiesByBcId = new Map<string, any[]>();
      
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
          if (selectedIds.includes(String(account.advertiser_id)) && account.bc_id) {
            const bcIdStr = String(account.bc_id);
            bcIds.add(bcIdStr);
            advertiserToBcMap.set(String(account.advertiser_id), bcIdStr);
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
                  const advertisersInBc = selectedIds.filter(
                    (id) => advertiserToBcMap.get(id) === bcId
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

          // Fetch TikTok accounts from Business Center (asset_type=TT_ACCOUNT)
          try {
            const ttAccountsResponse = await fetch(
              `${baseUrl}/bc/asset/get/?bc_id=${bcId}&asset_type=TT_ACCOUNT`,
              {
                headers: {
                  'Access-Token': accessToken,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (ttAccountsResponse.ok) {
              const contentType = ttAccountsResponse.headers.get('content-type');
              if (contentType?.includes('application/json')) {
                const ttAccountsData = await ttAccountsResponse.json();
                console.log(`BC ${bcId} TT_ACCOUNT response:`, ttAccountsData);

                if (ttAccountsData.code === 0 && Array.isArray(ttAccountsData.data?.list)) {
                  bcIdentitiesByBcId.set(bcId, ttAccountsData.data.list);
                  console.log(`Found ${ttAccountsData.data.list.length} TT_ACCOUNT identities for BC ${bcId}`);
                }
              }
            } else {
              console.log(`BC TT_ACCOUNT fetch returned ${ttAccountsResponse.status} for BC ${bcId}`);
            }
          } catch (error) {
            console.error(`Error fetching BC TT_ACCOUNT assets for ${bcId}:`, error);
          }
        } catch (error) {
          console.error(`Error fetching BC assets for ${bcId}:`, error);
        }
      }
      
      // Fetch advertiser-level resources for each advertiser (identities + pixels)
      for (const advertiserId of selectedIds) {
        const advertiserIdStr = String(advertiserId);
        const bcId = advertiserToBcMap.get(advertiserIdStr) || null;

        // 1) Identities (advertiser-assigned for ad delivery)
        try {
          console.log(`Fetching advertiser-level identities for: ${advertiserIdStr}`);

          let identityList: any[] = [];
          let identitiesStatus: number | null = null;

          const identitiesResponse = await fetch(
            `${baseUrl}/identity/list/?advertiser_id=${advertiserIdStr}`,
            {
              headers: {
                'Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            }
          );

          identitiesStatus = identitiesResponse.status;

          if (identitiesResponse.ok) {
            const contentType = identitiesResponse.headers.get('content-type');
            if (contentType?.includes('application/json')) {
              const identitiesData = await identitiesResponse.json();
              console.log(`Advertiser ${advertiserIdStr} identities response:`, identitiesData);

              identityList =
                identitiesData?.data?.list || identitiesData?.data?.identity_list || [];

              if (identitiesData.code !== 0) {
                identityList = [];
              }
            } else {
              console.log(`Identities response not JSON for advertiser ${advertiserIdStr}`);
            }
          } else {
            console.log(`Identities fetch returned ${identitiesStatus} for advertiser ${advertiserIdStr}`);
          }

          // Fallback: use BC TT_ACCOUNT assets when advertiser identity endpoint isn't available / returns empty
          if (identityList.length === 0 && bcId && bcIdentitiesByBcId.has(bcId)) {
            const bcIdentityAssets = bcIdentitiesByBcId.get(bcId) || [];
            console.log(
              `Falling back to BC TT_ACCOUNT identities for advertiser ${advertiserIdStr} (bc_id=${bcId}) - ${bcIdentityAssets.length} found`,
            );

            bcIdentityAssets.forEach((asset: any) => {
              const identityId = String(asset.asset_id || asset.identity_id || asset.id);
              allTiktokIdentities.push({
                user_id: user.id,
                advertiser_id: advertiserIdStr,
                identity_id: identityId,
                identity_name: asset.asset_name || asset.display_name || `TikTok Account ${identityId}`,
                identity_type: asset.asset_type || asset.identity_type || 'TT_ACCOUNT',
                bc_id: bcId,
              });
            });

            console.log(`Found ${bcIdentityAssets.length} fallback identities for advertiser ${advertiserIdStr}`);
          } else if (Array.isArray(identityList) && identityList.length > 0) {
            identityList.forEach((identity: any) => {
              const identityId = String(identity.identity_id);
              allTiktokIdentities.push({
                user_id: user.id,
                advertiser_id: advertiserIdStr,
                identity_id: identityId,
                identity_name: identity.display_name || `TikTok Account ${identityId}`,
                identity_type: identity.identity_type || 'TT_ACCOUNT',
                bc_id: bcId,
              });
            });

            console.log(`Found ${identityList.length} identities for advertiser ${advertiserIdStr}`);
          }
        } catch (error) {
          console.error(`Error fetching identities for ${advertiserIdStr}:`, error);
        }

        // 2) Pixels (advertiser-level)
        try {
          console.log(`Fetching advertiser-level pixels for: ${advertiserIdStr}`);

          const pixelsResponse = await fetch(
            `${baseUrl}/pixel/list/?advertiser_id=${advertiserIdStr}`,
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
              console.log(`Advertiser ${advertiserIdStr} pixels response:`, pixelsData);

              if (pixelsData.code === 0 && pixelsData.data?.pixels) {
                pixelsData.data.pixels.forEach((pixel: any) => {
                  allTiktokPixels.push({
                    user_id: user.id,
                    advertiser_id: advertiserIdStr,
                    pixel_id: pixel.pixel_id,
                    pixel_name: pixel.pixel_name || pixel.pixel_id,
                  });
                });
                console.log(`Found ${pixelsData.data.pixels.length} pixels for advertiser ${advertiserIdStr}`);
              }
            }
          } else {
            console.log(`Pixels fetch returned ${pixelsResponse.status} for advertiser ${advertiserIdStr}`);
          }
        } catch (error) {
          console.error(`Error fetching pixels for ${advertiserIdStr}:`, error);
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
          const advertiserIdStr = String(account.advertiser_id);
          console.log(`Fetching product sets for advertiser: ${advertiserIdStr}`);

          const productSetsResponse = await fetch(
            `${baseUrl}/dpa/product/set/list/?bc_id=${account.bc_id || ''}&advertiser_id=${advertiserIdStr}&page_size=100`,
            {
              headers: {
                'Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            }
          );

          if (productSetsResponse.ok) {
            const contentType = productSetsResponse.headers.get('content-type');
            if (contentType?.includes('application/json')) {
              const productSetsData = await productSetsResponse.json();
              console.log(`Advertiser ${advertiserIdStr} product sets response:`, productSetsData);

              if (productSetsData.code === 0 && productSetsData.data?.list) {
                productSetsData.data.list.forEach((productSet: any) => {
                  allTiktokProductSets.push({
                    user_id: user.id,
                    advertiser_id: advertiserIdStr,
                    catalog_id: productSet.catalog_id,
                    product_set_id: productSet.product_set_id,
                    product_set_name: productSet.product_set_name || productSet.product_set_id,
                  });
                });
                console.log(`Found ${productSetsData.data.list.length} product sets for advertiser ${advertiserIdStr}`);
              }
            }
          } else {
            console.log(`Product sets fetch returned ${productSetsResponse.status} for advertiser ${advertiserIdStr}`);
          }
        } catch (error) {
          console.error(`Error fetching product sets for advertiser ${account.advertiser_id}:`, error);
        }
      }

      // Sync TikTok product sets using upsert
      if (allTiktokProductSets.length > 0) {
        const { error: productSetsError } = await supabase
          .from("tiktok_product_sets")
          .upsert(allTiktokProductSets, { onConflict: 'product_set_id,advertiser_id' });
        if (productSetsError) {
          console.error("Error upserting TikTok product sets:", productSetsError);
        }
      }

      console.log(`TikTok sync complete - ${allTiktokPixels.length} pixels, ${allTiktokIdentities.length} identities, ${allTiktokCatalogs.length} catalogs, ${allTiktokProductSets.length} product sets`);

      return new Response(
        JSON.stringify({
          success: true,
          syncedCount: accountsToInsert.length,
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

    // Handle Google Ads account syncing (synchronous - simple insert)
    if (platform.platform_type === "google") {
      const accountsInfo = platform.metadata?.accounts || [];
      
      // Filter selected accounts from metadata
      const selectedGoogleAccounts = accountsInfo.filter((acc: any) =>
        selectedIds.includes(String(acc.customer_id))
      );

      if (selectedGoogleAccounts.length === 0) {
        throw new Error("No matching Google Ads accounts found");
      }

      const googleAccountsToInsert = selectedGoogleAccounts.map((account: any) => ({
        user_id: user.id,
        team_id: teamId,
        account_id: String(account.customer_id),
        account_name: account.name || `Account ${account.customer_id}`,
        customer_id: String(account.customer_id),
        account_status: account.status || "ENABLED",
        currency: account.currency || "USD",
        timezone: account.timezone || "UTC",
        platform_id: platformId,
        manager_customer_id: platform.metadata?.manager_customer_id || null,
      }));

      // Replace only accounts from THIS connection (not all team accounts)
      await supabase
        .from("google_ad_accounts")
        .delete()
        .eq("team_id", teamId)
        .eq("platform_id", platformId);

      const { error: insertError } = await supabase
        .from("google_ad_accounts")
        .upsert(googleAccountsToInsert, { onConflict: 'user_id,customer_id' });

      if (insertError) {
        console.error("Google Ads upsert error:", insertError);
        throw new Error("Failed to save selected Google Ads accounts");
      }

      console.log(`Successfully synced ${googleAccountsToInsert.length} Google Ads accounts`);

      return new Response(
        JSON.stringify({
          success: true,
          syncedCount: googleAccountsToInsert.length,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle Meta account syncing - use background processing for large account sets
    if (platform.platform_type !== "meta") {
      throw new Error("Unsupported platform type");
    }

    // SWAP DETECTION: Get existing Meta accounts for this connection only
    const { data: existingMetaAccounts, error: existingMetaError } = await supabase
      .from('meta_ad_accounts')
      .select('account_id, account_name')
      .eq('team_id', teamId)
      .eq('platform_id', platformId);
    
    if (existingMetaError) {
      console.error('Error fetching existing Meta accounts:', existingMetaError);
    }
    
    // Check and log swaps
    const metaSwapResult = await detectAndLogSwaps(
      supabase,
      user.id,
      teamId,
      'meta',
      selectedIds,
      existingMetaAccounts || []
    );
    
    if (!metaSwapResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: metaSwapResult.error,
          swapLimitExceeded: true,
          swapsNeeded: metaSwapResult.swapsNeeded
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // For Meta, always use background processing to handle large account sets
    console.log(`Starting background sync for ${selectedIds.length} Meta accounts`);
    
    // Initialize sync progress
    await updateSyncProgress(supabase, platformId, 'pending', 0, selectedIds.length + 6, 'ad_accounts', 'Starting sync...');

    // Use EdgeRuntime.waitUntil for background processing
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        syncMetaAccountsInBackground(supabase, user.id, teamId, platformId, selectedIds, accessToken)
      );
    } else {
      // Fallback for environments without EdgeRuntime.waitUntil
      // Run synchronously but with a warning
      console.warn('EdgeRuntime.waitUntil not available, running sync synchronously');
      await syncMetaAccountsInBackground(supabase, user.id, teamId, platformId, selectedIds, accessToken);
    }

    // Return immediately with background sync status
    return new Response(
      JSON.stringify({
        success: true,
        background: true,
        message: `Syncing ${selectedIds.length} accounts in background. Progress will be tracked.`,
        platformId,
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
