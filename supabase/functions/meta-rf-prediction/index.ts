import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getAccessToken } from "../_shared/vault-helper.ts";
import { getMetaPlatformCandidatesForAdAccount } from "../_shared/platform-connection-resolver.ts";
import { resolveMetaLocales } from "../_shared/meta-locale.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
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

    // Initialize Supabase with service role for auth verification
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
    console.log("Meta R&F prediction request (authenticated user):", user.id);

    // Get credentials from connected platform
    const connectedPlatformId = body.connectedPlatformId;
    if (!connectedPlatformId) {
      throw new Error("connectedPlatformId is required");
    }

    // Input validation
    if (body.budget && (body.budget < 100 || body.budget > 10000000)) {
      throw new Error('Budget must be between 100 and 10,000,000');
    }

    const requestedAdAccountId = body.adAccountId || body.ad_account_id || "";

    // Fetch explicitly requested platform first, then fall back to ad-account-aware resolution
    const { data: requestedPlatform, error: platformError } = await supabase
      .from("connected_platforms")
      .select("id, user_id, team_id, access_token, ad_account_id, updated_at")
      .eq("id", connectedPlatformId)
      .eq("platform_type", "meta")
      .maybeSingle();

    if (platformError) {
      console.error("Error loading requested Meta platform:", platformError);
    }

    const resolvedCandidates = await getMetaPlatformCandidatesForAdAccount(
      supabase,
      user.id,
      requestedAdAccountId || requestedPlatform?.ad_account_id,
    );

    const candidateMap = new Map<string, any>();
    for (const candidate of [requestedPlatform, ...resolvedCandidates].filter((value): value is NonNullable<typeof value> => Boolean(value))) {
      if (!candidateMap.has(candidate.id)) {
        candidateMap.set(candidate.id, candidate);
      }
    }

    const platformCandidates = Array.from(candidateMap.values());

    if (platformCandidates.length === 0) {
      console.error("Connected Meta platform not found or not accessible:", {
        connectedPlatformId,
        userId: user.id,
        requestedAdAccountId,
      });
      throw new Error("Meta platform connection not found. Please connect your Meta account.");
    }

    let platform = platformCandidates[0];
    let accessToken: string | null = null;

    for (const candidate of platformCandidates) {
      const candidateToken = await getAccessToken(supabase, candidate.id, candidate.access_token);
      if (candidateToken) {
        platform = candidate;
        accessToken = candidateToken;
        if (candidate.id !== connectedPlatformId) {
          console.log("🔄 Meta R&F switched to fallback connection with valid token:", {
            requestedPlatformId: connectedPlatformId,
            resolvedPlatformId: candidate.id,
            requestedAdAccountId,
          });
        }
        break;
      }
    }

    if (!accessToken) {
      if (body.dryRun === true) {
        console.warn("DRY RUN: No access token available, using placeholder.");
        accessToken = "DRYRUN";
      } else {
        console.error("No valid Meta access token found across candidate connections:", {
          connectedPlatformId,
          candidatePlatformIds: platformCandidates.map((candidate) => candidate.id),
          requestedAdAccountId,
          userId: user.id,
        });
        throw new Error("Meta access token not found. Please reconnect your Meta account.");
      }
    }

    // Helper to strip act_ prefix
    const toNumeric = (v: string) => v.replace(/^act_/i, "");

    // Try multiple sources for ad account ID: platform connection, request body
    const adAccountIdRaw = (
      (platform?.ad_account_id as string) || 
      body.adAccountId || 
      body.ad_account_id || 
      ""
    ).toString();
    let adAccountId = toNumeric(adAccountIdRaw);

    // Enhanced logging for ad account debugging
    console.log("📊 Ad Account Resolution Debug:", {
      connectedPlatformId,
      platformAdAccountId: platform?.ad_account_id || "(not set)",
      bodyAdAccountId: body.adAccountId || body.ad_account_id || "(not provided)",
      rawValue: adAccountIdRaw || "(empty)",
      processedValue: adAccountId || "(empty)",
      userId: user.id,
    });

    // Validate the ad account ID against meta_ad_accounts table
    // This prevents using stale/incorrect IDs (e.g., business-scoped user IDs)
    if (adAccountId) {
      const { data: validAccounts } = await supabase
        .from('meta_ad_accounts')
        .select('account_id')
        .or(`account_id.eq.act_${adAccountId},account_id.eq.${adAccountIdRaw}`)
        .limit(1);

      if (validAccounts && validAccounts.length > 0) {
        const validId = toNumeric(validAccounts[0].account_id);
        if (validId !== adAccountId) {
          console.log(`🔄 Corrected ad account ID from ${adAccountId} to ${validId}`);
          adAccountId = validId;
        }
      } else {
        // The provided ID doesn't match any known account - try team-aware fallback
        console.warn(`⚠️ Ad account ID ${adAccountId} not found in meta_ad_accounts, attempting team-aware fallback...`);
        
        // Get user's team IDs for team-scoped lookup
        const { data: teamRolesForFallback } = await supabase
          .from('user_roles')
          .select('team_id')
          .eq('user_id', user.id)
          .not('team_id', 'is', null);
        const fallbackTeamIds = (teamRolesForFallback || []).map((r: any) => r.team_id).filter(Boolean);
        
        let fallbackQuery = supabase
          .from('meta_ad_accounts')
          .select('account_id')
          .limit(1);
        
        if (fallbackTeamIds.length > 0) {
          const filters = [`user_id.eq.${user.id}`, ...fallbackTeamIds.map((tid: string) => `team_id.eq.${tid}`)];
          fallbackQuery = fallbackQuery.or(filters.join(','));
        } else {
          fallbackQuery = fallbackQuery.eq('user_id', user.id);
        }
        
        const { data: userAccounts } = await fallbackQuery;
        
        if (userAccounts && userAccounts.length > 0) {
          const fallbackId = toNumeric(userAccounts[0].account_id);
          console.log(`🔄 Using fallback ad account: ${fallbackId} (original was ${adAccountId})`);
          adAccountId = fallbackId;
        }
      }
    }

    if (!/^[0-9]{10,}$/.test(adAccountId)) {
      console.error("❌ Invalid ad account id detected:", {
        rawValue: adAccountIdRaw,
        processedValue: adAccountId,
        platformId: connectedPlatformId,
        platformRecord: {
          id: platform?.id,
          adAccountId: platform?.ad_account_id,
        },
        bodyFields: {
          adAccountId: body.adAccountId,
          ad_account_id: body.ad_account_id,
        },
        userId: user.id,
      });
      throw new Error(
        `Invalid Meta ad account id: "${adAccountIdRaw}". Please ensure your Meta connection has an ad account selected in Settings > Connections.`,
      );
    }

    console.log("✅ Using ad account for R&F:", adAccountId);

    // Extract countries from body - support both formats
    let validatedMarkets: string[] = [];

    if (body.countries && Array.isArray(body.countries)) {
      // New format: countries array directly
      validatedMarkets = body.countries;
    } else if (body.markets && Array.isArray(body.markets)) {
      // Legacy format: markets array
      validatedMarkets = body.markets;
    } else {
      throw new Error("No markets/countries provided. Please specify countries array.");
    }

    // Validate and normalize to ISO-2 country codes
    const normalizedMarkets: string[] = [];
    for (const market of validatedMarkets) {
      const normalized = market.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(normalized)) {
        throw new Error(`Invalid country code: "${market}". Must be 2-letter ISO code (e.g., US, CA, GB).`);
      }
      normalizedMarkets.push(normalized);
    }

    console.log("Normalized markets for R&F:", normalizedMarkets);

    // Build target_spec - R&F has strict placement restrictions
    // Normalize inputs (handle strings like "25" and omit when "all")
    const toNumber = (v: any): number | undefined => {
      if (v === undefined || v === null || v === '' || v === 'all') return undefined;
      const n = typeof v === 'string' ? Number(String(v).replace(/[^\d.]/g, '')) : Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    const ageMinProvided = toNumber(body.ageMin ?? body.targeting?.ageMin);
    const ageMaxProvided = toNumber(body.ageMax ?? body.targeting?.ageMax);
    // Clamp to Meta allowed bounds 13..65
    const ageMinNormalized = ageMinProvided !== undefined ? Math.max(13, Math.min(65, Math.floor(ageMinProvided))) : undefined;
    const ageMaxNormalized = ageMaxProvided !== undefined ? Math.max(13, Math.min(65, Math.floor(ageMaxProvided))) : undefined;

    const targetSpec: any = {
      geo_locations: { countries: normalizedMarkets },
    };

    // Always include age using provided values when present, otherwise defaults
    targetSpec.age_min = ageMinNormalized ?? 18;
    targetSpec.age_max = ageMaxNormalized ?? 65;

    console.log("Age targeting:", {
      ageMin: targetSpec.age_min,
      ageMax: targetSpec.age_max,
      providedMin: body.ageMin,
      providedMax: body.ageMax,
      normalizedMin: ageMinNormalized,
      normalizedMax: ageMaxNormalized,
    });

    // Add gender if specified (omit if "all" or both genders selected)
    const normalizeGender = (g: any): number[] | undefined => {
      if (g === undefined || g === null) return undefined;
      if (typeof g === 'string') {
        const s = g.trim().toLowerCase();
        if (s === 'all') return undefined;
        if (s === 'male' || s === 'm' || s === '1') return [1];
        if (s === 'female' || s === 'f' || s === '2') return [2];
        return undefined;
      }
      if (typeof g === 'number') {
        if (g === 1) return [1];
        if (g === 2) return [2];
        return undefined;
      }
      if (Array.isArray(g)) {
        const set = new Set(
          g
            .map((x) => {
              if (typeof x === 'string') {
                const s = x.trim().toLowerCase();
                if (s === 'male' || s === 'm' || s === '1') return 1;
                if (s === 'female' || s === 'f' || s === '2') return 2;
                return undefined;
              }
              if (typeof x === 'number') return x;
              return undefined;
            })
            .filter((x): x is number => x === 1 || x === 2)
        );
        if (set.size === 1) return [...set];
        // both or none selected => treat as all (omit)
        return undefined;
      }
      return undefined;
    };

    const genderInput = body.gender ?? body.targeting?.gender ?? body.genders ?? body.targeting?.genders;
    const gendersNormalized = normalizeGender(genderInput);
    if (gendersNormalized) {
      targetSpec.genders = gendersNormalized;
      console.log("Gender targeting:", { input: genderInput, genders: targetSpec.genders });
    } else {
      console.log("Gender targeting: all (omitted from target_spec)");
    }

    // Add devices if specified (omit if "all" devices selected)
    if (body.devices && Array.isArray(body.devices) && body.devices.length > 0 && !body.devices.includes("all")) {
      targetSpec.device_platforms = body.devices;
    }

    // Add OS if specified (omit if "all" OS selected)
    if (body.os && Array.isArray(body.os) && body.os.length > 0 && !body.os.includes("all")) {
      targetSpec.user_os = body.os;
    }

    // Add languages if specified — Meta expects numeric locale IDs, not ISO codes
    const metaLocales = resolveMetaLocales(body.languages);
    if (metaLocales.length > 0) {
      targetSpec.locales = metaLocales;
      console.log("Language targeting:", {
        input: body.languages,
        locales: metaLocales,
      });
    } else if (
      body.languages &&
      Array.isArray(body.languages) &&
      body.languages.length > 0 &&
      !body.languages.includes("all")
    ) {
      console.warn("No valid Meta locale IDs resolved from languages; omitting locale targeting:", body.languages);
    }

    // Add detailed targeting if specified (interests, behaviors, demographics)
    if (body.detailedTargeting && Array.isArray(body.detailedTargeting) && body.detailedTargeting.length > 0) {
      targetSpec.flexible_spec = [
        body.detailedTargeting.reduce((acc: any, target: any) => {
          if (!acc[target.type]) {
            acc[target.type] = [];
          }
          acc[target.type].push({ id: target.id });
          return acc;
        }, {}),
      ];
    }

    // Add placements to target_spec (required for R&F)
    targetSpec.publisher_platforms = ["facebook"];
    targetSpec.facebook_positions = ["feed", "story"];

    console.log("R&F targeting spec with placements:", JSON.stringify(targetSpec, null, 2));

    // Step 1: Create Reach & Frequency prediction
    // API: POST https://graph.facebook.com/v21.0/act_{ad_account_id}/reachfrequencypredictions

    // Use dates from request body
    const startDate = body.startDate ? new Date(body.startDate) : new Date();
    const endDate = body.endDate ? new Date(body.endDate) : new Date();

    // Set both start and end to 7:00 AM UTC (Meta R&F requirement)
    startDate.setUTCHours(7, 0, 0, 0);
    endDate.setUTCHours(7, 0, 0, 0);

    // If start date is today or in the past, push it forward to be valid for Meta R&F
    // Meta requires start_time to be at least ~1 hour in the future
    const now = new Date();
    const minimumStart = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
    if (startDate.getTime() <= minimumStart.getTime()) {
      // Round up to next hour boundary for cleanliness
      const nextValidHour = new Date(minimumStart);
      nextValidHour.setUTCMinutes(0, 0, 0);
      nextValidHour.setUTCHours(nextValidHour.getUTCHours() + 1);
      console.log(`⚠️ Start date ${startDate.toISOString()} is too soon. Adjusting to ${nextValidHour.toISOString()}`);
      startDate.setTime(nextValidHour.getTime());
    }

    // Ensure end date is after start date
    if (endDate.getTime() <= startDate.getTime()) {
      endDate.setTime(startDate.getTime() + 24 * 60 * 60 * 1000); // At least 1 day after start
      console.log(`⚠️ End date adjusted to ${endDate.toISOString()} (must be after start)`);
    }

    const startTimeUnix = Math.floor(startDate.getTime() / 1000);
    const endTimeUnix = Math.floor(endDate.getTime() / 1000);

    // Calculate campaign duration for frequency cap
    const durationDays = Math.ceil((endTimeUnix - startTimeUnix) / 86400);
    const frequencyCap = durationDays <= 3 ? 1 : 2;

    console.log("Campaign time window:", {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      startTimeUnix,
      endTimeUnix,
    });

    // Budget in cents (always required) - robust parse
    const rawBudget = ((): number | undefined => {
      const v = body.budget;
      if (v === undefined || v === null || v === '') return undefined;
      const n = typeof v === 'string' ? Number(String(v).replace(/[^\d.]/g, '')) : Number(v);
      return Number.isFinite(n) ? n : undefined;
    })();
    const budgetCents = Math.round(((rawBudget ?? 0) as number) * 100);
    
    console.log("Budget:", { 
      providedBudget: body.budget, 
      parsedBudget: rawBudget,
      budgetCents, 
      budgetDollars: budgetCents / 100 
    });

    // CRITICAL: R&F predictions ALWAYS use REACH objective regardless of UI selection
    // This is a hard requirement for Meta's Reach & Frequency API
 
    const predictionParams: Record<string, string> = {
      access_token: accessToken,
      target_spec: JSON.stringify(targetSpec),
      budget: String(budgetCents),
      objective: "REACH",
      prediction_mode: "1",
      frequency_cap: String(body.frequencyCap || frequencyCap),
      start_time: String(startTimeUnix),
      end_time: String(endTimeUnix),
    };

    console.log(`R&F prediction params: REACH objective, placements in target_spec`);

    console.log(
      `R&F budget: $${(budgetCents / 100).toLocaleString()} (${budgetCents} cents), Markets: ${normalizedMarkets.join(", ")}`,
    );
    console.log(`R&F campaign duration: ${durationDays} days, frequency cap: ${frequencyCap}`);

    // Log full API URL for Graph API Explorer testing (non-clickable format)
    console.log("🔗 FULL API URL FOR GRAPH API EXPLORER (copy entire line below):");
    console.log(
      `https://graph.facebook.com/v21.0/act_${adAccountId}/reachfrequencypredictions?${new URLSearchParams(predictionParams).toString()}`,
    );

    const maskedParams = new URLSearchParams(predictionParams)
      .toString()
      .replace(/access_token=[^&]+/, "access_token=***");
    console.log("Creating R&F prediction with params:", maskedParams);

    // Dry run: return built params and targetSpec without calling Meta API
    if (body.dryRun === true) {
      const preview = {
        dryRun: true,
        targetSpec,
        predictionParams: { ...predictionParams, access_token: "***" },
        timeWindow: { startTimeUnix, endTimeUnix },
      };
      return new Response(JSON.stringify(preview), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let createResponse = await fetch(`https://graph.facebook.com/v21.0/act_${adAccountId}/reachfrequencypredictions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(predictionParams),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("R&F prediction creation error:", errorText);

      let errorData: any = null;
      try {
        errorData = JSON.parse(errorText);
      } catch (_) {
        // ignore JSON parse failure
      }

      const finalData = errorData ?? (() => {
        try {
          return JSON.parse(errorText);
        } catch {
          return null;
        }
      })();

      if (finalData?.error?.code === 190) {
        throw new Error("INVALID_TOKEN: Meta access token is invalid or expired.");
      }

      if (finalData?.error?.code === 200) {
        throw new Error(
          "PERMISSION_ERROR: Meta access token does not have required permissions. Need ads_management and business_management scopes for R&F predictions.",
        );
      }

      const finalErrorText = finalData ? JSON.stringify(finalData) : errorText;
      throw new Error(`R&F prediction creation failed: ${finalErrorText}`);
    }

    const predictionData = await createResponse.json();
    const predictionId = predictionData.id;
    console.log("✅ Created R&F prediction ID:", predictionId);
    console.log("📋 Initial prediction data:", JSON.stringify(predictionData, null, 2));

    // Log prediction IDs if curve_budget_reach is present
    if (predictionData.curve_budget_reach && Array.isArray(predictionData.curve_budget_reach)) {
      console.log(`📊 Received ${predictionData.curve_budget_reach.length} prediction curve points`);
      console.log(
        "🆔 Prediction IDs from curve:",
        predictionData.curve_budget_reach.map((p: any) => ({
          id: p.id || p.rf_prediction_id || p.prediction_id || predictionId,
          budget: p.budget / 100,
          reach: p.reach,
          impressions: p.impression,
        })),
      );
    }

    // Step 2: Poll for prediction status
    // Predictions can take a few seconds to compute
    let attempts = 0;
    let predictionResult = null;

    const maxPollAttempts = 15;
    const pollIntervalMs = 2000;

    while (attempts < maxPollAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const statusResponse = await fetch(
        `https://graph.facebook.com/v21.0/${predictionId}?access_token=${accessToken}&fields=id,name,frequency_cap,campaign_time_start,campaign_time_stop,external_reach,external_impression,external_budget,audience_size_upper_bound,audience_size_lower_bound,external_minimum_budget,external_maximum_budget,external_minimum_reach,external_maximum_reach,external_minimum_impression,external_maximum_impression,prediction_progress,status,curve_budget_reach`,
      );

      if (statusResponse.ok) {
        predictionResult = await statusResponse.json();
        console.log(`R&F prediction status (attempt ${attempts + 1}):`, {
          status: predictionResult.status,
          progress: predictionResult.prediction_progress,
          reach: predictionResult.external_reach,
          impressions: predictionResult.external_impression,
        });

        if (predictionResult.status === 1) {
          // 1 = ready
          console.log("R&F prediction ready! Full result:", JSON.stringify(predictionResult, null, 2));
          break;
        }

        // Status 12 = error, provide detailed diagnostics
        if (predictionResult.status === 12) {
          console.error("❌ R&F prediction failed with status 12");
          console.error("Full response:", JSON.stringify(predictionResult, null, 2));
          console.error("Target spec used:", JSON.stringify(targetSpec, null, 2));
          console.error("Prediction params:", {
            budget: budgetCents / 100,
            markets: normalizedMarkets,
            platforms: targetSpec.publisher_platforms,
            dateRange: `${new Date(predictionResult.campaign_time_start * 1000).toISOString()} to ${new Date(predictionResult.campaign_time_stop * 1000).toISOString()}`,
          });

          // Build detailed error message
          let errorDetails = [];
          if (predictionResult.external_minimum_budget > 0) {
            errorDetails.push(
              `Minimum budget required: $${(predictionResult.external_minimum_budget / 100).toLocaleString()}`,
            );
          }
          if (normalizedMarkets.length === 1 && normalizedMarkets[0] === "GE") {
            errorDetails.push("Small market (GE) may have limited R&F inventory. Try larger markets (US, GB, CA, AU)");
          }

          const errorMsg =
            errorDetails.length > 0
              ? `R&F prediction failed. Possible issues: ${errorDetails.join("; ")}`
              : "R&F prediction failed. The targeting/budget/market combination may not support R&F. Try: (1) Larger markets, (2) Higher budget, (3) Add Instagram placements, (4) Broader targeting";

          throw new Error(errorMsg);
        }
      } else {
        const errorText = await statusResponse.text();
        console.error(`Status check failed (attempt ${attempts + 1}):`, errorText);
      }

      attempts++;
    }

    if (!predictionResult || predictionResult.status !== 1) {
      throw new Error("R&F prediction timed out or failed to complete");
    }

    // Step 3: Calculate median values from min/max metrics
    // Meta R&F API returns min/max ranges - we calculate the median as (min + max) / 2

    // Calculate median reach
    const minReach = predictionResult.external_minimum_reach || 0;
    const maxReach = predictionResult.external_maximum_reach || 0;
    const medianReach = Math.round((minReach + maxReach) / 2);

    // Calculate median impressions
    const minImpressions = predictionResult.external_minimum_impression || 0;
    const maxImpressions = predictionResult.external_maximum_impression || 0;
    const medianImpressions = Math.round((minImpressions + maxImpressions) / 2);

    // Calculate median budget
    const minBudget = predictionResult.external_minimum_budget || 0;
    const maxBudget = predictionResult.external_maximum_budget || 0;
    const medianBudget = (minBudget + maxBudget) / 2 / 100; // Convert cents to dollars

    // Get audience size
    const audienceSizeLower = predictionResult.audience_size_lower_bound || 0;
    const audienceSizeUpper = predictionResult.audience_size_upper_bound || 0;
    const medianAudienceSize = Math.round((audienceSizeLower + audienceSizeUpper) / 2);

    const resultFrequencyCap = predictionResult.frequency_cap || 1;

    // Calculate CPM from median values: (budget / impressions) * 1000
    const cpm = medianImpressions > 0 ? (medianBudget / medianImpressions) * 1000 : 0;

    console.log("✅ MEDIAN CALCULATIONS FROM META R&F API:", {
      id: predictionResult.id,
      reach: {
        min: minReach.toLocaleString(),
        max: maxReach.toLocaleString(),
        median: medianReach.toLocaleString(),
      },
      impressions: {
        min: minImpressions.toLocaleString(),
        max: maxImpressions.toLocaleString(),
        median: medianImpressions.toLocaleString(),
      },
      budget: {
        min: `$${(minBudget / 100).toLocaleString()}`,
        max: `$${(maxBudget / 100).toLocaleString()}`,
        median: `$${medianBudget.toLocaleString()}`,
      },
      audienceSize: {
        lower: audienceSizeLower.toLocaleString(),
        upper: audienceSizeUpper.toLocaleString(),
        median: medianAudienceSize.toLocaleString(),
      },
      frequencyCap: resultFrequencyCap,
      cpm: cpm.toFixed(2),
    });

    // Step 4: Calculate derived metrics (clicks, conversions) using industry benchmarks
    const ctr = body.estimatedCTR || 0.009; // Use provided CTR or 0.9% default
    const conversionRate = body.estimatedConversionRate || 0.02; // Use provided or 2% default

    const clicks = Math.round(medianImpressions * ctr);
    const conversions = Math.round(clicks * conversionRate);
    const cpc = clicks > 0 ? medianBudget / clicks : 0;
    const costPerConversion = conversions > 0 ? medianBudget / conversions : 0;

    const forecast = {
      // ✅ MEDIAN VALUES CALCULATED FROM META R&F API MIN/MAX:
      audienceSize: medianAudienceSize,
      reach: medianReach,
      impressions: medianImpressions,
      cpm: parseFloat(cpm.toFixed(2)),
      budget: parseFloat(medianBudget.toFixed(2)),
      minimumBudget: parseFloat((minBudget / 100).toFixed(2)),
      maximumBudget: parseFloat((maxBudget / 100).toFixed(2)),
      frequencyCap: resultFrequencyCap,

      // Raw min/max values for reference
      rawMetrics: {
        reachRange: { min: minReach, max: maxReach },
        impressionsRange: { min: minImpressions, max: maxImpressions },
        budgetRange: { min: minBudget / 100, max: maxBudget / 100 },
        audienceSizeRange: { lower: audienceSizeLower, upper: audienceSizeUpper },
      },

      // Estimated metrics (since R&F API doesn't provide these):
      clicks,
      ctr: parseFloat((ctr * 100).toFixed(2)),
      cpc: parseFloat(cpc.toFixed(2)),
      results: conversions,
      resultType: body.strategyConfig?.metric || "conversions",
      conversionRate: parseFloat((conversionRate * 100).toFixed(2)),
      costPerResult: parseFloat(costPerConversion.toFixed(2)),
    };

    console.log("✅ Final R&F forecast (MEDIAN VALUES):", forecast);

    return new Response(JSON.stringify({ forecast }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Meta R&F prediction error:", error);

    const message = error?.message ?? "Unknown error";
    let status = 500;
    if (message.includes("INVALID_TOKEN") || message.includes("Invalid authentication")) {
      status = 401;
    } else if (
      message.includes("required") ||
      message.includes("Invalid country") ||
      message.includes("Invalid Meta ad account") ||
      message.includes("Budget must be") ||
      message.includes("No markets")
    ) {
      status = 400;
    }

    return new Response(
      JSON.stringify({
        error: message,
        details:
          "Reach & Frequency predictions require: (1) Ad account with RESERVED buying_type access, (2) Access token with ads_management + business_management scopes, (3) App in Live mode",
      }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
