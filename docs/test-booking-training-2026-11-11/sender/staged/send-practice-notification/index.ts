/** STAGED ONLY — copy to supabase/functions/send-practice-notification/ only after explicit approval.
 * Stays refusing (503 approval_required) unless the PRACTICE_PUSH_SENDER secret equals "on".
 * Requires verify_jwt = true in config.toml for this function.
 */
import { createLiveAdapters, type ServiceAccount } from '../adapters.ts';
import { handlePracticeRequest } from './handler.ts';

function serviceAccount(): ServiceAccount | null {
  try {
    const sa = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY') ?? '');
    return sa?.project_id && sa?.client_email && sa?.private_key ? sa : null;
  } catch { return null; }
}

Deno.serve(req => handlePracticeRequest(req, jwt => createLiveAdapters({
  enabled: Deno.env.get('PRACTICE_PUSH_SENDER') === 'on',
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  jwt,
  pilotUserId: Deno.env.get('PRACTICE_PILOT_USER_ID'),
  pilotTokenSha256: Deno.env.get('PRACTICE_PILOT_TOKEN_SHA256'),
  serviceAccount: serviceAccount(),
  fetch,
})));
