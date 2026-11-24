import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useIsMobile } from '../use-mobile';

describe('Phone-size detection without a React browser global', () => {
  it('updates at the existing breakpoint and removes its listener', () => {
    let change: (() => void) | undefined;
    const remove = vi.fn();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ addEventListener: (_event: string, listener: () => void) => { change = listener; }, removeEventListener: remove })));
    const initialWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 393 });
    const hook = renderHook(useIsMobile);
    expect(hook.result.current).toBe(true);
    act(() => { window.innerWidth = 768; change?.(); }); expect(hook.result.current).toBe(false);
    act(() => { window.innerWidth = 767; change?.(); }); expect(hook.result.current).toBe(true);
    hook.unmount(); expect(remove).toHaveBeenCalledWith('change', change);
    window.innerWidth = initialWidth; vi.unstubAllGlobals();
  });
});