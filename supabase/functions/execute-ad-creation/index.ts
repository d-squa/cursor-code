import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

/**
 * EXECUTE-AD-CREATION
 * 
 * Layer 4: Ad Creation Executor
 * 
 * This layer ONLY creates ads from validated configurations.
 * It does NOT decide which creative or identity to use - it only consumes validated inputs.
 * 
 * Key principles:
 * 1. Only process configs with validation_status = 'valid'
 * 2. Never upload or modify creative assets
 * 3. Use existing Creative Library video_id or image_id
 * 4. Support both Spark and Non-Spark ads
 * 5. Log all API calls for debugging
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExecuteRequest {
  configIds?: string[];    // Execute specific configs
  campaignId?: string;     // Execute all valid configs for a campaign
  adStatus?: "ENABLE" | "DISABLE"; // Create as enabled or paused
}

interface TikTokAdPayload {
  advertiser_id: string;
  adgroup_id: string;
  ad_name: string;
  ad_format: string;
  ad_text?: string;
  call_to_action?: string;
  landing_page_url?: string;
  display_name?: string;
  video_id?: string;
  image_ids?: string[];
  identity_id?: string;
  identity_type?: string;
  spark_ad?: boolean;
  operation_status?: string;
}

serve(async (req: Request) => {
  console.log("🚀 execute-ad-creation: Request received");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      throw new Error("Unauthorized");
    }
    console.log(`👤 User authenticated: ${user.id}`);

    // Parse request
    const body: ExecuteRequest = await req.json();
    const { configIds, campaignId, adStatus = "DISABLE" } = body;

    if (!configIds?.length && !campaignId) {
      throw new Error("Must provide configIds or campaignId");
    }

    // Fetch validated configs only
    let query = supabase
      .from("ad_push_configurations")
      .select(`
        *,
        creative_asset:creative_library_assets(*),
        identity:platform_identities(*)
      `)
      .eq("user_id", user.id)
      .eq("validation_status", "valid")
      .in("push_status", ["pending", "failed"]); // Only process pending or failed

    if (configIds?.length) {
      query = query.in("id", configIds);
    } else if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    const { data: configs, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch configs: ${fetchError.message}`);
    }

    if (!configs?.length) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No valid configurations to execute",
          results: [],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`📦 Executing ${configs.length} ad creations`);

    // Group by advertiser for efficient token retrieval
    const configsByAdvertiser = new Map<string, typeof configs>();
    for (const config of configs) {
      const existing = configsByAdvertiser.get(config.advertiser_id) || [];
      existing.push(config);
      configsByAdvertiser.set(config.advertiser_id, existing);
    }

    const results: Array<{
      configId: string;
      adName: string;
      success: boolean;
      dspAdId?: string;
      error?: string;
    }> = [];

    // Process each advertiser group
    for (const [advertiserId, advertiserConfigs] of configsByAdvertiser) {
      console.log(`\n📡 Processing ${advertiserConfigs.length} ads for advertiser ${advertiserId}`);

      // Get TikTok connection for this advertiser
      const { data: connections } = await supabase
        .from("connected_platforms")
        .select("id, metadata")
        .eq("user_id", user.id)
        .eq("platform_type", "tiktok")
        .eq("is_active", true);

      if (!connections?.length) {
        for (const config of advertiserConfigs) {
          results.push({
            configId: config.id,
            adName: config.ad_name,
            success: false,
            error: "No active TikTok connection",
          });
        }
        continue;
      }

      const connection = connections.find((c: any) =>
        Array.isArray(c.metadata?.advertiser_ids) &&
        c.metadata.advertiser_ids.map(String).includes(String(advertiserId))
      ) || connections[0];

      const accessToken = await getAccessToken(supabase, connection.id);
      if (!accessToken) {
        for (const config of advertiserConfigs) {
          results.push({
            configId: config.id,
            adName: config.ad_name,
            success: false,
            error: "Failed to retrieve access token",
          });
        }
        continue;
      }

      // Process each config for this advertiser
      for (const config of advertiserConfigs) {
        // Mark as pushing
        await supabase
          .from("ad_push_configurations")
          .update({ push_status: "pushing" })
          .eq("id", config.id);

        try {
          const result = await createTikTokAd(
            supabase,
            accessToken,
            config,
            adStatus,
            user.id
          );
          results.push(result);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          console.error(`❌ Failed to create ad for config ${config.id}:`, errorMessage);
          
          results.push({
            configId: config.id,
            adName: config.ad_name,
            success: false,
            error: errorMessage,
          });

          // Update config status
          await supabase
            .from("ad_push_configurations")
            .update({
              push_status: "failed",
              push_error: errorMessage,
              push_attempts: (config.push_attempts || 0) + 1,
            })
            .eq("id", config.id);
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log(`\n✅ Execution complete: ${successCount} success, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: results.length,
          success: successCount,
          failed: failedCount,
        },
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("❌ Error in execute-ad-creation:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

/**
 * Create a single TikTok ad
 */
async function createTikTokAd(
  supabase: any,
  accessToken: string,
  config: any,
  adStatus: string,
  userId: string
): Promise<{
  configId: string;
  adName: string;
  success: boolean;
  dspAdId?: string;
  error?: string;
}> {
  const asset = config.creative_asset;
  const identity = config.identity;

  // Build TikTok ad payload
  const payload: TikTokAdPayload = {
    advertiser_id: config.advertiser_id,
    adgroup_id: config.adgroup_id,
    ad_name: config.ad_name,
    ad_format: asset.asset_type === "video" ? "SINGLE_VIDEO" : "SINGLE_IMAGE",
    operation_status: adStatus,
  };

  // Set creative asset
  if (asset.asset_type === "video") {
    payload.video_id = asset.platform_asset_id;
  } else {
    payload.image_ids = [asset.platform_asset_id];
  }

  // Set ad copy
  if (config.ad_text) {
    payload.ad_text = config.ad_text;
  }

  // Set CTA and landing page
  if (config.call_to_action) {
    payload.call_to_action = config.call_to_action;
  }
  if (config.landing_page_url) {
    payload.landing_page_url = config.landing_page_url;
  }

  // Set display name
  if (config.display_name) {
    payload.display_name = config.display_name;
  }

  // ========== TikTok Identity Type Strategy ==========
  // DARK ADS: identity_type = CUSTOMIZED_USER, identity_id = advertiser_id
  // SPARK ADS: identity_type = TIKTOK_ACCOUNT, identity_id = tiktok_account_id
  //
  // CUSTOMIZED_USER with advertiser_id is the recommended approach for SaaS automation

  const isSparkAd = !!config.is_spark_ad;
  
  if (isSparkAd) {
    // Spark Ads: TIKTOK_ACCOUNT identity required with real TikTok account
    if (!identity?.identity_id) {
      throw new Error(
        "Spark Ads require a TikTok Account identity. Please configure an identity.",
      );
    }
    
    // Spark Ads only work with videos
    if (asset.asset_type !== "video") {
      throw new Error(
        "Spark Ads only support video content. Images cannot be used for Spark Ads.",
      );
    }
    
    payload.identity_type = "TIKTOK_ACCOUNT";
    payload.identity_id = String(identity.identity_id);
    payload.spark_ad = true;
  } else {
    // Dark Ads: CUSTOMIZED_USER with advertiser_id as identity_id
    payload.identity_type = "CUSTOMIZED_USER";
    payload.identity_id = config.advertiser_id; // Use advertiser_id for dark ads
  }

  console.log(`📤 Creating TikTok ad: ${config.ad_name}`);
  console.log(`   Format: ${payload.ad_format}`);
  console.log(`   Spark: ${config.is_spark_ad ? "Yes" : "No"}`);
  console.log(`   Identity: ${identity?.identity_type || "None"}`);

  // Log the request
  await supabase.from("ad_push_logs").insert({
    ad_config_id: config.id,
    user_id: userId,
    action: "push",
    status: "pending",
    request_payload: payload,
  });

  // Make TikTok API call
  const response = await fetch(
    "https://business-api.tiktok.com/open_api/v1.3/ad/create/",
    {
      method: "POST",
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const responseData = await response.json();
  console.log(`📥 TikTok response: code=${responseData.code}`);

  // Log the response
  const logEntry = {
    ad_config_id: config.id,
    user_id: userId,
    action: "push",
    status: responseData.code === 0 ? "success" : "failed",
    request_payload: payload,
    response_payload: responseData,
    error_message: responseData.code !== 0 ? responseData.message : null,
    error_code: responseData.code !== 0 ? String(responseData.code) : null,
  };

  await supabase.from("ad_push_logs").insert(logEntry);

  if (responseData.code === 0) {
    const adId = responseData.data?.ad_ids?.[0] || responseData.data?.ad_id;
    
    // Update config with success
    await supabase
      .from("ad_push_configurations")
      .update({
        push_status: "success",
        dsp_ad_id: adId,
        dsp_ad_status: adStatus,
        pushed_at: new Date().toISOString(),
        push_attempts: (config.push_attempts || 0) + 1,
      })
      .eq("id", config.id);

    console.log(`✅ Ad created successfully: ${adId}`);

    return {
      configId: config.id,
      adName: config.ad_name,
      success: true,
      dspAdId: adId,
    };
  } else {
    // Handle specific TikTok errors
    let errorMessage = responseData.message || "Unknown TikTok error";
    
    // Check for identity-related errors
    if (responseData.code === 40002 || responseData.code === 40700) {
      errorMessage = `Identity authorization error: ${responseData.message}. Try using a brand-owned identity or Non-Spark Ad.`;
    }

    // Update config with failure
    await supabase
      .from("ad_push_configurations")
      .update({
        push_status: "failed",
        push_error: errorMessage,
        push_attempts: (config.push_attempts || 0) + 1,
      })
      .eq("id", config.id);

    console.log(`❌ Ad creation failed: ${errorMessage}`);

    return {
      configId: config.id,
      adName: config.ad_name,
      success: false,
      error: errorMessage,
    };
  }
}
