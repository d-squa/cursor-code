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

    const { selectedAccountIds } = await req.json();

    if (!Array.isArray(selectedAccountIds) || selectedAccountIds.length === 0) {
      throw new Error("No accounts selected");
    }

    console.log(`Syncing ${selectedAccountIds.length} selected accounts for user ${user.id}`);

    // Get active Meta platform connection
    const { data: metaPlatform, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "meta")
      .eq("is_active", true)
      .maybeSingle();

    if (platformError || !metaPlatform) {
      throw new Error("No active Meta platform connection found");
    }

    const accessToken = metaPlatform.access_token;
    const accountsToInsert: any[] = [];

    // Fetch details for each selected account
    for (const accountId of selectedAccountIds) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${accountId}?fields=id,name,account_status,currency&access_token=${accessToken}`
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
      } catch (error) {
        console.error(`Error fetching account ${accountId}:`, error);
      }
    }

    if (accountsToInsert.length === 0) {
      throw new Error("Failed to fetch any selected accounts");
    }

    // Delete existing accounts and insert new ones
    await supabase.from("meta_ad_accounts").delete().eq("user_id", user.id);
    const { error: insertError } = await supabase.from("meta_ad_accounts").insert(accountsToInsert);
    
    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Failed to save selected accounts");
    }

    console.log(`Successfully synced ${accountsToInsert.length} accounts`);

    return new Response(
      JSON.stringify({
        success: true,
        syncedCount: accountsToInsert.length
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
