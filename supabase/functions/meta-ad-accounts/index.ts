import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Get user's connected Meta platform
    const { data: platforms, error: platformsError } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true);

    if (platformsError) throw platformsError;

    if (!platforms || platforms.length === 0) {
      return new Response(
        JSON.stringify({ adAccounts: [] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const platform = platforms[0];
    const accessToken = platform.access_token;

    // Fetch ad accounts from Meta
    console.log("Fetching ad accounts for user:", user.id);

    const response = await fetch(
      `https://graph.facebook.com/v22.0/me/adaccounts?fields=id,name,account_status,currency,business&access_token=${accessToken}`
    );

    const data = await response.json();

    if (data.error) {
      console.error("Meta API Error:", data.error);
      throw new Error(data.error.message);
    }

    // Process each ad account with detailed information
    const adAccountsWithDetails = await Promise.all(
      (data.data || []).map(async (account: any) => {
        const adAccountId = account.id;
        const basicAccount = {
          id: adAccountId,
          name: account.name,
          status: account.account_status,
          currency: account.currency,
          businessId: account.business?.id,
          businessName: account.business?.name,
        };

        try {
          // Fetch user info
          const userInfoResponse = await fetch(
            `https://graph.facebook.com/v21.0/me?access_token=${accessToken}`
          );
          const userInfo = await userInfoResponse.json();

          // Fetch pixels for this ad account
          const pixelsResponse = await fetch(
            `https://graph.facebook.com/v21.0/${adAccountId}/adspixels?fields=id,name&access_token=${accessToken}`
          );
          const pixelsData = await pixelsResponse.json();
          const accountPixels =
            pixelsData?.data?.map((pixel: any) => ({
              name: pixel.name,
              id: pixel.id,
            })) || [];

          // Fetch audiences
          const audiencesResponse = await fetch(
            `https://graph.facebook.com/v21.0/${adAccountId}/customaudiences?fields=id,name,subtype&access_token=${accessToken}`
          );
          const audiencesData = await audiencesResponse.json();
          const audiences =
            audiencesData?.data?.map((audience: any) => ({
              name: audience.name,
              id: audience.id,
              type: audience.subtype,
            })) || [];

          const businessId = basicAccount.businessId;

          if (!businessId) {
            return {
              ...basicAccount,
              accountId: userInfo.id,
              accountName: userInfo.name,
              pixels: accountPixels,
              pages: [],
              catalogs: [],
              audiences,
            };
          }

          // Fetch pages from business
          const [ownedPagesResponse, clientPagesResponse] = await Promise.all([
            fetch(`https://graph.facebook.com/v21.0/${businessId}/owned_pages?fields=id,name&access_token=${accessToken}`),
            fetch(`https://graph.facebook.com/v21.0/${businessId}/client_pages?fields=id,name&access_token=${accessToken}`),
          ]);

          const ownedPagesData = await ownedPagesResponse.json();
          const clientPagesData = await clientPagesResponse.json();

          const ownedPages =
            ownedPagesData?.data?.map((page: any) => ({
              name: page.name,
              id: page.id,
            })) || [];
          const clientPages =
            clientPagesData?.data?.map((page: any) => ({
              name: page.name,
              id: page.id,
            })) || [];

          const pages = [...ownedPages, ...clientPages];

          // Fetch catalogs from business
          const [ownedCatalogsResponse, clientCatalogsResponse] = await Promise.all([
            fetch(`https://graph.facebook.com/v21.0/${businessId}/owned_product_catalogs?fields=id,name&access_token=${accessToken}`),
            fetch(`https://graph.facebook.com/v21.0/${businessId}/client_product_catalogs?fields=id,name&access_token=${accessToken}`),
          ]);

          const ownedCatalogsData = await ownedCatalogsResponse.json();
          const clientCatalogsData = await clientCatalogsResponse.json();

          const combinedCatalogs = [
            ...(ownedCatalogsData?.data || []),
            ...(clientCatalogsData?.data || []),
          ];

          // Fetch product sets for each catalog
          const accountCatalogs = await Promise.all(
            combinedCatalogs.map(async (catalog: any) => {
              try {
                const productSetsResponse = await fetch(
                  `https://graph.facebook.com/v21.0/${catalog.id}/product_sets?fields=id,name&access_token=${accessToken}`
                );
                const productSetsData = await productSetsResponse.json();

                const productSets = productSetsData?.data?.map(
                  (productSet: any) => ({
                    name: productSet.name,
                    id: productSet.id,
                  })
                ) || [];

                return {
                  name: catalog.name,
                  id: catalog.id,
                  productSets,
                };
              } catch (error) {
                console.error(`Error fetching product sets for catalog ${catalog.id}:`, error);
                return {
                  name: catalog.name,
                  id: catalog.id,
                  productSets: [],
                };
              }
            })
          );

          return {
            ...basicAccount,
            accountId: userInfo.id,
            accountName: userInfo.name,
            pixels: accountPixels,
            pages,
            catalogs: accountCatalogs,
            audiences,
          };
        } catch (error) {
          console.error(`Error fetching details for account ${adAccountId}:`, error);
          return basicAccount;
        }
      })
    );

    console.log(`Found ${adAccountsWithDetails.length} ad accounts with details`);

    return new Response(
      JSON.stringify({ adAccounts: adAccountsWithDetails }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error fetching ad accounts:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
