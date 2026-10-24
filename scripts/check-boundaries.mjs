import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(root, 'src');

const rules = {
  core: {
    dirs: ['core'],
    banned: [
      { pattern: /^electron$/, reason: 'core 不能依赖 Electron' },
      { pattern: /^react(-dom)?$/, reason: 'core 不能依赖 React' },
      { pattern: /^node:/, reason: 'core 不能依赖 Node 内置模块' },
      { pattern: /^@main\//, reason: 'core 不能依赖 main' },
      { pattern: /^@renderer\//, reason: 'core 不能依赖 renderer' },
    ],
  },
  renderer: {
    dirs: ['renderer'],
    banned: [
      { pattern: /^electron$/, reason: 'renderer 只能通过 preload 调 main' },
      { pattern: /^node:/, reason: 'renderer 不能依赖 Node 内置模块' },
      { pattern: /^@core\//, reason: 'renderer 不能依赖 core' },
      { pattern: /^@main\//, reason: 'renderer 不能依赖 main' },
    ],
  },
  shared: {
    dirs: ['shared'],
    banned: [
      { pattern: /^electron$/, reason: 'shared 不能依赖 Electron' },
      { pattern: /^react(-dom)?$/, reason: 'shared 不能依赖 React' },
      { pattern: /^node:/, reason: 'shared 不能依赖 Node 内置模块' },
      { pattern: /^@core\//, reason: 'shared 不能依赖 core' },
      { pattern: /^@main\//, reason: 'shared 不能依赖 main' },
      { pattern: /^@renderer\//, reason: 'shared 不能依赖 renderer' },
    ],
  },
  preload: {
    dirs: ['preload'],
    banned: [
      { pattern: /^@core\//, reason: 'preload 不能依赖 core' },
      { pattern: /^@main\//, reason: 'preload 不能依赖 main' },
      { pattern: /^@renderer\//, reason: 'preload 不能依赖 renderer' },
    ],
  },
};

const importPattern = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const violations = [];

for (const rule of Object.values(rules)) {
  for (const dir of rule.dirs) {
    const files = await walk(join(sourceRoot, dir));
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      for (const match of content.matchAll(importPattern)) {
        const specifier = match[1];
        for (const banned of rule.banned) {
          if (banned.pattern.test(specifier)) {
            violations.push({
              file: relative(root, file),
              specifier,
              reason: banned.reason,
            });
          }
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Boundary violations:\n');
  for (const item of violations) {
    console.error(`- ${item.file}: "${item.specifier}" — ${item.reason}`);
  }
  process.exitCode = 1;
} else {
  console.warn('Boundary check passed.');
}
