import { useEffect, useState } from 'react';
import type { LiveReminderSettings } from '@shared/contracts/viewing';
import { errorMessage, unwrap } from '../../lib/api';

export function LiveReminderControls(): React.JSX.Element {
  const [settings, setSettings] = useState<(LiveReminderSettings & { supported: boolean }) | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const unsubscribe = window.api.home.onReminderChange((value) => {
      if (active) setSettings(value);
    });
    void window.api.home
      .reminderSettings()
      .then(unwrap)
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  async function change(patch: Partial<LiveReminderSettings>): Promise<void> {
    if (!settings || busy) return;
    setBusy(true);
    setError(null);
    try {
      setSettings(unwrap(await window.api.home.setReminders({ ...settings, ...patch })));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="reminder-controls">
      <summary>开播提醒{settings?.enabled ? ' · 已开启' : ''}</summary>
      <div className="reminder-options">
        <p>
          应用运行时，每分钟检查斗鱼特别关注。需登录且房间在关注列表内；首次检查不提醒，视频轮播不提醒。
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {settings ? (
          <>
            {!settings.supported ? <p>当前系统不支持桌面通知。</p> : null}
            <label>
              <input
                type="checkbox"
                disabled={busy || !settings.supported}
                checked={settings.enabled}
                onChange={(event) => void change({ enabled: event.target.checked })}
              />
              特别关注开播时提醒
            </label>
            <label>
              <input
                type="checkbox"
                disabled={busy}
                checked={settings.quietEnabled}
                onChange={(event) => void change({ quietEnabled: event.target.checked })}
              />
              免打扰时段
            </label>
            <div className="quiet-hours">
              <select
                aria-label="免打扰开始时间"
                disabled={busy || !settings.quietEnabled}
                value={settings.quietStart}
                onChange={(event) => void change({ quietStart: Number(event.target.value) })}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {hour}:00
                  </option>
                ))}
              </select>
              <span>至</span>
              <select
                aria-label="免打扰结束时间"
                disabled={busy || !settings.quietEnabled}
                value={settings.quietEnd}
                onChange={(event) => void change({ quietEnd: Number(event.target.value) })}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {hour}:00
                  </option>
                ))}
              </select>
            </div>
            <small>相同开始和结束时间表示不限制时段。通知也受 Windows 通知设置影响。</small>
          </>
        ) : (
          <span>正在读取提醒设置…</span>
        )}
      </div>
    </details>
  );
}
