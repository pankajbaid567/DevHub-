// Collects microphone samples into ~40 ms frames and posts them to the main thread,
// which downsamples to 16 kHz and streams them to the voice interviewer.
class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(Math.round(sampleRate * 0.04));
    this.length = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      let offset = 0;
      while (offset < channel.length) {
        const n = Math.min(channel.length - offset, this.frame.length - this.length);
        this.frame.set(channel.subarray(offset, offset + n), this.length);
        this.length += n;
        offset += n;
        if (this.length === this.frame.length) {
          this.port.postMessage(this.frame.slice(0));
          this.length = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('mic-capture', MicCapture);
