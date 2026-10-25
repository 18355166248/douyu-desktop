import type { DanmakuEvent, DanmakuStatusEvent } from '@shared/contracts/danmaku';
import {
  BILIBILI_OP_AUTH,
  BILIBILI_OP_AUTH_REPLY,
  BILIBILI_OP_HEARTBEAT,
  BILIBILI_OP_MESSAGE,
  BILIBILI_PROTOCOL_VERSION_ZLIB,
  decodeBilibiliPackets,
  decodeBilibiliText,
  encodeBilibiliPacket,
  parseBilibiliCommand,
} from '@shared/bilibili/danmakuProtocol';

const HEARTBEAT_INTERVAL_MS = 30_000;
const AUTH_TIMEOUT_MS = 10_000;
const RECONNECT_DELAY_MS = 3_000;

interface BilibiliDanmakuClientOptions {
  roomId: string;
  host: string;
  token: string;
  onEvent: (event: DanmakuEvent) => void;
  onStatus: (status: DanmakuStatusEvent) => void;
}

export class BilibiliDanmakuClient {
  private readonly roomId: string;
  private readonly host: string;
  private readonly token: string;
  private readonly onEvent: (event: DanmakuEvent) => void;
  private readonly onStatus: (status: DanmakuStatusEvent) => void;
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private hasConnected = false;

  constructor(options: BilibiliDanmakuClientOptions) {
    this.roomId = options.roomId;
    this.host = options.host;
    this.token = options.token;
    this.onEvent = options.onEvent;
    this.onStatus = options.onStatus;
  }

  connect(): void {
    if (this.active) return;
    this.active = true;
    this.open();
  }

  close(): void {
    this.active = false;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= WebSocket.OPEN) {
      socket.close(1000, 'client closed');
    }
    this.emit('disconnected');
  }

  private open(): void {
    if (!this.active) return;
    this.emit(this.hasConnected ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(`wss://${this.host}/sub`);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      if (!this.active) {
        socket.close();
        return;
      }
      const auth = JSON.stringify({
        uid: 0,
        roomid: Number(this.roomId),
        protover: 2,
        platform: 'web',
        type: 2,
        key: this.token,
      });
      socket.send(encodeBilibiliPacket(BILIBILI_OP_AUTH, auth));
      this.authTimer = setTimeout(() => {
        if (!this.active) return;
        this.emit('error', '弹幕鉴权超时');
        socket.close();
      }, AUTH_TIMEOUT_MS);
    };

    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (!this.active || !(event.data instanceof ArrayBuffer)) return;
      void this.handlePacket(event.data);
    };

    socket.onerror = () => {
      if (this.active) this.emit('error', 'B 站弹幕连接失败');
    };

    socket.onclose = () => {
      this.clearTimers();
      this.socket = null;
      if (!this.active) return;
      this.scheduleReconnect();
    };
  }

  private async handlePacket(buffer: ArrayBuffer): Promise<void> {
    for (const packet of decodeBilibiliPackets(buffer)) {
      if (packet.operation === BILIBILI_OP_AUTH_REPLY) {
        this.hasConnected = true;
        this.clearAuthTimer();
        this.startHeartbeat();
        this.emit('connected');
        continue;
      }

      if (packet.operation !== BILIBILI_OP_MESSAGE) continue;

      if (packet.version === BILIBILI_PROTOCOL_VERSION_ZLIB) {
        try {
          const inflated = await this.inflate(packet.body);
          await this.handlePacket(inflated);
        } catch {
          this.emit('error', 'B 站弹幕解压失败');
        }
        continue;
      }

      const command = decodeBilibiliText(packet.body);
      if (!command) continue;
      const event = parseBilibiliCommand(command, this.roomId);
      if (event) this.onEvent(event);
    }
  }

  private async inflate(body: Uint8Array): Promise<ArrayBuffer> {
    const stream = new Blob([body.slice().buffer])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'));
    return new Response(stream).arrayBuffer();
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer !== null) return;
    this.heartbeatTimer = setInterval(() => {
      const socket = this.socket;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(encodeBilibiliPacket(BILIBILI_OP_HEARTBEAT, '[object Object]'));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.emit('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, RECONNECT_DELAY_MS);
  }

  private clearAuthTimer(): void {
    if (this.authTimer !== null) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearAuthTimer();
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emit(status: DanmakuStatusEvent['status'], message?: string): void {
    this.onStatus({
      roomId: this.roomId,
      platform: 'bilibili',
      status,
      ...(message ? { message } : {}),
    });
  }
}
