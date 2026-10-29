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
const CONNECT_TIMEOUT_MS = 10_000;
const RECEIVE_TIMEOUT_MS = 60_000;
const RECONNECT_DELAY_MS = 3_000;

interface BilibiliDanmakuClientOptions {
  roomId: string;
  host: string;
  token: string;
  refreshConfig?: () => Promise<{ host: string; token: string }>;
  onEvent: (event: DanmakuEvent) => void;
  onStatus: (status: DanmakuStatusEvent) => void;
}

export class BilibiliDanmakuClient {
  private readonly roomId: string;
  private host: string;
  private token: string;
  private readonly refreshConfig?: BilibiliDanmakuClientOptions['refreshConfig'];
  private readonly onEvent: (event: DanmakuEvent) => void;
  private readonly onStatus: (status: DanmakuStatusEvent) => void;
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private hasConnected = false;
  private hasAttempted = false;
  private authenticated = false;
  private lastReceivedAt = 0;
  private generation = 0;

  constructor(options: BilibiliDanmakuClientOptions) {
    this.roomId = options.roomId;
    this.host = options.host;
    this.token = options.token;
    this.refreshConfig = options.refreshConfig;
    this.onEvent = options.onEvent;
    this.onStatus = options.onStatus;
  }

  connect(): void {
    if (this.active) return;
    this.active = true;
    void this.open();
  }

  close(): void {
    this.active = false;
    this.clearTimers();
    this.detachSocket();
    this.emit('disconnected');
  }

  private detachSocket(): void {
    this.generation += 1;
    this.authenticated = false;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      if (socket.readyState <= WebSocket.OPEN) socket.close(1000, 'client closed');
    }
  }

  private reconnect(message?: string): void {
    if (!this.active) return;
    this.clearTimers();
    this.detachSocket();
    this.scheduleReconnect(message);
  }

  private async open(): Promise<void> {
    if (!this.active) return;
    const generation = ++this.generation;
    this.emit(this.hasConnected ? 'reconnecting' : 'connecting');
    let socket: WebSocket;
    try {
      // 重连重新取配置，避免鉴权过期后一直使用旧 token。
      const refresh = this.hasAttempted;
      this.hasAttempted = true;
      if (refresh && this.refreshConfig) {
        const config = await this.refreshConfig();
        if (!this.active || this.generation !== generation) return;
        this.host = config.host;
        this.token = config.token;
      }
      socket = new WebSocket(`wss://${this.host}/sub`);
    } catch {
      if (this.active && this.generation === generation) this.reconnect('B 站弹幕连接失败');
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.connectTimer = setTimeout(() => {
      if (this.socket === socket) this.reconnect('弹幕连接超时');
    }, CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      if (!this.active || this.socket !== socket) return;
      this.clearConnectTimer();
      const auth = JSON.stringify({
        uid: 0,
        roomid: Number(this.roomId),
        protover: 2,
        platform: 'web',
        type: 2,
        key: this.token,
      });
      try {
        socket.send(encodeBilibiliPacket(BILIBILI_OP_AUTH, auth));
      } catch {
        this.reconnect('弹幕鉴权发送失败');
        return;
      }
      this.authTimer = setTimeout(() => {
        if (this.socket === socket) this.reconnect('弹幕鉴权超时');
      }, AUTH_TIMEOUT_MS);
    };

    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (!this.active || this.socket !== socket || !(event.data instanceof ArrayBuffer)) return;
      void this.handlePacket(event.data, socket).catch(() => {
        if (this.socket === socket) this.reconnect('B 站弹幕数据异常');
      });
    };

    socket.onerror = () => {
      if (this.socket === socket) this.reconnect('B 站弹幕连接失败');
    };

    socket.onclose = () => {
      if (this.socket === socket) this.reconnect();
    };
  }

  private async handlePacket(buffer: ArrayBuffer, socket: WebSocket): Promise<void> {
    for (const packet of decodeBilibiliPackets(buffer)) {
      // 解压期间可能已经切换连接，旧连接的数据不能更改新连接状态。
      if (!this.active || this.socket !== socket) return;
      this.lastReceivedAt = performance.now();
      if (packet.operation === BILIBILI_OP_AUTH_REPLY) {
        const reply = decodeBilibiliText(packet.body) as Record<string, unknown> | null;
        if (reply?.code !== 0) {
          this.reconnect('B 站弹幕鉴权失败，正在重新获取配置');
          return;
        }
        if (this.authenticated) continue;
        this.authenticated = true;
        this.hasConnected = true;
        this.clearAuthTimer();
        this.startHeartbeat();
        this.emit('connected');
        continue;
      }

      if (packet.operation !== BILIBILI_OP_MESSAGE || !this.authenticated) continue;

      if (packet.version === BILIBILI_PROTOCOL_VERSION_ZLIB) {
        try {
          const inflated = await this.inflate(packet.body);
          await this.handlePacket(inflated, socket);
        } catch {
          if (this.socket === socket) this.emit('error', 'B 站弹幕解压失败');
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
      if (performance.now() - this.lastReceivedAt >= RECEIVE_TIMEOUT_MS) {
        this.reconnect('弹幕长时间无响应，正在重连');
        return;
      }
      if (socket?.readyState === WebSocket.OPEN) {
        try {
          socket.send(encodeBilibiliPacket(BILIBILI_OP_HEARTBEAT, '[object Object]'));
        } catch {
          this.reconnect('弹幕心跳发送失败');
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private scheduleReconnect(message?: string): void {
    if (this.reconnectTimer !== null) return;
    this.emit('reconnecting', message);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, RECONNECT_DELAY_MS);
  }

  private clearAuthTimer(): void {
    if (this.authTimer !== null) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearAuthTimer();
    this.clearConnectTimer();
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
