const { spawn } = require('child_process');
const path = require('path');

console.log('[Runner] Starting Backend and Frontend...');

const backend = spawn('node', ['src/server.js'], {
  cwd: path.join(__dirname, 'civicconnect-backend'),
  stdio: 'inherit',
  shell: true
});

const frontend = spawn('cmd.exe', ['/c', 'npm', 'run', 'dev'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

backend.on('error', (err) => console.error('[Backend Error]', err));
frontend.on('error', (err) => console.error('[Frontend Error]', err));

backend.on('exit', (code) => console.log(`[Backend exited with code ${code}]`));
frontend.on('exit', (code) => console.log(`[Frontend exited with code ${code}]`));

process.on('SIGINT', () => {
  backend.kill();
  frontend.kill();
  process.exit();
});

process.on('SIGTERM', () => {
  backend.kill();
  frontend.kill();
  process.exit();
});
