const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../js/museum-plaque-layout.js'), 'utf8');
const layout = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('labels stay to the viewer’s right on both walls, clear of frames and piers', async () => {
  const { plaquePlacement, PLAQUE_WIDTH } = await layout;
  for (const side of [-1, 1]) {
    for (const width of [0.35, 0.76, 1.08, 1.52, 2.16]) {
      for (const z of [-3.5, -10.5]) {
        const p = plaquePlacement(side, width, 0.062, z);
        const rightOffset = (p.z - z) * side;
        assert.ok(rightOffset - PLAQUE_WIDTH / 2 >= width / 2 + 0.062 + 0.159);
        assert.ok(rightOffset + PLAQUE_WIDTH / 2 < 2.05, 'fits inside the wall panel');
        assert.equal(p.rotationY, -side * Math.PI / 2);
        assert.ok(Math.abs(p.x) > 2.6 && Math.abs(p.x) < 3, 'inside existing collision margin');
        assert.equal(p.y, 1.37);
      }
    }
  }
});

test('plaque focus gives readable scale while staying in front of the wall', async () => {
  const { plaquePlacement, PLAQUE_FOCUS_DISTANCE, PLAQUE_WIDTH } = await layout;
  for (const side of [-1, 1]) {
    const p = plaquePlacement(side, 2.16, 0.062, -3.5);
    const cameraX = p.x - side * PLAQUE_FOCUS_DISTANCE;
    assert.ok(Math.abs(cameraX) < 2.6);
    assert.ok(PLAQUE_FOCUS_DISTANCE < 1.7 / 2, 'more than twice the ordinary focus magnification');
    assert.ok(2 * Math.atan(PLAQUE_WIDTH / (2 * PLAQUE_FOCUS_DISTANCE)) > 0.7);
  }
});
