/**
 * Demo Login Configuration for Play Store Reviewers
 * 
 * CRITICAL REQUIREMENT:
 * Phone confirmations MUST be disabled in Supabase Dashboard
 * (Auth → Providers → Phone → Disable "Enable phone confirmations")
 * 
 * This allows the demo OTP to work without real SMS verification.
 */

export const DEMO_PHONE = '+919999999999';
export const DEMO_OTP = '123456';

/**
 * Check if a phone number is the demo phone
 */
export function isDemoUser(phone: string): boolean {
  const normalized = phone.replace(/\D/g, '');
  return normalized === '919999999999' || normalized === '9999999999';
}

/**
 * Demo worker data for database
 */
export const DEMO_WORKER_DATA = {
  full_name: 'Demo Partner',
  phone: DEMO_PHONE,
  service_types: ['maid'],
  communities: ['Prestige High Fields'],
  is_active: true,
  is_available: false,
  is_busy: false,
};
