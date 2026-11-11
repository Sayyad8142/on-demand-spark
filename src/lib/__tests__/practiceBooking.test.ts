import { describe, expect, it, vi } from 'vitest';
import { newPractice, PRACTICE_BOOKING, practiceSeconds, practiceTransition } from '../practiceBooking';
import { sendPracticePush } from '../practiceNotification';
import { supabase } from '@/integrations/supabase/client';

describe('isolated practice rules', () => {
  const alert = () => practiceTransition(newPractice('practice-1', 0), { type: 'local_alert', now: 0 });
  const accepted = () => practiceTransition(alert(), { type: 'accept', now: 1000 });
  it('uses only the requested practice amount', () => { expect(PRACTICE_BOOKING.amount).toBe(100); });
  it('uses only flat 001', () => { expect(PRACTICE_BOOKING.flat).toBe('001'); });
  it('uses Maid and Dishwashing', () => { expect([PRACTICE_BOOKING.service, PRACTICE_BOOKING.work]).toEqual(['maid', 'dish_washing']); });
  it('requires 1234 for start and advances to In Progress', () => {
    const otp = practiceTransition(accepted(), { type: 'start_otp' });
    expect(practiceTransition(otp, { type: 'verify', code: '9999' }).step).toBe('start_otp');
    expect(practiceTransition(otp, { type: 'verify', code: '1234' }).step).toBe('in_progress');
  });
  it('requires 1234 again to complete', () => {
    let s = practiceTransition(accepted(), { type: 'start_otp' });
    s = practiceTransition(s, { type: 'verify', code: '1234' });
    s = practiceTransition(s, { type: 'complete_otp' });
    expect(practiceTransition(s, { type: 'verify', code: '1111' }).step).toBe('complete_otp');
    expect(practiceTransition(s, { type: 'verify', code: '1234' }).checks.completed).toBe('passed');
  });
  it('refuses completion before start', () => { expect(practiceTransition(accepted(), { type: 'complete_otp' }).step).toBe('accepted'); });
  it('refuses practice OTP for a real booking identifier', () => {
    const s = { ...accepted(), id: 'real-booking', step: 'start_otp' as const };
    expect(practiceTransition(s, { type: 'verify', code: '1234' }).step).toBe('start_otp');
  });
  it('expires at zero without restarting, including after background time', () => {
    expect(practiceSeconds(60100, 0)).toBe(60);
    expect(practiceSeconds(60000, 65000)).toBe(0);
    expect(practiceTransition(alert(), { type: 'tick', now: 65000 }).step).toBe('expired');
    expect(practiceTransition(alert(), { type: 'accept', now: 60000 }).step).toBe('expired');
  });
  it('reject ends the session', () => { expect(practiceTransition(alert(), { type: 'reject', now: 1000 }).step).toBe('rejected'); });
  it('real work blocks practice OTP and acceptance', () => {
    const blocked = practiceTransition(accepted(), { type: 'blocked' });
    expect(practiceTransition(blocked, { type: 'start_otp' }).step).toBe('blocked');
    expect(practiceTransition(blocked, { type: 'verify', code: '1234' }).step).toBe('blocked');
  });
  it('server send never proves receipt or overlay', () => {
    const s = practiceTransition(practiceTransition(newPractice('practice-1', 0), { type: 'sending', now: 0 }), { type: 'sent' });
    expect(s.checks).toMatchObject({ sent: 'passed', received: 'not_verified', overlay: 'not_verified' });
  });
  it('local screen does not claim native delivery', () => { expect(alert().checks).toMatchObject({ sent: 'not_verified', received: 'not_verified', overlay: 'not_verified' }); });
  it('ignores other-device-session evidence', () => {
    const s = practiceTransition(newPractice('practice-1', 0), { type: 'sending', now: 0 });
    expect(practiceTransition(s, { type: 'device', id: 'practice-2', received: true, overlay: true, outcome: 'accepted', now: 10 })).toEqual(s);
  });
  it('matches actual device receipt separately from sent', () => {
    const s = practiceTransition(newPractice('practice-1', 0), { type: 'sending', now: 0 });
    const result = practiceTransition(s, { type: 'device', id: 'practice-1', received: true, overlay: false, now: 10 });
    expect(result.checks).toMatchObject({ sent: 'not_verified', received: 'passed', overlay: 'not_verified' });
  });
  it('late send response cannot overwrite native acceptance', () => {
    const s = practiceTransition(newPractice('practice-1', 0), { type: 'sending', now: 0 });
    const accepted = practiceTransition(s, { type: 'device', id: 'practice-1', received: true, overlay: true, outcome: 'accepted', now: 10 });
    expect(practiceTransition(accepted, { type: 'sent' }).step).toBe('accepted');
    expect(practiceTransition(accepted, { type: 'sent' }).checks.sent).toBe('passed');
  });
  it('repeated sending action does not start a second session', () => {
    const s = practiceTransition(newPractice('practice-1', 0), { type: 'sending', now: 0 });
    expect(practiceTransition(s, { type: 'sending', now: 1000 })).toEqual(s);
  });
  it('retry resets every check and identifier', () => {
    const s = practiceTransition(accepted(), { type: 'reset', id: 'practice-2', now: 10000 });
    expect(s.id).toBe('practice-2'); expect(s.step).toBe('intro'); expect(s.checks.accepted).toBe('not_verified');
  });
  it('no notification service calls while deployment is unapproved', async () => {
    const invoke = vi.spyOn(supabase.functions, 'invoke');
    expect(await sendPracticePush({ userId: "user-1", id: 'practice-1', expiresAt: 60000, hasToken: true, tokenStatus: 'active' })).toEqual({ sent: false, reason: 'approval' });
    expect(invoke).not.toHaveBeenCalled(); invoke.mockRestore();
  });
});