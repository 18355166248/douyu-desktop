import type { DanmakuEvent, DanmakuStatusEvent, DanmakuMessage } from '@shared/contracts/danmaku';
import {
  decodeDouyuPackets,
  encodeDouyuPacket,
  parseDouyuDanmaku,
} from '@shared/douyu/danmakuProtocol';

interface DouyuDanmakuClientOptions {
  roomId: string;
  host: string;
  onEvent: (event: DanmakuEvent) => void;
  onStatus: (status: DanmakuStatusEvent) => void;
}

const HEARTBEAT_MS = 20_000;
const RECONNECT_MS = 3_000;
const CONNECT_TIMEOUT_MS = 10_000;
const RECEIVE_TIMEOUT_MS = 60_000;

export function buildDouyuVisitorLogin(roomId: string): string {
  const username = `visitor${Math.floor(1_000_000 + Math.random() * 9_000_000)}`;
  const uid = String(Math.floor(1_000_000_000 + Math.random() * 900_000_000));
  return [
    'type@=loginreq',
    `roomid@=${roomId}`,
    'dfl@=sn@AA=105@ASss@AA=1',
    `username@=${username}`,
    `uid@=${uid}`,
    'ver@=20220825',
    'aver@=218101901',
    'ct@=0',
    '',
  ].join('/');
}

export class DouyuDanmakuClient {
  private readonly roomId: string;
  private readonly host: string;
  private readonly onEvent: (event: DanmakuEvent) => void;
  private readonly onStatus: (status: DanmakuStatusEvent) => void;
  private ws: WebSocket | null = null;
  private heartbeat: number | null = null;
  private connectTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private sequence = 0;
  private closed = false;
  private joined = false;
  private lastReceivedAt = 0;
  private joinTimer: number | null = null;

  constructor(options: DouyuDanmakuClientOptions) {
    this.roomId = options.roomId;
    this.host = options.host;
    this.onEvent = options.onEvent;
    this.onStatus = options.onStatus;
  }

  connect(): void {
    if (this.closed || this.ws) return;
    this.open();
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    this.clearConnectTimer();
    this.clearJoinTimer();
    this.clearReconnect();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    }
    this.onStatus({
      roomId: this.roomId,
      platform: 'douyu',
      status: 'disconnected',
    });
  }

  private open(): void {
    if (this.closed) return;

    this.clearReconnect();
    this.clearConnectTimer();
    this.clearJoinTimer();
    this.joined = false;
    this.onStatus({
      roomId: this.roomId,
      platform: 'douyu',
      status: 'connecting',
    });

    const host = this.host.replace(/\/+$/, '');
    const ws = new WebSocket(`wss://${host}/`);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';

    this.connectTimer = window.setTimeout(() => {
      this.connectTimer = null;
      if (this.closed || this.ws !== ws || ws.readyState === WebSocket.OPEN) return;
      this.onStatus({
        roomId: this.roomId,
        platform: 'douyu',
        status: 'error',
        message: '弹幕连接超时',
      });
      this.reconnect();
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      this.clearConnectTimer();
      if (this.closed || this.ws !== ws) {
        ws.close();
        return;
      }
      this.send(buildDouyuVisitorLogin(this.roomId));
      this.lastReceivedAt = Date.now();
      this.startHeartbeat();
      // The gateway normally replies with loginres; keep a fallback so a
      // non-gateway proxy still receives a joingroup.
      this.joinTimer = window.setTimeout(() => this.joinGroup(), 3_000);
      this.onStatus({
        roomId: this.roomId,
        platform: 'douyu',
        status: 'connected',
      });
    };

    ws.onmessage = (event) => {
      if (!this.closed && this.ws === ws && event.data instanceof ArrayBuffer) {
        this.lastReceivedAt = Date.now();
        this.handleFrame(event.data);
      }
    };

    ws.onerror = () => {
      if (this.closed || this.ws !== ws) return;
      this.onStatus({
        roomId: this.roomId,
        platform: 'douyu',
        status: 'error',
        message: '弹幕连接失败',
      });
      this.reconnect();
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearConnectTimer();
      this.clearJoinTimer();
      this.joined = false;
      this.stopHeartbeat();
      if (this.closed) return;
      this.onStatus({
        roomId: this.roomId,
        platform: 'douyu',
        status: 'reconnecting',
        message: '弹幕连接已断开，正在重连',
      });
      this.scheduleReconnect();
    };
  }

  private handleFrame(data: ArrayBuffer): void {
    for (const payload of decodeDouyuPackets(new Uint8Array(data))) {
      if (payload.includes('type@=loginres/')) {
        this.joinGroup();
      }
      const message = parseDouyuDanmaku(payload, this.roomId);
      if (!message) continue;
      this.emit(message);
    }
  }

  private joinGroup(): void {
    if (this.joined || this.closed) return;
    this.joined = true;
    this.clearJoinTimer();
    this.send(`type@=joingroup/rid@=${this.roomId}/gid@`);
    this.send('type@=mr');
    this.send('type@=sub/mt@=o');
  }

  private emit(message: DanmakuMessage): void {
    this.sequence += 1;
    this.onEvent({
      ...message,
      id: `douyu-${this.roomId}-${Date.now().toString(36)}-${this.sequence}`,
      timestamp: Date.now(),
    });
  }

  private send(payload: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(encodeDouyuPacket(payload));
      } catch {
        // The socket can close between the readyState check and send().
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = window.setInterval(() => {
      // 半开连接不一定触发 onclose；心跳期间长期收不到任何帧则主动换连接。
      if (Date.now() - this.lastReceivedAt >= RECEIVE_TIMEOUT_MS) {
        this.reconnect();
        return;
      }
      this.send('type@=mr');
    }, HEARTBEAT_MS);
  }

  private reconnect(): void {
    if (this.closed) return;
    const ws = this.ws;
    this.ws = null;
    this.stopHeartbeat();
    this.clearConnectTimer();
    this.clearJoinTimer();
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
    }
    this.onStatus({ roomId: this.roomId, platform: 'douyu', status: 'reconnecting' });
    this.scheduleReconnect();
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      window.clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private clearJoinTimer(): void {
    if (this.joinTimer !== null) {
      window.clearTimeout(this.joinTimer);
      this.joinTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.open();
    }, RECONNECT_MS);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
