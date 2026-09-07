import { spawn } from 'node:child_process';
let child,
  stopping = false;
function run() {
  child = spawn(process.execPath, ['--import', 'tsx', 'scripts/processor.ts'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('exit', () => {
    if (!stopping) {
      console.warn('Background processor stopped; restarting.');
      setTimeout(() => {
        if (!stopping) run();
      }, 3000);
    }
  });
}
function stop() {
  stopping = true;
  child?.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
run();
