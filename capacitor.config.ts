import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.didisnow.worker',
  appName: 'Didi Now Worker',
  webDir: 'dist',
  // Firebase Phone Auth (reCAPTCHA) is more reliable on Android when the WebView
  // runs on http://localhost instead of https://localhost.
  server: {
    androidScheme: 'http',
    hostname: 'localhost'
  }
};

export default config;
