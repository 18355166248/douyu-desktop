import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { useAccounts } from './useAccounts';

function initialOf(name: string): string {
  return name.trim().slice(0, 1) || '斗';
}

export function AccountBar(): React.JSX.Element {
  const { query, accounts, activeAccount, login, switchAccount, logout, health } = useAccounts();
  const [open, setOpen] = useState(false);

  const error = login.error ?? switchAccount.error ?? logout.error ?? health.error;
  const busy = login.isPending || switchAccount.isPending || logout.isPending || health.isPending;

  if (query.isPending) return <div className="account-skeleton" aria-label="加载账号" />;

  if (query.isError) {
    return (
      <button type="button" className="btn ghost" onClick={() => void query.refetch()}>
        <Icon name="refresh" />
        重试账号
      </button>
    );
  }

  if (!activeAccount) {
    return (
      <div className="account-area">
        <button
          type="button"
          className="btn ghost"
          onClick={() => login.mutate()}
          disabled={login.isPending}
        >
          <Icon name="user" />
          {login.isPending ? '等待登录…' : '登录斗鱼'}
        </button>
        {error ? <span className="account-error">{errorMessage(error)}</span> : null}
      </div>
    );
  }

  const statusText = activeAccount.status === 'active' ? '在线' : '登录过期';

  return (
    <div className="account-area">
      <div className="account-menu">
        <button
          type="button"
          className={`account-chip ${activeAccount.status === 'expired' ? 'is-expired' : ''}`}
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="avatar">{initialOf(activeAccount.nickname)}</span>
          <span className="account-text">
            <strong>{activeAccount.nickname}</strong>
            <small>
              <i className={`status-dot ${activeAccount.status}`} />
              {statusText}
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
              onClick={() => setOpen(false)}
            />
            <div className="account-popover" role="menu">
              <div className="popover-label">斗鱼账号</div>
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
                  <span className="avatar small">{initialOf(account.nickname)}</span>
                  <span className="account-row-text">
                    <strong>{account.nickname}</strong>
                    <small>{account.status === 'active' ? '在线' : '登录过期'}</small>
                  </span>
                  {account.isActive ? <Icon name="check" size={16} /> : null}
                </button>
              ))}
              <div className="popover-sep" />
              <button
                type="button"
                role="menuitem"
                className="popover-action"
                onClick={() => {
                  setOpen(false);
                  login.mutate();
                }}
                disabled={busy}
              >
                <Icon name="plus" size={16} />
                添加账号
              </button>
              <button
                type="button"
                role="menuitem"
                className="popover-action"
                onClick={() => health.mutate(activeAccount.id)}
                disabled={busy}
              >
                <Icon name="refresh" size={16} />
                刷新登录状态
              </button>
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
                退出当前账号
              </button>
            </div>
          </>
        ) : null}
      </div>
      {error ? <span className="account-error">{errorMessage(error)}</span> : null}
    </div>
  );
}
