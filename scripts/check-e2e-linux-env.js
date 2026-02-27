#!/usr/bin/env node

const path = require('path');

function fail(message) {
  console.error('\n[check-e2e-linux-env] ' + message + '\n');
  process.exit(1);
}

if (process.platform !== 'linux') {
  process.exit(0);
}

let electronBinaryPath = '';
try {
  // eslint-disable-next-line global-require
  electronBinaryPath = String(require('electron') || '');
} catch (_error) {
  fail('Cannot resolve `electron` binary. Run `npm ci` first.');
}

const normalized = electronBinaryPath.replace(/\\/g, '/').toLowerCase();
if (normalized.endsWith('/electron.exe') || normalized.endsWith('.exe')) {
  fail(
    'Detected Windows Electron binary on Linux: ' + electronBinaryPath + '\n' +
    'This usually means mixed `node_modules` between Windows and WSL/Linux.\n\n' +
    'Fix:\n' +
    '  1) rm -rf node_modules\n' +
    '  2) npm ci\n' +
    '  3) npx playwright install --with-deps\n' +
    '  4) npm run test:e2e:linux\n\n' +
    'Tip: use separate installs for Windows and WSL (do not share node_modules).'
  );
}

if (!path.isAbsolute(electronBinaryPath)) {
  fail('Resolved `electron` path is invalid: ' + electronBinaryPath);
}

process.exit(0);
