import type { StreamPlatform } from './stream';

/** 搜索关键词上限，避免把超长文本拼进上游请求。 */
export const MAX_SEARCH_KEYWORD_LENGTH = 40;
/** 单次搜索展示的结果上限（主播 + 直播间去重后）。 */
export const MAX_SEARCH_RESULTS = 30;

/** 结果命中来源：主播名命中，还是直播间标题/分区命中。 */
export type RoomSearchMatch = 'anchor' | 'room';

export interface RoomSearchItem {
  platform: StreamPlatform;
  roomId: string;
  /** 主播昵称。 */
  name: string;
  /** 直播间标题。 */
  title: string;
  isLive: boolean;
  /** 主播正在轮播录像（斗鱼 videoLoop / isLoop）。 */
  hasVideo: boolean;
  /** 归一化后的热度，斗鱼返回的「150.7万」会换算成 1507000。 */
  heat: number;
  /** 命中来源，用于在结果里标注「主播」或「直播间」。 */
  match: RoomSearchMatch;
  /** 分区名，如「英雄联盟」。 */
  category?: string | undefined;
  /** 16:9 直播间封面。 */
  cover?: string | undefined;
  /** 粉丝数的展示文本，如「1899.9万」。 */
  fansText?: string | undefined;
}

export interface RoomSearchInput {
  query: string;
}

export interface RoomSearchResult {
  /** 回显关键词，方便渲染层丢弃过期响应。 */
  query: string;
  items: RoomSearchItem[];
}
