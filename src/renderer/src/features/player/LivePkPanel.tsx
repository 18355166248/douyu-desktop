import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { errorMessage, unwrap } from '../../lib/api';

export function LivePkPanel({
  roomId,
  visible,
  onClose,
}: {
  roomId: string;
  visible: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const [now, setNow] = useState(Date.now);
  const query = useQuery({
    queryKey: ['room-pk', roomId],
    queryFn: async () => unwrap(await window.api.streams.pk(roomId)),
    enabled: visible,
    staleTime: 4_000,
    refetchInterval: visible ? 5_000 : false,
    retry: false,
  });
  const snapshot = query.data;
  useEffect(() => {
    if (!visible || !snapshot || snapshot.phase === 'finished') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [visible, snapshot]);
  const remaining = Math.max(0, Math.ceil(((snapshot?.endsAt ?? now) - now) / 1_000));
  const countdown = `${Math.floor(remaining / 60)
    .toString()
    .padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
  const status =
    snapshot?.phase === 'finished' ? '已结算' : remaining === 0 ? '等待结算' : countdown;

  return (
    <section className="pk-stats" aria-label="当前房间 PK 数据">
      <header className="pk-stats-header">
        <strong>PK</strong>
        {snapshot ? (
          <>
            <span>{status}</span>
            <small
              title={`场次 ${snapshot.pkId}；上次更新 ${new Date(snapshot.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false })}`}
            >
              {query.isError ? '更新失败 · 上次数据' : '平台数据 · 每 5 秒更新'}
            </small>
          </>
        ) : (
          <span role="status">
            {query.isPending
              ? '正在获取…'
              : query.isError
                ? errorMessage(query.error)
                : '本次未收到可用 PK 数据'}
          </span>
        )}
        <button
          type="button"
          className="icon-btn"
          disabled={query.isFetching}
          aria-label="刷新 PK 数据"
          onClick={() => void query.refetch()}
        >
          <Icon name="refresh" size={13} />
        </button>
        <button type="button" className="icon-btn" aria-label="隐藏 PK 数据" onClick={onClose}>
          <Icon name="close" size={13} />
        </button>
      </header>
      {snapshot ? (
        <dl className="pk-stats-rooms">
          {snapshot.participants.map((room) => (
            <div key={room.roomId} className={room.roomId === roomId ? 'is-current' : ''}>
              <dt title={`${room.name} · 房间 ${room.roomId}`}>
                <span>{room.rank}</span>
                {room.name}
              </dt>
              <dd>
                <strong>{room.score.toLocaleString('zh-CN')}</strong>
                <span>PK 分数</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
