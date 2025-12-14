import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";
import { initializeStorageCache } from "./lib/capacitorStorage";

// Initialize storage cache before rendering app
// This ensures session data is available synchronously for Supabase auth
initializeStorageCache().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
}).catch((error) => {
  console.error('Failed to initialize storage:', error);
  // Still render app even if storage init fails
  createRoot(document.getElementById("root")!).render(<App />);
});
