import { AUTO_CLAIM_INTERVALS, autoClaimEventLabel } from '@shared/contracts/autoClaim';
import type { AutoClaimEventKind } from '@shared/contracts/autoClaim';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { useAutoClaim } from './useAutoClaim';

const eventTone: Record<AutoClaimEventKind, string> = {
  claimed: 'is-success',
  empty: 'is-muted',
  error: 'is-error',
  info: 'is-muted',
};

function clockOf(at: number): string {
  const date = new Date(at);
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

/**
 * 自动抢红包开关。斗鱼的红包是纯 HTTP 活动，因此可以真正后台轮询；
 * 宝箱需要直播间 socket 指令与极验，没有放进来自动执行。
 */
export function AutoClaimPanel(): React.JSX.Element {
  const { state, setSettings, poll } = useAutoClaim();
  const settings = state?.settings;
  const rooms = state?.rooms.length ?? 0;

  return (
    <section className="task-claim">
      <div className="task-claim-head">
        <Icon name="spark" size={16} />
        <strong>自动领取</strong>
        {state?.polling ? <span className="task-claim-live">检查中…</span> : null}
      </div>

      <label className="task-option">
        <input
          type="checkbox"
          checked={settings?.redPacket ?? false}
          disabled={!settings || setSettings.isPending}
          onChange={(event) => {
            if (!settings) return;
            setSettings.mutate({ ...settings, redPacket: event.target.checked });
          }}
        />
        <span>
          <strong>自动抢礼物红包</strong>
          <small>监听已打开直播间的红包，开抢前 2 秒自动出手</small>
        </span>
      </label>

      <div className="task-claim-row">
        <span className="task-claim-label">检查间隔</span>
        <select
          className="task-claim-select"
          value={settings?.intervalSec ?? 60}
          disabled={!settings || setSettings.isPending}
          onChange={(event) => {
            if (!settings) return;
            setSettings.mutate({ ...settings, intervalSec: Number(event.target.value) });
          }}
        >
          {AUTO_CLAIM_INTERVALS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} 秒
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn subtle"
          disabled={poll.isPending || rooms === 0}
          onClick={() => poll.mutate()}
        >
          立即检查
        </button>
      </div>

      <p className="task-claim-note">
        {rooms > 0
          ? `正在监听 ${rooms} 个斗鱼直播间`
          : '打开斗鱼直播间后开始监听（最多 12 个）'}
      </p>

      {poll.error || setSettings.error ? (
        <p className="task-claim-error selectable">
          {errorMessage(poll.error ?? setSettings.error)}
        </p>
      ) : null}

      {state && state.events.length > 0 ? (
        <ul className="task-claim-events">
          {state.events.slice(0, 5).map((event) => (
            <li key={`${event.at}-${event.kind}-${event.roomId}`} className={eventTone[event.kind]}>
              <span className="task-claim-time">{clockOf(event.at)}</span>
              <span className="task-claim-kind">{autoClaimEventLabel(event.kind)}</span>
              <span className="task-claim-text selectable">
                {event.roomId ? `[${event.roomId}] ` : ''}
                {event.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
