import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: { id: 'login' } as { id: string } | null, row: { id: 'r', status: 'pending', timeout_at: '' }, error: null as unknown, eq: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  from: (table: string) => {
    const q = { select: () => q, eq: (...args: unknown[]) => { state.eq(...args); return q; }, maybeSingle: async () => ({ data: table === 'workers' ? { id: 'own-worker' } : state.row, error: state.error }) };
    return q;
  },
} }));
import { recoverOfferDeadline } from '../authoritativeOffer';
beforeEach(() => { state.user = { id: 'login' }; state.row = { id: 'r', status: 'pending', timeout_at: new Date(Date.now() + 23_000).toISOString() }; state.error = null; state.eq.mockClear(); });
describe('own authoritative expiry recovery', () => {
  it('reads exact expiry from own row and restricts request identity', async () => {
    expect(await recoverOfferDeadline('b', 'r')).toBe(state.row.timeout_at);
    expect(state.eq).toHaveBeenCalledWith('user_id', 'login');
    expect(state.eq).toHaveBeenCalledWith('worker_id', 'own-worker');
    expect(state.eq).toHaveBeenCalledWith('id', 'r');
  });
  it.each(['rejected', 'cancelled', 'timed_out', 'lost', 'accepted'])('refuses closed %s row', async status => {
    state.row.status = status;
    expect(await recoverOfferDeadline('b', 'r')).toBeNull();
  });
  it('expiry at the boundary cannot recover a fresh offer', async () => {
    state.row.timeout_at = new Date(Date.now() - 1).toISOString();
    expect(await recoverOfferDeadline('b')).toBeNull();
  });
  it('missing expiry never becomes local 60 seconds', async () => {
    state.row.timeout_at = '';
    expect(await recoverOfferDeadline('b')).toBeNull();
  });
  it('signed-out recovery cannot use a supplied identity', async () => {
    state.user = null;
    expect(await recoverOfferDeadline('b', 'r')).toBeNull();
    expect(state.eq).not.toHaveBeenCalled();
  });
  it('failed server read stays unavailable', async () => {
    state.error = { message: 'network' };
    expect(await recoverOfferDeadline('b')).toBeNull();
  });
});