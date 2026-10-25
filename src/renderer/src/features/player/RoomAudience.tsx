import type { StreamPlatform } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { audienceMetricTooltip, formatAudienceValue } from './audienceDisplay';
import { useRoomAudience } from './useRoomAudience';
import { DouyuRoomAudience } from './DouyuRoomAudience';

interface RoomAudienceProps {
  platform: StreamPlatform;
  roomId: string;
}

export function RoomAudience({ platform, roomId }: RoomAudienceProps): React.JSX.Element {
  if (platform === 'douyu') return <DouyuRoomAudience key={roomId} roomId={roomId} />;
  return <PolledRoomAudience platform={platform} roomId={roomId} />;
}

function PolledRoomAudience({ platform, roomId }: RoomAudienceProps): React.JSX.Element {
  const query = useRoomAudience(platform, roomId);
  const metrics = query.data?.metrics ?? [];
  const hasMetrics = metrics.length > 0;
  const updateTime = query.data
    ? new Date(query.data.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false })
    : null;
  const statusText = query.isError
    ? hasMetrics
      ? '更新失败 · 旧数据'
      : '统计暂不可用'
    : query.isPending
      ? '正在获取统计…'
      : !hasMetrics
        ? '暂无统计'
        : null;
  const statusTitle = query.isError
    ? `${errorMessage(query.error)}${updateTime ? `；上次更新 ${updateTime}` : ''}`
    : '每分钟自动更新；各项统计使用平台原有口径';

  return (
    <div className="room-audience" role="group" aria-label="直播间统计">
      <div className="room-audience-content">
        {hasMetrics ? (
          <dl className="room-audience-metrics">
            {metrics.map((metric) => {
              const { display } = formatAudienceValue(metric.value, metric.isLowerBound);
              return (
                <div
                  key={metric.key}
                  className={`room-audience-metric${display === '—' ? ' is-unavailable' : ''}`}
                  title={audienceMetricTooltip(metric)}
                  aria-label={audienceMetricTooltip(metric)}
                  tabIndex={0}
                >
                  <dt>{metric.label}</dt>
                  <dd>
                    <strong>{display}</strong>
                    {display !== '—' ? <span>{metric.unit}</span> : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}
        {statusText ? (
          <div
            className={`room-audience-status${query.isError ? ' is-error' : ''}`}
            title={statusTitle}
            role="status"
          >
            {query.isError ? <Icon name="alert" size={12} /> : null}
            {statusText}
          </div>
        ) : null}
      </div>
    </div>
  );
}
