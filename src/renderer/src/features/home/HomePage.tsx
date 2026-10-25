import { useEffect, useState } from 'react';
import type { AccountSummary } from '@shared/contracts/account';
import type { FollowedRoom } from '@shared/contracts/follow';
import type { RoomHistoryEntry } from '@shared/contracts/history';
import type { SpecialFollowEntry, SpecialFollowTarget } from '@shared/contracts/specialFollow';
import type { StreamPlatform } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';
import { PLATFORM_ICON_URLS } from '../../lib/platformAssets';
import { platformLabel, roomKey } from '../../lib/streamIdentity';
import { formatHistoryTime } from '../history/roomHistory';
import {
  resolveSpecialRooms,
  sortFollowedRooms,
  specialFollowKey,
  targetFromFollowed,
  targetFromHistory,
} from './homeModel';

interface HomePageProps {
  accountsLoading: boolean;
  activeAccount: AccountSummary | undefined;
  followed: FollowedRoom[];
  followedLoading: boolean;
  followedError: string | null;
  history: RoomHistoryEntry[];
  specials: SpecialFollowEntry[];
  specialError: string | null;
  onRefreshFollowed: () => void;
  onOpen: (platform: StreamPlatform, roomId: string) => void;
  onToggleSpecial: (target: SpecialFollowTarget) => void;
}

interface HomeRoomRowProps {
  platform: StreamPlatform;
  roomId: string;
  name: string;
  title: string;
  meta?: string | undefined;
  cover?: string | undefined;
  isLive?: boolean | undefined;
  showStatus?: boolean;
  pinned: boolean;
  onOpen: () => void;
  onToggle: () => void;
}

function HomeRoomRow({
  platform,
  roomId,
  name,
  title,
  meta,
  cover,
  isLive = false,
  showStatus = false,
  pinned,
  onOpen,
  onToggle,
}: HomeRoomRowProps): React.JSX.Element {
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => {
    setCoverFailed(false);
  }, [cover]);

  const subtitle = title && title !== name ? title : `房间 ${roomId}`;
  const thumbnail = cover && !coverFailed ? cover : null;

  return (
    <article className={`home-room-row${isLive ? ' is-live' : ''}`}>
      <button
        type="button"
        className="home-room-open"
        onClick={onOpen}
        title={`打开${platformLabel(platform)}房间 ${roomId}`}
      >
        <span className={`home-room-thumb home-room-thumb-${platform}`}>
          <span className="home-thumb-fallback" aria-hidden="true">
            <img src={PLATFORM_ICON_URLS[platform]} width={24} height={24} alt="" draggable={false} />
          </span>
          {thumbnail ? (
            <img
              className="home-thumb-image"
              src={thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setCoverFailed(true)}
            />
          ) : null}
          {isLive ? (
            <span className="home-thumb-live">
              <i />
              LIVE
            </span>
          ) : null}
        </span>
        <span className="home-room-copy">
          <strong>{name}</strong>
          <span className="home-room-subtitle">{subtitle}</span>
          <span className="home-room-meta">
            {showStatus && !isLive ? <small className="home-offline">未开播</small> : null}
            {meta ? <small>{meta}</small> : null}
            <span className="home-room-id">#{roomId}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className={`home-star${pinned ? ' is-active' : ''}`}
        onClick={onToggle}
        aria-pressed={pinned}
        aria-label={pinned ? `取消特别关注 ${name}` : `特别关注 ${name}`}
        title={pinned ? '取消特别关注' : '特别关注'}
      >
        <Icon name="star" size={15} />
      </button>
    </article>
  );
}

function HomeSkeleton(): React.JSX.Element {
  return (
    <div className="home-skeleton-list" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function HomePage({
  accountsLoading,
  activeAccount,
  followed,
  followedLoading,
  followedError,
  history,
  specials,
  specialError,
  onRefreshFollowed,
  onOpen,
  onToggleSpecial,
}: HomePageProps): React.JSX.Element {
  const sortedFollowed = sortFollowedRooms(followed);
  const specialRooms = resolveSpecialRooms(specials, followed);
  const specialKeys = new Set(specials.map((entry) => specialFollowKey(entry)));
  const coverByKey = new Map<string, string>();
  for (const room of followed) {
    if (room.cover) coverByKey.set(specialFollowKey(room), room.cover);
  }
  for (const entry of specials) {
    if (entry.cover && !coverByKey.has(specialFollowKey(entry))) {
      coverByKey.set(specialFollowKey(entry), entry.cover);
    }
  }
  const liveCount = followed.filter((room) => room.isLive).length;
  const accountIsActive = activeAccount?.status === 'active';

  return (
    <div className="home-page">
      <header className="home-hero">
        <div className="home-hero-copy">
          <span className="eyebrow">HOME · QUICK START</span>
          <h2>从常看的开始</h2>
          <p>特别关注置顶，关注和最近观看一键进房。切到首页会暂停当前直播声音，选房后自动回到直播。</p>
        </div>
        <div className="home-stats" aria-label="首页统计">
          <span>
            <strong>{followed.length}</strong>
            关注
          </span>
          <span>
            <strong>{liveCount}</strong>
            正在直播
          </span>
          <span>
            <strong>{specials.length}</strong>
            特别关注
          </span>
          <span>
            <strong>{history.length}</strong>
            历史
          </span>
        </div>
      </header>

      <section className="home-section home-special-section" aria-labelledby="home-special-title">
        <header className="home-section-head">
          <div>
            <span className="home-kicker">PINNED</span>
            <h3 id="home-special-title">特别关注</h3>
          </div>
          <span className="home-section-count">{specialRooms.length}</span>
        </header>

        {specialError ? <p className="home-inline-error">{specialError}</p> : null}

        {specialRooms.length === 0 ? (
          <div className="home-pin-hint">
            <Icon name="star" size={17} />
            <span>在关注或最近观看里点星标，把常看的房间放到这里。</span>
          </div>
        ) : (
          <div className="home-special-grid">
            {specialRooms.map((room) => (
              <HomeRoomRow
                key={specialFollowKey(room)}
                platform={room.platform}
                roomId={room.roomId}
                name={room.name}
                title={room.title}
                cover={room.cover}
                isLive={room.isLive}
                showStatus
                pinned
                onOpen={() => onOpen(room.platform, room.roomId)}
                onToggle={() =>
                  onToggleSpecial({
                    platform: room.platform,
                    roomId: room.roomId,
                    name: room.name,
                    title: room.title,
                    ...(room.cover ? { cover: room.cover } : {}),
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="home-section" aria-labelledby="home-follow-title">
        <header className="home-section-head">
          <div>
            <span className="home-kicker">DOUYU</span>
            <h3 id="home-follow-title">我的关注</h3>
          </div>
          <button
            type="button"
            className="home-refresh"
            onClick={onRefreshFollowed}
            disabled={followedLoading || !accountIsActive}
            title="刷新关注列表"
          >
            <Icon name="refresh" size={14} />
            {followedLoading ? '刷新中' : '刷新'}
          </button>
        </header>

        {accountsLoading ? (
          <HomeSkeleton />
        ) : !accountIsActive ? (
          <div className="home-login">
            <Icon name="lock" size={18} />
            <div>
              <strong>登录斗鱼后同步关注</strong>
              <p>
                {activeAccount?.status === 'expired'
                  ? '当前账号登录已过期，请在顶栏重新登录。'
                  : '登录后这里会显示你关注的直播间和开播状态。'}
              </p>
            </div>
          </div>
        ) : followedLoading ? (
          <HomeSkeleton />
        ) : followedError ? (
          <div className="home-error">
            <Icon name="alert" size={17} />
            <span className="selectable">{followedError}</span>
            <button type="button" onClick={onRefreshFollowed}>
              重试
            </button>
          </div>
        ) : sortedFollowed.length === 0 ? (
          <div className="home-empty">
            <Icon name="user" size={19} />
            <span>还没有关注</span>
            <small>在斗鱼关注主播后，刷新这里就会出现。</small>
          </div>
        ) : (
          <div className="home-room-list" role="list">
            {sortedFollowed.map((room) => (
              <div role="listitem" key={roomKey(room.platform, room.roomId)}>
                <HomeRoomRow
                  platform={room.platform}
                  roomId={room.roomId}
                  name={room.name}
                  title={room.title}
                  cover={room.cover}
                  isLive={room.isLive}
                  showStatus
                  pinned={specialKeys.has(specialFollowKey(room))}
                  onOpen={() => onOpen(room.platform, room.roomId)}
                  onToggle={() => onToggleSpecial(targetFromFollowed(room))}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="home-section" aria-labelledby="home-history-title">
        <header className="home-section-head">
          <div>
            <span className="home-kicker">RECENT</span>
            <h3 id="home-history-title">最近观看</h3>
          </div>
          <span className="home-section-count">{history.length}</span>
        </header>

        {history.length === 0 ? (
          <div className="home-empty">
            <Icon name="history" size={19} />
            <span>还没有观看记录</span>
            <small>打开过的房间会按最近访问时间出现在这里。</small>
          </div>
        ) : (
          <div className="home-room-list" role="list">
            {history.map((entry) => {
              const key = roomKey(entry.platform, entry.roomId);
              const name = entry.anchorName || `房间 ${entry.roomId}`;
              const title = entry.title || `房间 ${entry.roomId}`;
              const historyCover = coverByKey.get(key);
              return (
                <div role="listitem" key={key}>
                  <HomeRoomRow
                    platform={entry.platform}
                    roomId={entry.roomId}
                    name={name}
                    title={title}
                    meta={formatHistoryTime(entry.visitedAt)}
                    cover={historyCover}
                    pinned={specialKeys.has(key)}
                    onOpen={() => onOpen(entry.platform, entry.roomId)}
                    onToggle={() => onToggleSpecial(targetFromHistory(entry, historyCover))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
