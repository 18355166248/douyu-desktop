import md5 from 'blueimp-md5';

export function getDouyuAuth(
  roomId: string,
  timestamp: number,
  key: string,
  randStr: string,
  encTime: number,
  isSpecial: number,
): string {
  const suffix = isSpecial === 1 ? '' : `${roomId}${timestamp}`;
  let value = randStr;
  for (let index = 0; index < encTime; index += 1) {
    value = md5(value + key);
  }
  return md5(value + key + suffix);
}
