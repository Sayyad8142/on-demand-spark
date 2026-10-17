// ack-booking-delivery — entry point. Logic lives in handler.ts (tested offline).
import { createClient } from "npm:@supabase/supabase-js@2";
import { makeHandler } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://paywwbuqycovjopryele.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(makeHandler({
  admin: () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
  userClient: (authHeader) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } }),
}));
