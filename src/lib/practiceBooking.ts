// Practice state has no booking ID/RPC contract and can never authorize real work.
export const PRACTICE_BOOKING = Object.freeze({ amount: 100, service: 'maid', work: 'dish_washing', flat: '001', otp: '1234', ttlSeconds: 60 });
export type PracticeStep = 'intro' | 'sending' | 'waiting' | 'alert' | 'accepted' | 'start_otp' | 'in_progress' | 'complete_otp' | 'completed' | 'rejected' | 'expired' | 'blocked';
export type CheckResult = 'passed' | 'failed' | 'not_verified';
export const PRACTICE_CHECKS = ['sent', 'received', 'overlay', 'accepted', 'startOtp', 'started', 'completeOtp', 'completed'] as const;
export type PracticeCheck = typeof PRACTICE_CHECKS[number];
export interface PracticeState { id: string; step: PracticeStep; expiresAt: number; checks: Record<PracticeCheck, CheckResult>; wrongOtp: boolean; }
export function newPractice(id: string, now: number): PracticeState {
  return { id, step: 'intro', expiresAt: now + PRACTICE_BOOKING.ttlSeconds * 1000, checks: Object.fromEntries(PRACTICE_CHECKS.map(k => [k, 'not_verified'])) as Record<PracticeCheck, CheckResult>, wrongOtp: false };
}
export function practiceSeconds(expiresAt: number, now: number): number { return Math.max(0, Math.ceil((expiresAt - now) / 1000)); }
export type PracticeAction = { type: 'reset'; id: string; now: number } | { type: 'local_alert' | 'sending'; now: number } | { type: 'sent' | 'failed_send' | 'blocked' } | { type: 'accept' | 'reject' | 'tick'; now: number } | { type: 'start_otp' | 'complete_otp' } | { type: 'verify'; code: string } | { type: 'device'; id: string; received: boolean; overlay: boolean; outcome?: string; now: number };
export function practiceTransition(s: PracticeState, a: PracticeAction): PracticeState {
  if (a.type === 'reset') return newPractice(a.id, a.now);
  if (a.type === 'blocked') return { ...s, step: 'blocked', wrongOtp: false };
  if (s.step === 'blocked') return s;
  const check = (key: PracticeCheck, value: CheckResult) => ({ ...s.checks, [key]: value });
  if (a.type === 'local_alert' && ['intro', 'expired', 'rejected'].includes(s.step)) return { ...s, step: 'alert', expiresAt: a.now + 60000 };
  if (a.type === 'sending' && s.step === 'intro') return { ...s, step: 'sending', expiresAt: a.now + 60000 };
  if (a.type === 'sent' && ['sending', 'waiting'].includes(s.step)) return { ...s, step: 'waiting', checks: check('sent', 'passed') };
  if (a.type === 'failed_send' && s.step === 'sending') return { ...s, step: 'intro', checks: check('sent', 'failed') };
  if (a.type === 'tick' && ['alert', 'waiting', 'sending'].includes(s.step) && practiceSeconds(s.expiresAt, a.now) === 0) return { ...s, step: 'expired' };
  if ((a.type === 'accept' || a.type === 'reject') && s.step === 'alert') {
    if (!practiceSeconds(s.expiresAt, a.now)) return { ...s, step: 'expired' };
    return { ...s, step: a.type === 'accept' ? 'accepted' : 'rejected', checks: check('accepted', a.type === 'accept' ? 'passed' : 'failed') };
  }
  if (a.type === 'start_otp' && s.step === 'accepted') return { ...s, step: 'start_otp', wrongOtp: false };
  if (a.type === 'complete_otp' && s.step === 'in_progress') return { ...s, step: 'complete_otp', wrongOtp: false };
  if (a.type === 'verify' && ['start_otp', 'complete_otp'].includes(s.step) && s.id.startsWith('practice-')) {
    const start = s.step === 'start_otp';
    const key = start ? 'startOtp' : 'completeOtp';
    if (a.code !== PRACTICE_BOOKING.otp) return { ...s, wrongOtp: true, checks: check(key, 'failed') };
    return { ...s, step: start ? 'in_progress' : 'completed', wrongOtp: false, checks: { ...s.checks, [key]: 'passed', [start ? 'started' : 'completed']: 'passed' } };
  }
  if (a.type === 'device' && a.id === s.id && ['sending', 'waiting'].includes(s.step)) {
    const checks = { ...s.checks, received: a.received ? 'passed' as const : s.checks.received, overlay: a.overlay ? 'passed' as const : s.checks.overlay };
    if (!practiceSeconds(s.expiresAt, a.now)) return { ...s, checks, step: 'expired' };
    if (a.outcome === 'blocked') return { ...s, checks, step: 'blocked' };
    if (a.outcome === 'accepted') return { ...s, checks: { ...checks, accepted: 'passed' }, step: 'accepted' };
    if (a.outcome === 'rejected') return { ...s, checks: { ...checks, accepted: 'failed' }, step: 'rejected' };
    if (a.outcome === 'expired') return { ...s, checks, step: 'expired' };
    return { ...s, checks };
  }
  return s;
}