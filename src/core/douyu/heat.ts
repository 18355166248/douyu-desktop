/**
 * 斗鱼把热度写成「150.7万」「1.2亿」这样的字符串，也可能直接给数字。
 * 统一换算成整数，非法值按 0 处理。
 */
export function parseDouyuHeat(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value !== 'string') return 0;
  const text = value.trim().replace(/[\s,]/g, '');
  const match = /^(\d+(?:\.\d+)?)(万|亿)?$/.exec(text);
  const digits = match?.[1];
  if (!digits) return 0;
  const multiplier = match?.[2] === '亿' ? 100_000_000 : match?.[2] === '万' ? 10_000 : 1;
  const heat = Math.round(Number(digits) * multiplier);
  return Number.isFinite(heat) ? heat : 0;
}
