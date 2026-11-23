/* 낮은 실내 공기음만 로컬 합성한다. 놀라게 하는 음량 변화는 없다. */
export class Ambient {
  constructor() {
    this.context = null;
    this.enabled = false;
  }
  async set(on) {
    this.enabled = on;
    if (!on) {
      if (this.context) await this.context.suspend();
      return;
    }
    if (!this.context) {
      const C = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!C) return;
      const c = (this.context = new C()),
        master = c.createGain();
      master.gain.value = 0.035;
      master.connect(c.destination);
      const tone = c.createOscillator(),
        gain = c.createGain();
      tone.frequency.value = 47;
      gain.gain.value = 0.1;
      tone.connect(gain).connect(master);
      tone.start();
      const length = c.sampleRate * 12,
        buffer = c.createBuffer(1, length, c.sampleRate),
        data = buffer.getChannelData(0);
      let s = 17823;
      for (let i = 0; i < length; i++) {
        s = (s * 16807) % 2147483647;
        data[i] = ((s / 2147483647) * 2 - 1) * 0.25;
      }
      const noise = c.createBufferSource(),
        filter = c.createBiquadFilter();
      noise.buffer = buffer;
      noise.loop = true;
      filter.type = "lowpass";
      filter.frequency.value = 170;
      noise.connect(filter).connect(master);
      noise.start();
    }
    await this.context.resume();
  }
  close() {
    this.context?.close();
    this.context = null;
  }
}
