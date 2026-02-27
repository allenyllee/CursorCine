#!/usr/bin/env node

const { spawnSync } = require('child_process');

function runStep(name, args, options = {}) {
  process.stdout.write('[native-coverage] ' + name + '...\n');
  const env = Object.assign({}, process.env, options.env || {});
  const child = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (child.stderr) {
    process.stderr.write(child.stderr);
  }

  if (child.error) {
    throw new Error(name + ' failed: ' + child.error.message);
  }

  if (child.status !== 0) {
    if (child.stdout && options.showStdoutOnError !== false) {
      process.stdout.write(child.stdout);
    }
    throw new Error(name + ' failed with exit code ' + String(child.status));
  }

  if (options.echoStdout && child.stdout) {
    process.stdout.write(child.stdout);
  }
}

function main() {
  runStep('native smoke', ['tests/native/windows-native-coverage-smoke.js'], {
    env: { CURSORCINE_NATIVE_COVERAGE_QUIET: '1' }
  });
  runStep('render html report', ['scripts/render-native-coverage-report.js']);
  runStep('print summary', ['scripts/print-native-coverage-summary.js'], { echoStdout: true });
  process.stdout.write('[native-coverage] done\n');
}

try {
  main();
} catch (error) {
  process.stderr.write('[native-coverage] failed: ' + (error && error.message ? error.message : String(error)) + '\n');
  process.exit(1);
}
