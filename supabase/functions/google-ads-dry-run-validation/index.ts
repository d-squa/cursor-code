import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

/**
 * GOOGLE-ADS-DRY-RUN-VALIDATION
 * 
 * Validates campaign configurations against Google Ads API using
 * the `validate_only: true` flag on mutate requests.
 * 
 * Supports: Search, Display, Video, PMax, Demand Gen campaign types.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_ADS_API_VERSION = "v18";

// Google Ads campaign types and their objectives
const CAMPAIGN_TYPES = {
  SEARCH: {
    advertisingChannelType: "SEARCH",
    objectives: ["LEADS", "SALES", "WEBSITE_TRAFFIC"],
    biddingStrategies: ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "TARGET_CPA", "TARGET_ROAS", "MANUAL_CPC"],
  },
  DISPLAY: {
    advertisingChannelType: "DISPLAY",
    objectives: ["AWARENESS", "CONSIDERATION", "LEADS", "SALES"],
    biddingStrategies: ["MAXIMIZE_CONVERSIONS", "TARGET_CPA", "MAXIMIZE_CLICKS", "TARGET_IMPRESSION_SHARE"],
  },
  VIDEO: {
    advertisingChannelType: "VIDEO",
    objectives: ["AWARENESS", "CONSIDERATION", "LEADS", "SALES"],
    biddingStrategies: ["TARGET_CPM", "TARGET_CPV", "MAXIMIZE_CONVERSIONS", "TARGET_CPA"],
    subTypes: ["VIDEO_RESPONSIVE", "VIDEO_NON_SKIPPABLE_IN_STREAM", "VIDEO_OUTSTREAM", "VIDEO_ACTION"],
  },
  PERFORMANCE_MAX: {
    advertisingChannelType: "PERFORMANCE_MAX",
    objectives: ["SALES", "LEADS", "WEBSITE_TRAFFIC", "LOCAL_STORE_VISITS"],
    biddingStrategies: ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "TARGET_CPA", "TARGET_ROAS"],
  },
  DEMAND_GEN: {
    advertisingChannelType: "DEMAND_GEN",
    objectives: ["SALES", "LEADS", "WEBSITE_TRAFFIC"],
    biddingStrategies: ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "TARGET_CPA", "MAXIMIZE_CLICKS"],
  },
};

interface ValidationRequest {
  customerId: string;
  campaignType: keyof typeof CAMPAIGN_TYPES;
  campaignName: string;
  budget: number;
  budgetType: "daily" | "lifetime";
  biddingStrategy: string;
  bidAmount?: number;
  startDate: string;
  endDate?: string;
  targeting?: {
    locations?: string[];
    languages?: string[];
    keywords?: string[];
    audiences?: string[];
    ageRanges?: string[];
    genders?: string[];
  };
}

interface ValidationResult {
  isValid: boolean;
  campaignType: string;
  errors: Array<{
    field: string;
    message: string;
    errorCode?: string;
  }>;
  warnings: Array<{
    field: string;
    message: string;
  }>;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) throw new Error("Unauthorized");

    const body: ValidationRequest = await req.json();
    const { customerId, campaignType, campaignName, budget, budgetType, biddingStrategy, bidAmount, startDate, endDate, targeting } = body;

    if (!customerId || !campaignType || !campaignName || !budget) {
      throw new Error("customerId, campaignType, campaignName, and budget are required");
    }

    console.log(`🔍 Validating Google Ads ${campaignType} campaign: ${campaignName}`);

    // Get platform connection
    const { data: platform } = await supabase
      .from("connected_platforms")
      .select("id, access_token")
      .eq("user_id", user.id)
      .eq("platform_type", "google")
      .eq("is_active", true)
      .single();

    if (!platform) throw new Error("Google Ads platform not connected");

    const accessToken = await getAccessToken(supabase, platform.id, platform.access_token);
    if (!accessToken) throw new Error("Google Ads access token not found");

    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN not set");

    const managerAccountId = Deno.env.get("GOOGLE_ADS_MANAGER_ACCOUNT_ID");
    const cleanCustomerId = customerId.replace(/-/g, "");

    const apiHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    if (managerAccountId) {
      apiHeaders["login-customer-id"] = managerAccountId.replace(/-/g, "");
    }

    const result: ValidationResult = {
      isValid: true,
      campaignType,
      errors: [],
      warnings: [],
    };

    const typeConfig = CAMPAIGN_TYPES[campaignType];
    if (!typeConfig) {
      result.isValid = false;
      result.errors.push({ field: "campaignType", message: `Unknown campaign type: ${campaignType}` });
      return respond(result);
    }

    // Validate bidding strategy compatibility
    if (!typeConfig.biddingStrategies.includes(biddingStrategy)) {
      result.warnings.push({
        field: "biddingStrategy",
        message: `${biddingStrategy} may not be optimal for ${campaignType}. Recommended: ${typeConfig.biddingStrategies.join(", ")}`,
      });
    }

    // Validate budget minimums
    const MIN_DAILY_BUDGET_MICROS = 1_000_000; // $1/day minimum
    const budgetMicros = Math.round(budget * 1_000_000);
    if (budgetType === "daily" && budgetMicros < MIN_DAILY_BUDGET_MICROS) {
      result.isValid = false;
      result.errors.push({
        field: "budget",
        message: `Daily budget must be at least $1.00. Current: $${budget.toFixed(2)}`,
      });
    }

    // Format dates for Google Ads (YYYY-MM-DD)
    const formatDate = (d: string) => d.split("T")[0];

    // Step 1: Validate campaign creation with validate_only
    try {
      const campaignBudgetOp = {
        create: {
          name: `${campaignName} Budget`,
          amountMicros: String(budgetMicros),
          deliveryMethod: "STANDARD",
          ...(budgetType === "daily"
            ? {}
            : { totalAmountMicros: String(budgetMicros) }),
        },
      };

      // Create temp budget resource name
      const tempBudgetResourceName = `customers/${cleanCustomerId}/campaignBudgets/-1`;

      const budgetMutateUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/campaignBudgets:mutate`;
      const budgetResp = await fetch(budgetMutateUrl, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          operations: [campaignBudgetOp],
          validateOnly: true,
        }),
      });

      if (!budgetResp.ok) {
        const errData = await budgetResp.json();
        const errors = extractGoogleErrors(errData);
        result.errors.push(...errors.map(e => ({ field: "budget", message: e.message, errorCode: e.code })));
        result.isValid = false;
      } else {
        await budgetResp.text(); // consume body
      }
    } catch (e: any) {
      result.warnings.push({ field: "budget", message: `Budget validation skipped: ${e.message}` });
    }

    // Step 2: Validate campaign with validate_only
    try {
      const campaignOp = {
        create: {
          name: campaignName,
          advertisingChannelType: typeConfig.advertisingChannelType,
          status: "PAUSED",
          campaignBudget: `customers/${cleanCustomerId}/campaignBudgets/-1`,
          ...(startDate ? { startDate: formatDate(startDate) } : {}),
          ...(endDate ? { endDate: formatDate(endDate) } : {}),
          ...buildBiddingStrategy(biddingStrategy, bidAmount),
        },
      };

      const campaignMutateUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/campaigns:mutate`;
      const campaignResp = await fetch(campaignMutateUrl, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          operations: [campaignOp],
          validateOnly: true,
        }),
      });

      if (!campaignResp.ok) {
        const errData = await campaignResp.json();
        const errors = extractGoogleErrors(errData);
        result.errors.push(...errors.map(e => ({ field: "campaign", message: e.message, errorCode: e.code })));
        result.isValid = false;
      } else {
        await campaignResp.text();
      }
    } catch (e: any) {
      result.warnings.push({ field: "campaign", message: `Campaign validation skipped: ${e.message}` });
    }

    // Step 3: Validate targeting (ad group level) if provided
    if (targeting && Object.keys(targeting).length > 0) {
      // Client-side validation for targeting
      if (campaignType === "SEARCH" && (!targeting.keywords || targeting.keywords.length === 0)) {
        result.warnings.push({
          field: "targeting.keywords",
          message: "Search campaigns typically require at least one keyword",
        });
      }

      if (!targeting.locations || targeting.locations.length === 0) {
        result.warnings.push({
          field: "targeting.locations",
          message: "No location targeting specified - campaign will target all locations",
        });
      }
    }

    console.log(`✅ Validation complete: ${result.isValid ? "PASS" : "FAIL"}, ${result.errors.length} errors, ${result.warnings.length} warnings`);

    return respond(result);
  } catch (error: any) {
    console.error("google-ads-dry-run-validation error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function respond(result: ValidationResult) {
  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function buildBiddingStrategy(strategy: string, bidAmount?: number): Record<string, any> {
  switch (strategy) {
    case "MAXIMIZE_CONVERSIONS":
      return { maximizeConversions: bidAmount ? { targetCpa: String(Math.round(bidAmount * 1_000_000)) } : {} };
    case "MAXIMIZE_CONVERSION_VALUE":
      return { maximizeConversionValue: bidAmount ? { targetRoas: bidAmount } : {} };
    case "TARGET_CPA":
      return { targetCpa: { targetCpaMicros: String(Math.round((bidAmount || 10) * 1_000_000)) } };
    case "TARGET_ROAS":
      return { targetRoas: { targetRoas: bidAmount || 2.0 } };
    case "MAXIMIZE_CLICKS":
      return { maximizeClicks: bidAmount ? { cpcBidCeilingMicros: String(Math.round(bidAmount * 1_000_000)) } : {} };
    case "TARGET_CPM":
      return { targetCpm: {} };
    case "TARGET_CPV":
      return { targetCpv: {} };
    case "MANUAL_CPC":
      return { manualCpc: { enhancedCpcEnabled: true } };
    case "TARGET_IMPRESSION_SHARE":
      return { targetImpressionShare: { location: "ANYWHERE_ON_PAGE", locationFractionMicros: 500000 } };
    default:
      return { maximizeConversions: {} };
  }
}

function extractGoogleErrors(errData: any): Array<{ message: string; code: string }> {
  const errors: Array<{ message: string; code: string }> = [];
  
  if (errData?.error?.details) {
    for (const detail of errData.error.details) {
      if (detail.errors) {
        for (const err of detail.errors) {
          errors.push({
            message: err.message || JSON.stringify(err.errorCode),
            code: Object.keys(err.errorCode || {})[0] || "UNKNOWN",
          });
        }
      }
    }
  }
  
  if (errors.length === 0 && errData?.error?.message) {
    errors.push({ message: errData.error.message, code: String(errData.error.code || "UNKNOWN") });
  }

  return errors;
}
