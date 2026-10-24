import { session } from 'electron';

const MEDIA_URL_PATTERNS = [
  '*://*.douyucdn.cn/*',
  '*://*.douyucdn2.cn/*',
  '*://*.douyucdn.com/*',
  '*://*.douyucdn2.com/*',
  '*://*.douyu.com/*',
];

function setHeader(headers: Record<string, string[]>, name: string, value: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  }
  headers[name] = [value];
}

/**
 * mpegts.js / hls.js fetch media with XHR, so the CDN response needs CORS.
 * Keep webSecurity on and only relax response headers for Douyu media hosts.
 */
export function configureMediaCors(): void {
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
