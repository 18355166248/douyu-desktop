import type { DanmakuEvent } from '@shared/contracts/danmaku';
import type { DanmakuSettings } from './danmakuSettings';

export const LARGE_DANMAKU_LEVEL = 30;

function isRoleMessage(event: DanmakuEvent): boolean {
  return event.isNoble === true || event.isRoomAdmin === true || event.isSuper === true;
}

export function shouldRenderDanmaku(event: DanmakuEvent, settings: DanmakuSettings): boolean {
  if (event.kind === 'enter') return settings.showEnter;
  if (event.kind === 'gift') return settings.showGift;

  // 只过滤聊天正文，使用字面包含匹配，避免把用户输入当成正则表达式。
  if (settings.blockedKeywords.some((word) => event.text.toLowerCase().includes(word)))
    return false;

  if (settings.simplified && event.hasDms !== true) return false;
  if (settings.blockSuper && event.isSuper === true) return false;
  if (settings.blockRole && isRoleMessage(event)) return false;
  if (settings.blockLarge && event.level >= LARGE_DANMAKU_LEVEL) return false;

  const position = event.position ?? 'scroll';
  if (settings.blockTop && position === 'top') return false;
  if (settings.blockBottom && position === 'bottom') return false;
  return true;
}
