import {
  decodeDouyuPackets,
  encodeDouyuPacket,
  parseDouyuDanmaku,
} from '../src/shared/douyu/danmakuProtocol.ts';

const roomId = process.argv[2] ?? '9999';
const ws = new WebSocket('wss://danmuproxy.douyu.com:8503');
ws.binaryType = 'arraybuffer';

const counts = { chat: 0, enter: 0, gift: 0, ignored: 0 };
let firstChat = null;

ws.addEventListener('open', () => {
  ws.send(encodeDouyuPacket(`type@=loginreq/roomid@=${roomId}`));
  ws.send(encodeDouyuPacket(`type@=joingroup/rid@=${roomId}/gid@=-9999/`));
  console.log('connected', roomId);
});

ws.addEventListener('message', (event) => {
  if (!(event.data instanceof ArrayBuffer)) return;
  const packets = decodeDouyuPackets(new Uint8Array(event.data));
  for (const packet of packets) {
    const message = parseDouyuDanmaku(packet, roomId);
    if (!message) {
      counts.ignored += 1;
      continue;
    }
    counts[message.kind] += 1;
    if (message.kind === 'chat' && !firstChat) {
      firstChat = message;
    }
  }
});

ws.addEventListener('error', (event) => {
  console.error('websocket error', event.message ?? event);
});

setTimeout(() => {
  console.log('decoded', counts);
  console.log('first chat', firstChat);
  ws.close();
  setTimeout(() => process.exit(0), 300);
}, 10_000);
