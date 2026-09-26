const test = require('node:test');
const assert = require('node:assert/strict');
const ready = import('../js/museum-break-sound.js');

function harness() {
  const sources = [], gains = [];
  const buffer = { duration: 8 };
  let fetches = 0, decodes = 0;
  const context = {
    state: 'running',
    async decodeAudioData() { decodes++; return buffer; },
    createGain() {
      const gain = { gain: { value: .5 }, connect(target) { this.target = target; }, disconnect() { this.disconnected = true; } };
      gains.push(gain); return gain;
    },
    createBufferSource() {
      const source = { playbackRate: { value: .5 }, starts: 0, stops: 0,
        connect(target) { this.target = target; }, disconnect() { this.disconnected = true; },
        start() { this.starts++; }, stop() { this.stops++; } };
      sources.push(source); return source;
    },
  };
  return { context, output: {}, sources, gains, buffer,
    fetchAudio: async () => { fetches++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; },
    get fetches() { return fetches; }, get decodes() { return decodes; } };
}

test('the first twelve newly broken props are silent; every later break plays the original once at unity volume', async () => {
  const { createMuseumBreakSound } = await ready, h = harness();
  const sound = createMuseumBreakSound(h);sound.setEnabled(true);
  for (let n = 1; n <= 12; n++) assert.equal(await sound.breakObject(), false);
  assert.equal(h.sources.length, 0);
  for (let n = 13; n <= 16; n++) assert.equal(await sound.breakObject(), true);
  assert.equal(h.sources.length, 4);assert.equal(h.fetches, 1);assert.equal(h.decodes, 1);
  assert.equal(h.gains.length, 1);assert.equal(h.gains[0].gain.value, 1);assert.equal(h.gains[0].target, h.output);
  for (const source of h.sources) {
    assert.equal(source.buffer, h.buffer);assert.equal(source.loop, false);
    assert.equal(source.starts, 1);assert.equal(source.playbackRate.value, 1);
    assert.equal(source.target, h.gains[0]);
  }
  // Previous clips finish normally even if a new object is broken meanwhile.
  assert.ok(h.sources.every(source => source.stops === 0));
  h.sources[0].onended();assert.equal(h.sources[0].disconnected, true);
  sound.dispose();assert.ok(h.sources.every(source => source.disconnected));
  assert.equal(h.gains[0].disconnected, true);
});

test('pause cancels active and still-loading sounds, but keeps the count for resume', async () => {
  const { createMuseumBreakSound } = await ready, h = harness();
  let finish;
  const sound = createMuseumBreakSound({ ...h, fetchAudio: () => new Promise(resolve => { finish = resolve; }) });
  sound.setEnabled(true);
  const pending = Array.from({ length: 13 }, () => sound.breakObject());
  sound.setEnabled(false);sound.setEnabled(true);
  finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  assert.deepEqual(await Promise.all(pending), Array(13).fill(false));
  assert.equal(h.sources.length, 0);
  assert.equal(await sound.breakObject(), true);
  sound.setEnabled(false);assert.equal(h.sources[0].stops, 1);
  assert.equal(await sound.breakObject(), false);
  sound.setEnabled(true);assert.equal(h.sources.length, 1, 'resume does not replay a muted hit');
  assert.equal(await sound.breakObject(), true);
  sound.dispose();assert.equal(await sound.breakObject(), false);
});

test('disposing during decode cannot start a late sound; a fresh visit starts its count from zero', async () => {
  const { createMuseumBreakSound } = await ready, h = harness();
  let finish;
  h.context.decodeAudioData = () => new Promise(resolve => { finish = resolve; });
  const sound = createMuseumBreakSound(h);sound.setEnabled(true);
  const pending = Array.from({length:13}, () => sound.breakObject());
  await new Promise(resolve => setImmediate(resolve));
  sound.dispose();finish(h.buffer);
  assert.deepEqual(await Promise.all(pending), Array(13).fill(false));
  assert.equal(h.sources.length, 0);
  const fresh = harness(), next = createMuseumBreakSound(fresh);next.setEnabled(true);
  for (let n=0;n<12;n++) assert.equal(await next.breakObject(), false);
  assert.equal(fresh.sources.length, 0);next.dispose();
});

test('finale uses the cached clip at unity without fetching again or advancing the destruction count', async () => {
  const { createMuseumBreakSound } = await ready, h = harness();
  const sound = createMuseumBreakSound(h);
  sound.setEnabled(true);
  assert.equal(sound.finale(), false, 'an uncached ending never queues a late clip');
  assert.equal(h.fetches, 0);
  assert.equal(await sound.breakObject(), false);
  assert.equal(sound.finale(), true);
  assert.equal(h.sources.length, 1);
  assert.equal(h.sources[0].buffer, h.buffer);
  assert.equal(h.sources[0].starts, 1);
  assert.equal(h.sources[0].playbackRate.value, 1);
  assert.equal(h.gains[0].gain.value, 1);
  assert.equal(h.gains[0].target, h.output);
  for (let n = 2; n <= 12; n++) assert.equal(await sound.breakObject(), false);
  assert.equal(h.sources.length, 1, 'finale is not counted as a newly destroyed object');
  assert.equal(await sound.breakObject(), true);
  assert.equal(h.sources.length, 2);
  assert.equal(h.fetches, 1); assert.equal(h.decodes, 1);
  sound.dispose();
});

test('finale replaces overlapping break clips and respects pause, suspension and disposal', async () => {
  const { createMuseumBreakSound } = await ready, h = harness();
  const sound = createMuseumBreakSound(h);
  sound.setEnabled(true);
  for (let n = 1; n <= 16; n++) await sound.breakObject();
  assert.equal(h.sources.length, 4);
  assert.equal(sound.finale(), true);
  assert.equal(h.sources.length, 5);
  assert.ok(h.sources.slice(0, 4).every(source => source.stops === 1 && source.disconnected));
  assert.equal(h.sources[4].stops, 0);
  assert.equal(h.gains.length, 1);
  sound.setEnabled(false);
  assert.equal(h.sources[4].stops, 1);
  assert.equal(sound.finale(), false);
  sound.setEnabled(true);
  h.context.state = 'suspended';
  assert.equal(sound.finale(), false);
  h.context.state = 'running';
  assert.equal(h.sources.length, 5, 'resume never replays the ending');
  assert.equal(sound.finale(), true);
  sound.dispose();
  assert.equal(h.sources[5].stops, 1);
  sound.setEnabled(true);
  assert.equal(sound.finale(), false);
  assert.equal(h.sources.length, 6);
});

test('an ending during decode cancels waiting break requests and never starts a late scream', async () => {
  const { createMuseumBreakSound } = await ready, h = harness();
  let finish;
  h.context.decodeAudioData = () => new Promise(resolve => { finish = resolve; });
  const sound = createMuseumBreakSound(h);
  sound.setEnabled(true);
  const pending = Array.from({ length: 13 }, () => sound.breakObject());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sound.finale(), false, 'decode is still in progress');
  finish(h.buffer);
  assert.deepEqual(await Promise.all(pending), Array(13).fill(false));
  assert.equal(h.sources.length, 0, 'finishing decode does not play any previously queued hit');
  sound.setEnabled(false); sound.setEnabled(true);
  assert.equal(h.sources.length, 0);
  assert.equal(sound.finale(), true, 'an explicit later call may use the now-cached buffer');
  sound.dispose();
});
