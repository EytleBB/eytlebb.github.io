const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../js/museum-horror-ui.js');

test('visual gibberish preserves whitespace and Unicode character count', async () => {
  const { scrambleMuseumText } = await modulePromise;
  const source = 'Museum / 展览会\n A\t이름 👁';
  const corrupted = scrambleMuseumText(source, () => 0.42);
  assert.equal(Array.from(corrupted).length, Array.from(source).length);
  assert.deepEqual(Array.from(corrupted).filter(character => /\s/u.test(character)), Array.from(source).filter(character => /\s/u.test(character)));
  assert.ok(!corrupted.includes('Museum'));
  assert.ok(!corrupted.includes('展览会'));
  assert.equal(scrambleMuseumText('', () => 0), '');
});

test('constructing an inactive horror UI performs no DOM mutations or observer setup', async () => {
  const { createMuseumHorrorUI } = await modulePromise;
  const root = { ownerDocument: { body: {} } };
  const ui = createMuseumHorrorUI({ root });
  assert.doesNotThrow(() => {
    ui.update(1);
    ui.update(Number.NaN);
    ui.dispose();
  });
  assert.deepEqual(root, { ownerDocument: { body: {} } });
});
