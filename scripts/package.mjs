import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requestedTarget = process.argv[2] ?? 'nsis';
const target = requestedTarget === 'dir' ? 'dir' : requestedTarget === 'nsis' ? 'nsis' : null;

if (!target) {
  console.error(`[package] 不支持的打包目标：${requestedTarget}（仅支持 nsis / dir）`);
  process.exit(1);
}

const targetLabel = target === 'dir' ? '免安装目录' : 'NSIS 安装包';
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
const outputDir = resolve(projectRoot, process.env.PACKAGE_OUTPUT_DIR ?? 'release');
const startedAt = Date.now();

const require = createRequire(import.meta.url);
const builderPackagePath = require.resolve('electron-builder/package.json');
const builderPackage = JSON.parse(readFileSync(builderPackagePath, 'utf8'));
const builderBin =
  typeof builderPackage.bin === 'string'
    ? builderPackage.bin
    : builderPackage.bin?.['electron-builder'];

if (!builderBin) {
  throw new Error('electron-builder bin is missing');
}

const builderCli = resolve(dirname(builderPackagePath), builderBin);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

console.log(`[package] 目标：${targetLabel}`);
console.log(`[package] 输出目录：${outputDir}`);

// electron-builder otherwise downloads Electron again, even when npm already installed it.
// Reuse only the matching Windows x64 runtime; cross-platform builds keep the default source.
const builderArgs = [
  builderCli,
  '--win',
  target,
  '--x64',
  '--publish',
  'never',
  `--config.directories.output=${outputDir}`,
];
if (process.platform === 'win32' && process.arch === 'x64') {
  const electronPackagePath = require.resolve('electron/package.json');
  const electronPackage = JSON.parse(readFileSync(electronPackagePath, 'utf8'));
  const electronDist = join(dirname(electronPackagePath), 'dist');
  const versionFile = join(electronDist, 'version');
  if (
    existsSync(join(electronDist, 'electron.exe')) &&
    existsSync(versionFile) &&
    readFileSync(versionFile, 'utf8').trim() === electronPackage.version
  ) {
    builderArgs.push(`--config.electronDist=${electronDist}`);
    console.log(`[package] 复用本地 Electron ${electronPackage.version}：${electronDist}`);
  } else {
    console.log('[package] 本地 Electron 不完整或版本不匹配，将由 electron-builder 下载运行时。');
  }
}

const child = spawn(process.execPath, builderArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  env,
  windowsHide: false,
});

const result = await new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolveExit({ code, signal }));
});

if (result.code !== 0) {
  console.error(
    `[package] 打包失败（exit ${result.code ?? result.signal ?? 'unknown'}），未生成安装包提示。`,
  );
  process.exit(result.code ?? 1);
}

function listFiles(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(directory, entry.name));
  } catch {
    return [];
  }
}

function newestFile(files) {
  return (
    files
      .map((file) => ({ file, mtimeMs: statSync(file).mtimeMs }))
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0] ?? null
  );
}

function largestFile(files) {
  return (
    files
      .map((file) => ({ file, size: statSync(file).size, mtimeMs: statSync(file).mtimeMs }))
      .sort((left, right) => right.size - left.size)[0] ?? null
  );
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

const installer = newestFile(
  listFiles(outputDir).filter((file) => /^douyu-desktop-.*-x64\.exe$/i.test(basename(file))),
);
const unpacked = largestFile(
  listFiles(join(outputDir, 'win-unpacked')).filter((file) => file.toLowerCase().endsWith('.exe')),
);

if (target === 'nsis' && !installer) {
  console.error(`[package] 打包命令已结束，但未找到 NSIS 安装包。输出目录：${outputDir}`);
  process.exit(1);
}

if (target === 'dir' && !unpacked) {
  console.error(`[package] 打包命令已结束，但未找到免安装版可执行文件。输出目录：${outputDir}`);
  process.exit(1);
}

if (installer && installer.mtimeMs < startedAt - 10_000) {
  console.warn('[package] 未检测到本次新生成的安装包，下面显示最新已有文件，请确认是否覆盖成功。');
}

const recordPath = join(outputDir, 'package-result.json');
const record = {
  status: 'success',
  version: packageJson.version,
  target,
  createdAt: new Date().toISOString(),
  outputDir,
  installer: installer?.file ?? null,
  unpackedExe: unpacked?.file ?? null,
};
writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

console.log('');
console.log(`打包成功（${targetLabel}）`);
console.log(`版本：${packageJson.version}`);
console.log(`输出目录：${outputDir}`);
if (installer) {
  console.log(`安装包地址：${installer.file}`);
  console.log(`安装包生成时间：${formatTime(installer.mtimeMs)}`);
}
if (unpacked) {
  console.log(`免安装版地址：${unpacked.file}`);
  console.log(`免安装版生成时间：${formatTime(unpacked.mtimeMs)}`);
}
console.log(`打包记录：${recordPath}`);
console.log('');
