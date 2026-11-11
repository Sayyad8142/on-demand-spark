/** Request handling for the staged practice sender. Not deployed. */
import { preparePracticeSend, type PracticeSenderAdapters } from '../senderCore.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export async function handlePracticeRequest(req: Request, build: (jwt: string | null) => PracticeSenderAdapters): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { sent: false, reason: 'method_not_allowed' });
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() || null : null;
  const adapters = build(jwt);
  if (!adapters.enabled) return json(503, { sent: false, reason: 'approval_required' });
  const text = await req.text();
  if (text.length > 1024) return json(413, { sent: false, reason: 'invalid_request' });
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { return json(400, { sent: false, reason: 'invalid_request' }); }
  const result = await preparePracticeSend(body, adapters);
  // One line, no token, no JWT, no worker id.
  console.log(`practice_send status=${result.status} reason=${result.body.reason ?? 'sent'}`);
  return json(result.status, result.body);
}
