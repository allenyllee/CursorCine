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

function escHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function parseCoverageXml(xml) {
  const rootMatch = xml.match(/<coverage\b[^>]*>/i);
  if (!rootMatch) {
    throw new Error('Invalid cobertura xml: missing <coverage> root tag.');
  }
  const rootAttrs = parseAttrs(rootMatch[0]);

  const classes = [];
  const classRe = /<class\b[^>]*>/gi;
  let cm;
  while ((cm = classRe.exec(xml))) {
    const attrs = parseAttrs(cm[0]);
    classes.push({
      filename: String(attrs.filename || attrs.name || 'unknown'),
      name: String(attrs.name || ''),
      lineRate: Number(attrs['line-rate'] || 0),
      branchRate: Number(attrs['branch-rate'] || 0),
      complexity: Number(attrs.complexity || 0)
    });
  }

  classes.sort((a, b) => a.filename.localeCompare(b.filename));

  return {
    generatedAt: new Date().toISOString(),
    lineRate: Number(rootAttrs['line-rate'] || 0),
    branchRate: Number(rootAttrs['branch-rate'] || 0),
    linesCovered: Number(rootAttrs['lines-covered'] || 0),
    linesValid: Number(rootAttrs['lines-valid'] || 0),
    branchesCovered: Number(rootAttrs['branches-covered'] || 0),
    branchesValid: Number(rootAttrs['branches-valid'] || 0),
    complexity: Number(rootAttrs.complexity || 0),
    classes
  };
}

function renderHtml(data, sourcePath) {
  const rows = data.classes.map((c) => {
    return '<tr>' +
      '<td><code>' + escHtml(c.filename) + '</code></td>' +
      '<td>' + toPercent(c.lineRate) + '</td>' +
      '<td>' + toPercent(c.branchRate) + '</td>' +
      '<td>' + escHtml(c.complexity) + '</td>' +
    '</tr>';
  }).join('\n');

  return '<!doctype html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8" />\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
    '  <title>Native Coverage Report</title>\n' +
    '  <style>\n' +
    '    body{font-family:Segoe UI,Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:24px;}\n' +
    '    h1{margin:0 0 12px;}\n' +
    '    .meta{margin:0 0 16px;color:#94a3b8;}\n' +
    '    .cards{display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:12px;margin-bottom:18px;}\n' +
    '    .card{background:#111827;border:1px solid #334155;border-radius:8px;padding:10px 12px;}\n' +
    '    .label{font-size:12px;color:#94a3b8;}\n' +
    '    .val{font-size:20px;font-weight:700;}\n' +
    '    table{width:100%;border-collapse:collapse;background:#111827;border:1px solid #334155;border-radius:8px;overflow:hidden;}\n' +
    '    th,td{padding:8px 10px;border-bottom:1px solid #1f2937;text-align:left;}\n' +
    '    th{background:#0b1220;color:#93c5fd;}\n' +
    '    tr:last-child td{border-bottom:none;}\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <h1>Native Coverage Report (Windows Addons)</h1>\n' +
    '  <p class="meta">Source: <code>' + escHtml(sourcePath) + '</code> | Generated: ' + escHtml(data.generatedAt) + '</p>\n' +
    '  <div class="cards">\n' +
    '    <div class="card"><div class="label">Line Coverage</div><div class="val">' + toPercent(data.lineRate) + '</div></div>\n' +
    '    <div class="card"><div class="label">Branch Coverage</div><div class="val">' + toPercent(data.branchRate) + '</div></div>\n' +
    '    <div class="card"><div class="label">Lines</div><div class="val">' + escHtml(data.linesCovered + ' / ' + data.linesValid) + '</div></div>\n' +
    '  </div>\n' +
    '  <table>\n' +
    '    <thead><tr><th>File</th><th>Line Rate</th><th>Branch Rate</th><th>Complexity</th></tr></thead>\n' +
    '    <tbody>' + rows + '</tbody>\n' +
    '  </table>\n' +
    '</body>\n' +
    '</html>\n';
}

function main() {
  const inputPath = readArg(2, path.join('coverage-native', 'native-windows-cobertura.xml'));
  const outputPath = readArg(3, path.join('coverage-native', 'index.html'));
  const jsonPath = readArg(4, path.join('coverage-native', 'summary.json'));

  if (!fs.existsSync(inputPath)) {
    throw new Error('Coverage xml not found: ' + inputPath);
  }

  const xml = fs.readFileSync(inputPath, 'utf8');
  const report = parseCoverageXml(xml);
  const html = renderHtml(report, inputPath);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  process.stdout.write('[native-coverage] HTML: ' + outputPath + '\n');
  process.stdout.write('[native-coverage] JSON: ' + jsonPath + '\n');
}

try {
  main();
} catch (error) {
  process.stderr.write('[native-coverage] failed: ' + (error && error.message ? error.message : String(error)) + '\n');
  process.exit(1);
}
