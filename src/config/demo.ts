/**
 * Demo Mode Configuration
 * For Play Store reviewers and testing
 */

export const DEMO_CONFIG = {
  PHONE: '+919999999999',
  PHONE_DISPLAY: '+91 9999999999',
  OTP: '123456',
  WORKER_PROFILE: {
    full_name: 'Demo Partner',
    phone: '+919999999999',
    service_types: ['maid'],
    communities: ['Prestige High Fields'],
    is_active: true,
    is_available: true, // Start available
    is_busy: false
  }
};

export const isDemoUser = (phone?: string | null): boolean => {
  return phone === DEMO_CONFIG.PHONE;
};

export const DEMO_STORAGE_KEY = 'is_demo_user';
