/**
 * One-off / ops: fully delete an auth user by UUID using the Admin API (CASCADE from DB FKs).
 *
 * Invoke ONLY from a secure context (never expose the service role key in browser code).
 *
 *   curl -X POST "https://<project>.supabase.co/functions/v1/admin-purge-user" \
 *     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"userId":"42dcea7a-4927-4987-a87e-983de9641b65"}'
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceKey) return json(500, { error: "Missing Supabase env" });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader !== `Bearer ${serviceKey}`) {
      return json(403, { error: "Forbidden — call only with the service role key (server-side / curl)" });
    }

    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return json(400, { error: "Body must include userId (uuid)" });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: profile } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
    const email = profile?.email as string | undefined;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey && email) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const customers = await stripe.customers.list({ email, limit: 5 });
      for (const c of customers.data) {
        const subs = await stripe.subscriptions.list({ customer: c.id, status: "all" });
        for (const sub of subs.data) {
          if (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") {
            await stripe.subscriptions.cancel(sub.id);
          }
        }
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error("[admin-purge-user]", delErr);
      return json(500, { error: delErr.message });
    }

    return json(200, {
      ok: true,
      deletedUserId: userId,
      note:
        "Auth user removed; public rows with ON DELETE CASCADE from auth.users are cleaned by Postgres. Teams owned by this user are removed if teams.owner_id references auth.users with CASCADE.",
    });
  } catch (e) {
    console.error("[admin-purge-user]", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
