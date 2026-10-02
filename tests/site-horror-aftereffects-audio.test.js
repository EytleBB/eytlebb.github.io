const test = require('node:test');
const assert = require('node:assert/strict');
const ready = import('../js/site-horror-aftereffects-audio.js');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ state = 'suspended', pendingResume = null, pendingFetch = null, pendingDecode = null,
  rejectResume = false, rejectFetch = false, stereo = true } = {}) {
  const nodes = [], sources = [], buffers = [], events = new Map(), requests = [];
  let makes = 0, resumes = 0, decodes = 0, closes = 0;
  const parameter = initial => ({ value: initial, automation: [],
    cancelScheduledValues(time) { this.automation.push(['cancel', time]); },
    setValueAtTime(value, time) { this.value = value; this.automation.push(['set', value, time]); },
    linearRampToValueAtTime(value, time) { this.value = value; this.automation.push(['ramp', value, time]); },
  });
  const node = (kind, extra = {}) => {
    const result = { kind, targets: [], disconnected: false,
      connect(target) { this.targets.push(target); return target; },
      disconnect() { this.targets = []; this.disconnected = true; }, ...extra };
    nodes.push(result); return result;
  };
  const supplied = { duration: 5.43, tag: 'original-scream' };
  const context = {
    state, currentTime: 0, sampleRate: 24000, destination: { kind: 'destination' },
    resume() {
      resumes++;
      if (rejectResume) return Promise.reject(new Error('gesture denied'));
      if (pendingResume) return pendingResume.promise.then(() => { context.state = 'running'; events.get('statechange')?.(); });
      context.state = 'running'; return Promise.resolve();
    },
    close() { closes++; context.state = 'closed'; return Promise.resolve(); },
    addEventListener(name, action) { events.set(name, action); },
    removeEventListener(name, action) { if (events.get(name) === action) events.delete(name); },
    createGain: () => node('gain', { gain: parameter(1) }),
    createDynamicsCompressor: () => node('compressor', Object.fromEntries(
      ['threshold', 'knee', 'ratio', 'attack', 'release'].map(name => [name, parameter(0)]))),
    createWaveShaper: () => node('limiter'),
    createPanner: () => node('spatial', { positionX: parameter(0), positionY: parameter(0), positionZ: parameter(0) }),
    createBuffer(channels, length, rate) {
      assert.equal(channels, 1); assert.equal(rate, context.sampleRate);
      const samples = new Float32Array(length), buffer = { duration: length / rate, getChannelData: () => samples };
      buffers.push(buffer); return buffer;
    },
    createBufferSource() {
      const source = node('source', { buffer: null, playbackRate: parameter(1), starts: [], stops: 0,
        start(...args) { this.starts.push(args); }, stop() { this.stops++; },
      });
      sources.push(source); return source;
    },
    decodeAudioData(bytes) {
      assert.ok(bytes instanceof ArrayBuffer); decodes++;
      return pendingDecode ? pendingDecode.promise : Promise.resolve(supplied);
    },
  };
  if (stereo) context.createStereoPanner = () => node('stereo', { pan: parameter(0) });
  const response = { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
  const makeContext = () => { makes++; return context; };
  const fetchAudio = (url, options) => {
    requests.push({ url, options });
    if (rejectFetch) return Promise.reject(new Error('missing clip'));
    return pendingFetch ? pendingFetch.promise : Promise.resolve(response);
  };
  const changeState = state => { context.state = state; events.get('statechange')?.(); };
  const counts = () => ({ makes, resumes, decodes, closes, requests: requests.length });
  return { context, supplied, response, nodes, sources, buffers, events, requests, makeContext, fetchAudio, changeState, counts };
}

test('construction and event playback remain inert until unlock synchronously consumes a gesture', async () => {
  const { createAftereffectsAudio } = await ready, h = harness(), audio = createAftereffectsAudio(h);
  assert.equal(audio.ready, false); assert.equal(audio.hasScream, false);
  for (const kind of ['whisper', 'step', 'sighting', 'scream']) assert.equal(audio.play(kind), false);
  audio.stop();
  assert.deepEqual(h.counts(), { makes: 0, resumes: 0, decodes: 0, closes: 0, requests: 0 });
  assert.equal(h.nodes.length, 0);
  const promise = audio.unlock();
  assert.equal(h.counts().makes, 1); assert.equal(h.counts().resumes, 1, 'resume happens before unlock yields');
  assert.equal(await promise, true);
  assert.equal(audio.ready, true); assert.equal(audio.hasScream, true);
  assert.equal(h.sources.length, 0, 'unlock and preload never autoplay');
  assert.equal(h.nodes.length, 0, 'the audible graph is also lazy');
  assert.match(String(h.requests[0].url), /\/audio\/ccream\.mp3$/);
  audio.dispose();
});

test('simultaneous unlocks share one context, one preload and one decode', async () => {
  const { createAftereffectsAudio } = await ready, loading = deferred(), h = harness({ pendingFetch: loading });
  const audio = createAftereffectsAudio(h), first = audio.unlock(), second = audio.unlock();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  loading.resolve(h.response);
  assert.equal(await first, true);
  assert.equal(await audio.unlock(), true);
  assert.deepEqual(h.counts(), { makes: 1, resumes: 1, decodes: 1, closes: 0, requests: 1 });
  audio.dispose();
});

test('a blocked context and suspension cannot start or resurrect voices', async () => {
  const { createAftereffectsAudio } = await ready, denied = harness({ rejectResume: true });
  const blocked = createAftereffectsAudio(denied);
  assert.equal(await blocked.unlock(), false); assert.equal(blocked.ready, false);
  assert.equal(blocked.play('whisper'), false); assert.equal(denied.nodes.length, 0);
  blocked.dispose();
  const h = harness(), audio = createAftereffectsAudio(h);
  await audio.unlock(); assert.equal(audio.play('scream'), true);
  h.changeState('suspended');
  assert.equal(audio.ready, false);
  assert.ok(h.sources.every(source => source.stops === 1 && source.disconnected));
  assert.equal(audio.play('step'), false);
  h.changeState('running');
  assert.equal(h.sources.length, 1, 'resuming the context does not replay its interrupted clip');
  assert.equal(audio.play('step'), true);
  audio.dispose();
});

test('an unavailable scream fails synchronously and completing preload never queues that event', async () => {
  const { createAftereffectsAudio } = await ready, loading = deferred(), h = harness({ pendingFetch: loading });
  const audio = createAftereffectsAudio(h), unlocking = audio.unlock();
  assert.equal(audio.ready, true); assert.equal(audio.play('scream'), false);
  audio.stop(); loading.resolve(h.response);
  assert.equal(await unlocking, false, 'stop invalidates an in-flight unlock completion');
  assert.equal(audio.hasScream, true, 'silent preloading remains reusable');
  assert.equal(h.sources.length, 0);
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.play('scream'), true, 'only a new explicit event may use the decoded clip');
  audio.dispose();
});

test('stop during a pending resume cannot cause late playback and a later gesture can unlock again', async () => {
  const { createAftereffectsAudio } = await ready, resuming = deferred(), h = harness({ pendingResume: resuming });
  const audio = createAftereffectsAudio(h), unlocking = audio.unlock();
  audio.stop(); resuming.resolve();
  assert.equal(await unlocking, false); assert.equal(h.sources.length, 0);
  assert.equal(await audio.unlock(), true);
  assert.equal(h.counts().makes, 1); assert.equal(h.requests.length, 1);
  assert.equal(audio.play('whisper'), true);
  audio.dispose();
});

test('disposing during fetch or decode drops late results, aborts the request and closes once', async () => {
  const { createAftereffectsAudio } = await ready;
  for (const stage of ['fetch', 'decode']) {
    const pending = deferred(), h = harness(stage === 'fetch' ? { pendingFetch: pending } : { pendingDecode: pending });
    const audio = createAftereffectsAudio(h), unlocking = audio.unlock();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    audio.dispose(); audio.dispose();
    assert.equal(h.requests[0].options.signal.aborted, true);
    pending.resolve(stage === 'fetch' ? h.response : h.supplied);
    assert.equal(await unlocking, false);
    assert.equal(audio.ready, false); assert.equal(audio.hasScream, false);
    assert.equal(audio.play('scream'), false); assert.equal(await audio.unlock(), false);
    assert.equal(h.sources.length, 0); assert.equal(h.counts().closes, 1);
    assert.equal(h.events.size, 0);
  }
});

test('each new event replaces the previous sound and stop cancels both procedural and original voices', async () => {
  const { createAftereffectsAudio } = await ready, h = harness(), audio = createAftereffectsAudio(h);
  await audio.unlock();
  for (const kind of ['whisper', 'step', 'scream', 'sighting', 'scream']) {
    assert.equal(audio.play(kind, { side: -1 }), true);
    assert.equal(h.sources.filter(source => !source.disconnected).length, 1);
    assert.equal(h.nodes.find(node => node.kind === 'stereo').pan.value, -.65);
  }
  assert.equal(h.sources.length, 5);
  assert.ok(h.sources.slice(0, -1).every(source => source.stops === 1 && source.buffer === null));
  audio.stop(); audio.stop();
  assert.ok(h.sources.every(source => source.stops === 1 && source.disconnected && source.buffer === null));
  const output = h.nodes.find(node => node.kind === 'gain' && node.targets.includes(h.context.destination));
  assert.equal(output.gain.value, 0);
  assert.equal(h.sources.length, 5, 'the shared procedural module has no heartbeat updater here');
  audio.dispose(); audio.dispose();
  assert.ok(h.nodes.every(node => node.disconnected));
});

test('the original scream keeps its samples, a 1.3-second cap, short fades and attenuation throughout the output path', async () => {
  const { createAftereffectsAudio } = await ready, h = harness(), audio = createAftereffectsAudio(h);
  await audio.unlock();
  assert.equal(audio.play('scream', { duration: 40, side: Infinity }), true);
  const source = h.sources[0], level = source.targets[0];
  assert.equal(source.buffer, h.supplied); assert.equal(source.playbackRate.value, 1);
  assert.deepEqual(source.starts[0], [0, 0, 1.3]);
  assert.ok(level.gain.automation.some(([kind, gain, time]) => kind === 'ramp' && gain === .45 && time === .025));
  assert.ok(level.gain.automation.some(([kind, gain, time]) => kind === 'ramp' && gain === 0 && time === 1.3));
  assert.ok(level.gain.automation.every(([kind, gain]) => kind === 'cancel' || gain <= .45));
  const limiter = h.nodes.find(node => node.kind === 'limiter');
  assert.ok(limiter.curve.every((value, i) => Number.isFinite(value) && Math.abs(value) <= Math.abs(i / 1024 - 1) + 1e-6));
  const output = h.nodes.find(node => node.kind === 'gain' && node.targets.includes(h.context.destination));
  assert.equal(output.gain.value, .7);
  assert.ok(Math.max(...limiter.curve.map(Math.abs)) * output.gain.value < .42);
  const ended = source.onended;
  ended(); ended();
  assert.equal(source.buffer, null); assert.equal(source.stops, 0);
  assert.equal(output.gain.value, 0);
  assert.equal(audio.play('scream', { duration: .5 }), true);
  assert.equal(h.sources[1].starts[0][2], .5);
  audio.dispose();
});

test('missing clip permits quiet procedural cues, HRTF fallback and finite bounded panning', async () => {
  const { createAftereffectsAudio } = await ready, h = harness({ rejectFetch: true, stereo: false });
  const audio = createAftereffectsAudio(h);
  assert.equal(await audio.unlock(), true); assert.equal(audio.hasScream, false);
  assert.equal(audio.play('scream'), false); assert.equal(audio.play('unknown'), false);
  assert.equal(audio.play('step', { duration: NaN }), false);
  assert.equal(audio.play('whisper', { side: -10 }), true);
  const panner = h.nodes.find(node => node.kind === 'spatial');
  assert.equal(panner.panningModel, 'HRTF'); assert.equal(panner.positionX.value, -1.3);
  assert.ok(h.buffers.every(buffer => buffer.getChannelData(0).every(Number.isFinite)));
  audio.dispose();
});

test('unsupported audio constructors fail quietly without fetching or allocating nodes', async () => {
  const { createAftereffectsAudio } = await ready;
  let fetches = 0;
  const audio = createAftereffectsAudio({ makeContext() { throw new Error('unavailable'); }, fetchAudio() { fetches++; } });
  assert.equal(await audio.unlock(), false); assert.equal(audio.ready, false);
  assert.equal(audio.play('whisper'), false); assert.equal(fetches, 0);
  audio.dispose();
});
