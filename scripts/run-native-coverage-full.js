#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

function resolveOpenCppCoverageExe() {
  const candidates = [
    path.join(process.env.ProgramFiles || '', 'OpenCppCoverage', 'OpenCppCoverage.exe'),
    path.join(process.env.ChocolateyInstall || '', 'lib', 'opencppcoverage', 'tools', 'OpenCppCoverage', 'OpenCppCoverage.exe')
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return '';
}

function collectNativeCoverage() {
  if (process.platform !== 'win32') {
    process.stdout.write('[native-coverage] collect native coverage skipped (not windows)\n');
    return;
  }

  const exe = resolveOpenCppCoverageExe();
  if (!exe) {
    throw new Error('OpenCppCoverage executable not found. Please install `opencppcoverage` first.');
  }

  const outputRoot = path.join('coverage-native');
  const outputHtml = path.join(outputRoot, 'html');
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.rmSync(outputHtml, { recursive: true, force: true });

  const args = [
    '--quiet',
    '--export_type', 'cobertura:coverage-native\\native-windows-cobertura.xml',
    '--export_type', 'html:coverage-native\\html',
    '--sources', 'native\\windows-hdr-capture\\src',
    '--sources', 'native\\windows-wgc-hdr-capture\\src',
    '--',
    'node',
    'tests/native/windows-native-coverage-smoke.js'
  ];

  process.stdout.write('[native-coverage] collect native coverage...\n');
  const child = spawnSync(exe, args, {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { CURSORCINE_NATIVE_COVERAGE_QUIET: '1' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (child.stderr) {
    process.stderr.write(child.stderr);
  }
  if (child.error) {
    throw new Error('collect native coverage failed: ' + child.error.message);
  }
  if (child.status !== 0) {
    if (child.stdout) {
      process.stdout.write(child.stdout);
    }
    throw new Error('collect native coverage failed with exit code ' + String(child.status));
  }
}

function main() {
  const skipBuild = String(process.env.CURSORCINE_NATIVE_SKIP_BUILD || "") === "1";
  if (!skipBuild) {
    runStep("build native addons", ["scripts/build-native-hdr-win.js"], {
      env: { CURSORCINE_NATIVE_BUILD_QUIET: "1" }
    });
  } else {
    process.stdout.write("[native-coverage] build native addons skipped\n");
  }
  collectNativeCoverage();
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
