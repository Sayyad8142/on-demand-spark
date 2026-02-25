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
  
  // Step 2: Now dynamically import i18n (may depend on storage)
  const { default: i18n } = await import("./i18n/config");
  
  // Helper to ensure i18n is initialized
  const waitForI18n = (): Promise<void> => {
    if (i18n.isInitialized) return Promise.resolve();
    return new Promise((resolve) => {
      i18n.on('initialized', () => resolve());
    });
  };
  
  await waitForI18n();
  console.log('✅ i18n initialized');
  
  // Step 3: NOW import App (which imports Supabase client)
  // At this point, storage cache has the session loaded
  const { default: App } = await import("./App.tsx");
  
  console.log('✅ App imported, storage status:', isStorageInitialized());

  // Log resolved URL using the single source of truth
  const { getSupabaseUrl, debugConnectionCheck } = await import("./config/env");
  console.log('🔗 RESOLVED_SUPABASE_URL:', getSupabaseUrl());
  debugConnectionCheck();

  createRoot(document.getElementById("root")!).render(<App />);
};

bootstrap().catch((error) => {
  console.error('❌ Bootstrap failed:', error);
  // Show error UI
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; text-align: center;">
        <div>
          <h1 style="color: #e11d48; margin-bottom: 16px;">App Failed to Start</h1>
          <p style="color: #6b7280; margin-bottom: 16px;">Please try closing and reopening the app.</p>
          <pre style="background: #f3f4f6; padding: 12px; border-radius: 8px; font-size: 12px; overflow: auto; text-align: left;">${error?.message || error}</pre>
        </div>
      </div>
    `;
  }
});
