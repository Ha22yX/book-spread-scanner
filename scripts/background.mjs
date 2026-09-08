import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { shouldRestart } from './supervisor-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
mkdirSync(join(root, 'outputs'), { recursive: true });
const log = (message) => {
  const now = new Date();
  appendFileSync(join(root, 'outputs', `processor-${now.toISOString().slice(0, 10)}.log`), `${now.toISOString()} ${message}\n`);
};
// OS-owned lock: released even if the supervisor is killed. No stale PID file.
const lock = createServer((socket) => socket.end());
const name = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 20);
const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\book-scanner-${name}` : join(root, 'outputs', 'processor.sock');
let child, stopping = false, lastPulse = 0, jobStarted = 0, retry, restarting = false;
lock.on('error', (error) => {
  if (error.code === 'EADDRINUSE') process.exit(0);
  log(`Supervisor lock failed (${error.code || 'unknown'}).`);
  process.exit(1);
});
function run() {
  if (stopping) return;
  lastPulse = Date.now(); jobStarted = 0; restarting = false;
  child = spawn(process.execPath, ['--import', 'tsx', 'scripts/processor.ts'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  log(`Processor started (PID ${child.pid}).`);
  child.stdout.on('data', (data) => log(data.toString().trim()));
  child.stderr.on('data', () => log('Processor reported an error; see its next status/retry.'));
  child.on('message', (message) => {
    lastPulse = Date.now();
    if (message?.type === 'job-start') jobStarted = Date.now();
    if (message?.type === 'job-end') jobStarted = 0;
  });
  child.on('error', (error) => log(`Processor launch failed (${error.code || error.name}).`));
  child.on('exit', (code, signal) => {
    log(`Processor exited (code ${code}, signal ${signal || 'none'}).`);
    child = undefined;
    if (!stopping) retry = setTimeout(run, 5000);
    else lock.close(() => process.exit(0));
  });
}
const watchdog = setInterval(() => {
  if (child && !restarting && shouldRestart({ now: Date.now(), lastPulse, jobStarted })) {
    log('Processor stopped responding or exceeded the 12-minute job limit; restarting.');
    restarting = true;
    child.kill();
  }
}, 15000);
function stop() {
  stopping = true;
  clearTimeout(retry); clearInterval(watchdog);
  if (child) child.kill();
  else lock.close(() => process.exit(0));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
lock.listen(socketPath, () => { log(`Supervisor ready (PID ${process.pid}).`); run(); });
