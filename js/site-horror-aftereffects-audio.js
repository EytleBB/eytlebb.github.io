import { createMuseumHorrorPresenceAudio } from './museum-horror-presence-audio.js?v=horror-intensity-20261003';

// The caller invokes unlock only from an eligible, trusted visitor gesture.
// Neither construction nor a scheduled visual event creates an audio context.
export function createAftereffectsAudio({ makeContext = () => new AudioContext(),
  fetchAudio = (...args) => fetch(...args),
  url = new URL('../audio/ccream.mp3', import.meta.url),
} = {}) {
  let context = null, disposed = false, generation = 0, unlockPending = null;
  let loadPending = null, abort = null, scream = null, screamVoice = null;
  let bus = null, panner = null, compressor = null, limiter = null, gate = null, presence = null;

  const ready = () => !disposed && context?.state === 'running';
  function value(parameter, next) {
    parameter.cancelScheduledValues?.(context.currentTime);
    if (parameter.setValueAtTime) parameter.setValueAtTime(next, context.currentTime);
    else parameter.value = next;
  }

  function releaseScream(stop = false) {
    if (!screamVoice) return;
    const voice = screamVoice;
    screamVoice = null;
    voice.source.onended = null;
    if (stop) {
      try { voice.source.stop(); } catch { /* A naturally ended clip is silent. */ }
    }
    voice.source.disconnect(); voice.level.disconnect();
    voice.source.buffer = null;
  }

  function silence() {
    if (gate) value(gate.gain, 0);
    presence?.setEnabled(false);
    releaseScream(true);
  }

  function onStateChange() {
    if (context.state !== 'running') silence();
  }

  function preload() {
    if (loadPending) return loadPending;
    abort = new AbortController();
    loadPending = Promise.resolve().then(() => {
      if (disposed) return null;
      return fetchAudio(url, { signal: abort.signal, cache: 'force-cache' });
    }).then(response => {
      if (disposed || !response || response.ok === false) return null;
      return response.arrayBuffer();
    }).then(bytes => {
      if (disposed || !bytes) return null;
      return context.decodeAudioData(bytes);
    }).then(buffer => {
      if (!disposed && buffer && Number.isFinite(buffer.duration) && buffer.duration > 0) scream = buffer;
      return scream;
    }).catch(() => null);
    return loadPending;
  }

  function build() {
    if (bus) return;
    bus = context.createGain(); bus.gain.value = 1;
    panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12; compressor.knee.value = 0;
    compressor.ratio.value = 12; compressor.attack.value = .004; compressor.release.value = .07;
    limiter = context.createWaveShaper();
    // This curve only attenuates. The original scream is never normalized up.
    limiter.curve = Float32Array.from({ length: 2049 }, (_, i) => .6 * Math.tanh((i / 1024 - 1) / .6));
    limiter.oversample = 'none';
    gate = context.createGain(); gate.gain.value = 0;
    if (panner) { bus.connect(panner); panner.connect(compressor); }
    else bus.connect(compressor);
    compressor.connect(limiter); limiter.connect(gate); gate.connect(context.destination);
    presence = createMuseumHorrorPresenceAudio({ context, output: bus });
  }

  return {
    get ready() { return ready(); },
    get hasScream() { return !disposed && Boolean(scream); },
    unlock() {
      if (disposed) return Promise.resolve(false);
      if (unlockPending) return unlockPending;
      if (!context) {
        try {
          context = makeContext();
          context.addEventListener?.('statechange', onStateChange);
        } catch { return Promise.resolve(false); }
      }
      const token = generation;
      let resume;
      // Calling resume in this stack preserves the visitor's gesture grant.
      try { resume = context.state === 'running' ? Promise.resolve() : context.resume(); }
      catch { return Promise.resolve(false); }
      const pending = Promise.all([Promise.resolve(resume).catch(() => null), preload()])
        .then(() => token === generation && ready())
        .finally(() => { if (unlockPending === pending) unlockPending = null; });
      unlockPending = pending;
      return pending;
    },
    play(kind, { side = 1, duration } = {}) {
      if (!ready() || !['whisper', 'step', 'sighting', 'scream'].includes(kind)) return false;
      if (kind === 'scream' && !scream) return false;
      if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) return false;
      build(); silence();
      const pan = Number.isFinite(side) ? Math.max(-1, Math.min(1, side)) * .65 : .65;
      if (panner) value(panner.pan, pan);
      value(gate.gain, .7);
      if (kind !== 'scream') {
        presence.setEnabled(true);
        presence.cue(kind, panner ? undefined : { x: pan * 2, y: 0, z: .8 });
        return true;
      }
      const seconds = Math.min(1.3, duration ?? 1.3, scream.duration);
      const source = context.createBufferSource(), level = context.createGain();
      source.buffer = scream;
      const now = context.currentTime, attack = Math.min(.025, seconds / 4), release = Math.min(.11, seconds / 3);
      level.gain.value = 0;
      level.gain.setValueAtTime(0, now);
      level.gain.linearRampToValueAtTime(.45, now + attack);
      level.gain.setValueAtTime(.45, now + seconds - release);
      level.gain.linearRampToValueAtTime(0, now + seconds);
      source.connect(level); level.connect(bus);
      const voice = { source, level };
      screamVoice = voice;
      source.onended = () => {
        if (screamVoice !== voice) return;
        releaseScream(); value(gate.gain, 0);
      };
      source.start(now, 0, seconds);
      return true;
    },
    stop() {
      generation++;
      unlockPending = null;
      silence();
    },
    dispose() {
      if (disposed) return;
      disposed = true; generation++;
      silence();
      abort?.abort();
      presence?.dispose(); presence = null;
      for (const node of [bus, panner, compressor, limiter, gate]) node?.disconnect();
      bus = panner = compressor = limiter = gate = null;
      scream = null;
      context?.removeEventListener?.('statechange', onStateChange);
      try { Promise.resolve(context?.close()).catch(() => {}); } catch { /* Closing is best effort. */ }
    },
  };
}
