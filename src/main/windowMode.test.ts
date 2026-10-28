import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { getWindowMode, setWindowMode } from './windowMode';

function makeWindow(maximized = false) {
  let top = false;
  const window = {
    getNormalBounds: () => ({ x: 50, y: 100, width: 1440, height: 900 }),
    getMinimumSize: () => [1100, 700],
    isMaximized: () => maximized,
    isAlwaysOnTop: () => top,
    setAlwaysOnTop: vi.fn((value: boolean) => {
      top = value;
    }),
    setMinimumSize: vi.fn(),
    setBounds: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    webContents: { send: vi.fn() },
  };
  return { mock: window, window: window as unknown as BrowserWindow };
}
describe('compact window mode', () => {
  it('restores original bounds and minimum size while keeping pinning independent', () => {
    const { mock, window } = makeWindow();
    expect(setWindowMode(window, { compact: true, alwaysOnTop: true })).toEqual({
      compact: true,
      alwaysOnTop: true,
    });
    expect(mock.setBounds).toHaveBeenLastCalledWith({ x: 50, y: 100, width: 680, height: 420 });
    setWindowMode(window, { compact: true }); // must not overwrite the normal bounds
    expect(mock.setMinimumSize).toHaveBeenCalledTimes(1);
    setWindowMode(window, { compact: false });
    expect(mock.setBounds).toHaveBeenLastCalledWith({ x: 50, y: 100, width: 1440, height: 900 });
    expect(mock.setMinimumSize).toHaveBeenLastCalledWith(1100, 700);
    expect(getWindowMode(window)).toEqual({ compact: false, alwaysOnTop: true });
  });
  it('restores maximization and isolates windows', () => {
    const first = makeWindow(true);
    const second = makeWindow();
    setWindowMode(first.window, { compact: true });
    expect(first.mock.unmaximize).toHaveBeenCalledOnce();
    expect(getWindowMode(second.window).compact).toBe(false);
    setWindowMode(first.window, { compact: false });
    expect(first.mock.maximize).toHaveBeenCalledOnce();
  });
});
