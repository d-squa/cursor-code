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

    const { query, type, metaAdAccountId, tiktokAdvertiserId } = await req.json();

    if (!query || !type) {
      throw new Error('Query and type are required');
    }

    console.log('Cross-platform search:', { query, type, metaAdAccountId, tiktokAdvertiserId });

    const results: {
      meta: Array<{ id: string; name: string; audienceSize?: number; platform: string }>;
      tiktok: Array<{ id: string; name: string; audienceSize?: number; platform: string }>;
    } = {
      meta: [],
      tiktok: []
    };

    // Search Meta if ad account provided
    if (metaAdAccountId) {
      try {
        const metaResponse = await supabaseClient.functions.invoke('search-meta-targeting', {
          body: { query, type, adAccountId: metaAdAccountId }
        });
        
        if (metaResponse.data?.results) {
          results.meta = metaResponse.data.results.map((r: any) => ({
            ...r,
            platform: 'meta'
          }));
        }
      } catch (error) {
        console.error('Meta search error:', error);
      }
    }

    // Search TikTok if advertiser ID provided
    if (tiktokAdvertiserId) {
      try {
        const tiktokResponse = await supabaseClient.functions.invoke('search-tiktok-targeting', {
          body: { query, type, advertiserId: tiktokAdvertiserId }
        });
        
        if (tiktokResponse.data?.results) {
          results.tiktok = tiktokResponse.data.results.map((r: any) => ({
            ...r,
            platform: 'tiktok'
          }));
        }
      } catch (error) {
        console.error('TikTok search error:', error);
      }
    }

    // Find cross-platform matches
    const matches = findMatches(results.meta, results.tiktok);

    console.log(`Cross-platform search completed: ${results.meta.length} Meta, ${results.tiktok.length} TikTok, ${matches.length} matches`);

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
