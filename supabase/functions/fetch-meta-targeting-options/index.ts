import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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

    // Create Supabase client with service role for querying
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get user from JWT (already verified by verify_jwt = true in config)
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { type, search } = await req.json();

    // Get user's Meta access token
    const { data: platformData, error: platformError } = await supabaseClient
      .from('connected_platforms')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform_type', 'meta')
      .eq('is_active', true)
      .single();

    if (platformError || !platformData?.access_token) {
      console.error('Platform error:', platformError);
      throw new Error('Meta platform not connected');
    }

    const accessToken = platformData.access_token;
    const apiVersion = 'v21.0';
    const baseUrl = `https://graph.facebook.com/${apiVersion}`;

    let result: any = {};

    switch (type) {
      case 'genders': {
        // Gender options are static
        result = {
          data: [
            { id: '1', name: 'Male' },
            { id: '2', name: 'Female' },
            { id: '0', name: 'All' }
          ]
        };
        break;
      }

      case 'devices': {
        // Device options from Meta targeting specs
        result = {
          data: [
            { id: 'mobile', name: 'Mobile' },
            { id: 'desktop', name: 'Desktop' },
            { id: 'tablet', name: 'Tablet' }
          ]
        };
        break;
      }

      case 'os': {
        // Operating system options
        result = {
          data: [
            { id: 'iOS', name: 'iOS' },
            { id: 'Android', name: 'Android' },
            { id: 'Windows', name: 'Windows' },
            { id: 'Mac OS X', name: 'Mac OS X' },
            { id: 'Linux', name: 'Linux' }
          ]
        };
        break;
      }

      case 'languages': {
        // Fetch locale options from Meta API
        const url = `${baseUrl}/search?type=adlocale&q=${encodeURIComponent(search || '')}&access_token=${accessToken}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Meta API error: ${response.status}`);
        }
        
        result = await response.json();
        break;
      }

      case 'age': {
        // Age range is static (13-65+ for Meta)
        const ages = [];
        for (let i = 13; i <= 65; i++) {
          ages.push({ id: i.toString(), name: i === 65 ? '65+' : i.toString() });
        }
        result = { data: ages };
        break;
      }

      default:
        throw new Error(`Unknown targeting type: ${type}`);
    }

    console.log(`Fetched ${type} targeting options:`, result.data?.length || 0, 'items');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching targeting options:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
