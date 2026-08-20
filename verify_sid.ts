import { supabase } from './src/integrations/supabase/client';

async function verifySid() {
  console.log('--- VERIFYING SID LOGIN ---');

  // Input phone number Sid enters
  const inputPhone = '7898496396';
  
  // Normalization logic from Auth.tsx
  const normalize = (p: string) => {
    const cleaned = p.replace(/\D/g, '');
    if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
    if (cleaned.length === 10) return `+91${cleaned}`;
    return cleaned.startsWith('91') ? `+${cleaned}` : `+91${cleaned}`;
  };
  
  const normalized = normalize(inputPhone);
  console.log(`Input: ${inputPhone} -> Normalized: ${normalized}`);

  // Test RPC worker_phone_exists
  const { data: exists, error: existsError } = await supabase.rpc('worker_phone_exists', { _phone: normalized });
  if (existsError) {
    console.error('Error testing worker_phone_exists:', existsError);
  } else {
    console.log(`worker_phone_exists('${normalized}'): ${exists}`);
  }

  // Fetch record manually to see what's in DB now
  const { data: workers, error: fetchError } = await supabase
    .from('workers')
    .select('*')
    .ilike('phone', `%${inputPhone.slice(-10)}`);
    
  if (fetchError) {
    console.error('Error fetching workers:', fetchError);
  } else {
    console.log('Matching workers in DB:', workers.map(w => ({ id: w.id, name: w.full_name, phone: w.phone, user_id: w.user_id })));
  }
}

verifySid().catch(console.error);
