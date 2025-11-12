/**
 * Demo Login Configuration for Play Store Reviewers
 * 
 * This demo account uses Firebase Auth test phone numbers which don't send actual SMS.
 * The test phone must be configured in Firebase Console:
 * Authentication > Settings > Phone numbers for testing
 * 
 * Add: +91 9999999999 with code: 123456
 */

export const DEMO_PHONE = '9999999999';
export const DEMO_PHONE_FULL = '+919999999999';
export const DEMO_OTP = '123456';

export const DEMO_WORKER = {
  full_name: 'Demo Partner',
  phone: DEMO_PHONE_FULL,
  service_types: ['maid'],
  communities: ['Prestige High Fields'],
  is_active: true,
  is_available: false,
  is_busy: false,
};

export function isDemoUser(phone: string): boolean {
  const normalized = phone.replace(/\D/g, '');
  return normalized === DEMO_PHONE || normalized === DEMO_PHONE_FULL.replace(/\D/g, '');
}
