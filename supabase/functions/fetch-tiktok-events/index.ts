import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAccessToken } from "../_shared/vault-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { advertiserId, pixelId } = await req.json();
    if (!advertiserId) {
      throw new Error('advertiserId is required');
    }

    console.log('Fetching TikTok events for advertiser:', advertiserId, 'pixel:', pixelId);

    // Get TikTok connection and retrieve token from Vault
    const { data: connection, error: connectionError } = await supabase
      .from('connected_platforms')
      .select('id, access_token')
      .eq('user_id', user.id)
      .eq('platform_type', 'tiktok')
      .eq('is_active', true)
      .single();

    if (connectionError || !connection) {
      throw new Error('TikTok connection not found or inactive');
    }

    // Get token from Vault with fallback to database column
    const accessToken = await getAccessToken(supabase, connection.id, connection.access_token);
    if (!accessToken) {
      throw new Error('TikTok access token not found');
    }

    const baseUrl = 'https://business-api.tiktok.com/open_api/v1.3';

    // Standard TikTok messaging/conversion events for message event sets
    const standardEvents = [
      { id: "SubmitForm", name: "Submit Form" },
      { id: "CompletePayment", name: "Complete Payment" },
      { id: "PlaceAnOrder", name: "Place an Order" },
      { id: "StartCheckout", name: "Start Checkout" },
      { id: "AddToCart", name: "Add to Cart" },
      { id: "ViewContent", name: "View Content" },
      { id: "Search", name: "Search" },
      { id: "AddToWishlist", name: "Add to Wishlist" },
      { id: "ClickButton", name: "Click Button" },
      { id: "Download", name: "Download" },
      { id: "Contact", name: "Contact" },
      { id: "Subscribe", name: "Subscribe" },
      { id: "CustomizeProduct", name: "Customize Product" },
    ];

    let pixelEvents: Array<{ id: string; name: string }> = [];

    // If a pixel is provided, try to fetch its events
    if (pixelId) {
      console.log('Fetching events for pixel:', pixelId);
      
      // Fetch pixel details which may include event information
      const pixelResponse = await fetch(
        `${baseUrl}/pixel/list/?advertiser_id=${advertiserId}&pixel_ids=["${pixelId}"]`,
        {
          headers: {
            'Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const pixelData = await pixelResponse.json();
      console.log('Pixel response:', JSON.stringify(pixelData, null, 2));

      if (pixelData.code === 0 && pixelData.data?.pixels) {
        const pixel = pixelData.data.pixels[0];
        if (pixel?.events) {
          pixelEvents = pixel.events.map((event: any) => ({
            id: event.event_name || event.event_type,
            name: event.display_name || event.event_name || event.event_type,
          }));
        }
      }
    }

    // Combine standard events with any custom events from pixel
    const allEvents = [...standardEvents];
    
    // Add pixel events that aren't already in standard events
    for (const pixelEvent of pixelEvents) {
      if (!allEvents.find(e => e.id === pixelEvent.id)) {
        allEvents.push(pixelEvent);
      }
    }

    console.log(`Returning ${allEvents.length} events`);

    return new Response(
      JSON.stringify({ 
        success: true,
        events: allEvents,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error fetching TikTok events:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        // Return standard events as fallback
        events: [
          { id: "SubmitForm", name: "Submit Form" },
          { id: "CompletePayment", name: "Complete Payment" },
          { id: "PlaceAnOrder", name: "Place an Order" },
          { id: "Contact", name: "Contact" },
        ]
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 // Return 200 with fallback events
      }
    );
  }
});
