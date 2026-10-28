import { useEffect, useRef } from 'react';

/** Keep keyboard focus inside a modal and return it to its trigger when possible. */
export function useDialogFocus() {
  const ref = useRef<HTMLElement>(null);
  const previous = useRef(document.activeElement);
  useEffect(() => {
    const controls = (): HTMLElement[] =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    if (!ref.current?.contains(document.activeElement)) controls()[0]?.focus();
    const trap = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0];
      const last = items[items.length - 1];
      if (!ref.current?.contains(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    const trigger = previous.current;
    return () => {
      document.removeEventListener('keydown', trap);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return ref;
}
