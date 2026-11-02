/**
 * Chromium 的 `session.fetch` 会拦掉「跨域 + 带路径的 Referer 头」：
 * 请求直接失败为 `net::ERR_BLOCKED_BY_CLIENT`（fetch 规范里 Referer 是禁用头，
 * 跨域时只能降级成源）。斗鱼/虎牙的开播状态接口都是跨源带路径 Referer，
 * 于是整条请求被 block、状态接口静默失败。
 *
 * 解决方式是改走 fetch 的 `referrer` 选项：Chromium 会按 referrer policy 处理它，
 * 跨域降级到源、同源保留完整路径，两种接口都能拿到数据。
 */
export interface SplitReferrerHeaders {
  headers: Record<string, string>;
  referrer: string | undefined;
}

export function extractReferrer(headers: Record<string, string> | undefined): SplitReferrerHeaders {
  if (!headers) return { headers: {}, referrer: undefined };

  const rest: Record<string, string> = {};
  let referrer: string | undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'referer') {
      referrer = value;
      continue;
    }
    rest[key] = value;
  }
  return { headers: rest, referrer };
}
