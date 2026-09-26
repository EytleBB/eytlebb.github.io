import { createMuseumBreakSound } from './museum-break-sound.js?v=site-horror-20260926';

// Original procedural Foley: no downloads, extra audio contexts or autoplay.
const MAX_VOICES = 16;
const IMPACT_DISTANCE = 30;
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const IMPACTS = {
  artwork: { duration: .38, modes: [96, 183, 347, 610], decay: .065, ring: .34, noise: .9 },
  lamp: { duration: .58, modes: [238, 563, 1091, 1867], decay: .14, ring: .54, noise: .55 },
  plaque: { duration: .43, modes: [514, 947, 1719, 2861], decay: .1, ring: .52, noise: .45 },
  title: { duration: .34, modes: [793, 1429, 2531, 3947], decay: .075, ring: .46, noise: .38 },
};

// A small bank of seeded variants is generated once and shared by all sources.
export function createMuseumSoundSamples(kind, sampleRate, variation = 0) {
  const swing = kind === 'light' || kind === 'heavy';
  const material = IMPACTS[kind];
  if (!swing && !material) throw new Error(`Unknown museum sound: ${kind}`);
  const heavy = kind === 'heavy';
  const duration = swing ? (heavy ? .32 : .23) : material.duration;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 0x6d2b79f5 ^ ((variation + 1) * 7919), low = 0, high = 0;
  const pitch = 1 + (variation - 1) * .045;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = (seed >>> 0) / 2147483648 - 1;
    const t = i / sampleRate, u = t / duration;
    let value;
    if (swing) {
      // Broad filtered air, accelerating to the blade contact and fading away.
      const crest = Math.exp(-Math.pow((u - .42) / .25, 2));
      const upper = (heavy ? 1700 : 2600) + crest * (heavy ? 2400 : 3400);
      const lower = (heavy ? 160 : 330) + crest * 500;
      low += (1 - Math.exp(-TAU * upper / sampleRate)) * (noise - low);
      high += (1 - Math.exp(-TAU * lower / sampleRate)) * (low - high);
      const envelope = Math.pow(Math.sin(Math.PI * u), 1.8) * (.25 + .75 * crest);
      value = (low - high) * envelope;
    } else {
      low += (1 - Math.exp(-TAU * 2400 / sampleRate)) * (noise - low);
      high += (1 - Math.exp(-TAU * 170 / sampleRate)) * (low - high);
      let ring = 0;
      for (let m = 0; m < material.modes.length; m++) {
        const decay = material.decay / (1 + m * .24);
        ring += Math.sin(TAU * material.modes[m] * pitch * t) * Math.exp(-t / decay) / (m + 1);
      }
      const thud = Math.sin(TAU * (kind === 'artwork' ? 72 : 118) * t) * Math.exp(-t / .022);
      const transient = (low - high) * Math.exp(-t / .014) * material.noise;
      value = transient + ring * material.ring + thud * .38;
      value *= Math.min(1, t / .0015) * Math.min(1, (duration - t) / .025);
    }
    samples[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  // Keep headroom and eliminate endpoint discontinuities.
  const scale = .78 / Math.max(.01, peak);
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  samples[0] = samples[samples.length - 1] = 0;
  return samples;
}

export function createMuseumSounds({ context, output, listenerPosition }) {
  const buffers = new Map(), voices = new Set();
  const breakSound = createMuseumBreakSound({ context, output });
  let enabled = false, disposed = false, bus = null, limiter = null, sequence = 0;

  function ensureBus() {
    if (bus) return;
    bus = context.createDynamicsCompressor();
    bus.threshold.value = -12;
    bus.knee.value = 10;
    bus.ratio.value = 6;
    bus.attack.value = .003;
    bus.release.value = .12;
    // Catch the very first transient when a whole pile lands in one frame,
    // before the compressor has had time to react. Normal signals stay soft.
    limiter = context.createWaveShaper();
    limiter.curve = Float32Array.from({ length: 1025 }, (_, i) => .68 * Math.tanh((i / 512 - 1) / .68));
    bus.connect(limiter);
    limiter.connect(output); // Same listener/master mute as the museum music.
  }

  function bufferFor(kind) {
    const variation = sequence++ % 3;
    const key = `${kind}:${variation}`;
    if (!buffers.has(key)) {
      const data = createMuseumSoundSamples(kind, context.sampleRate, variation);
      const buffer = context.createBuffer(1, data.length, context.sampleRate);
      buffer.copyToChannel(data, 0);
      buffers.set(key, buffer);
    }
    return buffers.get(key);
  }

  function release(voice) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect(); voice.gain.disconnect(); voice.panner.disconnect();
  }

  function stopAll() {
    for (const voice of [...voices]) {
      voice.source.stop();
      release(voice);
    }
  }

  function play(kind, volume, position) {
    // No queued sounds after a suspended tab or paused visit resumes.
    if (disposed || !enabled || context.state !== 'running') return false;
    for (const voice of [...voices]) if (voice.endsAt <= context.currentTime) release(voice);
    // Reserve two slots for the knife even when a pile of objects lands together.
    if (voices.size >= (position ? MAX_VOICES - 2 : MAX_VOICES)) return false;
    ensureBus();
    const source = context.createBufferSource();
    source.buffer = bufferFor(kind);
    source.playbackRate.value = .98 + (sequence % 5) * .01;
    const gain = context.createGain();
    gain.gain.value = volume;
    let panner;
    if (position) {
      panner = context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2;
      panner.maxDistance = IMPACT_DISTANCE;
      panner.rolloffFactor = 1.2;
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
    } else {
      panner = context.createStereoPanner();
      const now = context.currentTime;
      panner.pan.setValueAtTime(.25, now);
      panner.pan.linearRampToValueAtTime(kind === 'heavy' ? .05 : -.2, now + .18);
    }
    source.connect(gain); gain.connect(panner); panner.connect(bus);
    const voice = { source, gain, panner, endsAt: context.currentTime + source.buffer.duration / source.playbackRate.value };
    voices.add(voice);
    source.onended = () => release(voice);
    source.start();
    return true;
  }

  return {
    prepareHorror: () => breakSound.preload(),
    breakObject: () => breakSound.breakObject(),
    finale: () => breakSound.finale(),
    setEnabled(value) {
      enabled = Boolean(value) && !disposed;
      breakSound.setEnabled(enabled);
      if (!enabled) stopAll();
    },
    swing(kind) {
      if (kind !== 'light' && kind !== 'heavy') return false;
      return play(kind, kind === 'heavy' ? .72 : .56);
    },
    floorImpact({ kind, mass, speed, position }) {
      if (!IMPACTS[kind] || !Number.isFinite(mass + speed) || speed < .7 || mass <= 0) return false;
      if (!position || !Number.isFinite(position.x + position.y + position.z)) return false;
      const distance = Math.hypot(position.x - listenerPosition.x, position.y - listenerPosition.y, position.z - listenerPosition.z);
      if (distance > IMPACT_DISTANCE) return false;
      const strength = clamp((speed - .5) / 5, 0, 1);
      const weight = clamp(Math.sqrt(mass), .4, 1.6);
      return play(kind, clamp((.12 + .55 * strength) * weight, .05, .8), position);
    },
    dispose() {
      disposed = true; enabled = false;
      breakSound.dispose();
      stopAll(); buffers.clear(); bus?.disconnect(); limiter?.disconnect(); bus = null; limiter = null;
    },
  };
}
