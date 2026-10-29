import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DanmakuEvent } from '@shared/contracts/danmaku';
import { DanmakuEngine } from './DanmakuEngine';
import { DEFAULT_DANMAKU_SETTINGS } from './danmakuSettings';

class Element {
  style = {};
  className = '';
  textContent = '';
  children: Element[] = [];
  classList = { toggle: vi.fn() };
  clientWidth = 1000;
  clientHeight = 3000;
  removed = false;
  appendChild(child: Element) {
    this.children.push(child);
  }
  replaceChildren() {
    this.children = [];
  }
  setAttribute = vi.fn();
  remove() {
    this.removed = true;
  }
  getBoundingClientRect() {
    return { width: 10, left: 0 };
  }
  animate() {
    return { onfinish: null, cancel: vi.fn(), pause: vi.fn(), play: vi.fn(), playState: 'running' };
  }
}
let engine: DanmakuEngine;
let root: Element;
let tick: () => void;
function event(id: number): DanmakuEvent {
  return {
    id: String(id),
    timestamp: Date.now(),
    platform: 'douyu',
    roomId: '1',
    kind: 'chat',
    userId: '',
    nickname: '',
    text: String(id),
    color: '#fff',
    level: 1,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', {
    requestAnimationFrame: (callback: () => void) => {
      tick = callback;
      return 1;
    },
    cancelAnimationFrame: vi.fn(),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('document', { createElement: () => new Element() });
  root = new Element();
  engine = new DanmakuEngine(root as unknown as HTMLElement, DEFAULT_DANMAKU_SETTINGS);
});
afterEach(() => {
  engine.destroy();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function step() {
  vi.advanceTimersByTime(25);
  tick();
}
describe('danmaku overload protection', () => {
  it('sheds old backlog while preserving order within the newest batch', () => {
    for (let i = 0; i < 41; i++) engine.push(event(i));
    step();
    step();
    expect(root.children.map((node) => node.children[0]?.textContent)).toEqual(['17', '18']);
  });
  it('caps active animations even if animation finish callbacks are delayed', () => {
    for (let i = 0; i < 100; i++) {
      engine.push(event(i));
      step();
    }
    expect(root.children.filter((node) => !node.removed)).toHaveLength(60);
  });
  it('expires queued messages using elapsed time even after wall clock changes', () => {
    engine.push(event(1));
    vi.setSystemTime(Date.now() - 60_000);
    vi.advanceTimersByTime(2600);
    tick();
    expect(root.children).toHaveLength(0);
  });
  it('clears both queued and active messages before playback resumes', () => {
    engine.push(event(1));
    step();
    engine.push(event(2));
    engine.clear();
    step();
    expect(root.children.filter((node) => !node.removed)).toHaveLength(0);
  });
});

it('applies keyword edits to queued messages without removing active messages', () => {
  engine.push(event(1));
  step();
  engine.push(event(2));
  engine.push(event(3));
  engine.updateSettings({ ...DEFAULT_DANMAKU_SETTINGS, blockedKeywords: ['1', '2'] });
  step();
  step();
  expect(
    root.children.filter((node) => !node.removed).map((node) => node.children[0]?.textContent),
  ).toEqual(['1', '3']);
});
