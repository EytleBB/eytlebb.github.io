const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');

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
