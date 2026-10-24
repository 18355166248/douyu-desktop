import type { DanmakuEvent } from '@shared/contracts/danmaku';
import { LARGE_DANMAKU_LEVEL, shouldRenderDanmaku } from './danmakuFilter';
import { computeDanmakuGeometry } from './danmakuLayout';
import type { DanmakuGeometry } from './danmakuLayout';
import type { DanmakuSettings } from './danmakuSettings';

const BASE_SPEED_PX_PER_SECOND = 100;
const ENTRY_GAP_PX = 14;
const MAX_QUEUE = 120;
const MAX_SPAWN_PER_FRAME = 3;

interface ActiveItem {
  element: HTMLElement;
  animation: Animation;
}

export class DanmakuEngine {
  private readonly container: HTMLElement;
  private settings: DanmakuSettings;
  private readonly active: ActiveItem[] = [];
  private queue: DanmakuEvent[] = [];
  private readonly laneBusyUntil: number[] = [];
  private readonly resizeObserver: ResizeObserver;
  private frameId: number | null = null;
  private lastSize = '';
  private destroyed = false;

  constructor(container: HTMLElement, settings: DanmakuSettings) {
    this.container = container;
    this.settings = settings;
    this.applyPresentation();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.frameId = window.requestAnimationFrame(this.tick);
  }

  push(event: DanmakuEvent): void {
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

    if (!next.visible) {
      this.clear();
      return;
    }

    const layoutChanged =
      previous.area !== next.area ||
      previous.fontScale !== next.fontScale ||
      previous.density !== next.density;
    const contentChanged =
      previous.blockLarge !== next.blockLarge ||
      previous.blockTop !== next.blockTop ||
      previous.blockBottom !== next.blockBottom ||
      previous.blockRole !== next.blockRole ||
      previous.blockSuper !== next.blockSuper ||
      previous.simplified !== next.simplified ||
      previous.showBadges !== next.showBadges ||
      previous.showNickname !== next.showNickname ||
      previous.showEnter !== next.showEnter ||
      previous.showGift !== next.showGift;

    if (layoutChanged || contentChanged) this.clear();

    if (previous.paused !== next.paused) {
      if (next.paused) this.pauseAnimations();
      else this.resumeAnimations();
    }
  }

  clear(): void {
    for (const item of this.active) {
      item.animation.onfinish = null;
      item.animation.cancel();
      item.element.remove();
    }
    this.active.length = 0;
    this.queue = [];
    this.laneBusyUntil.length = 0;
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
    this.clear();
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

  private drainQueue(): void {
    if (this.queue.length === 0) return;
    const geometry = this.geometry();
    if (geometry.width < 1 || geometry.height < 1) return;

    this.ensureLaneSlots(geometry.laneCount);
    let spawned = 0;

    while (this.queue.length > 0 && spawned < MAX_SPAWN_PER_FRAME) {
      const event = this.queue[0];
      if (!event) break;

      const element = this.createElement(event);
      this.container.appendChild(element);
      const width = element.getBoundingClientRect().width;

      if (width < 1) {
        element.remove();
        this.queue.shift();
        continue;
      }

      const now = performance.now();
      const lane = this.pickLane(now);
      if (lane < 0) {
        element.remove();
        break;
      }

      this.queue.shift();
      this.launch(element, width, lane, geometry, now);
      spawned += 1;
    }
  }

  private ensureLaneSlots(count: number): void {
    while (this.laneBusyUntil.length < count) this.laneBusyUntil.push(0);
    if (this.laneBusyUntil.length > count) this.laneBusyUntil.length = count;
  }

  private pickLane(now: number): number {
    for (let lane = 0; lane < this.laneBusyUntil.length; lane += 1) {
      if ((this.laneBusyUntil[lane] ?? 0) <= now) return lane;
    }
    return -1;
  }

  private launch(
    element: HTMLElement,
    width: number,
    lane: number,
    geometry: DanmakuGeometry,
    now: number,
  ): void {
    const top = geometry.top + lane * geometry.laneHeight;
    const textTop = top + Math.max(0, (geometry.laneHeight - geometry.fontSize) / 2);
    const speed = BASE_SPEED_PX_PER_SECOND * (this.settings.speed / 100);
    const distance = geometry.width + width + ENTRY_GAP_PX * 2;
    const duration = (distance / speed) * 1000;

    element.style.top = `${textTop}px`;
    element.style.fontSize = `${geometry.fontSize}px`;
    element.style.transform = `translateX(${geometry.width + ENTRY_GAP_PX}px)`;

    const animation = element.animate(
      [
        { transform: `translateX(${geometry.width + ENTRY_GAP_PX}px)` },
        { transform: `translateX(${-width - ENTRY_GAP_PX}px)` },
      ],
      { duration, easing: 'linear', fill: 'forwards' },
    );

    this.laneBusyUntil[lane] = now + ((width + geometry.gap) / speed) * 1000;

    const item: ActiveItem = { element, animation };
    this.active.push(item);

    animation.onfinish = () => {
      element.remove();
      const index = this.active.indexOf(item);
      if (index >= 0) this.active.splice(index, 1);
    };

    if (this.settings.paused) animation.pause();
  }

  private createElement(event: DanmakuEvent): HTMLElement {
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
    text.className = 'danmaku-text';
    text.textContent = event.text;
    if (event.kind === 'chat') text.style.color = event.color;
    element.appendChild(text);

    return element;
  }

  private pauseAnimations(): void {
    for (const item of this.active) {
      if (item.animation.playState === 'running') item.animation.pause();
    }
  }

  private resumeAnimations(): void {
    for (const item of this.active) {
      if (item.animation.playState === 'paused') item.animation.play();
    }
  }
}
