/**
 * Chromium 的 `session.fetch` 会拦掉「跨域 + 带路径的 Referer 头」：
 * 请求直接失败为 `net::ERR_BLOCKED_BY_CLIENT`（fetch 规范里 Referer 是禁用头，
 * 跨域时只能降级成源）。斗鱼/虎牙的开播状态接口都是跨源带路径 Referer，
 * 于是整条请求被 block、状态接口静默失败。
 *
 * 跨源请求改走 fetch 的 `referrer` 选项。同源接口保留 Referer 请求头：
 * 主进程没有页面来源，session.fetch 的 referrer 选项不会可靠地发送它，
 * 斗鱼仓库/赠送接口因此返回 403「非法请求」。
 */
export interface SplitReferrerHeaders {
  headers: Record<string, string>;
  referrer: string | undefined;
}

export function extractReferrer(
  headers: Record<string, string> | undefined,
  requestUrl?: string,
): SplitReferrerHeaders {
  if (!headers) return { headers: {}, referrer: undefined };

  const rest: Record<string, string> = {};
  let referrer: string | undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'referer') {
      if (requestUrl && isSameOrigin(value, requestUrl)) {
        rest[key] = value;
        continue;
      }
      referrer = value;
      continue;
    }
    rest[key] = value;
  }
  return { headers: rest, referrer };
}

function isSameOrigin(referrer: string, requestUrl: string): boolean {
  try {
    return new URL(referrer).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}
