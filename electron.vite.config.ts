import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { version } from './package.json';
import notes from './build/release-notes.json';
import type { BuildInfo } from './src/shared/buildInfo';

function readGit(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function buildInfoPlugin(): Plugin {
  const builtAt = new Date().toISOString();
  const buildInfo: BuildInfo = {
    version,
    buildId: `${builtAt.slice(0, 19).replace(/\D/g, '')}-${randomUUID().slice(0, 8)}`,
    builtAt,
    revision: readGit(['rev-parse', '--short', 'HEAD']),
    localChanges: [
      readGit(['-c', 'core.quotePath=false', 'diff', '--name-only', 'HEAD']),
      readGit([
        '-c',
        'core.quotePath=false',
        'ls-files',
        '--others',
        '--exclude-standard',
        '--',
        '.',
        ':(exclude)electron.vite.config.ts.*.mjs',
      ]),
    ]
      .join('\n')
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean),
    notes,
    commits: (readGit(['log', '-8', '--format=%h%x09%s']) ?? '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash = '', ...subject] = line.trimEnd().split('\t');
        return { hash, subject: subject.join('\t') };
      }),
  };
  const serialized = JSON.stringify(buildInfo);

  return {
    name: 'desktop-build-info',
    config: () => ({ define: { __DESKTOP_BUILD_INFO__: serialized } }),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: serialized });
    },
  };
}

const sharedAlias = {
  '@shared': resolve('src/shared'),
};
const coreAlias = {
  ...sharedAlias,
  '@core': resolve('src/core'),
};
const mainAlias = {
  ...coreAlias,
  '@main': resolve('src/main'),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: mainAlias },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          yuba: resolve('src/preload/yuba.ts'),
        },
      },
    },
  },
  renderer: {
    build: { minify: true },
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), buildInfoPlugin()],
  },
});
