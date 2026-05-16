import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { storePlatformToken } from "../_shared/vault-helper.ts";
import { logApiRequest, logApiResponse } from "../_shared/api-logger.ts";
import { syncTikTokAdvertiserDetails } from "../_shared/tiktok-advertiser-sync.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const FUNCTION_NAME = "tiktok-oauth-callback";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const oauthInputSchema = z.object({
  code: z.string().min(1).max(2000),
  platformType: z.string().optional().nullable(),
  redirectUri: z.string().optional().nullable(),
  platformId: z.string().uuid().optional().nullable()
});

interface SyncProgress {
  status: 'pending' | 'syncing' | 'completed' | 'error';
  platform: 'tiktok' | 'meta';
  totalSteps: number;
  currentStep: number;
  currentAssetType?: string;
  currentAssetName?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  lastProgressAt?: string;
  processedCounts?: {
    adAccounts?: number;
    pixels?: number;
    identities?: number;
    catalogs?: number;
    productSets?: number;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const parseResult = oauthInputSchema.safeParse(body);
    if (!parseResult.success) {
      console.error("Validation error:", parseResult.error);
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const { code, platformType, redirectUri, platformId } = parseResult.data;

    const tiktokAppId = Deno.env.get("TIKTOK_APP_ID");
    const tiktokAppSecret = Deno.env.get("TIKTOK_APP_SECRET");

    if (!tiktokAppId || !tiktokAppSecret) {
      throw new Error("TikTok app credentials not configured");
    }

    console.log("Exchanging TikTok authorization code for access token...");

    // Exchange code for access token
    const tokenUrl = "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/";
    const tokenBody = {
      app_id: tiktokAppId,
      secret: tiktokAppSecret,
      auth_code: code,
    };
    
    logApiRequest(tokenUrl, { functionName: FUNCTION_NAME, method: "POST", body: tokenBody, context: "token exchange" });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenBody),
    });

    const tokenData = await tokenResponse.json();
    logApiResponse(tokenUrl, tokenData, { functionName: FUNCTION_NAME, method: "POST", context: "token exchange" });
    
    if (tokenData.code !== 0) {
      console.error("TikTok token exchange error:", tokenData);
      throw new Error(tokenData.message || "Failed to exchange authorization code");
    }

    const { access_token, advertiser_ids } = tokenData.data;

    if (!access_token || !advertiser_ids || advertiser_ids.length === 0) {
      throw new Error("No access token or advertiser accounts returned");
    }

    console.log(`Received access token for ${advertiser_ids.length} advertiser account(s)`);

    // ========== TOKEN CONTEXT DETECTION ==========
    let tokenContext: "USER" | "ADVERTISER" = "ADVERTISER";
    let tiktokUserInfo: any = null;
    
    try {
      const userInfoUrl = "https://business-api.tiktok.com/open_api/v1.3/oauth2/user/info/";
      logApiRequest(userInfoUrl, { functionName: FUNCTION_NAME, method: "GET", context: "token context detection" });
      
      const userInfoResponse = await fetch(userInfoUrl, {
        method: "GET",
        headers: { "Access-Token": access_token },
      });
      
      const userInfoData = await userInfoResponse.json();
      logApiResponse(userInfoUrl, userInfoData, { functionName: FUNCTION_NAME, method: "GET", context: "token context detection" });
      
      if (userInfoData.code === 0 && userInfoData.data) {
        const userData = userInfoData.data;
        if (userData.display_name || userData.avatar_url || userData.open_id) {
          tokenContext = "USER";
          tiktokUserInfo = {
            display_name: userData.display_name,
            avatar_url: userData.avatar_url,
            open_id: userData.open_id,
          };
          console.log(`⚠️ Token is USER-context (TikTok user: ${userData.display_name || userData.open_id})`);
        } else {
          console.log("✅ Token is ADVERTISER-context (no TikTok user profile returned)");
        }
      } else {
        console.log("✅ Token is ADVERTISER-context (user/info endpoint returned no profile)");
      }
    } catch (userInfoError) {
      console.log("Could not detect token context (defaulting to ADVERTISER):", userInfoError);
    }

    // Create initial sync progress
    const initialSyncProgress: SyncProgress = {
      status: 'pending',
      platform: 'tiktok',
      totalSteps: advertiser_ids.length,
      currentStep: 0,
      currentAssetType: 'advertisers',
      startedAt: new Date().toISOString()
    };

    let resultPlatformId: string;

    // If reconnecting existing platform
    if (platformId) {
      console.log(`Reconnecting platform ${platformId}, starting background sync for ${advertiser_ids.length} advertisers`);
      
      const { error: updateError } = await supabase
        .from("connected_platforms")
        .update({
          updated_at: new Date().toISOString(),
          is_active: true,
          metadata: { 
            advertiser_ids,
            sync_progress: initialSyncProgress,
            token_context: tokenContext,
            tiktok_user_info: tiktokUserInfo,
          }
        })
        .eq("id", platformId)
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      // Store token securely in Vault
      await storePlatformToken(supabase, platformId, access_token, 'access');
      
      resultPlatformId = platformId;
    } else {
      // Create new platform connection
      console.log(`Creating new platform connection, starting background sync for ${advertiser_ids.length} advertisers`);
      
      const { data: newPlatform, error: insertError } = await supabase
        .from("connected_platforms")
        .insert({
          user_id: user.id,
          platform_type: "tiktok",
          platform_name: "TikTok Ads",
          is_active: true,
          metadata: { 
            advertiser_ids,
            sync_progress: initialSyncProgress,
            token_context: tokenContext,
            tiktok_user_info: tiktokUserInfo,
          }
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Store token securely in Vault
      await storePlatformToken(supabase, newPlatform.id, access_token, 'access');
      
      resultPlatformId = newPlatform.id;
    }

    // Start background task to fetch advertiser details
    // @ts-ignore - EdgeRuntime is available in Deno Deploy
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        syncTikTokAdvertiserDetails(
          supabase,
          resultPlatformId,
          access_token,
          advertiser_ids,
          tokenContext,
          tiktokUserInfo,
          FUNCTION_NAME,
        )
      );
      console.log("Background sync task started via EdgeRuntime.waitUntil");
    } else {
      // Fallback: run synchronously if EdgeRuntime not available (local dev)
      console.log("EdgeRuntime not available, running sync in foreground");
      await syncTikTokAdvertiserDetails(
        supabase,
        resultPlatformId,
        access_token,
        advertiser_ids,
        tokenContext,
        tiktokUserInfo,
        FUNCTION_NAME,
      );
    }

    // Return immediately with platformId - frontend will poll for progress
    const warningMessage = tokenContext === "USER" 
      ? "⚠️ WARNING: This token is USER-context. It will ONLY work for Spark Ads. Dark Ads (CUSTOMIZED_USER) will fail. Re-authenticate from Business Center (not TikTok app) for Dark Ads support."
      : null;

    return new Response(
      JSON.stringify({
        success: true,
        platformId: resultPlatformId,
        syncInProgress: true,
        totalAdvertisers: advertiser_ids.length,
        token_context: tokenContext,
        warning: warningMessage,
        message: platformId 
          ? "TikTok connection renewed - syncing advertiser accounts in background" 
          : "TikTok connected - syncing advertiser accounts in background"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("TikTok OAuth callback error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to connect TikTok account" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
