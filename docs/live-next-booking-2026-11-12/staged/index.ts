// STAGED ONLY: do not move into supabase/functions or deploy without separate approval.
import { createHandler } from "./handler.ts";
Deno.serve(createHandler({ env: name => Deno.env.get(name) }));