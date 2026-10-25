import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import type HuyaListenerClass from 'huya-danma-listener';
import type { HuYaMessage } from 'huya-danma-listener';
import { IPC } from '@shared/contracts/ipc';
import type {
  DanmakuEvent,
  DanmakuStatusEvent,
  HuyaDanmakuUpdate,
} from '@shared/contracts/danmaku';

type HuyaListenerInstance = InstanceType<typeof HuyaListenerClass>;

interface HuyaSession {
  id: string;
  roomId: string;
  sender: WebContents;
  listener: HuyaListenerInstance | null;
  stopped: boolean;
  onSenderDestroyed: () => void;
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

interface HuyaOnlineMessage {
  type: 'online';
  time: number;
  count: number;
}

function normalizeColor(value: string): string {
  return COLOR_PATTERN.test(value) ? value.toLowerCase() : '#ffffff';
}

export function toHuyaEvent(
  roomId: string,
  message: HuYaMessage | HuyaOnlineMessage,
): DanmakuEvent | null {
  if (message.type !== 'chat' && message.type !== 'gift') return null;

  const from = message.from;
  if (!from) return null;

  const name = from.name.trim() || '虎牙用户';
  const userId = from.rid || '0';
  const timestamp = Number.isFinite(message.time) ? message.time : Date.now();
  const id = message.id.trim() || randomUUID();

  if (message.type === 'chat') {
    const text = message.content.trim();
    if (!text) return null;
    return {
      platform: 'huya',
      roomId,
      kind: 'chat',
      userId,
      nickname: name,
      text,
      color: normalizeColor(message.color),
      level: 0,
      id,
      timestamp,
    };
  }

  return {
    platform: 'huya',
    roomId,
    kind: 'gift',
    userId,
    nickname: name,
    text: `送出 ${message.count} 个 ${message.name}`,
    color: '#ffffff',
    level: 0,
    giftName: message.name,
    giftCount: message.count,
    id,
    timestamp,
  };
}

/**
 * Huya's chat gateway needs a JCE/WebSocket client that cannot run in the
 * sandboxed renderer. Keep one listener per renderer subscription in the main
 * process and forward only normalized messages.
 */
export class HuyaDanmakuSession {
  private readonly sessions = new Map<string, HuyaSession>();

  start(roomId: string, sender: WebContents): string {
    const id = randomUUID();
    const session: HuyaSession = {
      id,
      roomId,
      sender,
      listener: null,
      stopped: false,
      onSenderDestroyed: () => undefined,
    };
    session.onSenderDestroyed = () => this.stop(id);
    this.sessions.set(id, session);
    sender.once('destroyed', session.onSenderDestroyed);
    this.emitStatus(session, 'connecting');
    void this.launch(session);
    return id;
  }

  stop(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.stopped = true;
    this.sessions.delete(id);
    if (!session.sender.isDestroyed()) {
      session.sender.removeListener('destroyed', session.onSenderDestroyed);
    }
    try {
      session.listener?.stop();
    } catch {
      // The listener can fail before its socket exists; the session is gone.
    }
  }

  stopAll(): void {
    for (const id of [...this.sessions.keys()]) this.stop(id);
  }

  private async launch(session: HuyaSession): Promise<void> {
    try {
      const { default: HuyaListener } = await import('huya-danma-listener');
      if (session.stopped) return;

      const listener = new HuyaListener(session.roomId);
      session.listener = listener;
      listener.on('connect', () => this.emitStatus(session, 'connected'));
      listener.on('retry', () =>
        this.emitStatus(session, 'reconnecting', '虎牙弹幕连接异常，正在重连'),
      );
      listener.on('error', () =>
        this.emitStatus(session, 'reconnecting', '虎牙弹幕连接异常，正在重连'),
      );
      listener.on('close', () => this.emitStatus(session, 'disconnected'));
      listener.on('message', (message: HuYaMessage) => this.handleMessage(session, message));
      await listener.start();
    } catch {
      if (session.stopped) return;
      this.emitStatus(session, 'error', '虎牙弹幕连接失败');
      this.stop(session.id);
    }
  }

  private handleMessage(session: HuyaSession, message: HuYaMessage): void {
    const event = toHuyaEvent(session.roomId, message);
    if (event) this.send(session, { subscriptionId: session.id, event });
  }

  private emitStatus(
    session: HuyaSession,
    status: DanmakuStatusEvent['status'],
    message?: string,
  ): void {
    const event: DanmakuStatusEvent = {
      roomId: session.roomId,
      platform: 'huya',
      status,
      ...(message ? { message } : {}),
    };
    this.send(session, { subscriptionId: session.id, status: event });
  }

  private send(session: HuyaSession, update: HuyaDanmakuUpdate): void {
    if (session.stopped || session.sender.isDestroyed()) return;
    try {
      session.sender.send(IPC.danmakuHuyaUpdate, update);
    } catch {
      // The renderer can close between the check and send.
    }
  }
}
