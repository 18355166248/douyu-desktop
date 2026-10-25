import type { StreamPlatform } from './stream';

export const MAX_SPECIAL_FOLLOWS = 50;

export interface SpecialFollowEntry {
  platform: StreamPlatform;
  roomId: string;
  name: string;
  title: string;
  /** HTTPS room cover captured when the room was pinned. */
  cover?: string | undefined;
  /** Epoch milliseconds when the room was pinned. */
  addedAt: number;
}

/** Renderer request; `addedAt` is assigned by the main-process store. */
export interface SpecialFollowTarget {
  platform: StreamPlatform;
  roomId: string;
  name?: string | undefined;
  title?: string | undefined;
  cover?: string | undefined;
}
