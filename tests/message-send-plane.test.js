const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('message button includes an accessible decorative paper plane', () => {
  assert.match(js, /class="msg-send-label"/);
  assert.match(js, /class="msg-plane"[^>]*aria-hidden="true"/);
  assert.match(js, /<path d="m22 2-7 20-4-8-8-4Z"><\/path>/);
});

test('paper plane lifts on hover and launches only after validation', () => {
  assert.match(css, /\.msg-send:hover \.msg-plane/);
  assert.match(css, /@keyframes message-plane-takeoff/);
  assert.match(js, /if \(!text\)[\s\S]*?return; \}\s*if \(hp\.value\) return;[\s\S]*?launchPlane\(\);/);
  assert.match(js, /btn\.classList\.add\('is-launching'\)/);
});
