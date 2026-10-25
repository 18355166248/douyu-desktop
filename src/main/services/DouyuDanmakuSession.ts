import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app, session } from 'electron';
import type { DouyuDanmakuConfig } from '@shared/contracts/danmaku';
import { setDouyuGatewayCookie } from '../mediaCors';

const DEVICE_FILE = 'douyu-danmaku-device';
const DEVICE_PATTERN = /^[0-9a-f]{32}$/;
const WS_HOST = 'danmuproxy.douyu.com:8502';
const COOKIE_URL = 'https://www.douyu.com/';

function createDeviceId(): string {
  return randomUUID().replace(/-/g, '');
}

/**
 * Douyu's barrage gateway is an anonymous, read-only visitor connection. It
 * still expects a stable first-party device cookie on the WebSocket handshake,
 * which a localhost renderer cannot set for the `wss://` origin.
 */
export class DouyuDanmakuSession {
  async prepare(): Promise<DouyuDanmakuConfig> {
    const deviceId = await this.readDeviceId();
    await this.installCookies(deviceId);
    setDouyuGatewayCookie(
      [
        `dy_did=${deviceId}`,
        `acf_did=${deviceId}`,
        `acf_ssid=${Date.now()}000000`,
        'acf_web_id=7000249175997385759',
        `guid=${deviceId}`,
      ].join('; '),
    );
    return { host: WS_HOST };
  }

  private async readDeviceId(): Promise<string> {
    const path = join(app.getPath('userData'), DEVICE_FILE);
    try {
      const stored = (await readFile(path, 'utf8')).trim();
      if (DEVICE_PATTERN.test(stored)) return stored;
    } catch {
      // First launch or an unreadable file: create a new device id below.
    }

    const deviceId = createDeviceId();
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, deviceId, 'utf8');
    } catch {
      // A transient write failure must not prevent the danmaku connection.
    }
    return deviceId;
  }

  private async installCookies(deviceId: string): Promise<void> {
    const cookies = [
      { name: 'dy_did', value: deviceId },
      { name: 'acf_did', value: deviceId },
      { name: 'acf_ssid', value: `${Date.now()}000000` },
      { name: 'acf_web_id', value: '7000249175997385759' },
      { name: 'guid', value: deviceId },
    ];

    await Promise.all(
      cookies.map(async (cookie) => {
        try {
          await session.defaultSession.cookies.set({
            url: COOKIE_URL,
            domain: '.douyu.com',
            path: '/',
            name: cookie.name,
            value: cookie.value,
            secure: true,
            httpOnly: false,
            sameSite: 'lax',
          });
        } catch {
          // Chat can still work when a cookie is rejected; do not fail startup.
        }
      }),
    );
  }
}
