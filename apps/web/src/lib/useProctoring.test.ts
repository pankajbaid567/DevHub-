// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProctoring } from './useProctoring';
import type { ProctoringConfigDto } from '@devhub/shared';

vi.mock('./socket', () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

const fullConfig: ProctoringConfigDto = {
  enabled: true,
  requireCamera: false,
  requireScreenShare: false,
  enforceFullscreen: true,
  blockCopyPaste: true,
};

describe('useProctoring', () => {
  let listeners: Record<string, EventListener[]>;

  beforeEach(() => {
    listeners = {};
    vi.spyOn(document, 'addEventListener').mockImplementation((type, fn) => {
      (listeners[type] ??= []).push(fn as EventListener);
    });
    vi.spyOn(document, 'removeEventListener').mockImplementation((type, fn) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    });
    vi.spyOn(window, 'addEventListener').mockImplementation((type, fn) => {
      (listeners[type] ??= []).push(fn as EventListener);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, fn) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays inactive when config is null', () => {
    const { result } = renderHook(() => useProctoring('s1', null, false, true));
    expect(result.current.active).toBe(false);
  });

  it('stays inactive for the interviewer', () => {
    const { result } = renderHook(() => useProctoring('s1', fullConfig, true, true));
    expect(result.current.active).toBe(false);
  });

  it('stays inactive when interview has not started', () => {
    const { result } = renderHook(() => useProctoring('s1', fullConfig, false, false));
    expect(result.current.active).toBe(false);
  });

  it('becomes active for a candidate in a started proctored interview', () => {
    const { result } = renderHook(() => useProctoring('s1', fullConfig, false, true));
    expect(result.current.active).toBe(true);
  });

  it('registers visibilitychange and blur listeners when active', () => {
    renderHook(() => useProctoring('s1', fullConfig, false, true));
    expect(listeners['visibilitychange']?.length).toBeGreaterThan(0);
    expect(listeners['blur']?.length).toBeGreaterThan(0);
  });

  it('registers copy/cut/paste listeners when blockCopyPaste is enabled', () => {
    renderHook(() => useProctoring('s1', fullConfig, false, true));
    expect(listeners['copy']?.length).toBeGreaterThan(0);
    expect(listeners['cut']?.length).toBeGreaterThan(0);
    expect(listeners['paste']?.length).toBeGreaterThan(0);
  });

  it('does not register copy listeners when blockCopyPaste is disabled', () => {
    const config = { ...fullConfig, blockCopyPaste: false };
    renderHook(() => useProctoring('s1', config, false, true));
    expect(listeners['copy']?.length ?? 0).toBe(0);
  });

  it('registers fullscreenchange when enforceFullscreen is enabled', () => {
    renderHook(() => useProctoring('s1', fullConfig, false, true));
    expect(listeners['fullscreenchange']?.length).toBeGreaterThan(0);
  });

  it('cleans up listeners on unmount', () => {
    const { unmount } = renderHook(() => useProctoring('s1', fullConfig, false, true));
    expect(listeners['visibilitychange']?.length).toBeGreaterThan(0);
    unmount();
    expect(listeners['visibilitychange']?.length ?? 0).toBe(0);
    expect(listeners['blur']?.length ?? 0).toBe(0);
    expect(listeners['copy']?.length ?? 0).toBe(0);
  });

  it('increments violations when a tab switch is detected', () => {
    const { result } = renderHook(() => useProctoring('s1', fullConfig, false, true));
    expect(result.current.violations).toBe(0);

    act(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      listeners['visibilitychange']?.forEach((fn) =>
        fn(new Event('visibilitychange')),
      );
    });

    expect(result.current.violations).toBe(1);
  });
});
