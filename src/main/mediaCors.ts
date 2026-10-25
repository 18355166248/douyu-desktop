import { session } from 'electron';

const MEDIA_URL_PATTERNS = [
  '*://*.douyucdn.cn/*',
  '*://*.douyucdn2.cn/*',
  '*://*.douyucdn.com/*',
  '*://*.douyucdn2.com/*',
  '*://*.douyu.com/*',
  '*://*.bilivideo.com/*',
  '*://*.bilivideo.cn/*',
];

const BILIBILI_MEDIA_PATTERNS = ['*://*.bilivideo.com/*', '*://*.bilivideo.cn/*'];

const HEADER_URL_PATTERNS = [
  ...BILIBILI_MEDIA_PATTERNS,
  'wss://danmuproxy.douyu.com/*',
];

let douyuGatewayCookie: string | null = null;

export function setDouyuGatewayCookie(cookie: string): void {
  douyuGatewayCookie = cookie;
}

function isDouyuGateway(url: string): boolean {
  try {
    return new URL(url).hostname === 'danmuproxy.douyu.com';
  } catch {
    return false;
  }
}

function setHeader(headers: Record<string, string[]>, name: string, value: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  }
  headers[name] = [value];
}

function setRequestHeader(headers: Record<string, string>, name: string, value: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  }
  headers[name] = value;
}

/**
 * mpegts.js / hls.js fetch media with XHR, so the CDN response needs CORS.
 * Keep webSecurity on and only relax response headers for known live media hosts.
 */
export function configureMediaCors(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: HEADER_URL_PATTERNS },
    (details, callback) => {
      const headers = details.requestHeaders;
      if (douyuGatewayCookie && isDouyuGateway(details.url)) {
        setRequestHeader(headers, 'Cookie', douyuGatewayCookie);
        setRequestHeader(headers, 'Origin', 'https://www.douyu.com');
      } else if (details.url.includes('bilivideo')) {
        setRequestHeader(headers, 'Referer', 'https://live.bilibili.com/');
      }
      callback({ requestHeaders: headers });
    },
  );

  session.defaultSession.webRequest.onHeadersReceived(
    { urls: MEDIA_URL_PATTERNS },
    (details, callback) => {
      const headers = details.responseHeaders ?? {};
      setHeader(headers, 'Access-Control-Allow-Origin', '*');
      setHeader(headers, 'Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
      setHeader(headers, 'Access-Control-Allow-Headers', '*');
      setHeader(headers, 'Access-Control-Expose-Headers', 'Content-Length,Content-Range');
      callback({ responseHeaders: headers });
    },
  );
}
