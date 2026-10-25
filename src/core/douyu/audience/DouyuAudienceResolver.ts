import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import type { RoomAudienceSnapshot } from '@shared/contracts/audience';

/**
 * Keep unsupported counters explicit. Douyu's server-rendered room page starts
 * the VIP and diamond-fan tabs at zero before their asynchronous data arrives,
 * so those HTML placeholders must never be treated as measured counts.
 */
export class DouyuAudienceResolver {
  constructor(_http: HttpClient) {}

  async resolve(roomId: string, signal?: AbortSignal): Promise<RoomAudienceSnapshot> {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) throw new AppError('INVALID_INPUT', '请输入斗鱼房间号');
    signal?.throwIfAborted();

    return {
      platform: 'douyu',
      roomId: normalizedRoomId,
      fetchedAt: Date.now(),
      metrics: [
        {
          key: 'vip',
          label: '贵宾',
          value: null,
          unit: '人',
          description: '尚未获取到可核实的斗鱼贵宾人数。',
        },
        {
          key: 'active-day',
          label: '日活跃',
          value: null,
          unit: '分',
          description: '斗鱼活跃榜按互动活跃度排序，不代表活跃人数；暂未获取到房间汇总值。',
        },
        {
          key: 'active-week',
          label: '周活跃',
          value: null,
          unit: '分',
          description: '斗鱼活跃榜按互动活跃度排序，不代表活跃人数；暂未获取到房间汇总值。',
        },
        {
          key: 'active-total',
          label: '总活跃',
          value: null,
          unit: '分',
          description: '暂未获取到可核实的斗鱼总活跃度汇总值。',
        },
        {
          key: 'diamond-fans',
          label: '钻石粉丝',
          value: null,
          unit: '人',
          description: '尚未获取到可核实的斗鱼钻石粉丝人数。',
        },
      ],
    };
  }
}
