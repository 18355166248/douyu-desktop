import { workspaceShortcut } from '@shared/shortcuts';
export { isEditableTarget } from '@shared/editableTarget';

export const isMac = /Mac/i.test(navigator.platform);
export const primaryKey = isMac ? 'Cmd' : 'Ctrl';
export const primaryAria = isMac ? 'Meta' : 'Control';
export const getWorkspaceShortcut = (event: KeyboardEvent) => workspaceShortcut(event, isMac);

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.closest(
      'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="tab"], [contenteditable="true"]',
    ) !== null
  );
}
