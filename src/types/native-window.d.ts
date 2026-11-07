// One typed boundary for the Capacitor bridge on `window`, replacing scattered `(window as any)` casts.
// Plugin methods stay loosely typed here on purpose: each native plugin defines its own shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativePluginMethod = (...args: any[]) => any;
type NativePlugin = { [method: string]: NativePluginMethod | undefined };

declare global {
  interface Window {
    Capacitor?: {
      Plugins?: { [name: string]: NativePlugin | undefined };
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      [key: string]: unknown;
    };
    webkitAudioContext?: typeof AudioContext;
  }
}

export {};
