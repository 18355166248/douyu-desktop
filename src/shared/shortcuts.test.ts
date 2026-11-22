import { describe, expect, it } from 'vitest';
import { workspaceShortcut, yubaShortcut } from './shortcuts';

describe('workspaceShortcut', () => {
  it.each([true, false])('uses the platform modifier (mac=%s)', (isMac) => {
    for (const [key, expected] of [
      ['r', 'refresh'],
      ['w', 'close-room'],
      ['n', 'new-window'],
      ['l', 'room-input'],
    ] as const) {
      expect(workspaceShortcut({ key, metaKey: isMac, ctrlKey: !isMac }, isMac)).toBe(expected);
      expect(workspaceShortcut({ key, metaKey: !isMac, ctrlKey: isMac }, isMac)).toBeNull();
    }
    expect(workspaceShortcut({ key: 'F5' }, isMac)).toBe('refresh');
  });
  it('does not swallow system quit, editing or modified shortcuts', () => {
    for (const key of ['q', 'c', 'v', 'a', 'z'])
      expect(workspaceShortcut({ key, metaKey: true }, true)).toBeNull();
    expect(workspaceShortcut({ key: 'w', metaKey: true, shiftKey: true }, true)).toBeNull();
    expect(workspaceShortcut({ key: 'r', ctrlKey: true, altKey: true }, false)).toBeNull();
    expect(workspaceShortcut({ key: 'w' }, true)).toBeNull();
    expect(workspaceShortcut({ key: 'r', ctrlKey: true, metaKey: true }, true)).toBeNull();
    expect(workspaceShortcut({ key: 'R', metaKey: true }, true)).toBe('refresh');
  });
});

describe('yubaShortcut', () => {
  it.each([true, false])(
    'closes and refreshes the guest with the platform keys (mac=%s)',
    (isMac) => {
      const primary = { metaKey: isMac, ctrlKey: !isMac };
      expect(yubaShortcut({ key: 'x' }, isMac)).toBe('close');
      expect(yubaShortcut({ key: 'w', ...primary }, isMac)).toBe('close');
      expect(yubaShortcut({ key: 'F5' }, isMac)).toBe('refresh');
      expect(yubaShortcut({ key: 'r', ...primary }, isMac)).toBe('refresh');
      expect(yubaShortcut({ key: 'x', ...primary }, isMac)).toBeNull();
      expect(yubaShortcut({ key: 'X', shiftKey: true }, isMac)).toBeNull();
      expect(yubaShortcut({ key: 'l', ...primary }, isMac)).toBeNull();
    },
  );
});
