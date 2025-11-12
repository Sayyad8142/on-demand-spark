/**
 * Demo Login Configuration for Play Store Reviewers
 * 
 * Uses Firebase Auth test phone numbers (no SMS sent)
 * Configure in Firebase Console: Authentication → Sign-in method → Phone → Add test number
 */

export const DEMO_PHONE = '+919999999999';
export const DEMO_OTP = '123456';
export const DEMO_PHONE_DISPLAY = '9999999999';

/**
 * Demo worker profile configuration
 * This profile will be upserted on first demo login
 */
export const DEMO_WORKER_PROFILE = {
  full_name: 'Demo Partner',
  phone: DEMO_PHONE,
  service_types: ['maid'],
  communities: ['Prestige High Fields'],
  is_active: true,
  is_available: false,
  is_busy: false,
  upi_id: 'demo@upi'
};

/**
 * Check if a phone number is the demo phone
 */
export function isDemoPhone(phone: string): boolean {
  const normalized = phone.replace(/\D/g, '');
  return normalized === '919999999999' || normalized === '9999999999';
}

/**
 * Check if user is demo user
 */
export function isDemoUser(user: any): boolean {
  if (!user?.phone) return false;
  return isDemoPhone(user.phone);
}
