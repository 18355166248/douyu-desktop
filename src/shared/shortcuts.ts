export interface ShortcutInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

// 主进程菜单拦截和页面路由共用规则，防止 Cmd+W 先关闭窗口、Cmd+R 重载整个应用。
export function workspaceShortcut(input: ShortcutInput, isMac: boolean) {
  if (input.altKey || input.shiftKey) return null;
  const primary = isMac ? input.metaKey && !input.ctrlKey : input.ctrlKey && !input.metaKey;
  if (!input.ctrlKey && !input.metaKey && input.key === 'F5') return 'refresh';
  if (!primary) return null;
  switch (input.key.toLowerCase()) {
    case 'r':
      return 'refresh';
    case 'w':
      return 'close-room';
    case 'n':
      return 'new-window';
    case 'l':
      return 'room-input';
    default:
      return null;
  }
}

export type YubaShortcut = 'close' | 'refresh';

export function yubaShortcut(input: ShortcutInput, isMac: boolean): YubaShortcut | null {
  const command = workspaceShortcut(input, isMac);
  if (command === 'refresh') return 'refresh';
  if (command === 'close-room') return 'close';
  if (
    input.key.toLowerCase() === 'x' &&
    !input.altKey &&
    !input.shiftKey &&
    !input.ctrlKey &&
    !input.metaKey
  ) {
    return 'close';
  }
  return null;
}
