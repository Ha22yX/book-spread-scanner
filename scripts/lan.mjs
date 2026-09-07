import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
process.loadEnvFile('.dev.vars');
if (!process.env.PROCESSOR_TOKEN || !process.env.OPENAI_API_KEY)
  throw new Error('Configure PROCESSOR_TOKEN and OPENAI_API_KEY in .dev.vars');
if (!existsSync('dist/server/wrangler.json'))
  throw new Error('Run npm run build first');
const children = new Set();
let stopping = false;
function start(name, args) {
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, WRANGLER_WRITE_LOGS: 'false' },
  });
  children.add(child);
  child.on('exit', () => {
    children.delete(child);
    if (!stopping) {
      console.warn(`${name} stopped; restarting.`);
      setTimeout(() => {
        if (!stopping) start(name, args);
      }, 3000);
    }
  });
}
start('Web service', [
  'node_modules/wrangler/bin/wrangler.js',
  'dev',
  '--config',
  'wrangler.lan.json',
  '--ip',
  '0.0.0.0',
  '--port',
  '3000',
  '--local',
  '--env-file',
  '.dev.vars',
  '--persist-to',
  '.wrangler/state',
  '--inspector-ip',
  '127.0.0.1',
  '--log-level',
  'warn',
]);
start('OCR processor', ['--import', 'tsx', 'scripts/processor.ts']);
function stop() {
  stopping = true;
  for (const child of children) child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
console.log(
  'LAN scanner is running on port 3000 with automatic background processing.',
);
