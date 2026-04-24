import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

/**
 * VALIDATE-AD-CONFIG
 * 
 * Layer 3: Pre-flight Validation
 * 
 * Validates ad configurations before they can be pushed.
 * This is a critical safety layer that prevents API errors.
 * 
 * Validation checks:
 * 1. Creative asset exists and is approved
 * 2. Identity is active and accessible
 * 3. Spark eligibility (if spark_ad = true)
 * 4. Required fields are present
 * 5. Platform-specific requirements
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidationRequest {
  configIds?: string[];  // Validate specific configs
  campaignId?: string;   // Validate all configs for a campaign
  dryRun?: boolean;      // Just validate, don't update status
}

interface ValidationError {
  field: string;
  code: string;
  message: string;
  severity: "error" | "warning";
}

serve(async (req: Request) => {
  console.log("✅ validate-ad-config: Request received");

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
    const body: ValidationRequest = await req.json();
    const { configIds, campaignId, dryRun = false } = body;

    if (!configIds?.length && !campaignId) {
      throw new Error("Must provide configIds or campaignId");
    }

    // Fetch configs to validate
    let query = supabase
      .from("ad_push_configurations")
      .select(`
        *,
        creative_asset:creative_library_assets(*),
        identity:platform_identities(*)
      `)
      .eq("user_id", user.id);

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
          message: "No configurations to validate",
          results: [],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`🔍 Validating ${configs.length} configurations`);

    const results: Array<{
      configId: string;
      adName: string;
      isValid: boolean;
      errors: ValidationError[];
      warnings: ValidationError[];
    }> = [];

    for (const config of configs) {
      const errors: ValidationError[] = [];
      const warnings: ValidationError[] = [];

      // === VALIDATION CHECKS ===

      // 1. Creative asset validation
      if (!config.creative_asset) {
        errors.push({
          field: "creative_asset_id",
          code: "ASSET_NOT_FOUND",
          message: "Creative asset not found",
          severity: "error",
        });
      } else {
        const asset = config.creative_asset;

        // ========== CRITICAL: TikTok Creative Origin Validation ==========
        // API-uploaded creatives are NOT delivery-eligible on TikTok.
        // Only UI_SYNC creatives (uploaded via TikTok Ads Manager) can be used for ads.
        if (config.platform === "tiktok") {
          const creativeOrigin = asset.creative_origin || "API_UPLOAD";
          if (creativeOrigin === "API_UPLOAD") {
            errors.push({
              field: "creative_asset",
              code: "TIKTOK_API_UPLOAD_NOT_ELIGIBLE",
              message: "TikTok requires creatives to be uploaded via Ads Manager. API-uploaded creatives cannot be used for ad delivery. Please upload this creative in TikTok Ads Manager, then sync your Creative Library.",
              severity: "error",
            });
          }
        }

        // Check approval status
        if (asset.approval_status !== "approved") {
          errors.push({
            field: "creative_asset",
            code: "ASSET_NOT_APPROVED",
            message: `Creative asset status is '${asset.approval_status}', must be 'approved'`,
            severity: "error",
          });
        }

        // Check advertiser match
        if (asset.advertiser_id !== config.advertiser_id) {
          errors.push({
            field: "creative_asset",
            code: "ASSET_ADVERTISER_MISMATCH",
            message: "Creative asset belongs to a different advertiser",
            severity: "error",
          });
        }

        // Check platform match
        if (asset.platform !== config.platform) {
          errors.push({
            field: "creative_asset",
            code: "ASSET_PLATFORM_MISMATCH",
            message: `Creative asset is for ${asset.platform}, but config is for ${config.platform}`,
            severity: "error",
          });
        }

        // Spark ad eligibility
        if (config.is_spark_ad && !asset.spark_eligible) {
          errors.push({
            field: "is_spark_ad",
            code: "SPARK_NOT_ELIGIBLE",
            message: "Creative asset is not eligible for Spark Ads",
            severity: "error",
          });
        }
      }

      // 2. Identity validation (required for TikTok)
      if (config.platform === "tiktok") {
        if (!config.identity_id) {
          // Non-Spark ads might work without identity on some accounts
          if (config.is_spark_ad) {
            errors.push({
              field: "identity_id",
              code: "IDENTITY_REQUIRED_FOR_SPARK",
              message: "Identity is required for Spark Ads",
              severity: "error",
            });
          } else {
            warnings.push({
              field: "identity_id",
              code: "IDENTITY_RECOMMENDED",
              message: "Identity is recommended for better ad performance",
              severity: "warning",
            });
          }
        } else if (!config.identity) {
          errors.push({
            field: "identity_id",
            code: "IDENTITY_NOT_FOUND",
            message: "Identity not found in database",
            severity: "error",
          });
        } else {
          const identity = config.identity;

          // Check if identity is active
          if (!identity.is_active) {
            errors.push({
              field: "identity",
              code: "IDENTITY_INACTIVE",
              message: "Identity is not active",
              severity: "error",
            });
          }

          // Check advertiser match
          if (identity.advertiser_id !== config.advertiser_id) {
            errors.push({
              field: "identity",
              code: "IDENTITY_ADVERTISER_MISMATCH",
              message: "Identity belongs to a different advertiser",
              severity: "error",
            });
          }

          // Spark ad with non-brand identity
          if (config.is_spark_ad && identity.requires_authorization) {
            warnings.push({
              field: "identity",
              code: "SPARK_REQUIRES_CREATOR_AUTH",
              message: "Spark Ads with creator identity require creator authorization",
              severity: "warning",
            });
          }

          // Recommend brand identity for non-Spark
          if (!config.is_spark_ad && !identity.is_brand_owned) {
            warnings.push({
              field: "identity",
              code: "BRAND_IDENTITY_RECOMMENDED",
              message: "Brand-owned identity is recommended for Non-Spark Ads",
              severity: "warning",
            });
          }
        }
      }

      // 3. Required fields validation
      if (!config.ad_name?.trim()) {
        errors.push({
          field: "ad_name",
          code: "AD_NAME_REQUIRED",
          message: "Ad name is required",
          severity: "error",
        });
      }

      if (!config.adgroup_id) {
        errors.push({
          field: "adgroup_id",
          code: "ADGROUP_REQUIRED",
          message: "Ad group ID is required",
          severity: "error",
        });
      }

      // 4. Platform-specific validations
      if (config.platform === "tiktok") {
        // TikTok CTA validation
        const validCTAs = [
          "BOOK_NOW", "CONTACT_US", "DOWNLOAD", "GET_QUOTE", "GET_SHOWTIMES",
          "INSTALL_NOW", "LEARN_MORE", "LISTEN_NOW", "ORDER_NOW", "PLAY_GAME",
          "READ_MORE", "SHOP_NOW", "SIGN_UP", "SUBSCRIBE", "VIEW_NOW", "WATCH_NOW",
          "APPLY_NOW", "GET_TICKETS", "VISIT_STORE", "INTERESTED", "READ_MORE",
        ];
        
        if (config.call_to_action && !validCTAs.includes(config.call_to_action)) {
          warnings.push({
            field: "call_to_action",
            code: "INVALID_CTA",
            message: `CTA '${config.call_to_action}' may not be valid for TikTok`,
            severity: "warning",
          });
        }

        // Landing page validation
        if (config.landing_page_url) {
          try {
            new URL(config.landing_page_url);
          } catch {
            errors.push({
              field: "landing_page_url",
              code: "INVALID_URL",
              message: "Landing page URL is not valid",
              severity: "error",
            });
          }
        }
      }

      // Google Performance Max — enforce per-asset-group minimums.
      // (3 headlines ≤30, 1 long headline ≤90, 2 descriptions ≤90 with ≥1 ≤60,
      //  business name ≤25, final URL, ≥1 marketing image, ≥1 square, ≥1 logo).
      if (config.platform === "google") {
        const isPmax = String(config.ad_strategy || "").toLowerCase().includes("pmax") ||
          String(config.ad_strategy || "").toLowerCase().includes("performance");
        if (isPmax) {
          // Group all sibling configs by (market, phase, ad_group) to validate
          // the whole asset group, not just this row.
          const { data: siblings } = await supabase
            .from("creative_assignments")
            .select("*, creatives:creative_id(width, height, name, original_filename, folder_path, creative_type)")
            .eq("campaign_id", config.campaign_id)
            .eq("platform", "google")
            .eq("market", config.market)
            .eq("phase_name", config.phase_name)
            .eq("ad_group_name", config.ad_group_name || config.ad_set_name);

          const group = siblings || [config];
          const text = (() => {
            const sample = group.reduce((best: any, cur: any) => {
              const score = (r: any) => [r.headline, r.headline_2, r.headline_3, r.headline_4, r.headline_5,
                r.description, r.description_2, r.description_3, r.description_4, r.description_5,
                r.long_headline_1, r.business_name].filter(Boolean).length;
              return score(cur) > score(best) ? cur : best;
            }, group[0] || config);
            return {
              headlines: [sample.headline, sample.headline_2, sample.headline_3, sample.headline_4, sample.headline_5]
                .map((v: any) => String(v || "").trim()).filter(Boolean),
              longHeadlines: [sample.long_headline_1, sample.long_headline_2, sample.long_headline_3, sample.long_headline_4, sample.long_headline_5]
                .map((v: any) => String(v || "").trim()).filter(Boolean),
              descriptions: [sample.description, sample.description_2, sample.description_3, sample.description_4, sample.description_5]
                .map((v: any) => String(v || "").trim()).filter(Boolean),
              businessName: String(sample.business_name || sample.brand_name || "").trim(),
              finalUrl: String(sample.destination_url || "").trim(),
            };
          })();

          if (text.headlines.length < 3) {
            errors.push({ field: "headlines", code: "PMAX_MIN_HEADLINES", message: `PMax requires 3 headlines (≤30 chars). Found ${text.headlines.length}.`, severity: "error" });
          }
          if (text.headlines.some((h) => h.length > 30)) {
            errors.push({ field: "headlines", code: "PMAX_HEADLINE_TOO_LONG", message: "Headline exceeds 30 chars.", severity: "error" });
          }
          if (text.longHeadlines.length < 1) {
            errors.push({ field: "long_headline_1", code: "PMAX_MIN_LONG_HEADLINES", message: "PMax requires 1 long headline (≤90 chars).", severity: "error" });
          }
          if (text.longHeadlines.some((h) => h.length > 90)) {
            errors.push({ field: "long_headline_1", code: "PMAX_LONG_HEADLINE_TOO_LONG", message: "Long headline exceeds 90 chars.", severity: "error" });
          }
          if (text.descriptions.length < 2) {
            errors.push({ field: "descriptions", code: "PMAX_MIN_DESCRIPTIONS", message: `PMax requires 2 descriptions (≤90; ≥1 ≤60). Found ${text.descriptions.length}.`, severity: "error" });
          } else if (!text.descriptions.some((d) => d.length > 0 && d.length <= 60)) {
            errors.push({ field: "descriptions", code: "PMAX_SHORT_DESCRIPTION_REQUIRED", message: "At least one description must be ≤60 chars.", severity: "error" });
          }
          if (text.descriptions.some((d) => d.length > 90)) {
            errors.push({ field: "descriptions", code: "PMAX_DESCRIPTION_TOO_LONG", message: "Description exceeds 90 chars.", severity: "error" });
          }
          if (!text.businessName) {
            errors.push({ field: "business_name", code: "PMAX_BUSINESS_NAME_REQUIRED", message: "Business name is required (≤25 chars).", severity: "error" });
          } else if (text.businessName.length > 25) {
            errors.push({ field: "business_name", code: "PMAX_BUSINESS_NAME_TOO_LONG", message: `Business name exceeds 25 chars (${text.businessName.length}).`, severity: "error" });
          }
          if (!text.finalUrl) {
            errors.push({ field: "destination_url", code: "PMAX_FINAL_URL_REQUIRED", message: "Final URL is required.", severity: "error" });
          }

          // Image bucketing across the group
          const TOL = 0.05;
          let marketing = 0, square = 0, logo = 0;
          for (const s of group) {
            const c = (s as any).creatives;
            if (!c || c.creative_type === "video") continue;
            const w = Number(c.width || 0), h = Number(c.height || 0);
            if (!w || !h) continue;
            const ar = w / h;
            const isSquare = Math.abs(ar - 1.0) <= TOL;
            const is191 = Math.abs(ar - 1.91) <= TOL * 1.91;
            const hay = `${c.name || ""} ${c.original_filename || ""} ${c.folder_path || ""}`.toLowerCase();
            const isLogoTagged = /\blogo\b/.test(hay) || (isSquare && Math.max(w, h) <= 512);
            if (isLogoTagged && isSquare && w >= 128 && h >= 128) { logo++; continue; }
            if (is191 && w >= 600 && h >= 314) { marketing++; continue; }
            if (isSquare && w >= 300 && h >= 300) { square++; continue; }
          }
          if (marketing < 1) {
            errors.push({ field: "images", code: "PMAX_MISSING_MARKETING_IMAGE", message: "Need ≥1 Marketing Image (1.91:1, ≥600×314).", severity: "error" });
          }
          if (square < 1) {
            errors.push({ field: "images", code: "PMAX_MISSING_SQUARE_IMAGE", message: "Need ≥1 Square Marketing Image (1:1, ≥300×300).", severity: "error" });
          }
          if (logo < 1) {
            errors.push({ field: "images", code: "PMAX_MISSING_LOGO", message: "Need ≥1 Logo (1:1, ≥128×128). Tag with 'logo' in filename or folder.", severity: "error" });
          }
        }
      }

      // Determine overall validity
      const isValid = errors.length === 0;

      results.push({
        configId: config.id,
        adName: config.ad_name || "Unnamed",
        isValid,
        errors,
        warnings,
      });

      // Update validation status in database (unless dry run)
      if (!dryRun) {
        await supabase
          .from("ad_push_configurations")
          .update({
            validation_status: isValid ? "valid" : "invalid",
            validation_errors: errors,
            validated_at: new Date().toISOString(),
          })
          .eq("id", config.id);

        // Log validation attempt
        await supabase.from("ad_push_logs").insert({
          ad_config_id: config.id,
          user_id: user.id,
          action: "validate",
          status: isValid ? "success" : "failed",
          response_payload: { errors, warnings },
          error_message: isValid ? null : errors.map(e => e.message).join("; "),
        });
      }
    }

    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.filter(r => !r.isValid).length;

    console.log(`✅ Validation complete: ${validCount} valid, ${invalidCount} invalid`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: results.length,
          valid: validCount,
          invalid: invalidCount,
        },
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("❌ Error in validate-ad-config:", error);
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
