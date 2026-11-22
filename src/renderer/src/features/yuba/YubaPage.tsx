import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import type { AccountSummary } from '@shared/contracts/account';
import { yubaShortcut, type YubaShortcut } from '@shared/shortcuts';
import { YUBA_JOINED_URL, YUBA_SHORTCUT_CHANNEL } from '@shared/yuba';
import { Icon } from '../../components/Icon';
import { errorMessage, unwrap } from '../../lib/api';
import { isEditableTarget, isMac, primaryAria, primaryKey } from '../../lib/keyboard';
import { readStored, writeStored } from '../player/viewingStorage';

const YUBA_ZOOM_KEY = 'douyu-desktop.yuba-zoom.v1';
const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 80;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;

function loadYubaZoom(): number {
  const zoom = readStored(YUBA_ZOOM_KEY);
  return typeof zoom === 'number' && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM && zoom % ZOOM_STEP === 0
    ? zoom
    : DEFAULT_ZOOM;
}

interface YubaPageProps {
  account: AccountSummary | undefined;
  visible: boolean;
  keyboardActive: boolean;
  split: boolean;
  onToggleSplit: () => void;
  onClose: () => void;
  accountsLoading: boolean;
  accountError: boolean;
  loginPending: boolean;
  onLogin: () => void;
  onRetryAccounts: () => void;
}

export function YubaPage({
  account,
  visible,
  keyboardActive,
  split,
  onToggleSplit,
  onClose,
  accountsLoading,
  accountError,
  loginPending,
  onLogin,
  onRetryAccounts,
}: YubaPageProps): React.JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null);
  const browserRef = useRef<YubaBrowserHandle>(null);

  const performShortcut = useEffectEvent((command: YubaShortcut) => {
    if (!visible || document.querySelector('[role="dialog"]')) return;
    if (command === 'close') onClose();
    else if (browserRef.current) browserRef.current.refresh();
    else if (!accountsLoading) onRetryAccounts();
  });

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const handleGuestMessage = (event: Event): void => {
      const { channel, args } = event as Event & { channel: string; args: unknown[] };
      if (channel !== YUBA_SHORTCUT_CHANNEL) return;
      const command = args[0];
      if (command === 'close' || command === 'refresh') performShortcut(command);
    };
    pane.addEventListener('ipc-message', handleGuestMessage, true);
    return () => pane.removeEventListener('ipc-message', handleGuestMessage, true);
  }, []);

  useEffect(() => {
    if (!keyboardActive) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || isEditableTarget(event.target)) return;
      const command = yubaShortcut(event, isMac);
      if (!command) return;
      event.preventDefault();
      if (!event.repeat) performShortcut(command);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [keyboardActive]);

  const toolbarActions = (
    <>
      <button
        type="button"
        className={`btn ghost yuba-split-toggle${split ? ' is-active' : ''}`}
        aria-pressed={split}
        aria-label="与直播分屏"
        onClick={onToggleSplit}
      >
        <Icon name="splitView" size={15} />
        {split ? '退出分屏' : '与直播分屏'}
      </button>
      <button
        type="button"
        className="btn ghost"
        aria-label="关闭鱼吧"
        aria-keyshortcuts={`X ${primaryAria}+W`}
        title={`关闭鱼吧（X / ${primaryKey}+W）`}
        onClick={onClose}
      >
        <Icon name="close" size={15} />
      </button>
    </>
  );

  return (
    <div className="yuba-browser" ref={paneRef}>
      {account?.status === 'active' ? (
        <YubaBrowser
          key={account.id}
          ref={browserRef}
          accountId={account.id}
          visible={visible}
          toolbarActions={toolbarActions}
        />
      ) : (
        <>
          <div className="yuba-toolbar">{toolbarActions}</div>
          <div className="yuba-status">
            {accountsLoading ? (
              <span role="status">正在读取斗鱼账号…</span>
            ) : accountError ? (
              <>
                <span role="alert">斗鱼账号加载失败</span>
                <button type="button" className="btn ghost" onClick={onRetryAccounts}>
                  重试
                </button>
              </>
            ) : (
              <>
                <Icon name="yuba" size={24} />
                <strong>{account ? '斗鱼登录已过期' : '登录斗鱼后查看已加入的鱼吧'}</strong>
                <button
                  type="button"
                  className="btn primary"
                  onClick={onLogin}
                  disabled={loginPending}
                >
                  {loginPending ? '正在登录…' : account ? '重新登录' : '登录斗鱼'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface YubaWebview extends HTMLElement {
  canGoBack(): boolean;
  goBack(): void;
  loadURL(url: string): Promise<void>;
  reload(): void;
  setAudioMuted(muted: boolean): void;
  setZoomFactor(factor: number): void;
}

interface YubaBrowserHandle {
  refresh(): void;
}

function YubaBrowser({
  ref,
  accountId,
  visible,
  toolbarActions,
}: {
  ref: Ref<YubaBrowserHandle>;
  accountId: string;
  visible: boolean;
  toolbarActions: React.JSX.Element;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const guestRef = useRef<YubaWebview | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(loadYubaZoom);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    let pageReady = false;
    const guest = document.createElement('webview') as YubaWebview;
    const startupTimer = window.setTimeout(() => {
      setError('鱼吧网页加载超时，请重试');
      setLoading(false);
    }, 30_000);
    guest.className = 'yuba-guest';
    guest.setAttribute('aria-label', '斗鱼鱼吧网页');
    guest.addEventListener('did-start-loading', () => {
      setLoading(true);
      setError(null);
    });
    guest.addEventListener('did-stop-loading', () => setLoading(false));
    guest.addEventListener('dom-ready', () => {
      window.clearTimeout(startupTimer);
      pageReady = true;
      guest.setZoomFactor(zoomRef.current / 100);
      setReady(true);
      setCanGoBack(guest.canGoBack());
    });
    guest.addEventListener('did-navigate-in-page', () => {
      if (pageReady) setCanGoBack(guest.canGoBack());
    });
    guest.addEventListener('did-fail-load', (event) => {
      const { isMainFrame, errorCode } = event as Event & {
        isMainFrame: boolean;
        errorCode: number;
      };
      if (!isMainFrame || errorCode === -3) return;
      window.clearTimeout(startupTimer);
      setError('鱼吧网页加载失败，请重试');
    });
    guest.addEventListener('render-process-gone', () => {
      window.clearTimeout(startupTimer);
      pageReady = false;
      setError('鱼吧网页已关闭，请重试');
      setReady(false);
      setLoading(false);
    });

    void window.api.yuba
      .prepare(accountId)
      .then(unwrap)
      .then((token) => {
        if (!active) return;
        guest.setAttribute('partition', token);
        guest.setAttribute('allowpopups', '');
        guest.setAttribute('src', YUBA_JOINED_URL);
        guestRef.current = guest;
        host.appendChild(guest);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        window.clearTimeout(startupTimer);
        setError(errorMessage(reason));
        setLoading(false);
      });

    return () => {
      active = false;
      window.clearTimeout(startupTimer);
      guestRef.current = null;
      guest.remove();
    };
  }, [accountId, attempt]);

  useEffect(() => {
    if (ready) guestRef.current?.setAudioMuted(!visible);
  }, [ready, visible]);

  useEffect(() => {
    if (ready) guestRef.current?.setZoomFactor(zoom / 100);
  }, [ready, zoom]);

  useEffect(() => {
    const syncZoom = (event: StorageEvent): void => {
      if (event.key === YUBA_ZOOM_KEY || event.key === null) setZoom(loadYubaZoom());
    };
    window.addEventListener('storage', syncZoom);
    return () => window.removeEventListener('storage', syncZoom);
  }, []);

  function changeZoom(value: number): void {
    setZoom(value);
    writeStored(YUBA_ZOOM_KEY, value);
  }

  function retry(): void {
    setLoading(true);
    setReady(false);
    setCanGoBack(false);
    setError(null);
    setAttempt((value) => value + 1);
  }

  function refresh(): void {
    if (loading) return;
    if (error) retry();
    else if (ready) guestRef.current?.reload();
  }

  useImperativeHandle(ref, () => ({ refresh }));

  function openJoinedGroups(): void {
    void guestRef.current?.loadURL(YUBA_JOINED_URL).catch(() => undefined);
  }

  return (
    <>
      <div className="yuba-toolbar">
        <button
          type="button"
          className="btn ghost"
          onClick={() => guestRef.current?.goBack()}
          disabled={!ready || !canGoBack || loading}
          title="返回上一页"
          aria-label="返回上一页"
        >
          <Icon name="back" size={15} />
        </button>
        <button type="button" className="btn ghost" disabled={!ready} onClick={openJoinedGroups}>
          已加入的鱼吧
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={loading || (!ready && !error)}
          onClick={refresh}
          title={`刷新鱼吧（F5 / ${primaryKey}+R）`}
          aria-label="刷新鱼吧"
          aria-keyshortcuts={`F5 ${primaryAria}+R`}
        >
          <Icon name="refresh" size={15} />
        </button>
        <div className="yuba-zoom" role="group" aria-label="鱼吧网页缩放">
          <button
            type="button"
            className="btn ghost"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => changeZoom(zoom - ZOOM_STEP)}
            title="缩小网页"
            aria-label="缩小鱼吧网页"
          >
            <Icon name="minimize" size={14} />
          </button>
          <button
            type="button"
            className="btn ghost yuba-zoom-reset"
            onClick={() => changeZoom(DEFAULT_ZOOM)}
            title="恢复 100%"
            aria-label={`恢复鱼吧网页默认缩放，当前 ${zoom}%`}
          >
            {zoom}%
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => changeZoom(zoom + ZOOM_STEP)}
            title="放大网页和字体"
            aria-label="放大鱼吧网页和字体"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
        {toolbarActions}
        {loading && !error ? <span role="status">加载中…</span> : null}
      </div>
      <div className="yuba-content">
        <div ref={hostRef} className="yuba-viewport" hidden={Boolean(error)} />
        {error ? (
          <div className="yuba-status">
            <span role="alert">{error}</span>
            <button type="button" className="btn ghost" onClick={retry}>
              重试
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
