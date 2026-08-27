import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'app.didisnow.worker',
  appName: 'Didi Now Partner',
  webDir: 'dist',
  android: {
    // Android 16 (API 36) enforces edge-to-edge. Capacitor applies system-bar
    // margins to the WebView so screens are never hidden under the status /
    // navigation bars. 'auto' only kicks in on Android 15+ devices.
    adjustMarginsForEdgeToEdge: 'auto',
  },
};

export default config;
