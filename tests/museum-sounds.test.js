const test = require('node:test');
const assert = require('node:assert/strict');
const ready = import('../js/museum-sounds.js');

function contextHarness() {
  const nodes = [], sources = [], buffers = [];
  const param = value => ({ value, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } });
  function node(type, extra = {}) {
    const result = { type, targets: [], disconnected: false,
      connect(target) { this.targets.push(target); }, disconnect() { this.disconnected = true; }, ...extra };
    nodes.push(result); return result;
  }
  const context = {
    currentTime: 0, state: 'running', sampleRate: 24000,
    createDynamicsCompressor: () => node('compressor', Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(k => [k, param(0)]))),
    createWaveShaper: () => node('limiter'),
    createGain: () => node('gain', { gain: param(1) }),
    createStereoPanner: () => node('stereo', { pan: param(0) }),
    createPanner: () => node('spatial', { positionX: param(0), positionY: param(0), positionZ: param(0) }),
    createBuffer(channels, length, sampleRate) {
      const result = { duration: length / sampleRate, copyToChannel(data) { this.data = data; } };
      buffers.push(result); return result;
    },
    createBufferSource() {
      const result = node('source', { playbackRate: param(1), starts: 0, stops: 0,
        start() { this.starts++; }, stop() { this.stops++; } });
      sources.push(result); return result;
    },
  };
  return { context, nodes, sources, buffers, output: {} };
}
const impact = (values = {}) => ({ kind: 'artwork', speed: 4, mass: 3, position: { x: 1, y: .006, z: -2 }, ...values });
const create = (module, h) => module.createMuseumSounds({ ...h, listenerPosition: { x: 0, y: 1.65, z: 0 } });

test('six original sounds have finite, bounded waveforms, audible energy and silent endpoints', async () => {
  const { createMuseumSoundSamples } = await ready;
  const fingerprints = new Set();
  for (const rate of [22050, 44100, 48000]) for (const kind of ['light', 'heavy', 'artwork', 'lamp', 'plaque', 'title']) {
    for (let v = 0; v < 3; v++) {
      const data = createMuseumSoundSamples(kind, rate, v);
      assert.equal(data[0], 0); assert.equal(data.at(-1), 0);
      assert.ok(data.every(Number.isFinite));
      const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
      assert.ok(rms > .035 && rms < .3, `${kind} RMS ${rms}`);
      assert.ok(data.every(value => Math.abs(value) <= .781));
      fingerprints.add([...data.slice(10, 20)].join(','));
    }
  }
  assert.equal(fingerprints.size, 54);
});

test('effects are lazy, obey pause/suspension, and never replay an interrupted source', async () => {
  const module = await ready, h = contextHarness(), sounds = create(module, h);
  assert.equal(sounds.swing('light'), false);
  assert.equal(h.nodes.length, 0);
  sounds.setEnabled(true);
  h.context.state = 'suspended';
  assert.equal(sounds.swing('heavy'), false);
  h.context.state = 'running';
  assert.equal(sounds.swing('light'), true);
  assert.ok(h.nodes.find(n => n.type === 'limiter').targets.includes(h.output));
  sounds.setEnabled(false);
  assert.equal(h.sources[0].stops, 1);
  assert.ok(h.nodes.filter(n => n.type !== 'compressor' && n.type !== 'limiter').every(n => n.disconnected));
  sounds.setEnabled(true);
  assert.equal(h.sources.length, 1, 'no replay on resume');
  sounds.swing('heavy');
  sounds.dispose(); sounds.dispose(); sounds.setEnabled(true);
  assert.equal(sounds.swing('light'), false);
  assert.ok(h.nodes.every(n => n.disconnected));
});

test('impacts use spatial audio, stronger collisions are louder, and distant or invalid impacts stay silent', async () => {
  const module = await ready, h = contextHarness(), sounds = create(module, h);
  sounds.setEnabled(true);
  sounds.floorImpact(impact({ speed: 1 }));
  sounds.floorImpact(impact({ speed: 6 }));
  const gains = h.nodes.filter(n => n.type === 'gain');
  assert.ok(gains[1].gain.value > gains[0].gain.value * 2);
  const panner = h.nodes.find(n => n.type === 'spatial');
  assert.equal(panner.positionX.value, 1); assert.equal(panner.positionZ.value, -2);
  assert.equal(panner.panningModel, 'HRTF');
  for (const values of [{ speed: .2 }, { speed: NaN }, { mass: -1 }, { kind: 'wall' }, { position: { x: 0, y: 0, z: 90 } }]) {
    assert.equal(sounds.floorImpact(impact(values)), false);
  }
  assert.equal(h.sources.length, 2);
  sounds.dispose();
});

test('a pile of 64 impacts has bounded voices, preserves the knife, and releases and reuses buffers', async () => {
  const module = await ready, h = contextHarness(), sounds = create(module, h);
  sounds.setEnabled(true);
  for (let i = 0; i < 64; i++) sounds.floorImpact(impact());
  assert.equal(h.sources.length, 14);
  assert.equal(h.buffers.length, 3, 'three variants shared across all artwork sounds');
  assert.equal(sounds.swing('light'), true);
  assert.equal(sounds.swing('heavy'), true);
  assert.equal(sounds.swing('light'), false);
  for (const source of [...h.sources]) source.onended();
  assert.ok(h.nodes.filter(n => n.type !== 'compressor' && n.type !== 'limiter').every(n => n.disconnected));
  assert.equal(sounds.floorImpact(impact()), true);
  assert.equal(h.buffers.length, 5);
  // Even if an ended event is delayed, elapsed voices must not consume the cap.
  h.context.currentTime = 3;
  assert.equal(sounds.floorImpact(impact()), true);
  sounds.dispose();
});

test('the public finale trigger forwards the cached supplied clip through the master output', async (t) => {
  const module = await ready, h = contextHarness();
  const supplied = { duration: 8 };
  let fetches = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    fetches++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  h.context.decodeAudioData = async () => supplied;
  const sounds = create(module, h);
  assert.equal(sounds.finale(), false);
  sounds.setEnabled(true);
  assert.equal(await sounds.breakObject(), false);
  assert.equal(sounds.finale(), true);
  assert.equal(fetches, 1);
  assert.equal(h.sources.length, 1);
  assert.equal(h.sources[0].buffer, supplied);
  assert.equal(h.sources[0].starts, 1);
  const gain = h.nodes.find(node => node.type === 'gain');
  assert.equal(gain.gain.value, 1);
  assert.deepEqual(gain.targets, [h.output]);
  sounds.setEnabled(false);
  assert.equal(h.sources[0].stops, 1);
  assert.equal(sounds.finale(), false);
  sounds.dispose();
});

test('public horror preparation loads silently before entry and permits a later finale without breaking props', async (t) => {
  const module = await ready, h = contextHarness();
  const supplied = { duration: 5.43 };
  let fetches = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    fetches++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  h.context.decodeAudioData = async () => supplied;
  h.context.state = 'suspended';
  const sounds = create(module, h);
  assert.equal(await sounds.prepareHorror(), supplied);
  assert.equal(await sounds.prepareHorror(), supplied);
  assert.equal(fetches, 1);
  assert.equal(h.nodes.length, 0, 'buffering does not create any audible graph');
  h.context.state = 'running'; sounds.setEnabled(true);
  assert.equal(sounds.finale(), true);
  assert.equal(h.sources[0].buffer, supplied);
  assert.equal(h.sources[0].starts, 1);
  sounds.dispose();
});
