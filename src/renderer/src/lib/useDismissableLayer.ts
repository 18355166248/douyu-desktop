import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export interface UseDismissableLayerOptions {
  open: boolean;
  onClose: () => void;
  layerRef?: RefObject<HTMLElement | null>;
  triggerRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  closeOnPointerDown?: boolean;
  closeOnEscape?: boolean;
}

/**
 * Closes a floating layer when the user presses Escape or pointer-downs
 * outside both the layer and its trigger. The hook is intentionally DOM
 * focused so the same behavior can back menus, panels and popovers.
 */
export function useDismissableLayer({
  open,
  onClose,
  layerRef,
  triggerRef,
  restoreFocusRef,
  closeOnPointerDown = true,
  closeOnEscape = true,
}: UseDismissableLayerOptions): void {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) {
        onCloseRef.current();
        return;
      }
      if (layerRef?.current?.contains(event.target)) return;
      if (triggerRef?.current?.contains(event.target)) return;
      onCloseRef.current();
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const active = document.activeElement;
      const shouldRestoreFocus =
        active instanceof Node &&
        ((layerRef?.current?.contains(active) ?? false) ||
          (triggerRef?.current?.contains(active) ?? false));
      onCloseRef.current();
      if (shouldRestoreFocus) restoreFocusRef?.current?.focus();
    };

    if (closeOnPointerDown) {
      document.addEventListener('pointerdown', handlePointerDown, true);
    }
    if (closeOnEscape) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      if (closeOnPointerDown) {
        document.removeEventListener('pointerdown', handlePointerDown, true);
      }
      if (closeOnEscape) {
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [open, layerRef, triggerRef, restoreFocusRef, closeOnPointerDown, closeOnEscape]);
}
