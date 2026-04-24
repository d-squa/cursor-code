import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use service role to set up cron job
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Schedule cron job to run every hour
    const cronQuery = `
      SELECT cron.schedule(
        'sync-meta-resources-hourly',
        '0 * * * *', -- Every hour at minute 0
        $$
        SELECT
          net.http_post(
            url:='${supabaseUrl}/functions/v1/sync-meta-resources',
            headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${supabaseAnonKey}"}'::jsonb,
            body:='{}'::jsonb
          ) as request_id;
        $$
      );
    `;

    // Note: This requires pg_cron extension to be enabled
    // The cron job will need to be set up manually via SQL
    
    return new Response(
      JSON.stringify({ 
        message: "To set up hourly sync, run this SQL in your database:",
        sql: cronQuery,
        note: "Make sure pg_cron and pg_net extensions are enabled first"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Setup error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
