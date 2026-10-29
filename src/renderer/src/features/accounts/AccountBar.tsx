import { useEffect, useState } from 'react';
import type { AccountSummary } from '@shared/contracts/account';
import type { GuidedPlatform, PlatformLoginStatus } from '@shared/contracts/platformLogin';
import type { StreamPlatform } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { platformLabel } from '../../lib/streamIdentity';
import { useAccounts } from './useAccounts';
import { usePlatformLogin } from './usePlatformLogin';

const ACCOUNT_MESSAGE_VISIBLE_MS = 4000;

function initialOf(name: string): string {
  return name.trim().slice(0, 1) || '斗';
}

export function AccountAvatar({
  nickname,
  avatarUrl,
  small = false,
}: {
  nickname: string;
  avatarUrl: string;
  small?: boolean;
}): React.JSX.Element {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const className = `avatar${small ? ' small' : ''}`;

  if (avatarUrl && failedUrl !== avatarUrl) {
    return (
      <img
        className={`${className} image`}
        src={avatarUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setFailedUrl(avatarUrl)}
      />
    );
  }

  return <span className={className}>{initialOf(nickname)}</span>;
}

interface AccountDisplay {
  platform: StreamPlatform;
  nickname: string;
  avatarUrl: string;
  statusText: string;
  expired: boolean;
}

function PlatformChooser({
  activeAccount,
  bilibili,
  huya,
  bilibiliPending,
  huyaPending,
  busy,
  onChoose,
}: {
  activeAccount: AccountSummary | undefined;
  bilibili: PlatformLoginStatus | undefined;
  huya: PlatformLoginStatus | undefined;
  bilibiliPending: boolean;
  huyaPending: boolean;
  busy: boolean;
  onChoose: (platform: StreamPlatform) => void;
}): React.JSX.Element {
  const bilibiliLoggedIn = Boolean(bilibili?.loggedIn);
  const huyaLoggedIn = Boolean(huya?.loggedIn);

  const choices: Array<{
    platform: StreamPlatform;
    label: string;
    detail: string;
    loggedIn: boolean;
    disabled: boolean;
  }> = [
    {
      platform: 'douyu',
      label: '斗鱼',
      detail: activeAccount
        ? `${activeAccount.nickname} · 添加 / 切换账号`
        : '斗鱼账号 · 扫码登录，支持多账号',
      loggedIn: Boolean(activeAccount),
      disabled: busy,
    },
    {
      platform: 'bilibili',
      label: 'B站',
      detail: bilibiliLoggedIn
        ? `${bilibili?.nickname ?? 'B站用户'} · 已登录`
        : bilibiliPending
          ? '检查登录状态…'
          : 'B站登录 · 扫码解锁高画质',
      loggedIn: bilibiliLoggedIn,
      disabled: busy || bilibiliPending || bilibiliLoggedIn,
    },
    {
      platform: 'huya',
      label: '虎牙',
      detail: huyaLoggedIn
        ? `${huya?.nickname ?? '虎牙用户'} · 已登录`
        : huyaPending
          ? '检查登录状态…'
          : '虎牙登录 · 扫码后播放',
      loggedIn: huyaLoggedIn,
      disabled: busy || huyaPending || huyaLoggedIn,
    },
  ];

  return (
    <>
      <div className="popover-label">登录 / 添加账号</div>
      {choices.map((choice) => (
        <button
          key={choice.platform}
          type="button"
          role="menuitem"
          className={`account-row platform-choice${choice.loggedIn ? ' is-logged-in' : ''}`}
          onClick={() => onChoose(choice.platform)}
          disabled={choice.disabled}
        >
          <AccountAvatar nickname={choice.label} avatarUrl="" small />
          <span className="account-row-text">
            <strong>{choice.label}</strong>
            <small>{choice.detail}</small>
          </span>
          {choice.loggedIn ? <Icon name="check" size={16} /> : <Icon name="chevron" size={15} />}
        </button>
      ))}
    </>
  );
}

function PlatformAccountRow({
  platform,
  status,
  pending,
  failed,
  busy,
  onLogin,
  onLogout,
  onRetry,
}: {
  platform: GuidedPlatform;
  status: PlatformLoginStatus | undefined;
  pending: boolean;
  failed: boolean;
  busy: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onRetry: () => void;
}): React.JSX.Element {
  const label = platformLabel(platform);
  const loggedIn = Boolean(status?.loggedIn);
  const nickname = status?.nickname || label;
  const retryOnly = failed && !loggedIn;
  const detail = pending
    ? '检查登录状态…'
    : failed
      ? loggedIn
        ? '状态检查失败，可退出重登'
        : '状态检查失败'
      : loggedIn
        ? status?.message?.trim() ||
          (platform === 'bilibili' ? '已登录 · 高画质可用' : '已登录 · 播放可用')
        : '扫码登录';
  const title = pending
    ? `${label}检查中`
    : loggedIn
      ? nickname
      : failed
        ? `${label}状态未知`
        : `${label}未登录`;

  return (
    <div className="platform-account-row">
      <AccountAvatar nickname={nickname} avatarUrl={status?.avatarUrl ?? ''} small />
      <span className="account-row-text">
        <strong>{title}</strong>
        <small className={failed && !pending ? 'is-error' : undefined}>
          {!pending && loggedIn && !failed ? <i className="status-dot active" /> : null}
          {detail}
        </small>
      </span>
      <button
        type="button"
        className="platform-account-action"
        onClick={retryOnly ? onRetry : loggedIn ? onLogout : onLogin}
        disabled={busy || pending}
        aria-label={
          retryOnly ? `重试检查${label}登录状态` : loggedIn ? `退出${label}登录` : `登录${label}`
        }
      >
        {pending ? '…' : retryOnly ? '重试' : loggedIn ? '退出' : '登录'}
      </button>
    </div>
  );
}

export function AccountBar({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const { query, accounts, activeAccount, login, switchAccount, logout, health } = useAccounts();
  const bilibili = usePlatformLogin('bilibili');
  const huya = usePlatformLogin('huya');
  const [open, setOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open && !chooserOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      setChooserOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, chooserOpen]);
  const rawError =
    login.error ??
    switchAccount.error ??
    logout.error ??
    health.error ??
    bilibili.login.error ??
    bilibili.logout.error ??
    huya.login.error ??
    huya.logout.error;
  const [visibleError, setVisibleError] = useState<unknown>(null);

  useEffect(() => {
    if (!rawError) {
      setVisibleError(null);
      return;
    }

    setVisibleError(rawError);
    const timer = window.setTimeout(() => setVisibleError(null), ACCOUNT_MESSAGE_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [rawError]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), ACCOUNT_MESSAGE_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!bilibili.login.data?.loggedIn) return;
    setNotice('B站登录成功');
  }, [bilibili.login.data]);

  useEffect(() => {
    if (!huya.login.data?.loggedIn) return;
    setNotice('虎牙登录成功');
  }, [huya.login.data]);

  useEffect(() => {
    if (!bilibili.logout.isSuccess) return;
    setNotice('已退出B站');
  }, [bilibili.logout.isSuccess]);

  useEffect(() => {
    if (!huya.logout.isSuccess) return;
    setNotice('已退出虎牙');
  }, [huya.logout.isSuccess]);

  useEffect(() => {
    if (!login.data) return;
    setNotice(`斗鱼登录成功：${login.data.nickname}`);
  }, [login.data]);

  useEffect(() => {
    if (!switchAccount.isSuccess) return;
    setNotice('已切换斗鱼账号');
  }, [switchAccount.isSuccess]);

  useEffect(() => {
    if (!logout.isSuccess) return;
    setNotice('已退出斗鱼账号');
  }, [logout.isSuccess]);

  useEffect(() => {
    if (!health.data) return;
    setNotice(health.data.status === 'active' ? '斗鱼账号状态正常' : '斗鱼账号登录已过期');
  }, [health.data]);

  const error = visibleError;
  const bilibiliBusy = bilibili.login.isPending || bilibili.logout.isPending;
  const huyaBusy = huya.login.isPending || huya.logout.isPending;
  const busy =
    login.isPending ||
    switchAccount.isPending ||
    logout.isPending ||
    health.isPending ||
    bilibiliBusy ||
    huyaBusy;
  const loginPending = login.isPending || bilibili.login.isPending || huya.login.isPending;

  if (query.isPending) {
    return (
      <div className={`account-skeleton${compact ? ' is-compact' : ''}`} aria-label="加载账号" />
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
        {compact ? '重试' : '重试账号'}
      </button>
    );
  }

  const bilibiliStatus = bilibili.query.data;
  const huyaStatus = huya.query.data;
  const display: AccountDisplay | null = activeAccount
    ? {
        platform: 'douyu',
        nickname: activeAccount.nickname,
        avatarUrl: activeAccount.avatarUrl,
        statusText: activeAccount.status === 'active' ? '斗鱼 · 在线' : '斗鱼 · 登录过期',
        expired: activeAccount.status === 'expired',
      }
    : bilibiliStatus?.loggedIn
      ? {
          platform: 'bilibili',
          nickname: bilibiliStatus.nickname,
          avatarUrl: bilibiliStatus.avatarUrl,
          statusText: 'B站 · 已登录',
          expired: false,
        }
      : huyaStatus?.loggedIn
        ? {
            platform: 'huya',
            nickname: huyaStatus.nickname,
            avatarUrl: huyaStatus.avatarUrl,
            statusText: '虎牙 · 已登录',
            expired: false,
          }
        : null;

  const choosePlatform = (platform: StreamPlatform): void => {
    setNotice(null);
    setChooserOpen(false);
    setOpen(false);
    if (platform === 'douyu') {
      login.mutate();
      return;
    }
    if (platform === 'bilibili') {
      bilibili.login.mutate();
      return;
    }
    huya.login.mutate();
  };

  const refreshAll = (): void => {
    setNotice(null);
    if (activeAccount) health.mutate(activeAccount.id);
    void query.refetch();
    void bilibili.query.refetch();
    void huya.query.refetch();
  };

  if (!display) {
    return (
      <div className={`account-area${compact ? ' is-compact' : ''}`}>
        <div className="account-menu">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setChooserOpen((value) => !value)}
            disabled={loginPending}
            aria-haspopup="menu"
            aria-expanded={chooserOpen}
            title="登录 / 添加账号"
          >
            <Icon name="user" />
            {loginPending ? '等待…' : compact ? '登录' : '登录 / 添加账号'}
          </button>
          {chooserOpen ? (
            <>
              <button
                type="button"
                className="popover-backdrop"
                aria-label="关闭平台选择"
                onClick={() => setChooserOpen(false)}
              />
              <div className="account-popover" role="menu">
                <PlatformChooser
                  activeAccount={activeAccount}
                  bilibili={bilibiliStatus}
                  huya={huyaStatus}
                  bilibiliPending={bilibili.query.isFetching}
                  huyaPending={huya.query.isFetching}
                  busy={busy}
                  onChoose={choosePlatform}
                />
              </div>
            </>
          ) : null}
        </div>
        {notice ? (
          <span className="account-notice" role="status">
            {notice}
          </span>
        ) : null}
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
          className={`account-chip ${display.expired ? 'is-expired' : ''}`}
          onClick={() => {
            setOpen((value) => !value);
            setChooserOpen(false);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${platformLabel(display.platform)}账号菜单`}
        >
          <AccountAvatar nickname={display.nickname} avatarUrl={display.avatarUrl} />
          <span className="account-text">
            <strong>{display.nickname}</strong>
            <small>
              <i className={`status-dot ${display.expired ? 'expired' : 'active'}`} />
              {display.statusText}
            </small>
          </span>
          <Icon name="chevron" size={15} />
        </button>

        {open ? (
          <>
            <button
              type="button"
              className="popover-backdrop"
              aria-label="关闭账号菜单"
              onClick={() => {
                setOpen(false);
                setChooserOpen(false);
              }}
            />
            <div className="account-popover" role="menu">
              <div className="popover-label">
                <span>斗鱼账号</span>
                <span className="popover-hint">签到 / 多开</span>
              </div>
              {accounts.length === 0 ? <p className="platform-empty">还没有斗鱼账号</p> : null}
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  role="menuitem"
                  className={`account-row ${account.isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    if (!account.isActive) switchAccount.mutate(account.id);
                    setOpen(false);
                  }}
                  disabled={account.isActive || busy}
                >
                  <AccountAvatar nickname={account.nickname} avatarUrl={account.avatarUrl} small />
                  <span className="account-row-text">
                    <strong>{account.nickname}</strong>
                    <small>{account.status === 'active' ? '在线' : '登录过期'}</small>
                  </span>
                  {account.isActive ? <Icon name="check" size={16} /> : null}
                </button>
              ))}

              <button
                type="button"
                role="menuitem"
                className="popover-action"
                onClick={() => {
                  setNotice(null);
                  setOpen(false);
                  login.mutate();
                }}
                disabled={busy}
              >
                <Icon name="addAccount" size={16} />
                添加斗鱼账号
              </button>

              <div className="popover-sep" />
              <div className="popover-label">
                <span>B站 / 虎牙登录</span>
                <span className="popover-hint">高画质 / 播放</span>
              </div>
              <PlatformAccountRow
                platform="bilibili"
                status={bilibiliStatus}
                pending={bilibili.query.isFetching}
                failed={bilibili.query.isError}
                busy={bilibiliBusy}
                onLogin={() => {
                  setNotice(null);
                  setOpen(false);
                  bilibili.login.mutate();
                }}
                onLogout={() => {
                  setOpen(false);
                  bilibili.logout.mutate();
                }}
                onRetry={() => void bilibili.query.refetch()}
              />
              <PlatformAccountRow
                platform="huya"
                status={huyaStatus}
                pending={huya.query.isFetching}
                failed={huya.query.isError}
                busy={huyaBusy}
                onLogin={() => {
                  setNotice(null);
                  setOpen(false);
                  huya.login.mutate();
                }}
                onLogout={() => {
                  setOpen(false);
                  huya.logout.mutate();
                }}
                onRetry={() => void huya.query.refetch()}
              />

              <div className="popover-sep" />
              <button
                type="button"
                role="menuitem"
                className="popover-action"
                onClick={refreshAll}
                disabled={
                  busy || query.isFetching || bilibili.query.isFetching || huya.query.isFetching
                }
              >
                <Icon name="refresh" size={16} />
                刷新账号状态
              </button>
              {activeAccount ? (
                <button
                  type="button"
                  role="menuitem"
                  className="popover-action danger"
                  onClick={() => {
                    setOpen(false);
                    logout.mutate(activeAccount.id);
                  }}
                  disabled={busy}
                >
                  <Icon name="logout" size={16} />
                  退出斗鱼账号
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      {notice ? (
        <span className="account-notice" role="status">
          {notice}
        </span>
      ) : null}
      {error ? (
        <span className="account-error selectable" role="status">
          {errorMessage(error)}
        </span>
      ) : null}
    </div>
  );
}
