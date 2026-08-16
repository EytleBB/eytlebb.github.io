const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

test('patch log preserves leading paragraph indentation', () => {
  assert.match(main, /function normalizeLogBody\(text\) \{ return text\.trimEnd\(\); \}/);
  assert.equal((main.match(/normalizeLogBody\(await r\.text\(\)\)/g) || []).length, 2);
  assert.match(css, /\.plog-card \.txt \{[\s\S]*?white-space:pre-wrap;[\s\S]*?\}/);
});

test('patch log content bypasses stale browser caches', () => {
  assert.match(main, /fetch\('\.\/logs\/index\.json', \{ cache: 'no-store' \}\)/);
  assert.match(main, /fetch\(`\.\/logs\/\$\{latest\}\.txt`, \{ cache: 'no-store' \}\)/);
  assert.match(main, /fetch\(`\.\/logs\/\$\{dateStr\}\.txt`, \{ cache: 'no-store' \}\)/);
  assert.match(html, /js\/main\.js\?v=forest-motion-20260816/);
});

test('day-mode patch log cards use a light frosted surface', () => {
  assert.match(css, /\[data-theme="day"\] \.patch-index-card \{ background:rgba\(248,252,255,\.52\); \}/);
  assert.match(css, /\[data-theme="day"\] \.patch-index-card:hover \{ background:rgba\(255,246,224,\.64\); \}/);
  assert.match(css, /\[data-theme="day"\] \.patch-calendar-card \{ background:rgba\(248,252,255,\.52\); \}/);
});

test('patch log uses data-driven year, month, and day levels', () => {
  assert.match(main, /function buildPatchlogIndex\(\)/);
  assert.match(main, /data-log-year=/);
  assert.match(main, /data-log-month=/);
  assert.match(main, /data-log-years/);
  assert.match(main, /data-log-year-crumb/);
});

test('patch log no longer renders every month from a fixed start date', () => {
  assert.doesNotMatch(main, /let y = 2026, m = 2/);
  assert.doesNotMatch(main, /while \(y < endY/);
});

test('log entry days are keyboard-accessible buttons', () => {
  assert.match(main, /<button class="\$\{cls\}" data-date="\$\{ds\}" aria-label="\$\{ds\}">/);
});

test('patch log layout avoids duplicated archive labels', () => {
  assert.match(main, /class="patchlog-surface/);
  assert.match(main, /patchlog-surface-calendar/);
  assert.doesNotMatch(main, /patch-index-number/);
  assert.doesNotMatch(main, /patch-entry-list/);
  assert.doesNotMatch(main, /cal-month-label/);
  assert.doesNotMatch(main, /按年份、月份和日期逐级浏览/);
});

test('patch log navigation is localized', () => {
  assert.match(html, /data-section="patchlog" data-zh="斑驳日志" data-en="Patch Log" data-ko="패치 로그"/);
});
