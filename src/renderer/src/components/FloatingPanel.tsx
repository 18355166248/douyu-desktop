import { useRef } from 'react';
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
 * Shared non-modal floating panel. Placement and sizing stay in the caller's
 * class, while dismissal, Escape handling and focus return live here.
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

  useDismissableLayer({
    open,
    onClose,
    layerRef: panelRef,
    triggerRef,
    restoreFocusRef: triggerRef,
  });

  if (!open) return null;

  return (
    <section
      ref={panelRef}
      id={panelId}
      className={`floating-panel${className ? ` ${className}` : ''}`}
      role="region"
      aria-label={label}
    >
      {children}
    </section>
  );
}
