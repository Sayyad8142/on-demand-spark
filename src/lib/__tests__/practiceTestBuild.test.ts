import { describe, expect, it } from 'vitest';
import { PRACTICE_TEST_BUILD_KEY, PRACTICE_TEST_PILOT_USER_ID, practiceSendAllowed, practiceTestBuildAllows } from '../practiceTestBuild';
import { PRACTICE_PUSH_ENABLED } from '../practiceNotification';

describe('practice test-only build switch', () => {
  it('normal builds (no key) stay off for everyone, including the pilot', () => {
    expect(PRACTICE_PUSH_ENABLED).toBe(false);
    expect(practiceSendAllowed(PRACTICE_TEST_PILOT_USER_ID, false, undefined)).toBe(false);
    expect(practiceSendAllowed(PRACTICE_TEST_PILOT_USER_ID, false, '')).toBe(false);
  });
  it('test build allows only the approved pilot login', () => {
    expect(practiceTestBuildAllows(PRACTICE_TEST_BUILD_KEY, PRACTICE_TEST_PILOT_USER_ID)).toBe(true);
    expect(practiceTestBuildAllows(PRACTICE_TEST_BUILD_KEY, '00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(practiceTestBuildAllows(PRACTICE_TEST_BUILD_KEY, null)).toBe(false);
  });
  it('a wrong or guessed build key never enables sending', () => {
    expect(practiceTestBuildAllows('on', PRACTICE_TEST_PILOT_USER_ID)).toBe(false);
    expect(practiceTestBuildAllows('true', PRACTICE_TEST_PILOT_USER_ID)).toBe(false);
  });
});
