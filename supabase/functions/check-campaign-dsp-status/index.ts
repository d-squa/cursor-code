import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DspStatusResult {
  entityId: string;
  dspEntityId: string;
  platform: string;
  dspStatus: string;
  effectiveStatus?: string;
  isLive: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { campaignId } = await req.json();

    // Get launch status entries with DSP IDs OR stuck in pushing state
    const { data: launchStatuses, error: statusError } = await supabase
      .from('campaign_launch_status')
      .select('*')
      .eq('campaign_id', campaignId);

    if (statusError) throw statusError;

    // Log all statuses for debugging
    console.log(`All launch statuses for campaign ${campaignId}:`, launchStatuses?.map((s: any) => ({
      platform: s.platform,
      status: s.status,
      dsp_entity_id: s.dsp_entity_id,
      entity_type: s.entity_type
    })));

    // Filter to those with DSP IDs (can check status)
    const statusesToCheck = launchStatuses?.filter((s: any) => s.dsp_entity_id != null) || [];
    
    // Check for stuck "pushing" statuses (indicates push didn't complete properly)
    const stuckPushing = launchStatuses?.filter((s: any) => s.status === 'pushing' && s.dsp_entity_id == null) || [];
    if (stuckPushing.length > 0) {
      console.warn(`Found ${stuckPushing.length} entities stuck in 'pushing' state without dsp_entity_id - these may have failed silently`);
      // Update stuck entities to push_failed so they can be retried
      await supabase
        .from('campaign_launch_status')
        .update({
          status: 'push_failed',
          error_message: 'Push did not complete - status update may have failed. Please retry.',
          updated_at: new Date().toISOString()
        })
        .eq('campaign_id', campaignId)
        .eq('status', 'pushing')
        .is('dsp_entity_id', null);
    }

    if (statusesToCheck.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: stuckPushing.length > 0 
            ? `${stuckPushing.length} entities were stuck and marked for retry. No DSP entities to check.` 
            : 'No DSP entities to check', 
          results: [],
          stuckFixed: stuckPushing.length
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get campaign to find owner
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('user_id')
      .eq('id', campaignId)
      .single();

    if (campaign?.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get connected platforms for API calls
    const { data: platforms } = await supabase
      .from('connected_platforms')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const results: DspStatusResult[] = [];
    const updates: { id: string; status: string; dsp_status: string }[] = [];

    // Group by platform to batch API calls (use filtered list with DSP IDs)
    const metaEntities = statusesToCheck.filter((s: any) => s.platform.toLowerCase().includes('meta'));
    const tiktokEntities = statusesToCheck.filter((s: any) => s.platform.toLowerCase().includes('tiktok'));

    // Check Meta campaign statuses
    const metaPlatform = platforms?.find(p => p.platform_type === 'meta');
    if (metaPlatform?.access_token && metaEntities.length > 0) {
      for (const entity of metaEntities) {
        try {
          const response = await fetch(
            `https://graph.facebook.com/v22.0/${entity.dsp_entity_id}?fields=status,effective_status&access_token=${metaPlatform.access_token}`
          );
          const data = await response.json();
          
          if (!data.error) {
            const isLive = data.effective_status === 'ACTIVE' || data.status === 'ACTIVE';
            const newStatus = isLive ? 'live' : (data.status === 'PAUSED' ? 'pushed_to_dsp' : 'pushed_to_dsp');
            
            results.push({
              entityId: entity.id,
              dspEntityId: entity.dsp_entity_id,
              platform: 'Meta',
              dspStatus: data.status,
              effectiveStatus: data.effective_status,
              isLive
            });
            
            updates.push({
              id: entity.id,
              status: newStatus,
              dsp_status: data.effective_status || data.status
            });
          }
        } catch (e) {
          console.error(`Error checking Meta entity ${entity.dsp_entity_id}:`, e);
        }
      }
    }

    // Check TikTok campaign statuses
    const tiktokPlatform = platforms?.find(p => p.platform_type === 'tiktok');
    console.log(`TikTok platform found: ${!!tiktokPlatform}, entities to check: ${tiktokEntities.length}`);
    
    if (tiktokPlatform?.access_token && tiktokEntities.length > 0) {
      for (const entity of tiktokEntities) {
        try {
          // Get advertiser ID from error_details (where it was stored during push) or fallback
          const advertiserId = entity.error_details?.advertiserId || tiktokPlatform.ad_account_id;
          
          if (!advertiserId) {
            console.error(`No advertiser ID found for TikTok entity ${entity.id}`);
            continue;
          }
          
          console.log(`Checking TikTok entity ${entity.dsp_entity_id} with advertiser ${advertiserId}`);
          
          const response = await fetch(
            `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${advertiserId}&campaign_ids=["${entity.dsp_entity_id}"]`,
            {
              headers: {
                'Access-Token': tiktokPlatform.access_token,
                'Content-Type': 'application/json'
              }
            }
          );
          const data = await response.json();
          console.log(`TikTok API response for ${entity.dsp_entity_id}:`, JSON.stringify(data));
          
          if (data.code === 0 && data.data?.list?.[0]) {
            const campaignData = data.data.list[0];
            const isLive = campaignData.operation_status === 'ENABLE' && campaignData.status === 'CAMPAIGN_STATUS_ENABLE';
            const newStatus = isLive ? 'live' : 'pushed_to_dsp';
            
            results.push({
              entityId: entity.id,
              dspEntityId: entity.dsp_entity_id,
              platform: 'TikTok',
              dspStatus: campaignData.operation_status,
              isLive
            });
            
            updates.push({
              id: entity.id,
              status: newStatus,
              dsp_status: campaignData.operation_status
            });
          } else {
            console.log(`TikTok entity ${entity.dsp_entity_id} not found or error: code=${data.code}, message=${data.message}`);
            // Keep as pushed_to_dsp if we can't verify status
            results.push({
              entityId: entity.id,
              dspEntityId: entity.dsp_entity_id,
              platform: 'TikTok',
              dspStatus: 'UNKNOWN',
              isLive: false
            });
          }
        } catch (e) {
          console.error(`Error checking TikTok entity ${entity.dsp_entity_id}:`, e);
          // Don't let one entity failure block others
        }
      }
    } else {
      console.log(`Skipping TikTok status check: no platform or no entities`);
    }

    // Update statuses in database
    for (const update of updates) {
      await supabase
        .from('campaign_launch_status')
        .update({ 
          status: update.status, 
          dsp_status: update.dsp_status,
          last_checked_at: new Date().toISOString()
        })
        .eq('id', update.id);
    }

    // Re-fetch ALL launch statuses to recalculate overall campaign status
    const { data: allStatuses } = await supabase
      .from('campaign_launch_status')
      .select('status')
      .eq('campaign_id', campaignId);
    
    // Determine overall campaign status based on all entities
    const statusCounts = {
      pushed_to_dsp: 0,
      live: 0,
      push_failed: 0,
      ready_for_push: 0,
      pushing: 0,
      other: 0
    };
    
    for (const s of (allStatuses || [])) {
      if (s.status === 'pushed_to_dsp') statusCounts.pushed_to_dsp++;
      else if (s.status === 'live') statusCounts.live++;
      else if (s.status === 'push_failed') statusCounts.push_failed++;
      else if (s.status === 'ready_for_push') statusCounts.ready_for_push++;
      else if (s.status === 'pushing') statusCounts.pushing++;
      else statusCounts.other++;
    }
    
    const totalEntities = allStatuses?.length || 0;
    const successfullyPushed = statusCounts.pushed_to_dsp + statusCounts.live;
    const allLive = totalEntities > 0 && statusCounts.live === totalEntities;
    const allPushed = totalEntities > 0 && successfullyPushed === totalEntities;
    const hasFailed = statusCounts.push_failed > 0;
    const hasPending = statusCounts.ready_for_push > 0 || statusCounts.pushing > 0;
    
    let newCampaignStatus = 'draft';
    if (allLive) {
      newCampaignStatus = 'live';
    } else if (allPushed) {
      newCampaignStatus = 'pushed_to_dsp';
    } else if (successfullyPushed > 0 && (hasFailed || hasPending)) {
      newCampaignStatus = 'partially_pushed';
    } else if (hasFailed && successfullyPushed === 0) {
      newCampaignStatus = 'push_failed';
    }
    
    console.log(`Status recalculation: total=${totalEntities}, pushed=${successfullyPushed}, failed=${statusCounts.push_failed}, pending=${statusCounts.ready_for_push + statusCounts.pushing} => ${newCampaignStatus}`);
    
    // Update campaign status
    await supabase
      .from('campaigns')
      .update({ status: newCampaignStatus })
      .eq('id', campaignId);

    console.log(`Status check complete for campaign ${campaignId}: ${results.length} entities checked, campaign status: ${newCampaignStatus}`);

    return new Response(
      JSON.stringify({ results, allLive }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Status check error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
