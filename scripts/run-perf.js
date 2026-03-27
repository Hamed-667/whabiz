const { spawn } = require('child_process');

const isWindows = process.platform === 'win32';
const strictMode = process.env.PERF_STRICT === '1' || process.env.CI === 'true';
const retries = Math.max(1, Number(process.env.PERF_RETRIES) || 2);
const command = isWindows ? 'cmd.exe' : 'npx';
const args = isWindows
  ? ['/d', '/s', '/c', 'npx lhci autorun --config=./lighthouserc.json']
  : ['lhci', 'autorun', '--config=./lighthouserc.json'];

const knownWindowsFlakes = [
  /NO_NAVSTART/i,
  /EPERM,\s*Permission denied/i,
  /Unable to connect to Chrome/i
];

function runOnce() {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let logs = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      logs += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      logs += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => resolve({ code: code || 0, logs }));
    child.on('error', (err) => resolve({ code: 1, logs: logs + '\n' + String(err && err.message ? err.message : err) }));
  });
}

function isKnownWindowsFlake(logs) {
  return knownWindowsFlakes.some((pattern) => pattern.test(logs || ''));
}

async function main() {
  let last = { code: 1, logs: '' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (attempt > 1) {
      console.warn(`[perf] Retry ${attempt}/${retries}...`);
    }

    last = await runOnce();
    if (last.code === 0) {
      console.log('[perf] Lighthouse run completed successfully.');
      process.exit(0);
    }

    const known = isKnownWindowsFlake(last.logs);
    if (!known || attempt === retries) {
      break;
    }
  }

  const knownWindowsIssue = isWindows && isKnownWindowsFlake(last.logs);
  if (knownWindowsIssue && !strictMode) {
    console.warn('[perf] Known Windows Lighthouse instability detected (NO_NAVSTART/EPERM).');
    console.warn('[perf] Non-blocking in local mode. Use CI (Linux) or set PERF_STRICT=1 to enforce.');
    process.exit(0);
  }

  process.exit(last.code || 1);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
