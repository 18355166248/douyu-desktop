import { workspaceShortcut } from '@shared/shortcuts';

export const isMac = /Mac/i.test(navigator.platform);
export const primaryKey = isMac ? 'Cmd' : 'Ctrl';
export const primaryAria = isMac ? 'Meta' : 'Control';
export const getWorkspaceShortcut = (event: KeyboardEvent) => workspaceShortcut(event, isMac);

const EDITABLE_INPUT_TYPES = new Set([
  'email',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'url',
]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const editable = target.closest('input, textarea, select, [contenteditable="true"]');
  if (!editable) return false;
  if (editable instanceof HTMLInputElement) {
    return EDITABLE_INPUT_TYPES.has(editable.type);
  }
  return true;
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.closest(
      'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="tab"], [contenteditable="true"]',
    ) !== null
  );
}
