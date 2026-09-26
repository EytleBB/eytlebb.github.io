const BREAK_SOUND_URL = new URL('../audio/ccream.mp3', import.meta.url);
const SILENT_BREAKS = 12;

// Visit-local count: debris eviction, re-hits and chunk recycling do not affect it.
export function createMuseumBreakSound({ context, output, fetchAudio = () => fetch(BREAK_SOUND_URL) }) {
  let broken = 0, enabled = false, disposed = false, epoch = 0;
  let buffer = null, loading = null, gain = null;
  const sources = new Set();

  function preload() {
    if (buffer) return Promise.resolve(buffer);
    if (disposed) return Promise.resolve(null);
    if (!loading) loading = (async () => {
      try {
        const response = await fetchAudio();
        if (!response.ok) throw new Error(`Museum break sound: ${response.status}`);
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        if (!disposed) buffer = decoded;
        return disposed ? null : decoded;
      } catch (error) {
        if (!disposed) console.warn('Museum break sound unavailable', error);
        return null;
      } finally { loading = null; }
    })();
    return loading;
  }

  function release(source) {
    if (!sources.delete(source)) return;
    source.onended = null;
    source.disconnect();
  }

  function stop() {
    epoch++;
    for (const source of [...sources]) { source.stop(); release(source); }
  }

  return {
    async breakObject() {
      if (disposed) return false;
      const play = ++broken > SILENT_BREAKS && enabled && context.state === 'running';
      const requestEpoch = epoch;
      // Start loading on the first break, well before the thirteenth strike.
      const decoded = await preload();
      if (!play || !decoded || !enabled || disposed || epoch !== requestEpoch || context.state !== 'running') return false;
      if (!gain) {
        gain = context.createGain();
        gain.gain.value = 1; // Full clip volume, unaffected by Foley attenuation.
        gain.connect(output); // Still obey the visit's shared pause/master mute.
      }
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.loop = false;
      source.playbackRate.value = 1;
      source.connect(gain);
      sources.add(source);
      source.onended = () => release(source);
      source.start(); // A separate one-shot for each newly broken prop.
      return true;
    },
    setEnabled(value) {
      enabled = Boolean(value) && !disposed;
      if (!enabled) stop();
    },
    dispose() {
      disposed = true; enabled = false; stop();
      buffer = null; gain?.disconnect(); gain = null;
    },
  };
}
