// fcm-keepalive
// Cron-driven (every 20 min). Sends a silent data-only FCM PING to all
// available workers with an FCM token whose last keepalive was >15m ago.
// Worker app responds via worker-keepalive-ack, which proves real reachability.

import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();

    const { data: workers, error } = await supabase
      .from("workers")
      .select("id")
      .eq("is_available", true)
      .not("fcm_token", "is", null)
      .or(`last_keepalive_sent_at.is.null,last_keepalive_sent_at.lt.${cutoff}`)
      .limit(500);

    if (error) {
      console.error(JSON.stringify({ evt: "keepalive_lookup_failed", err: error.message }));
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    const ids = (workers ?? []).map((w) => w.id);
    if (!ids.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stamp before sending so we don't double-fire if cron overlaps.
    await supabase.from("workers").update({ last_keepalive_sent_at: new Date().toISOString() }).in("id", ids);

    // Send silent data-only PING via existing send-fcm function.
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-fcm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        workerIds: ids,
        title: "",
        body: "",
        data: { type: "PING", ts: String(Date.now()) },
      }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error(JSON.stringify({ evt: "keepalive_send_failed", status: resp.status, body: text.slice(0, 500) }));
    }

    // Log event rows
    await supabase.from("notification_delivery_events").insert(
      ids.map((wid) => ({ worker_id: wid, event_type: "keepalive_sent", payload: {} })),
    );

    console.log(JSON.stringify({ evt: "keepalive_sent_batch", count: ids.length }));
    return new Response(JSON.stringify({ ok: true, sent: ids.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(JSON.stringify({ evt: "keepalive_fatal", err: msg }));
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
