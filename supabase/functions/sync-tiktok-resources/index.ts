import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Get TikTok access token and bc_id from connected_platforms
    const { data: connection, error: connectionError } = await supabase
      .from('connected_platforms')
      .select('access_token, id, metadata')
      .eq('user_id', user.id)
      .eq('platform_type', 'tiktok')
      .eq('is_active', true)
      .single();

    if (connectionError || !connection?.access_token) {
      throw new Error('TikTok connection not found or inactive');
    }

    const accessToken = connection.access_token;
    const baseUrl = 'https://business-api.tiktok.com/open_api/v1.3';
    
    // Get bc_id from metadata for this advertiser
    let bcId = null;
    const platformMetadata = connection.metadata as any;
    if (platformMetadata?.accounts) {
      const account = platformMetadata.accounts.find((acc: any) => acc.advertiser_id === advertiserId);
      bcId = account?.bc_id;
    }
    
    if (!bcId) {
      throw new Error(`Business Center ID not found for advertiser ${advertiserId}`);
    }
    
    console.log(`Using Business Center ID: ${bcId}`);

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
      console.log(`Syncing ${identities.length} TikTok identities`);

      for (const identity of identities) {
        await supabase.from('tiktok_identities').upsert({
          user_id: user.id,
          advertiser_id: advertiserId,
          identity_id: identity.asset_id,
          identity_name: identity.asset_name || `TikTok Account ${identity.asset_id}`,
          identity_type: identity.asset_type || 'TT_ACCOUNT',
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

    let catalogIds: string[] = [];
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

    // Fetch TikTok Product Sets for each catalog
    console.log('Fetching TikTok product sets...');
    let totalProductSets = 0;
    for (const catalogId of catalogIds) {
      try {
        const productSetsResponse = await fetch(
          `${baseUrl}/catalog/product/get/?bc_id=${bcId}&catalog_id=${catalogId}`,
          {
            headers: {
              'Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          }
        );

        const productSetsData = await productSetsResponse.json();
        console.log(`Product sets response for catalog ${catalogId}:`, productSetsData);

        if (productSetsData.code === 0 && productSetsData.data?.products) {
          const productSets = productSetsData.data.products;
          console.log(`Syncing ${productSets.length} product sets for catalog ${catalogId}`);

          for (const productSet of productSets) {
            await supabase.from('tiktok_product_sets').upsert({
              user_id: user.id,
              advertiser_id: advertiserId,
              catalog_id: catalogId,
              product_set_id: productSet.product_id || productSet.id,
              product_set_name: productSet.product_name || productSet.name || `Product Set ${productSet.product_id || productSet.id}`,
              synced_at: new Date().toISOString(),
            }, {
              onConflict: 'product_set_id,advertiser_id',
            });
            totalProductSets++;
          }
        }
      } catch (error) {
        console.error(`Error fetching product sets for catalog ${catalogId}:`, error);
      }
    }

    console.log('TikTok resources synced successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'TikTok resources synced successfully',
        stats: {
          pixels: pixelsData.data?.pixels?.length || 0,
          identities: identitiesData.data?.list?.length || 0,
          catalogs: catalogsData.data?.list?.length || 0,
          productSets: totalProductSets,
        }
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