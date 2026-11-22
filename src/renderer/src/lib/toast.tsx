import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';

type ToastTone = 'info' | 'success' | 'warning' | 'error';
type Notify = (message: string, tone?: ToastTone) => void;

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const MAX_TOASTS = 3;
const TOAST_STYLE: Record<ToastTone, { icon: IconName; duration: number }> = {
  info: { icon: 'info', duration: 4_000 },
  success: { icon: 'check', duration: 3_000 },
  warning: { icon: 'alert', duration: 5_000 },
  error: { icon: 'alert', duration: 6_000 },
};
const ToastContext = createContext<Notify | null>(null);

function ToastCard({ toast, onExpire }: { toast: Toast; onExpire: (id: number) => void }) {
  const { id, tone, message } = toast;
  const { duration, icon } = TOAST_STYLE[tone];
  useEffect(() => {
    const timeout = window.setTimeout(() => onExpire(id), duration);
    return () => window.clearTimeout(timeout);
  }, [id, duration, onExpire]);

  return (
    <div className={`toast-card is-${tone}`}>
      <Icon name={icon} size={17} />
      <span>{message}</span>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const nextId = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [announcement, setAnnouncement] = useState<Toast>();
  const notify: Notify = useCallback((message, tone = 'info') => {
    const text = message.trim();
    if (!text) return;
    const toast = { id: ++nextId.current, message: text, tone };
    setToasts((current) =>
      [toast, ...current.filter((item) => item.message !== text || item.tone !== tone)].slice(
        0,
        MAX_TOASTS,
      ),
    );
    setAnnouncement(toast);
  }, []);
  const expire = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      {createPortal(
        <>
          <div className="toast-viewport" aria-hidden="true">
            {toasts.map((toast) => (
              <ToastCard key={toast.id} toast={toast} onExpire={expire} />
            ))}
          </div>
          <div className="toast-announcer" role="status" aria-atomic="true">
            {announcement && announcement.tone !== 'error' ? (
              <span key={announcement.id}>{announcement.message}</span>
            ) : null}
          </div>
          <div className="toast-announcer" role="alert" aria-atomic="true">
            {announcement?.tone === 'error' ? (
              <span key={announcement.id}>{announcement.message}</span>
            ) : null}
          </div>
        </>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast requires ToastProvider');
  return notify;
}
