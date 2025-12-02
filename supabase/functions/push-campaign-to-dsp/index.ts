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
      } else if (platformName.toLowerCase().includes('tiktok')) {
        const result = await pushToTikTok(campaign, platformConfig, platform);
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
function getMetaObjectiveFromPhase(phaseName: string, strategyFocus?: string, optimizationGoal?: string): { objective: string; optimizationGoal: string } {
  const lowerPhaseName = phaseName.toLowerCase();
  const lowerOptGoal = optimizationGoal?.toLowerCase() || '';
  
  // Handle Value optimization goal specifically for Conversions
  if (lowerOptGoal === 'value') {
    return { objective: 'OUTCOME_SALES', optimizationGoal: 'VALUE' };
  }
  
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
  
  if (lowerPhaseName.includes('conversion') || lowerPhaseName.includes('purchase') || lowerPhaseName.includes('sales') || lowerPhaseName.includes('loyalty')) {
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
          const mapped = getMetaObjectiveFromPhase(phase.name, market.strategyFocus || campaign.strategy_focus, optimizationGoal);
          objective = mapped.objective;
          optimizationGoal = mapped.optimizationGoal;
          console.log(`Mapped phase "${phase.name}" to objective: ${objective}, optimization goal: ${optimizationGoal}`);
        } else {
          // Still check if we need to map optimization goal for Value
          if (optimizationGoal?.toLowerCase() === 'value') {
            optimizationGoal = 'VALUE';
            objective = 'OUTCOME_SALES';
            console.log(`Mapped Value optimization to objective: ${objective}, optimization goal: ${optimizationGoal}`);
          }
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
        
        // Build targeting - get from phase.targeting or campaign.generic_config.basicTargeting
        const basicTargeting = campaign.generic_config?.basicTargeting || {};
        const phaseBasicTargeting = phase.targeting || {};
        
        // Use phase targeting if available, otherwise use basic targeting
        const effectiveBasicTargeting = Object.keys(phaseBasicTargeting).length > 0 ? phaseBasicTargeting : basicTargeting;
        
        console.log("Effective basic targeting for phase:", phase.name, effectiveBasicTargeting);
        
        const targeting: any = {
          geo_locations: {
            countries: Array.isArray(market.countries) && market.countries.length > 0 
              ? market.countries 
              : [market.name.substring(0, 2).toUpperCase()]
          },
          age_min: effectiveBasicTargeting.ageMin || 18,
          age_max: effectiveBasicTargeting.ageMax || 65,
        };
        
        // Add gender targeting if specified (handle array of IDs like ["1", "2"])
        const genders = effectiveBasicTargeting.genders;
        if (genders && Array.isArray(genders) && genders.length > 0 && !genders.includes('all')) {
          // Convert string IDs to numbers and filter valid ones
          const genderIds = genders
            .map((g: string | number) => parseInt(String(g)))
            .filter((g: number) => !isNaN(g) && (g === 1 || g === 2));
          if (genderIds.length > 0) {
            targeting.genders = genderIds;
            console.log("Adding gender targeting:", genderIds);
          }
        }
        
        // Add language targeting if specified
        const languages = effectiveBasicTargeting.languages;
        if (languages && Array.isArray(languages) && languages.length > 0 && !languages.includes('all')) {
          const locales = languages
            .map((lang: string | number) => parseInt(String(lang)))
            .filter((l: number) => !isNaN(l));
          if (locales.length > 0) {
            targeting.locales = locales;
            console.log("Adding language targeting:", locales);
          }
        }
        
        // Add device targeting if specified (mobile, desktop, etc.)
        const devices = effectiveBasicTargeting.devices;
        if (devices && Array.isArray(devices) && devices.length > 0 && !devices.includes('all')) {
          targeting.device_platforms = devices;
          console.log("Adding device targeting:", devices);
        }
        
        // Add OS targeting if specified (iOS, Android, etc.)
        const os = effectiveBasicTargeting.os;
        if (os && Array.isArray(os) && os.length > 0 && !os.includes('all')) {
          targeting.user_os = os;
          console.log("Adding OS targeting:", os);
        }
        
        // Check for Advantage+ placements flag (Meta automatic placement optimization)
        // When enabled, don't set any publisher_platforms or positions - Meta optimizes automatically
        const advantagePlusPlacements = phase.advantagePlusPlacements ?? (market as any).metaAdvantagePlusPlacements ?? true;
        console.log("📍 Advantage+ placements enabled:", advantagePlusPlacements);
        
        if (advantagePlusPlacements) {
          // With Advantage+ placements, we don't specify any placement constraints
          // Meta will automatically optimize across all available placements
          console.log("📍 Using Advantage+ placements - Meta will auto-optimize");
          // Don't set publisher_platforms, facebook_positions, instagram_positions, etc.
        } else {
          // Manual placements mode - specify publisher platforms and positions
          // Add publisher platforms from phase (facebook, instagram, audience_network, messenger, threads)
          // Filter out 'messenger' since all messenger placements are now deprecated
          // Priority: phase.publisherPlatforms > market.metaPublisherPlatforms > defaults
          const publisherPlatforms = phase.publisherPlatforms || (market as any).metaPublisherPlatforms;
          console.log("📍 Raw publisherPlatforms from phase:", JSON.stringify(phase.publisherPlatforms));
          console.log("📍 Raw metaPublisherPlatforms from market:", JSON.stringify((market as any).metaPublisherPlatforms));
          console.log("📍 Resolved publisherPlatforms:", JSON.stringify(publisherPlatforms));
          if (publisherPlatforms && Array.isArray(publisherPlatforms) && publisherPlatforms.length > 0) {
            const filteredPlatforms = publisherPlatforms.filter((p: string) => p !== 'messenger');
            if (filteredPlatforms.length > 0) {
              targeting.publisher_platforms = filteredPlatforms;
              console.log("Adding publisher platforms (messenger filtered out):", filteredPlatforms);
            }
          } else {
            // If no publisher platforms specified, default to all except messenger
            targeting.publisher_platforms = ['facebook', 'instagram', 'audience_network'];
            console.log("No publisherPlatforms specified, using defaults:", targeting.publisher_platforms);
          }
          
          // Add placements/positions from phase or market defaults
          // Priority: phase.positions > market.metaPositions > defaults
          const positions = phase.positions || (market as any).metaPositions;
          console.log("📍 Raw positions from phase:", JSON.stringify(phase.positions));
          console.log("📍 Raw metaPositions from market:", JSON.stringify((market as any).metaPositions));
          console.log("📍 Resolved positions:", JSON.stringify(positions));
          
          // Valid placements per Meta API (updated to remove deprecated ones)
          // NOTE: As of Oct 2025, ALL Messenger placements are deprecated:
          // - messenger_home: deprecated Oct 9, 2025
          // - sponsored_messages: deprecated May 2024
          const validFacebookPositions = ['feed', 'instant_article', 'instream_video', 'marketplace', 'search', 'video_feeds', 'story'];
          const validInstagramPositions = ['stream', 'story', 'explore', 'explore_home', 'reels'];
          const validAudienceNetworkPositions = ['classic', 'instream_video', 'rewarded_video'];
          const validMessengerPositions: string[] = []; // Empty - all messenger placements deprecated
          
          // If no positions specified or positions is empty, default to all valid positions for each publisher platform
          if (!positions || Object.keys(positions).length === 0) {
            console.log("📍 No positions specified, using all valid positions for each publisher platform");
            if (targeting.publisher_platforms?.includes('facebook')) {
              targeting.facebook_positions = validFacebookPositions;
              console.log("Adding Facebook positions (default all):", validFacebookPositions);
            }
            if (targeting.publisher_platforms?.includes('instagram')) {
              targeting.instagram_positions = validInstagramPositions;
              console.log("Adding Instagram positions (default all):", validInstagramPositions);
            }
            if (targeting.publisher_platforms?.includes('audience_network')) {
              targeting.audience_network_positions = validAudienceNetworkPositions;
              console.log("Adding Audience Network positions (default all):", validAudienceNetworkPositions);
            }
          } else if (positions) {
            // Handle Facebook positions
            if (positions.facebook && Array.isArray(positions.facebook) && positions.facebook.length > 0) {
              if (positions.facebook.includes('automatic')) {
                // When automatic, use all valid positions
                targeting.facebook_positions = validFacebookPositions;
                console.log("Adding Facebook positions (automatic):", validFacebookPositions);
              } else {
                // Filter out deprecated placements
                const filteredPositions = positions.facebook.filter((p: string) => validFacebookPositions.includes(p));
                if (filteredPositions.length > 0) {
                  targeting.facebook_positions = filteredPositions;
                  console.log("Adding Facebook positions:", filteredPositions);
                }
              }
            }
            
            // Handle Instagram positions
            if (positions.instagram && Array.isArray(positions.instagram) && positions.instagram.length > 0) {
              if (positions.instagram.includes('automatic')) {
                targeting.instagram_positions = validInstagramPositions;
                console.log("Adding Instagram positions (automatic):", validInstagramPositions);
              } else {
                const filteredPositions = positions.instagram.filter((p: string) => validInstagramPositions.includes(p));
                if (filteredPositions.length > 0) {
                  targeting.instagram_positions = filteredPositions;
                  console.log("Adding Instagram positions:", filteredPositions);
                }
              }
            }
            
            // Handle Audience Network positions
            if (positions.audience_network && Array.isArray(positions.audience_network) && positions.audience_network.length > 0) {
              if (positions.audience_network.includes('automatic')) {
                targeting.audience_network_positions = validAudienceNetworkPositions;
                console.log("Adding Audience Network positions (automatic):", validAudienceNetworkPositions);
              } else {
                const filteredPositions = positions.audience_network.filter((p: string) => validAudienceNetworkPositions.includes(p));
                if (filteredPositions.length > 0) {
                  targeting.audience_network_positions = filteredPositions;
                  console.log("Adding Audience Network positions:", filteredPositions);
                }
              }
            }
            
            // Handle Messenger positions - DEPRECATED: All messenger placements removed as of 2024-2025
            // messenger_home: deprecated Oct 9, 2025
            // sponsored_messages: deprecated May 2024
            // Do not add messenger_positions to targeting to avoid MESSENGER_THREAD errors
            if (positions.messenger && Array.isArray(positions.messenger) && positions.messenger.length > 0) {
              console.log("Messenger positions requested but skipped (all deprecated):", positions.messenger);
            }
            // Note: Threads positions are handled automatically by Meta when 'threads' is in publisher_platforms
            // Do not add threads_positions field as it causes API errors
          }
        }
        
        // Add detailed targeting (interests, behaviors)
        if (market.detailedTargeting && market.detailedTargeting.length > 0) {
          targeting.flexible_spec = market.detailedTargeting.map((t: any) => ({
            [t.type]: [{ id: t.id, name: t.name }]
          }));
        }

        // Get targeting config - use phase targeting or campaign basic targeting for ALL markets
        // This ensures targeting is applied consistently across all markets in a platform
        const campaignBasicTargeting = campaign.generic_config?.basicTargeting || {};
        const phaseTargetingConfig = phase.targeting || {};
        const effectiveTargeting = Object.keys(phaseTargetingConfig).length > 0 ? phaseTargetingConfig : campaignBasicTargeting;
        
        const targetingConfig = (phase.overrideTargeting && phase.targeting) 
          ? phase.targeting 
          : (campaign.generic_config?.targeting || {});
        
        // Transform unified targeting format into Meta-specific arrays
        let metaInterests: any[] = [];
        let metaBehaviors: any[] = [];
        let metaDemographics: any[] = [];
        
        // If using unified targeting (selectedItems array from UnifiedTargeting component)
        if (effectiveTargeting.selectedItems && Array.isArray(effectiveTargeting.selectedItems)) {
          console.log(`🎯 Transforming ${effectiveTargeting.selectedItems.length} unified targeting items for Meta`);
          console.log(`📝 Sample item structure:`, JSON.stringify(effectiveTargeting.selectedItems[0], null, 2));
          
          effectiveTargeting.selectedItems.forEach((item: any) => {
            // Only process items available on Meta
            if (item.platforms && item.platforms.includes('meta')) {
              // Extract the correct Meta ID - handle different ID formats
              let metaIdValue = item.metaId || item.id;
              // Remove prefix if present (e.g., "meta-123" -> "123")
              if (typeof metaIdValue === 'string' && metaIdValue.startsWith('meta-')) {
                metaIdValue = metaIdValue.substring(5);
              }
              if (typeof metaIdValue === 'string' && metaIdValue.startsWith('unified-')) {
                metaIdValue = item.metaId; // For unified items, use metaId directly
              }
              
              const metaItem = {
                id: metaIdValue,
                name: item.name,
                category: item.category
              };
              
              // Categorize by type (case-insensitive)
              const categoryLower = (item.category || '').toLowerCase();
              if (categoryLower === 'interest' || categoryLower === 'interests') {
                metaInterests.push(metaItem);
                console.log(`  ✓ Interest: ${item.name} (${metaItem.id})`);
              } else if (categoryLower === 'behavior' || categoryLower === 'behaviors') {
                metaBehaviors.push(metaItem);
                console.log(`  ✓ Behavior: ${item.name} (${metaItem.id})`);
              } else if (categoryLower === 'demographic' || categoryLower === 'demographics') {
                metaDemographics.push(metaItem);
                console.log(`  ✓ Demographic: ${item.name} (${metaItem.id})`);
              } else {
                console.warn(`  ⚠️ Unknown category '${item.category}' for item: ${item.name}`);
              }
            }
          });
          
          console.log(`📊 Transformed targeting - Interests: ${metaInterests.length}, Behaviors: ${metaBehaviors.length}, Demographics: ${metaDemographics.length}`);
        } else {
          // Fallback to legacy format
          metaInterests = effectiveTargeting.aiInterests || effectiveTargeting.interests || [];
          metaBehaviors = effectiveTargeting.aiBehaviors || effectiveTargeting.behaviors || [];
          metaDemographics = effectiveTargeting.aiDemographics || [];
          console.log("📊 Using legacy targeting format for Meta");
        }

        if (metaInterests.length > 0 || metaBehaviors.length > 0 || metaDemographics.length > 0) {
          console.log(`Using transformed targeting for market ${market.name}:`, {
            interests: metaInterests.length,
            behaviors: metaBehaviors.length,
            demographics: metaDemographics.length
          });
          
          // Override basic demographics with data
          if (effectiveTargeting.location && effectiveTargeting.location.length > 0) {
            targeting.geo_locations = { countries: effectiveTargeting.location };
          }
          if (effectiveTargeting.ageMin) {
            targeting.age_min = effectiveTargeting.ageMin;
          }
          if (effectiveTargeting.ageMax) {
            targeting.age_max = effectiveTargeting.ageMax;
          }
          if (effectiveTargeting.gender && effectiveTargeting.gender.length > 0) {
            const genderMap: any = { male: [1], female: [2] };
            const genders = effectiveTargeting.gender.flatMap((g: string) => genderMap[g.toLowerCase()] || []);
            if (genders.length > 0) {
              targeting.genders = genders;
            }
          }

          // Helper function to filter out deprecated Meta targeting categories
          const isValidMetaTargeting = (item: any): boolean => {
            const name = (item.name || '').toLowerCase();
            const id = String(item.id || '');
            
            // Filter out "Friends of X" categories - Meta deprecated most of these for privacy
            if (name.includes('friends of')) {
              console.log(`  ⚠️ Filtering deprecated "Friends of" category: ${item.name}`);
              return false;
            }
            
            // Filter out IDs that don't look like standard Meta targeting category IDs
            // Standard Meta targeting IDs are 13-14 digits starting with 6
            // Entity/Page IDs are often longer or start with other numbers
            if (id.length > 14 || (id.length > 10 && !id.startsWith('6'))) {
              console.log(`  ⚠️ Filtering suspicious ID (looks like entity ID, not targeting): ${item.name} (${id})`);
              return false;
            }
            
            return true;
          };

          // Add interests from transformed targeting
          if (metaInterests.length > 0) {
            const interests = metaInterests.map((i: any) => ({
              id: i.id || i,
              name: i.name || i
            })).filter((i: any) => i.id && isValidMetaTargeting(i));
            if (interests.length > 0) {
              targeting.flexible_spec = targeting.flexible_spec || [];
              targeting.flexible_spec.push({ interests });
              console.log(`Adding ${interests.length} interests:`, interests.map((i: any) => i.name).join(', '));
            }
          }

          // Add behaviors from transformed targeting
          if (metaBehaviors.length > 0) {
            const behaviors = metaBehaviors.map((b: any) => ({
              id: b.id || b,
              name: b.name || b
            })).filter((b: any) => b.id && isValidMetaTargeting(b));
            if (behaviors.length > 0) {
              targeting.flexible_spec = targeting.flexible_spec || [];
              targeting.flexible_spec.push({ behaviors });
              console.log(`Adding ${behaviors.length} behaviors:`, behaviors.map((b: any) => b.name).join(', '));
            }
          }
          
          // SKIP demographics for now - they're causing "Category No Longer Available" errors
          // Demographics from search API don't reliably map to valid targeting categories
          if (metaDemographics.length > 0) {
            console.log(`⚠️ Skipping ${metaDemographics.length} demographics to avoid deprecated category errors`);
          }

          // Add custom audiences
          if (effectiveTargeting.customAudiences && effectiveTargeting.customAudiences.length > 0) {
            targeting.custom_audiences = effectiveTargeting.customAudiences.map((a: any) => ({
              id: a.id,
              name: a.name
            }));
            console.log(`Adding ${effectiveTargeting.customAudiences.length} custom audiences`);
          }

          // Add lookalike audiences
          if (effectiveTargeting.lookalikes && effectiveTargeting.lookalikes.length > 0) {
            targeting.custom_audiences = targeting.custom_audiences || [];
            effectiveTargeting.lookalikes.forEach((la: any) => {
              targeting.custom_audiences.push({
                id: la.id,
                name: la.name
              });
            });
            console.log(`Adding ${effectiveTargeting.lookalikes.length} lookalike audiences`);
          }

          // Add customer lists
          if (effectiveTargeting.customerLists && effectiveTargeting.customerLists.length > 0) {
            targeting.custom_audiences = targeting.custom_audiences || [];
            effectiveTargeting.customerLists.forEach((cl: any) => {
              targeting.custom_audiences.push({
                id: cl.id,
                name: cl.name
              });
            });
            console.log(`Adding ${effectiveTargeting.customerLists.length} customer lists`);
          }
        }

        // Process old targeting config format (legacy fallback)
        if (targetingConfig.websiteAudience) {
          const audienceNames = targetingConfig.websiteAudience.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (audienceNames.length > 0) {
            console.warn("Skipping websiteAudience fallback (names only). Audience IDs are required to target custom audiences.");
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

        // Validate bid strategy compatibility with optimization goal
        // COST_CAP and LOWEST_COST_WITH_BID_CAP only work with specific optimization goals
        const bidStrategyCompatibleGoals = ['OFFSITE_CONVERSIONS', 'VALUE', 'LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'LEAD_GENERATION', 'APP_INSTALLS'];
        const requestedBidStrategy = market.metaBidStrategy || "LOWEST_COST_WITHOUT_CAP";
        const requiresBidCap = requestedBidStrategy === 'COST_CAP' || requestedBidStrategy === 'LOWEST_COST_WITH_BID_CAP';
        const isCompatible = bidStrategyCompatibleGoals.includes(optimizationGoal);
        
        let finalBidStrategy = requestedBidStrategy;
        if (requiresBidCap && !isCompatible) {
          console.warn(`⚠️ Bid strategy ${requestedBidStrategy} is not compatible with optimization goal ${optimizationGoal}`);
          console.warn(`Falling back to LOWEST_COST_WITHOUT_CAP for ${optimizationGoal}`);
          finalBidStrategy = "LOWEST_COST_WITHOUT_CAP";
        }

        // Create ad set
        const adSetPayload: any = {
          name: `${phase.name} - Ad Set`,
          campaign_id: campaignData.id,
          billing_event: "IMPRESSIONS",
          optimization_goal: optimizationGoal,
          bid_strategy: finalBidStrategy,
          status: "PAUSED",
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          targeting: targeting,
        };

        console.log(`✅ Bid strategy validated: ${finalBidStrategy} (requested: ${requestedBidStrategy}, compatible: ${isCompatible})`);
        
        // Add bid amount if bid strategy requires it AND it's compatible
        if ((finalBidStrategy === 'LOWEST_COST_WITH_BID_CAP' || finalBidStrategy === 'COST_CAP') && 
            market.metaBidAmount && market.metaBidAmount > 0) {
          adSetPayload.bid_amount = Math.round(market.metaBidAmount * 100); // Convert to cents
          console.log(`✅ Adding Meta bid amount: €${market.metaBidAmount} (${adSetPayload.bid_amount} cents) for strategy ${finalBidStrategy}`);
        }
        
        // Add conversion tracking for conversion-optimized ad sets (including VALUE)
        if (market.pixel && market.conversionEvent && (adSetPayload.optimization_goal === 'OFFSITE_CONVERSIONS' || adSetPayload.optimization_goal === 'VALUE')) {
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

        let adSetData = await adSetResponse.json();
        
        // Check for pixel eligibility error for VALUE optimization (error_subcode: 2446368)
        if (adSetData.error && adSetData.error.error_subcode === 2446368 && adSetPayload.optimization_goal === 'VALUE') {
          console.warn(`Pixel ${market.pixel} not eligible for VALUE optimization. Retrying with OFFSITE_CONVERSIONS...`);
          
          // Retry with OFFSITE_CONVERSIONS fallback
          adSetPayload.optimization_goal = 'OFFSITE_CONVERSIONS';
          console.log("Retrying Meta ad set creation with fallback optimization_goal:", adSetPayload);
          
          const retryResponse = await fetch(
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
          
          adSetData = await retryResponse.json();
          
          if (!adSetData.error) {
            console.log(`✓ Ad set created successfully with OFFSITE_CONVERSIONS fallback for ${phase.name}`);
          }
        }
        
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

// TikTok campaign publishing
async function pushToTikTok(campaign: any, platformConfig: any, platform: any) {
  console.log("Pushing to TikTok...");
  
  // Check for conversion campaigns and log automatic fallback warning
  const hasConversionCampaigns = platformConfig.markets?.some((market: any) =>
    market.phases?.some((phase: any) => {
      const objective = (phase.objective || '').toLowerCase();
      const optimizationGoal = (phase.optimizationGoal || '').toLowerCase();
      return objective.includes('conversion') || optimizationGoal.includes('convert');
    })
  );
  
  if (hasConversionCampaigns) {
    console.warn("⚠️⚠️⚠️ TIKTOK CONVERSION CAMPAIGN DETECTED ⚠️⚠️⚠️");
    console.warn("TikTok requires conversion events to have 90+ days of historical data");
    console.warn("System will AUTOMATICALLY fallback to TRAFFIC objective with CLICK optimization");
    console.warn("This ensures ad groups can be created successfully without pixel data requirements");
  }
  
  const results = [];
  const errors = [];
  
  // Import adapters
  const { ObjectiveMapper } = await import("../_shared/objective-mapper.ts");
  const { getPlatformAdapter } = await import("../_shared/platform-adapter.ts");
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const mapper = new ObjectiveMapper(supabaseUrl, supabaseKey);
  const tiktokAdapter = getPlatformAdapter("tiktok");
  
  const markets = platformConfig.markets || [];
  
  for (const market of markets) {
    // Get TikTok advertiser ID from market config
    const advertiserId = market.adAccountId || platform.metadata?.advertiser_ids?.[0];
    
    if (!advertiserId) {
      errors.push({
        market: market.name,
        error: "Missing TikTok advertiser ID",
        type: 'validation_error'
      });
      continue;
    }
    
    const phases = market.phases || [{
      id: 'default-phase',
      name: market.name,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      budgetPercentage: 100,
      objective: market.objective || campaign.objective || "TRAFFIC"
    }];
    
    for (const phase of phases) {
      try {
        // Map Meta objective to TikTok objective
        const objectiveMapping = await mapper.mapObjective(
          phase.objective || market.objective || campaign.objective,
          "meta",
          "tiktok"
        );
        
        console.log(`Mapped objective: ${objectiveMapping.sourceObjective} -> ${objectiveMapping.targetObjective}`);
        
        // Calculate budget
        const totalCampaignBudget = campaign.total_budget || 0;
        const platformBudgetPercentage = platformConfig.budgetPercentage || 100;
        const marketBudgetPercentage = market.budgetPercentage || 100;
        const phaseBudgetPercentage = phase.budgetPercentage || 100;
        
        const phaseBudget = (totalCampaignBudget * platformBudgetPercentage / 100) * 
                           (marketBudgetPercentage / 100) * (phaseBudgetPercentage / 100);
        
        // Calculate duration
        const startDate = new Date(phase.startDate || campaign.start_date);
        const endDate = new Date(phase.endDate || campaign.end_date);
        const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        const budgetType = phase.budgetType || 'lifetime';
        const campaignBudget = budgetType === 'daily' ? phaseBudget / durationDays : phaseBudget;
        
        // Create TikTok campaign
        const campaignResult = await tiktokAdapter.createCampaign({
          accountId: advertiserId,
          accessToken: platform.access_token,
          campaignName: `${campaign.name} - ${market.name}${phases.length > 1 ? ` - ${phase.name}` : ''}`,
          objective: objectiveMapping.targetObjective,
          budget: campaignBudget,
          budgetMode: budgetType,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          status: "PAUSED",
        });
        
        if (!campaignResult.success) {
          errors.push({
            market: market.name,
            phase: phase.name,
            error: campaignResult.error,
            type: 'campaign_creation'
          });
          continue;
        }
        
        console.log("TikTok campaign created:", campaignResult.campaignId);
        
        // Store campaign in database
        await supabase.from("tiktok_campaigns").insert({
          user_id: campaign.user_id,
          actiplan_campaign_id: campaign.id,
          tiktok_campaign_id: campaignResult.campaignId,
          advertiser_id: advertiserId,
          campaign_name: campaignResult.metadata?.campaign_name || "",
          objective_type: objectiveMapping.targetObjective,
          budget_mode: budgetType,
          budget: campaignBudget,
          status: "PAUSED",
        });
        
        // Get placement settings from phase, market, or use defaults
        const placementType = phase.tiktokPlacementType || market.tiktokPlacementType || "PLACEMENT_TYPE_AUTOMATIC";
        let tiktokPlacements: string[];
        
        if (placementType === "PLACEMENT_TYPE_NORMAL") {
          // Use manual placements from phase or market
          const configuredPlacements = phase.tiktokPlacements || market.tiktokPlacements;
          tiktokPlacements = Array.isArray(configuredPlacements) && configuredPlacements.length > 0 
            ? configuredPlacements 
            : ["PLACEMENT_TIKTOK"];
          console.log(`📍 Using MANUAL placements: ${tiktokPlacements.join(', ')}`);
        } else {
          // Automatic placement - TikTok will optimize
          tiktokPlacements = ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"];
          console.log(`📍 Using AUTOMATIC placements (all positions enabled)`);
        }
        
        console.log(`📍 Placement type: ${placementType}, Placements: ${JSON.stringify(tiktokPlacements)}`);
        
        // Build targeting
        const basicTargeting = campaign.generic_config?.basicTargeting || {};
        const phaseBasicTargeting = phase.targeting || {};
        const effectiveTargeting = Object.keys(phaseBasicTargeting).length > 0 ? phaseBasicTargeting : basicTargeting;
        
        console.log("📊 RAW Effective targeting for TikTok ad group:", JSON.stringify(effectiveTargeting, null, 2));
        
        // Transform unified targeting format into platform-specific arrays
        let tiktokInterests: any[] = [];
        let tiktokBehaviors: any[] = [];
        let tiktokDemographics: any[] = [];
        
        // If using unified targeting (selectedItems array from UnifiedTargeting component)
        if (effectiveTargeting.selectedItems && Array.isArray(effectiveTargeting.selectedItems)) {
          console.log(`🎯 Transforming ${effectiveTargeting.selectedItems.length} unified targeting items for TikTok`);
          console.log(`📝 All items:`, JSON.stringify(effectiveTargeting.selectedItems, null, 2));
          
          effectiveTargeting.selectedItems.forEach((item: any, index: number) => {
            console.log(`📝 Item ${index}: platforms=${JSON.stringify(item.platforms)}, category='${item.category}', name='${item.name}'`);
            
            // Only process items available on TikTok
            if (item.platforms && item.platforms.includes('tiktok')) {
              // Extract the correct TikTok ID - handle different ID formats
              let tiktokIdValue = item.tiktokId || item.id;
              // Remove prefix if present (e.g., "tiktok-123" -> "123")
              if (typeof tiktokIdValue === 'string' && tiktokIdValue.startsWith('tiktok-')) {
                tiktokIdValue = tiktokIdValue.substring(7);
              }
              if (typeof tiktokIdValue === 'string' && tiktokIdValue.startsWith('unified-')) {
                tiktokIdValue = item.tiktokId; // For unified items, use tiktokId directly
              }
              
              const tiktokItem = {
                id: tiktokIdValue,
                name: item.name,
                category: item.category
              };
              
              // Categorize by type (case-insensitive) - be more inclusive
              const categoryLower = (item.category || '').toLowerCase();
              if (categoryLower === 'interest' || categoryLower === 'interests') {
                tiktokInterests.push(tiktokItem);
                console.log(`  ✓ Interest: ${item.name} (${tiktokItem.id})`);
              } else if (categoryLower === 'behavior' || categoryLower === 'behaviors' || 
                         categoryLower === 'action' || categoryLower === 'actions' ||
                         categoryLower === 'purchase_intention' || categoryLower === 'video_interaction' ||
                         categoryLower === 'creator_interaction' || categoryLower === 'hashtag_interaction') {
                // All action-based categories map to behaviors
                tiktokBehaviors.push(tiktokItem);
                console.log(`  ✓ Behavior/Action: ${item.name} (${tiktokItem.id}) [category: ${item.category}]`);
              } else if (categoryLower === 'demographic' || categoryLower === 'demographics') {
                tiktokDemographics.push(tiktokItem);
                console.log(`  ✓ Demographic: ${item.name} (${tiktokItem.id})`);
              } else {
                // Default unknown categories to behaviors for TikTok (safer than skipping)
                tiktokBehaviors.push(tiktokItem);
                console.warn(`  ⚠️ Unknown category '${item.category}' for item: ${item.name} - treating as behavior`);
              }
            } else {
              console.log(`  ⏭️ Skipping item (not TikTok): ${item.name}`);
            }
          });
          
          console.log(`📊 Transformed targeting - Interests: ${tiktokInterests.length}, Behaviors: ${tiktokBehaviors.length}, Demographics: ${tiktokDemographics.length}`);
        } else {
          // Fallback to legacy format (direct arrays)
          tiktokInterests = effectiveTargeting.tiktokInterests || [];
          tiktokBehaviors = effectiveTargeting.tiktokBehaviors || [];
          tiktokDemographics = effectiveTargeting.tiktokDemographics || [];
          console.log("📊 Using legacy targeting format (direct arrays)");
        }
        
        // Map field names properly - handle both camelCase and snake_case from different sources
        const targeting: any = {
          geo_locations: {
            countries: Array.isArray(market.countries) && market.countries.length > 0 
              ? market.countries 
              : [market.name.substring(0, 2).toUpperCase()]
          },
          age_min: effectiveTargeting.ageMin || effectiveTargeting.age_min || effectiveTargeting.minAge || 18,
          age_max: effectiveTargeting.ageMax || effectiveTargeting.age_max || effectiveTargeting.maxAge || 65,
          genders: effectiveTargeting.genders || effectiveTargeting.gender || [],
          devices: effectiveTargeting.devices || effectiveTargeting.device || [],
          os: effectiveTargeting.os || effectiveTargeting.operatingSystem || [],
          languages: effectiveTargeting.languages || effectiveTargeting.language || [],
          // TikTok detailed targeting (transformed from unified format)
          tiktokInterests: tiktokInterests,
          tiktokBehaviors: tiktokBehaviors,
          tiktokDemographics: tiktokDemographics,
        };
        
        console.log("📊 RAW effectiveTargeting keys:", Object.keys(effectiveTargeting));
        console.log("📊 Constructed targeting with all fields:", JSON.stringify(targeting, null, 2));
        
        // Map optimization goal based on TikTok objective
        // TikTok has strict optimization goal requirements per objective
        let tiktokOptGoal: string;
        const mappedObjective = objectiveMapping.targetObjective;
        
        if (mappedObjective === "CONVERSIONS") {
          // CONVERSIONS objective always uses CONVERT optimization goal
          tiktokOptGoal = "CONVERT";
        } else if (mappedObjective === "TRAFFIC") {
          // TRAFFIC objective uses CLICK or LANDING_PAGE
          const phaseOptGoal = phase.optimizationGoal;
          if (phaseOptGoal === "LANDING_PAGE_VIEWS") {
            tiktokOptGoal = "LANDING_PAGE";
          } else {
            tiktokOptGoal = "CLICK";
          }
        } else if (mappedObjective === "REACH") {
          tiktokOptGoal = "REACH";
        } else if (mappedObjective === "VIDEO_VIEW") {
          tiktokOptGoal = "VIDEO_VIEW";
        } else if (mappedObjective === "APP_INSTALL") {
          tiktokOptGoal = "INSTALL";
        } else {
          // Default fallback
          tiktokOptGoal = "CLICK";
        }
        
        console.log(`Mapped optimization goal for objective ${mappedObjective}: ${tiktokOptGoal} (phase optimization goal: ${phase.optimizationGoal})`);
        
        // Map billing event based on objective + optimization goal combination
        // TikTok has strict billing event requirements per objective
        const billingEventMap: Record<string, Record<string, string>> = {
          "TRAFFIC": {
            "CLICK": "CPC",  // TRAFFIC with CLICK only supports CPC
            "LANDING_PAGE": "CPC",
          },
          "CONVERSIONS": {
            "CONVERT": "OCPM",  // CONVERSIONS supports OCPM
          },
          "REACH": {
            "REACH": "CPM",  // REACH typically uses CPM
          },
          "VIDEO_VIEW": {
            "VIDEO_VIEW": "CPV",  // VIDEO_VIEW uses CPV
          },
          "APP_INSTALL": {
            "INSTALL": "OCPM",
          },
        };
        
        // Determine billing event based on objective and optimization goal
        console.log(`DEBUG: Looking up billing event for objective: ${mappedObjective}, optimization goal: ${tiktokOptGoal}`);
        console.log(`DEBUG: Available objectives in billingEventMap:`, Object.keys(billingEventMap));
        
        let billingEvent = billingEventMap[mappedObjective]?.[tiktokOptGoal];
        console.log(`DEBUG: Billing event from map: ${billingEvent}`);
        
        // If no specific mapping, fetch from account defaults
        if (!billingEvent) {
          console.log(`DEBUG: No billing event mapping found, fetching from account defaults`);
          const { data: tiktokAccount } = await supabase
            .from("tiktok_ad_accounts")
            .select("default_billing_event")
            .eq("advertiser_id", advertiserId)
            .eq("user_id", campaign.user_id)
            .single();
          
          billingEvent = tiktokAccount?.default_billing_event || "OCPM";
          console.log(`DEBUG: Billing event from account defaults: ${billingEvent}`);
        }
        
        console.log(`Using billing event: ${billingEvent} for objective ${mappedObjective}, optimization goal ${tiktokOptGoal}`);
        
        // Get pixel ID for conversion campaigns
        let pixelId: string | undefined;
        if (tiktokOptGoal === 'CONVERT' || mappedObjective === 'CONVERSIONS') {
          pixelId = market.tiktokPixel || market.pixelId || market.tiktokPixelId;
          console.log(`Conversion campaign detected - using pixel_id: ${pixelId}`);
        }
        
        // Get landing page URL from market defaults or use placeholder
        const landingPageUrl = market.tiktokLandingPageUrl || market.websiteUrl || campaign.website_url || "https://example.com";
        console.log(`Using landing page URL: ${landingPageUrl}`);
        
        // Get bid amount from market defaults or phase overrides
        const bidAmount = phase.tiktokBidAmount || market.tiktokBidAmount || undefined;
        if (bidAmount) {
          console.log(`Using bid amount: €${bidAmount}`);
        } else {
          console.warn(`⚠️ No bid amount configured - TikTok may require bid amount for CPC/CPM billing events`);
        }
        
        // Get optimization location (defaults fetched from tiktok_ad_accounts if not specified)
        const optimizationLocation = phase.tiktokOptimizationLocation || market.tiktokOptimizationLocation || "Website";
        
        // Get app details for app campaigns
        const appName = phase.tiktokAppName || market.tiktokAppName;
        const appId = phase.tiktokAppId || market.tiktokAppId;
        
        // Get attribution windows
        const clickWindow = phase.tiktokClickWindow || market.tiktokClickWindow;
        const viewWindow = phase.tiktokViewWindow || market.tiktokViewWindow;
        
        // Get frequency settings (required for REACH campaigns)
        const frequencySchedule = phase.tiktokFrequencySchedule || market.tiktokFrequencySchedule;
        console.log(`📊 Frequency schedule for ${phase.name}: ${frequencySchedule}`);
        
        // Get feature toggles
        const eventCountEnabled = phase.tiktokEventCountEnabled !== undefined ? phase.tiktokEventCountEnabled : market.tiktokEventCountEnabled;
        const smartPlusEnabled = phase.tiktokSmartPlusEnabled !== undefined ? phase.tiktokSmartPlusEnabled : market.tiktokSmartPlusEnabled;
        const searchEnabled = phase.tiktokSearchEnabled !== undefined ? phase.tiktokSearchEnabled : market.tiktokSearchEnabled;
        
        // Create ad group
          // Retrieve TikTok-specific parameters from phase or market defaults
          const tiktokOptimizationLocation = phase.tiktokOptimizationLocation || market.tiktokOptimizationLocation;
          const tiktokAppName = phase.tiktokAppName || market.tiktokAppName;
          const tiktokAppId = phase.tiktokAppId || market.tiktokAppId;
          const tiktokBidStrategy = phase.tiktokBidStrategy || market.tiktokBidStrategy;
          const tiktokBidAmount = phase.tiktokBidAmount || market.tiktokBidAmount;
          const tiktokClickWindow = phase.tiktokClickWindow || market.tiktokClickWindow;
          const tiktokViewWindow = phase.tiktokViewWindow || market.tiktokViewWindow;
          const tiktokFrequencySchedule = phase.tiktokFrequencySchedule || market.tiktokFrequencySchedule;
          const tiktokEventCount = phase.tiktokEventCount || market.tiktokEventCount;
          const tiktokSmartPlusEnabled = phase.tiktokSmartPlusEnabled ?? market.tiktokSmartPlusEnabled;

          console.log(`📋 TikTok phase config for ${phase.name}:`, {
            raw_phase_frequencySchedule: phase.tiktokFrequencySchedule,
            raw_market_frequencySchedule: market.tiktokFrequencySchedule,
            resolved_frequencySchedule: tiktokFrequencySchedule,
            optimizationLocation: tiktokOptimizationLocation,
            appName: tiktokAppName,
            appId: tiktokAppId,
            bidStrategy: tiktokBidStrategy,
            bidAmount: tiktokBidAmount,
            clickWindow: tiktokClickWindow,
            viewWindow: tiktokViewWindow,
            eventCount: tiktokEventCount,
            smartPlusEnabled: tiktokSmartPlusEnabled,
          });

        console.log(`🚀 CALLING tiktokAdapter.createAdGroup for ${phase.name}...`);
        console.log(`📍 campaignId: ${campaignResult.campaignId}, advertiserId: ${advertiserId}`);
        
        const adGroupResult = await tiktokAdapter.createAdGroup({
          accountId: advertiserId,
          accessToken: platform.access_token,
          campaignId: campaignResult.campaignId,
          adGroupName: `${phase.name} - Ad Group`,
          targeting: targeting,
          placements: tiktokPlacements,
          placementType: placementType,
          optimizationGoal: tiktokOptGoal,
          billingEvent: billingEvent,
          bidStrategy: phase.tiktokBidStrategy || market.tiktokBidStrategy || "LOWEST_COST",
          bidAmount: bidAmount,
          budget: campaignBudget,
          budgetMode: budgetType,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          status: "PAUSED",
          pixelId: pixelId,
          landingPageUrl: landingPageUrl,
          optimizationLocation: optimizationLocation,
          appName: appName,
          appId: appId,
          clickWindow: clickWindow,
          viewWindow: viewWindow,
          frequencySchedule: tiktokFrequencySchedule,
          eventCount: tiktokEventCount,
          smartPlusEnabled: smartPlusEnabled,
        });

        if (!adGroupResult.success) {
          errors.push({
            market: market.name,
            phase: phase.name,
            error: adGroupResult.error,
            type: 'adgroup_creation'
          });
          continue;
        }
        
        console.log("TikTok ad group created:", adGroupResult.adGroupId);
        
        // Store ad group in database
        await supabase.from("tiktok_ad_groups").insert({
          user_id: campaign.user_id,
          tiktok_campaign_id: campaignResult.campaignId,
          tiktok_ad_group_id: adGroupResult.adGroupId,
          advertiser_id: advertiserId,
          ad_group_name: adGroupResult.metadata?.adgroup_name || "",
          placement_type: placementType,
          placements: tiktokPlacements,
          targeting: targeting,
          budget: campaignBudget,
          budget_mode: budgetType,
          optimization_goal: tiktokOptGoal,
          status: "PAUSED",
        });
        
        results.push({
          market: market.name,
          phase: phase.name,
          campaignId: campaignResult.campaignId,
          adGroupId: adGroupResult.adGroupId,
          success: true,
        });
        
      } catch (error: any) {
        console.error("Error creating TikTok campaign/ad group:", error);
        errors.push({
          market: market.name,
          phase: phase.name,
          error: error.message,
          type: 'unexpected_error'
        });
      }
    }
  }
  
  return {
    platform: 'TikTok',
    results,
    errors,
    success: errors.length === 0,
  };
}

serve(handler);
