import { createRoot } from "react-dom/client";
import "./index.css";
import { initializeStorageCache, isStorageInitialized, getStorageCacheDebug } from "./lib/capacitorStorage";
import { Capacitor } from '@capacitor/core';

// CRITICAL: Initialize storage cache BEFORE importing anything that uses Supabase
// This ensures the session is loaded into memory before Supabase client is created
const bootstrap = async () => {
  console.log('🚀 Bootstrap starting...');
  console.log('📱 Platform:', Capacitor.getPlatform());
  console.log('📱 Is Native:', Capacitor.isNativePlatform());
  
  // Step 1: Initialize storage cache first (loads session from Preferences into memory)
  try {
    await initializeStorageCache();
    const storageDebug = getStorageCacheDebug();
    console.log('✅ Storage initialized:', storageDebug);
    
    if (storageDebug.hasSession) {
      console.log('✅ Session found in storage cache');
    } else {
      console.log('ℹ️ No session in storage cache - user may need to login');
    }
  } catch (e) {
    console.error('❌ Storage initialization failed:', e);
  }
  
  // Crash capture + real installed version (local only, never blocks start-up).
  import("./lib/bootTelemetry").then(({ startBootTelemetry }) => startBootTelemetry()).catch(() => {});

  // Step 2: Now dynamically import i18n (may depend on storage)
  const { default: i18n, restoreWorkerLanguage } = await import("./i18n/config");
  
  // Helper to ensure i18n is initialized
  const waitForI18n = (): Promise<void> => {
    if (i18n.isInitialized) return Promise.resolve();
    return new Promise((resolve) => {
      i18n.on('initialized', () => resolve());
    });
  };
  
  await waitForI18n();
  await restoreWorkerLanguage();
  console.log('✅ i18n initialized');
  
  // Step 3: NOW import App (which imports Supabase client)
  // At this point, storage cache has the session loaded
  const { default: App } = await import("./App.tsx");
  
  console.log('✅ App imported, storage status:', isStorageInitialized());

  // Log resolved URL using the single source of truth
  const { getSupabaseUrl, debugConnectionCheck } = await import("./config/env");
  console.log('🔗 RESOLVED_SUPABASE_URL:', getSupabaseUrl());
  debugConnectionCheck();

  // Warm the community-type registry (apartment vs villa) in the background.
  // Cached in localStorage so booking popups can resolve villas synchronously.
  import("./lib/communityTypes").then(({ loadCommunityTypes }) => {
    loadCommunityTypes().catch(() => {});
  });

  const root = document.getElementById("root");
  if (root) createRoot(root).render(<App />);
};

bootstrap().catch((error) => {
  console.error('❌ Bootstrap failed:', error);
  // Show error UI
  const root = document.getElementById("root");
  if (root) {
    // Worker-facing: no URLs or technical details (those stay in the console log above).
    root.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; font-family: system-ui, sans-serif;">
        <div>
          <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 20px;">Something went wrong. Please try again.</h1>
          <button id="startup-retry" type="button" style="min-height: 48px; padding: 0 28px; border-radius: 12px; border: 0; background: #e11d48; color: #fff; font-size: 16px; font-weight: 700;">Try Again</button>
        </div>
      </div>
    `;
    document.getElementById("startup-retry")?.addEventListener("click", () => window.location.reload());
  }
});
