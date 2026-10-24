const ROOM_ID = process.argv[2] ?? '9999';
const URL = 'wss://danmuproxy.douyu.com:8502';

function encodePacket(text) {
  const body = Buffer.from(text, 'utf8');
  const length = body.length + 9;
  const packet = Buffer.alloc(length + 4);
  packet.writeUInt32LE(length, 0);
  packet.writeUInt32LE(length, 4);
  packet.writeUInt32LE(689, 8);
  body.copy(packet, 12);
  return packet;
}

const ws = new WebSocket(URL);
ws.binaryType = 'arraybuffer';
let count = 0;
let printed = 0;
let printedChat = 0;
const types = new Map();

ws.addEventListener('open', () => {
  console.log('open', URL, 'room', ROOM_ID);
  ws.send(encodePacket(`type@=loginreq/roomid@=${ROOM_ID}`));
  ws.send(encodePacket(`type@=joingroup/rid@=${ROOM_ID}/gid@=-9999/`));
});

ws.addEventListener('message', (event) => {
  const buffer = Buffer.from(event.data);
  const raw = buffer.toString('utf8');
  const chunks = raw.split('\0');
  for (const chunk of chunks) {
    if (!chunk.includes('type@=')) continue;
    count += 1;
    const payload = chunk.slice(chunk.indexOf('type@='));
    const type = payload.match(/type@=([^/]+)/)?.[1] ?? 'unknown';
    types.set(type, (types.get(type) ?? 0) + 1);
    if (printed < 4) {
      printed += 1;
      console.log('--- packet', count, 'bytes', buffer.length, 'type', type, '---');
      console.log('hex', buffer.subarray(0, 32).toString('hex'));
      console.log('payload', payload.slice(0, 300));
    }
    if (type === 'chatmsg' && printedChat < 2) {
      printedChat += 1;
      console.log('--- chatmsg ---');
      console.log(payload.slice(0, 500));
    }
  }
});

ws.addEventListener('error', (event) => {
  console.error('ws error', event.message ?? event);
});

ws.addEventListener('close', (event) => {
  console.log('close', event.code, event.reason);
});

setTimeout(() => {
  console.log('total packets', count, 'types', Object.fromEntries(types));
  ws.close();
  setTimeout(() => process.exit(0), 300);
}, 12000);
