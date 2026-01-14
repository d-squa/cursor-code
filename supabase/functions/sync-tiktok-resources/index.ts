import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { advertiserId } = await req.json();
    if (!advertiserId) {
      throw new Error('advertiserId is required');
    }

    console.log('Syncing TikTok resources for advertiser:', advertiserId);

    // Get TikTok connection and retrieve token from Vault
    const { data: connection, error: connectionError } = await supabase
      .from('connected_platforms')
      .select('id, access_token, metadata')
      .eq('user_id', user.id)
      .eq('platform_type', 'tiktok')
      .eq('is_active', true)
      .single();

    if (connectionError || !connection) {
      throw new Error('TikTok connection not found or inactive');
    }

    // Get token from Vault with fallback to database column
    const accessToken = await getAccessToken(supabase, connection.id, connection.access_token);
    if (!accessToken) {
      throw new Error('TikTok access token not found');
    }

    const baseUrl = 'https://business-api.tiktok.com/open_api/v1.3';
    
    // Get bc_id from metadata for this advertiser
    let bcId: string | null = null;
    const platformMetadata = connection.metadata as any;
    if (platformMetadata?.accounts) {
      const account = platformMetadata.accounts.find(
        (acc: any) => String(acc.advertiser_id) === String(advertiserId),
      );
      bcId = account?.bc_id ? String(account.bc_id) : null;
    }
    
    if (!bcId) {
      console.log(`No Business Center ID found for advertiser ${advertiserId} - likely STATUS_SELF_SERVICE_UNAUDITED account. Will skip BC-level assets (identities, catalogs).`);
    } else {
      console.log(`Using Business Center ID: ${bcId}`);
    }

    // Track counts for stats
    let identitiesCount = 0;
    const catalogIds: string[] = [];

    // Fetch TikTok Pixels (advertiser-level)
    console.log('Fetching TikTok pixels...');
    const pixelsResponse = await fetch(
      `${baseUrl}/pixel/list/?advertiser_id=${advertiserId}`,
      {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    const pixelsData = await pixelsResponse.json();
    console.log('Pixels response:', pixelsData);

    if (pixelsData.code === 0 && pixelsData.data?.pixels) {
      const pixels = pixelsData.data.pixels;
      console.log(`Syncing ${pixels.length} TikTok pixels`);

      for (const pixel of pixels) {
        await supabase.from('tiktok_pixels').upsert({
          user_id: user.id,
          advertiser_id: advertiserId,
          pixel_id: pixel.pixel_id,
          pixel_name: pixel.pixel_name || pixel.pixel_id,
          synced_at: new Date().toISOString(),
        }, {
          onConflict: 'pixel_id,advertiser_id',
        });
      }
    }

    // Fetch TikTok Identities
    // Primary: advertiser identity endpoint (if available)
    // Fallback: Business Center TT_ACCOUNT assets (so UI has something to pick from)
    console.log(`Fetching TikTok identities for advertiser ${advertiserId}...`);

    let identitiesCountLocal = 0;

    try {
      const identityListUrl = `${baseUrl}/identity/list/?advertiser_id=${advertiserId}`;
      console.log('Request URL:', identityListUrl);

      const identitiesResponse = await fetch(identityListUrl, {
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (identitiesResponse.ok) {
        const contentType = identitiesResponse.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const identitiesData = await identitiesResponse.json();
          console.log('Identity list response:', JSON.stringify(identitiesData, null, 2));

          const identityList: any[] =
            identitiesData?.data?.list || identitiesData?.data?.identity_list || [];

          if (identitiesData.code === 0 && Array.isArray(identityList) && identityList.length > 0) {
            identitiesCount = identityList.length;
            identitiesCountLocal = identityList.length;
            console.log(`Syncing ${identityList.length} TikTok identities for advertiser ${advertiserId}`);

            for (const identity of identityList) {
              console.log(`[sync-tiktok-resources] Full identity object:`, JSON.stringify(identity, null, 2));

              const identityId = String(identity.identity_id);
              const identityName = identity.display_name || `TikTok Account ${identityId}`;
              const identityType = identity.identity_type || 'TT_ACCOUNT';

              console.log(`[sync-tiktok-resources] Syncing identity: id=${identityId}, name=${identityName}, type=${identityType}`);

              await supabase.from('tiktok_identities').upsert({
                user_id: user.id,
                advertiser_id: advertiserId,
                identity_id: identityId,
                identity_name: identityName,
                identity_type: identityType,
                bc_id: bcId,
                synced_at: new Date().toISOString(),
              }, {
                onConflict: 'identity_id,advertiser_id',
              });
            }
          }
        } else {
          console.log('Identity list response is not JSON');
        }
      } else {
        console.log(`Identity list fetch returned ${identitiesResponse.status} for advertiser ${advertiserId}`);
      }
    } catch (e) {
      console.log('Error fetching identities from identity/list:', e);
    }

    // Fallback to BC assets (TT_ACCOUNT)
    if (identitiesCountLocal === 0 && bcId) {
      try {
        const bcIdentityUrl = `${baseUrl}/bc/asset/get/?bc_id=${bcId}&asset_type=TT_ACCOUNT`;
        console.log('Fallback BC identity URL:', bcIdentityUrl);

        const bcResp = await fetch(bcIdentityUrl, {
          headers: {
            'Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        });

        if (bcResp.ok) {
          const contentType = bcResp.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            const bcData = await bcResp.json();
            console.log('BC TT_ACCOUNT response:', JSON.stringify(bcData, null, 2));

            const assets: any[] = Array.isArray(bcData?.data?.list) ? bcData.data.list : [];
            if (bcData.code === 0 && assets.length > 0) {
              identitiesCount = assets.length;
              console.log(`Syncing ${assets.length} fallback identities for advertiser ${advertiserId} from BC ${bcId}`);

              for (const asset of assets) {
                const identityId = String(asset.asset_id || asset.identity_id || asset.id);
                const identityName = asset.asset_name || asset.display_name || `TikTok Account ${identityId}`;
                const identityType = asset.asset_type || asset.identity_type || 'TT_ACCOUNT';

                await supabase.from('tiktok_identities').upsert({
                  user_id: user.id,
                  advertiser_id: advertiserId,
                  identity_id: identityId,
                  identity_name: identityName,
                  identity_type: identityType,
                  bc_id: bcId,
                  synced_at: new Date().toISOString(),
                }, {
                  onConflict: 'identity_id,advertiser_id',
                });
              }
            }
          }
        } else {
          console.log(`BC TT_ACCOUNT fetch returned ${bcResp.status} for bc_id ${bcId}`);
        }
      } catch (e) {
        console.log('Error fetching fallback identities from BC:', e);
      }
    }

    if (identitiesCount === 0) {
      console.log(`No identities found for advertiser ${advertiserId}`);
    }
    // Fetch Catalogs (BC-level assets - only available for Business Center accounts)
    if (bcId) {

      // Fetch TikTok Catalogs (BC-level asset)
      console.log('Fetching TikTok catalogs from Business Center...');
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
      console.log('Catalogs response:', catalogsData);

      if (catalogsData.code === 0 && catalogsData.data?.list) {
        const catalogs = catalogsData.data.list;
        console.log(`Syncing ${catalogs.length} TikTok catalogs`);

        for (const catalog of catalogs) {
          const catalogId = catalog.asset_id || catalog.catalog_id || catalog.id;
          catalogIds.push(catalogId);
          await supabase.from('tiktok_catalogs').upsert({
            user_id: user.id,
            advertiser_id: advertiserId,
            catalog_id: catalogId,
            catalog_name: catalog.asset_name || catalog.name || catalog.catalog_name || `Catalog ${catalogId}`,
            synced_at: new Date().toISOString(),
          }, {
            onConflict: 'catalog_id,advertiser_id',
          });
        }
      }
    } else {
      console.log('Skipping identities and catalogs fetch - no Business Center ID available');
    }

    // Fetch TikTok Product Sets (catalog-level DPA assets)
    console.log('Fetching TikTok product sets from catalogs...');
    let totalProductSets = 0;
    
    // Fetch product sets for each catalog
    for (const catalogId of catalogIds) {
      console.log(`Fetching product sets for catalog: ${catalogId}`);
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
      console.log(`Product sets response for catalog ${catalogId}:`, productSetsData);

      if (productSetsData.code === 0 && productSetsData.data?.list) {
        const productSets = productSetsData.data.list;
        console.log(`Syncing ${productSets.length} TikTok product sets from catalog ${catalogId}`);

        for (const productSet of productSets) {
          const productSetId = productSet.asset_id || productSet.product_set_id || productSet.id;
          
          await supabase.from('tiktok_product_sets').upsert({
            user_id: user.id,
            advertiser_id: advertiserId,
            catalog_id: catalogId,
            product_set_id: productSetId,
            product_set_name: productSet.asset_name || productSet.name || `Product Set ${productSetId}`,
            synced_at: new Date().toISOString(),
          }, {
            onConflict: 'product_set_id,advertiser_id',
          });
          totalProductSets++;
        }
      } else {
        console.log(`No product sets found for catalog ${catalogId} or API returned error:`, productSetsData);
      }
    }
    
    console.log(`Successfully synced ${totalProductSets} total product sets`)

    console.log('TikTok resources synced successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: bcId 
          ? 'TikTok resources synced successfully' 
          : 'TikTok resources synced (pixels only - account not linked to Business Center)',
        stats: {
          pixels: pixelsData.data?.pixels?.length || 0,
          identities: identitiesCount,
          catalogs: catalogIds.length,
          productSets: totalProductSets,
        },
        hasBcAccess: !!bcId
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error syncing TikTok resources:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
