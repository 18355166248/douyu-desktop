import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { AccountAvatar } from '../accounts/AccountBar';
import { usePlatformLogin } from '../accounts/usePlatformLogin';

const ERROR_VISIBLE_MS = 4000;

export function HuyaStage(): React.JSX.Element {
  const huya = usePlatformLogin('huya');
  const [visibleError, setVisibleError] = useState<unknown>(null);
  const rawError = huya.login.error ?? huya.logout.error;

  useEffect(() => {
    if (!rawError) {
      setVisibleError(null);
      return;
    }

    setVisibleError(rawError);
    const timer = window.setTimeout(() => setVisibleError(null), ERROR_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [rawError]);

  const status = huya.query.data;
  const loggedIn = Boolean(status?.loggedIn);
  const busy = huya.login.isPending || huya.logout.isPending;
  const pending = huya.query.isPending;

  return (
    <div className="empty-stage huya-stage">
      <div className="empty-grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="empty-icon">
        <Icon name="live" size={30} />
      </div>
      <span className="eyebrow">HUYA · LOGIN READY</span>
      <h2>虎牙播放还在适配中</h2>
      <p>
        播放链路还没打通，先把虎牙账号登录好。登录状态只保存在本机，不会暴露给页面；
        适配完成后可直接使用。
      </p>

      <div className="huya-stage-actions">
        {loggedIn ? (
          <div className="huya-stage-account">
            <AccountAvatar
              nickname={status?.nickname || '虎牙用户'}
              avatarUrl={status?.avatarUrl ?? ''}
              small
            />
            <span className="account-row-text">
              <strong>{status?.nickname || '虎牙用户'}</strong>
              <small>账号状态已保存</small>
            </span>
            <button
              type="button"
              className="btn ghost"
              onClick={() => huya.logout.mutate()}
              disabled={busy}
            >
              {huya.logout.isPending ? '退出中…' : '退出'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={() => huya.login.mutate()}
            disabled={busy || pending}
          >
            <Icon name="user" size={16} />
            {huya.login.isPending ? '等待扫码…' : pending ? '读取状态…' : '登录虎牙'}
          </button>
        )}
      </div>

      {visibleError ? (
        <span className="huya-stage-error selectable" role="status">
          {errorMessage(visibleError)}
        </span>
      ) : null}

      <div className="empty-hints">
        <span>登录状态本机保存</span>
        <span>播放适配完成后自动可用</span>
        <span>不把 Cookie 暴露给页面</span>
      </div>
    </div>
  );
}
