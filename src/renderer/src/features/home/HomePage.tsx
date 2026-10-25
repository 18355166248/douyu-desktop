import { useEffect, useState } from 'react';
import type { AccountSummary } from '@shared/contracts/account';
import type { FollowedRoom } from '@shared/contracts/follow';
import type { RoomHistoryEntry } from '@shared/contracts/history';
import type { SpecialFollowEntry, SpecialFollowTarget } from '@shared/contracts/specialFollow';
import type { StreamPlatform } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';
import { PLATFORM_ICON_URLS } from '../../lib/platformAssets';
import { platformLabel, roomKey } from '../../lib/streamIdentity';
import { RoomHistoryPanel } from '../history/RoomHistoryPanel';
import {
  resolveSpecialRooms,
  sortFollowedRooms,
  specialFollowKey,
  targetFromFollowed,
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
  onRemoveHistory: (keys: readonly string[]) => void;
  onClearHistory: () => void;
}

interface HomeRoomRowProps {
  platform: StreamPlatform;
  roomId: string;
  name: string;
  title: string;
  cover?: string | undefined;
  isLive?: boolean | undefined;
  hasVideo?: boolean | undefined;
  showStatus?: boolean;
  official?: boolean;
  pinned: boolean;
  onOpen: () => void;
  onToggle: () => void;
}

function HomeRoomRow({
  platform,
  roomId,
  name,
  title,
  cover,
  isLive = false,
  hasVideo = false,
  showStatus = false,
  official = false,
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
          {showStatus && !isLive ? (
            <span className="home-thumb-offline">
              <strong>未开播</strong>
            </span>
          ) : null}
          {showStatus && !isLive && hasVideo ? (
            <span className="home-thumb-loop">视频轮播</span>
          ) : null}
          {isLive ? (
            <span className="home-thumb-live">
              <i />
              LIVE
            </span>
          ) : null}
        </span>
        <span className="home-room-copy">
          <span className="home-room-head">
            <strong title={name}>{name}</strong>
            <span className="home-room-id" title={`房间号 ${roomId}`}>#{roomId}</span>
          </span>
          <span className="home-room-subtitle" title={subtitle}>{subtitle}</span>
        </span>
      </button>
      {official ? (
        <span
          className="home-star is-active home-star-official"
          title="斗鱼特别关注"
          aria-label="斗鱼特别关注"
        >
          <Icon name="star" size={15} />
        </span>
      ) : (
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
      )}
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
  onRemoveHistory,
  onClearHistory,
}: HomePageProps): React.JSX.Element {
  const [isHistoryOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!isHistoryOpen) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setHistoryOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHistoryOpen]);

  const sortedFollowed = sortFollowedRooms(followed);
  const officialSpecials = followed.filter((room) => room.isSpecial);
  const officialKeys = new Set(officialSpecials.map((room) => specialFollowKey(room)));
  const manualSpecialRooms = resolveSpecialRooms(specials, followed).filter(
    (room) => !officialKeys.has(specialFollowKey(room)),
  );
  const specialCards = [
    ...officialSpecials.map((room) => ({ ...room, official: true, statusKnown: true })),
    ...manualSpecialRooms.map((room) => ({ ...room, official: false })),
  ].sort((left, right) => {
    if (right.heat !== left.heat) return right.heat - left.heat;
    if (left.official !== right.official) return left.official ? -1 : 1;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
  const specialKeys = new Set([
    ...officialKeys,
    ...specials.map((entry) => specialFollowKey(entry)),
  ]);
  const specialCount = specialCards.length;
  const visibleFollowed = sortedFollowed.filter(
    (room) => !specialKeys.has(specialFollowKey(room)),
  );
  const liveCount = followed.filter((room) => room.isLive).length;
  const accountIsActive = activeAccount?.status === 'active';

  return (
    <div className="home-page">
      <header className="home-summary" aria-label="首页统计">
        <div className="home-stats">
          <span>
            <strong>{visibleFollowed.length}</strong>
            关注
          </span>
          <span>
            <strong>{liveCount}</strong>
            直播
          </span>
          <span>
            <strong>{specialCount}</strong>
            特别关注
          </span>
          <span>
            <strong>{history.length}</strong>
            历史
          </span>
        </div>
        <button
          type="button"
          className="home-history-button"
          onClick={() => setHistoryOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={isHistoryOpen}
          aria-controls="room-history-panel"
          title="打开最近观看记录"
        >
          <Icon name="history" size={14} />
          历史记录
        </button>
      </header>

      <section className="home-section home-special-section" aria-labelledby="home-special-title">
        <header className="home-section-head">
          <div>
            <span className="home-kicker">PINNED</span>
            <h3 id="home-special-title">特别关注</h3>
          </div>
          <span className="home-section-count">{specialCount}</span>
        </header>

        {specialError ? <p className="home-inline-error">{specialError}</p> : null}

        {specialCards.length === 0 ? (
          <div className="home-pin-hint">
            <Icon name="star" size={17} />
            <span>斗鱼特别关注会自动显示；也可以在关注或最近观看里点星标补充。</span>
          </div>
        ) : (
          <div className="home-special-grid">
            {specialCards.map((room) => (
              <HomeRoomRow
                key={specialFollowKey(room)}
                platform={room.platform}
                roomId={room.roomId}
                name={room.name}
                title={room.title}
                cover={room.cover}
                isLive={room.isLive}
                hasVideo={room.hasVideo}
                showStatus={room.statusKnown}
                official={room.official}
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
          <div className="home-section-actions">
            <span className="home-section-count">{visibleFollowed.length}</span>
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
          </div>
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
        ) : visibleFollowed.length === 0 ? (
          <div className="home-empty">
            <Icon name="user" size={19} />
            <span>{sortedFollowed.length > 0 ? '关注的房间都在特别关注里' : '还没有关注'}</span>
            <small>
              {sortedFollowed.length > 0
                ? '特别关注优先显示，这里不再重复。'
                : '在斗鱼关注主播后，刷新这里就会出现。'}
            </small>
          </div>
        ) : (
          <div className="home-room-list" role="list">
            {visibleFollowed.map((room) => (
              <div role="listitem" key={roomKey(room.platform, room.roomId)}>
                <HomeRoomRow
                  platform={room.platform}
                  roomId={room.roomId}
                  name={room.name}
                  title={room.title}
                  cover={room.cover}
                  isLive={room.isLive}
                  hasVideo={room.hasVideo}
                  showStatus
                  official={officialKeys.has(specialFollowKey(room))}
                  pinned={specialKeys.has(specialFollowKey(room))}
                  onOpen={() => onOpen(room.platform, room.roomId)}
                  onToggle={() => onToggleSpecial(targetFromFollowed(room))}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {isHistoryOpen ? (
        <div
          className="home-history-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryOpen(false);
          }}
        >
          <aside className="home-history-drawer" aria-label="最近观看">
            <RoomHistoryPanel
              entries={history}
              onSelect={(entry) => {
                setHistoryOpen(false);
                onOpen(entry.platform, entry.roomId);
              }}
              onRemove={onRemoveHistory}
              onClear={onClearHistory}
              onClose={() => setHistoryOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
