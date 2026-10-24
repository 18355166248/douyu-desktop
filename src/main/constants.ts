const chromeMajor = process.versions.chrome?.split('.')[0] ?? '131';

export const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;

export const DOUYU_ORIGIN = 'https://www.douyu.com';
export const DOUYU_LOGIN_URL = `${DOUYU_ORIGIN}/`;

export function isDouyuUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'douyu.com' || url.hostname.endsWith('.douyu.com'))
    );
  } catch {
    return false;
  }
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return (
      url.hostname === 'douyu.com' ||
      url.hostname.endsWith('.douyu.com') ||
      url.hostname === 'github.com' ||
      url.hostname.endsWith('.github.com')
    );
  } catch {
    return false;
  }
}
