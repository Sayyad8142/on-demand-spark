/** STAGED ONLY — self-contained: copy this whole folder to supabase/functions/send-practice-notification/
 * only after explicit approval. PRACTICE_PUSH_SENDER: unset/anything else = refuse all (503),
 * "validate" = FCM validate_only transport check (delivers nothing), "on" = deliver to the pilot only.
 * Identity: every request is verified in code against Supabase Auth (/auth/v1/user); see config.toml.snippet.
 */
import { createLiveAdapters, type ServiceAccount } from './adapters.ts';
import { handlePracticeRequest } from './handler.ts';

function serviceAccount(): ServiceAccount | null {
  try {
    const sa = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY') ?? '');
    return sa?.project_id && sa?.client_email && sa?.private_key ? sa : null;
  } catch { return null; }
}

Deno.serve(req => handlePracticeRequest(req, jwt => createLiveAdapters({
  enabled: ['on', 'validate'].includes(Deno.env.get('PRACTICE_PUSH_SENDER') ?? ''),
  validateOnly: Deno.env.get('PRACTICE_PUSH_SENDER') === 'validate',
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  jwt,
  pilotUserId: Deno.env.get('PRACTICE_PILOT_USER_ID'),
  pilotTokenSha256: Deno.env.get('PRACTICE_PILOT_TOKEN_SHA256'),
  serviceAccount: serviceAccount(),
  fetch,
})));
