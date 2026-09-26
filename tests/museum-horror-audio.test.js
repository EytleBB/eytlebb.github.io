const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ready = import('../js/museum-horror-audio.js');

function harness({ worklet = false, rejected = false, deferred = false } = {}) {
  const nodes = [], modules = [], posts = [];
  let resolveModule;
  const parameter = value => ({ value });
  const node = (type, props = {}) => {
    const result = { type, targets: [], disconnected: false,
      connect(target) { this.targets.push(target); },
      disconnect(target) {
        if (target) this.targets = this.targets.filter(item => item !== target);
        else { this.targets = []; this.disconnected = true; }
      }, ...props };
    nodes.push(result); return result;
  };
  const context = {
    createGain: () => node('gain', { gain: parameter(1) }),
    createWaveShaper: () => node('shaper'),
    createBiquadFilter: () => node('filter', { frequency: parameter(0), Q: parameter(0) }),
    createDelay: () => node('delay', { delayTime: parameter(0) }),
    createOscillator: () => node('oscillator', { frequency: parameter(0), starts: 0, stops: 0,
      start() { this.starts++; }, stop() { this.stops++; } }),
  };
  if (worklet) context.audioWorklet = { addModule(url) {
    modules.push(url);
    return deferred ? new Promise(resolve => { resolveModule = resolve; })
      : rejected ? Promise.reject(new Error('unavailable')) : Promise.resolve();
  } };
  class AudioWorkletNode {
    constructor(ctx, name, options) {
      assert.equal(ctx, context); assert.equal(name, 'museum-horror-crusher');
      assert.deepEqual(options.outputChannelCount, [2]);
      return node('worklet', { port: { closed: false, postMessage: value => posts.push(value), close() { this.closed = true; } } });
    }
  }
  const source = node('music'), originalOutput = {};
  source.connect(originalOutput);
  return { context, nodes, modules, posts, source, originalOutput, AudioWorkletNode, resolveModule: () => resolveModule() };
}

async function withWorklet(h, action) {
  const original = globalThis.AudioWorkletNode;
  globalThis.AudioWorkletNode = h.AudioWorkletNode;
  try { await action(); } finally { globalThis.AudioWorkletNode = original; }
}

test('normal visit has no graph or worklet request; activation preserves the original source until the caller reroutes it', async () => {
  const { createMuseumHorrorAudio, MUSEUM_HORROR_PLAYBACK_RATE } = await ready, h = harness({ worklet: true });
  const audio = createMuseumHorrorAudio({ context: h.context });
  assert.equal(h.nodes.length, 1); assert.equal(h.modules.length, 0);
  assert.ok(MUSEUM_HORROR_PLAYBACK_RATE < 1 && MUSEUM_HORROR_PLAYBACK_RATE > .6);
  await withWorklet(h, async () => {
    const [first, second] = await Promise.all([audio.enable(h.source), audio.enable(h.source)]);
    assert.equal(first, second); assert.equal(h.modules.length, 1);
    assert.ok(h.source.targets.includes(h.originalOutput));
    assert.equal(h.source.targets.length, 2);
    assert.equal(h.nodes.filter(n => n.type === 'worklet').length, 1);
    assert.equal(h.nodes.filter(n => n.type === 'oscillator').length, 0);
    assert.ok(first.curve.every(v => Number.isFinite(v) && Math.abs(v) <= .92));
    assert.equal(first.curve[Math.floor(first.curve.length / 2)], 0);
    const drive = h.nodes.find(n => n.type === 'gain');
    assert.ok(drive.gain.value > 1, 'horror music has makeup gain');
    await assert.rejects(audio.enable({ connect() {} }), /already has a source/);
    audio.dispose(); audio.dispose();
    assert.deepEqual(h.source.targets, [h.originalOutput], 'cleanup never disconnects the dry music path');
    assert.ok(h.nodes.slice(1).every(n => n.disconnected));
    assert.deepEqual(h.posts, ['stop']);
    assert.equal(await audio.enable(h.source), null);
  });
});

test('worklet absence and loading failure retain quantization, tremolo, bounded echoes and deterministic cleanup', async () => {
  const { createMuseumHorrorAudio } = await ready;
  for (const options of [{}, { worklet: true, rejected: true }]) {
    const h = harness(options), audio = createMuseumHorrorAudio({ context: h.context });
    await withWorklet(h, async () => {
      const output = await audio.enable(h.source);
      const crush = h.nodes.find(n => n.type === 'shaper' && n !== output);
      assert.ok(crush); assert.equal(new Set(crush.curve).size, 256);
      assert.equal(h.nodes.filter(n => n.type === 'delay').length, 2);
      const oscillator = h.nodes.find(n => n.type === 'oscillator');
      assert.equal(oscillator.starts, 1);
      audio.dispose(); assert.equal(oscillator.stops, 1);
      assert.ok(h.nodes.slice(1).every(n => n.disconnected));
    });
  }
});

test('late module completion after disposal cannot reconnect sound or allocate nodes', async () => {
  const { createMuseumHorrorAudio } = await ready, h = harness({ worklet: true, deferred: true });
  await withWorklet(h, async () => {
    const audio = createMuseumHorrorAudio({ context: h.context });
    const result = audio.enable(h.source);
    audio.dispose(); h.resolveModule();
    assert.equal(await result, null); assert.equal(h.nodes.length, 1);
    assert.deepEqual(h.source.targets, [h.originalOutput]);
  });
});

test('processor runtime failure swaps to the fallback once without interrupting output routing', async () => {
  const { createMuseumHorrorAudio } = await ready, h = harness({ worklet: true });
  await withWorklet(h, async () => {
    const audio = createMuseumHorrorAudio({ context: h.context }), output = await audio.enable(h.source);
    const processor = h.nodes.find(n => n.type === 'worklet');
    processor.onprocessorerror();
    assert.equal(processor.onprocessorerror, null); assert.equal(processor.disconnected, true);
    assert.equal(await audio.enable(h.source), output);
    assert.equal(h.nodes.filter(n => n.type === 'oscillator').length, 1);
    audio.dispose(); assert.ok(h.nodes.slice(1).every(n => n.disconnected));
  });
});

function processor(sampleRate) {
  let Processor;
  class AudioWorkletProcessor { constructor() { this.port = {}; } }
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/museum-horror-audio-worklet.js'), 'utf8'), {
    AudioWorkletProcessor, sampleRate, registerProcessor(name, Class) { assert.equal(name, 'museum-horror-crusher'); Processor = Class; },
  });
  return new Processor();
}

test('actual worklet DSP is finite, held at a reduced sample rate, stereo and silent after disposal', () => {
  for (const rate of [22050, 44100, 48000, 96000]) {
    const dsp = processor(rate), output = [new Float32Array(128), new Float32Array(128)];
    const left = Float32Array.from({ length: 128 }, (_, i) => Math.sin(i * .15) * .25);
    const right = Float32Array.from(left, v => -v);
    assert.equal(dsp.process([[left, right]], [output]), true);
    assert.ok(output.flatMap(c => [...c]).every(v => Number.isFinite(v) && Math.abs(v) <= 1));
    assert.ok(output[0].some(v => Math.abs(v) > .1));
    assert.ok(output[0].every((v, i) => Math.abs(v + output[1][i]) < 1e-6));
    const changes = output[0].filter((v, i) => i > 0 && v !== output[0][i - 1]).length;
    assert.ok(changes < 128 * 7000 / rate && changes > 128 * 4000 / rate, `capture rate ${changes} at ${rate}`);
    // Corrupt input and arbitrary block sizes never poison future output.
    dsp.process([[new Float32Array(512).fill(NaN)]], [[new Float32Array(512), new Float32Array(512)]]);
    const silent = [new Float32Array(256), new Float32Array(256)];
    dsp.process([[]], [silent]);
    assert.ok(silent.every(c => c.every(v => v === 0)));
    dsp.port.onmessage({ data: 'stop' });
    assert.equal(dsp.process([[left]], [output]), false);
  }
});
