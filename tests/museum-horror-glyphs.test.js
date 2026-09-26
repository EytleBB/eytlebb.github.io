const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../js/museum-horror-glyphs.js');

test('all original pixel glyphs share a bounded five by seven cell', async () => {
  const { PIXEL_ALPHABET, PIXEL_ROWS } = await modulePromise;
  assert.equal(PIXEL_ALPHABET.length, PIXEL_ROWS.length);
  assert.equal(new Set(PIXEL_ALPHABET).size, PIXEL_ROWS.length);
  for (const rows of PIXEL_ROWS) {
    assert.equal(rows.length, 7);
    assert.ok(rows.every(row => row >= 0 && row < 32));
  }
});

test('animated glyph replacement cannot move cells or change their pixel scale', async () => {
  const { drawObfuscatedLine } = await modulePromise;
  for (const randomValue of [0, .5, .99999]) {
    const pixels = [];
    const context = { fillRect: (...rectangle) => pixels.push(rectangle) };
    drawObfuscatedLine(context, 8, 16, 24, 2, () => randomValue);
    assert.ok(pixels.length > 0);
    for (const [x, y, w, h] of pixels) {
      assert.equal(w, 2); assert.equal(h, 2);
      assert.equal((x - 16) % 2, 0); assert.equal((y - 24) % 2, 0);
      assert.ok(x >= 16 && x < 16 + 8 * 12 - 2);
      assert.ok(y >= 24 && y < 38);
      assert.ok((x - 16) % 12 < 10, 'each cell keeps its blank spacer column');
    }
  }
});

test('obfuscation never uses fallback Unicode or changes whitespace', async () => {
  const { scrambleMuseumText, PIXEL_ALPHABET } = await modulePromise;
  const source = '眼睛 Eye 이름\n A\t👁';
  const result = Array.from(scrambleMuseumText(source));
  for (const [index, character] of Array.from(source).entries()) {
    if (/\s/u.test(character)) assert.equal(result[index], character);
    else assert.ok(PIXEL_ALPHABET.includes(result[index]));
  }
});
