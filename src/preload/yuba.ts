/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { ipcRenderer } from 'electron';
import { isEditableTarget } from '@shared/editableTarget';
import { yubaShortcut } from '@shared/shortcuts';
import { YUBA_SHORTCUT_CHANNEL } from '@shared/yuba';

const isMac = /Mac/i.test(navigator.platform);

document.addEventListener(
  'keydown',
  (event) => {
    if (
      !event.isTrusted ||
      event.isComposing ||
      isEditableTarget(event.composedPath()[0] ?? event.target)
    ) {
      return;
    }
    const command = yubaShortcut(event, isMac);
    if (!command) return;
    event.preventDefault();
    if (!event.repeat) ipcRenderer.sendToHost(YUBA_SHORTCUT_CHANNEL, command);
  },
  true,
);
