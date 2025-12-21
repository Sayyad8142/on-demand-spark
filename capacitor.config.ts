import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.didisnow.worker',
  appName: 'Didi Now Worker',
  webDir: 'dist',
  // Ensure the Capacitor WebView runs on https://localhost (secure context for Firebase Phone Auth).
  // Note: We intentionally do NOT set `server.url` here; that option is for pointing
  // the WebView to an external dev server and can break real-device (release) builds.
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: true,
  },
};

export default config;
