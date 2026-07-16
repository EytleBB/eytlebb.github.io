const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

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
