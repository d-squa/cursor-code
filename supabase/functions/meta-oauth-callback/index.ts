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

    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { code, platformType, redirectUri, platformId } = await req.json();

    if (!code || platformType !== "meta" || !redirectUri) {
      throw new Error("Invalid parameters");
    }

    const isReconnection = !!platformId;

    // Exchange code for access token
    const clientId = Deno.env.get("META_APP_ID");
    const clientSecret = Deno.env.get("META_APP_SECRET");

    if (!clientId || !clientSecret) {
      throw new Error("Meta credentials not configured");
    }

    console.log("Exchanging code for access token...");
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Token exchange failed:", errorData);
      
      // Check for managed account specific errors
      if (errorData.error?.message?.includes("managed") || errorData.error?.code === 190) {
        throw new Error("Managed account authentication failed. Please ensure you're using the correct Meta account type.");
      }
      
      throw new Error(`Failed to exchange code for token: ${errorData.error?.message || 'Unknown error'}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;
    
    console.log("Successfully obtained access token");

    // Try to fetch accessible Business Managers first
    console.log("Fetching Business Managers...");
    let selectedBmId: string | null = null;
    let businessesMeta: Array<{ id: string; name: string }> = [];
    let adAccounts: any[] = [];
    
    try {
      const businessesResponse = await fetch(
        `https://graph.facebook.com/v21.0/me/businesses?fields=id,name,verification_status&access_token=${access_token}`
      );
      
      if (businessesResponse.ok) {
        const businessesData = await businessesResponse.json();
        const businesses = Array.isArray(businessesData?.data) ? businessesData.data : [];
        businessesMeta = businesses.map((b: any) => ({ id: b.id, name: b.name }));
        console.log(`Found ${businesses.length} Business Managers`);
        
        if (businesses.length > 0) {
          selectedBmId = businesses[0].id;
          console.log(`Selected Business Manager: ${businesses[0].name} (${selectedBmId})`);
          
          // Fetch ad accounts from the specific business manager
          console.log("Fetching ad accounts from Business Manager...");
          const bmAdAccountsResponse = await fetch(
            `https://graph.facebook.com/v21.0/${selectedBmId}/owned_ad_accounts?fields=id,name,account_status,currency,timezone_name&access_token=${access_token}`
          );
          
          if (bmAdAccountsResponse.ok) {
            const bmAdAccountsData = await bmAdAccountsResponse.json();
            adAccounts = bmAdAccountsData.data || [];
            console.log(`Found ${adAccounts.length} ad accounts in Business Manager`);
            console.log("Ad account IDs:", adAccounts.map((acc: any) => `${acc.id}: ${acc.name}`).join(", "));
          } else {
            console.log("Could not fetch BM ad accounts, falling back to user ad accounts");
          }
        }
      } else {
        const errorData = await businessesResponse.json();
        console.log("Business Manager fetch warning:", errorData.error?.message);
      }
    } catch (e: any) {
      console.log("Could not fetch Business Managers:", e.message);
    }
    
    // Fallback to user's ad accounts if BM fetch failed
    if (adAccounts.length === 0) {
      console.log("Fetching ad accounts from user...");
      const adAccountsResponse = await fetch(
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency,timezone_name&access_token=${access_token}`
      );

      if (!adAccountsResponse.ok) {
        const errorData = await adAccountsResponse.json();
        console.error("Failed to fetch ad accounts:", errorData);
        
        if (errorData.error?.code === 200 || errorData.error?.code === 190) {
          throw new Error("Permission denied. Please ensure your account has access to ad accounts and try reconnecting.");
        }
        
        throw new Error(`Failed to fetch ad accounts: ${errorData.error?.message || 'Unknown error'}`);
      }

      const adAccountsData = await adAccountsResponse.json();
      adAccounts = adAccountsData.data || [];
      console.log(`Found ${adAccounts.length} ad accounts from user`);
      console.log("Ad account IDs:", adAccounts.map((acc: any) => `${acc.id}: ${acc.name}`).join(", "));
    }

    
    if (adAccounts.length === 0) {
      throw new Error("No ad accounts found. Please ensure you have access to at least one ad account in your Business Manager.");
    }

    let platformData;

    if (isReconnection) {
      // Update existing platform connection
      console.log(`Reconnecting existing platform: ${platformId}`);
      const { data: updatedPlatform, error: updateError } = await supabase
        .from("connected_platforms")
        .update({
          access_token: access_token,
          is_active: true,
          business_manager_id: selectedBmId,
          metadata: businessesMeta.length > 0 ? { businesses: businessesMeta } : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", platformId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) {
        console.error("Failed to update platform:", updateError);
        throw new Error("Failed to reconnect platform");
      }
      platformData = updatedPlatform;
      console.log("Platform reconnected, ID:", platformData.id);
    } else {
      // Create new platform connection (allow multiple connections)
      console.log("Creating new platform connection...");
      const platformName = selectedBmId && businessesMeta.length > 0
        ? `Meta - ${businessesMeta[0].name}`
        : "Meta (Facebook & Instagram)";

      const { data: newPlatform, error: insertError } = await supabase
        .from("connected_platforms")
        .insert({
          user_id: user.id,
          platform_type: "meta",
          platform_name: platformName,
          access_token: access_token,
          is_active: true,
          business_manager_id: selectedBmId,
          metadata: businessesMeta.length > 0 ? { businesses: businessesMeta } : null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Failed to insert platform:", insertError);
        throw new Error("Failed to save platform connection");
      }
      platformData = newPlatform;
      console.log("Platform connected, ID:", platformData.id);
    }

    console.log("Platform connected, ID:", platformData.id);

    // Return token and ad accounts - frontend will trigger sync after user confirms

    return new Response(
      JSON.stringify({
        success: true,
        platformId: platformData.id,
        accounts: adAccounts.map((acc: any) => ({
          id: acc.id,
          name: acc.name
        }))
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Meta OAuth callback error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
