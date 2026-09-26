// One shared stereo processor for the whole hall, never one per loudspeaker.
class MuseumHorrorCrusher extends AudioWorkletProcessor {
  constructor() {
    super();
    this.held = [0, 0];
    this.capturePhase = 1;
    this.frame = 0;
    this.stopped = false;
    this.port.onmessage = event => { if (event.data === 'stop') this.stopped = true; };
  }

  process(inputs, outputs) {
    if (this.stopped) return false;
    const input = inputs[0], output = outputs[0];
    if (!output?.length) return true;
    const length = output[0].length;
    const seconds = this.frame / sampleRate;
    // Update the slow modulation once per audio block rather than per sample.
    const holdRate = (6200 + 390 * Math.sin(seconds * Math.PI * .34)) / sampleRate;
    const pulse = .79 + .13 * Math.sin(seconds * Math.PI * 8.2) + .06 * Math.sin(seconds * Math.PI * 1.46);
    for (let i = 0; i < length; i++) {
      this.capturePhase += holdRate;
      if (this.capturePhase >= 1) {
        this.capturePhase %= 1;
        for (let channel = 0; channel < output.length; channel++) {
          const value = (input?.[channel]?.[i] ?? input?.[0]?.[i] ?? 0) * 1.25;
          this.held[channel] = Number.isFinite(value) ? Math.min(127, Math.round(Math.max(-1, Math.min(1, value)) * 128)) / 128 : 0;
        }
      }
      for (let channel = 0; channel < output.length; channel++) output[channel][i] = this.held[channel] * pulse;
    }
    this.frame += length;
    return true;
  }
}
registerProcessor('museum-horror-crusher', MuseumHorrorCrusher);
