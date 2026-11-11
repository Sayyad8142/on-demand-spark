import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const safety = vi.hoisted(() => ({ safe: true, checking: false, worker: null, refresh: vi.fn(async () => true) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'worker-test' } }) }));
vi.mock('@/hooks/usePracticeSafety', () => ({ usePracticeSafety: () => safety }));
vi.mock('@/i18n/practice', () => ({ practiceText: (key: string) => key }));
import TestBooking from '@/pages/TestBooking';
describe('practice screen flow', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    safety.safe = true; safety.checking = false; safety.refresh.mockResolvedValue(true);
  });
  it('accept, wrong/correct start OTP, wrong/correct completion OTP, repeat', async () => {
    render(<MemoryRouter><TestBooking /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'local' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'accept' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'accept' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'start' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'start' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'otp' })).toBeInTheDocument());
    fireEvent.change(screen.getByRole('textbox', { name: 'otp' }), { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'verify' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('wrongOtp'));
    fireEvent.change(screen.getByRole('textbox', { name: 'otp' }), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'verify' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'complete' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'complete' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'otp' })).toBeInTheDocument());
    fireEvent.change(screen.getByRole('textbox', { name: 'otp' }), { target: { value: '1111' } });
    fireEvent.click(screen.getByRole('button', { name: 'verify' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('wrongOtp'));
    fireEvent.change(screen.getByRole('textbox', { name: 'otp' }), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'verify' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'success' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'again' }));
    expect(screen.getByRole('button', { name: 'local' })).toBeInTheDocument();
  });
  it('refuses practice when current work cannot be checked', async () => {
    safety.refresh.mockResolvedValue(false);
    render(<MemoryRouter><TestBooking /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'local' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'blocked' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument();
  });
});