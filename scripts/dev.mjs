import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packagePath = require.resolve('electron-vite/package.json');
const packageJson = require(packagePath);
const bin =
  typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.['electron-vite'];

if (!bin) throw new Error('electron-vite bin is missing');

const cli = join(dirname(packagePath), bin);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  windowsHide: false,
});

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
