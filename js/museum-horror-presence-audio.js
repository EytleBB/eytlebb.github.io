// Procedural cues share the museum's existing listener and master volume.
// Nothing is allocated until a running, enabled visit first needs a sound.
const MAX_VOICES = 6;
const PEAK = .72;
const DURATIONS = { heartbeat: .52, step: .3, whisper: 1.05, sighting: .78 };

function makeSamples(kind, rate) {
  const samples = new Float32Array(Math.ceil(DURATIONS[kind] * rate));
  let seed = 0x51a7 + kind.length * 313, lowNoise = 0, peak = 0;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  for (let i = 0; i < samples.length; i++) {
    const time = i / rate, phase = i / (samples.length - 1);
    const white = noise();
    lowNoise += (white - lowNoise) * Math.min(1, 950 / rate);
    const window = Math.sin(Math.PI * phase) ** 2;
    let value;
    if (kind === 'heartbeat') {
      // One buffer contains both beats, so a delayed frame cannot stack pulses.
      const first = Math.exp(-(((time - .08) / .038) ** 2));
      const second = .64 * Math.exp(-(((time - .25) / .044) ** 2));
      value = (first + second) * (Math.sin(2 * Math.PI * (63 * time - 20 * time * time)) + .14 * lowNoise);
    } else if (kind === 'step') {
      value = Math.exp(-time * 20) * (Math.sin(2 * Math.PI * 72 * time) * .68 + lowNoise * 2.2 + white * .13);
    } else if (kind === 'whisper') {
      const breath = .36 + .64 * Math.sin(2 * Math.PI * (2.6 * time + .7 * time * time)) ** 2;
      value = (white - lowNoise) * breath * (.3 + .7 * phase);
    } else {
      const inhale = phase ** 1.5;
      value = inhale * ((white - lowNoise) * .47 + Math.sin(2 * Math.PI * 89 * time) * .19 + Math.sin(2 * Math.PI * 94 * time) * .17);
    }
    samples[i] = value * window;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] *= PEAK / peak;
  samples[0] = samples[samples.length - 1] = 0;
  return samples;
}

export function createMuseumHorrorPresenceAudio({ context, output }) {
  if (!context || !output || typeof output.connect !== 'function') {
    throw new TypeError('The existing museum audio context and listener output are required');
  }
  const voices = new Set(), buffers = new Map();
  let enabled = false, disposed = false, bus = null, limiter = null, gate = null;
  let progress = 0, nextBeat = .65, lastUpdateTime = null, variation = 0;

  function setGain(parameter, value) {
    parameter.cancelScheduledValues?.(context.currentTime);
    if (parameter.setValueAtTime) parameter.setValueAtTime(value, context.currentTime);
    else parameter.value = value;
  }

  function release(voice, stop = false) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    if (stop) {
      try { voice.source.stop(); } catch { /* A finished source is already silent. */ }
    }
    for (const node of voice.nodes) node.disconnect();
    voice.source.buffer = null;
  }

  function stopVoices() {
    for (const voice of voices) release(voice, true);
    nextBeat = .65;
    lastUpdateTime = null;
  }

  function build() {
    if (bus) return;
    bus = context.createGain(); bus.gain.value = .6;
    limiter = context.createWaveShaper();
    limiter.curve = Float32Array.from({ length: 2049 }, (_, i) => .24 * Math.tanh((i / 1024 - 1) / .24));
    limiter.oversample = 'none';
    gate = context.createGain(); gate.gain.value = enabled ? .8 : 0;
    bus.connect(limiter); limiter.connect(gate); gate.connect(output);
  }

  function bufferFor(kind) {
    if (!buffers.has(kind)) {
      const rate = context.sampleRate;
      const samples = makeSamples(kind, rate);
      const buffer = context.createBuffer(1, samples.length, rate);
      buffer.getChannelData(0).set(samples);
      buffers.set(kind, buffer);
    }
    return buffers.get(kind);
  }

  function play(kind, position) {
    if (disposed || !enabled || context.state !== 'running') return;
    build();
    while (voices.size >= MAX_VOICES) release(voices.values().next().value, true);
    const source = context.createBufferSource(), level = context.createGain();
    source.buffer = bufferFor(kind);
    const speed = kind === 'heartbeat' ? 1 : .97 + ((variation++ % 5) / 4) * .06;
    source.playbackRate.value = speed;
    level.gain.value = kind === 'heartbeat' ? .065 + progress * .05
      : kind === 'step' ? .065 + progress * .025
        : kind === 'whisper' ? .085 + progress * .03 : .1 + progress * .04;
    const nodes = [source, level];
    source.connect(level);
    if (position && typeof context.createPanner === 'function') {
      const panner = context.createPanner();
      panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
      panner.refDistance = 2; panner.maxDistance = 24; panner.rolloffFactor = .65;
      const coordinate = axis => Number.isFinite(position[axis]) ? Math.max(-1e6, Math.min(1e6, position[axis])) : 0;
      if (panner.positionX) {
        panner.positionX.value = coordinate('x'); panner.positionY.value = coordinate('y'); panner.positionZ.value = coordinate('z');
      } else panner.setPosition(coordinate('x'), coordinate('y'), coordinate('z'));
      level.connect(panner); panner.connect(bus); nodes.push(panner);
    } else level.connect(bus);
    const voice = { source, nodes };
    voices.add(voice);
    source.onended = () => release(voice);
    source.start(context.currentTime);
  }

  return {
    setEnabled(value) {
      if (disposed || enabled === Boolean(value)) return;
      enabled = Boolean(value);
      if (gate) setGain(gate.gain, enabled ? .8 : 0);
      stopVoices();
    },
    update(dt, state = {}) {
      if (disposed || !enabled) return;
      if (context.state !== 'running' || !Number.isFinite(dt) || dt <= 0 || dt > .5) {
        stopVoices();
        return;
      }
      progress = Number.isFinite(state?.progress) ? Math.max(0, Math.min(1, state.progress)) : 0;
      const now = context.currentTime;
      if (lastUpdateTime !== null && now - lastUpdateTime > .75) {
        stopVoices();
        lastUpdateTime = now;
        return;
      }
      lastUpdateTime = now;
      nextBeat -= Math.min(dt, .1);
      if (nextBeat <= 0) {
        play('heartbeat');
        nextBeat = 1.75 - progress * .9;
      }
    },
    cue(kind, position) {
      if (kind === 'step' || kind === 'whisper' || kind === 'sighting') play(kind, position);
    },
    dispose() {
      if (disposed) return;
      disposed = true; enabled = false;
      if (gate) setGain(gate.gain, 0);
      stopVoices();
      for (const node of [bus, limiter, gate]) node?.disconnect();
      buffers.clear();
      bus = limiter = gate = null;
    },
  };
}
