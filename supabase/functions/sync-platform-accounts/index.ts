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

    const { connectedPlatformId } = await req.json();

    if (!connectedPlatformId) {
      throw new Error("Connected platform ID is required");
    }

    // Fetch the connected platform details
    const { data: platform, error: platformError } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("id", connectedPlatformId)
      .single();

    if (platformError || !platform) {
      throw new Error("Connected platform not found");
    }

    console.log("Syncing accounts for platform:", platform.platform_type);

    let accounts: any[] = [];

    // Fetch accounts based on platform type
    if (platform.platform_type === "meta") {
      // Fetch Facebook Pages
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v21.0/${platform.ad_account_id}?fields=promote_pages.limit(100){id,name}&access_token=${platform.access_token}`
      );

      if (pagesResponse.ok) {
        const pagesData = await pagesResponse.json();
        const pages = pagesData.promote_pages?.data || [];
        
        accounts.push(...pages.map((page: any) => ({
          connected_platform_id: connectedPlatformId,
          account_type: "facebook_page",
          account_id: page.id,
          account_name: page.name,
          metadata: { page }
        })));
      }

      // Fetch Instagram accounts
      const igResponse = await fetch(
        `https://graph.facebook.com/v21.0/${platform.ad_account_id}?fields=instagram_accounts.limit(100){id,username,name,profile_picture_url}&access_token=${platform.access_token}`
      );

      if (igResponse.ok) {
        const igData = await igResponse.json();
        const igAccounts = igData.instagram_accounts?.data || [];
        
        accounts.push(...igAccounts.map((account: any) => ({
          connected_platform_id: connectedPlatformId,
          account_type: "instagram_account",
          account_id: account.id,
          account_name: account.name || account.username,
          metadata: { 
            username: account.username,
            profile_picture_url: account.profile_picture_url 
          }
        })));
      }

      console.log(`Found ${accounts.length} accounts for Meta platform`);
    }

    // Insert accounts into database
    if (accounts.length > 0) {
      // Delete existing accounts for this platform first
      await supabase
        .from("platform_accounts")
        .delete()
        .eq("connected_platform_id", connectedPlatformId);

      // Insert new accounts
      const { error: insertError } = await supabase
        .from("platform_accounts")
        .insert(accounts);

      if (insertError) {
        console.error("Failed to insert accounts:", insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        accountsCount: accounts.length,
        accounts: accounts.map(a => ({
          type: a.account_type,
          name: a.account_name
        }))
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Sync platform accounts error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
