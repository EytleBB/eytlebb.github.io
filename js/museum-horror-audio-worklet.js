// One small chip synthesizer shared by the hall. The source supplies notes and
// dynamics; no dry orchestral recording is mixed into the horror soundtrack.
class MuseumHorrorCrusher extends AudioWorkletProcessor {
  constructor() {
    super();
    this.stopped = false;
    this.port.onmessage = event => { if (event.data === 'stop') this.stopped = true; };
    this.stride = Math.max(1, Math.round(sampleRate / 8000));
    this.analysisRate = sampleRate / this.stride;
    this.size = 1024;
    this.ring = new Float32Array(this.size);
    this.window = new Float32Array(this.size);
    this.block = new Float32Array(this.size);
    this.frequencies = new Float32Array(53);
    this.coefficients = new Float32Array(53);
    this.magnitudes = new Float32Array(53);
    this.windowSum = 0;
    for (let i = 0; i < this.size; i++) {
      this.window[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (this.size - 1));
      this.windowSum += this.window[i];
    }
    for (let i = 0; i < this.frequencies.length; i++) {
      this.frequencies[i] = 440 * 2 ** ((i + 36 - 69) / 12);
      this.coefficients[i] = 2 * Math.cos(2 * Math.PI * this.frequencies[i] / this.analysisRate);
    }
    this.write = this.accumulated = this.decimation = this.analysisClock = this.filled = 0;
    this.analysisHop = Math.round(this.analysisRate / 20);
    this.notes = new Int16Array([-1, -1, -1]);
    this.phases = new Float64Array(3);
    this.increments = new Float64Array(3);
    this.levels = new Float64Array(3);
    this.targets = new Float64Array(3);
    this.rms = this.noiseEnvelope = this.noisePhase = this.noise = this.frame = 0;
    this.lfsr = 1;
    this.attack = 1 - Math.exp(-1 / (.004 * sampleRate));
    this.release = 1 - Math.exp(-1 / (.035 * sampleRate));
    this.noiseRelease = Math.exp(-1 / (.028 * sampleRate));
  }

  analyze() {
    let energy = 0;
    for (let i = 0; i < this.size; i++) {
      const value = this.ring[(this.write + i) % this.size];
      energy += value * value;
      this.block[i] = value * this.window[i];
    }
    const rms = Math.sqrt(energy / this.size);
    // The chip never invents music during pauses in the source recording.
    if (rms < .00015) {
      this.targets.fill(0); this.rms = rms; this.noiseEnvelope = 0;
      return;
    }
    for (let note = 0; note < this.coefficients.length; note++) {
      let q1 = 0, q2 = 0;
      const coefficient = this.coefficients[note];
      for (let i = 0; i < this.size; i++) {
        const next = this.block[i] + coefficient * q1 - q2;
        q2 = q1; q1 = next;
      }
      this.magnitudes[note] = 2 * Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - coefficient * q1 * q2)) / this.windowSum;
    }
    // A small fixed semitone bank keeps notes stepped, with no pitch sliding.
    // Separate bass and two upper voices retain some of the original harmony.
    this.selectNote(0, 19, 52, -1, rms);
    this.selectNote(1, 19, 52, this.notes[0], rms);
    this.selectNote(2, 0, 19, -1, rms);
    const level = Math.min(.26, Math.sqrt(rms) * .72);
    for (let voice = 0; voice < 3; voice++) {
      const note = this.notes[voice];
      const relative = note < 0 ? 0 : Math.min(1, this.magnitudes[note] / (rms * .65));
      // Four-bit volume envelopes are separate from the oscillator waveforms.
      this.targets[voice] = Math.round(relative * 15) / 15 * level * [1, .55, .85][voice];
    }
    this.noiseEnvelope = Math.max(this.noiseEnvelope, Math.min(.026, Math.max(0, rms - this.rms * 1.2) * 2));
    this.rms = rms;
  }

  selectNote(voice, first, last, excluded, rms) {
    let best = -1, strength = rms * .16;
    for (let note = first; note <= last; note++) {
      const magnitude = this.magnitudes[note];
      if (excluded >= 0 && (Math.abs(note - excluded) < 3 || Math.abs(note - excluded) === 12)) continue;
      // Reject neighboring skirts of a louder spectral peak.
      if (note > 0 && magnitude < this.magnitudes[note - 1]) continue;
      if (note < 52 && magnitude < this.magnitudes[note + 1]) continue;
      const score = magnitude * (note === this.notes[voice] ? 1.13 : 1);
      if (score > strength) { strength = score; best = note; }
    }
    this.notes[voice] = best;
  }

  process(inputs, outputs) {
    if (this.stopped) return false;
    const input = inputs[0], output = outputs[0];
    if (!output?.length) return true;
    const length = output[0].length;
    for (let i = 0; i < length; i++) {
      // Choose the stronger stereo sample, retaining even out-of-phase music.
      const left = input?.[0]?.[i] ?? 0, right = input?.[1]?.[i] ?? left;
      const value = Math.abs(left) >= Math.abs(right) ? left : right;
      this.accumulated += Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
      if (++this.decimation >= this.stride) {
        this.ring[this.write] = this.accumulated / this.stride;
        this.write = (this.write + 1) % this.size;
        this.accumulated = this.decimation = 0;
        if (this.filled < this.size) this.filled++;
        if (++this.analysisClock >= this.analysisHop) {
          this.analysisClock = 0;
          if (this.filled === this.size) this.analyze();
        }
      }
      let lead = 0, harmony = 0, bass = 0;
      for (let voice = 0; voice < 3; voice++) {
        const target = this.targets[voice];
        this.levels[voice] += (target - this.levels[voice]) * (target > this.levels[voice] ? this.attack : this.release);
        if (target === 0 && this.levels[voice] < .00001) this.levels[voice] = 0;
        const note = this.notes[voice];
        if (note >= 0) this.increments[voice] = this.frequencies[note] / sampleRate;
        this.phases[voice] = (this.phases[voice] + this.increments[voice]) % 1;
        const phase = this.phases[voice];
        if (voice === 0) lead = (phase < .25 ? 1 : -1 / 3) * this.levels[voice];
        else if (voice === 1) harmony = (phase < .125 ? 1 : -1 / 7) * this.levels[voice];
        else bass = (Math.round((1 - 4 * Math.abs(phase - .5)) * 15) / 15) * this.levels[voice];
      }
      // Short LFSR noise ticks follow source attacks, like a chip percussion lane.
      this.noisePhase += 3200 / sampleRate;
      if (this.noisePhase >= 1) {
        this.noisePhase %= 1;
        this.lfsr = (this.lfsr >> 1) | (((this.lfsr ^ (this.lfsr >> 1)) & 1) << 14);
        this.noise = (this.lfsr & 1) ? 1 : -1;
      }
      this.noiseEnvelope *= this.noiseRelease;
      if (this.noiseEnvelope < .000001) this.noiseEnvelope = 0;
      const percussion = this.noise * this.noiseEnvelope;
      // Narrow stereo separation; both channels carry the full melody and bass.
      output[0][i] = lead + harmony * .7 + bass + percussion;
      if (output[1]) output[1][i] = lead * .88 + harmony + bass + percussion;
      for (let channel = 2; channel < output.length; channel++) output[channel][i] = output[0][i];
    }
    this.frame += length;
    return true;
  }
}
registerProcessor('museum-horror-crusher', MuseumHorrorCrusher);
