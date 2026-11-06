import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPanel } from '../lib/useAnchoredPanel';
import type { ReactNode, RefObject } from 'react';
import { useDismissableLayer } from '../lib/useDismissableLayer';

export interface FloatingPanelProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  panelId?: string;
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * Non-modal panel that escapes clipped cards and stays inside the viewport.
 */
export function FloatingPanel({
  open,
  onClose,
  triggerRef,
  panelId,
  label,
  className,
  children,
}: FloatingPanelProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLElement>(null);
  useAnchoredPanel(open, triggerRef, panelRef);

  useDismissableLayer({
    open,
    onClose,
    layerRef: panelRef,
    triggerRef,
    restoreFocusRef: triggerRef,
  });

  if (!open) return null;

  return createPortal(
    <section
      ref={panelRef}
      id={panelId}
      className={`floating-panel${className ? ` ${className}` : ''}`}
      role="region"
      aria-label={label}
    >
      {children}
    </section>,
    document.body,
  );
}
