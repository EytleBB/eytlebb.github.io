const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../js/museum-destruction.js', `file://${__filename}`), 'utf8')
  .replace(/^import .*?;\n/gm, '').replaceAll('export ', '');

function harness() {
  const calls = { owners: [], halls: [] };
  class Empty {}
  const context = vm.createContext({
    THREE: { Raycaster: Empty, Vector2: Empty, Vector3: Empty, Matrix4: Empty },
    createMuseumPhysics() {
      return { removeOwner(owner) { calls.owners.push(owner); },
        syncHall(...args) { calls.halls.push(args); } };
    },
  });
  vm.runInContext(`${source}\nthis.createMuseumDestruction = createMuseumDestruction;`, context);
  return { calls, destruction: context.createMuseumDestruction({ scene: {}, camera: {} }) };
}

test('finale cleanup removes slot debris without restoring broken hanging props or lamps', () => {
  const { calls, destruction } = harness();
  const roots = [{ visible: false }, { visible: false }];
  const fixture = { broken: true, group: { visible: false }, lightActive: false };
  const record = { broken: true, roots, visible: [true, true], fixture,
    fixtureState: { visible: true, lightActive: true } };
  const slot = { destructibles: [record] };
  destruction.removeSlotDebris(slot);
  assert.deepEqual(calls.owners, [slot]);
  assert.equal(record.broken, true);
  assert.ok(roots.every(root => root.visible === false));
  assert.equal(fixture.broken, true);
  assert.equal(fixture.group.visible, false);
  assert.equal(fixture.lightActive, false);
});

test('destruction passes both hall ends to physics and leaves the ordinary front unbounded', () => {
  const { calls, destruction } = harness();
  const chunks = [0, -14].map(z => ({ group: { position: { z } } }));
  destruction.syncHall(chunks, 7, -21);
  assert.deepEqual(Array.from(calls.halls[0][0]), [0, -7, -14, -21]);
  assert.equal(calls.halls[0][1], 7);
  assert.equal(calls.halls[0][2], -21);
  destruction.syncHall(chunks, 7);
  assert.equal(calls.halls[1][2], null);
});
