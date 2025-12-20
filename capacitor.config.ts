import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.didisnow.worker',
  appName: 'Didi Now Worker',
  webDir: 'dist',
  // Ensure the Capacitor WebView runs on https://localhost.
  // This provides a secure context and matches Firebase Auth authorized domains.
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
  },
};

export default config;
