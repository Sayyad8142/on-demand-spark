import { Capacitor, registerPlugin } from '@capacitor/core';

// Idempotent plugin getter (avoids "already registered" errors during dev/HMR)
const safeRegisterPlugin = <T = any>(name: string): T => {
  try {
    return registerPlugin<T>(name);
  } catch {
    return (((Capacitor as any)?.Plugins || {})[name] || {}) as T;
  }
};

export const AuthBridge = safeRegisterPlugin<any>('AuthBridge');
export const SmsRetriever = safeRegisterPlugin<any>('SmsRetrieverPlugin');
export const FirebasePhoneAuth = safeRegisterPlugin<any>('FirebasePhoneAuth');

export const isCapPluginAvailable = (name: string) =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(name);
