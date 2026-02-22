import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CURRENT_VERSION_CODE } from '@/config/version';

const CACHE_KEY = 'force_update_last_check';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export const useForceUpdateCheck = () => {
  const [needsUpdate, setNeedsUpdate] = useState(false);

  useEffect(() => {
    const checkVersion = async () => {
      // Check cache first — skip if checked within 24 hours and was fine
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { timestamp, result } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION_MS) {
            if (result) setNeedsUpdate(true);
            return;
          }
        }
      } catch {}

      // Set a 3-second timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        console.log('Version check timed out, proceeding without update');
      }, 3000);

      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('min_worker_version_code')
          .maybeSingle();

        clearTimeout(timeoutId);

        if (error || !data) {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), result: false }));
          return;
        }

        const minVersionCode = data.min_worker_version_code || 1;
        const updateRequired = CURRENT_VERSION_CODE < minVersionCode;

        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), result: updateRequired }));

        if (updateRequired) {
          setNeedsUpdate(true);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('Error checking version:', error);
      }
    };

    checkVersion();
  }, []);

  return { needsUpdate };
};
