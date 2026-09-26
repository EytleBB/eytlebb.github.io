// Created only after the hidden mode starts; the original music graph stays dry.
export const MUSEUM_HORROR_PLAYBACK_RATE = .78;
const PROCESSOR_NAME = 'museum-horror-crusher';
const PROCESSOR_URL = new URL('./museum-horror-audio-worklet.js?v=chiptune-20260926', import.meta.url);

export function createMuseumHorrorAudio({ context }) {
  const nodes = new Set(), oscillators = new Set();
  let disposed = false, source = null, inlet = null, output = null, pending = null;
  const own = node => { nodes.add(node); return node; };
  const gain = value => {
    const node = own(context.createGain());
    node.gain.value = value;
    return node;
  };

  function makeFallback() {
    // Three independently squared bands retain chip-like voices without a
    // worklet. Zero stays zero, so this path never drones through music pauses.
    const splitter = gain(1), voices = gain(.68);
    const curve = Float32Array.from({ length: 32769 }, (_, i) => {
      const value = i / 16384 - 1;
      return Math.sign(value) * Math.round(Math.min(1, Math.abs(value) * 28) * 15) / 15 * .12;
    });
    for (const [type, frequency, level] of [['lowpass', 230, 1], ['bandpass', 740, .85], ['highpass', 1700, .25]]) {
      const band = own(context.createBiquadFilter()), square = own(context.createWaveShaper()), balance = gain(level);
      band.type = type; band.frequency.value = frequency; band.Q.value = .7;
      square.curve = curve; square.oversample = 'none';
      splitter.connect(band); band.connect(square); square.connect(balance); balance.connect(voices);
    }
    const pulse = gain(.85), modulation = gain(.12);
    const oscillator = own(context.createOscillator());
    oscillator.type = 'square'; oscillator.frequency.value = 4.1;
    oscillator.connect(modulation); modulation.connect(pulse.gain);
    voices.connect(pulse);
    oscillators.add(oscillator); oscillator.start();
    return { input: splitter, output: pulse };
  }

  async function build() {
    let processor = null;
    if (context.audioWorklet && typeof globalThis.AudioWorkletNode === 'function') {
      try {
        await context.audioWorklet.addModule(PROCESSOR_URL);
        if (disposed) return null;
        processor = own(new AudioWorkletNode(context, PROCESSOR_NAME, {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
          channelCount: 2, channelCountMode: 'explicit',
        }));
      } catch {
        // A multiband pulse fallback keeps the mode audible on older browsers.
      }
    }
    if (disposed) return null;

    inlet = own(context.createBiquadFilter());
    inlet.type = 'highpass'; inlet.frequency.value = 38; inlet.Q.value = .5;
    const tone = own(context.createBiquadFilter());
    tone.type = 'lowpass'; tone.frequency.value = 6800; tone.Q.value = .55;
    let effect = processor ? { input: processor, output: processor } : makeFallback();
    inlet.connect(effect.input); effect.output.connect(tone);

    if (processor) processor.onprocessorerror = () => {
      if (disposed) return;
      inlet.disconnect(processor); processor.disconnect();
      processor.port.postMessage('stop'); processor.port.close();
      processor.onprocessorerror = null;
      nodes.delete(processor);
      effect = makeFallback();
      inlet.connect(effect.input); effect.output.connect(tone);
    };

    const mix = gain(1.8);
    tone.connect(mix);
    // Two quiet, finite taps: there is no feedback loop or accumulating tail.
    for (const [seconds, level] of [[.173, .18], [.317, .11]]) {
      const delay = own(context.createDelay(.5)), echo = gain(level);
      delay.delayTime.value = seconds;
      tone.connect(delay); delay.connect(echo); echo.connect(mix);
    }
    output = own(context.createWaveShaper());
    output.curve = Float32Array.from({ length: 2049 }, (_, i) => .92 * Math.tanh((i / 1024 - 1) / .92));
    output.oversample = 'none';
    mix.connect(output);
    source.connect(inlet);
    return output;
  }

  return {
    // Caller replaces its old speaker inputs only once this resolves successfully.
    enable(inputNode) {
      if (disposed) return Promise.resolve(null);
      if (source && source !== inputNode) return Promise.reject(new Error('Horror music already has a source'));
      if (!inputNode || typeof inputNode.connect !== 'function') return Promise.reject(new TypeError('A music source node is required'));
      source = inputNode;
      if (!pending) pending = build();
      return pending;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (source && inlet) source.disconnect(inlet);
      for (const oscillator of oscillators) oscillator.stop();
      for (const node of nodes) {
        if (node.port) { node.onprocessorerror = null; node.port.postMessage('stop'); node.port.close(); }
        node.disconnect();
      }
      nodes.clear(); oscillators.clear();
      output = inlet = source = null;
    },
  };
}
