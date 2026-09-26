// Created only after the hidden mode starts; the original music graph stays dry.
export const MUSEUM_HORROR_PLAYBACK_RATE = .78;
const PROCESSOR_NAME = 'museum-horror-crusher';
const PROCESSOR_URL = new URL('./museum-horror-audio-worklet.js?v=horror-20260926', import.meta.url);

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
    // Quantization still works on browsers which cannot load audio worklets.
    const crusher = own(context.createWaveShaper());
    crusher.curve = Float32Array.from({ length: 4097 }, (_, i) => Math.min(127, Math.round((i / 2048 - 1) * 128)) / 128);
    const pulse = gain(.8), modulation = gain(.17);
    const oscillator = own(context.createOscillator());
    oscillator.frequency.value = 4.1;
    oscillator.connect(modulation); modulation.connect(pulse.gain);
    crusher.connect(pulse);
    oscillators.add(oscillator); oscillator.start();
    return { input: crusher, output: pulse };
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
        // A filtered bitcrushed fallback keeps the mode audible on older browsers.
      }
    }
    if (disposed) return null;

    inlet = own(context.createBiquadFilter());
    inlet.type = 'highpass'; inlet.frequency.value = 38; inlet.Q.value = .5;
    const tone = own(context.createBiquadFilter());
    tone.type = 'lowpass'; tone.frequency.value = 3400; tone.Q.value = .65;
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

    const mix = gain(2.6);
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
