import type { DanmakuEvent } from '@shared/contracts/danmaku';
import { LARGE_DANMAKU_LEVEL, shouldRenderDanmaku } from './danmakuFilter';
import { computeDanmakuGeometry, remapLane } from './danmakuLayout';
import type { DanmakuGeometry } from './danmakuLayout';
import type { DanmakuSettings } from './danmakuSettings';

const BASE_SPEED_PX_PER_SECOND = 100;
const ENTRY_GAP_PX = 18;
const MAX_QUEUE = 120;
const SPAWN_INTERVAL_MS = 70;
const GEOMETRY_RESYNC_MS = 200;

interface ActiveItem {
  element: HTMLElement;
  animation: Animation;
  event: DanmakuEvent;
  lane: number;
  laneCount: number;
  baseSpeed: number;
}

export class DanmakuEngine {
  private readonly container: HTMLElement;
  private settings: DanmakuSettings;
  private readonly active: ActiveItem[] = [];
  private queue: DanmakuEvent[] = [];
  private readonly laneBusyUntil: number[] = [];
  private laneCursor = 0;
  private lastSpawnAt = Number.NEGATIVE_INFINITY;
  private pausedAt: number | null = null;
  private readonly resizeObserver: ResizeObserver;
  private frameId: number | null = null;
  private lastSize = '';
  private geometryTimer: number | null = null;
  private destroyed = false;

  constructor(container: HTMLElement, settings: DanmakuSettings) {
    this.container = container;
    this.settings = settings;
    if (settings.paused) this.pausedAt = performance.now();
    this.applyPresentation();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.frameId = window.requestAnimationFrame(this.tick);
  }

  push(event: DanmakuEvent): void {
    // Gifts have their own bottom-left feed; never mix them into the flying layer.
    if (event.kind === 'gift') return;
    if (!this.settings.visible || !shouldRenderDanmaku(event, this.settings)) return;
    this.queue.push(event);
    if (this.queue.length > MAX_QUEUE) {
      this.queue.splice(0, this.queue.length - MAX_QUEUE);
    }
  }

  updateSettings(next: DanmakuSettings): void {
    const previous = this.settings;
    this.settings = next;
    this.applyPresentation();

    if (!next.visible) this.queue = [];

    const layoutChanged =
      previous.area !== next.area ||
      previous.fontScale !== next.fontScale ||
      previous.density !== next.density;
    const contentChanged =
      previous.showBadges !== next.showBadges || previous.showNickname !== next.showNickname;
    const filterChanged =
      previous.blockLarge !== next.blockLarge ||
      previous.blockTop !== next.blockTop ||
      previous.blockBottom !== next.blockBottom ||
      previous.blockRole !== next.blockRole ||
      previous.blockSuper !== next.blockSuper ||
      previous.simplified !== next.simplified ||
      previous.showEnter !== next.showEnter ||
      previous.showGift !== next.showGift;

    if (layoutChanged) this.relayout(previous.fontScale !== next.fontScale);
    if (contentChanged) this.refreshActiveContent();
    if (filterChanged) this.filterQueue();
    if (previous.speed !== next.speed) this.syncPlaybackRates();

    if (previous.paused !== next.paused) {
      if (next.paused) this.pauseAnimations();
      else this.resumeAnimations();
    }
  }

  clear(): void {
    this.cancelGeometryTimer();
    for (const item of [...this.active]) {
      item.animation.onfinish = null;
      item.animation.cancel();
      item.element.remove();
    }
    this.active.length = 0;
    this.queue = [];
    this.laneBusyUntil.length = 0;
    this.laneCursor = 0;
    this.lastSpawnAt = Number.NEGATIVE_INFINITY;
    this.pausedAt = null;
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver.disconnect();
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.clear();
  }

  private applyPresentation(): void {
    this.container.style.visibility = this.settings.visible ? 'visible' : 'hidden';
    this.container.style.opacity = String(this.settings.opacity / 100);
    this.container.classList.toggle('is-paused', this.settings.paused);
  }

  private handleResize(): void {
    const size = `${this.container.clientWidth}x${this.container.clientHeight}`;
    if (size === this.lastSize) return;
    this.lastSize = size;
    this.relayout(false);
    this.resyncAnimations();
  }

  private tick = (): void => {
    if (this.destroyed) return;
    if (this.settings.visible && !this.settings.paused) this.drainQueue();
    this.frameId = window.requestAnimationFrame(this.tick);
  };

  private geometry(): DanmakuGeometry {
    return computeDanmakuGeometry({
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      area: this.settings.area,
      fontScale: this.settings.fontScale,
      density: this.settings.density,
    });
  }

  private speed(): number {
    return BASE_SPEED_PX_PER_SECOND * (this.settings.speed / 100);
  }

  private drainQueue(): void {
    if (this.queue.length === 0) return;
    const now = performance.now();
    if (now - this.lastSpawnAt < SPAWN_INTERVAL_MS) return;

    const geometry = this.geometry();
    if (geometry.width < 1 || geometry.height < 1) return;

    this.ensureLaneSlots(geometry.laneCount);
    const lane = this.pickLane(now);
    if (lane < 0) return;

    const event = this.queue[0];
    if (!event) return;

    const element = this.createElement(event, geometry.fontSize);
    this.container.appendChild(element);
    const width = element.getBoundingClientRect().width;

    if (width < 1) {
      element.remove();
      this.queue.shift();
      return;
    }

    this.queue.shift();
    this.launch(element, event, width, lane, geometry, now);
    this.lastSpawnAt = now;
  }

  private ensureLaneSlots(count: number): void {
    while (this.laneBusyUntil.length < count) this.laneBusyUntil.push(0);
    if (this.laneBusyUntil.length > count) this.laneBusyUntil.length = count;
  }

  private pickLane(now: number): number {
    const count = this.laneBusyUntil.length;
    if (count === 0) return -1;
    const start = this.laneCursor % count;

    for (let offset = 0; offset < count; offset += 1) {
      const lane = (start + offset) % count;
      if ((this.laneBusyUntil[lane] ?? 0) <= now) {
        this.laneCursor = (lane + 1) % count;
        return lane;
      }
    }
    return -1;
  }

  private launch(
    element: HTMLElement,
    event: DanmakuEvent,
    width: number,
    lane: number,
    geometry: DanmakuGeometry,
    now: number,
  ): void {
    const top = geometry.top + lane * geometry.laneHeight;
    const textTop = top + Math.max(0, (geometry.laneHeight - geometry.fontSize) / 2);
    const speed = this.speed();
    const distance = geometry.width + width + ENTRY_GAP_PX * 2;
    const duration = (distance / speed) * 1000;
    const gap = geometry.gap + geometry.fontSize * 0.5;

    element.style.top = `${textTop}px`;
    element.style.transform = `translateX(${geometry.width + ENTRY_GAP_PX}px)`;

    const animation = element.animate(
      [
        { transform: `translateX(${geometry.width + ENTRY_GAP_PX}px)` },
        { transform: `translateX(${-width - ENTRY_GAP_PX}px)` },
      ],
      { duration, easing: 'linear', fill: 'forwards' },
    );

    this.laneBusyUntil[lane] = now + ((width + gap) / speed) * 1000;

    const item: ActiveItem = {
      element,
      animation,
      event,
      lane,
      laneCount: geometry.laneCount,
      baseSpeed: speed,
    };
    this.active.push(item);
    this.bindFinish(item);

    if (this.settings.paused) animation.pause();
  }

  private bindFinish(item: ActiveItem): void {
    const animation = item.animation;
    animation.onfinish = () => {
      animation.onfinish = null;
      item.element.remove();
      const index = this.active.indexOf(item);
      if (index >= 0) this.active.splice(index, 1);
    };
  }

  private removeItem(item: ActiveItem): void {
    item.animation.onfinish = null;
    item.animation.cancel();
    item.element.remove();
    const index = this.active.indexOf(item);
    if (index >= 0) this.active.splice(index, 1);
  }

  private relayout(fontChanged: boolean): void {
    const geometry = this.geometry();
    if (geometry.width < 1 || geometry.height < 1) return;

    this.ensureLaneSlots(geometry.laneCount);
    const ordered = this.active
      .map((item) => ({
        item,
        desired: remapLane(item.lane, item.laneCount, geometry.laneCount),
      }))
      .sort((left, right) => left.desired - right.desired || left.item.lane - right.item.lane);
    const usage = new Array<number>(geometry.laneCount).fill(0);

    for (const entry of ordered) {
      let lane = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let candidate = 0; candidate < geometry.laneCount; candidate += 1) {
        const load = usage[candidate] ?? 0;
        const score = load * (geometry.laneCount + 1) + Math.abs(candidate - entry.desired);
        if (score < bestScore) {
          bestScore = score;
          lane = candidate;
        }
      }

      usage[lane] = (usage[lane] ?? 0) + 1;
      entry.item.lane = lane;
      entry.item.laneCount = geometry.laneCount;
      const top = geometry.top + lane * geometry.laneHeight;
      const textTop = top + Math.max(0, (geometry.laneHeight - geometry.fontSize) / 2);
      entry.item.element.style.fontSize = `${geometry.fontSize}px`;
      entry.item.element.style.top = `${textTop}px`;
    }

    this.laneCursor = 0;
    this.reserveLanes(geometry, performance.now());
    if (fontChanged) this.scheduleGeometryResync();
  }

  private scheduleGeometryResync(): void {
    if (this.active.length === 0) return;
    this.cancelGeometryTimer();
    this.geometryTimer = window.setTimeout(() => {
      this.geometryTimer = null;
      if (!this.destroyed) this.resyncAnimations();
    }, GEOMETRY_RESYNC_MS);
  }

  private cancelGeometryTimer(): void {
    if (this.geometryTimer === null) return;
    window.clearTimeout(this.geometryTimer);
    this.geometryTimer = null;
  }

  /**
   * Re-enter active animations at their current position. This is used after a
   * font-size change: the rendered width changes, so the old destination is no
   * longer far enough left and would remove the message while still visible.
   */
  private resyncAnimations(): void {
    const geometry = this.geometry();
    if (geometry.width < 1 || geometry.height < 1) return;

    const trackLeft = this.container.getBoundingClientRect().left;
    const speed = this.speed();
    for (const item of [...this.active]) {
      const rect = item.element.getBoundingClientRect();
      const width = rect.width;
      if (width < 1) continue;

      const currentX = rect.left - trackLeft;
      const endX = -width - ENTRY_GAP_PX;
      if (currentX <= endX) {
        this.removeItem(item);
        continue;
      }

      const duration = Math.max(16, ((currentX - endX) / speed) * 1000);
      const previous = item.animation;
      previous.onfinish = null;
      previous.cancel();
      item.element.style.transform = `translateX(${currentX}px)`;

      const animation = item.element.animate(
        [
          { transform: `translateX(${currentX}px)` },
          { transform: `translateX(${endX}px)` },
        ],
        { duration, easing: 'linear', fill: 'forwards' },
      );
      item.animation = animation;
      item.baseSpeed = speed;
      this.bindFinish(item);
      if (this.settings.paused) animation.pause();
    }

    this.reserveLanes(geometry, performance.now());
  }

  /**
   * A lane is reserved until the trailing edge of the last message has entered
   * the viewport (plus the configured gap). Recomputing this from the DOM keeps
   * spawning correct after speed, font-size or area changes.
   */
  private reserveLanes(geometry: DanmakuGeometry, now: number): void {
    this.ensureLaneSlots(geometry.laneCount);
    this.laneBusyUntil.fill(0);
    if (this.active.length === 0 || geometry.width < 1) return;

    const trackLeft = this.container.getBoundingClientRect().left;
    const speed = this.speed();
    for (const item of this.active) {
      const rect = item.element.getBoundingClientRect();
      const right = rect.left - trackLeft + rect.width;
      const overflow = right - (geometry.width - geometry.gap);
      const busy = overflow > 0 ? now + (overflow / speed) * 1000 : now;
      const lane = Math.min(geometry.laneCount - 1, Math.max(0, item.lane));
      this.laneBusyUntil[lane] = Math.max(this.laneBusyUntil[lane] ?? 0, busy);
    }

    if (geometry.laneCount > 0) this.laneCursor %= geometry.laneCount;
  }

  private refreshActiveContent(): void {
    if (this.active.length === 0) return;
    for (const item of this.active) this.renderContent(item.element, item.event);
    this.resyncAnimations();
  }

  private filterQueue(): void {
    if (this.queue.length === 0) return;
    this.queue = this.queue.filter((event) => shouldRenderDanmaku(event, this.settings));
  }

  private syncPlaybackRates(): void {
    const speed = this.speed();
    for (const item of this.active) {
      item.animation.playbackRate = speed / item.baseSpeed;
    }
    this.reserveLanes(this.geometry(), performance.now());
  }

  private createElement(event: DanmakuEvent, fontSize: number): HTMLElement {
    const element = document.createElement('div');
    element.className = [
      'danmaku-item',
      `is-${event.kind}`,
      event.isNoble === true ? 'is-noble' : '',
      event.isRoomAdmin === true ? 'is-admin' : '',
      event.isSuper === true ? 'is-super' : '',
      event.kind === 'chat' && event.level >= LARGE_DANMAKU_LEVEL ? 'is-large' : '',
    ]
      .filter(Boolean)
      .join(' ');
    element.setAttribute('aria-hidden', 'true');
    // Must be set before measuring: the inherited font size is smaller and would
    // make the lane reservation too short, causing messages to overlap.
    element.style.fontSize = `${fontSize}px`;
    this.renderContent(element, event);
    return element;
  }

  private renderContent(element: HTMLElement, event: DanmakuEvent): void {
    element.replaceChildren();

    if (this.settings.showBadges && event.badgeName) {
      const badge = document.createElement('span');
      badge.className = 'danmaku-badge';
      badge.textContent = event.badgeName;
      if (event.badgeLevel) {
        const level = document.createElement('i');
        level.textContent = String(event.badgeLevel);
        badge.appendChild(level);
      }
      element.appendChild(badge);
    }

    if (this.settings.showNickname && event.nickname) {
      const nickname = document.createElement('span');
      nickname.className = 'danmaku-nick';
      nickname.textContent = event.nickname;
      element.appendChild(nickname);
    }

    const text = document.createElement('span');
    const isRainbow = event.kind === 'chat' && event.color === 'rainbow';
    text.className = isRainbow ? 'danmaku-text is-rainbow' : 'danmaku-text';
    text.textContent = event.text;
    if (event.kind === 'chat' && !isRainbow) text.style.color = event.color;
    element.appendChild(text);
  }

  private pauseAnimations(): void {
    if (this.pausedAt === null) this.pausedAt = performance.now();
    for (const item of this.active) {
      if (item.animation.playState === 'running') item.animation.pause();
    }
  }

  private resumeAnimations(): void {
    if (this.pausedAt !== null) {
      const pauseDuration = Math.max(0, performance.now() - this.pausedAt);
      for (let lane = 0; lane < this.laneBusyUntil.length; lane += 1) {
        this.laneBusyUntil[lane] = (this.laneBusyUntil[lane] ?? 0) + pauseDuration;
      }
      this.pausedAt = null;
    }

    for (const item of this.active) {
      if (item.animation.playState === 'paused') item.animation.play();
    }
  }
}
