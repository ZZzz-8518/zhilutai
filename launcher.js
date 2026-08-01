const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawn } = require('node:child_process');

const APP_DIR = __dirname;
const DEFAULT_DATA_DIR = process.platform === 'win32' && fs.existsSync('E:\\')
  ? 'E:\\JobFinderData'
  : path.join(process.env.LOCALAPPDATA || os.homedir(), 'Zhilutai');
const DATA_DIR = path.resolve(process.env.JOB_FINDER_DATA_DIR || DEFAULT_DATA_DIR);
const LOG_DIR = path.join(DATA_DIR, 'logs');
const URL = 'http://127.0.0.1:4177';
const EXPECTED_APP_VERSION = 6;
const SHOULD_OPEN = !process.argv.includes('--no-open');

function stopExistingServer() {
  const script = [
    "$listeners = Get-NetTCPConnection -LocalPort 4177 -State Listen -ErrorAction SilentlyContinue",
    'foreach ($listener in $listeners) {',
    '  $process = Get-Process -Id $listener.OwningProcess -ErrorAction Stop',
    "  if ($process.ProcessName -ne 'node') { throw \"端口 4177 被其他程序占用：$($process.ProcessName)\" }",
    '  Stop-Process -Id $listener.OwningProcess -Force',
    '}'
  ].join('\n');
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });
}

function waitUntilReady(timeoutMs = 8000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(`${URL}/api/status`, { timeout: 800 }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          try {
            const status = JSON.parse(body);
            if (response.statusCode === 200 && status.app_version === EXPECTED_APP_VERSION) return resolve();
          } catch {}
          retry();
        });
      });
      request.on('timeout', () => request.destroy());
      request.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error(`职路台启动失败，请查看 ${LOG_DIR}\\server.err.log`));
      setTimeout(check, 250);
    };
    check();
  });
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  stopExistingServer();

  const stdout = fs.openSync(path.join(LOG_DIR, 'server.out.log'), 'a');
  const stderr = fs.openSync(path.join(LOG_DIR, 'server.err.log'), 'a');
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
    cwd: APP_DIR,
    detached: true,
    windowsHide: true,
    env: {
      ...process.env,
      JOB_FINDER_DATA_DIR: DATA_DIR,
      JOB_FINDER_TOOLS_DIR: process.env.JOB_FINDER_TOOLS_DIR || path.join(DATA_DIR, 'tools')
    },
    stdio: ['ignore', stdout, stderr]
  });
  child.unref();
  fs.closeSync(stdout);
  fs.closeSync(stderr);

  await waitUntilReady();
  if (SHOULD_OPEN) {
    spawn('cmd.exe', ['/c', 'start', '', URL], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
