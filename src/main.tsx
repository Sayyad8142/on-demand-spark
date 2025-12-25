import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import i18n from "./i18n/config";
import { initializeStorageCache } from "./lib/capacitorStorage";

// Helper to ensure i18n is initialized
const waitForI18n = (): Promise<void> => {
  if (i18n.isInitialized) return Promise.resolve();
  return new Promise((resolve) => {
    i18n.on('initialized', () => resolve());
  });
};

// Initialize storage cache and i18n before rendering app
// This ensures session data and translations are available
Promise.all([initializeStorageCache(), waitForI18n()])
  .then(() => {
    createRoot(document.getElementById("root")!).render(<App />);
  })
  .catch((error) => {
    console.error('Failed to initialize:', error);
    // Still render app even if init fails
    createRoot(document.getElementById("root")!).render(<App />);
  });
