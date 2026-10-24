import type { DanmakuEvent, DanmakuStatusEvent, DanmakuMessage } from '@shared/contracts/danmaku';
import {
  decodeDouyuPackets,
  encodeDouyuPacket,
  parseDouyuDanmaku,
} from '@shared/douyu/danmakuProtocol';

interface DouyuDanmakuClientOptions {
  roomId: string;
  onEvent: (event: DanmakuEvent) => void;
  onStatus: (status: DanmakuStatusEvent) => void;
}

const HEARTBEAT_MS = 40_000;
const RECONNECT_MS = 3_000;
const CONNECT_TIMEOUT_MS = 10_000;

export class DouyuDanmakuClient {
  private readonly roomId: string;
  private readonly onEvent: (event: DanmakuEvent) => void;
  private readonly onStatus: (status: DanmakuStatusEvent) => void;
  private ws: WebSocket | null = null;
  private heartbeat: number | null = null;
  private connectTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private sequence = 0;
  private closed = false;

  constructor(options: DouyuDanmakuClientOptions) {
    this.roomId = options.roomId;
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
    this.onStatus({
      roomId: this.roomId,
      platform: 'douyu',
      status: 'connecting',
    });

    const port = 8502 + Math.floor(Math.random() * 4);
    const ws = new WebSocket(`wss://danmuproxy.douyu.com:${port}`);
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
      ws.close();
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      this.clearConnectTimer();
      if (this.closed || this.ws !== ws) {
        ws.close();
        return;
      }
      this.send(`type@=loginreq/roomid@=${this.roomId}`);
      this.send(`type@=joingroup/rid@=${this.roomId}/gid@=-9999/`);
      this.startHeartbeat();
      this.onStatus({
        roomId: this.roomId,
        platform: 'douyu',
        status: 'connected',
      });
    };

    ws.onmessage = (event) => {
      if (!this.closed && this.ws === ws && event.data instanceof ArrayBuffer) {
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
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearConnectTimer();
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
      const message = parseDouyuDanmaku(payload, this.roomId);
      if (!message) continue;
      this.emit(message);
    }
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
      this.send('type@=mrkl/');
    }, HEARTBEAT_MS);
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
