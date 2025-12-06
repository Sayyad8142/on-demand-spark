import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CURRENT_VERSION_CODE } from '@/config/version';

export const useForceUpdateCheck = () => {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkVersion = async () => {
      // Set a 3-second timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        console.log('Version check timed out, proceeding without update');
        setNeedsUpdate(false);
        setLoading(false);
      }, 3000);

      try {
        const currentVersionCode = CURRENT_VERSION_CODE;

        // Use maybeSingle() to handle empty table gracefully
        const { data, error } = await supabase
          .from('app_config')
          .select('min_worker_version_code')
          .maybeSingle();

        clearTimeout(timeoutId);

        if (error) {
          console.error('Error fetching app config:', error);
          setNeedsUpdate(false);
          setLoading(false);
          return;
        }

        // If no config row exists, don't require update
        if (!data) {
          setNeedsUpdate(false);
          setLoading(false);
          return;
        }

        const minVersionCode = data.min_worker_version_code || 1;

        if (currentVersionCode < minVersionCode) {
          setNeedsUpdate(true);
        } else {
          setNeedsUpdate(false);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('Error checking version:', error);
        setNeedsUpdate(false);
      } finally {
        setLoading(false);
      }
    };

    checkVersion();
  }, []);

  return { needsUpdate, loading };
};
