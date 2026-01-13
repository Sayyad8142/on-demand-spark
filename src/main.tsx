import { createRoot } from "react-dom/client";
import "./index.css";
import { initializeStorageCache, isStorageInitialized, getStorageCacheDebug, storageReadyPromise } from "./lib/capacitorStorage";
import { Capacitor } from "@capacitor/core";

// CRITICAL: Initialize storage cache BEFORE importing anything that uses Supabase
// This ensures the session is loaded into memory before Supabase client is created
const bootstrap = async () => {
  console.log('🚀 Bootstrap starting...');
  
  // Step 1: Initialize storage cache first (loads session from Preferences into memory)
  // This now has retry logic and will properly signal when ready
  await initializeStorageCache();
  console.log('✅ Storage initialized:', getStorageCacheDebug());
  
  // Step 2: On native, ensure storageReady promise is resolved before continuing
  if (Capacitor.isNativePlatform()) {
    console.log('⏳ Waiting for storage ready promise...');
    await storageReadyPromise;
    console.log('✅ Storage ready promise resolved');
  }
  
  // Step 3: Now dynamically import i18n (may depend on storage)
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
  
  // Step 4: NOW import App (which imports Supabase client)
  // At this point, storage cache has the session loaded
  const { default: App } = await import("./App.tsx");
  
  console.log('✅ App imported, storage status:', isStorageInitialized(), getStorageCacheDebug());
  
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
