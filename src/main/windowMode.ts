import type { BrowserWindow, Rectangle } from 'electron';
import type { WindowMode } from '@shared/contracts/viewing';
import { IPC } from '@shared/contracts/ipc';

const saved = new WeakMap<
  BrowserWindow,
  { bounds: Rectangle; minimum: number[]; maximized: boolean }
>();
export function getWindowMode(window: BrowserWindow): WindowMode {
  return { alwaysOnTop: window.isAlwaysOnTop(), compact: saved.has(window) };
}
export function setWindowMode(window: BrowserWindow, patch: Partial<WindowMode>): WindowMode {
  if (patch.compact === true && !saved.has(window)) {
    const previous = {
      bounds: window.getNormalBounds(),
      minimum: window.getMinimumSize(),
      maximized: window.isMaximized(),
    };
    saved.set(window, previous);
    if (previous.maximized) window.unmaximize();
    window.setMinimumSize(420, 280);
    window.setBounds({ ...previous.bounds, width: 680, height: 420 });
  } else if (patch.compact === false) {
    const previous = saved.get(window);
    if (previous) {
      saved.delete(window);
      window.setMinimumSize(previous.minimum[0]!, previous.minimum[1]!);
      window.setBounds(previous.bounds);
      if (previous.maximized) window.maximize();
    }
  }
  if (patch.alwaysOnTop !== undefined) window.setAlwaysOnTop(patch.alwaysOnTop);
  const mode = getWindowMode(window);
  window.webContents.send(IPC.windowModeChanged, mode);
  return mode;
}
