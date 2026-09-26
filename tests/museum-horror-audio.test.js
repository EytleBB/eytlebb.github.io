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
    const result = { kind: type, targets: [], disconnected: false,
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
    assert.equal(h.nodes.filter(n => n.kind === 'worklet').length, 1);
    assert.equal(h.nodes.filter(n => n.kind === 'oscillator').length, 0);
    assert.ok(first.curve.every(v => Number.isFinite(v) && Math.abs(v) <= .92));
    assert.equal(first.curve[Math.floor(first.curve.length / 2)], 0);
    const drive = h.nodes.find(n => n.kind === 'gain');
    assert.ok(drive.gain.value > 1, 'horror music has makeup gain');
    await assert.rejects(audio.enable({ connect() {} }), /already has a source/);
    audio.dispose(); audio.dispose();
    assert.deepEqual(h.source.targets, [h.originalOutput], 'cleanup never disconnects the dry music path');
    assert.ok(h.nodes.slice(1).every(n => n.disconnected));
    assert.deepEqual(h.posts, ['stop']);
    assert.equal(await audio.enable(h.source), null);
  });
});

test('worklet absence and loading failure retain pulse-shaped voices, zero-input silence and deterministic cleanup', async () => {
  const { createMuseumHorrorAudio } = await ready;
  for (const options of [{}, { worklet: true, rejected: true }]) {
    const h = harness(options), audio = createMuseumHorrorAudio({ context: h.context });
    await withWorklet(h, async () => {
      const output = await audio.enable(h.source);
      const voices = h.nodes.filter(n => n.kind === 'shaper' && n !== output);
      assert.equal(voices.length, 3);
      for (const { curve } of voices) {
        const center = (curve.length - 1) / 2;
        assert.equal(curve[center], 0, 'no oscillator leaks sound through a silent music source');
        assert.ok(curve.every(v => Number.isFinite(v) && Math.abs(v) <= .121));
        assert.ok(new Set(curve).size <= 32, 'voices retain coarse amplitude steps');
        assert.equal(curve[center + Math.round(center * .1)], curve[curve.length - 1], 'positive half-wave quickly reaches a pulse plateau');
        assert.equal(curve[center - Math.round(center * .1)], curve[0], 'negative half-wave has the matching plateau');
      }
      assert.equal(h.nodes.filter(n => n.kind === 'delay').length, 2);
      const oscillator = h.nodes.find(n => n.kind === 'oscillator');
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
    const processor = h.nodes.find(n => n.kind === 'worklet');
    processor.onprocessorerror();
    assert.equal(processor.onprocessorerror, null); assert.equal(processor.disconnected, true);
    assert.equal(await audio.enable(h.source), output);
    assert.equal(h.nodes.filter(n => n.kind === 'oscillator').length, 1);
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

function renderDSP(dsp, rate, seconds, signal, stereo = false) {
  const length = Math.round(rate * seconds), result = [new Float32Array(length), new Float32Array(length)];
  for (let frame = 0; frame < length; frame += 128) {
    const size = Math.min(128, length - frame);
    const left = signal ? Float32Array.from({ length: size }, (_, i) => signal((frame + i) / rate)) : null;
    const input = left ? stereo ? [left, Float32Array.from(left, value => -value)] : [left] : [];
    const output = [new Float32Array(size), new Float32Array(size)];
    assert.equal(dsp.process([input], [output]), true);
    for (let channel = 0; channel < 2; channel++) result[channel].set(output[channel], frame);
  }
  return result;
}

function toneMagnitude(data, rate, frequency) {
  let real = 0, imaginary = 0, windowSum = 0;
  for (let i = 0; i < data.length; i++) {
    const window = .5 - .5 * Math.cos(2 * Math.PI * i / (data.length - 1));
    const phase = 2 * Math.PI * frequency * i / rate;
    real += data[i] * window * Math.cos(phase);
    imaginary += data[i] * window * Math.sin(phase);
    windowSum += window;
  }
  return 2 * Math.hypot(real, imaginary) / windowSum;
}

test('off-key source tones are resynthesized as discrete semitones with pulse harmonics', () => {
  for (const rate of [44100, 48000]) {
    const dsp = processor(rate);
    for (const [sourceHz, noteHz] of [[447, 440], [485, 440 * 2 ** (2 / 12)]]) {
      const [left] = renderDSP(dsp, rate, .8, time => .15 * Math.sin(2 * Math.PI * sourceHz * time));
      const stable = left.subarray(Math.round(rate * .3));
      const fundamental = toneMagnitude(stable, rate, noteHz);
      const dryTone = toneMagnitude(stable, rate, sourceHz);
      const secondHarmonic = toneMagnitude(stable, rate, noteHz * 2);
      assert.ok(fundamental > .025, `note ${noteHz} is audible at ${rate}`);
      assert.ok(fundamental > dryTone * 8, `source ${sourceHz} snaps to ${noteHz}, instead of passing through as distorted audio`);
      assert.ok(secondHarmonic > fundamental * .4, 'resynthesized pulse has strong chip harmonics even when the source is a clean sine');
    }
  }
});

test('chip voices are silent without source music and release fully when it stops', () => {
  const rate = 48000, dsp = processor(rate);
  assert.ok(renderDSP(dsp, rate, .3, () => 0).every(channel => channel.every(value => value === 0)));
  renderDSP(dsp, rate, .4, time => .2 * Math.sin(2 * Math.PI * 440 * time));
  const silence = renderDSP(dsp, rate, 1, () => 0);
  assert.ok(silence.every(channel => channel.subarray(rate * .6).every(value => value === 0)), 'analysis history and note releases drain within a bounded time');
  assert.ok(renderDSP(dsp, rate, .3, null).every(channel => channel.every(value => value === 0)), 'missing input cannot restart a note');
});

test('synth remains finite across sample rates, stereo cancellation and invalid samples, then stops cleanly', () => {
  for (const rate of [22050, 44100, 48000, 96000]) {
    const dsp = processor(rate);
    const audible = renderDSP(dsp, rate, .4, time => .25 * Math.sin(2 * Math.PI * 440 * time), true);
    assert.ok(audible.every(channel => channel.every(value => Number.isFinite(value) && Math.abs(value) <= 1)));
    assert.ok(audible.every(channel => channel.some(value => Math.abs(value) > .05)), 'out-of-phase stereo does not cancel the analyzed melody');
    const corrupt = renderDSP(dsp, rate, .2, time => time < .1 ? NaN : Infinity);
    assert.ok(corrupt.every(channel => channel.every(value => Number.isFinite(value) && Math.abs(value) <= 1)));
    const recovered = renderDSP(dsp, rate, .4, time => .2 * Math.sin(2 * Math.PI * 440 * time));
    assert.ok(recovered.every(channel => channel.every(value => Number.isFinite(value) && Math.abs(value) <= 1)));
    assert.ok(recovered.every(channel => channel.some(value => Math.abs(value) > .05)), 'invalid input does not poison future note tracking');
    dsp.port.onmessage({ data: 'stop' });
    assert.equal(dsp.process([[new Float32Array(128)]], [[new Float32Array(128), new Float32Array(128)]]), false);
  }
});
