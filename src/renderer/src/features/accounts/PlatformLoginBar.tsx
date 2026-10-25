import { useEffect, useState } from 'react';
import type { GuidedPlatform } from '@shared/contracts/platformLogin';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { AccountAvatar } from './AccountBar';
import { usePlatformLogin } from './usePlatformLogin';

const ACCOUNT_ERROR_VISIBLE_MS = 4000;

function platformName(platform: GuidedPlatform): string {
  return platform === 'bilibili' ? 'B 站' : '虎牙';
}

export function PlatformLoginBar({
  platform,
  compact = false,
}: {
  platform: GuidedPlatform;
  compact?: boolean;
}): React.JSX.Element {
  const { query, login, logout } = usePlatformLogin(platform);
  const [open, setOpen] = useState(false);
  const rawError = login.error ?? logout.error;
  const [visibleError, setVisibleError] = useState<unknown>(null);

  useEffect(() => {
    if (!rawError) {
      setVisibleError(null);
      return;
    }

    setVisibleError(rawError);
    const timer = window.setTimeout(() => setVisibleError(null), ACCOUNT_ERROR_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [rawError]);

  const name = platformName(platform);
  const busy = login.isPending || logout.isPending;
  const error = visibleError;
  const loginHint =
    platform === 'bilibili' ? '登录后请求更高画质' : '登录后保存虎牙账号状态';

  if (query.isPending) {
    return (
      <div className={`account-skeleton${compact ? ' is-compact' : ''}`} aria-label="加载平台账号" />
    );
  }

  if (query.isError) {
    return (
      <button
        type="button"
        className={`btn ghost${compact ? ' account-retry' : ''}`}
        onClick={() => void query.refetch()}
      >
        <Icon name="refresh" />
        {compact ? '重试' : `重试${name}账号`}
      </button>
    );
  }

  const status = query.data;
  if (!status?.loggedIn) {
    return (
      <div className={`account-area${compact ? ' is-compact' : ''}`}>
        <button
          type="button"
          className="btn ghost"
          onClick={() => login.mutate()}
          disabled={busy}
          title={loginHint}
          aria-label={`登录${name}，${loginHint}`}
        >
          <Icon name="user" />
          {login.isPending ? '扫码中…' : compact ? '登录' : `登录${name}`}
        </button>
        {error ? (
          <span className="account-error selectable" role="status">
            {errorMessage(error)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`account-area${compact ? ' is-compact' : ''}`}>
      <div className="account-menu">
        <button
          type="button"
          className="account-chip"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <AccountAvatar nickname={status.nickname} avatarUrl={status.avatarUrl} />
          <span className="account-text">
            <strong>{status.nickname}</strong>
            <small>
              <i className="status-dot active" />
              {name}已登录
            </small>
          </span>
          <Icon name="chevron" size={15} />
        </button>

        {open ? (
          <>
            <button
              type="button"
              className="popover-backdrop"
              aria-label="关闭平台账号菜单"
              onClick={() => setOpen(false)}
            />
            <div className="account-popover" role="menu">
              <div className="popover-label">{name}账号</div>
              <p className={`platform-login-note${status.message ? ' is-warning' : ''}`}>
                {status.message ??
                  (platform === 'bilibili'
                    ? '高画质请求会带上当前登录态，实际档位由账号权限决定。'
                    : '登录状态已保存；虎牙播放仍在适配中，暂不能看直播。')}
              </p>
              <div className="popover-sep" />
              <button
                type="button"
                role="menuitem"
                className="popover-action danger"
                onClick={() => {
                  setOpen(false);
                  logout.mutate();
                }}
                disabled={busy}
              >
                <Icon name="logout" size={16} />
                退出{name}账号
              </button>
            </div>
          </>
        ) : null}
      </div>
      {error ? (
        <span className="account-error selectable" role="status">
          {errorMessage(error)}
        </span>
      ) : null}
    </div>
  );
}
