const test = require('node:test');
const assert = require('node:assert/strict');
const ready = import('../js/museum-horror-presence-audio.js');

function harness({ rate = 48000, state = 'running', panner = true } = {}) {
  const nodes = [], buffers = [];
  const parameter = value => ({ value, cancellations: 0,
    cancelScheduledValues() { this.cancellations++; },
    setValueAtTime(next) { this.value = next; },
  });
  const node = (kind, props = {}) => {
    const value = { kind, targets: [], disconnected: false,
      connect(target) { this.targets.push(target); return target; },
      disconnect() { this.targets = []; this.disconnected = true; }, ...props };
    nodes.push(value); return value;
  };
  const output = node('existing-listener');
  const context = {
    sampleRate: rate, state, currentTime: 0,
    createGain: () => node('gain', { gain: parameter(1) }),
    createWaveShaper: () => node('limiter'),
    createBuffer(channels, length, sampleRate) {
      assert.equal(channels, 1); assert.equal(sampleRate, rate);
      const data = new Float32Array(length), buffer = { duration: length / rate, getChannelData: channel => {
        assert.equal(channel, 0); return data;
      } };
      buffers.push(buffer); return buffer;
    },
    createBufferSource: () => node('source', { playbackRate: parameter(1), starts: 0, stops: 0, buffer: null,
      start(time) { this.startedAt = time; this.duration = this.buffer.duration / this.playbackRate.value; this.starts++; },
      stop() { this.stops++; },
    }),
  };
  if (panner) context.createPanner = () => node('panner', {
    positionX: parameter(0), positionY: parameter(0), positionZ: parameter(0),
  });
  const sources = () => nodes.filter(item => item.kind === 'source');
  const advance = seconds => {
    context.currentTime += seconds;
    for (const source of sources()) {
      if (source.onended && source.startedAt + source.duration <= context.currentTime) source.onended();
    }
  };
  return { context, output, nodes, buffers, sources, advance };
}

function run(audio, h, seconds, progress = 0) {
  for (let i = 0; i < Math.round(seconds * 20); i++) {
    h.advance(.05); audio.update(.05, { progress });
  }
}

test('ambience allocates only after an enabled running visit asks for a sound', async () => {
  const { createMuseumHorrorPresenceAudio } = await ready, h = harness({ state: 'suspended' });
  const audio = createMuseumHorrorPresenceAudio(h);
  audio.update(10); audio.cue('whisper', { z: 2 });
  audio.setEnabled(true); audio.update(.1); audio.cue('step');
  assert.equal(h.nodes.length, 1); assert.equal(h.buffers.length, 0);
  h.context.state = 'running';
  audio.cue('unknown'); run(audio, h, .4);
  assert.equal(h.nodes.length, 1, 'enabling alone does not start playback');
  audio.cue('whisper', { x: 1, y: 1.6, z: 3 });
  assert.equal(h.sources().length, 1);
  assert.equal(h.nodes.filter(node => node.kind === 'limiter').length, 1);
  assert.equal(h.nodes.filter(node => node.kind === 'gain' && node.targets.includes(h.output)).length, 1);
  audio.dispose();
  assert.equal(h.output.disconnected, false, 'the shared listener belongs to the caller');
});

test('disable silences the master immediately, stops live voices and waits before a resumed heartbeat', async () => {
  const { createMuseumHorrorPresenceAudio } = await ready, h = harness();
  const audio = createMuseumHorrorPresenceAudio(h);
  audio.setEnabled(true); audio.cue('whisper'); audio.cue('sighting');
  const gate = h.nodes.find(node => node.kind === 'gain' && node.targets.includes(h.output));
  audio.setEnabled(false);
  assert.equal(gate.gain.value, 0);
  assert.ok(h.sources().every(source => source.stops === 1 && source.disconnected && source.buffer === null));
  const count = h.sources().length;
  run(audio, h, 20); audio.cue('step');
  assert.equal(h.sources().length, count);
  audio.setEnabled(true); run(audio, h, .4, 1);
  assert.equal(h.sources().length, count, 'resuming never replays missed pulses or scene cues');
  run(audio, h, .35, 1);
  assert.equal(h.sources().length, count + 1);
  assert.equal(gate.gain.value, .8);
  audio.dispose();
});

test('suspension and long render gaps drain voices without a burst on return', async () => {
  const { createMuseumHorrorPresenceAudio } = await ready;
  for (const pause of ['suspended', 'gap', 'invalid']) {
    const h = harness(), audio = createMuseumHorrorPresenceAudio(h);
    audio.setEnabled(true); run(audio, h, .7); audio.cue('whisper');
    const count = h.sources().length;
    if (pause === 'suspended') { h.context.state = 'suspended'; audio.update(.05); }
    if (pause === 'gap') { h.context.currentTime += 30; audio.update(.05); }
    if (pause === 'invalid') audio.update(Infinity);
    assert.ok(h.sources().every(source => source.stops === 1 && source.disconnected));
    h.context.state = 'running'; run(audio, h, .4, 1);
    assert.equal(h.sources().length, count);
    run(audio, h, .35, 1);
    assert.equal(h.sources().length, count + 1);
    audio.dispose();
  }
});

test('rapid scene cues retain at most six voices and release naturally ended sources', async () => {
  const { createMuseumHorrorPresenceAudio } = await ready, h = harness();
  const audio = createMuseumHorrorPresenceAudio(h);
  audio.setEnabled(true);
  for (let i = 0; i < 20; i++) audio.cue(i % 2 ? 'whisper' : 'step', { z: i });
  assert.equal(h.sources().length, 20);
  assert.equal(h.sources().filter(source => !source.disconnected).length, 6);
  assert.equal(h.sources().filter(source => source.stops === 1).length, 14);
  assert.equal(h.buffers.length, 2, 'bounded immutable samples are reused for repeated cues');
  const active = h.sources().filter(source => !source.disconnected), ended = active[0].onended;
  ended(); ended();
  assert.equal(active[0].buffer, null); assert.equal(active[0].onended, null);
  assert.equal(active[0].stops, 0, 'natural completion does not stop a finished source');
  h.advance(2);
  assert.ok(h.sources().every(source => source.disconnected));
  audio.dispose(); audio.dispose();
  assert.ok(h.nodes.slice(1).every(node => node.disconnected));
  assert.ok(h.sources().every(source => source.stops <= 1));
  const count = h.nodes.length;
  audio.setEnabled(true); audio.cue('whisper'); audio.update(.1);
  assert.equal(h.nodes.length, count);
});

test('heartbeat becomes faster with progress and update does not schedule scene whispers or footsteps', async () => {
  const { createMuseumHorrorPresenceAudio } = await ready;
  const counts = [];
  for (const progress of [0, 1]) {
    const h = harness(), audio = createMuseumHorrorPresenceAudio(h);
    audio.setEnabled(true); run(audio, h, 8, progress);
    counts.push(h.sources().length);
    assert.equal(h.buffers.length, 1, 'only the heartbeat owns a repeating schedule');
    assert.ok(h.sources().length >= 4 && h.sources().length <= 10);
    const peakGain = Math.max(...h.nodes.filter(node => node.kind === 'gain' && node !== h.nodes[1] && !node.targets.includes(h.output)).map(node => node.gain.value));
    assert.ok(peakGain <= .115);
    audio.dispose();
  }
  assert.ok(counts[1] >= counts[0] + 3, 'late pursuit sounds increasingly urgent');
});

test('world cues use the existing listener in HRTF and reject nonfinite position/progress values', async () => {
  const { createMuseumHorrorPresenceAudio } = await ready, h = harness();
  const audio = createMuseumHorrorPresenceAudio(h);
  audio.setEnabled(true); audio.update(.05, { progress: NaN });
  audio.cue('sighting', { x: Infinity, y: NaN, z: 4 });
  const panner = h.nodes.find(node => node.kind === 'panner');
  assert.equal(panner.panningModel, 'HRTF'); assert.equal(panner.distanceModel, 'inverse');
  assert.equal(panner.positionX.value, 0); assert.equal(panner.positionY.value, 0); assert.equal(panner.positionZ.value, 4);
  assert.ok(panner.targets.includes(h.nodes[1]));
  assert.ok(h.nodes.filter(node => node.kind === 'gain').every(node => Number.isFinite(node.gain.value)));
  audio.dispose();
  const fallback = harness({ panner: false }), fallbackAudio = createMuseumHorrorPresenceAudio(fallback);
  fallbackAudio.setEnabled(true); fallbackAudio.cue('step', { z: 4 });
  assert.equal(fallback.sources().length, 1);
  fallbackAudio.dispose();
});

test('finite softly enveloped samples and a shared limiter keep every cue below the master headroom budget', async () => {
  const { createMuseumHorrorPresenceAudio } = await ready;
  for (const rate of [8000, 22050, 44100, 48000, 96000]) {
    const h = harness({ rate }), audio = createMuseumHorrorPresenceAudio(h);
    audio.setEnabled(true); run(audio, h, .7, 100);
    for (const kind of ['step', 'whisper', 'sighting']) audio.cue(kind);
    assert.equal(h.buffers.length, 4);
    for (const buffer of h.buffers) {
      const samples = buffer.getChannelData(0);
      assert.equal(samples[0], 0); assert.equal(samples.at(-1), 0);
      assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) <= .720001));
      assert.ok(samples.some(value => Math.abs(value) > .5));
      assert.ok(buffer.duration <= 1.051, 'all cues have finite short tails');
    }
    const limiter = h.nodes.find(node => node.kind === 'limiter');
    assert.equal(limiter.curve[1024], 0, 'silence stays silent');
    assert.ok(limiter.curve.every(value => Number.isFinite(value) && Math.abs(value) <= .24));
    const gate = h.nodes.find(node => node.kind === 'gain' && node.targets.includes(h.output));
    const maxLimited = Math.max(...limiter.curve.map(value => Math.abs(value))) * gate.gain.value;
    assert.ok(maxLimited < .193, 'the entire ambience mix reserves generous room for museum music');
    const sourceGains = h.sources().map(source => source.targets[0].gain.value);
    assert.ok(sourceGains.every(value => value <= .141));
    audio.dispose();
  }
});
