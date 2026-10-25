import { useId, useState } from 'react';
import type { RoomAudienceMetric, RoomAudienceRanking } from '@shared/contracts/audience';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { audienceMetricTooltip, formatAudienceValue } from './audienceDisplay';
import { useRoomAudience } from './useRoomAudience';

const metricsToShow: RoomAudienceMetric[] = [
  { key: 'vip', label: '贵宾', value: null, unit: '人' },
  { key: 'diamond-fans', label: '钻石粉丝', value: null, unit: '人' },
];
const rankingTabs: { key: RoomAudienceRanking['key']; label: string }[] = [
  { key: 'day', label: '日活跃' },
  { key: 'week', label: '周活跃' },
  { key: 'total', label: '总活跃' },
];

export function DouyuRoomAudience({ roomId }: { roomId: string }): React.JSX.Element {
  const query = useRoomAudience('douyu', roomId);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<RoomAudienceRanking['key']>('day');
  const panelId = useId();
  const ranking = query.data?.rankings?.find((entry) => entry.key === activeTab);
  const statusText = query.isError
    ? query.data
      ? '更新失败 · 旧数据'
      : '统计暂不可用'
    : query.isPending
      ? '正在获取统计…'
      : null;
  const updateTime = query.data
    ? new Date(query.data.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false })
    : null;

  return (
    <div className="douyu-audience">
      <div className="room-audience" role="group" aria-label="直播间统计">
        <div className="room-audience-content">
          <dl className="room-audience-metrics">
            {metricsToShow.map((placeholder) => {
              const metric =
                query.data?.metrics.find((entry) => entry.key === placeholder.key) ?? placeholder;
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
          {statusText ? (
            <span
              className={`room-audience-status${query.isError ? ' is-error' : ''}`}
              role="status"
              title={query.isError ? errorMessage(query.error) : undefined}
            >
              {statusText}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="room-audience-refresh"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          aria-label={query.isError ? '重试直播间统计' : '刷新直播间统计'}
          title={
            query.isFetching
              ? '正在更新直播间统计'
              : `刷新直播间统计${updateTime ? ` · 上次更新 ${updateTime}` : ''}`
          }
        >
          <Icon name="refresh" size={12} className={query.isFetching ? 'is-spinning' : undefined} />
          {query.isError ? <span>重试</span> : null}
        </button>
        <button
          type="button"
          className={`room-ranking-toggle${expanded ? ' is-expanded' : ''}`}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((value) => !value)}
        >
          活跃榜
          <Icon name="chevron" size={12} />
        </button>
      </div>
      {expanded ? (
        <section className="room-rankings" id={panelId} aria-label="活跃榜">
          <div className="room-ranking-tabs" role="tablist" aria-label="活跃榜周期">
            {rankingTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`${panelId}-${tab.key}-tab`}
                aria-controls={`${panelId}-${tab.key}-panel`}
                aria-selected={activeTab === tab.key}
                tabIndex={activeTab === tab.key ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(event) => {
                  const index = rankingTabs.findIndex((entry) => entry.key === tab.key);
                  const nextIndex =
                    event.key === 'ArrowRight'
                      ? (index + 1) % rankingTabs.length
                      : event.key === 'ArrowLeft'
                        ? (index + rankingTabs.length - 1) % rankingTabs.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? rankingTabs.length - 1
                            : null;
                  const next = nextIndex === null ? undefined : rankingTabs[nextIndex];
                  if (!next) return;
                  event.preventDefault();
                  setActiveTab(next.key);
                  document.getElementById(`${panelId}-${next.key}-tab`)?.focus();
                }}
              >
                {tab.label}
              </button>
            ))}
            <span
              className="room-ranking-note"
              title="平台仅返回前 10 名及贡献值，不能据此推算房间总活跃人数"
            >
              前 10 名
            </span>
          </div>
          <div
            className="room-ranking-panel"
            id={`${panelId}-${activeTab}-panel`}
            role="tabpanel"
            aria-labelledby={`${panelId}-${activeTab}-tab`}
            tabIndex={0}
          >
            {ranking && ranking.entries.length > 0 ? (
              <table className="room-ranking-table">
                <thead>
                  <tr>
                    <th scope="col">排名</th>
                    <th scope="col">用户</th>
                    <th scope="col" title="平台返回的贡献值">
                      贡献值
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.entries.slice(0, 10).map((entry, index) => {
                    const contribution = formatAudienceValue(entry.contribution);
                    return (
                      <tr key={`${entry.userId}-${entry.rank}-${index}`}>
                        <td>{entry.rank}</td>
                        <td title={entry.nickname || `用户 ${entry.userId}`}>
                          {entry.nickname || `用户 ${entry.userId}`}
                        </td>
                        <td title={`贡献值：${contribution.exact}`}>{contribution.display}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="room-ranking-empty" role="status">
                {ranking
                  ? '暂无用户上榜'
                  : query.isPending || query.isFetching
                    ? '正在获取榜单…'
                    : '榜单暂未获取，可刷新重试'}
              </p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
