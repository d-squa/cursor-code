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
    // Authentication check
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Service configuration error");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { campaignId } = await req.json();

    // Get campaign data
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Verify user owns the campaign
    if (campaign.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized: You do not own this campaign' }), { 
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log("Pushing campaign to DSP:", campaign.name, "for user:", user.id);

    // Get user's connected platforms
    const { data: platforms, error: platformsError } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", campaign.user_id)
      .eq("is_active", true);

    if (platformsError) throw platformsError;

    const results = [];

    // Process each platform in the campaign
    // Extract platform configurations from market_splits
    const marketSplits = campaign.market_splits || {};
    
    for (const [platformId, markets] of Object.entries(marketSplits)) {
      // Find the platform in campaign.platforms to get the name
      const campaignPlatform = (campaign.platforms || []).find((p: any) => p.id === platformId);
      if (!campaignPlatform) {
        console.warn(`Platform ${platformId} not found in campaign.platforms`);
        continue;
      }
      
      const platformName = campaignPlatform.name;
      const budgetAllocation = campaign.budget_allocation || {};
      const platformBudgetPercentage = budgetAllocation[platformId] || 0;
      
      // Find connected platform
      const platform = platforms.find(p => 
        p.platform_type.toLowerCase() === platformName.toLowerCase() || 
        (platformName.includes('Meta') && p.platform_type === 'meta')
      );
      
      if (!platform) {
        console.warn(`Platform ${platformName} not connected for user`);
        results.push({
          platform: platformName,
          error: "Platform not connected",
          markets: markets
        });
        continue;
      }

      // Create platform config structure
      const platformConfig = {
        id: platformId,
        name: platformName,
        budgetPercentage: platformBudgetPercentage,
        markets: markets
      };

      if (platformName.includes('Meta') || platformName.includes('Facebook')) {
        const result = await pushToMeta(campaign, platformConfig, platform);
        results.push(result);
      } else if (platformName.includes('Google')) {
        const result = await pushToGoogleAds(campaign, platformConfig, platform);
        results.push(result);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error pushing campaign to DSP:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

// Helper function to map phase names to valid Meta objectives
function getMetaObjectiveFromPhase(phaseName: string, strategyFocus?: string): { objective: string; optimizationGoal: string } {
  const lowerPhaseName = phaseName.toLowerCase();
  
  // Map phase names to Meta objectives
  if (lowerPhaseName.includes('awareness') || lowerPhaseName.includes('reach')) {
    return { objective: 'OUTCOME_AWARENESS', optimizationGoal: 'REACH' };
  }
  
  if (lowerPhaseName.includes('engagement') || lowerPhaseName.includes('interest')) {
    return { objective: 'OUTCOME_ENGAGEMENT', optimizationGoal: 'POST_ENGAGEMENT' };
  }
  
  if (lowerPhaseName.includes('consideration') || lowerPhaseName.includes('intent')) {
    return { objective: 'OUTCOME_TRAFFIC', optimizationGoal: 'LINK_CLICKS' };
  }
  
  if (lowerPhaseName.includes('lead')) {
    return { objective: 'OUTCOME_LEADS', optimizationGoal: 'LEAD_GENERATION' };
  }
  
  if (lowerPhaseName.includes('conversion') || lowerPhaseName.includes('purchase') || lowerPhaseName.includes('sales')) {
    // Check strategy focus for more specific mapping
    if (strategyFocus === 'purchase' || strategyFocus === 'conversions') {
      return { objective: 'OUTCOME_SALES', optimizationGoal: 'OFFSITE_CONVERSIONS' };
    }
    return { objective: 'OUTCOME_SALES', optimizationGoal: 'OFFSITE_CONVERSIONS' };
  }
  
  if (lowerPhaseName.includes('app')) {
    return { objective: 'OUTCOME_APP_PROMOTION', optimizationGoal: 'APP_INSTALLS' };
  }
  
  // Default fallback
  return { objective: 'OUTCOME_TRAFFIC', optimizationGoal: 'LINK_CLICKS' };
}

async function pushToMeta(campaign: any, platformConfig: any, platform: any) {
  console.log("Pushing to Meta...");
  
  const results = [];
  const errors = [];
  
  // Extract markets from the correct structure
  const markets = platformConfig.markets || [];
  
  for (const market of markets) {
    // Validate required fields for conversion campaigns
    const requiresConversionEvent = market.phases && market.phases.some((phase: any) => {
      const phaseName = phase.name?.toLowerCase() || "";
      const objective = phase.objective?.toLowerCase() || "";
      return (
        phaseName.includes("conversion") ||
        phaseName.includes("purchase") ||
        phaseName.includes("sales") ||
        phaseName.includes("lead") ||
        objective.includes("conversion") ||
        objective.includes("sales") ||
        objective.includes("lead")
      );
    });

    if (requiresConversionEvent && (!market.pixel || !market.conversionEvent)) {
      errors.push({
        market: market.name,
        error: "Pixel and Conversion Event are required for conversion campaigns. Please configure them in the campaign customization.",
        type: 'validation_error'
      });
      continue;
    }

    // Get phases, or create a default phase if none exist
    const phases = market.phases || [{
      id: 'default-phase',
      name: market.name,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      budgetPercentage: 100,
      objective: market.objective || campaign.objective || "OUTCOME_TRAFFIC",
      optimizationGoal: market.optimizationGoal || "LINK_CLICKS"
    }];
    
    for (const phase of phases) {
      try {
        // Map phase objective to valid Meta objective - check forecast fields first
        let objective = phase.objective || (market as any).phaseObjective || market.objective || campaign.objective || "OUTCOME_TRAFFIC";
        let optimizationGoal = phase.optimizationGoal || (market as any).phaseOptimizationGoal || market.optimizationGoal || "LINK_CLICKS";
        
        // If objective is "auto" or invalid, map from phase name
        const validObjectives = ['APP_INSTALLS', 'BRAND_AWARENESS', 'EVENT_RESPONSES', 'LEAD_GENERATION', 
          'LINK_CLICKS', 'LOCAL_AWARENESS', 'MESSAGES', 'OFFER_CLAIMS', 'PAGE_LIKES', 'POST_ENGAGEMENT', 
          'PRODUCT_CATALOG_SALES', 'REACH', 'STORE_VISITS', 'VIDEO_VIEWS', 'OUTCOME_AWARENESS', 
          'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_APP_PROMOTION', 'CONVERSIONS'];
        
        if (!validObjectives.includes(objective)) {
          const mapped = getMetaObjectiveFromPhase(phase.name, market.strategyFocus || campaign.strategy_focus);
          objective = mapped.objective;
          optimizationGoal = mapped.optimizationGoal;
          console.log(`Mapped phase "${phase.name}" to objective: ${objective}, optimization goal: ${optimizationGoal}`);
        }
        
        // Create campaign
        const campaignPayload = {
          name: `${campaign.name} - ${market.name}${phases.length > 1 ? ` - ${phase.name}` : ''}`,
          objective: objective,
          status: "PAUSED",
          special_ad_categories: [],
        };

        // Resolve Meta ad account id with fallbacks and ensure proper act_ prefix
        const resolvedAdAccount = (market as any).adAccountId || (market as any).ad_account_id || platform.ad_account_id || Deno.env.get("META_AD_ACCOUNT_ID");
        const adAccountPath = resolvedAdAccount
          ? (String(resolvedAdAccount).startsWith("act_") ? String(resolvedAdAccount) : `act_${String(resolvedAdAccount).replace(/^act_/, "")}`)
          : null;

        if (!adAccountPath) {
          console.error("Missing Meta ad account id for market:", market.name);
          errors.push({
            market: market.name,
            phase: phase.name,
            error: "Missing Meta ad account id",
            type: 'validation_error'
          });
          continue;
        }

        console.log("Creating Meta campaign on:", adAccountPath, campaignPayload);

        const campaignResponse = await fetch(
          `https://graph.facebook.com/v22.0/${adAccountPath}/campaigns`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...campaignPayload,
              access_token: platform.access_token,
            }),
          }
        );

        const campaignData = await campaignResponse.json();
        
        if (campaignData.error) {
          console.error("Meta Campaign Creation Error:", campaignData.error);
          errors.push({
            market: market.name,
            phase: phase.name,
            error: campaignData.error.message,
            type: 'campaign_creation'
          });
          continue;
        }

        console.log("Meta campaign created:", campaignData.id);

        // Calculate budget
        const totalCampaignBudget = campaign.total_budget || 0;
        const platformBudgetPercentage = platformConfig.budgetPercentage || 100;
        const marketBudgetPercentage = market.budgetPercentage || 100;
        const phaseBudgetPercentage = phase.budgetPercentage || 100;
        
        const phaseBudget = (totalCampaignBudget * platformBudgetPercentage / 100) * (marketBudgetPercentage / 100) * (phaseBudgetPercentage / 100);
        
        // Calculate duration in days (including start and end day)
        const startDate = new Date(phase.startDate || campaign.start_date);
        const endDate = new Date(phase.endDate || campaign.end_date);
        const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        // Use the phase's budget type (default to lifetime if not set)
        const budgetType = phase.budgetType || 'lifetime';
        const dailyBudget = budgetType === 'daily' ? Math.round(phaseBudget / durationDays * 100) : null;
        const lifetimeBudget = budgetType === 'lifetime' ? Math.round(phaseBudget * 100) : null;
        
        // Build targeting
        const targeting: any = {
          geo_locations: {
            countries: Array.isArray(market.countries) && market.countries.length > 0 
              ? market.countries 
              : [market.name.substring(0, 2).toUpperCase()]
          },
          age_min: market.ageMin || phase.ageMin || 18,
          age_max: market.ageMax || phase.ageMax || 65,
        };
        
        // Add gender targeting if specified (handle both ID format '1', '2' and string format 'male', 'female')
        const gender = market.gender || phase.gender;
        if (gender && gender !== 'all') {
          if (gender === "1" || gender === "male") {
            targeting.genders = [1];
          } else if (gender === "2" || gender === "female") {
            targeting.genders = [2];
          }
        }
        
        // Add language targeting if specified
        const languages = market.languages || phase.languages;
        if (languages && Array.isArray(languages) && languages.length > 0 && !languages.includes('all')) {
          targeting.locales = languages.map((lang: string | number) => parseInt(String(lang)));
        }
        
        // Add device targeting if specified
        const devices = market.devices || phase.devices;
        if (devices && Array.isArray(devices) && devices.length > 0 && !devices.includes('all')) {
          targeting.device_platforms = devices;
        }
        
        // Add OS targeting if specified
        const os = market.os || phase.os;
        if (os && Array.isArray(os) && os.length > 0 && !os.includes('all')) {
          targeting.user_os = os;
        }
        
        // Add publisher platforms
        if (market.publisherPlatforms && market.publisherPlatforms.length > 0) {
          targeting.publisher_platforms = market.publisherPlatforms;
        }
        
        // Add placements/positions
        if (market.positions) {
          if (market.positions.facebook && market.positions.facebook.length > 0) {
            targeting.facebook_positions = market.positions.facebook;
          }
          if (market.positions.instagram && market.positions.instagram.length > 0) {
            targeting.instagram_positions = market.positions.instagram;
          }
          if (market.positions.audience_network && market.positions.audience_network.length > 0) {
            targeting.audience_network_positions = market.positions.audience_network;
          }
          if (market.positions.messenger && market.positions.messenger.length > 0) {
            targeting.messenger_positions = market.positions.messenger;
          }
          if (market.positions.threads && market.positions.threads.length > 0) {
            targeting.threads_positions = market.positions.threads;
          }
        }
        
        // Add detailed targeting (interests, behaviors)
        if (market.detailedTargeting && market.detailedTargeting.length > 0) {
          targeting.flexible_spec = market.detailedTargeting.map((t: any) => ({
            [t.type]: [{ id: t.id, name: t.name }]
          }));
        }

        // Get targeting config from phase override or generic config
        const targetingConfig = (phase.overrideTargeting && phase.targeting) 
          ? phase.targeting 
          : (campaign.generic_config?.targeting || {});

        // Get parsed targeting from AI brief (new approach)
        const parsedTargeting = campaign.generic_config?.parsedTargeting || [];
        const marketTargeting = parsedTargeting.find((t: any) => 
          t.market.toLowerCase() === market.name.toLowerCase()
        );

        if (marketTargeting) {
          console.log(`Using AI-parsed targeting for market ${market.name}:`, marketTargeting);
          
          // Override basic demographics with AI-parsed data
          if (marketTargeting.location && marketTargeting.location.length > 0) {
            targeting.geo_locations = { countries: marketTargeting.location };
          }
          if (marketTargeting.ageMin) {
            targeting.age_min = marketTargeting.ageMin;
          }
          if (marketTargeting.ageMax) {
            targeting.age_max = marketTargeting.ageMax;
          }
          if (marketTargeting.gender && marketTargeting.gender.length > 0) {
            const genderMap: any = { male: [1], female: [2] };
            const genders = marketTargeting.gender.flatMap((g: string) => genderMap[g.toLowerCase()] || []);
            if (genders.length > 0) {
              targeting.genders = genders;
            }
          }

          // Add interests from AI parsing
          if (marketTargeting.interests && marketTargeting.interests.length > 0) {
            const interests = marketTargeting.interests.map((i: any) => ({
              id: i.id,
              name: i.name
            }));
            targeting.flexible_spec = targeting.flexible_spec || [];
            targeting.flexible_spec.push({ interests });
            console.log(`Adding ${interests.length} interests from AI parsing:`, interests.map((i: any) => i.name).join(', '));
          }

          // Add behaviors from AI parsing
          if (marketTargeting.behaviors && marketTargeting.behaviors.length > 0) {
            const behaviors = marketTargeting.behaviors.map((b: any) => ({
              id: b.id,
              name: b.name
            }));
            targeting.flexible_spec = targeting.flexible_spec || [];
            targeting.flexible_spec.push({ behaviors });
            console.log(`Adding ${behaviors.length} behaviors from AI parsing:`, behaviors.map((b: any) => b.name).join(', '));
          }

          // Add custom audiences from AI parsing
          if (marketTargeting.customAudiences && marketTargeting.customAudiences.length > 0) {
            targeting.custom_audiences = marketTargeting.customAudiences.map((a: any) => ({
              id: a.id,
              name: a.name
            }));
            console.log(`Adding ${marketTargeting.customAudiences.length} custom audiences from AI parsing`);
          }

          // Add lookalike audiences from AI parsing
          if (marketTargeting.lookalikes && marketTargeting.lookalikes.length > 0) {
            targeting.custom_audiences = targeting.custom_audiences || [];
            marketTargeting.lookalikes.forEach((la: any) => {
              targeting.custom_audiences.push({
                id: la.id,
                name: la.name
              });
            });
            console.log(`Adding ${marketTargeting.lookalikes.length} lookalike audiences from AI parsing`);
          }

          // Add customer lists from AI parsing
          if (marketTargeting.customerLists && marketTargeting.customerLists.length > 0) {
            targeting.custom_audiences = targeting.custom_audiences || [];
            marketTargeting.customerLists.forEach((cl: any) => {
              targeting.custom_audiences.push({
                id: cl.id,
                name: cl.name
              });
            });
            console.log(`Adding ${marketTargeting.customerLists.length} customer lists from AI parsing`);
          }
        }

        // Fallback to old targeting config if no AI-parsed targeting
        if (!marketTargeting) {
        if (targetingConfig.websiteAudience) {
          const audienceNames = targetingConfig.websiteAudience.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (audienceNames.length > 0) {
            console.warn("Skipping websiteAudience fallback (names only). Audience IDs are required to target custom audiences.");
          }
        }

        }

        // Fallback to old targeting config if no AI-parsed targeting (continued)
        if (targetingConfig.lookalikeAudience) {
          const lookalikeNames = targetingConfig.lookalikeAudience.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (lookalikeNames.length > 0) {
            console.warn("Skipping lookalikeAudience fallback (names only). Audience IDs are required.");
          }
        }

        // Add interests from targeting config
        if (targetingConfig.interests) {
          const interests = targetingConfig.interests.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (interests.length > 0) {
            console.warn("Skipping interests fallback (names only). Use AI-parsed targeting to include valid interest IDs.");
          }
        }

        // Add customer list (custom audiences from file)
        if (targetingConfig.customerList) {
          const customerLists = targetingConfig.customerList.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (customerLists.length > 0) {
            console.warn("Skipping customerList fallback (names only). Audience IDs are required.");
          }
        }

        // Sanitize targeting: remove invalid detailed targeting entries without IDs
        if (targeting.flexible_spec && Array.isArray(targeting.flexible_spec)) {
          targeting.flexible_spec = targeting.flexible_spec
            .map((spec: any) => {
              const cleaned: any = {};
              for (const key of Object.keys(spec)) {
                const items = Array.isArray(spec[key]) ? spec[key].filter((i: any) => i && typeof i.id === 'string' && i.id.trim() !== '') : [];
                if (items.length > 0) cleaned[key] = items;
              }
              return cleaned;
            })
            .filter((spec: any) => Object.keys(spec).length > 0);
          if (targeting.flexible_spec.length === 0) {
            delete targeting.flexible_spec;
          }
        }

        // Normalize custom_audiences: keep only valid IDs
        if (targeting.custom_audiences) {
          const normalized = (Array.isArray(targeting.custom_audiences) ? targeting.custom_audiences : [])
            .map((a: any) => {
              if (!a) return null;
              if (typeof a === 'string' && /^\d+$/.test(a)) return { id: a };
              if (typeof a === 'object' && a.id) return { id: String(a.id) };
              return null;
            })
            .filter(Boolean);
          if (normalized.length > 0) {
            targeting.custom_audiences = normalized;
          } else {
            delete targeting.custom_audiences;
          }
        }

        // Create ad set
        const adSetPayload: any = {
          name: `${phase.name} - Ad Set`,
          campaign_id: campaignData.id,
          billing_event: "IMPRESSIONS",
          optimization_goal: optimizationGoal,
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          status: "PAUSED",
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          targeting: targeting,
        };
        
        // Add conversion tracking ONLY for conversion-optimized ad sets
        if (market.pixel && market.conversionEvent && adSetPayload.optimization_goal === 'OFFSITE_CONVERSIONS') {
          // Meta's valid custom_event_type values
          const validEventTypes = [
            'AD_IMPRESSION', 'RATE', 'TUTORIAL_COMPLETION', 'CONTACT', 'CUSTOMIZE_PRODUCT', 
            'DONATE', 'FIND_LOCATION', 'SCHEDULE', 'START_TRIAL', 'SUBMIT_APPLICATION', 
            'SUBSCRIBE', 'ADD_TO_CART', 'ADD_TO_WISHLIST', 'INITIATED_CHECKOUT', 
            'ADD_PAYMENT_INFO', 'PURCHASE', 'LEAD', 'COMPLETE_REGISTRATION', 'CONTENT_VIEW', 
            'SEARCH', 'SERVICE_BOOKING_REQUEST', 'MESSAGING_CONVERSATION_STARTED_7D', 
            'LEVEL_ACHIEVED', 'ACHIEVEMENT_UNLOCKED', 'SPENT_CREDITS', 'LISTING_INTERACTION', 
            'D2_RETENTION', 'D7_RETENTION', 'OTHER'
          ];
          // Normalize and validate conversion event
          const normalizedEvent = market.conversionEvent.toUpperCase().trim();
          const eventType = validEventTypes.includes(normalizedEvent) ? normalizedEvent : 'OTHER';
          if (!validEventTypes.includes(normalizedEvent)) {
            console.warn(`Invalid conversion event "${market.conversionEvent}" for market ${market.name}, using "OTHER" as fallback`);
          }
          adSetPayload.promoted_object = {
            pixel_id: market.pixel,
            custom_event_type: eventType,
          };
          console.info(`Including promoted_object for optimization_goal=${adSetPayload.optimization_goal}`);
        } else if (adSetPayload.optimization_goal !== 'OFFSITE_CONVERSIONS' && (market.pixel || market.conversionEvent)) {
          console.info(`Skipping promoted_object for optimization_goal=${adSetPayload.optimization_goal}`);
        }
        
        // Set budget (convert to cents)
        if (lifetimeBudget) {
          adSetPayload.lifetime_budget = lifetimeBudget;
        } else if (dailyBudget) {
          adSetPayload.daily_budget = dailyBudget;
        }

        console.log("Creating Meta ad set:", adSetPayload);

        const adSetResponse = await fetch(
          `https://graph.facebook.com/v22.0/${adAccountPath}/adsets`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...adSetPayload,
              access_token: platform.access_token,
            }),
          }
        );

        const adSetData = await adSetResponse.json();
        
        if (adSetData.error) {
          console.error("Meta Ad Set Creation Error:", adSetData.error);
          errors.push({
            market: market.name,
            phase: phase.name,
            error: adSetData.error.message,
            type: 'adset_creation',
            campaignId: campaignData.id
          });
          continue;
        }

        console.log("Meta ad set created:", adSetData.id);

        results.push({
          platform: "Meta",
          market: market.name,
          phase: phase.name,
          campaignId: campaignData.id,
          adSetId: adSetData.id,
          budget: phaseBudget,
          budgetType: budgetType,
        });
      } catch (error: any) {
        console.error(`Error processing market ${market.name}, phase ${phase.name}:`, error);
        errors.push({
          market: market.name,
          phase: phase.name,
          error: error.message,
          type: 'processing_error'
        });
      }
    }
  }

  return { platform: "Meta", results, errors: errors.length > 0 ? errors : undefined };
}

async function pushToGoogleAds(campaign: any, platformConfig: any, platform: any) {
  console.log("Pushing to Google Ads...");
  
  // Google Ads API implementation would go here
  // This is a placeholder for the actual implementation
  
  return {
    platform: "Google Ads",
    status: "Not implemented yet",
  };
}

serve(handler);
