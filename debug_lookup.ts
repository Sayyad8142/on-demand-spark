
import { supabase } from './src/integrations/supabase/client';

async function testWorkerLookup(rawPhone) {
  const normalizePhone = (p) => {
    const cleaned = p.replace(/\D/g, '');
    const result = cleaned.startsWith('91') && cleaned.length > 10 ? '+' + cleaned : '+91' + (cleaned.length > 10 && cleaned.startsWith('91') ? cleaned.substring(2) : cleaned);
    // Correcting the logic to handle various cases
    const justDigits = p.replace(/\D/g, '');
    let final;
    if (justDigits.length === 10) {
        final = '+91' + justDigits;
    } else if (justDigits.length === 12 && justDigits.startsWith('91')) {
        final = '+' + justDigits;
    } else {
        final = '+' + justDigits; // Best effort
    }
    return final;
  };
  
  const testPhones = ['7898496396', '+917898496396', '917898496396', '7894896396'];
  
  for (const phone of testPhones) {
    const normalized = normalizePhone(phone);
    console.log(`\n--- Testing phone: ${phone} -> Normalized: ${normalized} ---`);
    
    const { data: phoneExists, error: rpcError } = await supabase.rpc('worker_phone_exists', { _phone: normalized });
    console.log('RPC worker_phone_exists:', phoneExists, rpcError ? `Error: ${rpcError.message}` : '');
    
    const { data: worker, error: queryError } = await supabase
      .from('workers')
      .select('id, user_id, phone, full_name')
      .eq('phone', normalized)
      .maybeSingle();
    console.log('Direct query:', worker ? `${worker.full_name} (${worker.phone})` : 'Not found', queryError ? `Error: ${queryError.message}` : '');
  }
}

testWorkerLookup('7898496396').catch(console.error);
