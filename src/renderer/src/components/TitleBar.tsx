import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface TitleBarProps {
  children?: ReactNode;
}

export function TitleBar({ children }: TitleBarProps): React.JSX.Element {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.api.window.onMaximizedChange((value) => {
      if (active) setMaximized(value);
    });
    void window.api.window
      .isMaximized()
      .then((value) => {
        if (active) setMaximized(value);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function toggleMaximize(): void {
    void window.api.window
      .toggleMaximize()
      .then((value) => setMaximized(value))
      .catch(() => undefined);
  }

  function isInteractiveTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest(
        'button, input, select, textarea, a, [role="dialog"], [role="menu"], .platform-picker, .room-field, .account-area, .history-anchor, .titlebar-controls',
      ) !== null
    );
  }

  return (
    <header
      className="titlebar"
      onDoubleClick={(event) => {
        if (isInteractiveTarget(event.target)) return;
        toggleMaximize();
      }}
    >
      <div className="titlebar-brand">
        <span className="titlebar-mark">
          <Icon name="live" size={13} />
        </span>
        <div className="titlebar-brand-text">
          <strong>斗鱼多屏</strong>
          <span>MULTIVIEW</span>
        </div>
      </div>
      <div className="titlebar-app">{children}</div>
      <div className="titlebar-drag" aria-hidden="true" />
      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-button"
          onClick={() => window.api.window.minimize()}
          aria-label="最小化窗口"
          title="最小化"
        >
          <Icon name="minimize" size={12} />
        </button>
        <button
          type="button"
          className="titlebar-button"
          onClick={toggleMaximize}
          aria-label={maximized ? '还原窗口' : '最大化窗口'}
          title={maximized ? '还原' : '最大化'}
        >
          <Icon name={maximized ? 'restore' : 'maximize'} size={11} />
        </button>
        <button
          type="button"
          className="titlebar-button titlebar-close"
          onClick={() => window.api.window.close()}
          aria-label="关闭窗口"
          title="关闭"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </header>
  );
}
