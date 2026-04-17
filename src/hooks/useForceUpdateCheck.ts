import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CURRENT_VERSION_CODE } from '@/config/version';

const CACHE_KEY = 'force_update_last_check_v2';
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours
const REMIND_LATER_KEY = 'soft_update_remind_later_until';

export interface AppUpdateConfig {
  update_title: string;
  user_update_message: string;
  soft_update_message: string;
  release_notes: string | null;
  latest_worker_version_name: string;
  min_worker_version_code: number;
  play_store_url_worker: string;
  ios_store_url_worker: string;
  support_phone: string;
  soft_update_enabled: boolean;
}

export type UpdateMode = 'none' | 'soft' | 'hard';

export interface UpdateCheckState {
  needsUpdate: boolean; // hard block
  softUpdate: boolean; // soft prompt
  config: AppUpdateConfig | null;
  dismissSoftUpdate: () => void;
}

const DEFAULT_CONFIG: AppUpdateConfig = {
  update_title: 'Update Available',
  user_update_message: 'A newer version of Didi Now Partner is available. Please update to continue.',
  soft_update_message: 'A new version is available with improvements and bug fixes.',
  release_notes: null,
  latest_worker_version_name: '1.0.0',
  min_worker_version_code: 1,
  play_store_url_worker: 'https://play.google.com/store/apps/details?id=com.didinow.partner',
  ios_store_url_worker: '',
  support_phone: '8008180018',
  soft_update_enabled: false,
};

export const useForceUpdateCheck = (): UpdateCheckState => {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [softUpdate, setSoftUpdate] = useState(false);
  const [config, setConfig] = useState<AppUpdateConfig | null>(null);

  const dismissSoftUpdate = () => {
    // Snooze for 24h
    const until = Date.now() + 24 * 60 * 60 * 1000;
    try { localStorage.setItem(REMIND_LATER_KEY, String(until)); } catch {}
    setSoftUpdate(false);
  };

  useEffect(() => {
    let cancelled = false;

    const checkVersion = async () => {
      // Try cached config first for instant render
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { timestamp, config: cachedConfig } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION_MS && cachedConfig) {
            applyConfig(cachedConfig);
          }
        }
      } catch {}

      const timeoutId = setTimeout(() => {
        console.log('Version check timed out, using cached/default config');
      }, 4000);

      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('update_title, user_update_message, soft_update_message, release_notes, latest_worker_version_name, min_worker_version_code, play_store_url_worker, ios_store_url_worker, support_phone, soft_update_enabled')
          .maybeSingle();

        clearTimeout(timeoutId);
        if (cancelled) return;

        if (error || !data) {
          console.warn('Version check: no config row, app continues normally');
          return;
        }

        const merged: AppUpdateConfig = { ...DEFAULT_CONFIG, ...(data as Partial<AppUpdateConfig>) };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), config: merged }));
        } catch {}
        applyConfig(merged);
      } catch (err) {
        clearTimeout(timeoutId);
        console.error('Version check failed (app continues):', err);
      }
    };

    const applyConfig = (cfg: AppUpdateConfig) => {
      setConfig(cfg);
      const minCode = cfg.min_worker_version_code || 1;
      if (CURRENT_VERSION_CODE < minCode) {
        setNeedsUpdate(true);
        setSoftUpdate(false);
        return;
      }
      setNeedsUpdate(false);

      // Soft update: when enabled and current code is behind a higher "latest" but not below min.
      // We treat soft as enabled flag from admin; show until snoozed.
      if (cfg.soft_update_enabled) {
        let snoozed = false;
        try {
          const until = Number(localStorage.getItem(REMIND_LATER_KEY) || '0');
          if (until && Date.now() < until) snoozed = true;
        } catch {}
        setSoftUpdate(!snoozed);
      } else {
        setSoftUpdate(false);
      }
    };

    checkVersion();
    return () => { cancelled = true; };
  }, []);

  return { needsUpdate, softUpdate, config, dismissSoftUpdate };
};
