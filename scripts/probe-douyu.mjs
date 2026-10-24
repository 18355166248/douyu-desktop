import md5 from 'blueimp-md5';

const ROOM_ID = process.argv[2] ?? '9999';
const DID = process.argv[3] ?? '10000000000000000000000000001501';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function getAuth(roomId, timestamp, key, randStr, encTime, isSpecial) {
  const suffix = Number(isSpecial) === 1 ? '' : `${roomId}${timestamp}`;
  let value = randStr;
  for (let index = 0; index < Number(encTime); index += 1) {
    value = md5(value + key);
  }
  return md5(value + key + suffix);
}

async function main() {
  const headers = {
    'User-Agent': UA,
    Referer: `https://www.douyu.com/${ROOM_ID}`,
  };

  const encryptionResponse = await fetch(
    `https://www.douyu.com/wgapi/livenc/liveweb/websec/getEncryption?did=${encodeURIComponent(DID)}`,
    { headers },
  );
  const encryption = await encryptionResponse.json();
  console.log('encryption', {
    status: encryptionResponse.status,
    error: encryption.error,
    msg: encryption.msg,
    hasData: Boolean(encryption.data),
    encTime: encryption.data?.enc_time,
    isSpecial: encryption.data?.is_special,
  });
  if (Number(encryption.error) !== 0 || !encryption.data) {
    process.exitCode = 1;
    return;
  }

  const timestamp = Math.round(Date.now() / 1000);
  const auth = getAuth(
    ROOM_ID,
    timestamp,
    encryption.data.key,
    encryption.data.rand_str,
    encryption.data.enc_time,
    encryption.data.is_special,
  );
  const body = new URLSearchParams({
    enc_data: encryption.data.enc_data,
    tt: String(timestamp),
    did: DID,
    auth,
    cdn: '',
    rate: '0',
    hevc: '0',
    fa: '0',
    ive: '0',
  }).toString();

  const playResponse = await fetch(
    `https://www.douyu.com/lapi/live/getH5PlayV1/${encodeURIComponent(ROOM_ID)}`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  );
  const play = await playResponse.json();
  console.log('play', {
    status: playResponse.status,
    error: play.error,
    msg: play.msg,
    hasData: Boolean(play.data),
    roomName: play.data?.room_name,
    nickname: play.data?.nickname,
    rtmpUrl: play.data?.rtmp_url,
    rtmpLive: play.data?.rtmp_live,
    hlsUrl: play.data?.hls_url,
    hlsLive: play.data?.hls_live,
  });

  if (play.data?.rtmp_url && play.data?.rtmp_live) {
    const mediaUrl = `${play.data.rtmp_url}/${play.data.rtmp_live}`;
    const mediaResponse = await fetch(mediaUrl, {
      method: 'HEAD',
      headers: {
        ...headers,
        Origin: 'http://localhost:5173',
      },
    });
    console.log('media', {
      status: mediaResponse.status,
      contentType: mediaResponse.headers.get('content-type'),
      allowOrigin: mediaResponse.headers.get('access-control-allow-origin'),
      allowMethods: mediaResponse.headers.get('access-control-allow-methods'),
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
