/**
 * Test-only build switch for the Firebase validate-only pilot.
 * The Test Booking send path is allowed ONLY when this exact build key was
 * supplied at build time AND the signed-in login is the approved pilot.
 * Normal builds (web, Play, OTA) never set the key, so they stay OFF.
 * The server sender remains the real authority (switch + pilot + device).
 */
export const PRACTICE_TEST_BUILD_KEY = 'pilot-validate-2026-11-12';
export const PRACTICE_TEST_PILOT_USER_ID = '8e03deed-3742-4aa0-9496-f540f771f82a';

export function practiceTestBuildAllows(buildKey: unknown, userId: string | null | undefined): boolean {
  return buildKey === PRACTICE_TEST_BUILD_KEY && typeof userId === 'string' && userId === PRACTICE_TEST_PILOT_USER_ID;
}

export function practiceSendAllowed(userId: string | null | undefined, globalEnabled: boolean, buildKey: unknown = import.meta.env.VITE_PRACTICE_TEST_BUILD): boolean {
  return globalEnabled || practiceTestBuildAllows(buildKey, userId);
}
