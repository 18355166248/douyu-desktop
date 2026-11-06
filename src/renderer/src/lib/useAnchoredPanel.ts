import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { anchoredPanelPosition } from './anchoredPanelPosition';

/** Position a portalled panel within the viewport, independently of card clipping. */
export function useAnchoredPanel(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel || !trigger) return;
    const place = (): void => {
      // Measure the natural CSS-constrained size, not a previous viewport constraint.
      panel.style.maxHeight = '';
      const size = panel.getBoundingClientRect();
      const position = anchoredPanelPosition(trigger.getBoundingClientRect(), size, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      panel.style.left = `${position.left}px`;
      panel.style.top = `${position.top}px`;
      panel.style.maxHeight = `${Math.min(size.height, position.maxHeight)}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    observer.observe(trigger);
    const contentObserver = new MutationObserver(place);
    contentObserver.observe(panel, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, triggerRef, panelRef]);
}
