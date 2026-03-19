import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase for auth verification
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    console.log("Meta forecast request (authenticated user):", user.id);

    // Input validation
    if (!body.markets || !Array.isArray(body.markets) || body.markets.length === 0) {
      throw new Error('Markets array is required and must not be empty');
    }
    if (body.markets.length > 50) {
      throw new Error('Maximum 50 markets allowed per request');
    }

    // Resolve Meta connection - support explicit connectedPlatformId or auto-detect
    let platformData: any = null;

    if (body.connectedPlatformId) {
      // Use explicitly provided connection
      const { data, error } = await supabase
        .from('connected_platforms')
        .select('id, access_token, ad_account_id')
        .eq('id', body.connectedPlatformId)
        .eq('platform_type', 'meta')
        .eq('is_active', true)
        .single();
      if (!error && data) platformData = data;
    }

    if (!platformData) {
      // Fallback: find any accessible Meta connection (user-owned or team-shared)
      const { data: teamRoles } = await supabase
        .from('user_roles')
        .select('team_id')
        .eq('user_id', user.id)
        .not('team_id', 'is', null);
      
      const teamIds = (teamRoles || []).map((r: any) => r.team_id).filter(Boolean);
      
      let query = supabase
        .from('connected_platforms')
        .select('id, access_token, ad_account_id')
        .eq('platform_type', 'meta')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (teamIds.length > 0) {
        const filters = [`user_id.eq.${user.id}`, ...teamIds.map((tid: string) => `team_id.eq.${tid}`)];
        query = query.or(filters.join(','));
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) platformData = data[0];
    }

    if (!platformData) {
      console.error("No Meta platform connected for user:", user.id);
      throw new Error("Meta platform not connected. Please connect your Meta account in Settings.");
    }

    // Get token from Vault with fallback to database column
    const accessToken = await getAccessToken(supabase, platformData.id, platformData.access_token);
    if (!accessToken) {
      throw new Error("Meta access token not found. Please reconnect your Meta account.");
    }

    // Helper to strip act_ prefix
    const toNumeric = (v: string) => String(v).replace(/^act_/i, '');

    // Resolve ad account ID: prefer body.adAccountId, then platform, then env
    let adAccountIdRaw = body.adAccountId || platformData.ad_account_id || Deno.env.get("META_AD_ACCOUNT_ID") || '';
    let adAccountId = toNumeric(String(adAccountIdRaw));
    
    // Get user's team IDs for team-scoped lookups
    const { data: teamRolesForAcct } = await supabase
      .from('user_roles')
      .select('team_id')
      .eq('user_id', user.id)
      .not('team_id', 'is', null);
    const userTeamIds = (teamRolesForAcct || []).map((r: any) => r.team_id).filter(Boolean);

    // Validate against meta_ad_accounts table
    if (adAccountId) {
      const { data: validAccount } = await supabase
        .from('meta_ad_accounts')
        .select('account_id')
        .or(`account_id.eq.act_${adAccountId},account_id.eq.${adAccountIdRaw}`)
        .limit(1);
      
      if (validAccount && validAccount.length > 0) {
        adAccountId = toNumeric(validAccount[0].account_id);
      } else {
        // Provided ID is invalid — fallback to any account accessible by user or team
        console.warn(`⚠️ Ad account ${adAccountId} not found, attempting team-aware fallback...`);
        adAccountId = '';
      }
    }
    
    // If still no valid account, find one via user_id or team membership
    if (!adAccountId) {
      let fallbackQuery = supabase
        .from('meta_ad_accounts')
        .select('account_id')
        .limit(1);
      
      if (userTeamIds.length > 0) {
        const filters = [`user_id.eq.${user.id}`, ...userTeamIds.map((tid: string) => `team_id.eq.${tid}`)];
        fallbackQuery = fallbackQuery.or(filters.join(','));
      } else {
        fallbackQuery = fallbackQuery.eq('user_id', user.id);
      }
      
      const { data: fallbackAccounts } = await fallbackQuery;
      if (fallbackAccounts && fallbackAccounts.length > 0) {
        adAccountId = toNumeric(fallbackAccounts[0].account_id);
        console.log(`🔄 Using fallback ad account: ${adAccountId}`);
      }
    }

    if (!adAccountId) {
      throw new Error("No ad account configured. Please select an ad account in Settings.");
    }

    console.log("Using ad account:", adAccountId);

    // Validate and normalize markets to ISO-2 country codes
    const validatedMarkets: string[] = [];
    for (const market of body.markets) {
      console.log("*FC*Validated markets Before Normalizing:", market);
      const normalized = market.trim().toUpperCase();
      // ISO-2 country codes are exactly 2 uppercase letters
      if (!/^[A-Z]{2}$/.test(normalized)) {
        throw new Error(`Invalid country code: "${market}". Must be 2-letter ISO code (e.g., US, CA, GB).`);
      }
      validatedMarkets.push(normalized);
    }

    console.log("Validated markets:", validatedMarkets);

    // Build targeting spec with validated markets
    const targetingSpec: any = {
      geo_locations: {
        countries: validatedMarkets,
      },
      age_min: 18,
      age_max: 65,
    };

    // Add gender targeting
    if (body.gender && body.gender !== "all") {
      targetingSpec.genders = body.gender === "male" ? [1] : [2];
    }

    // Add age targeting
    if (body.ageMin) targetingSpec.age_min = body.ageMin;
    if (body.ageMax) targetingSpec.age_max = body.ageMax;

    // Map strategy focus to Meta optimization goals
    const strategyFocusMap: Record<string, { goal: string; metric: string; metricName: string }> = {
      purchase: { goal: "OFFSITE_CONVERSIONS", metric: "conversions", metricName: "Conversions" },
      leads: { goal: "LEAD_GENERATION", metric: "leads", metricName: "Leads" },
      "app-installs": { goal: "APP_INSTALLS", metric: "app_installs", metricName: "App Installs" },
      conversions: { goal: "OFFSITE_CONVERSIONS", metric: "conversions", metricName: "Conversions" },
      "brand-awareness": { goal: "REACH", metric: "reach", metricName: "Reach" },
      traffic: { goal: "LINK_CLICKS", metric: "clicks", metricName: "Link Clicks" },
    };

    const strategyConfig = strategyFocusMap[body.strategyFocus] || strategyFocusMap["conversions"];

    // Force REACH objective for reach estimate API
    const optimization_goal = "REACH";
    const objective = "REACH";
    const billing_event = "IMPRESSIONS";
    const frequency_cap = 2;
    const prediction_mode = 1;
    // Call Reach Estimate API
    // Note: reachestimate API does NOT support currency parameter
    // It returns estimates based on the ad account's currency
    const reachParams = new URLSearchParams({
      access_token: accessToken,
      targeting_spec: JSON.stringify(targetingSpec),
      optimization_goal,
      objective,
      billing_event,
      frequency_cap: frequency_cap.toString(),
      prediction_mode: prediction_mode.toString(),
    });

    // Mask token in logs for security
    const maskedParams = reachParams.toString().replace(/access_token=[^&]+/, "access_token=***");
    console.log("Calling Reach Estimate API with params:", maskedParams);
    console.log("🔗 FULL API URL FOR GRAPH API EXPLORER (copy entire line below):");
    console.log(`https://graph.facebook.com/v21.0/act_${adAccountId}/reachestimate?${reachParams.toString()}`);

    const reachResponse = await fetch(
      `https://graph.facebook.com/v21.0/act_${adAccountId}/reachestimate?${reachParams.toString()}`,
    );

    if (!reachResponse.ok) {
      const errorText = await reachResponse.text();
      console.error("Reach estimate error:", errorText);

      // Parse error to provide better messages
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.code === 190) {
          throw new Error(
            "INVALID_TOKEN: Meta access token is invalid or expired. Please generate a new user access token with ads_read permission.",
          );
        }
        if (
          errorData.error?.code === 200 &&
          errorData.error?.message?.includes("NOT grant ads_management or ads_read permission")
        ) {
          throw new Error(
            "PERMISSION_ERROR: Meta access token does not have ads_read permission. Please generate a user access token with ads_read permission from the Meta Business Suite.",
          );
        }
      } catch (parseErr) {
        // If we can't parse, continue with generic error
      }

      throw new Error(`Reach estimate failed: ${errorText}`);
    }

    const reachData = await reachResponse.json();
    console.log("Reach estimate response:", JSON.stringify(reachData, null, 2));

    // Parse response and calculate metrics
    const estimateData = reachData.data?.[0] || reachData.data || reachData;
    // The API returns users_lower_bound/users_upper_bound, NOT a "users" field
    const usersLower = Number(estimateData.users_lower_bound) || 0;
    const usersUpper = Number(estimateData.users_upper_bound) || 0;
    const users = usersUpper > 0 ? Math.round((usersLower + usersUpper) / 2) : (Number(estimateData.users) || 0);
    const budget = body.budget || 0;

    console.log("Parsed audience size:", { usersLower, usersUpper, users });

    // Calculate estimates based on industry benchmarks and optimization goal
    const avgCPM = 10; // $10 CPM average
    const avgCTR = 0.9; // 0.9% CTR average

    const impressions = Math.round((budget / avgCPM) * 1000);
    const reach = Math.min(users, Math.round(impressions * 0.7)); // Reach is typically 70% of impressions
    const clicks = Math.round(impressions * (avgCTR / 100));

    // Calculate results based on optimization goal
    let results = 0;
    let resultRate = 0;

    if (strategyConfig.metric === "reach") {
      results = reach;
      resultRate = (reach / impressions) * 100;
    } else if (strategyConfig.metric === "clicks") {
      results = clicks;
      resultRate = avgCTR;
    } else if (strategyConfig.metric === "leads") {
      const leadRate = 3; // 3% lead rate for lead gen campaigns
      results = Math.round(clicks * (leadRate / 100));
      resultRate = leadRate;
    } else if (strategyConfig.metric === "app_installs") {
      const installRate = 4; // 4% install rate for app campaigns
      results = Math.round(clicks * (installRate / 100));
      resultRate = installRate;
    } else {
      // conversions
      const conversionRate = 2; // 2% conversion rate average
      results = Math.round(clicks * (conversionRate / 100));
      resultRate = conversionRate;
    }

    const forecast = {
      reach,
      impressions,
      clicks,
      conversions: results,
      resultMetric: strategyConfig.metricName,
      cpm: avgCPM,
      cpc: clicks > 0 ? (budget / clicks).toFixed(2) : "0",
      ctr: avgCTR.toFixed(2),
      conversionRate: resultRate.toFixed(2),
      costPerConversion: results > 0 ? (budget / results).toFixed(2) : "0",
    };

    console.log("Final forecast:", forecast);

    return new Response(JSON.stringify(forecast), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Meta forecast error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: "Check edge function logs for more information",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
