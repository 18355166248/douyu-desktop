import { describe, expect, it, vi } from 'vitest';
import { DouyuAudienceResolver } from './DouyuAudienceResolver';

describe('DouyuAudienceResolver', () => {
  it('keeps unverified counters unknown instead of presenting placeholder zeroes', async () => {
    const request = vi.fn();
    const result = await new DouyuAudienceResolver({ request }).resolve(' 9999 ');

    expect(result).toMatchObject({ platform: 'douyu', roomId: '9999' });
    expect(result.metrics).toHaveLength(5);
    expect(result.metrics.every((metric) => metric.value === null)).toBe(true);
    expect(result.metrics.filter((metric) => metric.key.startsWith('active-'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'active-day', unit: '分' }),
        expect.objectContaining({ key: 'active-week', unit: '分' }),
        expect.objectContaining({ key: 'active-total', unit: '分' }),
      ]),
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects an empty room id and cancelled calls', async () => {
    const resolver = new DouyuAudienceResolver({ request: vi.fn() });
    await expect(resolver.resolve(' ')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const controller = new AbortController();
    controller.abort();
    await expect(resolver.resolve('9999', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
