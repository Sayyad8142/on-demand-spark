// OTA Live Update configuration
export const OTA_CONFIG = {
  APP_ID: 'worker',
  PLATFORM: 'android',
  CHANNEL: 'production', // Change to 'staging' for testing
  
  // Current bundle version - increment this each time you publish an OTA update
  // This is separate from the Play Store versionCode
  BUNDLE_VERSION: '1.0.0',
  
  // Storage keys for Capacitor Preferences
  PREF_BUNDLE_VERSION: 'ota_bundle_version',
  PREF_BUNDLE_PATH: 'ota_bundle_path',
  PREF_LAST_CHECK: 'ota_last_check',
  PREF_FAILED_VERSION: 'ota_failed_version',
} as const;
