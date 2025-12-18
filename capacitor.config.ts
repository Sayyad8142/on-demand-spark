import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.didisnow.worker',
  appName: 'Didi Now Worker',
  webDir: 'dist',
  // Firebase Phone Auth (reCAPTCHA) is more reliable on Android when the WebView
  // runs on http://localhost instead of https://localhost.
  server: {
    // Keep HTTPS scheme for a secure context required by Firebase reCAPTCHA.
    androidScheme: 'https',
    hostname: 'localhost'
  }
};

export default config;
