const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');

test('CS-Scout is available as an external website tool', () => {
  assert.match(main, /name: 'CS-Scout', nameEn: 'CS-Scout', nameKo: 'CS-Scout'/);
  assert.match(main, /url: 'https:\/\/scout\.eytle\.cn\/', external: true/);
  assert.match(main, /icon: 'images\/cs-scout-icon\.webp'/);
});
