const test = require('node:test');
const assert = require('node:assert/strict');

const layout = import('../js/museum-lighting-layout.js');

test('recycled chunks keep their ceiling sources directly above world-locked floor pools', async () => {
  const { LIGHTING_LAYOUT: light, projectorStationsInChunk } = await layout;
  for (let cycle = -200; cycle <= 200; cycle++) {
    const origin = 58 + cycle * 14;
    const stations = projectorStationsInChunk(origin, 14);
    assert.equal(stations.length, 1);
    for (const localZ of stations) {
      const worldZ = origin + localZ;
      const distanceToPool = (worldZ - light.stationOffset) / light.stationSpacing;
      assert.equal(distanceToPool, Math.round(distanceToPool));
      assert.ok(localZ > -14 && localZ <= 0);
    }
  }
});

test('adjacent chunks own boundary lamps exactly once, including negative coordinates', async () => {
  const { projectorStationsInChunk } = await layout;
  for (const origin of [-28, -14.25, -1, 0, 0.5, 14, 58]) {
    const stations = [];
    for (let n = 0; n < 20; n++) {
      const chunkOrigin = origin - n * 14;
      stations.push(...projectorStationsInChunk(chunkOrigin, 14).map(z => z + chunkOrigin));
    }
    assert.equal(stations.length, 20);
    assert.equal(new Set(stations).size, 20);
    for (let n = 1; n < stations.length; n++) assert.equal(stations[n - 1] - stations[n], 14);
  }
});
