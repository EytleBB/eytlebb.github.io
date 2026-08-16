const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function jpegDimensions(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = bytes.readUInt16BE(offset);
    if (sofMarkers.has(marker)) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw new Error(`JPEG dimensions not found: ${file}`);
}

test('day and night backgrounds are paired versioned 4K artwork', () => {
  const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.deepEqual(jpegDimensions('images/patchlog-bg-light.jpg'), { width: 3840, height: 2160 });
  assert.deepEqual(jpegDimensions('images/patchlog-bg-night.jpg'), { width: 3840, height: 2160 });
  assert.match(css, /patchlog-bg-light\.jpg\?v=background-4k-20260816/);
  assert.match(css, /patchlog-bg-night\.jpg\?v=background-4k-20260816/);
  assert.match(html, /css\/style\.css\?v=background-4k-20260816/);
});
