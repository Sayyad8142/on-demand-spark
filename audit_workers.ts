import { supabase } from './src/integrations/supabase/client';

async function auditWorkers() {
  console.log('--- AUDITING WORKERS ---');

  // 1. Fetch all workers
  const { data: workers, error } = await supabase
    .from('workers')
    .select('id, user_id, full_name, phone, communities, is_active, created_at');

  if (error) {
    console.error('Error fetching workers:', error);
    return;
  }

  console.log(`Found ${workers.length} workers.`);

  const stats = {
    total: workers.length,
    noUserId: 0,
    mismatchedId: 0,
    malformedPhone: 0,
    duplicates: new Map(),
  };

  for (const w of workers) {
    // Check user_id
    if (!w.user_id) stats.noUserId++;
    if (w.user_id === w.id) stats.mismatchedId++; // Legacy where id was reused

    // Check phone formatting
    if (!w.phone.startsWith('+91') || w.phone.length !== 13) {
        stats.malformedPhone++;
        console.log(`[Malformed Phone] ${w.full_name}: ${w.phone}`);
    }

    // Check duplicates
    const normalized = w.phone.replace(/\D/g, '');
    const clean10 = normalized.length > 10 ? normalized.slice(-10) : normalized;
    if (stats.duplicates.has(clean10)) {
        stats.duplicates.get(clean10).push(w);
    } else {
        stats.duplicates.set(clean10, [w]);
    }
  }

  console.log('\nStats:', {
    total: stats.total,
    noUserId: stats.noUserId,
    mismatchedId: stats.mismatchedId,
    malformedPhone: stats.malformedPhone,
  });

  console.log('\nDuplicate Groups:');
  for (const [phone, group] of stats.duplicates) {
    if (group.length > 1) {
      console.log(`Phone ${phone}:`, group.map(g => `${g.full_name} (${g.id})`));
    }
  }

  // 2. Check for worker "Sid" specifically
  const sid = workers.find(w => w.full_name.includes('Sid') || w.phone.includes('7898496396'));
  if (sid) {
    console.log('\nSid Detail:', sid);
  } else {
    console.log('\nSid not found in database.');
  }
}

auditWorkers().catch(console.error);
