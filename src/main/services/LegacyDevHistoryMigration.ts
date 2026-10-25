import { access, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { dirname } from 'node:path';
import { BrowserWindow } from 'electron';
import { MAX_ROOM_HISTORY } from '@shared/contracts/history';
import type { Logger } from '@core/ports/Logger';
import type { JsonRoomHistoryStore } from '../adapters/storage/JsonRoomHistoryStore';

const DEV_ORIGIN = 'http://localhost:5173';
const DEV_PORT = 5173;
const STORAGE_KEY_V2 = 'douyu-desktop.room-history.v2';
const STORAGE_KEY_V1 = 'douyu-desktop.room-history.v1';
const LOAD_TIMEOUT_MS = 4_000;
const MARKER_VERSION = 1;

interface LegacyStorageValues {
  v2?: unknown;
  v1?: unknown;
}

/**
 * Converts an old localStorage JSON string into IPC/store input. v1 entries
 * predate platform scoping, so they default to Douyu.
 */
export function parseLegacyHistoryValue(raw: string | null): unknown[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return entry;
    return { platform: 'douyu', ...entry };
  });
}

function isPortInUse(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EADDRINUSE'
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('读取旧历史超时')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

/**
 * The Vite dev build uses http://localhost:5173 as its localStorage origin.
 * Packaged builds use file://, so the old origin is invisible to the renderer.
 * Read it once through a temporary loopback page and merge it into the global
 * history file. The marker makes this a one-time startup cost.
 */
export class LegacyDevHistoryMigration {
  constructor(
    private readonly history: JsonRoomHistoryStore,
    private readonly markerPath: string,
    private readonly logger: Logger,
  ) {}

  async migrate(): Promise<number> {
    if (await this.hasMarker()) return 0;

    let server: Server | null = null;
    let window: BrowserWindow | null = null;

    try {
      server = await this.startServer();
      if (!server) {
        this.logger.info('history.dev-migration.skipped', { reason: 'port-in-use' });
        return 0;
      }

      window = new BrowserWindow({
        show: false,
        width: 1,
        height: 1,
        skipTaskbar: true,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      await withTimeout(window.loadURL(DEV_ORIGIN), LOAD_TIMEOUT_MS);
      const values = (await window.webContents.executeJavaScript(
        `({ v2: localStorage.getItem(${JSON.stringify(STORAGE_KEY_V2)}), v1: localStorage.getItem(${JSON.stringify(STORAGE_KEY_V1)}) })`,
      )) as LegacyStorageValues;

      const entries = [
        ...parseLegacyHistoryValue(typeof values.v2 === 'string' ? values.v2 : null),
        ...parseLegacyHistoryValue(typeof values.v1 === 'string' ? values.v1 : null),
      ].slice(0, MAX_ROOM_HISTORY);

      if (entries.length === 0) {
        await this.writeMarker(0);
        this.logger.info('history.dev-migration.empty', { origin: DEV_ORIGIN });
        return 0;
      }

      const merged = await this.history.merge(entries);
      await this.writeMarker(merged.length);
      this.logger.info('history.dev-migration.completed', {
        imported: entries.length,
        total: merged.length,
      });
      return entries.length;
    } catch (error) {
      this.logger.warn('history.dev-migration.failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return 0;
    } finally {
      if (window && !window.isDestroyed()) window.destroy();
      if (server) await closeServer(server);
    }
  }

  private async hasMarker(): Promise<boolean> {
    try {
      await access(this.markerPath);
      return true;
    } catch {
      return false;
    }
  }

  private async writeMarker(entries: number): Promise<void> {
    await mkdir(dirname(this.markerPath), { recursive: true });
    await writeFile(
      this.markerPath,
      `${JSON.stringify(
        {
          version: MARKER_VERSION,
          origin: DEV_ORIGIN,
          migratedAt: new Date().toISOString(),
          entries,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }

  private async startServer(): Promise<Server | null> {
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end('<!doctype html><html><body>history migration</body></html>');
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error);
        server.once('error', onError);
        server.once('listening', () => {
          server.off('error', onError);
          resolve();
        });
        server.listen(DEV_PORT);
      });
      return server;
    } catch (error) {
      if (isPortInUse(error)) return null;
      throw error;
    }
  }
}
