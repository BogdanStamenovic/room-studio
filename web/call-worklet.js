// Audio thread. The wire is always 16 kHz; the device rate is whatever the phone picks,
// because iOS and Firefox do not reliably honour a requested AudioContext rate.
const WIRE = 16000;
const FRAME = 320;
const PREBUFFER = 1600;
const MAX_BACKLOG = 9600;

class CallIO extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / WIRE;
    this.sum = 0; this.count = 0; this.phase = 0;
    this.frame = new Int16Array(FRAME); this.fill = 0;
    this.q = new Float32Array(WIRE * 4); this.head = 0; this.size = 0;
    this.pos = 0; this.playing = false; this.muted = false;
    this.port.onmessage = (e) => {
      if (e.data === 'mute') this.muted = true;
      else if (e.data === 'unmute') this.muted = false;
      else this.enqueue(new Int16Array(e.data));
    };
  }

  enqueue(pcm) {
    const cap = this.q.length;
    for (let i = 0; i < pcm.length; i++) {
      this.q[(this.head + this.size) % cap] = pcm[i] / 32768;
      if (this.size < cap) this.size += 1; else this.head = (this.head + 1) % cap;
    }
    // Stay near real time: on a conversation, late speech is worse than a skipped moment.
    if (this.size > MAX_BACKLOG) {
      const drop = this.size - PREBUFFER;
      this.head = (this.head + drop) % cap;
      this.size -= drop;
    }
  }

  capture(input) {
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i]; this.count += 1; this.phase += 1;
      if (this.phase < this.ratio) continue;
      this.phase -= this.ratio;
      // Averaging is the low-pass: crude, and enough for speech recognition at 16 kHz.
      const v = this.muted ? 0 : Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0; this.count = 0;
      this.frame[this.fill++] = v * 32767;
      if (this.fill === FRAME) {
        const out = this.frame.slice();
        let energy = 0;
        for (let k = 0; k < FRAME; k++) energy += out[k] * out[k];
        this.port.postMessage({ pcm: out.buffer, rms: Math.sqrt(energy / FRAME) / 32768 }, [out.buffer]);
        this.fill = 0;
      }
    }
  }

  play(output) {
    const step = 1 / this.ratio;
    const cap = this.q.length;
    for (let i = 0; i < output.length; i++) {
      if (!this.playing) {
        if (this.size < PREBUFFER) { output[i] = 0; continue; }
        this.playing = true; this.pos = 0;
      }
      if (this.size < 2) { this.playing = false; output[i] = 0; continue; }
      const a = this.q[this.head]; const b = this.q[(this.head + 1) % cap];
      output[i] = a + (b - a) * this.pos;
      this.pos += step;
      while (this.pos >= 1 && this.size >= 2) { this.pos -= 1; this.head = (this.head + 1) % cap; this.size -= 1; }
    }
    return output;
  }

  process(inputs, outputs) {
    if (inputs[0]?.[0]) this.capture(inputs[0][0]);
    const out = outputs[0];
    if (out?.[0]) { this.play(out[0]); for (let c = 1; c < out.length; c++) out[c].set(out[0]); }
    return true;
  }
}
registerProcessor('call-io', CallIO);
