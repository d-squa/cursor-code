import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { query, metaAdAccountId, tiktokAdvertiserId } = await req.json();

    if (!query) {
      throw new Error('Query is required');
    }

    console.log('Cross-platform search all categories:', { query, metaAdAccountId, tiktokAdvertiserId });

    const results: {
      meta: {
        interests: any[];
        behaviors: any[];
        demographics: any[];
      };
      tiktok: {
        interests: any[];
        behaviors: any[];
        purchaseIntention: any[];
        videoInteractions: any[];
      };
    } = {
      meta: {
        interests: [],
        behaviors: [],
        demographics: []
      },
      tiktok: {
        interests: [],
        behaviors: [],
        purchaseIntention: [],
        videoInteractions: []
      }
    };

    // Search Meta across all categories if ad account provided
    if (metaAdAccountId) {
      try {
        const [interestsRes, behaviorsRes, demographicsRes] = await Promise.all([
          supabaseClient.functions.invoke('search-meta-targeting', {
            body: { query, type: 'interests', adAccountId: metaAdAccountId }
          }),
          supabaseClient.functions.invoke('search-meta-targeting', {
            body: { query, type: 'behaviors', adAccountId: metaAdAccountId }
          }),
          supabaseClient.functions.invoke('search-meta-targeting', {
            body: { query, type: 'demographics', adAccountId: metaAdAccountId }
          })
        ]);
        
        if (interestsRes.data?.results) {
          results.meta.interests = interestsRes.data.results.map((r: any) => ({ ...r, platform: 'meta', category: 'interests' }));
        }
        if (behaviorsRes.data?.results) {
          results.meta.behaviors = behaviorsRes.data.results.map((r: any) => ({ ...r, platform: 'meta', category: 'behaviors' }));
        }
        if (demographicsRes.data?.results) {
          results.meta.demographics = demographicsRes.data.results.map((r: any) => ({ ...r, platform: 'meta', category: 'demographics' }));
        }
        
        console.log('Meta search results:', {
          interests: results.meta.interests.length,
          behaviors: results.meta.behaviors.length,
          demographics: results.meta.demographics.length
        });
      } catch (error) {
        console.error('Meta search error:', error);
      }
    }

    // Search TikTok across all categories if advertiser ID provided
    if (tiktokAdvertiserId) {
      try {
        const [interestsRes, behaviorsRes, purchaseIntentRes, videoInteractionsRes] = await Promise.all([
          supabaseClient.functions.invoke('search-tiktok-targeting', {
            body: { query, type: 'interests', advertiserId: tiktokAdvertiserId }
          }),
          supabaseClient.functions.invoke('search-tiktok-targeting', {
            body: { query, type: 'behaviors', advertiserId: tiktokAdvertiserId }
          }),
          supabaseClient.functions.invoke('search-tiktok-targeting', {
            body: { query, type: 'actions', advertiserId: tiktokAdvertiserId }
          }),
          supabaseClient.functions.invoke('search-tiktok-targeting', {
            body: { query, type: 'interests', advertiserId: tiktokAdvertiserId }
          })
        ]);
        
        if (interestsRes.data?.results) {
          results.tiktok.interests = interestsRes.data.results.map((r: any) => ({ ...r, platform: 'tiktok', category: 'interests' }));
        }
        if (behaviorsRes.data?.results) {
          results.tiktok.behaviors = behaviorsRes.data.results.map((r: any) => ({ ...r, platform: 'tiktok', category: 'behaviors' }));
        }
        if (purchaseIntentRes.data?.results) {
          results.tiktok.purchaseIntention = purchaseIntentRes.data.results.map((r: any) => ({ ...r, platform: 'tiktok', category: 'purchase_intention' }));
        }
        if (videoInteractionsRes.data?.results) {
          results.tiktok.videoInteractions = videoInteractionsRes.data.results.map((r: any) => ({ ...r, platform: 'tiktok', category: 'video_interactions' }));
        }
        
        console.log('TikTok search results:', {
          interests: results.tiktok.interests.length,
          behaviors: results.tiktok.behaviors.length,
          purchaseIntention: results.tiktok.purchaseIntention.length,
          videoInteractions: results.tiktok.videoInteractions.length
        });
      } catch (error) {
        console.error('TikTok search error:', error);
      }
    }

    // Find cross-platform matches
    const allMetaResults = [...results.meta.interests, ...results.meta.behaviors, ...results.meta.demographics];
    const allTiktokResults = [...results.tiktok.interests, ...results.tiktok.behaviors, ...results.tiktok.purchaseIntention, ...results.tiktok.videoInteractions];
    const matches = findMatches(allMetaResults, allTiktokResults);

    const totalMeta = allMetaResults.length;
    const totalTiktok = allTiktokResults.length;
    console.log(`Cross-platform search completed: ${totalMeta} Meta, ${totalTiktok} TikTok, ${matches.length} matches`);

    return new Response(
      JSON.stringify({
        meta: results.meta,
        tiktok: results.tiktok,
        matches
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in cross-platform search:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function findMatches(
  metaResults: Array<{ id: string; name: string; platform: string }>,
  tiktokResults: Array<{ id: string; name: string; platform: string }>
): Array<{ meta: any; tiktok: any; score: number }> {
  const matches = [];
  
  for (const metaItem of metaResults) {
    const metaName = metaItem.name.toLowerCase();
    
    for (const tiktokItem of tiktokResults) {
      const tiktokName = tiktokItem.name.toLowerCase();
      let score = 0;
      
      // Exact match
      if (metaName === tiktokName) {
        score = 100;
      }
      // Contains match
      else if (metaName.includes(tiktokName) || tiktokName.includes(metaName)) {
        score = 80;
      }
      // Word overlap
      else {
        const metaWords = metaName.split(/\s+/);
        const tiktokWords = tiktokName.split(/\s+/);
        const commonWords = metaWords.filter(w => tiktokWords.includes(w));
        score = (commonWords.length / Math.max(metaWords.length, tiktokWords.length)) * 60;
      }
      
      if (score > 50) {
        matches.push({
          meta: metaItem,
          tiktok: tiktokItem,
          score
        });
      }
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  return matches;
}