import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CURRENT_VERSION_CODE } from '@/config/version';

export const useForceUpdateCheck = () => {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Get current app version code from config
        const currentVersionCode = CURRENT_VERSION_CODE;

        console.log('Current app version code:', currentVersionCode);

        // Fetch minimum required version from Supabase
        const { data, error } = await supabase
          .from('app_config')
          .select('min_worker_version_code')
          .single();

        if (error) {
          console.error('Error fetching app config:', error);
          setNeedsUpdate(false);
          return;
        }

        const minVersionCode = data?.min_worker_version_code || 1;
        console.log('Minimum required version code:', minVersionCode);

        // Check if update is needed
        if (currentVersionCode < minVersionCode) {
          console.log('Update required!');
          setNeedsUpdate(true);
        } else {
          console.log('App is up to date');
          setNeedsUpdate(false);
        }
      } catch (error) {
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
