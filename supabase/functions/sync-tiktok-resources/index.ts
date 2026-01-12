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
    let bcId = null;
    const platformMetadata = connection.metadata as any;
    if (platformMetadata?.accounts) {
      const account = platformMetadata.accounts.find((acc: any) => acc.advertiser_id === advertiserId);
      bcId = account?.bc_id;
    }
    
    if (!bcId) {
      console.log(`No Business Center ID found for advertiser ${advertiserId} - likely STATUS_SELF_SERVICE_UNAUDITED account. Will skip BC-level assets (identities, catalogs).`);
    } else {
      console.log(`Using Business Center ID: ${bcId}`);
    }

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

    // Fetch TikTok Identities and Catalogs (BC-level assets - only available for Business Center accounts)
    let catalogIds: string[] = [];
    let identitiesCount = 0;
    
    if (bcId) {
      // Fetch TikTok Identities (BC-level asset - use TT_ACCOUNT not IDENTITY)
      console.log('Fetching TikTok identities from Business Center...');
      console.log('BC ID:', bcId);
      console.log('Request URL:', `${baseUrl}/bc/asset/get/?bc_id=${bcId}&asset_type=TT_ACCOUNT`);
      
      const identitiesResponse = await fetch(
        `${baseUrl}/bc/asset/get/?bc_id=${bcId}&asset_type=TT_ACCOUNT`,
        {
          headers: {
            'Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const identitiesData = await identitiesResponse.json();
      console.log('TT_ACCOUNT identities full response:', JSON.stringify(identitiesData, null, 2));
      console.log('TT_ACCOUNT identities status code:', identitiesData.code);
      console.log('TT_ACCOUNT identities message:', identitiesData.message);
      console.log('TT_ACCOUNT identities data:', identitiesData.data);

      if (identitiesData.code === 0 && identitiesData.data?.list) {
        const identities = identitiesData.data.list;
        identitiesCount = identities.length;
        console.log(`Syncing ${identities.length} TikTok identities`);

        for (const identity of identities) {
          await supabase.from('tiktok_identities').upsert({
            user_id: user.id,
            advertiser_id: advertiserId,
            identity_id: identity.asset_id,
            identity_name: identity.asset_name || `TikTok Account ${identity.asset_id}`,
            identity_type: identity.asset_type || 'TT_ACCOUNT',
            bc_id: bcId, // Store Business Center ID for BC-linked identities
            synced_at: new Date().toISOString(),
          }, {
            onConflict: 'identity_id,advertiser_id',
          });
        }
      }

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
