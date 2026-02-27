#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function readArg(index, fallback) {
  const value = process.argv[index];
  return value && String(value).trim() ? String(value) : fallback;
}

function toPercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.00%';
  return (n * 100).toFixed(2) + '%';
}

function parseAttrs(tag) {
  const attrs = {};
  const attrRe = /(\w+(?:-\w+)*)="([^"]*)"/g;
  let m;
  while ((m = attrRe.exec(tag))) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function parseCoverageSummary(xml) {
  const rootMatch = xml.match(/<coverage\b[^>]*>/i);
  if (!rootMatch) {
    throw new Error('Invalid cobertura xml: missing <coverage> root tag.');
  }
  const attrs = parseAttrs(rootMatch[0]);
  return {
    lineRate: Number(attrs['line-rate'] || 0),
    branchRate: Number(attrs['branch-rate'] || 0),
    linesCovered: Number(attrs['lines-covered'] || 0),
    linesValid: Number(attrs['lines-valid'] || 0),
    branchesCovered: Number(attrs['branches-covered'] || 0),
    branchesValid: Number(attrs['branches-valid'] || 0)
  };
}

function main() {
  const inputPath = readArg(2, path.join('coverage-native', 'native-windows-cobertura.xml'));
  if (!fs.existsSync(inputPath)) {
    throw new Error('Coverage xml not found: ' + inputPath);
  }

  const xml = fs.readFileSync(inputPath, 'utf8');
  const summary = parseCoverageSummary(xml);

  process.stdout.write('Native Coverage Summary\n');
  process.stdout.write('  File: ' + inputPath + '\n');
  process.stdout.write('  Lines: ' + toPercent(summary.lineRate) + ' (' + summary.linesCovered + '/' + summary.linesValid + ')\n');
  process.stdout.write('  Branches: ' + toPercent(summary.branchRate) + ' (' + summary.branchesCovered + '/' + summary.branchesValid + ')\n');
}

try {
  main();
} catch (error) {
  process.stderr.write('[native-coverage-summary] failed: ' + (error && error.message ? error.message : String(error)) + '\n');
  process.exit(1);
}
