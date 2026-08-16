const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

test('Minecraft-style font is scoped only to patch-log content and controls', () => {
  const uses = css.match(/font-family:'PatchFont',monospace/g) || [];
  assert.equal(uses.length, 5);
  assert.match(css, /\.plog-card \.date[\s\S]*?font-family:'PatchFont'/);
  assert.match(css, /\.plog-card \.txt[\s\S]*?font-family:'PatchFont'/);
  assert.match(css, /\.cal-day-entry[\s\S]*?font-family:'PatchFont'/);
  assert.match(css, /\.reader \.r-date[\s\S]*?font-family:'PatchFont'/);
  assert.match(css, /\.reader \.r-body[\s\S]*?font-family:'PatchFont'/);
  assert.doesNotMatch(css, /\.lightbox-progress\s*\{[^}]*PatchFont/);
});
